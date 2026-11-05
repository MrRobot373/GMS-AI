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
  type WorkVerification,
} from "@aatmiq/db";
import { SUPER_AI_MIN_WINDOW, containerLauncher, createClaudeEngine, createDshEngine, egressToken, removeStaleContainers, type ConnectorSpec, type HarnessEngine, type HarnessEvent, type TaskRuntime } from "@aatmiq/harness";
import { DEFAULT_WORK_SETTINGS, estimateTokens, isOrgAdmin, PRODUCT_NAME, type WorkSettingsValue } from "@aatmiq/shared";
import { librarySkills, shipsFile, type LibraryCategory } from "@aatmiq/skills";
import { getGemSettings, workWebSearchDeps } from "./gem";
import { runChecks, type CheckResult } from "./work-checks";
import { gitSnapshot, loadProgress, loadState, PROGRESS_FILE, progressEntry, saveState, STAGE_ROUNDS, stagePrompt } from "./work-stages";
import {
  allGood,
  feedbackText,
  MAX_REVIEW_ROUNDS,
  mergeResults,
  parseReport,
  REVIEW_FILE,
  REVIEW_TIMEOUT_MS,
  reviewerPrompt,
  verificationLine,
  verificationOf,
  type ReviewReport,
} from "./work-review";
import { ACCEPTANCE_FILE, acceptanceBrief, checklistText, CHECKLIST_RULES, isBuildRequest, loadAcceptance, planAcceptance, saveAcceptance, type Acceptance } from "./work-spec";
import { webSearchReady } from "./web-search";

const CODE_LIBRARY: readonly LibraryCategory[] = ["Software development", "Data", "Apps", "Platform"];

