import { and, asc, chat, chatDocument, desc, document, eq, inArray, isNotNull, isNull, message, organization, project, projectSource, sql, usageEvent, user, type Citation, type DB, type MessageWeb } from "@aatmiq/db";
import { GatewayError, streamChat, type ChatMessage } from "@aatmiq/model-gateway";
import { AUTO_MODEL_ID, chatCreateSchema, chatUpdateSchema, estimateTokens, isOrgAdmin, PRODUCT_NAME, sendMessageSchema, type Routing } from "@aatmiq/shared";
import type { FastifyInstance } from "fastify";
import { audit, parse, requireUser, requireWorkspaceCap, type AppContext, type SessionUser } from "../context";
import { badRequest, forbidden, HttpError, notFound } from "../errors";
import { accessibleDocs, buildContext, recallProjectChats, retrieve } from "../services/documents";
import { chatToDocx, chatToMarkdown, fileNameFor, type ExportMessage } from "../services/export";
import { getProjectAccess } from "../services/projects";
import { chooseModel, isSmallTalk } from "../services/router";
import { quotaFor } from "../services/quota";
import { localeOf, msg, tr } from "../i18n";
import { CALCULATOR_TOOLS, calcContext, dispatchCalculatorTool, findCalculation, saveChatCalculation } from "../services/calc-tool";
import { getGemSettings, webSearchDeps } from "../services/gem";
import { chatWebSearch, domainOf, dropModelImages, dropUnknownCitations, queryModel } from "../services/chat-web";
import { webSearchReady, type WebSearchDeps } from "../services/web-search";

const MAX_HISTORY = 40;

async function loadOwnChat(db: DB, u: SessionUser, chatId: string) {
  const [c] = await db.select().from(chat).where(eq(chat.id, chatId));
  if (!c || c.userId !== u.id) throw notFound("Chat not found");
  return c;
}

/** The author's own chat, or (read-only) a chat shared to a project the user can open. */
async function loadReadableChat(ctx: AppContext, u: SessionUser, chatId: string) {
  const [c] = await ctx.db.select().from(chat).where(eq(chat.id, chatId));
  if (!c) throw notFound("Chat not found");
  if (c.userId === u.id) return { chat: c, readOnly: false };
  if (!c.projectId || !c.sharedToProject) throw notFound("Chat not found");
  await getProjectAccess(ctx, u, c.projectId);
  return { chat: c, readOnly: true };
}

async function requireChatSection(ctx: AppContext, u: SessionUser, workspaceId: string) {
  const m = await requireWorkspaceCap(ctx, u, workspaceId, "workspace.use");
  if (!(await ctx.license.hasSection("chat"))) throw forbidden("Chat isn't included in your organization's license.");
  if (m && !m.sections.includes("chat") && !isOrgAdmin(u.orgRole)) throw forbidden("Chat is not enabled for you.");
  return m;
}

