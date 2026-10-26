/**
 * Work AI runner: runs each task's agent runtime, records its timeline and fans events out to
 * whoever is watching. See docs/06-work-ai.md.
 *
 *  - One runtime (DeepSeek Harness process) per active task, in the task's own folder.
 *  - Each person can run a few tasks at once (Admin → Work AI); the rest wait in a queue.
 *  - A finished task keeps its runtime warm for follow-ups, then stops after `idleMinutes`.
 *  - At most `maxRunning` tasks work at once across the organization (each person at most
 *    `maxConcurrentPerUser`); others wait as "queued", follow-ups to warm tasks included. Tasks
 *    waiting for someone's approval don't count. Idle warm runtimes beyond twice that are stopped,
 *    oldest first (a follow-up restarts them from history).
 *    A later follow-up starts a new runtime seeded with the task's history.
 *  - The runtime reaches back to /api/internal/work with a per-task token for models,
 *    approvals and web search; nothing else from this server is visible to it.
 */
import {
  and,
  asc,
  codeWorkspace,
  connector,
  connectorAccount,
  desc,
  eq,
  inArray,
  or,
  organization,
  skill,
  user,
  workspaceMember,
  workApproval,
  workEvent,
  workTask,
  sql,
  type DB,
} from "@aatmiq/db";
import { containerLauncher, createDshEngine, egressToken, removeStaleContainers, type ConnectorSpec, type HarnessEngine, type HarnessEvent, type TaskRuntime } from "@aatmiq/harness";
import { DEFAULT_WORK_SETTINGS, estimateTokens, isOrgAdmin, PRODUCT_NAME, type WorkSettingsValue } from "@aatmiq/shared";
import { librarySkills, shipsFile, type LibraryCategory } from "@aatmiq/skills";
import { getGemSettings, workWebSearchDeps } from "./gem";
import { webSearchReady } from "./web-search";

const CODE_LIBRARY: readonly LibraryCategory[] = ["Software development", "Data", "Apps", "Platform"];

/** What a person sees when the server died mid-task. Saved files stay in the folder either way. */
export function restartNote(saved: string[]): string {
  const base = "The server restarted while this task was running.";
  if (saved.length === 0) return `${base} Send a message to continue.`;
  return `${base} Files already saved are still here: ${saved.join(", ")}. Send a message to continue.`;
}
import { randomBytes } from "node:crypto";
import { appendFile, chmod, chown, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { notify, type AppContext } from "../context";
import { msg } from "../i18n";
import { resolveModel } from "./models";
import { PROJECT_FOLDER, projectFor, projectInstructions, writeProjectFiles } from "./project-work";

export type TaskStatus = (typeof workTask.$inferSelect)["status"];
export interface WorkStreamEvent {
  seq?: number;
  kind: string;
  data: Record<string, unknown>;
  at?: string;
}
type Listener = (e: WorkStreamEvent) => void;

interface Live {
  taskId: string;
  userId: string;
  workspaceId: string;
  token: string;
  runtime: TaskRuntime | null;
  /** A turn is in progress (or the runtime is starting). */
  busy: boolean;
  cancelled: boolean;
  /** Set by the model proxy when it refused a call (quota, model offline), reported at turn end. */
  lastError: string | null;
  lastAnswer: string;
  /** This turn produced something (text or a tool call); a turn that ends without is reported, not "completed". */
  turnOutput?: boolean;
  /** A tool ran this turn, so a sentence that stops halfway is unfinished work, not an answer. */
  usedTools?: boolean;
  /** Times this turn was sent back to keep going (a cut-off answer, steps of its plan still open). */
  continues?: number;
  /** The last nudge followed a round with no tool call: another such round ends the turn. */
  idleNudge?: boolean;
  /** The plan as the agent last wrote it (the runtime keeps it across turns, so it's kept here too). */
  plan: PlanItem[] | null;
  /**
   * The agent worked on this message (wrote its plan or used a tool), so the plan's open steps are
   * this message's business; a question answered in passing leaves an older plan alone.
   */
  planActive?: boolean;
  /** This message wrote code and hasn't run or opened it since; the agent was already told once. */
  untried?: boolean;
  tryNudged?: boolean;
  /** The model's context window, in tokens: long requests and restart history are sized to it. */
  contextWindow?: number;
  /** Where the agent works and as whom (the browser uses the same). */
  workdir?: string;
  runUid?: number;
  /** Container mode: the task may use the egress proxy (Admin → Work AI → Containers → Internet). */
  internet?: boolean;
  /** The runtime runs in a container of its own (Work AI tasks in container mode). */
  inContainer?: boolean;
  /** The connectors its project allows (null: all). */
  connectorIds?: string[] | null;
  /** Waiting for a person's approval: not working, so not counted against `maxRunning`. */
  waiting?: boolean;
  /** A follow-up that arrived while the organization was at `maxRunning`; sent when a slot frees. */
  pending?: string;
  /** When the last turn ended (oldest idle runtimes are stopped first). */
  idleSince?: number;
  idleTimer?: NodeJS.Timeout;
}

export type PlanItem = { content: string; status: string };

const MAX_TOOL_TEXT = 20_000;
/** A restarted runtime gets the earlier conversation in at most this much of its window (as characters, about 4 a token)… */
const SEED_SHARE = 0.5;
const SEED_MAX_CHARS = 48_000;
/** …and a request longer than this share of the window is saved in the folder rather than sent whole. */
const LONG_REQUEST_SHARE = 0.15;
/** Where those requests go, in the working folder (hidden from the Files tab). */
export const REQUEST_FOLDER = ".task";
/** How many times one message may be sent back to keep going before the turn ends as it is. */
const MAX_CONTINUES = 8;
const DEFAULT_WINDOW = 32_768;
const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export async function getWorkSettings(db: DB): Promise<WorkSettingsValue> {
  const [org] = await db.select({ s: organization.workSettings }).from(organization).limit(1);
  return { ...DEFAULT_WORK_SETTINGS, ...(org?.s ?? {}) } as WorkSettingsValue;
}

export function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57).trimEnd()}…` : oneLine || "New task";
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters)` : s);
/**
 * A reply that plainly stops halfway: on a colon, comma or dash ("Renaming:"), or inside a code
 * block. A short answer without a full stop ("Result: 42") is an answer; unfinished work is caught
 * by the plan's open steps instead.
 */