/** What a person sees when the server died mid-task. Saved files stay in the folder either way. */
export function restartNote(saved: string[]): string {
  const base = "The server restarted while this task was running.";
  if (saved.length === 0) return `${base} Send a message to continue.`;
  return `${base} Files already saved are still here: ${saved.join(", ")}. Send a message to continue.`;
}
import { randomBytes } from "node:crypto";
import { appendFile, chmod, chown, cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { notify, type AppContext } from "../context";
import { msg } from "../i18n";
import { availableModels, resolveModel } from "./models";
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
  /** This message wrote code at all: it's checked against the request before it ends. */
  wroteCode?: boolean;
  /** The agent was already sent back once to check its work against the request. */
  verifyNudged?: boolean;
  /** The model's context window, in tokens: long requests and restart history are sized to it. */
  contextWindow?: number;
  /** What the request asked for as checkable items (build tasks; .task/acceptance.json). */
  acceptance?: Acceptance | null;
  /** A reviewer task's builder task (the reviewer works on a copy of its folder). */
  parentId?: string | null;
  /** The independent review is running: the builder waits (and doesn't hold a slot). */
  reviewing?: boolean;
  reviewChildId?: string;
  reviewTimer?: NodeJS.Timeout;
  /** Review attempts so far (the code checks count as one when they alone sent the builder back). */
  reviewRound?: number;
  /**
   * Super AI: Claude Code as it is, without Work AI's checklist, plan enforcement and context re-injection. It is
   * sent back only when it stops before it's done (a cut-off reply, a reply that announces its next step) or calls
   * a page it built done without opening it in the browser.
   */
  plain?: boolean;
  /** The task has the browser (so a built page can be tried in it). */
  browser?: boolean;
  /** This message wrote a web page, app or game file and hasn't opened one in the browser since. */
  pageUntried?: boolean;
  /** Super AI was already sent back once to try its page in the browser. */
  pageNudged?: boolean;
  /** The items that passed the last full review: what a later round must not break. */
  lastPassed?: Set<string>;
  /** What the checks code ran said in the current attempt. */
  lastDet?: CheckResult[];
  /** The verification to keep when the task concludes. */
  finalVerification?: WorkVerification | null;
  /** This turn wrote or ran something (so a build with a checklist is checked again), and whether it is a fix after review feedback. */
  changed?: boolean;
  fromReview?: boolean;
  /** The stage being built (a big brief is built stage by stage; 1-based) and how often it went back for what checks found. */
  milestone?: number;
  stageRound?: number;
  /** Files the agent read or changed, oldest first (re-injected after condensing). */
  recentFiles?: Map<string, number>;
  /** The latest model request's size: tokens in the window, for the context meter. */
  context?: { used: number; window: number };
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
/** How many times one message may start over in a fresh runtime when its window can't be freed. */
const MAX_FRESH_STARTS = 2;

/**
 * What a model emits when its generation breaks down (Nemotron once sent 163,869 characters of
 * <unk> as one reply), and reasoning tags that leak into an answer (`</think>`). Not part of an
 * answer: the model gateway asks again for a reply of only <unk>, and none of it is shown or kept.
 */
export const withoutJunk = (text: string) => text.replace(/<unk>/g, "").replace(/<think>[\s\S]*?<\/think>|<\/?think>/g, "");

/** The skill list is in every request: on a small window it gets this share, the most relevant skills first. */
const SKILL_LIST_SHARE = 0.03;
/**
 * After older steps are condensed, the files the agent touched most recently go back in (as
 * Claude Code does), so it doesn't read them all again: at most this many, each up to the first
 * share of the window and all together the second (capped at 5,000 and 25,000 tokens); a bigger
 * file is named, not repeated.
 */
const REINJECT_FILES = 5;
const REINJECT_FILE_SHARE = 0.03;
const REINJECT_TOTAL_SHARE = 0.06;
const REINJECT_FILE_MAX = 5_000;
const REINJECT_TOTAL_MAX = 25_000;
/**
 * The agent's own memory file, like Claude Code's CLAUDE.md: the names, interfaces and decisions
 * its files must agree on, kept in the working folder and read back after every condensing and
 * restart (so a function one file defines isn't called by another name three files later).
 */
export const NOTES_FILE = ".task/notes.md";
const NOTES_SHARE = 0.04;
const NOTES_MAX = 3_000;
/** An index of the names the task's code defines is given back too: this share of the window, 2,000 tokens at most. */
const INDEX_SHARE = 0.05;
const INDEX_MAX = 2_000;
const INDEX_FILES = 80;
const INDEX_FILE_BYTES = 200_000;
/** Tools whose `file_path` is a file the agent is working with. */
const FILE_TOOLS = new Set(["read", "write", "edit"]);

/** Words of four or more letters, cut to five so "games" meets "game" and "physics" meets "physical". */
const stems = (text: string) => new Set((text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).map((w) => w.slice(0, 5)));

/**
 * The library skills to list when the list must fit `budget` tokens: the ones that share the most
 * telling words with the request (a word few skills use, like "canvas", counts more than one most
 * use, like "file"), then the rest in library order while the budget lasts, kept in library order.
 * All of them when they fit.
 */
export function pickSkills<T extends { slug: string; description: string }>(skills: T[], request: string, budget: number): T[] {
  const cost = (sk: T) => estimateTokens(`${sk.slug}: ${sk.description}`) + 12;
  if (skills.reduce((n, sk) => n + cost(sk), 0) <= budget) return skills;
  const asked = stems(request);
  const words = skills.map((sk) => stems(`${sk.slug.replace(/-/g, " ")} ${sk.description}`));
  const used = new Map<string, number>();
  for (const ws of words) for (const w of ws) used.set(w, (used.get(w) ?? 0) + 1);
  // Words a tenth of the skills or more use ("when", "with", "file") tell nothing; a long description
  // doesn't win by length alone.
  const telling = (w: string) => used.get(w)! <= Math.max(1, skills.length * 0.1);
  const ranked = skills
    .map((sk, i) => {
      const hits = [...words[i]!].filter((w) => asked.has(w) && telling(w));
      return { sk, i, score: hits.reduce((n, w) => n + Math.log(skills.length / used.get(w)!), 0) / Math.sqrt(Math.max(1, words[i]!.size)) };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i);
  // Real matches first; what's left of the budget goes to the rest in library order, so a vague first
  // message ("hello") still leaves the agent a good set to choose from.
  const floor = (ranked[0]?.score ?? 0) * 0.25;
  const order = [...ranked.filter((r) => r.score > 0 && r.score >= floor), ...ranked.filter((r) => !(r.score > 0 && r.score >= floor)).sort((a, b) => a.i - b.i)];
  const keep = new Set<number>();
  let spent = 0;
  for (const r of order) {
    if (spent + cost(r.sk) > budget) continue;
    spent += cost(r.sk);
    keep.add(r.i);
  }
  return skills.filter((_, i) => keep.has(i));
}

/**
 * After condensing: the files the agent touched most recently, as they are on disk now (newest
 * first, within the window's budget; a bigger one by name only), and its plan. Null when there's
 * nothing to give back.
 */
export async function reinjection(l: {
workdir?: string;
recentFiles?: Map<string, number>;
contextWindow?: number;
plan: PlanItem[] | null;
acceptance?: Acceptance | null;
milestone?: number;
}): Promise<{ text: string; files: string[]; notes: boolean } | null> {
  if (!l.workdir) return null;
  const window = l.contextWindow ?? DEFAULT_WINDOW;
  const notes = await notesText(l.workdir, window);
  const names = await symbolIndex(l.workdir, window);
  if (!l.recentFiles?.size && !notes && !names.length && !l.acceptance) return null;
  const perFile = Math.min(REINJECT_FILE_MAX, Math.floor(window * REINJECT_FILE_SHARE));
  let left = Math.min(REINJECT_TOTAL_MAX, Math.floor(window * REINJECT_TOTAL_SHARE));
  const root = await realpath(l.workdir).catch(() => l.workdir!);
  const parts: string[] = [];
  const files: string[] = [];
  for (const path of [...(l.recentFiles?.keys() ?? [])].reverse()) {
    if (files.length >= REINJECT_FILES) break;
    const full = resolve(root, path);
    const real = await realpath(full).catch(() => null);
    // Only the task's own folder, links followed.
    if (!real || (real !== root && !real.startsWith(`${root}${sep}`))) continue;
    const info = await stat(real).catch(() => null);
    if (!info?.isFile()) continue;
    const rel = relative(root, real).split(sep).join("/");
    if (files.includes(rel)) continue;
    const text = info.size <= perFile * 8 ? await readFile(real, "utf8").catch(() => null) : null;
    const tokens = text === null ? Infinity : estimateTokens(text);
    if (text !== null && !looksBinary(text) && tokens <= perFile && tokens <= left) {
      parts.push(`<file path="${rel}">\n${text}\n</file>`);
      left -= tokens;
    } else parts.push(`- ${rel} (${info.size.toLocaleString("en-US")} bytes; read the part you need)`);
    files.push(rel);
  }
  if (!files.length && !notes && !names.length && !l.acceptance) return null;
  const open = (l.plan ?? []).map((i) => `- [${i.status}] ${i.content}`);
  return {
    files,
    notes: !!notes,
    text: [
      "Older steps were just condensed.",
      ...(l.acceptance ? ["", `Acceptance checklist (${ACCEPTANCE_FILE}): ${CHECKLIST_RULES}`, ...checklistText(l.acceptance, l.milestone)] : []),
      ...(notes ? ["", `Your notes (${NOTES_FILE}, your memory of the names and decisions your files agree on):`, notes] : []),
      ...(names.length ? ["", "What your code files define right now (call these by exactly these names; a name not listed here, check with grep before you use it):", ...names] : []),
      ...(parts.length ? ["", "So you don't have to read them again, these are the files you worked on most recently, as they are on disk now:", "", ...parts] : []),
      ...(open.length ? ["", "Your plan:", ...open] : []),
      "",
      "Carry on from where you were.",
    ].join("\n"),
  };
}

const NOT_NAMES = new Set(["if", "for", "while", "switch", "catch", "function", "return", "else", "with", "do", "try", "typeof", "await", "super", "new", "constructor"]);

/**
 * The names a code file defines, with their parameters ("justPressed(code)", "RR.Input.mousePos",
 * "class Vehicle"): what other files must call them by. A light scan for JavaScript, TypeScript
 * and Python, not a parser: it can miss a name or list one twice, never invent a file's content.
 */
export function definedNames(path: string, code: string): string[] {
  const out = new Set<string>();
  const props = new Set<string>();
  const add = (name: string, params?: string) => {
    if (NOT_NAMES.has(name)) return;
    const args = params === undefined ? "" : `(${params.replace(/\s+/g, " ").trim().slice(0, 40)})`;
    out.add(`${name}${args}`);
  };
  if (/\.py$/i.test(path)) {
    for (const m of code.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/gm)) add(m[1]!, m[2]);
    for (const m of code.matchAll(/^\s*class\s+([A-Za-z_]\w*)/gm)) add(`class ${m[1]}`);
    return [...out];
  }
  for (const m of code.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm)) add(m[1]!, m[2]);
  for (const m of code.matchAll(/^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) add(`class ${m[1]}`);
  // Namespace members: RR.Input = {…}, RR.Input.justPressed = function (code) {…}, window.X = …
  // (a name that starts in capitals, window, module or exports; `ctx.fillStyle = …` is a use, not a definition).
  for (const m of code.matchAll(/^\s*((?:window|module|exports|self|globalThis|[A-Z][\w$]*)(?:\.[A-Za-z_$][\w$]*)+)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*[\w$]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>)?/gm)) add(m[1]!, m[2] ?? m[3] ?? m[4]);
  // Methods of classes and object literals: name(args) {, name: function (args), name: (args) =>
  for (const m of code.matchAll(/^[ \t]{2,}(?:static\s+|async\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm)) add(m[1]!, m[2]);
  for (const m of code.matchAll(/^[ \t]{2,}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function\s*\*?\s*[\w$]*\s*)?\(([^)]*)\)\s*(?:=>|\{)/gm)) add(m[1]!, m[2]);
  // Top-level constants and variables.
  for (const m of code.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1]!);
  // Instance properties other files read (this.fuel = …): one level only, listed together.
  for (const m of code.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) props.add(m[1]!);
  const list = [...out];
  if (props.size) list.push(`instance {${[...props].slice(0, 14).join(", ")}${props.size > 14 ? ", …" : ""}}`);
  return list;
}

