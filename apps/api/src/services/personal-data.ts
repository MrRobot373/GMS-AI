/**
 * Personal data (DPDP Act, GDPR): everything Aatmiq holds about one person, as a ZIP they or an
 * admin can download, and erasing a person with their data. See docs/12-personal-data.md.
 */
import {
  account,
  and,
  asc,
  auditLog,
  calculatorFavorite,
  calculatorHistory,
  chat,
  codeWorkspace,
  connector,
  connectorAccount,
  course,
  courseLesson,
  courseLessonState,
  document,
  eq,
  inArray,
  invitation,
  knowledgeQuery,
  message,
  notification,
  or,
  project,
  projectMember,
  session,
  skill,
  sql,
  tokenRequest,
  usageEvent,
  user,
  userGroup,
  userGroupMember,
  videoFeedback,
  workEvent,
  workSchedule,
  workspace,
  workspaceMember,
  workTask,
} from "@aatmiq/db";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { PassThrough } from "node:stream";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { audit, type AppContext, type SessionUser } from "../context";
import { badRequest, forbidden, notFound } from "../errors";
import { chatToMarkdown, type ExportMessage } from "./export";

/** Task output files in an export, at most (the rest are listed as left out). */
export const EXPORT_TASK_FILES_LIMIT = 500 * 1024 * 1024;

/** Already compressed: stored as they are. */
const COMPRESSED = /\.(zip|gz|tgz|bz2|xz|7z|rar|png|jpe?g|gif|webp|mp4|mov|mp3|m4a|docx|xlsx|pptx|pdf)$/i;

const safeName = (s: string, fallback: string) =>
  s.replace(/[^\p{L}\p{N} ._()-]+/gu, "").trim().replace(/\s+/g, " ").slice(0, 80) || fallback;

/** A ZIP written as it goes, waiting for the reader when it falls behind. */
class ZipStream {
  readonly out = new PassThrough();
  private zip = new Zip((err, chunk, final) => {
    if (err) return void this.out.destroy(err);
    this.out.write(chunk);
    if (final) this.out.end();
  });
  private names = new Set<string>();

  /** A unique path inside the archive. */
  private unique(path: string) {
    let p = path;
    for (let i = 2; this.names.has(p); i++) p = path.replace(/(\.[^./]+)?$/, ` (${i})$1`);
    this.names.add(p);
    return p;
  }
  private async drained() {
    if (this.out.writableNeedDrain) await once(this.out, "drain");
  }
  async add(path: string, data: string | Buffer) {
    const name = this.unique(path);
    const f = COMPRESSED.test(name) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    this.zip.add(f);
    f.push(typeof data === "string" ? Buffer.from(data) : data, true);
    await this.drained();
  }
  json(path: string, value: unknown) {
    return this.add(path, JSON.stringify(value, null, 2));
  }
  async file(path: string, from: string) {
    const name = this.unique(path);
    const f = COMPRESSED.test(name) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    this.zip.add(f);
    for await (const chunk of createReadStream(from)) {
      f.push(chunk as Buffer);
      await this.drained();
    }
    f.push(new Uint8Array(0), true);
  }
  end() {
    this.zip.end();
  }
}

async function listFiles(root: string): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out.push({ path: full, size: (await stat(full)).size });
    }
  };
  await walk(root);
  return out;
}