/** Give just-uploaded documents a moment to finish processing before answering (max ~30s). */
async function waitForProcessing(db: DB, ids: string[]) {
  if (ids.length === 0) return;
  for (let i = 0; i < 60; i++) {
    const pending = await db
      .select({ id: document.id })
      .from(document)
      .where(and(inArray(document.id, ids), eq(document.status, "processing")));
    if (pending.length === 0) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Messages on the branch ending at `leafId`, oldest first. */
async function branchPath(db: DB, leafId: string | null) {
  if (!leafId) return [];
  const rows = (await db.execute(sql`
    with recursive path as (
      select id, parent_id, 0 as depth from message where id = ${leafId}
      union all
      select m.id, m.parent_id, p.depth + 1 from message m join path p on m.id = p.parent_id where p.depth < 5000
    )
    select id from path order by depth desc`)) as unknown as { id: string }[];
  if (!rows.length) return [];
  const msgs = await db.select().from(message).where(inArray(message.id, rows.map((r) => r.id)));
  const byId = new Map(msgs.map((m) => [m.id, m]));
  return rows.map((r) => byId.get(r.id)!).filter(Boolean);
}

/** Delete temporary chats nobody has touched for a day. */
/**
 * Hourly housekeeping: temporary chats after a day, and every chat untouched for longer than the
 * organization keeps chats (Admin → Settings → Data & privacy; empty: until people delete them).
 */
export async function purgeTemporaryChats(db: DB) {
  await db.execute(sql`delete from chat where temporary and updated_at < now() - interval '24 hours'`);
  const [org] = await db.select({ days: organization.retentionDays }).from(organization).limit(1);
  if (org?.days && org.days > 0) await db.execute(sql`delete from chat where updated_at < now() - make_interval(days => ${org.days})`);
}

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57).trimEnd()}…` : oneLine || "New chat";
}

export async function chatRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, box } = ctx;

  /**
   * The user's own chats. Default: outside projects and not archived.
   * `projectId`: chats in that project. `archived=1`: every archived chat.
   */
  app.get<{ Querystring: { workspaceId: string; projectId?: string; archived?: string } }>("/api/chats", async (req) => {
    const u = await requireUser(ctx, req);
    await requireChatSection(ctx, u, req.query.workspaceId);
    const archived = req.query.archived === "1" || req.query.archived === "true";
    const scope = archived
      ? isNotNull(chat.archivedAt)
      : and(isNull(chat.archivedAt), req.query.projectId ? eq(chat.projectId, req.query.projectId) : isNull(chat.projectId));
    return db
      .select({
        id: chat.id,
        title: chat.title,
        pinned: chat.pinned,
        modelId: chat.modelId,
        projectId: chat.projectId,
        projectName: project.name,
        sharedToProject: chat.sharedToProject,
        archivedAt: chat.archivedAt,
        updatedAt: chat.updatedAt,
      })
      .from(chat)
      .leftJoin(project, eq(project.id, chat.projectId))
      .where(and(eq(chat.workspaceId, req.query.workspaceId), eq(chat.userId, u.id), eq(chat.temporary, false), scope))
      .orderBy(...(archived ? [desc(chat.archivedAt)] : [desc(chat.pinned), desc(chat.updatedAt)]))
      .limit(200);
  });

  app.post("/api/chats", async (req) => {
    const u = await requireUser(ctx, req);
    const body = parse(chatCreateSchema, req.body);
    await requireChatSection(ctx, u, body.workspaceId);
    if (body.projectId) {
      const { project: p } = await getProjectAccess(ctx, u, body.projectId);
      if (p.workspaceId !== body.workspaceId) throw badRequest("That project belongs to another workspace.");
    }
    const [c] = await db
      .insert(chat)
      .values({
        workspaceId: body.workspaceId,
        userId: u.id,
        title: body.title ?? "New chat",
        // Auto picks the model per message; otherwise the chat remembers the one chosen.
        modelId: body.modelId === AUTO_MODEL_ID ? null : body.modelId,
        auto: body.modelId === AUTO_MODEL_ID,
        projectId: body.projectId,
        temporary: body.temporary ?? false,
      })
      .returning();
    return c;
  });

  app.get<{ Params: { id: string } }>("/api/chats/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const { chat: c, readOnly } = await loadReadableChat(ctx, u, req.params.id);
    const messages = await db
      .select()
      .from(message)
      .where(eq(message.chatId, c.id))
      .orderBy(asc(message.createdAt));
    const documents = await db
      .select({ id: document.id, name: document.name, status: document.status })
      .from(chatDocument)
      .innerJoin(document, eq(document.id, chatDocument.documentId))
      .where(eq(chatDocument.chatId, c.id))
      .orderBy(asc(chatDocument.createdAt));
    const access = c.projectId ? await getProjectAccess(ctx, u, c.projectId).catch(() => null) : null;
    const proj = access && { id: access.project.id, name: access.project.name, color: access.project.color, canEdit: access.canEdit };
    const [author] = readOnly ? await db.select({ name: user.name }).from(user).where(eq(user.id, c.userId)) : [];
    const locale = localeOf(req);
    return {
      ...c,
      messages: messages.map((m) => ({
        ...m,
        ...(m.error ? { error: tr(locale, m.error) } : {}),
        ...(m.web?.note ? { web: { ...m.web, note: tr(locale, m.web.note) } } : {}),
      })),
      documents,
      readOnly,
      project: proj ?? null,
      authorName: author?.name ?? null,
    };
  });

  /** Download the branch being shown (or one message) as Word or Markdown. */
  app.get<{ Params: { id: string }; Querystring: { format?: string; messageId?: string } }>("/api/chats/:id/export", async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { chat: c } = await loadReadableChat(ctx, u, req.params.id);
    const format = req.query.format === "md" ? "md" : "docx";
    const path = await branchPath(db, c.leafMessageId);
    let picked = path.filter((m) => m.role !== "system" && !m.error);
    if (req.query.messageId) {
      const [one] = await db.select().from(message).where(and(eq(message.id, req.query.messageId), eq(message.chatId, c.id)));
      if (!one) throw notFound("Message not found");
      picked = [one];
    }
    const [[author], [org]] = await Promise.all([
      db.select({ name: user.name }).from(user).where(eq(user.id, c.userId)),
      db.select({ productName: organization.productName }).from(organization).limit(1),
    ]);
    const assistant = org?.productName ?? PRODUCT_NAME;
    const messages: ExportMessage[] = picked.map((m) => ({
      role: m.role as "user" | "assistant",
      author: m.role === "user" ? (author?.name ?? "User") : assistant,
      content: m.content,
      citations: m.citations,
    }));
    const subtitle = `${req.query.messageId ? "Answer from" : "Chat with"} ${assistant} · exported ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
    const title = c.title;
    await audit(ctx, { actor: u, action: "chat.exported", workspaceId: c.workspaceId, targetType: "chat", targetId: c.id, meta: { format, messageId: req.query.messageId } });
    const name = fileNameFor(title, format);
    reply.header("content-disposition", `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    if (format === "md") return reply.type("text/markdown; charset=utf-8").send(chatToMarkdown({ title, subtitle, messages }));
    return reply
      .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .send(await chatToDocx({ title, subtitle, messages }));
  });

  app.patch<{ Params: { id: string } }>("/api/chats/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await loadOwnChat(db, u, req.params.id);
    const { archived, projectId, sharedToProject, leafMessageId, ...rest } = parse(chatUpdateSchema, req.body);
    const set: Partial<typeof chat.$inferInsert> = { ...rest };
    if (leafMessageId !== undefined) {
      const [m] = await db.select({ id: message.id }).from(message).where(and(eq(message.id, leafMessageId), eq(message.chatId, c.id)));
      if (!m) throw badRequest("That message isn't in this chat.");
      set.leafMessageId = m.id;
    }
    if (archived !== undefined) set.archivedAt = archived ? new Date() : null;
    if (projectId !== undefined) {
      if (projectId) {
        const { project: p } = await getProjectAccess(ctx, u, projectId);
        if (p.workspaceId !== c.workspaceId) throw badRequest("That project belongs to another workspace.");
      }
      set.projectId = projectId;
      // A chat moved elsewhere stops being shared with the old project.
      if (projectId !== c.projectId) set.sharedToProject = false;
    }
    if (sharedToProject !== undefined) {
      if (sharedToProject && c.temporary && set.temporary !== false) throw badRequest("Keep this temporary chat before sharing it.");
      if (sharedToProject && !(set.projectId ?? c.projectId)) throw badRequest("Only chats inside a project can be shared to it.");
      set.sharedToProject = sharedToProject;
    }
    const [updated] = await db.update(chat).set(set).where(eq(chat.id, c.id)).returning();
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/chats/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await loadOwnChat(db, u, req.params.id);
    await db.delete(chat).where(eq(chat.id, c.id));
    return { ok: true };
  });

  /**
   * Send a message and stream the reply as server-sent events:
   *   event: start  {userMessageId, model, citations, webSearch}
   *   event: searching {queries}  (web search only: what's being looked up)
   *   event: search {queries, provider, sources: [{n, title, domain}], citations, note}  (web search only)
   *   event: delta  {text}
   *   event: done   {messageId, usage, quota, content?}  (content: the answer as saved, when it differs)
   *   event: error  {message}
   */
  app.post<{ Params: { id: string } }>("/api/chats/:id/messages", async (req, reply) => {
    const u = await requireUser(ctx, req);
    const c = await loadOwnChat(db, u, req.params.id);
    const membership = await requireChatSection(ctx, u, c.workspaceId);
    const body = parse(sendMessageSchema, req.body);

    // Where the new messages go. Default: after the branch being shown. An earlier parent edits and branches.
    const inChat = async (id: string) =>
      (await db.select({ id: message.id, parentId: message.parentId, role: message.role, content: message.content }).from(message).where(and(eq(message.id, id), eq(message.chatId, c.id))))[0];
    let regenerateOf: Awaited<ReturnType<typeof inChat>> | undefined;
    let parentId: string | null;
    if (body.regenerateOf) {
      regenerateOf = await inChat(body.regenerateOf);
      if (!regenerateOf || regenerateOf.role !== "user") throw badRequest("Pick one of your messages to answer again.");
      parentId = regenerateOf.parentId;
    } else {
      parentId = body.parentId !== undefined ? body.parentId : c.leafMessageId;
      if (parentId && !(await inChat(parentId))) throw badRequest("That message isn't in this chat.");
    }
    const content = regenerateOf ? regenerateOf.content : body.content!;

    // The branch so far, walking up from the parent.
    const history = parentId
      ? ((await db.execute(sql`
          with recursive path as (
            select id, parent_id, role, content, error, routing, 0 as depth from message where id = ${parentId}
            union all
            select m.id, m.parent_id, m.role, m.content, m.error, m.routing, p.depth + 1
            from message m join path p on m.id = p.parent_id where p.depth < 500
          )
          select role, content, error, routing from path order by depth asc limit ${MAX_HISTORY}`)) as unknown as {
          role: "system" | "user" | "assistant";
          content: string;
          error: string | null;
          routing: Routing | null;
        }[])
      : [];

    // Documents in play: the chat's, newly attached ones, and inside a project its sources.
    const chatDocIds = (
      await db.select({ id: chatDocument.documentId }).from(chatDocument).where(eq(chatDocument.chatId, c.id))
    ).map((r) => r.id);
    // Inside a project, its sources are always in reach. If access was revoked, the chat carries on without them.
    const proj = c.projectId ? await getProjectAccess(ctx, u, c.projectId).then((a) => a.project, () => null) : null;
    const projectDocIds = proj
      ? (await db.select({ id: projectSource.documentId }).from(projectSource).where(eq(projectSource.projectId, proj.id))).map((r) => r.id)
      : [];

    // Web search, when the person switched it on: only if the organization allows it in chat and a
    // provider is set up. A greeting has nothing to look up.
    const gem = await getGemSettings(db);
    let webDeps: WebSearchDeps | null = null;
    let webOff: string | null = null;
    if (body.webSearch && !isSmallTalk(content)) {
      if (!gem.chatWebSearch) webOff = msg("Web search is turned off for your organization.");
      else {
        const deps = await webSearchDeps(ctx);
        if (webSearchReady(deps)) webDeps = deps;
        else webOff = msg("Web search isn't set up. An admin can choose a provider in Admin → Settings → GEM AI.");
      }
    }

    // The model: the one chosen, or Auto's pick for this message.
    const { model: m, provider, routing, thinking } = await chooseModel(db, box, {
      workspaceId: c.workspaceId,
      section: "chat",
      userId: u.id,
      requested: body.modelId ?? (c.auto ? AUTO_MODEL_ID : c.modelId),
      savedAuto: !body.modelId && c.auto,
      text: content,
      // Sources take up to a few thousand tokens (web pages about 5,000); the branch is read in full.
      contextTokens:
        history.reduce((n, h) => n + estimateTokens(h.content), 0) + (chatDocIds.length || projectDocIds.length || body.documentIds?.length ? 3000 : 0) + (webDeps ? 5000 : 0),
      hasSources: Boolean(chatDocIds.length || projectDocIds.length || body.documentIds?.length),
      webSearch: !!webDeps,
      follows: history.find((h) => h.role === "assistant")?.routing?.difficulty ?? null,
    });
    // The workspace pays for its own models; a group pays for a model only it gives.
    const { status: quota, groupId } = await quotaFor(db, c.workspaceId, u.id, m);
    if (!quota.result.allowed) {
      throw new HttpError(402, quota.scope.kind === "group" ? `You've used your share of the ${quota.scope.name} group's tokens for this period.` : "You've used your token allowance for this period.", "quota_exceeded", quota);
    }

    // Attach any newly referenced documents to the chat (only ones this user may read).
    let attachments: { id: string; name: string }[] = [];
    if (body.documentIds?.length && !regenerateOf) {
      attachments = await db
        .select({ id: document.id, name: document.name })
        .from(document)
        .where(and(accessibleDocs(c.workspaceId, u.id), inArray(document.id, body.documentIds)));
      if (attachments.length !== new Set(body.documentIds).size) throw badRequest("Some attached documents aren't available.");
      await db
        .insert(chatDocument)
        .values(attachments.map((a) => ({ chatId: c.id, documentId: a.id })))
        .onConflictDoNothing();
      for (const a of attachments) if (!chatDocIds.includes(a.id)) chatDocIds.push(a.id);
    }
    await waitForProcessing(db, [...chatDocIds, ...projectDocIds]);

    const userMsgId = regenerateOf
      ? regenerateOf.id
      : (
          await db
            .insert(message)
            .values({ chatId: c.id, parentId, role: "user", content, attachments: attachments.length ? attachments : null })
            .returning({ id: message.id })
        )[0]!.id;

    const [[org], [profile]] = await Promise.all([
      db.select({ productName: organization.productName, promptLogging: organization.promptLogging }).from(organization).limit(1),
      db.select({ ci: user.customInstructions, name: user.name }).from(user).where(eq(user.id, u.id)),
    ]);
    const product = org?.productName ?? PRODUCT_NAME;
    // Project instructions take precedence over the user's personal ones.
    const instructions = proj?.instructions?.trim()
      ? `\nThis chat is in the project "${proj.name}". Follow the project's instructions (they take precedence over the user's personal ones):\n${proj.instructions.trim()}`
      : profile?.ci
        ? `\nThe user's custom instructions:\n${profile.ci}`
        : "";
    const system = [
      `You are ${product}, a helpful private AI assistant for ${u.name}'s organization.`,
      `Answer clearly and concisely. Use Markdown for structure and fenced code blocks for code.`,
      proj && !proj.instructions?.trim() ? `\nThis chat is in the project "${proj.name}".` : "",
      instructions,
    ].join("\n");

    const [retrieval, recollections] = await Promise.all([
      retrieve(db, box, {
        workspaceId: c.workspaceId,
        userId: u.id,
        documentIds: [...new Set([...chatDocIds, ...projectDocIds])],
        query: content,
      }),
      proj ? recallProjectChats(db, { projectId: proj.id, chatId: c.id, userId: u.id, query: content }) : [],
    ]);
    const docContext = buildContext(retrieval.chunks, recollections);

    // Calculators: a question the rules can already match runs before the model speaks. The model
    // can also call calculators_search and calculators_run itself when that misses.
    const calcOn = gem.modules.calculators && (!membership || membership.sections.includes("calculators") || isOrgAdmin(u.orgRole));
    let calculation = calcOn
        ? await findCalculation({
            text: content,
            showBeta: gem.betaCalculators,
            model: { provider, modelKey: m.modelKey },
            onUsage: async (us) => {
              await db.insert(usageEvent).values({ workspaceId: c.workspaceId, userId: u.id, modelId: m.id, groupId, section: "chat", inputTokens: us.inputTokens, outputTokens: us.outputTokens, estimated: us.estimated });
            },
          }).catch(() => null)
        : null;
    if (calculation) await saveChatCalculation(db, u.id, c.workspaceId, calculation);
    const calcSystem = [
      calculation ? `\n\n${calcContext(calculation)}` : "",
      calcOn
        ? "\n\nYou may call calculators_search and calculators_run. Those run tested formulas. When a question needs a calculated engineering number and none was already given above, call them instead of doing the arithmetic yourself. Explain a result exactly as given. If a calculator refuses the inputs, say why and do not invent a number."
        : "",
    ].join("");
    if (retrieval.embedTokens > 0) {
      await db.insert(usageEvent).values({
        workspaceId: c.workspaceId,
        userId: u.id,
        modelId: retrieval.embeddingModelId,
        section: "chat",
        inputTokens: retrieval.embedTokens,
        outputTokens: 0,
      });
    }

    const messages: ChatMessage[] = [
      { role: "system", content: (docContext.system ? `${system}\n\n${docContext.system}` : system) + calcSystem },
      ...history
        .reverse()
        .filter((h) => !h.error && h.role !== "system")
        .map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content },
    ];

    const titleUpdate = c.title === "New chat" ? { title: titleFrom(content) } : {};
    // Replying to an archived chat brings it back.
    await db
      .update(chat)
      .set({ ...titleUpdate, modelId: m.id, auto: routing !== null, updatedAt: new Date(), archivedAt: null, leafMessageId: userMsgId })
      .where(eq(chat.id, c.id));
    if (proj) await db.update(project).set({ updatedAt: new Date() }).where(eq(project.id, proj.id));

    // Stream.
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const abort = new AbortController();
    res.on("close", () => abort.abort());

    send("start", {
      userMessageId: userMsgId,
      parentId,
      model: { id: m.id, displayName: m.displayName },
      routing,
      citations: docContext.citations,
      calculation,
      webSearch: !!webDeps,
      ...titleUpdate,
    });

    // Web search runs while the person sees "Searching the web…"; its sources follow the documents'.
    const locale = localeOf(req);
    let web: MessageWeb | null = webOff ? { queries: [], provider: null, note: webOff } : null;
    let webCitations: Citation[] = [];
    if (webDeps) {
      const qm = await queryModel(db, box, c.workspaceId, u.id, { model: m, provider, groupId });
      const found = await chatWebSearch({
        deps: webDeps,
        model: qm,
        turns: messages.slice(1, -1),
        content,
        first: docContext.citations.length + 1,
        signal: abort.signal,
        onUsage: async (us) => {
          await db.insert(usageEvent).values({ workspaceId: c.workspaceId, userId: u.id, modelId: qm.model.id, groupId: qm.groupId, section: "chat", inputTokens: us.inputTokens, outputTokens: us.outputTokens, estimated: us.estimated, status: "ok" });
        },
        onQueries: (queries) => send("searching", { queries }),
      });
      web = found.web;
      webCitations = found.citations;
      messages[0]!.content += `\n\n${found.prompt}`;
      send("search", {
        queries: web.queries,
        provider: web.provider,
        note: web.note ? tr(locale, web.note) : null,
        sources: webCitations.map((x) => ({ n: x.n, title: x.name, domain: domainOf(x.url!) })),
        citations: webCitations,
      });
    } else if (web) {
      send("search", { queries: [], provider: null, note: tr(locale, web.note!), sources: [], citations: [] });
    }
    const citations = [...docContext.citations, ...webCitations];

    const started = Date.now();
    let text = "";
    let error: string | null = null;
    let usage = { inputTokens: 0, outputTokens: 0, estimated: true };
    const addUsage = (u: typeof usage) => {
      usage = { inputTokens: usage.inputTokens + u.inputTokens, outputTokens: usage.outputTokens + u.outputTokens, estimated: usage.estimated && u.estimated };
    };
    // A provider that rejects the tools field is asked again without them.
    let allowTools = calcOn;
    const pending: ChatMessage[] = [];
    let thought = false;
    for (let round = 0; round < 4 && !error && !abort.signal.aborted; round++) {
      let roundText = "";
      let calls: { id: string; name: string; arguments: string }[] = [];
      try {
        for await (const ev of streamChat(provider, m.modelKey, [...messages, ...pending], { signal: abort.signal, thinking, tools: allowTools ? CALCULATOR_TOOLS : undefined })) {
          if (ev.type === "delta") {
            roundText += ev.text;
            text += ev.text;
            send("delta", { text: ev.text });
          } else if (ev.type === "reasoning") {
            // Thinking isn't shown, but people see that the model is working on it.
            if (!thought) send("thinking", {});
            thought = true;
          } else if (ev.type === "tool_calls") {
            calls = ev.calls;
          } else {
            addUsage(ev.usage);
          }
        }
      } catch (e) {
        if (allowTools && e instanceof GatewayError && /Provider returned 400\b/.test(e.message)) {
          allowTools = false;
          round -= 1;
          continue;
        }
        if (!abort.signal.aborted) error = e instanceof Error ? e.message : msg("The model failed to respond.");
        break;
      }
      if (!allowTools || calls.length === 0) break;
      pending.push({
        role: "assistant",
        content: roundText,
        tool_calls: calls.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: "function" as const, function: { name: c.name, arguments: c.arguments || "{}" } })),
      });
      for (const [i, call] of calls.entries()) {
        let args: unknown = {};
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {
          args = {};
        }
        const out = dispatchCalculatorTool(call.name, args, gem.betaCalculators);
        if (out.calculation) {
          calculation = out.calculation;
          send("calculation", { calculation });
          await saveChatCalculation(db, u.id, c.workspaceId, out.calculation).catch(() => undefined);
        }
        pending.push({ role: "tool", tool_call_id: call.id || `call_${round}_${i}`, content: out.text });
      }
    }
    if (abort.signal.aborted && usage.outputTokens === 0) {
      usage = { inputTokens: messages.reduce((n, x) => n + Math.ceil(x.content.length / 4), 0), outputTokens: Math.ceil(text.length / 4), estimated: true };
    }
    // With web search, a number that matches no source is taken out of what's saved (and shown),
    // and so is any image the model wrote (the page shows web answers' images as their alt text).
    const streamed = text;
    if (web) text = dropModelImages(dropUnknownCitations(text, citations.length));

    const [assistant] = await db
      .insert(message)
      .values({
        chatId: c.id,
        parentId: userMsgId,
        role: "assistant",
        content: text,
        modelId: m.id,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        error,
        citations: citations.length ? citations : null,
        routing,
        calculation: calculation as unknown as Record<string, unknown> | null,
        web,
      })
      .returning({ id: message.id });
    await db.update(chat).set({ leafMessageId: assistant!.id }).where(eq(chat.id, c.id));
    await db.insert(usageEvent).values({
      workspaceId: c.workspaceId,
      userId: u.id,
      modelId: m.id,
      groupId,
      section: "chat",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimated: usage.estimated,
      latencyMs: Date.now() - started,
      status: error ? "error" : abort.signal.aborted ? "aborted" : "ok",
    });

    if (!res.writableEnded && !res.destroyed) {
      const changed = text !== streamed ? { content: text } : {};
      if (error) send("error", { message: tr(locale, error), messageId: assistant!.id, ...changed });
      else send("done", { messageId: assistant!.id, usage, quota: (await quotaFor(db, c.workspaceId, u.id, m)).status, ...changed });
      res.end();
    }
  });
}
