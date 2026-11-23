/**
 * Work AI for people: tasks, their live timeline, approvals and the files the agent works on.
 * Tasks are private to the person who started them; a task in a project can be shared to it,
 * which lets the project's people read (not change) it.
 */
import { and, asc, codeWorkspace, desc, document, eq, ilike, isNull, project, projectSource, user, workApproval, workEvent, workTask } from "@aatmiq/db";
import { isOrgAdmin, workMessageSchema, workTaskCreateSchema } from "@aatmiq/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { z } from "zod";
import { audit, parse, requireUser, requireWorkspaceCap, type AppContext, type SessionUser } from "../context";
import { claudeAvailable, opencodeAvailable } from "@aatmiq/harness";
import { badRequest, forbidden, HttpError, notFound } from "../errors";
import { resolveModel, type AvailableModel } from "../services/models";
import { chooseModel } from "../services/router";
import { randomToken } from "../crypto";
import { isSupported, SUPPORTED_HINT } from "../services/extract";
import { PROJECT_FOLDER } from "../services/project-work";
import { getProjectAccess, requireNotGuest, requireProjectEdit } from "../services/projects";
import { quotaFor, quotaMessage } from "../services/quota";
import { workWebSearchDeps } from "../services/gem";
import { webSearchReady } from "../services/web-search";
import { browseFolders, busyMessage, folderBusy, resolveWorkFolder } from "../services/work-folder";
import { changesSince, undoChanges } from "../services/work-snapshot";
import { getWorkSettings, superAiWindowProblem, titleFrom, type WorkStreamEvent } from "../services/work";
import { localeOf, msg, tr } from "../i18n";