/** The person's data as a ZIP stream. Secrets (passwords, tokens, keys) are never included. */
export async function exportPerson(ctx: AppContext, userId: string): Promise<{ stream: PassThrough; fileName: string }> {
  const { db } = ctx;
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) throw notFound("User not found");
  const zip = new ZipStream();
  const day = new Date().toISOString().slice(0, 10);
  const fileName = `aatmiq-data-${safeName(u.name, "person").replace(/ /g, "-").toLowerCase()}-${day}.zip`;

  void (async () => {
    const left: string[] = [];
    // Profile, sign-ins and memberships.
    const accounts = await db.select({ providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, userId));
    const sessions = await db
      .select({ createdAt: session.createdAt, expiresAt: session.expiresAt, ipAddress: session.ipAddress, userAgent: session.userAgent })
      .from(session)
      .where(eq(session.userId, userId));
    const workspaces = await db
      .select({ workspace: workspace.name, role: workspaceMember.role, sections: workspaceMember.sections })
      .from(workspaceMember)
      .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
      .where(eq(workspaceMember.userId, userId));
    const groups = await db.select({ group: userGroup.name }).from(userGroupMember).innerJoin(userGroup, eq(userGroup.id, userGroupMember.groupId)).where(eq(userGroupMember.userId, userId));
    await zip.json("profile.json", {
      exportedAt: new Date().toISOString(),
      person: {
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        jobTitle: u.jobTitle,
        customInstructions: u.customInstructions,
        role: u.orgRole,
        status: u.status,
        twoStepSignIn: u.twoFactorEnabled,
        // Kept up to date from the company's directory (SCIM or LDAP), with its id for them.
        directory: u.directory ? { kind: u.directory, id: u.externalId } : null,
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
      },
      signInMethods: accounts.map((a) => ({ method: a.providerId === "credential" ? "password" : a.providerId, since: a.createdAt })),
      sessions,
      workspaces,
      groups: groups.map((g) => g.group),
    });

    // Chats: every message of every branch, as JSON and readable Markdown.
    const chats = await db.select().from(chat).where(eq(chat.userId, userId)).orderBy(asc(chat.createdAt));
    for (const [i, c] of chats.entries()) {
      const msgs = await db.select().from(message).where(eq(message.chatId, c.id)).orderBy(asc(message.createdAt));
      const base = `chats/${String(i + 1).padStart(3, "0")} ${safeName(c.title, "Chat")}`;
      await zip.json(`${base}.json`, {
        title: c.title,
        createdAt: c.createdAt,
        temporary: c.temporary,
        messages: msgs.map((m) => ({ id: m.id, parentId: m.parentId, role: m.role, content: m.content, error: m.error, citations: m.citations, web: m.web, attachments: m.attachments, createdAt: m.createdAt })),
      });
      const shown: ExportMessage[] = msgs
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", author: m.role === "user" ? u.name : "Assistant", content: m.content, citations: m.citations }));
      await zip.add(`${base}.md`, chatToMarkdown({ title: c.title, subtitle: `${c.createdAt.toISOString().slice(0, 10)} · all messages, every version`, messages: shown }));
    }

    // Documents they uploaded, as the original files.
    const docs = await db.select().from(document).where(eq(document.ownerId, userId)).orderBy(asc(document.createdAt));
    await zip.json(
      "documents.json",
      docs.map((d) => ({ name: d.name, kind: d.kind, mimeType: d.mimeType, sizeBytes: d.sizeBytes, scope: d.scope, label: d.label, createdAt: d.createdAt })),
    );
    for (const d of docs) {
      // Notes and saved answers are Markdown without an extension in their name.
      const name = safeName(d.name, "document") + (d.mimeType === "text/markdown" && !/\.\w{1,5}$/.test(d.name) ? ".md" : "");
      try {
        await zip.add(`documents/${name}`, await ctx.storage.get(d.storageKey));
      } catch {
        left.push(`documents/${d.name} (the file is missing from storage)`);
      }
    }

    // Projects they own, and the ones they're a member of.
    const owned = await db.select().from(project).where(eq(project.ownerId, userId));
    const memberOf = await db.select({ name: project.name, role: projectMember.role }).from(projectMember).innerJoin(project, eq(project.id, projectMember.projectId)).where(eq(projectMember.userId, userId));
    await zip.json("projects.json", {
      owned: owned.map((p) => ({ name: p.name, description: p.description, instructions: p.instructions, visibility: p.visibility, createdAt: p.createdAt })),
      memberOf,
    });

    // Work AI: tasks with their timelines and the files they made.
    const tasks = await db.select().from(workTask).where(eq(workTask.userId, userId)).orderBy(asc(workTask.createdAt));
    let budget = EXPORT_TASK_FILES_LIMIT;
    for (const [i, t] of tasks.entries()) {
      const base = `work/${String(i + 1).padStart(3, "0")} ${safeName(t.title, "Task")}`;
      const events = await db.select({ kind: workEvent.kind, data: workEvent.data, at: workEvent.createdAt }).from(workEvent).where(eq(workEvent.taskId, t.id)).orderBy(asc(workEvent.seq));
      await zip.json(`${base}/task.json`, { title: t.title, status: t.status, result: t.result, error: t.error, routing: t.routing, createdAt: t.createdAt, finishedAt: t.finishedAt, events });
      if (t.codeWorkspaceId) continue; // works in a code workspace: the code is the person's own folder
      const dir = ctx.work.filesDir(t.id);
      for (const f of await listFiles(dir)) {
        const rel = relative(dir, f.path);
        if (f.size > budget) {
          left.push(`${base}/files/${rel} (${Math.ceil(f.size / 1048576)} MB: over the export's file limit)`);
          continue;
        }
        budget -= f.size;
        await zip.file(`${base}/files/${rel}`, f.path);
      }
    }

    const [skills, schedules, connections, codeSpaces, requests, notes2, usage, events] = await Promise.all([
      db.select({ name: skill.name, description: skill.description, body: skill.body, scope: skill.scope, enabled: skill.enabled }).from(skill).where(eq(skill.ownerId, userId)),
      db.select({ name: workSchedule.name, prompt: workSchedule.prompt, cron: workSchedule.cron, timezone: workSchedule.timezone, enabled: workSchedule.enabled }).from(workSchedule).where(eq(workSchedule.userId, userId)),
      db
        .select({ app: connector.name, label: connectorAccount.label, status: connectorAccount.status, scope: connectorAccount.scope, connectedAt: connectorAccount.createdAt })
        .from(connectorAccount)
        .innerJoin(connector, eq(connector.id, connectorAccount.connectorId))
        .where(eq(connectorAccount.userId, userId)),
      db.select({ name: codeWorkspace.name, gitUrl: codeWorkspace.gitUrl, createdAt: codeWorkspace.createdAt, lastOpenedAt: codeWorkspace.lastOpenedAt }).from(codeWorkspace).where(eq(codeWorkspace.userId, userId)),
      db.select({ amount: tokenRequest.amount, reason: tokenRequest.reason, status: tokenRequest.status, note: tokenRequest.note, createdAt: tokenRequest.createdAt }).from(tokenRequest).where(eq(tokenRequest.userId, userId)),
      db.select({ type: notification.type, title: notification.title, body: notification.body, readAt: notification.readAt, createdAt: notification.createdAt }).from(notification).where(eq(notification.userId, userId)),
      db
        .select({ at: usageEvent.createdAt, section: usageEvent.section, input: usageEvent.inputTokens, output: usageEvent.outputTokens, status: usageEvent.status })
        .from(usageEvent)
        .where(eq(usageEvent.userId, userId))
        .orderBy(asc(usageEvent.createdAt)),
      db
        .select({ at: auditLog.createdAt, action: auditLog.action, targetType: auditLog.targetType, ip: auditLog.ip, meta: auditLog.meta })
        .from(auditLog)
        .where(or(eq(auditLog.actorId, userId), and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, userId))))
        .orderBy(asc(auditLog.createdAt)),
    ]);
    // GEM AI: courses with every lesson version, calculator history and favorites, knowledge questions.
    const courses = await db.select().from(course).where(eq(course.userId, userId)).orderBy(asc(course.createdAt));
    for (const c of courses) {
      const lessons = await db.select().from(courseLesson).where(eq(courseLesson.courseId, c.id)).orderBy(asc(courseLesson.ordinal), asc(courseLesson.version));
      const progress = await db.select().from(courseLessonState).where(and(eq(courseLessonState.courseId, c.id), eq(courseLessonState.userId, userId)));
      await zip.json(`learning/${c.createdAt.toISOString().slice(0, 10)} ${safeName(c.title, "course")} ${c.id.slice(0, 8)}.json`, {
        topic: c.topic,
        level: c.level,
        title: c.title,
        tags: c.tags,
        outline: c.outline,
        createdAt: c.createdAt,
        lessons: lessons.map((l) => ({ ordinal: l.ordinal, version: l.version, current: l.current, title: l.title, status: l.status, content: l.content, verification: l.verification, videos: l.videos, createdAt: l.createdAt })),
        progress,
      });
    }
    // Lesson video ratings, with the lesson each was given in (when it still exists).
    await zip.json(
      "learning/video-ratings.json",
      await db
        .select({ videoId: videoFeedback.videoId, rating: videoFeedback.rating, reason: videoFeedback.reason, lesson: courseLesson.title, createdAt: videoFeedback.createdAt, updatedAt: videoFeedback.updatedAt })
        .from(videoFeedback)
        .leftJoin(courseLesson, eq(courseLesson.id, videoFeedback.lessonId))
        .where(eq(videoFeedback.userId, userId))
        .orderBy(asc(videoFeedback.createdAt)),
    );
    await zip.json("calculators/history.json", await db.select().from(calculatorHistory).where(eq(calculatorHistory.userId, userId)).orderBy(asc(calculatorHistory.createdAt)));
    await zip.json("calculators/favorites.json", await db.select().from(calculatorFavorite).where(eq(calculatorFavorite.userId, userId)));
    await zip.json(
      "knowledge-questions.json",
      await db
        .select({ project: project.name, question: knowledgeQuery.question, answer: knowledgeQuery.answer, status: knowledgeQuery.status, citations: knowledgeQuery.citations, createdAt: knowledgeQuery.createdAt })
        .from(knowledgeQuery)
        .innerJoin(project, eq(project.id, knowledgeQuery.projectId))
        .where(eq(knowledgeQuery.userId, userId))
        .orderBy(asc(knowledgeQuery.createdAt)),
    );
    await zip.json("skills.json", skills);
    await zip.json("schedules.json", schedules);
    await zip.json("connected-apps.json", connections);
    await zip.json("code-workspaces.json", codeSpaces);
    await zip.json("token-requests.json", requests);
    await zip.json("notifications.json", notes2);
    await zip.add("usage.csv", ["time,section,input_tokens,output_tokens,status", ...usage.map((r) => `${r.at.toISOString()},${r.section},${r.input},${r.output},${r.status}`)].join("\n"));
    await zip.json("activity-log.json", events);
    await zip.add(
      "README.txt",
      [
        `Everything ${ctx.cfg.appUrl} holds about ${u.name} <${u.email}>, exported ${new Date().toISOString()}.`,
        "",
        "profile.json          who you are, how you sign in, your sessions (devices), workspaces and groups",
        "chats/               every chat, every message and version, as JSON and readable Markdown",
        "documents/           the files you uploaded; documents.json lists them",
        "projects.json         projects you own and the ones you're a member of",
        "work/                Work AI tasks: the timeline of each and the files it made",
        "learning/            your courses with every lesson version, and your ratings of lesson videos",
        "skills.json, schedules.json, connected-apps.json, code-workspaces.json",
        "token-requests.json, notifications.json",
        "usage.csv             each model call: when, which section, tokens",
        "activity-log.json     what the activity log recorded about you or by you",
        "",
        "Not included: passwords, two-step sign-in secrets and app tokens (never exported), and the",
        "code in your code workspaces (it's in your own folders: download it from the editor).",
        ...(left.length ? ["", "Left out:", ...left.map((l) => `  ${l}`)] : []),
      ].join("\n"),
    );
    zip.end();
  })().catch((e) => zip.out.destroy(e instanceof Error ? e : new Error(String(e))));

  return { stream: zip.out, fileName };
}