/** The names the task's code files define, one line per file, newest files first; [] when none. */
export async function symbolIndex(workdir: string, window: number, recent: string[] = []): Promise<string[]> {
  const root = await realpath(workdir).catch(() => workdir);
  const found: { rel: string; time: number }[] = [];
  const walk = async (dir: string, depth: number) => {
    for (const e of (await readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= INDEX_FILES * 3) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SUMMARY_SKIP.has(e.name) && e.name !== "scratch" && e.name !== "vendor" && !e.name.startsWith(".") && depth < 5) await walk(full, depth + 1);
      } else if (e.isFile() && /\.(?:m?js|cjs|jsx|tsx?|py)$/i.test(e.name) && !/\.min\.|\.d\.ts$/i.test(e.name)) {
        const info = await stat(full).catch(() => null);
        if (info && info.size <= INDEX_FILE_BYTES) found.push({ rel: relative(root, full).split(sep).join("/"), time: info.mtimeMs });
      }
    }
  };
  await walk(root, 0);
  found.sort((a, b) => b.time - a.time);
  const lines: string[] = [];
  let left = Math.min(INDEX_MAX, Math.floor(window * INDEX_SHARE));
  for (const f of found.slice(0, INDEX_FILES)) {
    const code = await readFile(join(root, f.rel), "utf8").catch(() => "");
    const names = definedNames(f.rel, code);
    if (!names.length) continue;
    const line = `${f.rel}: ${names.join(", ")}`;
    const cost = estimateTokens(line);
    if (cost > left) {
      // A long file keeps its first names rather than none.
      const short = line.slice(0, Math.max(0, left * 4 - 4)).replace(/,[^,]*$/, "");
      if (left > 30 && short.length > f.rel.length + 4) lines.push(`${short}, …`);
      break;
    }
    lines.push(line);
    left -= cost;
  }
  return lines;
}

/** The agent's notes file as it is now, cut to a share of the window (the start is kept); null when there are none. */
export async function notesText(workdir: string, window: number): Promise<string | null> {
  const text = await readFile(join(workdir, NOTES_FILE), "utf8").catch(() => null);
  if (!text?.trim()) return null;
  const chars = Math.min(NOTES_MAX, Math.floor(window * NOTES_SHARE)) * 4;
  return text.length > chars ? `${text.slice(0, chars).trimEnd()}\n… (the rest of the notes is in ${NOTES_FILE})` : text.trim();
}

/** A request the model's window can't take (the runtime's or the model server's words for it). */
const OVERFLOW = /context_length_exceeded|maximum context length|context window/i;
const DEFAULT_WINDOW = 32_768;
const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

