/**
 * Milestone build mode (docs/19-work-ai-reliability-plan.md): a big brief's checklist is grouped into
 * stages, and each stage is built by a fresh session that reads only the request, the checklist, a
 * progress file the runtime keeps, and what the code defines, so no session holds more than its own
 * stage. After each stage the checks code decides run on what's built so far; the full review comes
 * after the last.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { checklistText, CHECKLIST_RULES, ACCEPTANCE_FILE, type Acceptance } from "./work-spec";

const run = promisify(execFile);

export const PROGRESS_FILE = ".task/progress.md";
export const STATE_FILE = ".task/state.json";
/** The most times a stage goes back to its builder for what the checks found, before the build goes on. */
export const STAGE_ROUNDS = 2;
/** The progress file's share of a stage session's opening message, in characters. */
const PROGRESS_CHARS = 6000;

export interface BuildState {
  /** The stage being built (1-based). */
  milestone: number;
  /** Review attempts so far (a restarted task goes on from here). */
  reviewRound: number;
}

export async function loadState(workdir: string): Promise<BuildState | null> {
  try {
    const s = JSON.parse(await readFile(join(workdir, STATE_FILE), "utf8")) as Partial<BuildState>;
    return typeof s.milestone === "number" && s.milestone >= 1 ? { milestone: s.milestone, reviewRound: s.reviewRound ?? 0 } : null;
  } catch {
    return null;
  }
}

export async function saveState(workdir: string, s: BuildState): Promise<void> {
  await mkdir(join(workdir, ".task"), { recursive: true });
  await writeFile(join(workdir, STATE_FILE), `${JSON.stringify(s)}\n`);
}

export async function loadProgress(workdir: string): Promise<string> {
  return readFile(join(workdir, PROGRESS_FILE), "utf8").catch(() => "");
}

/** What the runtime writes into the progress file when a stage is done: its items and the files then. */
export function progressEntry(a: Acceptance, stage: number, files: string[], now = new Date()): string {
  const items = a.items.filter((i) => i.milestone === stage);
  return [
    `## Stage ${stage} of ${a.milestones.length}: ${a.milestones[stage - 1]?.name ?? ""} (done ${now.toISOString().slice(0, 16).replace("T", " ")} UTC)`,
    ...items.map((i) => `- ${i.id} ${i.status === "pass" ? "✓" : i.status === "fail" ? "✗" : "·"} ${i.requirement}${i.status === "fail" && i.observed ? ` (found: ${i.observed.slice(0, 160)})` : ""}`),
    ...(files.length ? ["Files then:", ...files.slice(0, 40).map((f) => `  ${f}`)] : []),
    "",
  ].join("\n");
}

/** The tail of the progress file when it's long: the newest stages matter most. */
export const progressTail = (text: string) => (text.length > PROGRESS_CHARS ? `…${text.slice(-PROGRESS_CHARS)}` : text);

/**
 * The first message of a stage's session: where the work stands and what this stage is, with no
 * history of the earlier sessions (that is the point). `request` is the person's request (or a
 * pointer to it), `names` what the code defines, `files` the folder.
 */
export function stagePrompt(o: {
  a: Acceptance;
  stage: number;
  request: string;
  progress: string;
  names: string[];
  files: string[];
  notes: string | null;
  latest?: string;
}): string {
  const { a, stage } = o;
  const last = stage === a.milestones.length;
  const name = a.milestones[stage - 1]?.name ?? "";
  return [
    `This job is built in ${a.milestones.length} stages, each in a fresh session so your memory stays small. You are building stage ${stage} of ${a.milestones.length}: ${name}.`,
    "",
    "THE REQUEST:",
    o.request,
    "",
    `ACCEPTANCE CHECKLIST (also in ${ACCEPTANCE_FILE}). ${CHECKLIST_RULES}`,
    ...checklistText(a, stage),
    ...(o.progress.trim() ? ["", `WHAT EARLIER STAGES DID (${PROGRESS_FILE}):`, progressTail(o.progress).trim()] : ["", "Nothing has been built yet."]),
    ...(o.notes ? ["", "YOUR NOTES FROM EARLIER:", o.notes] : []),
    ...(o.names.length ? ["", "WHAT THE CODE DEFINES NOW (call these by exactly these names):", ...o.names] : []),
    ...(o.files.length ? ["", "FILES IN THE FOLDER:", ...o.files] : []),
    ...(o.latest ? ["", "THE PERSON'S LATEST MESSAGE:", o.latest] : []),
    "",
    `Build only this stage's items now. Read the files you need from earlier stages and reuse them; don't rewrite what is finished unless one of its items fails. Save each file as soon as it's written, and try what you build. ${last ? "This is the last stage: when you finish, your final answer summarizes the whole product (what was built, the files, how to use it) and anything not done." : "When this stage is done, reply with a short summary of it."}`,
  ].join("\n");
}

/**
 * A snapshot commit of the work in the task's folder (a restore point for a bad later stage).
 * Best effort: without git, or on a folder it can't use, nothing happens. The agent's own files stay
 * its own: `.git` is handed over to the task's user.
 */
export async function gitSnapshot(workdir: string, message: string, chown?: (path: string) => Promise<void>): Promise<boolean> {
  const git = (...args: string[]) => run("git", ["-c", "safe.directory=*", "-c", "user.name=Aatmiq", "-c", "user.email=work@localhost", "-c", "core.autocrlf=false", ...args], { cwd: workdir, timeout: 30_000 });
  try {
    await git("rev-parse", "--is-inside-work-tree").catch(async () => {
      await git("init", "-q");
    });
    // The task's own bookkeeping isn't part of the product.
    await mkdir(join(workdir, ".git", "info"), { recursive: true });
    const exclude = await readFile(join(workdir, ".git", "info", "exclude"), "utf8").catch(() => "");
    if (!exclude.includes("/.task/")) await writeFile(join(workdir, ".git", "info", "exclude"), `${exclude}${exclude && !exclude.endsWith("\n") ? "\n" : ""}/.task/\n/downloads/\n/screenshots/\n`);
    await git("add", "-A");
    await git("commit", "-q", "--allow-empty", "-m", message);
    await chown?.(join(workdir, ".git"));
    return true;
  } catch {
    return false;
  }
}