export const answerLeftHanging = (text: string) => {
  const t = text.trim();
  return t.length >= 8 && (/[:,;(\-–—]$/.test(t) || (t.match(/```/g)?.length ?? 0) % 2 === 1);
};

/**
 * What the agent gets instead of a request too long for its context: where the whole text is, and
 * its opening. It reads the rest from the file, again after older steps are condensed.
 */
export function requestPointer(path: string, text: string): string {
  return [
    `The person's request is long (${text.length.toLocaleString("en-US")} characters), so it is saved in \`${path}\` in your working folder.`,
    "Read the whole file first (in parts if it is long), write a todo_write plan that covers every part of it, and read the matching section again before you build each part.",
    "",
    "It begins:",
    "",
    `${text.slice(0, 1500).trimEnd()}…`,
  ].join("\n");
}

/** What the agent is told when it stopped with steps of its plan still open. */
export function openStepsNudge(open: PlanItem[]): string {
  const list = open.slice(0, 12).map((i) => `- ${i.content}`);
  if (open.length > 12) list.push(`- … and ${open.length - 12} more`);
  return [
    "You stopped, but your plan still has steps that are not marked done:",
    ...list,
    "Carry on with the next one now. If a step is already done, mark it completed with todo_write. If one can't be done, say why.",
  ].join("\n");
}

/** The task's error when it stopped with steps of its plan never done. */
export function unfinishedNote(open: PlanItem[], total: number): string {
  const count = open.length;
  const steps = `${open.slice(0, 5).map((i) => i.content).join("; ")}${count > 5 ? "; …" : ""}`;
  return msg(`Stopped with ${count} of ${total} planned steps not done: ${steps}. Send a message (for example "continue") to pick up from there.`);
}

/** After the model sent back nothing in the middle of the work (a glitch of the model server, not an answer). */
const RESUME_NUDGE = "Your last reply came back empty. Continue the task from where you stopped.";

/** File types that are programs or pages: written, they should be run or opened before the work is called done. */
const CODE_FILE = /\.(?:html?|m?js|cjs|jsx|tsx?|py|sh|ps1|go|rs|java|kt|cs|cpp|cc|c|rb|php|sql)$/i;
/** Commands that run, test or check code (not ones that only look at files). */
const RUNS_CODE = /\b(?:node|python3?|py|npm|npx|pnpm|yarn|bun|deno|pytest|jest|vitest|tsc|go|cargo|java|javac|dotnet|ruby|php|bash|sh|make|playwright)\b/;

/** A call that writes a program or page. */
export function writesCode(name: string, args: unknown): boolean {
  const path = (args as { file_path?: unknown } | null)?.file_path;
  return (name === "write" || name === "edit") && typeof path === "string" && CODE_FILE.test(path);
}

/** A call that runs or opens code: a command that runs something, or the browser on a page. */
export function triesCode(name: string, args: unknown): boolean {
  if (name === "browser_open" || name === "browser_press" || name === "browser_click_at") return true;
  const command = (args as { command?: unknown } | null)?.command;
  return (name === "bash" || name === "pwsh") && typeof command === "string" && RUNS_CODE.test(command);
}

/** After code was written and never run or opened. */
const TRY_NUDGE =
  "You wrote code in this task but haven't run or opened it since. Try it now before you finish: run it, or for a web page, app or game open it with browser_open by its path (like game/index.html) and fix any script errors it shows. Then give your summary, saying what you checked.";

const CUT_OFF_NUDGE = "You stopped before the task was finished. Continue from the last step, finish every file that was asked for, and end with a short summary. Do not stop mid-sentence. Write a long file in several smaller parts.";

/** Command output that is mostly control characters (an image or archive printed to the terminal). */
function looksBinary(s: string): boolean {
  const sample = s.slice(0, 4000);
  if (!sample) return false;
  const odd = sample.match(/[\u0000-\u0008\u000e-\u001f\ufffd]/g)?.length ?? 0;
  return odd / sample.length > 0.1;
}

/** Postgres JSON can't hold NUL characters or unpaired surrogates; strip them everywhere. */
function storable(v: unknown): unknown {
  if (typeof v === "string") return v.replace(/\u0000/g, "").replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd");
  if (Array.isArray(v)) return v.map(storable);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, storable(x)]));
  return v;
}

/** Folders a restarted agent doesn't need listed. */
const SUMMARY_SKIP = new Set([".git", "node_modules", "__pycache__", ".venv", ".cache", REQUEST_FOLDER]);

/** Up to `max` files in a working folder with their sizes ("src/game.js (12,345 bytes)"), for a restarted agent. */
export async function folderSummary(root: string, max = 40): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, rel: string, depth: number) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= max) return;
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SUMMARY_SKIP.has(e.name)) continue;
        if (depth >= 3) out.push(`${path}/ (not listed)`);
        else await walk(join(dir, e.name), path, depth + 1);
      } else if (e.isFile()) {
        const size = (await stat(join(dir, e.name)).catch(() => null))?.size ?? 0;
        out.push(`${path} (${size.toLocaleString("en-US")} bytes)`);
      }
    }
  };
  await walk(root, "", 0);
  return out;
}

