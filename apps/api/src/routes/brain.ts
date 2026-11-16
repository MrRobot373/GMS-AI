/**
 * The project brain's API (docs/21-project-brain.md). Anyone who can open the project can read its brain; people with
 * edit access add, correct, accept and delete entries. Everything is checked against the project, so another project's
 * entry can't be reached by its id.
 *
 *   GET    /api/projects/:id/brain                              pages with entries, what waits for review, the log
 *   PUT    /api/projects/:id/brain/settings                     { mode: auto | review | off }
 *   POST   /api/projects/:id/brain/entries                      a person writes an entry
 *   PATCH  /api/projects/:id/brain/entries/:entryId             correct the words, move it, change its kind
 *   POST   /api/projects/:id/brain/entries/:entryId/accept      a waiting entry becomes part of the brain
 *   POST   /api/projects/:id/brain/entries/:entryId/reject      …or is turned down
 *   DELETE /api/projects/:id/brain/entries/:entryId
 *   PATCH  /api/projects/:id/brain/pages/:pageId                the few lines people write about a page
 *   POST   /api/projects/:id/brain/learn                        read the sources that haven't been read yet
 *   GET    /api/projects/:id/brain/export                       the brain as an Obsidian vault (a .zip of Markdown)
 */
import { and, brainEntry, brainPage, document, eq, inArray, isNull, project, projectSource, sql, user } from "@aatmiq/db";
import { zipSync, strToU8 } from "fflate";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit, parse, requireUser, type AppContext } from "../context";
import { badRequest, notFound } from "../errors";
import { addEntry, decideEntry, deleteEntry, editEntry, ENTRY_KINDS, loadBrain, MAX_TEXT, recentLog, vaultFiles } from "../services/brain";
import { inBackground, learnPending } from "../services/brain-learn";
import { getProjectAccess, requireProjectEdit } from "../services/projects";

const kindSchema = z.enum(ENTRY_KINDS as [string, ...string[]]);
const entrySchema = z.object({ page: z.string().trim().min(1).max(60), text: z.string().trim().min(8).max(MAX_TEXT), kind: kindSchema.optional() });
const patchSchema = z.object({ page: z.string().trim().min(1).max(60).optional(), text: z.string().trim().min(8).max(MAX_TEXT).optional(), kind: kindSchema.optional() });

