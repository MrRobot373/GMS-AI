/**
 * GEM AI Knowledge (docs/15-gem-ai.md): ask a project's documents, see its sources and how
 * ingestion went, open citations, and curate the workspace's general engineering references.
 */
import { and, asc, desc, document, eq, inArray, isNull, knowledgeQuery, organization, projectSource, sql, usageEvent } from "@aatmiq/db";
import { streamChat } from "@aatmiq/model-gateway";
import { isOrgAdmin, knowledgeAskSchema, PRODUCT_NAME } from "@aatmiq/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit, parse, requireUser, type AppContext, type SessionUser } from "../context";
import { badRequest, forbidden, HttpError, notFound } from "../errors";
import { localeOf, msg, tr } from "../i18n";
import { requireModule } from "../services/gem";
import { citationReadable, finishAnswer, knowledgePrompt, NOT_FOUND_REPLY, retrieveKnowledge } from "../services/knowledge";
import { getProjectAccess, isWorkspaceAdmin, requireProjectEdit } from "../services/projects";
import { quotaFor } from "../services/quota";
import { chooseModel } from "../services/router";

async function projectFor(ctx: AppContext, u: SessionUser, projectId: string) {
  const access = await getProjectAccess(ctx, u, projectId);
  await requireModule(ctx, u, access.project.workspaceId, "knowledge");
  return access;
}

/** The person's own question; the project must still be open to them. */
async function ownQuery(ctx: AppContext, u: SessionUser, id: string) {
  const [q] = await ctx.db.select().from(knowledgeQuery).where(eq(knowledgeQuery.id, id));
  if (!q || q.userId !== u.id) throw notFound("Question not found");
  await projectFor(ctx, u, q.projectId);
  return q;
}