/** What erasing a person did. */
export interface Erased {
  chats: number;
  documentsDeleted: number;
  documentsTransferred: number;
  projectsDeleted: number;
  projectsTransferred: number;
  tasks: number;
  codeWorkspaces: number;
}

/**
 * Erase a person: their account and everything they made. Shared things (projects, documents
 * shared with a workspace, organization skills) go to `transferTo` when given; without it, shared
 * projects and documents are deleted too, and organization skills go to the admin who erases.
 * Usage stays in the totals without a name; the activity log keeps its entries, with the person
 * replaced by a pseudonym.
 */
export async function erasePerson(ctx: AppContext, actor: SessionUser, targetId: string, opts: { transferTo?: string | null }): Promise<Erased> {
  const { db } = ctx;
  const [target] = await db.select().from(user).where(eq(user.id, targetId));
  if (!target) throw notFound("User not found");
  if (target.orgRole === "owner") throw forbidden("The owner can't be erased. Make someone else the owner first.");
  if (target.id === actor.id) throw forbidden("You can't erase yourself. Ask another admin.");
  let heir: { id: string; name: string } | null = null;
  if (opts.transferTo) {
    if (opts.transferTo === target.id) throw badRequest("Pick someone else to receive the shared items.");
    const [h] = await db.select({ id: user.id, name: user.name, status: user.status }).from(user).where(eq(user.id, opts.transferTo));
    if (!h || h.status !== "active") throw badRequest("Pick an active person to receive the shared items.");
    heir = h;
  }

  // Nothing of theirs keeps running.
  const tasks = await db.select({ id: workTask.id }).from(workTask).where(eq(workTask.userId, target.id));
  for (const t of tasks) await ctx.work.remove(t.id);
  const codeSpaces = await db.select({ id: codeWorkspace.id }).from(codeWorkspace).where(eq(codeWorkspace.userId, target.id));
  await ctx.code.stop(target.id).catch(() => {});
  await rm(ctx.code.home(target.id), { recursive: true, force: true });

  // Projects: to the heir, or deleted with their own files.
  const projects = await db.select({ id: project.id }).from(project).where(eq(project.ownerId, target.id));
  const projectIds = projects.map((p) => p.id);
  if (heir && projectIds.length) {
    await db.update(project).set({ ownerId: heir.id }).where(inArray(project.id, projectIds));
    await db.delete(projectMember).where(and(inArray(projectMember.projectId, projectIds), eq(projectMember.userId, heir.id)));
  }

  // Documents: shared ones (and those of transferred projects) to the heir; the rest deleted.
  const docs = await db.select({ id: document.id, key: document.storageKey, scope: document.scope, projectId: document.projectId }).from(document).where(eq(document.ownerId, target.id));
  const keep = heir ? docs.filter((d) => d.scope === "workspace" || (d.projectId && projectIds.includes(d.projectId))) : [];
  const drop = docs.filter((d) => !keep.includes(d));
  if (keep.length) await db.update(document).set({ ownerId: heir!.id }).where(inArray(document.id, keep.map((d) => d.id)));
  if (!heir && projectIds.length) {
    // Project-only files of deleted projects belong to the project, whoever uploaded them.
    const projectFiles = await db.select({ key: document.storageKey }).from(document).where(inArray(document.projectId, projectIds));
    await db.delete(project).where(inArray(project.id, projectIds));
    await Promise.all(projectFiles.map((f) => ctx.storage.remove(f.key).catch(() => {})));
  }
  if (drop.length) {
    await db.delete(document).where(inArray(document.id, drop.map((d) => d.id)));
    await Promise.all(drop.map((d) => ctx.storage.remove(d.key).catch(() => {})));
  }

  // Organization skills stay with the organization.
  await db.update(skill).set({ ownerId: heir?.id ?? actor.id }).where(and(eq(skill.ownerId, target.id), eq(skill.scope, "org")));

  const [{ chats }] = (await db.select({ chats: sql<number>`count(*)::int` }).from(chat).where(eq(chat.userId, target.id))) as [{ chats: number }];

  // The activity log keeps what happened, not who: a pseudonym instead of the email and id.
  const pseudonym = `erased-${createHash("sha256").update(target.id).digest("hex").slice(0, 12)}`;
  const email = target.email.toLowerCase();
  await db.update(auditLog).set({ actorId: null, actorEmail: pseudonym }).where(eq(auditLog.actorId, target.id));
  await db.execute(sql`
    update audit_log set meta = replace(replace(meta::text, ${target.email}, ${pseudonym}), ${email}, ${pseudonym})::jsonb
    where meta::text ilike ${"%" + email + "%"}`);
  await db.delete(invitation).where(eq(sql`lower(${invitation.email})`, email));

  // The account and everything that hangs off it: sessions, sign-in methods, memberships, chats,
  // tasks, schedules, personal skills, connected apps, code workspaces, notifications. Usage
  // events lose the name (the totals stay right).
  await db.delete(user).where(eq(user.id, target.id));

  const result: Erased = {
    chats,
    documentsDeleted: drop.length,
    documentsTransferred: keep.length,
    projectsDeleted: heir ? 0 : projectIds.length,
    projectsTransferred: heir ? projectIds.length : 0,
    tasks: tasks.length,
    codeWorkspaces: codeSpaces.length,
  };
  await audit(ctx, { actor, action: "user.erased", targetType: "user", targetId: target.id, meta: { person: pseudonym, transferredTo: heir?.name ?? null, ...result } });
  return result;
}