const MAX_FILES = 1000;
// `.task` holds long requests saved for the agent (services/work.ts), not something it made.
const SKIP_DIRS = new Set([".git", "node_modules", "__pycache__", ".venv", ".cache", ".task"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Content types shown inline; anything else downloads. HTML/SVG are never rendered (served as text). */
const INLINE: Record<string, string> = {
  ".txt": "text/plain", ".md": "text/plain", ".csv": "text/plain", ".json": "text/plain", ".log": "text/plain",
  ".py": "text/plain", ".js": "text/plain", ".ts": "text/plain", ".html": "text/plain", ".svg": "text/plain",
  ".yml": "text/plain", ".yaml": "text/plain", ".sh": "text/plain", ".sql": "text/plain", ".xml": "text/plain",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function requireWorkSection(ctx: AppContext, u: SessionUser, workspaceId: string) {
  const m = await requireWorkspaceCap(ctx, u, workspaceId, "workspace.use");
  if (!(await ctx.license.hasSection("work"))) throw forbidden("Work AI isn't included in your organization's license.");
  if (m && !m.sections.includes("work") && !isOrgAdmin(u.orgRole)) throw forbidden("Work AI is not enabled for you. Ask your admin.");
}

async function loadOwnTask(ctx: AppContext, u: SessionUser, id: string) {
  const [t] = await ctx.db.select().from(workTask).where(eq(workTask.id, id));
  if (!t || t.userId !== u.id) throw notFound("Task not found");
  return t;
}

/** The person's own task, or one shared to a project they can open (read-only). */
async function loadReadableTask(ctx: AppContext, u: SessionUser, id: string) {
  const [t] = await ctx.db.select().from(workTask).where(eq(workTask.id, id));
  if (!t) throw notFound("Task not found");
  if (t.userId === u.id) return { task: t, own: true };
  if (!t.sharedToProject || !t.projectId) throw notFound("Task not found");
  await getProjectAccess(ctx, u, t.projectId).catch(() => {
    throw notFound("Task not found");
  });
  return { task: t, own: false };
}

/** Budget check for the model a task will use (the workspace's, or the group's that gives it). */
async function requireQuota(ctx: AppContext, workspaceId: string, userId: string, modelId: string | null, section: "work" | "code" = "work", projectId: string | null = null) {
  const { model: m } = await resolveModel(ctx.db, ctx.box, workspaceId, section, modelId, userId);
  return checkQuota(ctx, workspaceId, userId, m, projectId);
}

/** In a project with its own budget, the task must fit that too. */
async function checkQuota(ctx: AppContext, workspaceId: string, userId: string, m: AvailableModel, projectId: string | null = null) {
  const { status: quota } = await quotaFor(ctx.db, workspaceId, userId, m, projectId);
  if (!quota.result.allowed) throw new HttpError(402, quotaMessage(quota), "quota_exceeded", quota);
  return m;
}

/** Resolve a path inside the task folder; refuses anything that escapes it (.., symlinks). */
export async function safePath(root: string, rel: string) {
  if (!rel || rel.includes("\0")) throw badRequest("Pick a file");
  const full = join(root, rel);
  if (relative(root, full).startsWith("..")) throw notFound("File not found");
  const real = await realpath(full).catch(() => null);
  const realRoot = await realpath(root).catch(() => root);
  if (!real || (real !== realRoot && !real.startsWith(realRoot + sep))) throw notFound("File not found");
  return real;
}

/** Where the agent keeps work it only needed along the way (docs/06-work-ai.md): listed last. */
export const SCRATCH_FOLDER = "scratch";

async function listFiles(root: string) {
  const out: { path: string; size: number; modifiedAt: string }[] = [];
  let truncated = false;
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    // By name; the scratch folder after everything else, so what the person asked for comes first.
    const last = (e: { name: string; isDirectory(): boolean }) => dir === root && e.name === SCRATCH_FOLDER && e.isDirectory();
    for (const e of entries.sort((a, b) => Number(last(a)) - Number(last(b)) || a.name.localeCompare(b.name))) {
      if (out.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(full);
      } else if (e.isFile()) {
        const s = await lstat(full).catch(() => null);
        if (s) out.push({ path: relative(root, full).split(sep).join("/"), size: s.size, modifiedAt: s.mtime.toISOString() });
      }
    }
  };
  await walk(root);
  return { files: out, truncated };
}

export async function workRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, box, work } = ctx;

  /**
   * Where a task's files are: its own folder, or for a Code task the person's Code workspace (read
   * only here: they change it in the IDE). Null when that workspace is gone.
   */
  const filesRoot = async (t: typeof workTask.$inferSelect): Promise<string | null> => {
    // A task working in a folder: the files are there (checked against the allowed folders again, so a folder an admin has
    // since taken off the list isn't served).
    if (t.workFolder) {
      const ok = await resolveWorkFolder(t.workFolder, await work.folderRules());
      return ok.ok ? ok.path : null;
    }
    if (!t.codeWorkspaceId) return work.filesDir(t.id);
    const [w] = await db.select({ userId: codeWorkspace.userId, slug: codeWorkspace.slug }).from(codeWorkspace).where(eq(codeWorkspace.id, t.codeWorkspaceId));
    return w ? ctx.code.workspacePath(w.userId, w.slug) : null;
  };
  /** A Code task's workspace, for the task page (its name, and that the files are there). */
  const codeOf = async (id: string | null) => {
    if (!id) return null;
    const [w] = await db.select({ id: codeWorkspace.id, name: codeWorkspace.name }).from(codeWorkspace).where(eq(codeWorkspace.id, id));
    return w ?? null;
  };

  /** The folders inside an allowed folder, for the folder picker (no path: the allowed folders themselves). */
  app.get<{ Querystring: { workspaceId?: string; path?: string } }>("/api/work/folders", async (req) => {
    const u = await requireUser(ctx, req);
    if (req.query.workspaceId) await requireWorkSection(ctx, u, req.query.workspaceId);
    const r = await browseFolders(req.query.path ?? null, await work.folderRules());
    if (!r.ok) throw badRequest(r.error);
    return r.listing;
  });

  /** What Work AI can do here (for the UI). */
  app.get<{ Querystring: { workspaceId?: string } }>("/api/work/info", async (req) => {
    const u = await requireUser(ctx, req);
    if (req.query.workspaceId) await requireWorkSection(ctx, u, req.query.workspaceId);
    const s = await getWorkSettings(db);
    return { webSearch: webSearchReady(await workWebSearchDeps(ctx)), approvals: s.approvals, allowNetwork: s.allowNetwork, maxConcurrentPerUser: s.maxConcurrentPerUser, superAi: s.superAi && (await claudeAvailable()), agentAi: s.agentAi && (await opencodeAvailable()), folders: (await work.folderRules()).roots.length > 0 };
  });

  app.get<{ Querystring: { workspaceId?: string; q?: string; engine?: string } }>("/api/work/tasks", async (req) => {
    const u = await requireUser(ctx, req);
    const wsId = req.query.workspaceId ?? "";
    await requireWorkSection(ctx, u, wsId);
    const q = req.query.q?.trim();
    // Work AI, Super AI and Agent AI each list their own tasks.
    const engine = req.query.engine === "claude" || req.query.engine === "opencode" ? req.query.engine : "dsh";
    return db
      .select({
        id: workTask.id,
        engine: workTask.engine,
        title: workTask.title,
        status: workTask.status,
        result: workTask.result,
        error: workTask.error,
        pinned: workTask.pinned,
        modelId: workTask.modelId,
        scheduleId: workTask.scheduleId,
        projectId: workTask.projectId,
        projectName: project.name,
        sharedToProject: workTask.sharedToProject,
        // Code tasks are listed too, marked with their Code workspace.
        codeWorkspaceId: workTask.codeWorkspaceId,
        codeWorkspaceName: codeWorkspace.name,
        inputTokens: workTask.inputTokens,
        outputTokens: workTask.outputTokens,
        createdAt: workTask.createdAt,
        updatedAt: workTask.updatedAt,
        finishedAt: workTask.finishedAt,
      })
      .from(workTask)
      .leftJoin(project, eq(project.id, workTask.projectId))
      .leftJoin(codeWorkspace, eq(codeWorkspace.id, workTask.codeWorkspaceId))
      .where(and(eq(workTask.workspaceId, wsId), eq(workTask.userId, u.id), isNull(workTask.parentId), eq(workTask.engine, engine), q ? ilike(workTask.title, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined))
      .orderBy(desc(workTask.pinned), desc(workTask.updatedAt))
      .limit(200);
  });

  app.post("/api/work/tasks", async (req) => {
    const u = await requireUser(ctx, req);
    const b = parse(workTaskCreateSchema, req.body);
    await requireWorkSection(ctx, u, b.workspaceId);
    if (b.engine === "claude") {
      if (!(await getWorkSettings(db)).superAi) throw badRequest("Super AI is turned off. An admin can turn it on under Admin → Work AI.");
      if (!(await claudeAvailable())) throw badRequest("Super AI isn't installed on this server.");
      if (work.mode === "container") throw badRequest("Super AI doesn't run in container mode yet.");
    }
    if (b.engine === "opencode") {
      if (!(await getWorkSettings(db)).agentAi) throw badRequest(msg("Agent AI is turned off. An admin can turn it on under Admin → Work AI."));
      if (!(await opencodeAvailable())) throw badRequest(msg("Agent AI isn't installed on this server."));
      if (work.mode === "container") throw badRequest(msg("Agent AI doesn't run in container mode yet."));
    }
    // The model asked for, or Auto's pick for this task (it keeps the model for its follow-ups).
    const { model: m, routing } = await chooseModel(db, ctx.box, {
      workspaceId: b.workspaceId,
      section: "work",
      userId: u.id,
      requested: b.modelId ?? null,
      text: b.prompt,
      hasSources: Boolean(b.projectId),
    });
    await checkQuota(ctx, b.workspaceId, u.id, m, b.projectId ?? null);
    if (b.engine === "claude") {
      const tooSmall = superAiWindowProblem(m.displayName, m.contextLength);
      if (tooSmall) throw badRequest(tooSmall);
    }
    if (b.projectId) {
      const p = await getProjectAccess(ctx, u, b.projectId);
      if (p.project.workspaceId !== b.workspaceId) throw badRequest("That project is in another workspace.");
    } else await requireNotGuest(ctx, u, b.workspaceId);
    // Working directly in a folder on the server instead of a private copy: the one typed, or the project's shared folder.
    let workFolder: string | null = null;
    let wanted = b.folder ?? null;
    if (!wanted && b.projectId && !b.privateCopy) {
      const [pf] = await db.select({ f: project.workFolder }).from(project).where(eq(project.id, b.projectId));
      wanted = pf?.f ?? null;
    }
    if (wanted) {
      const ok = await resolveWorkFolder(wanted, await work.folderRules());
      if (!ok.ok) throw badRequest(ok.error);
      const busy = await folderBusy(db, ok.path);
      if (busy) throw new HttpError(409, busyMessage(busy), "folder_busy");
      workFolder = ok.path;
    }
    const [t] = await db
      .insert(workTask)
      .values({ workspaceId: b.workspaceId, userId: u.id, title: titleFrom(b.prompt), modelId: m.id, routing, projectId: b.projectId ?? null, engine: b.engine, workFolder })
    
      .returning();
    if (b.start) await work.submit(t!.id, b.prompt);
    const [fresh] = await db.select().from(workTask).where(eq(workTask.id, t!.id));
    return fresh;
  });

  app.get<{ Params: { id: string } }>("/api/work/tasks/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const { task: t, own } = await loadReadableTask(ctx, u, req.params.id);
    const events = await db
      .select({ seq: workEvent.seq, kind: workEvent.kind, data: workEvent.data, at: workEvent.createdAt })
      .from(workEvent)
      .where(eq(workEvent.taskId, t.id))
      .orderBy(asc(workEvent.seq))
      .limit(10_000);
    // Its project, if the reader can open it (to link back and save results to it).
    const access = t.projectId ? await getProjectAccess(ctx, u, t.projectId).catch(() => null) : null;
    const [owner] = own ? [] : await db.select({ name: user.name }).from(user).where(eq(user.id, t.userId));
    return {
      task: t.error ? { ...t, error: tr(localeOf(req), t.error) } : t,
      events,
      live: work.isLive(t.id),
      // How full the model's context window is right now (a running task only).
      context: work.contextOf(t.id),
      own,
      ownerName: owner?.name ?? null,
      project: access ? { id: access.project.id, name: access.project.name, color: access.project.color, canEdit: access.canEdit } : null,
      code: await codeOf(t.codeWorkspaceId),
      // The folder a task works in directly (shown on the task page).
      workFolder: t.workFolder,
    };
  });

  /** Live timeline (see streamTask). */
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>("/api/work/tasks/:id/stream", async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { task: t } = await loadReadableTask(ctx, u, req.params.id);
    await streamTask(ctx, t.id, Number(req.query.after ?? 0) || 0, reply);
  });

  app.post<{ Params: { id: string } }>("/api/work/tasks/:id/messages", async (req) => {
    const u = await requireUser(ctx, req);
    const t = await loadOwnTask(ctx, u, req.params.id);
    await requireWorkSection(ctx, u, t.workspaceId);
    const b = parse(workMessageSchema, req.body);
    await requireQuota(ctx, t.workspaceId, u.id, t.modelId, t.codeWorkspaceId ? "code" : "work", t.projectId);
    await work.submit(t.id, b.prompt);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/work/tasks/:id/cancel", async (req) => {
    const u = await requireUser(ctx, req);
    const t = await loadOwnTask(ctx, u, req.params.id);
    await work.cancel(t.id);
    return { ok: true };
  });

  const taskUpdateSchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    pinned: z.boolean().optional(),
    sharedToProject: z.boolean().optional(),
  });
  app.patch<{ Params: { id: string } }>("/api/work/tasks/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const t = await loadOwnTask(ctx, u, req.params.id);
    const b = parse(taskUpdateSchema, req.body);
    if (b.sharedToProject !== undefined && b.sharedToProject !== t.sharedToProject) {
      if (!t.projectId) throw badRequest("Only tasks in a project can be shared to it.");
      if (b.sharedToProject) await getProjectAccess(ctx, u, t.projectId);
      await audit(ctx, {
        actor: u,
        action: b.sharedToProject ? "work.task.shared" : "work.task.unshared",
        workspaceId: t.workspaceId,
        targetType: "work_task",
        targetId: t.id,
        meta: { projectId: t.projectId },
      });
    }
    const [row] = await db.update(workTask).set(b).where(eq(workTask.id, t.id)).returning();
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/work/tasks/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const t = await loadOwnTask(ctx, u, req.params.id);
    await work.remove(t.id);
    await db.delete(workTask).where(eq(workTask.id, t.id));
    return { ok: true };
  });

  /* ───────────── Approvals ───────────── */

  app.get<{ Querystring: { workspaceId?: string } }>("/api/work/approvals", async (req) => {
    const u = await requireUser(ctx, req);
    return db
      .select({
        id: workApproval.id,
        taskId: workApproval.taskId,
        taskTitle: workTask.title,
        toolName: workApproval.toolName,
        reason: workApproval.reason,
        detail: workApproval.detail,
        createdAt: workApproval.createdAt,
      })
      .from(workApproval)
      .innerJoin(workTask, eq(workTask.id, workApproval.taskId))
      .where(
        and(
          eq(workTask.userId, u.id),
          eq(workApproval.status, "pending"),
          req.query.workspaceId ? eq(workTask.workspaceId, req.query.workspaceId) : undefined,
        ),
      )
      .orderBy(asc(workApproval.createdAt));
  });

  const decideSchema = z.object({ decision: z.enum(["approve", "reject"]) });
  app.post<{ Params: { id: string } }>("/api/work/approvals/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const b = parse(decideSchema, req.body);
    const [a] = await db
      .select({ id: workApproval.id, status: workApproval.status, taskId: workApproval.taskId, toolName: workApproval.toolName, userId: workTask.userId, workspaceId: workTask.workspaceId })
      .from(workApproval)
      .innerJoin(workTask, eq(workTask.id, workApproval.taskId))
      .where(eq(workApproval.id, req.params.id));
    if (!a || a.userId !== u.id) throw notFound("Approval not found");
    if (a.status !== "pending") throw new HttpError(409, a.status === "approved" ? "This request was already approved." : "This request was already declined.", "conflict");
    const decided = await work.decide(a.id, b.decision === "approve" ? "approved" : "rejected", u.id);
    if (!decided) throw new HttpError(409, "This request was already answered.", "conflict");
    await audit(ctx, {
      actor: u,
      action: `work.approval.${decided.status}`,
      workspaceId: a.workspaceId,
      targetType: "work_task",
      targetId: a.taskId,
      meta: { tool: a.toolName },
      ip: req.ip,
    });
    return { status: decided.status };
  });

  /* ───────────── Files ───────────── */

  app.get<{ Params: { id: string } }>("/api/work/tasks/:id/files", async (req) => {
    const u = await requireUser(ctx, req);
    const { task: t } = await loadReadableTask(ctx, u, req.params.id);
    const root = await filesRoot(t);
    return root ? listFiles(root) : { files: [], truncated: false };
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string; download?: string } }>("/api/work/tasks/:id/files/content", async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { task: t } = await loadReadableTask(ctx, u, req.params.id);
    const root = await filesRoot(t);
    if (!root) throw notFound("File not found");
    const full = await safePath(root, req.query.path ?? "");
    const s = await stat(full).catch(() => null);
    if (!s?.isFile()) throw notFound("File not found");
    const name = basename(full);
    const inline = req.query.download !== "1" ? INLINE[extname(name).toLowerCase()] : undefined;
    reply.header("content-type", inline ? (inline === "text/plain" ? "text/plain; charset=utf-8" : inline) : "application/octet-stream");
    reply.header("content-disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`);
    reply.header("content-length", String(s.size));
    reply.header("x-content-type-options", "nosniff");
    reply.header("content-security-policy", "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    return reply.send(createReadStream(full));
  });

  /** What a task working in a folder has changed there since before it started (and whether it can be undone). */
  app.get<{ Params: { id: string } }>("/api/work/tasks/:id/changes", async (req) => {
    const u = await requireUser(ctx, req);
    const { task: t } = await loadReadableTask(ctx, u, req.params.id);
    if (!t.workFolder) return { folder: null, snapshot: null, changes: [], total: 0, canUndo: false };
    const snap = t.workSnapshot;
    const root = await filesRoot(t);
    if (!snap?.before || !root) return { folder: t.workFolder, snapshot: snap ? { status: snap.status, note: snap.note } : null, changes: [], total: 0, canUndo: false };
    const { changes, total } = await changesSince(work.taskDir(t.id), root, snap.before);
    const busy = ["queued", "running", "needs_approval"].includes(t.status);
    return { folder: t.workFolder, snapshot: { status: snap.status, note: snap.note }, changes, total, canUndo: !busy && t.userId === u.id && changes.length > 0 };
  });

  /** Put the folder back as it was before the task: everything it changed, or only the given files. */
  app.post<{ Params: { id: string } }>("/api/work/tasks/:id/undo", async (req) => {
    const u = await requireUser(ctx, req);
    const t = await loadOwnTask(ctx, u, req.params.id);
    await requireWorkSection(ctx, u, t.workspaceId);
    const { paths } = parse(z.object({ paths: z.array(z.string().max(1000)).max(1000).optional() }), req.body ?? {});
    if (!t.workFolder || !t.workSnapshot?.before) throw badRequest(msg("There is nothing to undo for this task."));
    if (["queued", "running", "needs_approval"].includes(t.status)) throw new HttpError(409, msg("The task is still working: stop it first, then undo."), "task_busy");
    const root = await filesRoot(t);
    if (!root) throw notFound(msg("Not found"));
    const known = new Set((await changesSince(work.taskDir(t.id), root, t.workSnapshot.before, Number.MAX_SAFE_INTEGER)).changes.map((c) => c.path));
    if (paths?.some((p) => !known.has(p))) throw badRequest(msg("One of those files wasn't changed by this task."));
    const r = await undoChanges(work.taskDir(t.id), root, t.workSnapshot.before, paths);
    await audit(ctx, { actor: u, action: "work.task.undone", workspaceId: t.workspaceId, targetType: "work_task", targetId: t.id, meta: { files: r.restored + r.removed, partial: !!paths } });
    work.pulse(t.id, "files", {});
    return r;
  });

  /** Add a file to the task folder (multipart, one `file`; optional `dir`). */
  app.post<{ Params: { id: string } }>("/api/work/tasks/:id/files", async (req) => {
    const u = await requireUser(ctx, req);
    const t = await loadOwnTask(ctx, u, req.params.id);
    await requireWorkSection(ctx, u, t.workspaceId);
    if (t.codeWorkspaceId) throw badRequest("This task works in a Code workspace: add files there, in the editor.");
    if (t.workFolder) throw badRequest("This task works directly in a folder: put the file there.");
    if (!req.isMultipart()) throw badRequest("Send the file as multipart/form-data");
    let saved: string | null = null;
    for await (const part of req.parts({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })) {
      if (part.type !== "file") continue;
      const data = await part.toBuffer();
      if (part.file.truncated) throw new HttpError(413, "Files can be up to 25 MB.", "too_large");
      const name = basename(part.filename || "upload").replace(/[\\/\0]/g, "_").slice(0, 200) || "upload";
      await work.prepareFolder(t.id, t.runUid);
      const target = join(work.filesDir(t.id), name);
      await writeFile(target, data);
      await work.chownTree(target, t.runUid);
      saved = name;
    }
    if (!saved) throw badRequest("No file was uploaded");
    work.pulse(t.id, "files", {});
    return { path: saved };
  });

  /** Add a file the task made to its project's sources (needs edit access to the project). */
  app.post<{ Params: { id: string } }>("/api/work/tasks/:id/save-to-project", async (req) => {
    const u = await requireUser(ctx, req);
    const { task: t } = await loadReadableTask(ctx, u, req.params.id);
    if (!t.projectId) throw badRequest("This task isn't in a project.");
    const { project: p } = await requireProjectEdit(ctx, u, t.projectId);
    const { path } = parse(z.object({ path: z.string().min(1).max(1000) }), req.body);
    if (path === PROJECT_FOLDER || path.startsWith(`${PROJECT_FOLDER}/`)) throw badRequest("That file is already one of the project's sources.");
    const root = await filesRoot(t);
    if (!root) throw notFound("File not found");
    const full = await safePath(root, path);
    const s = await stat(full).catch(() => null);
    if (!s?.isFile()) throw notFound("File not found");
    if (s.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files can be up to 25 MB.", "too_large");
    if (s.size === 0) throw badRequest("The file is empty");
    const name = basename(full).slice(0, 200);
    if (!isSupported(name)) throw new HttpError(415, `This file type can't be a project source. Sources can be ${SUPPORTED_HINT}.`, "unsupported");
    const data = await readFile(full);
    const storageKey = `${p.workspaceId}/${randomToken(18)}`;
    await ctx.storage.put(storageKey, data);
    const [doc] = await db
      .insert(document)
      .values({ workspaceId: p.workspaceId, projectId: p.id, ownerId: u.id, name, mimeType: INLINE[extname(name).toLowerCase()] ?? "application/octet-stream", sizeBytes: data.length, storageKey })
      .returning();
    await db.insert(projectSource).values({ projectId: p.id, documentId: doc!.id, addedBy: u.id }).onConflictDoNothing();
    await db.update(project).set({ updatedAt: new Date() }).where(eq(project.id, p.id));
    await audit(ctx, { actor: u, action: "project.source_added", workspaceId: p.workspaceId, targetType: "document", targetId: doc!.id, meta: { projectId: p.id, name, fromTask: t.id } });
    await ctx.jobs.document(doc!.id);
    return { id: doc!.id, name };
  });
}

/**
 * A task's live timeline as Server-Sent Events. Replays stored events after `after`, then streams:
 *   event: event  {seq, kind, data, at}   a stored timeline event
 *   event: delta  {text}                  text the model is writing right now
 *   event: files  {}                      the folder may have changed
 */
export async function streamTask(ctx: AppContext, taskId: string, after: number, reply: FastifyReply) {
  const { db, work } = ctx;
  const t = { id: taskId };
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  let last = after;
  const buffered: WorkStreamEvent[] = [];
  let replaying = true;
  const emit = (e: WorkStreamEvent) => {
    if (e.seq === undefined) return send(e.kind, e.data);
    if (e.seq <= last) return;
    last = e.seq;
    send("event", e);
  };
  const unsubscribe = work.subscribe(t.id, (e) => (replaying ? buffered.push(e) : emit(e)));
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
  res.on("close", () => {
    clearInterval(ping);
    unsubscribe();
  });

  const stored = await db
    .select({ seq: workEvent.seq, kind: workEvent.kind, data: workEvent.data, at: workEvent.createdAt })
    .from(workEvent)
    .where(eq(workEvent.taskId, t.id))
    .orderBy(asc(workEvent.seq));
  for (const e of stored) if (e.seq > after) emit({ ...e, at: e.at.toISOString() });
  replaying = false;
  for (const e of buffered.splice(0)) emit(e);
  send("ready", { after: last });
}