export async function knowledgeRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, box } = ctx;

  /**
   * Ask a project's documents. Server-sent events:
   *   start {queryId, citations}   the passages found (numbered as the answer cites them)
   *   delta {text}
   *   done  {status, answer, citations}   the stored answer (unknown citation numbers removed)
   *   error {message}
   */
  app.post("/api/knowledge/ask", async (req, reply) => {
    const u = await requireUser(ctx, req);
    const body = parse(knowledgeAskSchema, req.body);
    const { project: p } = await projectFor(ctx, u, body.projectId);
    const includeGeneral = body.includeGeneral ?? false;

    const retrieval = await retrieveKnowledge(db, box, { workspaceId: p.workspaceId, userId: u.id, projectId: p.id, includeGeneral, query: body.question });
    if (retrieval.embedTokens > 0) {
      await db.insert(usageEvent).values({ workspaceId: p.workspaceId, userId: u.id, modelId: retrieval.embeddingModelId, section: "knowledge", inputTokens: retrieval.embedTokens, outputTokens: 0 });
    }

    // Nothing relevant: say so, without asking a model to make something up.
    let chosen: Awaited<ReturnType<typeof chooseModel>> | null = null;
    let groupId: string | null = null;
    if (retrieval.passages.length) {
      chosen = await chooseModel(db, box, { workspaceId: p.workspaceId, section: "chat", userId: u.id, requested: null, text: body.question, contextTokens: 3000, hasSources: true });
      const q = await quotaFor(db, p.workspaceId, u.id, chosen.model);
      groupId = q.groupId;
      if (!q.status.result.allowed) throw new HttpError(402, "You've used your token allowance for this period.", "quota_exceeded", q.status);
    }
    const [row] = await db
      .insert(knowledgeQuery)
      .values({ workspaceId: p.workspaceId, projectId: p.id, userId: u.id, question: body.question, includeGeneral, modelId: chosen?.model.id ?? null, status: "answered" })
      .returning({ id: knowledgeQuery.id });
    const queryId = row!.id;
    await audit(ctx, { actor: u, action: "knowledge.asked", workspaceId: p.workspaceId, targetType: "project", targetId: p.id, meta: { queryId, passages: retrieval.passages.length } });

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    const preview = finishAnswer("", retrieval.passages).citations;
    send("start", { queryId, citations: preview });

    if (!chosen) {
      const answer = tr(localeOf(req), msg("The documents in this project don't contain an answer to this."));
      await db.update(knowledgeQuery).set({ status: "not_found", answer, citations: [] }).where(eq(knowledgeQuery.id, queryId));
      send("delta", { text: answer });
      send("done", { status: "not_found", answer, citations: [] });
      return res.end();
    }

    const [org] = await db.select({ productName: organization.productName }).from(organization).limit(1);
    const system = knowledgePrompt(p.name, retrieval.passages, org?.productName ?? PRODUCT_NAME);
    let text = "";
    let error: string | null = null;
    let usage = { inputTokens: 0, outputTokens: 0, estimated: true };
    const started = Date.now();
    try {
      for await (const ev of streamChat(chosen.provider, chosen.model.modelKey, [{ role: "system", content: system }, { role: "user", content: body.question }], { signal: abort.signal, thinking: chosen.thinking, temperature: 0.1 })) {
        if (ev.type === "delta") {
          text += ev.text;
          send("delta", { text: ev.text });
        } else if (ev.type === "done") usage = ev.usage;
      }
    } catch (e) {
      if (!abort.signal.aborted) error = e instanceof Error ? e.message : msg("The model failed to respond.");
    }
    await db.insert(usageEvent).values({
      workspaceId: p.workspaceId,
      userId: u.id,
      modelId: chosen.model.id,
      groupId,
      section: "knowledge",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimated: usage.estimated,
      latencyMs: Date.now() - started,
      status: error ? "error" : "ok",
    });
    const done = finishAnswer(text, retrieval.passages);
    const status = error ? "error" : done.notFound ? "not_found" : "answered";
    // Every passage the model saw is kept (to open later); the answer marks the ones it cited.
    await db
      .update(knowledgeQuery)
      .set({ status, error, answer: done.notFound ? NOT_FOUND_REPLY : done.answer, citations: done.citations, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens })
      .where(eq(knowledgeQuery.id, queryId));
    if (!res.writableEnded && !res.destroyed) {
      if (error) send("error", { message: tr(localeOf(req), error) });
      else send("done", { status, answer: done.notFound ? tr(localeOf(req), NOT_FOUND_REPLY) : done.answer, citations: done.citations });
      res.end();
    }
  });

  /** The person's own questions in a project. */
  app.get<{ Querystring: { projectId: string } }>("/api/knowledge/queries", async (req) => {
    const u = await requireUser(ctx, req);
    await projectFor(ctx, u, req.query.projectId);
    return db
      .select({ id: knowledgeQuery.id, question: knowledgeQuery.question, status: knowledgeQuery.status, createdAt: knowledgeQuery.createdAt })
      .from(knowledgeQuery)
      .where(and(eq(knowledgeQuery.projectId, req.query.projectId), eq(knowledgeQuery.userId, u.id)))
      .orderBy(desc(knowledgeQuery.createdAt))
      .limit(200);
  });

  app.get<{ Params: { id: string } }>("/api/knowledge/queries/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const q = await ownQuery(ctx, u, req.params.id);
    // A stored citation shows its passage only while the person can still open it (a source removed
    // from the project, or a document they lost access to, is blanked, not shown from history).
    const citations = await Promise.all(
      q.citations.map(async (c) =>
        (await citationReadable(db, { workspaceId: q.workspaceId, userId: u.id, projectId: q.projectId, includeGeneral: q.includeGeneral, chunkId: c.chunkId, documentId: c.documentId }))
          ? c
          : { n: c.n, chunkId: "", documentId: "", name: "", version: 0, page: null, excerpt: "", scope: c.scope, unavailable: true as const },
      ),
    );
    return { ...q, citations, answer: q.status === "not_found" ? tr(localeOf(req), q.answer) : q.answer };
  });

  app.delete<{ Params: { id: string } }>("/api/knowledge/queries/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const q = await ownQuery(ctx, u, req.params.id);
    await db.delete(knowledgeQuery).where(eq(knowledgeQuery.id, q.id));
    return { ok: true };
  });

  /** Open a citation: only a passage retrieved for this question, still readable by this person. */
  app.get<{ Params: { id: string; n: string } }>("/api/knowledge/queries/:id/citations/:n", async (req) => {
    const u = await requireUser(ctx, req);
    const q = await ownQuery(ctx, u, req.params.id);
    const c = q.citations.find((x) => x.n === Number(req.params.n));
    if (!c) throw notFound("Citation not found");
    const passage = await citationReadable(db, { workspaceId: q.workspaceId, userId: u.id, projectId: q.projectId, includeGeneral: q.includeGeneral, chunkId: c.chunkId, documentId: c.documentId });
    if (!passage) throw notFound("This source is no longer available to you.");
    return { ...c, content: passage.content, page: passage.page, name: passage.name, version: passage.version, superseded: passage.supersededById !== null };
  });

  /** A project's knowledge sources, with ingestion status, versions and duplicates. */
  app.get<{ Params: { id: string } }>("/api/knowledge/projects/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p, canEdit } = await projectFor(ctx, u, req.params.id);
    const sources = await db
      .select({
        id: document.id,
        name: document.name,
        status: document.status,
        error: document.error,
        sizeBytes: document.sizeBytes,
        pageCount: document.pageCount,
        chunkCount: document.chunkCount,
        version: document.version,
        contentHash: document.contentHash,
        label: document.label,
        supersededById: document.supersededById,
        embedded: sql<boolean>`${document.embeddingModelId} is not null`,
        addedAt: projectSource.createdAt,
      })
      .from(projectSource)
      .innerJoin(document, eq(document.id, projectSource.documentId))
      .where(eq(projectSource.projectId, p.id))
      .orderBy(asc(projectSource.createdAt));
    const seen = new Map<string, string>();
    const locale = localeOf(req);
    const list = sources.map((s) => {
      const dup = s.contentHash && !s.supersededById ? seen.get(s.contentHash) : undefined;
      if (s.contentHash && !s.supersededById && !dup) seen.set(s.contentHash, s.id);
      return { ...s, error: s.error && tr(locale, s.error), duplicateOf: dup ?? null };
    });
    const current = list.filter((s) => !s.supersededById);
    return {
      project: { id: p.id, name: p.name, color: p.color, workspaceId: p.workspaceId },
      canEdit,
      sources: list,
      stats: {
        documents: current.length,
        ready: current.filter((s) => s.status === "ready").length,
        processing: current.filter((s) => s.status === "processing").length,
        failed: current.filter((s) => s.status === "failed").length,
        pages: current.reduce((n, s) => n + (s.status === "ready" ? (s.pageCount ?? 0) : 0), 0),
        chunks: current.reduce((n, s) => n + (s.status === "ready" ? (s.chunkCount ?? 0) : 0), 0),
        superseded: list.length - current.length,
      },
    };
  });

  /** Process a project's sources again (all of them, or the failed ones). */
  app.post<{ Params: { id: string } }>("/api/knowledge/projects/:id/reindex", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p } = await requireProjectEdit(ctx, u, req.params.id);
    await requireModule(ctx, u, p.workspaceId, "knowledge");
    const { only } = parse(z.object({ only: z.enum(["all", "failed"]).default("all") }), req.body ?? {});
    const docs = await db
      .select({ id: document.id })
      .from(projectSource)
      .innerJoin(document, eq(document.id, projectSource.documentId))
      .where(and(eq(projectSource.projectId, p.id), eq(document.projectId, p.id), isNull(document.supersededById), only === "failed" ? eq(document.status, "failed") : sql`${document.status} <> 'processing'`));
    if (docs.length) {
      await db.update(document).set({ status: "processing", error: null }).where(inArray(document.id, docs.map((d) => d.id)));
      for (const d of docs) await ctx.jobs.document(d.id);
    }
    await audit(ctx, { actor: u, action: "knowledge.reindexed", workspaceId: p.workspaceId, targetType: "project", targetId: p.id, meta: { documents: docs.length, only } });
    return { ok: true, queued: docs.length };
  });

  /** The workspace's general engineering references (shared with every member). */
  app.get<{ Querystring: { workspaceId: string } }>("/api/knowledge/references", async (req) => {
    const u = await requireUser(ctx, req);
    await requireModule(ctx, u, req.query.workspaceId, "knowledge");
    return db
      .select({ id: document.id, name: document.name, status: document.status, pageCount: document.pageCount, chunkCount: document.chunkCount, version: document.version, createdAt: document.createdAt })
      .from(document)
      .where(and(eq(document.workspaceId, req.query.workspaceId), eq(document.reference, true), eq(document.scope, "workspace"), isNull(document.projectId), isNull(document.supersededById)))
      .orderBy(asc(document.name));
  });

  /** Workspace admins put a library document into (or out of) the reference library; it's then shared with the workspace. */
  app.put<{ Params: { id: string } }>("/api/knowledge/references/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const { reference } = parse(z.object({ reference: z.boolean() }), req.body);
    const [doc] = await db.select().from(document).where(eq(document.id, req.params.id));
    if (!doc) throw notFound("Document not found");
    await requireModule(ctx, u, doc.workspaceId, "knowledge");
    if (!(isOrgAdmin(u.orgRole) || (await isWorkspaceAdmin(ctx, u, doc.workspaceId)))) throw forbidden("Only workspace admins curate the reference library.");
    if (doc.projectId) throw badRequest("Project sources stay in their project. Upload references to the document library.");
    await db.update(document).set({ reference, ...(reference ? { scope: "workspace" as const } : {}) }).where(eq(document.id, doc.id));
    await audit(ctx, { actor: u, action: reference ? "knowledge.reference_added" : "knowledge.reference_removed", workspaceId: doc.workspaceId, targetType: "document", targetId: doc.id });
    return { ok: true };
  });
}