export async function brainRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  /** How many sources are ready but not read yet. */
  const unread = async (projectId: string) =>
    Number(
      (
        await db
          .select({ n: sql<number>`count(*)::int` })
          .from(projectSource)
          .innerJoin(document, eq(document.id, projectSource.documentId))
          .where(and(eq(projectSource.projectId, projectId), eq(document.status, "ready"), isNull(document.supersededById), sql`not exists (select 1 from brain_log l where l.project_id = ${projectId} and l.action = 'learned' and l.entry_id = ${document.id})`))
      )[0]?.n ?? 0,
    );

  app.get<{ Params: { id: string } }>("/api/projects/:id/brain", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p, canEdit } = await getProjectAccess(ctx, u, req.params.id);
    const b = await loadBrain(db, p.id, ["active", "pending", "replaced", "rejected"]);
    const authors = new Map(
      (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...new Set(b.entries.map((e) => e.authorId).filter((x): x is string => !!x))].concat("-")))).map((a) => [a.id, a.name]),
    );
    const byId = new Map(b.entries.map((e) => [e.id, e]));
    const view = (e: (typeof b.entries)[number]) => ({
      id: e.id,
      pageId: e.pageId,
      kind: e.kind,
      text: e.text,
      status: e.status,
      conflict: e.conflict,
      replaces: e.replacesId ? (byId.get(e.replacesId)?.text ?? null) : null,
      sourceKind: e.sourceKind,
      sourceId: e.sourceId,
      sourceLabel: e.sourceLabel,
      quote: e.quote,
      author: e.authorId ? (authors.get(e.authorId) ?? null) : null,
      createdAt: e.createdAt,
    });
    return {
      mode: p.brainMode,
      canEdit,
      unread: await unread(p.id),
      pages: b.pages.map((pg) => ({ id: pg.id, title: pg.title, summary: pg.summary, updatedAt: pg.updatedAt, entries: b.entries.filter((e) => e.pageId === pg.id && (e.status === "active" || e.status === "pending")).map(view) })),
      history: b.entries.filter((e) => e.status === "replaced" || e.status === "rejected").slice(-60).reverse().map(view),
      counts: { active: b.entries.filter((e) => e.status === "active").length, pending: b.entries.filter((e) => e.status === "pending").length },
      log: (await recentLog(db, p.id, 30)).map((l) => ({ id: l.id, action: l.action, detail: l.detail, createdAt: l.createdAt })),
    };
  });

  app.put<{ Params: { id: string } }>("/api/projects/:id/brain/settings", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p } = await requireProjectEdit(ctx, u, req.params.id);
    const { mode } = parse(z.object({ mode: z.enum(["auto", "review", "off"]) }), req.body);
    await db.update(project).set({ brainMode: mode, updatedAt: new Date() }).where(eq(project.id, p.id));
    await audit(ctx, { actor: u, action: "brain.mode_changed", workspaceId: p.workspaceId, targetType: "project", targetId: p.id, meta: { from: p.brainMode, to: mode } });
    // Turning it on reads what the project already has.
    if (mode !== "off" && p.brainMode === "off") inBackground("reading the project's sources", () => learnPending(ctx, p.id, u.id));
    return { mode };
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/brain/entries", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p } = await requireProjectEdit(ctx, u, req.params.id);
    const b = parse(entrySchema, req.body);
    const e = await addEntry(db, p.id, { page: b.page, text: b.text, kind: b.kind as never, userId: u.id, userName: u.name });
    await audit(ctx, { actor: u, action: "brain.entry_added", workspaceId: p.workspaceId, targetType: "project", targetId: p.id, meta: { entryId: e.id } });
    return { id: e.id };
  });

  app.patch<{ Params: { id: string; entryId: string } }>("/api/projects/:id/brain/entries/:entryId", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p } = await requireProjectEdit(ctx, u, req.params.id);
    const b = parse(patchSchema, req.body);
    if (!b.page && !b.text && !b.kind) throw badRequest("Nothing to change.");
    const e = await editEntry(db, p.id, req.params.entryId, { ...b, kind: b.kind as never, userId: u.id });
    if (!e) throw notFound("Entry not found");
    await audit(ctx, { actor: u, action: "brain.entry_edited", workspaceId: p.workspaceId, targetType: "project", targetId: p.id, meta: { entryId: e.id } });
    return { id: e.id };
  });

  for (const decision of ["accept", "reject"] as const) {
    app.post<{ Params: { id: string; entryId: string } }>(`/api/projects/:id/brain/entries/:entryId/${decision}`, async (req) => {
      const u = await requireUser(ctx, req);
      const { project: p } = await requireProjectEdit(ctx, u, req.params.id);
      const e = await decideEntry(db, p.id, req.params.entryId, decision, u.id);
      if (!e) throw notFound("There is no waiting entry with that id.");
      await audit(ctx, { actor: u, action: `brain.entry_${decision}ed`, workspaceId: p.workspaceId, targetType: "project", targetId: p.id, meta: { entryId: e.id } });
      return { id: e.id, status: e.status };
    });
  }

  app.delete<{ Params: { id: string; entryId: string } }>("/api/projects/:id/brain/entries/:entryId", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p } = await requireProjectEdit(ctx, u, req.params.id);
    if (!(await deleteEntry(db, p.id, req.params.entryId, u.id))) throw notFound("Entry not found");
    await audit(ctx, { actor: u, action: "brain.entry_deleted", workspaceId: p.workspaceId, targetType: "project", targetId: p.id, meta: { entryId: req.params.entryId } });
    return { ok: true };
  });

  app.patch<{ Params: { id: string; pageId: string } }>("/api/projects/:id/brain/pages/:pageId", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p } = await requireProjectEdit(ctx, u, req.params.id);
    const { summary } = parse(z.object({ summary: z.string().max(1500) }), req.body);
    const [pg] = await db.update(brainPage).set({ summary: summary.trim(), updatedAt: new Date() }).where(and(eq(brainPage.id, req.params.pageId), eq(brainPage.projectId, p.id))).returning({ id: brainPage.id });
    if (!pg) throw notFound("Page not found");
    return { id: pg.id };
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/brain/learn", async (req) => {
    const u = await requireUser(ctx, req);
    const { project: p } = await requireProjectEdit(ctx, u, req.params.id);
    if (p.brainMode === "off") throw badRequest("The brain is off for this project.");
    const queued = await unread(p.id);
    if (queued) inBackground("reading the project's sources", () => learnPending(ctx, p.id, u.id));
    return { queued };
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/brain/export", async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { project: p } = await getProjectAccess(ctx, u, req.params.id);
    const b = await loadBrain(db, p.id, ["active", "pending"]);
    const files = Object.fromEntries(vaultFiles(p.name, b).map((f) => [f.path, strToU8(f.content)]));
    const name = `${p.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "project"}-brain.zip`;
    await audit(ctx, { actor: u, action: "brain.exported", workspaceId: p.workspaceId, targetType: "project", targetId: p.id });
    return reply.header("content-type", "application/zip").header("content-disposition", `attachment; filename="${name}"`).send(Buffer.from(zipSync(files)));
  });
}