/** Why Super AI can't run on a model of this window, or null. A model whose window isn't known is let through. */
export function superAiWindowProblem(name: string, window: number | null | undefined): string | null {
  if (!window || window >= SUPER_AI_MIN_WINDOW) return null;
  const min = SUPER_AI_MIN_WINDOW.toLocaleString("en");
  const have = window.toLocaleString("en");
  return msg(`Super AI needs a model with a context window of at least ${min} tokens, and ${name} has ${have}. Raise the model's context length (in Admin → Models, and on the model server), or choose another model.`);
}

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
 * A reply that ends by announcing its next step instead of taking it ("Let me try a different approach - use
 * python-docx directly."): open models write that and stop, and the task would end with the work undone.
 * Not an offer to the person ("Let me know if…") or a question.
 */
export function announcesNextStep(text: string): boolean {
  const last = text.trim().split(/\n+/).pop()?.trim() ?? "";
  if (!last || last.length > 400 || /\?\s*$/.test(last) || /\blet (me|us) know\b/i.test(last)) return false;
  return /(^|[.!:]\s+)(now,? |next,? |then,? |first,? )?(let me|let's|i'?ll|i will|i need to|i have to|i should|i must|i'?m going to|i am going to|the next step is)\b/i.test(last);
}

/** A file of a web page, app or game (what a person opens in a browser). */
const PAGE_FILE = /\.(html?|js|css)$/i;

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

/**
 * Before a task that wrote code ends: go through the request one requirement at a time and prove
 * each (a model that tries its program once still says "all done" about an export nobody opened,
 * a list in the wrong order, a stray line on the page).
 */
const VERIFY_NUDGE = [
  "Before you finish, check your work against what was asked, one requirement at a time. Take the request's list (reread it from your notes or the saved request file) and for each item do something that proves it: run it, open the page and use the feature, or read what it produced.",
  "If your program writes a file (an export, a report, a download), open that file and read its content: check its format, and that your own program can read it back. Check order, totals, wording and every case the request names, not only that nothing crashes. Read the finished page for text that shouldn't be there.",
  "If you made an Excel, PowerPoint, Word or PDF file, load the document-checks skill and follow it: run its audit on every file, render the pages and read them, and make sure each claim in the text comes from the data in code. Checking that a file opens, or counting its objects, is not checking it.",
  "Fix what you find, then check it again. Delete files you made only to signal you're done or to test (DONE, finish.txt, test pages) unless the person asked for them.",
  "Then give your summary: for each requirement, how you checked it, and what you couldn't check. Never write that you checked something you did not run.",
].join(" ");

/** After code was written and never run or opened. */
const TRY_NUDGE = `You wrote code in this task but haven't run or opened it since. Try it now: run it, or for a web page, app or game open it with browser_open by its path (like game/index.html) and fix any script errors it shows. ${VERIFY_NUDGE}`;

/** A reviewer that ended without its report. */
const REVIEW_NUDGE = `You haven't written ${REVIEW_FILE} yet. Test whatever is left, then write ${REVIEW_FILE} as JSON in the shape you were given, with an entry for every item to test, and reply with one line saying it's written.`;

/** Super AI: a reply that hit the model's output limit (Claude Code reports it as an API error and stops the turn). */
const OUTPUT_LIMIT = /output token maximum/i;
const OUTPUT_LIMIT_NUDGE = "Your last reply was cut off because it reached the model's output limit before it was finished, so nothing in it was done. Don't write a large file in one step: write it in parts of about 200 lines (create it with the first part, then add the rest), and keep each reply short. Then carry on from where you stopped.";

const PAGE_NUDGE =
  "You built a web page, app or game but haven't opened it in the browser. Before you finish, open it with browser_open by its path in your folder (like game/index.html), fix every script error and warning it reports, then use it the way a person would: click its buttons, use the keyboard (browser_press), fill its forms, and check that what should happen does. Then finish, saying what you tried and what you saw.";

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
  /** Fresh runtimes started for the current message because its window couldn't be freed. */
  private freshStarts = new Map<string, number>();
  private approvalWaiters = new Map<string, Set<() => void>>();
  private engine: HarnessEngine;
  /** The Claude Code engine of Super AI (docs/20-super-ai.md), made when the first such task starts. */
  private claudeEngine: HarnessEngine | null = null;
  /** Container mode: Work AI tasks run here (Aatmiq Code's agent stays in the person's IDE workspace). */
  private containerEngine: HarnessEngine | null = null;
  private stopped = false;

  constructor(
    private ctx: AppContext,
    private opts: { controlUrl: () => string; engine?: HarnessEngine; claudeEngine?: HarnessEngine; log?: (msg: string, err?: unknown) => void },
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
    this.freshStarts.delete(taskId);
    const l = this.live.get(taskId);
    // A new message from the person comes before a review of the old work.
    if (l?.reviewing) await this.stopReview(l);
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
    for (const l of this.live.values()) if (l.busy && !l.waiting && !l.reviewing) n++;
    return n;
  }

  private hasSlot(userId: string, s: WorkSettingsValue): boolean {
    if (this.working() >= s.maxRunning) return false;
    let mine = 0;
    for (const l of this.live.values()) if (l.userId === userId && l.busy && !l.reviewing) mine++;
    return mine < s.maxConcurrentPerUser;
  }

  /** Start a new turn on a warm runtime. */
  private async resume(l: Live, prompt: string, opts: { review?: boolean } = {}) {
    clearTimeout(l.idleTimer);
    l.pending = undefined;
    l.busy = true;
    // A turn that sends the builder back to fix what a review found is always checked again; any
    // other is checked only if it changed something.
    l.fromReview = !!opts.review;
    l.changed = false;
    l.lastError = null;
    l.turnOutput = false;
    l.usedTools = false;
    l.continues = 0;
    l.idleNudge = false;
    l.planActive = false;
    l.untried = false;
    l.wroteCode = false;
    l.verifyNudged = false;
    l.pageUntried = false;
    l.pageNudged = false;
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
    l.parentId = task.parentId;
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
      // On a small window the skill list (in every request) is cut to the skills that fit the request.
      const asked = await db
        .select({ data: workEvent.data })
        .from(workEvent)
        .where(and(eq(workEvent.taskId, taskId), eq(workEvent.kind, "user")))
        .orderBy(asc(workEvent.seq));
      const request = [asked[0], asked.at(-1)].map((e) => String(e?.data.text ?? "")).join("\n");
      const skillsDir = await this.writeSkills(task.userId, join(homeDir, "skills"), settings.disabledLibrarySkills, code ? CODE_LIBRARY : undefined, {
        request,
        budget: Math.floor(l.contextWindow * SKILL_LIST_SHARE),
      });
      await this.prepareFolder(taskId, runUid);
      if (code) await this.ctx.code.prepare(task.userId, workdir);
      // A build gets its checklist once, before the builder starts (a restarted task reads the file).
      l.acceptance = await this.acceptanceFor(l, task, code ? "code" : "work", String(asked[0]?.data.text ?? ""));
      if (l.acceptance) {
        const st = await loadState(workdir);
        l.milestone = Math.min(st?.milestone ?? 1, l.acceptance.milestones.length);
        l.reviewRound = st?.reviewRound ?? 0;
        if (!st) await this.saveBuildState(l);
      }
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
      const superAi = task.engine === "claude" && !code && !task.parentId;
      if (superAi && this.containerEngine) throw new Error("Super AI doesn't run in container mode yet.");
      l.plain = superAi;
      const tooSmall = superAi ? superAiWindowProblem(m.displayName, m.contextLength) : null;
      if (tooSmall) throw new Error(tooSmall);
      const inContainer = !code && !superAi && !!this.containerEngine;
      const engine = superAi ? (this.claudeEngine ??= this.opts.claudeEngine ?? createClaudeEngine()) : inContainer ? this.containerEngine! : this.engine;
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
          ...(task.parentId ? { review: true } : {}),
          webSearch: webSearchReady(await workWebSearchDeps(this.ctx)),
          browser: (l.browser = settings.browser && !!this.ctx.browser?.available),
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
      // A big brief is built stage by stage, each stage's session fresh; anything else goes on from history.
      const staged = !!l.acceptance && l.acceptance.milestones.length > 1;
      if (staged) {
        await this.record(taskId, "stage", { n: l.milestone ?? 1, total: l.acceptance!.milestones.length, name: l.acceptance!.milestones[(l.milestone ?? 1) - 1]?.name ?? "", state: "started" });
        await runtime.send(await this.stageOpening(l));
      } else {
        const opening = await this.promptWithHistory(l);
        await runtime.send(l.acceptance ? `${opening}\n\n${acceptanceBrief(l.acceptance)}` : opening);
      }
    } catch (e) {
      await this.fail(taskId, e instanceof Error ? e.message : "The agent couldn't start.");
    }
  }

  /**
   * The task's acceptance checklist: the file in its folder when there is one, else a new one for a
   * request that asks for something to be built (Work AI tasks only; a reviewer's task has none).
   */
  private async acceptanceFor(l: Live, task: typeof workTask.$inferSelect, section: "work" | "code", request: string): Promise<Acceptance | null> {
    if (!l.workdir || section === "code" || task.parentId || task.engine === "claude") return null;
    const have = await loadAcceptance(l.workdir);
    if (have) return have;
    // Only a task's first message gets a checklist; a later "continue" on an old task doesn't.
    if (!request || !isBuildRequest(request) || (await this.hadWork(task.id))) return null;
    const planned = await planAcceptance(this.ctx, { taskId: task.id, workspaceId: task.workspaceId, userId: task.userId, request, log: this.opts.log }).catch((e) => {
      this.opts.log?.("work: planning the checklist failed", e);
      return null;
    });
    if (!planned) return null;
    await saveAcceptance(l.workdir, planned);
    if (l.runUid !== undefined) await this.chownTree(join(l.workdir, ".task"), l.runUid);
    await this.record(task.id, "acceptance", { items: planned.items, milestones: planned.milestones });
    return planned;
  }

  /** The task has already run a tool (it isn't at its first message). */
  private async hadWork(taskId: string): Promise<boolean> {
    const [r] = await this.ctx.db.select({ n: sql<number>`count(*)::int` }).from(workEvent).where(and(eq(workEvent.taskId, taskId), eq(workEvent.kind, "tool_call")));
    return (r?.n ?? 0) > 0;
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
    const notes = l.workdir ? await notesText(l.workdir, window) : null;
    const names = l.workdir ? await symbolIndex(l.workdir, window) : [];
    return [
      "This task continues an earlier conversation. Files you created are still in your working folder.",
      "<earlier-conversation>",
      history,
      "</earlier-conversation>",
      ...(plan.length
        ? ["", "Your plan when it stopped (write it again with todo_write, keeping finished steps completed):", ...plan.map((i) => `- [${i.status}] ${i.content}`)]
        : []),
      ...(notes ? ["", `Your notes (${NOTES_FILE}):`, notes] : []),
      ...(names.length ? ["", "What your code files define now:", ...names] : []),
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

  /** The latest model request's size, from the model gateway: shown as the task's context meter. */
  noteContext(taskId: string, used: number, window: number) {
    const l = this.live.get(taskId);
    if (l) l.context = { used, window };
    this.pulse(taskId, "context", { used, window });
  }

  /** The context meter of a running task, for the task page. */
  contextOf(taskId: string): { used: number; window: number } | null {
    return this.live.get(taskId)?.context ?? null;
  }

  /* ───────────── Milestone build mode (docs/19-work-ai-reliability-plan.md) ───────────── */

  private async saveBuildState(l: Live) {
    if (!l.workdir) return;
    await saveState(l.workdir, { milestone: l.milestone ?? 1, reviewRound: l.reviewRound ?? 0 });
    if (l.runUid !== undefined) await this.chownTree(join(l.workdir, ".task"), l.runUid);
  }

  /** The first message of a stage's session: the request, the checklist, the progress file and what the code defines. */
  private async stageOpening(l: Live): Promise<string> {
    const { db } = this.ctx;
    const asked = await db.select({ seq: workEvent.seq, data: workEvent.data }).from(workEvent).where(and(eq(workEvent.taskId, l.taskId), eq(workEvent.kind, "user"))).orderBy(asc(workEvent.seq));
    const first = asked[0];
    const latest = asked.length > 1 ? asked.at(-1) : undefined;
    const window = l.contextWindow ?? DEFAULT_WINDOW;
    return stagePrompt({
      a: l.acceptance!,
      stage: l.milestone ?? 1,
      request: await this.briefed(l, String(first?.data.text ?? ""), first?.seq ?? 0),
      progress: await loadProgress(l.workdir!),
      names: await symbolIndex(l.workdir!, window),
      files: await folderSummary(l.workdir!),
      notes: await notesText(l.workdir!, window),
      ...(latest ? { latest: await this.briefed(l, String(latest.data.text ?? ""), latest.seq) } : {}),
    });
  }

  /**
   * A stage ended: the checks code decides run on what's built so far. What fails goes back to the
   * builder (a few times); then the stage is written into the progress file and snapshotted, and
   * the next stage starts in a fresh session. True: the task goes on (never the end).
   */
  private async afterStage(l: Live): Promise<boolean> {
    const a = l.acceptance!;
    const k = l.milestone ?? 1;
    const det = await this.checksFor(l, k);
    for (const r of det) {
      const item = a.items.find((i) => i.id === r.id);
      if (item) {
        item.status = r.status;
        item.observed = r.observed;
      }
    }
    await this.saveChecklist(l);
    const failed = a.items.filter((i) => det.some((r) => r.id === i.id && r.status === "fail"));
    const round = (l.stageRound = (l.stageRound ?? 0) + 1);
    if (failed.length && round <= STAGE_ROUNDS && l.runtime?.alive && !l.cancelled) {
      await this.record(l.taskId, "stage", { n: k, total: a.milestones.length, name: a.milestones[k - 1]?.name ?? "", state: "checks", failed: failed.map((i) => i.id) });
      await this.resume(l, feedbackText({ passed: [], failed, untested: [], hygiene: null, consistency: null }, round, { source: "The automatic checks for this stage", rounds: STAGE_ROUNDS }), { review: true });
      return true;
    }
    l.stageRound = 0;
    const workdir = l.workdir!;
    const stat = await folderSummary(workdir);
    await mkdir(join(workdir, ".task"), { recursive: true });
    await appendFile(join(workdir, PROGRESS_FILE), progressEntry(a, k, stat));
    await gitSnapshot(workdir, `Stage ${k} of ${a.milestones.length}: ${a.milestones[k - 1]?.name ?? ""}`, l.runUid !== undefined ? (p) => this.chownTree(p, l.runUid!) : undefined);
    await this.record(l.taskId, "stage", { n: k, total: a.milestones.length, name: a.milestones[k - 1]?.name ?? "", state: "done", passed: a.items.filter((i) => i.milestone <= k && i.status === "pass").length, failed: failed.map((i) => i.id) });
    l.milestone = k + 1;
    await this.saveBuildState(l);
    // The next stage: a fresh runtime (start() builds its opening from the files), not this one's history.
    await this.release(l.taskId);
    await this.setStatus(l.taskId, "queued", { error: null });
    await this.pump();
    return true;
  }

  /* ───────────── Independent review (docs/19-work-ai-reliability-plan.md) ───────────── */

  /** The checks code decides, for the whole checklist or up to a stage; the leftovers check comes with the last. */
  private checksFor(l: Live, milestone?: number): Promise<CheckResult[]> {
    const browser = this.ctx.browser?.available ? this.ctx.browser : undefined;
    return runChecks(l.acceptance!, {
      workdir: l.workdir!,
      ...(browser ? { browser } : {}),
      browserKey: `${l.taskId}~check`,
      profileDir: join(this.taskDir(l.taskId), "runtime", "check-browser"),
      ...(l.runUid !== undefined ? { uid: l.runUid } : {}),
      ...(milestone !== undefined ? { milestone } : {}),
    });
  }

  /** The checklist's states, kept in the folder and shown on the task page. */
  private async saveChecklist(l: Live) {
    const a = l.acceptance;
    if (!a || !l.workdir) return;
    await saveAcceptance(l.workdir, a);
    if (l.runUid !== undefined) await this.chownTree(join(l.workdir, ".task"), l.runUid);
    await this.record(l.taskId, "acceptance", { items: a.items, milestones: a.milestones });
  }

  /**
   * The builder says it's done and the task has a checklist: the checks code decides first (a fail
   * goes straight back to the builder, no reviewer needed), then a reviewer who didn't build it
   * tests the rest. True when that took over the turn (the builder was sent back, or a review runs);
   * false when the task can conclude, with `finalVerification` set.
   */
  private async afterBuild(l: Live): Promise<boolean> {
    const a = l.acceptance;
    if (!a || !l.workdir) return false;
    // A reply that changed nothing (a question, a "hello") isn't checked again; a fix after feedback
    // always is. A stage that found its work done still moves on, and a build that has not been
    // reviewed yet is reviewed.
    const staged = a.milestones.length > 1;
    const moving = staged && (l.milestone ?? 1) < a.milestones.length;
    if (!l.changed && !l.fromReview && !moving && !(staged && (l.reviewRound ?? 0) === 0)) return false;
    // A stage that isn't the last: its own checks, then the next stage in a fresh session.
    if (a.milestones.length > 1 && (l.milestone ?? 1) < a.milestones.length) return this.afterStage(l);
    const round = (l.reviewRound = (l.reviewRound ?? 0) + 1);
    await this.saveBuildState(l);
    const det = await this.checksFor(l);
    l.lastDet = det;
    const o = mergeResults(a, det, null);
    await this.saveChecklist(l);
    const decided = new Set(det.map((r) => r.id));
    const toJudge = a.items.some((i) => !decided.has(i.id));
    if (det.some((r) => r.status === "fail")) {
      await this.record(l.taskId, "review", { round, state: "checks", failed: det.filter((r) => r.status === "fail").map((r) => r.id) });
      if (round <= MAX_REVIEW_ROUNDS && l.runtime?.alive && !l.cancelled) {
        await this.resume(l, feedbackText(o, round, { regressed: o.failed.filter((i) => l.lastPassed?.has(i.id)).map((i) => i.id) }), { review: true });
        return true;
      }
      l.finalVerification = verificationOf(a, o, { rounds: round, reviewTaskId: null });
      return false;
    }
    if (!toJudge) {
      l.finalVerification = verificationOf(a, o, { rounds: round, reviewTaskId: null });
      return false;
    }
    return this.startReview(l, det, round);
  }

  /** The model to review with: Advanced tier and not the builder's, else the nearest to that. */
  private async reviewerModel(l: Live) {
    const [t] = await this.ctx.db.select({ modelId: workTask.modelId }).from(workTask).where(eq(workTask.id, l.taskId));
    const models = await availableModels(this.ctx.db, l.workspaceId, "work", l.userId);
    const other = models.filter((m) => m.id !== t?.modelId);
    return other.find((m) => m.tier === "advanced") ?? models.find((m) => m.tier === "advanced") ?? other.find((m) => m.tier === "standard") ?? models.find((m) => m.id === t?.modelId) ?? models[0] ?? null;
  }

  /** Start the reviewer: a task of its own, on a copy of the folder, that the builder waits for. */
  private async startReview(l: Live, det: CheckResult[], round: number): Promise<boolean> {
    const a = l.acceptance!;
    const { db } = this.ctx;
    const skip = (why: string) => {
      l.finalVerification = verificationOf(a, mergeResults(a, det, null), { rounds: round, reviewTaskId: null, skipped: why });
      return false;
    };
    const model = await this.reviewerModel(l);
    if (!model) return skip("no model is available for the review");
    const [parent] = await db.select({ title: workTask.title }).from(workTask).where(eq(workTask.id, l.taskId));
    const [first] = await db
      .select({ data: workEvent.data })
      .from(workEvent)
      .where(and(eq(workEvent.taskId, l.taskId), eq(workEvent.kind, "user")))
      .orderBy(asc(workEvent.seq))
      .limit(1);
    const [child] = await db
      .insert(workTask)
      .values({ workspaceId: l.workspaceId, userId: l.userId, title: `Review: ${parent?.title ?? "task"}`.slice(0, 80), modelId: model.id, parentId: l.taskId })
      .returning();
    if (!child) return skip("the review couldn't be started");
    try {
      await this.prepareFolder(child.id, child.runUid);
      const from = this.filesDir(l.taskId);
      await cp(from, this.filesDir(child.id), { recursive: true, filter: (src) => !/(^|[\\/])(\.git|node_modules|downloads|screenshots)([\\/]|$)/.test(relative(from, src)) });
      await this.chownTree(this.filesDir(child.id), child.runUid);
    } catch (e) {
      this.opts.log?.("work: preparing a review failed", e);
      await db.delete(workTask).where(eq(workTask.id, child.id));
      return skip("the review couldn't be started");
    }
    const browser = !!this.ctx.browser?.available && (await getWorkSettings(db)).browser;
    l.reviewing = true;
    l.reviewChildId = child.id;
    l.busy = true;
    l.reviewTimer = setTimeout(() => void this.judgeReview(l, null, "the review took too long", child.id, true).catch((e) => this.opts.log?.("work: ending a review failed", e)), REVIEW_TIMEOUT_MS);
    l.reviewTimer.unref();
    await this.setStatus(l.taskId, "running");
    await this.record(l.taskId, "review", { round, state: "started", reviewTaskId: child.id, model: model.displayName });
    await this.submit(child.id, reviewerPrompt(String(first?.data.text ?? ""), a, det, browser));
    return true;
  }

  /** The reviewer's task ended: read its report and decide (see judgeReview). */
  private async reviewFinished(child: Live, childError: string | null) {
    const parent = child.parentId ? this.live.get(child.parentId) : undefined;
    // The reviewer's work is done; its runtime and browser needn't stay for the idle minutes.
    void this.release(child.taskId).catch(() => undefined);
    if (!parent || !parent.reviewing || parent.reviewChildId !== child.taskId) return;
    clearTimeout(parent.reviewTimer);
    await this.rollUp(parent.taskId, child.taskId);
    let report: ReviewReport | null = null;
    let why: string | undefined;
    if (childError) why = "the reviewer stopped before it reported";
    else {
      const parsed = parseReport(await readFile(join(child.workdir ?? this.filesDir(child.taskId), REVIEW_FILE), "utf8").catch(() => ""));
      if (parsed.ok) report = parsed.report;
      else why = "the reviewer didn't write a usable report";
    }
    await this.judgeReview(parent, report, why, child.taskId);
  }

  /**
   * What the review found: all good, or the builder goes back to what isn't right (up to
   * MAX_REVIEW_ROUNDS times), or the task ends saying what was not met. A review that never
   * reported ends the task unverified, and says so.
   */
  private async judgeReview(l: Live, report: ReviewReport | null, skipped: string | undefined, reviewTaskId: string, cancelChild = false) {
    if (!l.reviewing || l.reviewChildId !== reviewTaskId) return;
    clearTimeout(l.reviewTimer);
    l.reviewing = false;
    l.reviewChildId = undefined;
    if (cancelChild) await this.cancel(reviewTaskId);
    const a = l.acceptance!;
    const round = l.reviewRound ?? 1;
    const o = mergeResults(a, l.lastDet ?? [], skipped ? null : report);
    const regressed = skipped ? [] : o.failed.filter((i) => l.lastPassed?.has(i.id)).map((i) => i.id);
    if (!skipped) l.lastPassed = new Set(o.passed.map((i) => i.id));
    await this.saveChecklist(l);
    await this.record(l.taskId, "review", { round, state: "done", reviewTaskId, passed: o.passed.length, failed: o.failed.map((i) => i.id), untested: o.untested.map((i) => i.id) });
    const v = (extra: { skipped?: string } = {}) => verificationOf(a, o, { rounds: round, reviewTaskId, ...extra });
    if (skipped) return this.conclude(l, null, v({ skipped }));
    if (allGood(o) || round > MAX_REVIEW_ROUNDS || !l.runtime?.alive || l.cancelled) return this.conclude(l, null, v());
    await this.resume(l, feedbackText(o, round, { regressed }), { review: true });
  }

  /** The person wrote while a review ran: the review stops, and the message is the builder's next. */
  private async stopReview(l: Live) {
    clearTimeout(l.reviewTimer);
    const child = l.reviewChildId;
    l.reviewing = false;
    l.reviewChildId = undefined;
    l.busy = false;
    if (child) await this.cancel(child);
  }

  /** A reviewer's tokens count in its task's. */
  private async rollUp(parentId: string, childId: string) {
    const { db } = this.ctx;
    const [c] = await db.select({ i: workTask.inputTokens, o: workTask.outputTokens }).from(workTask).where(eq(workTask.id, childId));
    if (c) await db.update(workTask).set({ inputTokens: sql`${workTask.inputTokens} + ${c.i}`, outputTokens: sql`${workTask.outputTokens} + ${c.o}` }).where(eq(workTask.id, parentId));
  }

  /** The reviewer wrote its report, in a shape that reads. */
  private async reportReady(l: Live): Promise<boolean> {
    const text = await readFile(join(l.workdir ?? this.filesDir(l.taskId), REVIEW_FILE), "utf8").catch(() => "");
    return parseReport(text).ok;
  }

  /** Where a task ends: its status, the answer, what the review found, the person told. */
  private async conclude(l: Live, error: string | null, verification?: WorkVerification | null) {
    l.reviewing = false;
    l.busy = false;
    l.idleSince = Date.now();
    const v = verification ?? l.finalVerification ?? null;
    l.finalVerification = null;
    await this.setStatus(l.taskId, error ? "failed" : "completed", { result: l.lastAnswer ? clip(l.lastAnswer, 4000) : null, error, ...(v ? { verification: v } : {}) });
    if (v) await this.record(l.taskId, "verification", v as unknown as Record<string, unknown>);
    await this.notifyDone(l, error, v);
    this.armIdle(l);
    await this.pump();
  }

  private async onEvent(l: Live, e: HarnessEvent) {
    const { taskId } = l;
    switch (e.type) {
      case "assistant": {
        const text = withoutJunk(e.text);
        if (!text.trim() && e.toolCalls.length === 0) return;
        l.turnOutput = true;
        if (text.trim()) l.lastAnswer = text;
        await this.record(taskId, "assistant", { text, toolCalls: e.toolCalls });
        return;
      }
      case "tool_call":
        l.turnOutput = true;
        l.usedTools = true;
        l.planActive = true;
        {
          const path = (e.args as { file_path?: unknown } | null)?.file_path;
          if (FILE_TOOLS.has(e.name) && typeof path === "string" && path.trim()) {
            const files = (l.recentFiles ??= new Map());
            files.delete(path);
            files.set(path, Date.now());
            if (files.size > 50) files.delete(files.keys().next().value!);
          }
        }
        if (e.name === "write" || e.name === "edit" || e.name === "bash" || e.name === "pwsh") l.changed = true;
        if (writesCode(e.name, e.args)) {
          l.untried = true;
          l.wroteCode = true;
        } else if (triesCode(e.name, e.args)) l.untried = false;
        {
          const path = (e.args as { file_path?: unknown } | null)?.file_path;
          if ((e.name === "write" || e.name === "edit") && typeof path === "string" && PAGE_FILE.test(path)) l.pageUntried = true;
          else if (e.name.startsWith("browser_")) l.pageUntried = false;
        }
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
      case "compacted": {
        // What the agent goes on from, for people to read (like Claude Code's "continued from" summary).
        await this.record(taskId, "context", { compacted: true, summary: clip(e.summary, MAX_TOOL_TEXT), steps: e.steps, tokens: e.tokens });
        const back = l.plain ? null : await reinjection(l);
        if (back && l.runtime?.alive) await this.sendTo(l, back.text);
        if (back) await this.record(taskId, "context", { reinjected: back.files, notes: back.notes });
        return;
      }
      case "turn_end": {
        if (l.cancelled) return;
        // Not finished yet: a sentence cut off after tools, a reply that hit its length limit, or a
        // plan with open steps. The agent is sent back (a few times, while it keeps making progress).
        const open = l.planActive && !l.plain ? (l.plan ?? []).filter((i) => i.status !== "completed") : [];
        const hanging = !!l.lastAnswer && (answerLeftHanging(l.lastAnswer) || announcesNextStep(l.lastAnswer)) && (l.usedTools || e.reason === "max-tokens");
        const cutOff = e.reason === "max-tokens" && !!l.turnOutput;
        const planOpen = e.reason === "completed" && open.length > 0 && (!!l.usedTools || !l.idleNudge);
        // An empty reply after real work this round is the model server's glitch: carry on.
        const blank = e.reason !== "completed" && e.reason !== "blocked" && !!l.usedTools && /no content|empty (response|reply)/i.test(e.error ?? "");
        // Code written: sent back once to check it against the request, and to try it if it never ran
        // (a model's "it works" isn't a check).
        // Not when a checklist exists: the independent review replaces the builder checking itself.
        const verify = e.reason === "completed" && !!l.wroteCode && !l.verifyNudged && !l.acceptance && !l.parentId;
        // A reviewer ends with its report in the folder.
        const reportMissing = !!l.parentId && e.reason === "completed" && !(await this.reportReady(l));
        // A plain (Super AI) task is sent back only when it stopped before it was done (a reply too long for the output
        // limit, cut off, or announcing a next step it didn't take) or calls a page it built done untried.
        const outputLimit = !!l.plain && OUTPUT_LIMIT.test(e.error ?? "");
        const pageUntried = !!l.plain && e.reason === "completed" && !!l.pageUntried && !!l.browser && !l.pageNudged && !l.parentId;
        const nudge = l.plain
          ? outputLimit
            ? OUTPUT_LIMIT_NUDGE
            : hanging || cutOff
              ? CUT_OFF_NUDGE
              : pageUntried
                ? PAGE_NUDGE
                : null
          : hanging || cutOff ? CUT_OFF_NUDGE : planOpen ? openStepsNudge(open) : blank ? RESUME_NUDGE : reportMissing ? REVIEW_NUDGE : verify ? (l.untried ? TRY_NUDGE : VERIFY_NUDGE) : null;
        if (nudge && (l.continues ?? 0) < MAX_CONTINUES && l.runtime?.alive && !l.lastError) {
          l.continues = (l.continues ?? 0) + 1;
          l.idleNudge = !l.usedTools;
          if (nudge === TRY_NUDGE || nudge === VERIFY_NUDGE) l.verifyNudged = true;
          if (nudge === PAGE_NUDGE) l.pageNudged = true;
          l.busy = true;
          l.usedTools = false;
          await this.setStatus(taskId, "running");
          await this.sendTo(l, nudge);
          return;
        }
        // completed, blocked (a person said no) and max-tokens all end with an answer to show.
        const ok = e.reason === "completed" || e.reason === "blocked" || e.reason === "max-tokens";
        // The window couldn't be freed even by condensing: start over in a fresh runtime from the
        // work so far (history sized to the window, the plan, the files), like a continued session.
        const overflow = !ok && OVERFLOW.test(e.error ?? l.lastError ?? "");
        if (overflow && (this.freshStarts.get(taskId) ?? 0) < MAX_FRESH_STARTS && !this.stopped) {
          this.freshStarts.set(taskId, (this.freshStarts.get(taskId) ?? 0) + 1);
          await this.record(taskId, "context", { restarted: true });
          await this.release(taskId);
          await this.setStatus(taskId, "queued", { error: null });
          await this.pump();
          return;
        }
        l.busy = false;
        l.idleSince = Date.now();
        // The model sent back nothing (even after the proxy asked again): the runtime either calls that
        // an error in its own words or ends the turn as if done. Neither is a finished task.
        const empty = !l.turnOutput && (ok ? e.reason !== "blocked" : /no content|empty (response|reply)/i.test(e.error ?? ""));
        const error = overflow
          ? msg('The work no longer fits in the model\'s context window, even after older steps were condensed and the agent started over. Send "continue" to pick up from the files in the folder, or pick a model with a bigger context window.')
          : l.lastError ??
          (empty
            ? e.reason === "max-tokens"
              ? msg("The model's context window was full, so it couldn't answer. Send the message again; older steps are condensed to make room.")
              : msg("The model sent back an empty answer, so nothing was done. Send the task again, or pick another model.")
            : !ok
              ? OUTPUT_LIMIT.test(e.error ?? "")
                ? msg("The model's reply kept hitting its output limit, so the work was cut off. Ask for it in smaller parts, or choose a model with a larger context window.")
                : (e.error ?? `The agent stopped (${e.reason}).`)
              : // A plan with steps never done is not a finished task, whatever the last sentence says.
                e.reason !== "blocked" && open.length > 0
                ? unfinishedNote(open, l.plan!.length)
                : null);
        // A finished build with a checklist is checked before it is called done.
        if (!error && e.reason === "completed" && !l.parentId && l.acceptance && (await this.afterBuild(l))) return;
        await this.conclude(l, error);
        if (l.parentId) await this.reviewFinished(l, error);
        return;
      }
      case "exit": {
        // Only this runtime's own entry: a later session of the task may already be there.
        if (this.live.get(taskId) === l) this.live.delete(taskId);
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

  private async notifyDone(l: Live, error: string | null, verification?: WorkVerification | null) {
    // A reviewer is part of its builder's task: only the builder tells the person.
    if (l.parentId) return;
    const [t] = await this.ctx.db.select({ title: workTask.title }).from(workTask).where(eq(workTask.id, l.taskId));
    await notify(this.ctx.db, [l.userId], {
      type: error ? "work_failed" : "work_done",
      title: error ? (t ? `Task needs attention: ${t.title}` : "A task needs attention") : t ? `Task finished: ${t.title}` : "A task finished",
      body: error ?? (verification && (verification.skipped || verification.passed < verification.total) ? verificationLine(verification) : l.lastAnswer ? clip(l.lastAnswer, 200) : undefined),
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
    if (l?.reviewChildId) {
      clearTimeout(l.reviewTimer);
      const child = l.reviewChildId;
      l.reviewChildId = undefined;
      await this.cancel(child);
    }
    await this.release(taskId);
    await this.expireApprovals(taskId);
    const [t] = await this.ctx.db.select({ status: workTask.status }).from(workTask).where(eq(workTask.id, taskId));
    if (t && t.status !== "completed" && t.status !== "failed" && t.status !== "cancelled") await this.setStatus(taskId, "cancelled");
    await this.pump();
  }

  async remove(taskId: string) {
    await this.cancel(taskId);
    this.seqs.delete(taskId);
    // Its reviewers' folders go with it (their rows are deleted with the task).
    for (const c of await this.ctx.db.select({ id: workTask.id }).from(workTask).where(eq(workTask.parentId, taskId))) {
      this.seqs.delete(c.id);
      await rm(this.taskDir(c.id), { recursive: true, force: true });
    }
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
  private async writeSkills(
    userId: string,
    dir: string,
    disabledLibrary: string[],
    categories?: readonly LibraryCategory[],
    fit?: { request: string; budget: number },
  ): Promise<string | null> {
    const rows = await this.ctx.db
      .select()
      .from(skill)
      .where(and(eq(skill.enabled, true), or(eq(skill.scope, "org"), and(eq(skill.scope, "personal"), eq(skill.ownerId, userId)))));
    await rm(dir, { recursive: true, force: true });
    const off = new Set(disabledLibrary);
    const offered = librarySkills().filter((s) => !off.has(s.slug) && (!categories || categories.includes(s.category)));
    // The organization's and the person's own skills always; the library's within what's left.
    const own = rows.reduce((n, s) => n + estimateTokens(`${s.slug || s.name}: ${s.description}`) + 12, 0);
    const library = fit ? pickSkills(offered, fit.request, Math.max(0, fit.budget - own)) : offered;
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