/** Folder-safe skill slug. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "skill"
  );
}

export class WorkRunner {
  private live = new Map<string, Live>();
  private byToken = new Map<string, string>();
  private listeners = new Map<string, Set<Listener>>();
  private writes = new Map<string, Promise<unknown>>();
  private seqs = new Map<string, number>();
  private approvalWaiters = new Map<string, Set<() => void>>();
  private engine: HarnessEngine;
  /** Container mode: Work AI tasks run here (Aatmiq Code's agent stays in the person's IDE workspace). */
  private containerEngine: HarnessEngine | null = null;
  private stopped = false;

  constructor(
    private ctx: AppContext,
    private opts: { controlUrl: () => string; engine?: HarnessEngine; log?: (msg: string, err?: unknown) => void },
  ) {
    this.engine = opts.engine ?? createDshEngine();
    const c = ctx.cfg.workContainer;
    if (ctx.cfg.workIsolation === "container" && c && !opts.engine) {
      const apiHost = new URL(ctx.cfg.workControlUrl ?? "http://aatmiq-api:4000").hostname;
      this.containerEngine = createDshEngine({
        launcher: containerLauncher({
          docker: c.docker,
          image: c.image,
          network: c.network,
          volume: c.volume,
          proxyUrl: `http://${apiHost}:${ctx.cfg.egressPort ?? 3128}`,
          noProxy: [apiHost],
          limits: { cpus: 2, memoryMb: 4096, pidsLimit: 1024, network: "proxy" },
        }),
      });
    }
  }

  /** Whether a task container may use the egress proxy: its credential, and the setting it started with. */
  proxyAllowed(credential: string): boolean {
    for (const l of this.live.values()) if (l.internet && egressToken(l.token) === credential) return true;
    return false;
  }

  /** "container" when Work AI tasks run in their own Docker containers. */
  get mode(): "container" | "process" {
    return this.containerEngine ? "container" : "process";
  }

  get dir() {
    return resolve(this.ctx.cfg.workDir ?? ".data/work");
  }
  /** Each task runs as its own Unix user (needs root; see docs/06-work-ai.md). */
  get isolated() {
    return this.ctx.cfg.workIsolation !== "off" && process.getuid?.() === 0;
  }

  /**
   * Create the task folder. When isolated, it belongs to the task's user with 0700, so a task can't
   * read anyone else's. The work root is 0755: DSH syncs every parent folder of its home when it
   * stores an image (read_image), which needs read access; listing it shows only task IDs.
   */
  async prepareFolder(taskId: string, uid: number) {
    const dir = this.taskDir(taskId);
    await mkdir(join(dir, "files"), { recursive: true });
    await mkdir(join(dir, "runtime"), { recursive: true });
    if (!this.isolated) return;
    await chmod(this.dir, 0o755);
    await this.chownTree(dir, uid);
    await chmod(dir, 0o700);
  }

  /** Give the task's user its folder contents (for files the server adds: uploads, skills). */
  async chownTree(path: string, uid: number) {
    if (!this.isolated) return;
    await chown(path, uid, uid);
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const p = join(path, e.name);
      if (e.isDirectory()) await this.chownTree(p, uid);
      else await chown(p, uid, uid).catch(() => undefined);
    }
  }
  taskDir(taskId: string) {
    return join(this.dir, taskId);
  }
  filesDir(taskId: string) {
    return join(this.taskDir(taskId), "files");
  }

  /* ───────────── Timeline ───────────── */

  subscribe(taskId: string, fn: Listener): () => void {
    let set = this.listeners.get(taskId);
    if (!set) this.listeners.set(taskId, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.listeners.delete(taskId);
    };
  }

  private broadcast(taskId: string, e: WorkStreamEvent) {
    for (const fn of this.listeners.get(taskId) ?? []) {
      try {
        fn(e);
      } catch {
        /* a broken stream must not break the task */
      }
    }
  }

  /** Live-only event (streamed text): not stored. */
  pulse(taskId: string, kind: string, data: Record<string, unknown>) {
    this.broadcast(taskId, { kind, data });
  }

  /** Store an event in order and send it to watchers. */
  record(taskId: string, kind: string, raw: Record<string, unknown>): Promise<void> {
    const data = storable(raw) as Record<string, unknown>;
    const prev = this.writes.get(taskId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        let seq = this.seqs.get(taskId);
        if (seq === undefined) {
          const [r] = await this.ctx.db.select({ n: sql<number | null>`max(${workEvent.seq})` }).from(workEvent).where(eq(workEvent.taskId, taskId));
          seq = r?.n ?? 0;
        }
        seq += 1;
        this.seqs.set(taskId, seq);
        const [row] = await this.ctx.db.insert(workEvent).values({ taskId, seq, kind, data }).returning({ at: workEvent.createdAt });
        this.broadcast(taskId, { seq, kind, data, at: row?.at.toISOString() });
      });
    this.writes.set(taskId, next);
    // A failed write is logged below; it must never become an unhandled rejection (that ends the process).
    void next
      .finally(() => {
        if (this.writes.get(taskId) === next) this.writes.delete(taskId);
      })
      .catch(() => undefined);
    return next.catch((e) => this.opts.log?.("work: recording an event failed", e));
  }

  private async setStatus(taskId: string, status: TaskStatus, raw: Partial<typeof workTask.$inferInsert> = {}) {
    const extra = storable(raw) as Partial<typeof workTask.$inferInsert>;
    const l = this.live.get(taskId);
    if (l) {
      const wasWaiting = !!l.waiting;
      l.waiting = status === "needs_approval";
      // Someone else may start while this task waits for a person.
      if (l.waiting && !wasWaiting) void this.pump().catch((e) => this.opts.log?.("work: starting a task failed", e));
    }
    const done = status === "completed" || status === "failed" || status === "cancelled";
    await this.ctx.db
      .update(workTask)
      .set({ status, updatedAt: new Date(), ...(done ? { finishedAt: new Date() } : { finishedAt: null }), ...extra })
      .where(eq(workTask.id, taskId));
    await this.record(taskId, "status", { status, ...(extra.error ? { error: extra.error } : {}) });
  }

  /* ───────────── Lifecycle ───────────── */

  /** Queue the task's latest message: start (or continue) its runtime when the person has a free slot. */
  async submit(taskId: string, text: string): Promise<void> {
    await this.record(taskId, "user", { text });
    const l = this.live.get(taskId);
    if (l?.runtime?.alive && !l.cancelled) {
      clearTimeout(l.idleTimer);
      const prompt = await this.briefed(l, text, this.seqs.get(taskId) ?? 0);
      // Mid-turn: the agent reads it as it works. Already waiting for a slot: it goes with the rest.
      if (l.busy || l.pending !== undefined) {
        if (l.pending !== undefined) l.pending = `${l.pending}\n\n${prompt}`;
        else await this.sendTo(l, prompt);
        return;
      }
      if (!this.hasSlot(l.userId, await getWorkSettings(this.ctx.db))) {
        l.pending = prompt;
        await this.setStatus(taskId, "queued", { error: null });
        return;
      }
      await this.resume(l, prompt);
      return;
    }
    await this.setStatus(taskId, "queued", { error: null });
    // Starting a runtime takes a moment; the caller doesn't wait for it.
    void this.pump().catch((e) => this.opts.log?.("work: starting a task failed", e));
  }

  /**
   * Start queued tasks while people have free slots (oldest first). Calls made while a pass is
   * running (for example from a task that failed to start) ask for one more pass instead of waiting,
   * so a pass never waits on itself.
   */
  private pumping = false;
  private pumpAgain = false;
  async pump(): Promise<void> {
    if (this.stopped) return;
    if (this.pumping) {
      this.pumpAgain = true;
      return;
    }
    this.pumping = true;
    try {
      do {
        this.pumpAgain = false;
        const settings = await getWorkSettings(this.ctx.db);
        // The egress proxy (browser, task containers) lets through the internal hosts listed now.
        if (this.ctx.browser) this.ctx.browser.allowedHosts = settings.browserAllowedHosts;
        const queued = await this.ctx.db
          .select({ id: workTask.id, userId: workTask.userId })
          .from(workTask)
          // Drafts (created without a message yet) wait until their first message.
          .where(and(eq(workTask.status, "queued"), sql`exists (select 1 from work_event e where e.task_id = ${workTask.id} and e.kind = 'user')`))
          .orderBy(asc(workTask.updatedAt));
        for (const t of queued) {
          if (this.stopped) return;
          // Oldest first across the organization: when it's full, everyone waits their turn.
          if (this.working() >= settings.maxRunning) break;
          const l = this.live.get(t.id);
          if (l && l.pending === undefined) continue;
          if (!this.hasSlot(t.userId, settings)) continue;
          if (l) await this.resume(l, l.pending!);
          else await this.start(t.id, settings);
        }
        await this.trimWarm(settings);
      } while (this.pumpAgain && !this.stopped);
    } finally {
      this.pumping = false;
    }
  }

  /** Tasks working right now (a turn in progress, not waiting for a person). */
  working(): number {
    let n = 0;
    for (const l of this.live.values()) if (l.busy && !l.waiting) n++;
    return n;
  }

  private hasSlot(userId: string, s: WorkSettingsValue): boolean {
    if (this.working() >= s.maxRunning) return false;
    let mine = 0;
    for (const l of this.live.values()) if (l.userId === userId && l.busy) mine++;
    return mine < s.maxConcurrentPerUser;
  }

  /** Start a new turn on a warm runtime. */
  private async resume(l: Live, prompt: string) {
    clearTimeout(l.idleTimer);
    l.pending = undefined;
    l.busy = true;
    l.lastError = null;
    l.turnOutput = false;
    l.usedTools = false;
    l.continues = 0;
    l.idleNudge = false;
    l.planActive = false;
    l.untried = false;
    l.tryNudged = false;
    // The answer to show is this turn's; the plan stays (the runtime keeps its todo list too).
    l.lastAnswer = "";
    await this.setStatus(l.taskId, "running", { error: null });
    await this.sendTo(l, prompt);
  }

  private async sendTo(l: Live, prompt: string) {
    try {
      await l.runtime!.send(prompt);
    } catch (e) {
      await this.fail(l.taskId, e instanceof Error ? e.message : "The agent didn't accept the message.");
    }
  }

  /** Keep at most twice `maxRunning` idle runtimes in memory; stop the ones idle longest. */
  private async trimWarm(s: WorkSettingsValue) {
    const idle = [...this.live.values()].filter((l) => !l.busy && l.pending === undefined && l.runtime).sort((a, b) => (a.idleSince ?? 0) - (b.idleSince ?? 0));
    const extra = idle.length - Math.max(4, s.maxRunning * 2);
    for (const l of idle.slice(0, Math.max(0, extra))) await this.release(l.taskId);
  }

  /** Calculators are on for the organization and this person has the section (org admins always do). */
  private async calculatorsOn(userId: string, workspaceId: string): Promise<boolean> {
    const g = await getGemSettings(this.ctx.db);
    if (!g.modules.calculators) return false;
    const [u] = await this.ctx.db.select({ orgRole: user.orgRole }).from(user).where(eq(user.id, userId));
    if (u && isOrgAdmin(u.orgRole)) return true;
    const [m] = await this.ctx.db
      .select({ sections: workspaceMember.sections })
      .from(workspaceMember)
      .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)));
    return !!m?.sections.includes("calculators");
  }

  private async start(taskId: string, settings: WorkSettingsValue) {
    const { db, box } = this.ctx;
    const [task] = await db.select().from(workTask).where(eq(workTask.id, taskId));
    if (!task || task.status !== "queued") return;
    const token = randomBytes(32).toString("hex");
    const l: Live = { taskId, userId: task.userId, workspaceId: task.workspaceId, token, runtime: null, busy: true, cancelled: false, lastError: null, lastAnswer: "", plan: null };
    this.live.set(taskId, l);
    this.byToken.set(token, taskId);
    await this.setStatus(taskId, "running");

    try {
      // In Aatmiq Code the agent works in the person's own workspace, as the person's own user.
      const [code] = task.codeWorkspaceId ? await db.select().from(codeWorkspace).where(eq(codeWorkspace.id, task.codeWorkspaceId)) : [];
      const { model: m } = await resolveModel(db, box, task.workspaceId, code ? "code" : "work", task.modelId, task.userId);
      l.contextWindow = m.contextLength ?? DEFAULT_WINDOW;
      if (task.modelId !== m.id) await db.update(workTask).set({ modelId: m.id }).where(eq(workTask.id, taskId));
      const runUid = code ? await this.ctx.code.uidFor(task.userId) : task.runUid;
      const workdir = code ? this.ctx.code.workspacePath(task.userId, code.slug) : this.filesDir(taskId);
      const homeDir = join(this.taskDir(taskId), "runtime");
      l.workdir = workdir;
      l.runUid = this.isolated ? (runUid ?? undefined) : undefined;
      await mkdir(this.dir, { recursive: true });
      // The coding agent gets the library's engineering, data and app skills; Work AI gets them all.
      const skillsDir = await this.writeSkills(task.userId, join(homeDir, "skills"), settings.disabledLibrarySkills, code ? CODE_LIBRARY : undefined);
      await this.prepareFolder(taskId, runUid);
      if (code) await this.ctx.code.prepare(task.userId, workdir);
      const [org] = await db.select({ productName: organization.productName }).from(organization).limit(1);
      // A task in a project (that its owner can still open): its instructions, files and connectors.
      let instructions: string | undefined;
      const proj = task.projectId && !code ? await projectFor(db, task.userId, task.projectId) : null;
      if (proj) {
        const dir = join(workdir, PROJECT_FOLDER);
        const { copied } = await writeProjectFiles(db, this.ctx.storage, proj, dir);
        await this.chownTree(dir, runUid);
        instructions = projectInstructions(proj, copied);
        l.connectorIds = proj.connectorIds ?? null;
      }
      // Container mode: Work AI tasks get their own container; the container is their sandbox.
      const inContainer = !code && !!this.containerEngine;
      const engine = inContainer ? this.containerEngine! : this.engine;
      l.internet = inContainer && settings.containerNetwork === "proxy";
      l.inContainer = inContainer;
      const runtime = await engine.start(
        {
          taskId,
          workdir,
          homeDir,
          model: { key: m.id, name: m.displayName, contextWindow: l.contextWindow, vision: m.vision },
          controlUrl: this.opts.controlUrl(),
          token,
          approvals: settings.approvals,
          askForNetwork: !settings.allowNetwork,
          webSearch: webSearchReady(await workWebSearchDeps(this.ctx)),
          browser: settings.browser && !!this.ctx.browser?.available,
          calculators: await this.calculatorsOn(task.userId, task.workspaceId),
          skillsDir,
          connectors: await this.connectorSpecs(task.userId, token, l.connectorIds ?? null),
          productName: org?.productName ?? PRODUCT_NAME,
          sandbox: inContainer ? "off" : (this.ctx.cfg.workSandbox ?? "on"),
          ...(inContainer
            ? { container: { cpus: settings.containerCpus, memoryMb: settings.containerMemoryMb, pidsLimit: 1024, network: settings.containerNetwork } }
            : {}),
          ...(this.isolated ? { uid: runUid, gid: runUid } : {}),
          ...(code
            ? {
                instructions: [
                  `You are the coding agent inside Aatmiq Code, working in the person's workspace "${code.name}" (your working folder).`,
                  "Read the relevant code before changing it, keep changes focused, follow the project's conventions, and run its tests or build when you change behavior.",
                  "The person sees your edits in their editor and in Source Control; summarize what you changed and why at the end.",
                ].join(" "),
              }
            : instructions
              ? { instructions }
              : {}),
        },
        (e) => void this.onEvent(l, e).catch((err) => this.opts.log?.("work: handling an event failed", err)),
      );
      l.runtime = runtime;
      await db.update(workTask).set({ sessionId: runtime.sessionId }).where(eq(workTask.id, taskId));
      if (l.cancelled) {
        await runtime.stop();
        return;
      }
      await runtime.send(await this.promptWithHistory(l));
    } catch (e) {
      await this.fail(taskId, e instanceof Error ? e.message : "The agent couldn't start.");
    }
  }

  /**
   * The newest message, plus (when an earlier runtime worked on this task) the conversation so far,
   * the plan as it was left and the files in the folder, so a restarted runtime knows what happened.
   * The history is sized to the model's window; long requests in it point to their saved files.
   */
  private async promptWithHistory(l: Live): Promise<string> {
    const events = await this.ctx.db
      .select({ seq: workEvent.seq, kind: workEvent.kind, data: workEvent.data })
      .from(workEvent)
      .where(and(eq(workEvent.taskId, l.taskId), inArray(workEvent.kind, ["user", "assistant", "tool_call", "plan"])))
      .orderBy(asc(workEvent.seq));
    const lastUser = events.findLastIndex((e) => e.kind === "user");
    const prompt = await this.briefed(l, String(events[lastUser]?.data.text ?? ""), events[lastUser]?.seq ?? 0);
    const earlier = events.slice(0, Math.max(0, lastUser));
    if (!earlier.some((e) => e.kind === "assistant")) return prompt;
    const window = l.contextWindow ?? DEFAULT_WINDOW;
    const seedChars = Math.min(SEED_MAX_CHARS, Math.floor(window * SEED_SHARE));
    const lines: string[] = [];
    let plan: PlanItem[] = [];
    for (const e of earlier) {
      if (e.kind === "user") {
        const text = String(e.data.text ?? "");
        const brief = await this.briefed(l, text, e.seq);
        lines.push(brief === text ? `User: ${text}` : `User: (a long request, saved in \`${REQUEST_FOLDER}/request-${e.seq}.md\`) ${clip(text, 300)}`);
      } else if (e.kind === "assistant" && e.data.text) lines.push(`You: ${e.data.text}`);
      else if (e.kind === "tool_call") lines.push(`(you used ${e.data.name}: ${clip(JSON.stringify(e.data.args ?? {}), 300)})`);
      else if (e.kind === "plan") plan = (e.data.items as PlanItem[] | undefined) ?? [];
    }
    let history = lines.join("\n");
    if (history.length > seedChars) history = `…${history.slice(-seedChars)}`;
    const files = l.workdir ? await folderSummary(l.workdir) : [];
    return [
      "This task continues an earlier conversation. Files you created are still in your working folder.",
      "<earlier-conversation>",
      history,
      "</earlier-conversation>",
      ...(plan.length
        ? ["", "Your plan when it stopped (write it again with todo_write, keeping finished steps completed):", ...plan.map((i) => `- [${i.status}] ${i.content}`)]
        : []),
      ...(files.length ? ["", "Files in your working folder now:", ...files] : []),
      "",
      prompt,
    ].join("\n");
  }

  /**
   * A request too long to keep whole in the model's context (over LONG_REQUEST_SHARE of its window)
   * is saved in the working folder; the agent gets where it is and its opening instead.
   */
  private async briefed(l: Live, text: string, seq: number): Promise<string> {
    if (!l.workdir || estimateTokens(text) <= (l.contextWindow ?? DEFAULT_WINDOW) * LONG_REQUEST_SHARE) return text;
    const path = `${REQUEST_FOLDER}/request-${seq}.md`;
    try {
      const dir = join(l.workdir, REQUEST_FOLDER);
      await mkdir(dir, { recursive: true });
      await writeFile(join(l.workdir, path), text);
      if (l.runUid !== undefined) await this.chownTree(dir, l.runUid);
      // In a Code workspace (a git repository) the saved request stays out of the person's changes.
      const exclude = join(l.workdir, ".git", "info", "exclude");
      if ((await stat(join(l.workdir, ".git")).catch(() => null))?.isDirectory()) {
        const have = await readFile(exclude, "utf8").catch(() => "");
        if (!have.split("\n").includes(`/${REQUEST_FOLDER}/`)) {
          await mkdir(join(l.workdir, ".git", "info"), { recursive: true });
          await appendFile(exclude, `${have && !have.endsWith("\n") ? "\n" : ""}/${REQUEST_FOLDER}/\n`);
        }
      }
    } catch (e) {
      this.opts.log?.("work: saving a long request failed", e);
      return text;
    }
    return requestPointer(path, text);
  }

  private async onEvent(l: Live, e: HarnessEvent) {
    const { taskId } = l;
    switch (e.type) {
      case "assistant":
        if (!e.text && e.toolCalls.length === 0) return;
        l.turnOutput = true;
        if (e.text) l.lastAnswer = e.text;
        await this.record(taskId, "assistant", { text: e.text, toolCalls: e.toolCalls });
        return;
      case "tool_call":
        l.turnOutput = true;
        l.usedTools = true;
        l.planActive = true;
        if (writesCode(e.name, e.args)) l.untried = true;
        else if (triesCode(e.name, e.args)) l.untried = false;
        await this.record(taskId, "tool_call", { callId: e.callId, name: e.name, args: e.args as Record<string, unknown> });
        return;
      case "tool_result":
        await this.record(taskId, "tool_result", {
          callId: e.callId,
          text: looksBinary(e.text) ? `(binary output, ${e.text.length.toLocaleString()} characters, not shown)` : clip(e.text, MAX_TOOL_TEXT),
          isError: e.isError,
          ...(e.exitCode !== undefined ? { exitCode: e.exitCode } : {}),
          ...(e.notRun ? { notRun: e.notRun } : {}),
        });
        this.pulse(taskId, "files", {});
        return;
      case "plan":
        l.plan = e.items;
        l.planActive = true;
        await this.record(taskId, "plan", { items: e.items });
        return;
      case "compacted":
        // What the agent goes on from, for people to read (like Claude Code's "continued from" summary).
        await this.record(taskId, "context", { compacted: true, summary: clip(e.summary, MAX_TOOL_TEXT), steps: e.steps, tokens: e.tokens });
        return;
      case "turn_end": {
        if (l.cancelled) return;
        // Not finished yet: a sentence cut off after tools, a reply that hit its length limit, or a
        // plan with open steps. The agent is sent back (a few times, while it keeps making progress).
        const open = l.planActive ? (l.plan ?? []).filter((i) => i.status !== "completed") : [];
        const hanging = !!l.lastAnswer && answerLeftHanging(l.lastAnswer) && (l.usedTools || e.reason === "max-tokens");
        const cutOff = e.reason === "max-tokens" && !!l.turnOutput;
        const planOpen = e.reason === "completed" && open.length > 0 && (!!l.usedTools || !l.idleNudge);
        // An empty reply after real work this round is the model server's glitch: carry on.
        const blank = e.reason !== "completed" && e.reason !== "blocked" && !!l.usedTools && /no content|empty (response|reply)/i.test(e.error ?? "");
        // Code written and never tried: sent back once to try it (a model's "it works" isn't a check).
        const untried = e.reason === "completed" && !!l.untried && !l.tryNudged;
        const nudge = hanging || cutOff ? CUT_OFF_NUDGE : planOpen ? openStepsNudge(open) : blank ? RESUME_NUDGE : untried ? TRY_NUDGE : null;
        if (nudge && (l.continues ?? 0) < MAX_CONTINUES && l.runtime?.alive && !l.lastError) {
          l.continues = (l.continues ?? 0) + 1;
          l.idleNudge = !l.usedTools;
          if (nudge === TRY_NUDGE) l.tryNudged = true;
          l.busy = true;
          l.usedTools = false;
          await this.setStatus(taskId, "running");
          await this.sendTo(l, nudge);
          return;
        }
        l.busy = false;
        l.idleSince = Date.now();
        // completed, blocked (a person said no) and max-tokens all end with an answer to show.
        const ok = e.reason === "completed" || e.reason === "blocked" || e.reason === "max-tokens";
        // The model sent back nothing (even after the proxy asked again): the runtime either calls that
        // an error in its own words or ends the turn as if done. Neither is a finished task.
        const empty = !l.turnOutput && (ok ? e.reason !== "blocked" : /no content|empty (response|reply)/i.test(e.error ?? ""));
        const error =
          l.lastError ??
          (empty
            ? e.reason === "max-tokens"
              ? msg("The model's context window was full, so it couldn't answer. Send the message again; older steps are condensed to make room.")
              : msg("The model sent back an empty answer, so nothing was done. Send the task again, or pick another model.")
            : !ok
              ? (e.error ?? `The agent stopped (${e.reason}).`)
              : // A plan with steps never done is not a finished task, whatever the last sentence says.
                e.reason !== "blocked" && open.length > 0
                ? unfinishedNote(open, l.plan!.length)
                : null);
        await this.setStatus(taskId, error ? "failed" : "completed", { result: l.lastAnswer ? clip(l.lastAnswer, 4000) : null, error });
        await this.notifyDone(l, error);
        this.armIdle(l);
        await this.pump();
        return;
      }
      case "exit": {
        this.live.delete(taskId);
        this.byToken.delete(l.token);
        clearTimeout(l.idleTimer);
        // A follow-up waiting for a slot starts again from history.
        if (l.pending !== undefined && !l.cancelled && !this.stopped) void this.pump().catch((err) => this.opts.log?.("work: starting a task failed", err));
        if (l.cancelled || !l.busy || this.stopped) return;
        await this.fail(taskId, l.lastError ?? `The agent stopped unexpectedly.${e.error ? ` ${e.error.split("\n").at(-1)}` : ""}`);
        return;
      }
      default:
        return;
    }
  }

  private async fail(taskId: string, error: string) {
    const l = this.live.get(taskId);
    if (l) {
      l.busy = false;
      this.live.delete(taskId);
      this.byToken.delete(l.token);
      clearTimeout(l.idleTimer);
      if (l.runtime?.alive) void l.runtime.stop();
    }
    await this.expireApprovals(taskId);
    await this.setStatus(taskId, "failed", { error });
    if (l) await this.notifyDone(l, error);
    await this.pump();
  }

  private async notifyDone(l: Live, error: string | null) {
    const [t] = await this.ctx.db.select({ title: workTask.title }).from(workTask).where(eq(workTask.id, l.taskId));
    await notify(this.ctx.db, [l.userId], {
      type: error ? "work_failed" : "work_done",
      title: error ? (t ? `Task needs attention: ${t.title}` : "A task needs attention") : t ? `Task finished: ${t.title}` : "A task finished",
      body: error ?? (l.lastAnswer ? clip(l.lastAnswer, 200) : undefined),
      link: `/app/work/${l.taskId}`,
    });
  }

  private armIdle(l: Live) {
    clearTimeout(l.idleTimer);
    void getWorkSettings(this.ctx.db).then((s) => {
      if (l.busy || !this.live.has(l.taskId)) return;
      l.idleTimer = setTimeout(() => void this.release(l.taskId), s.idleMinutes * 60_000);
      l.idleTimer.unref();
    });
  }

  /** Stop a task's runtime (it can be restarted from history). */
  async release(taskId: string) {
    const l = this.live.get(taskId);
    if (!l) return;
    this.live.delete(taskId);
    this.byToken.delete(l.token);
    clearTimeout(l.idleTimer);
    l.busy = false;
    await l.runtime?.stop();
    await this.ctx.browser?.close(taskId);
  }

  async cancel(taskId: string) {
    const l = this.live.get(taskId);
    if (l) l.cancelled = true;
    await this.release(taskId);
    await this.expireApprovals(taskId);
    const [t] = await this.ctx.db.select({ status: workTask.status }).from(workTask).where(eq(workTask.id, taskId));
    if (t && t.status !== "completed" && t.status !== "failed" && t.status !== "cancelled") await this.setStatus(taskId, "cancelled");
    await this.pump();
  }

  async remove(taskId: string) {
    await this.cancel(taskId);
    this.seqs.delete(taskId);
    await rm(this.taskDir(taskId), { recursive: true, force: true });
  }

  /** Names already in the task folder, scratch and hidden entries left out. */
  private async savedFileNames(taskId: string): Promise<string[]> {
    const entries = await readdir(this.filesDir(taskId), { withFileTypes: true }).catch(() => []);
    return entries
      .filter((e) => e.name !== "scratch" && !e.name.startsWith("."))
      .map((e) => e.name)
      .slice(0, 8);
  }

  /** After a restart nothing is running: unfinished tasks fail visibly, queued ones start again. */
  async recover() {
    if (this.containerEngine) await removeStaleContainers(this.ctx.cfg.workContainer?.docker);
    const stale = await this.ctx.db
      .select({ id: workTask.id })
      .from(workTask)
      .where(or(eq(workTask.status, "running"), eq(workTask.status, "needs_approval")));
    for (const t of stale) {
      await this.expireApprovals(t.id);
      await this.setStatus(t.id, "failed", { error: restartNote(await this.savedFileNames(t.id)) });
    }
    await this.pump();
  }

  async stopAll() {
    this.stopped = true;
    await Promise.all([...this.live.keys()].map((id) => this.release(id)));
  }

  isLive(taskId: string) {
    return this.live.get(taskId)?.runtime?.alive ?? false;
  }

  /* ───────────── Internal API support ───────────── */

  /** The task a runtime token belongs to (null when unknown or stopped). */
  fromToken(token: string): { taskId: string; userId: string; workspaceId: string } | null {
    const id = this.byToken.get(token);
    const l = id ? this.live.get(id) : undefined;
    return l && !l.cancelled ? { taskId: l.taskId, userId: l.userId, workspaceId: l.workspaceId } : null;
  }

  /** Whether a running task may reach the internet: always in process mode; in a container, as Admin → Work AI → Containers says. */
  internetAllowed(taskId: string): boolean {
    const l = this.live.get(taskId);
    return !!l && (!l.inContainer || !!l.internet);
  }

  /** Whether a running task may use a connector (its project may allow only some). */
  connectorAllowed(taskId: string, connectorId: string): boolean {
    const only = this.live.get(taskId)?.connectorIds;
    return !only || only.includes(connectorId);
  }

  /** Where a running task's browser lives: its folder, a private profile, and its Unix user. */
  browserTarget(taskId: string): { workdir: string; profileDir: string; uid?: number } {
    const l = this.live.get(taskId);
    if (!l?.workdir) throw new Error("This task isn't running.");
    return { workdir: l.workdir, profileDir: join(this.taskDir(taskId), "runtime", "browser"), ...(l.runUid !== undefined ? { uid: l.runUid } : {}) };
  }

  reportError(taskId: string, message: string) {
    const l = this.live.get(taskId);
    if (l) l.lastError = message;
  }

  /** A later model call worked, so an earlier failure the runtime retried past doesn't fail the task. */
  clearError(taskId: string) {
    const l = this.live.get(taskId);
    if (l) l.lastError = null;
  }

  async requestApproval(taskId: string, a: { callId: string | null; toolName: string; reason: string | null }) {
    const { db } = this.ctx;
    // The tool call itself may still be on its way to the timeline.
    await this.writes.get(taskId)?.catch(() => undefined);
    let detail: Record<string, unknown> | null = null;
    if (a.callId) {
      const calls = await db
        .select({ data: workEvent.data })
        .from(workEvent)
        .where(and(eq(workEvent.taskId, taskId), eq(workEvent.kind, "tool_call")))
        .orderBy(desc(workEvent.seq))
        .limit(20);
      detail = (calls.find((c) => c.data.callId === a.callId)?.data.args as Record<string, unknown> | undefined) ?? null;
    }
    const [row] = await db
      .insert(workApproval)
      .values({ taskId, callId: a.callId, toolName: a.toolName, reason: a.reason, detail })
      .returning();
    await this.setStatus(taskId, "needs_approval");
    await this.record(taskId, "approval", { id: row!.id, callId: a.callId, toolName: a.toolName, reason: a.reason, detail, status: "pending" });
    const l = this.live.get(taskId);
    const [t] = await db.select({ title: workTask.title }).from(workTask).where(eq(workTask.id, taskId));
    if (l) {
      await notify(db, [l.userId], {
        type: "work_approval",
        title: t ? `Approval needed: ${t.title}` : "A task needs your approval",
        body: a.reason ?? `The agent wants to use ${a.toolName}.`,
        link: `/app/work/${taskId}`,
      });
    }
    return row!;
  }

  /** Wait up to `seconds` for a decision. */
  async waitForApproval(taskId: string, id: string, seconds: number) {
    const { db } = this.ctx;
    const read = async () => (await db.select().from(workApproval).where(and(eq(workApproval.id, id), eq(workApproval.taskId, taskId))))[0];
    let a = await read();
    if (!a) return null;
    if (a.status === "pending" && Date.now() - a.createdAt.getTime() > APPROVAL_TTL_MS) {
      await this.decide(a.id, "expired", null);
      return "expired" as const;
    }
    if (a.status === "pending" && seconds > 0) {
      await new Promise<void>((resolveWait) => {
        let set = this.approvalWaiters.get(id);
        if (!set) this.approvalWaiters.set(id, (set = new Set()));
        const done = () => {
          clearTimeout(timer);
          set!.delete(done);
          resolveWait();
        };
        const timer = setTimeout(done, seconds * 1000);
        set.add(done);
      });
      a = await read();
    }
    return a?.status ?? null;
  }

  async decide(approvalId: string, status: "approved" | "rejected" | "expired", userId: string | null) {
    const { db } = this.ctx;
    const [a] = await db
      .update(workApproval)
      .set({ status, decidedBy: userId, decidedAt: new Date() })
      .where(and(eq(workApproval.id, approvalId), eq(workApproval.status, "pending")))
      .returning();
    if (!a) return null;
    for (const w of [...(this.approvalWaiters.get(approvalId) ?? [])]) w();
    this.approvalWaiters.delete(approvalId);
    await this.record(a.taskId, "approval", { id: a.id, callId: a.callId, toolName: a.toolName, reason: a.reason, detail: a.detail, status });
    const pending = await db
      .select({ id: workApproval.id })
      .from(workApproval)
      .where(and(eq(workApproval.taskId, a.taskId), eq(workApproval.status, "pending")));
    const l = this.live.get(a.taskId);
    if (pending.length === 0 && l?.busy && !l.cancelled) await this.setStatus(a.taskId, "running");
    return a;
  }

  private async expireApprovals(taskId: string) {
    const pending = await this.ctx.db
      .select({ id: workApproval.id })
      .from(workApproval)
      .where(and(eq(workApproval.taskId, taskId), eq(workApproval.status, "pending")));
    for (const p of pending) await this.decide(p.id, "expired", null);
  }

  /* ───────────── Task setup ───────────── */

  /**
   * Org skills, the person's own, and the enabled built-in library, as SKILL.md folders the runtime
   * discovers. A skill the organization or person wrote wins over a library skill of the same name.
   */
  private async writeSkills(userId: string, dir: string, disabledLibrary: string[], categories?: readonly LibraryCategory[]): Promise<string | null> {
    const rows = await this.ctx.db
      .select()
      .from(skill)
      .where(and(eq(skill.enabled, true), or(eq(skill.scope, "org"), and(eq(skill.scope, "personal"), eq(skill.ownerId, userId)))));
    await rm(dir, { recursive: true, force: true });
    const off = new Set(disabledLibrary);
    const library = librarySkills().filter((s) => !off.has(s.slug) && (!categories || categories.includes(s.category)));
    if (rows.length === 0 && library.length === 0) return null;
    await mkdir(dir, { recursive: true });
    const used = new Set<string>();
    for (const s of rows) {
      let slug = slugify(s.slug || s.name);
      while (used.has(slug)) slug = `${slug}-${used.size}`;
      used.add(slug);
      await mkdir(join(dir, slug), { recursive: true });
      const front = ["---", `name: ${slug}`, `description: ${JSON.stringify(s.description.replace(/\s+/g, " "))}`, "---", ""].join("\n");
      await writeFile(join(dir, slug, "SKILL.md"), `${front}# ${s.name}\n\n${s.body}\n`);
    }
    for (const s of library) {
      if (used.has(s.slug)) continue;
      used.add(s.slug);
      await cp(s.dir, join(dir, s.slug), { recursive: true, filter: (src) => shipsFile(src.slice(s.dir.length)) });
    }
    return dir;
  }

  /**
   * The connectors this person's task can use: open and shared-token ones, plus OAuth ones they've
   * connected. All go through Aatmiq's MCP proxy with the task token, which adds the credentials.
   */
  private async connectorSpecs(userId: string, token: string, only: string[] | null): Promise<ConnectorSpec[]> {
    const rows = (await this.ctx.db.select().from(connector).where(eq(connector.enabled, true))).filter((c) => !only || only.includes(c.id));
    const accounts = new Map(
      (
        await this.ctx.db
          .select()
          .from(connectorAccount)
          .where(and(eq(connectorAccount.userId, userId), eq(connectorAccount.status, "ok")))
      ).map((a) => [a.connectorId, a]),
    );
    return rows
      .filter((c) => c.auth !== "oauth" || accounts.has(c.id))
      .map((c) => ({
        name: c.name,
        displayName: c.displayName,
        account: accounts.get(c.id)?.label ?? null,
        url: `${this.opts.controlUrl()}/mcp/${encodeURIComponent(c.name)}`,
        headers: { authorization: `Bearer ${token}` },
        approveTools: c.approveTools
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }));
  }

}
