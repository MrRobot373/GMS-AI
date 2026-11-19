/**
 * Undo for a task that works directly in a folder (docs/06-work-ai.md, "Working in a folder"): before the task changes
 * anything, the folder's state is kept privately, so what the task did can be listed and undone, all of it or one file.
 *
 * The copy is a Git repository kept in the task's own private folder (`--git-dir` there, `--work-tree` the person's
 * folder), so nothing is added to their folder: no `.git`, no files. Git ignores what the folder's own `.gitignore` says,
 * and these are never kept: node_modules, virtual environments, caches. A folder over the limits (files or size) isn't
 * snapshotted, and the task says so; a machine without Git skips it too. Files the task changed in a nested Git
 * repository are not tracked (Git keeps only a pointer to it).
 */
import { spawn } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isInside } from "./work-folder";

export const SNAPSHOT_MAX_FILES = 20_000;
export const SNAPSHOT_MAX_BYTES = 1024 * 1024 * 1024;
const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", ".cache", ".next", ".task", ".mypy_cache", ".pytest_cache"]);
const EXCLUDE = [...SKIP].map((n) => `${n}/`).join("\n") + "\n";
const GIT_TIMEOUT_MS = 10 * 60_000;

export type Snapshot = { before: string | null; status: "ok" | "skipped"; note: string | null; at: string };
export type Change = { path: string; status: "added" | "modified" | "deleted" };

interface Repo {
  gitDir: string;
  folder: string;
}
const repoOf = (taskDir: string, folder: string): Repo => ({ gitDir: path.join(taskDir, "snapshot.git"), folder });

/** Run git against the private repository and the person's folder. */
function git(repo: Repo, args: string[], opts: { input?: string } = {}): Promise<{ code: number; out: string; err: string; missing?: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(
      "git",
      ["--git-dir", repo.gitDir, "--work-tree", repo.folder, "-c", "user.name=Aatmiq", "-c", "user.email=aatmiq@localhost", "-c", "core.autocrlf=false", "-c", "core.quotepath=off", "-c", "core.fsmonitor=false", "-c", "gc.auto=0", ...args],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0" }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err = (err + b).slice(-4000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), GIT_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: String(e.message), missing: (e as NodeJS.ErrnoException).code === "ENOENT" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, err });
    });
    child.stdin.end(opts.input ?? "");
  });
}

/** How many files and bytes the folder holds (what would be snapshotted); stops as soon as a limit is passed. */
export async function scanFolder(folder: string): Promise<{ files: number; bytes: number; over: boolean }> {
  let files = 0;
  let bytes = 0;
  const walk = async (dir: string): Promise<boolean> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (await walk(p)) return true;
      } else if (e.isFile()) {
        files++;
        bytes += (await stat(p).catch(() => null))?.size ?? 0;
        if (files > SNAPSHOT_MAX_FILES || bytes > SNAPSHOT_MAX_BYTES) return true;
      }
    }
    return false;
  };
  const over = await walk(folder);
  return { files, bytes, over };
}

/** Keep the folder's current state privately. Never throws: a skipped snapshot says why. */
export async function takeSnapshot(taskDir: string, folder: string): Promise<Snapshot> {
  const at = new Date().toISOString();
  const skipped = (note: string): Snapshot => ({ before: null, status: "skipped", note, at });
  try {
    const scan = await scanFolder(folder);
    if (scan.over) return skipped(`The folder is too large to keep a copy for undo (over ${SNAPSHOT_MAX_FILES.toLocaleString("en")} files or ${Math.round(SNAPSHOT_MAX_BYTES / 1024 / 1024)} MB).`);
    const repo = repoOf(taskDir, folder);
    await mkdir(repo.gitDir, { recursive: true });
    const init = await git(repo, ["init", "--quiet"]);
    if (init.missing) return skipped("Git isn't installed on this machine, so changes can't be undone.");
    if (init.code !== 0) return skipped(`Couldn't keep a copy for undo (${init.err.trim().slice(0, 200)}).`);
    await mkdir(path.join(repo.gitDir, "info"), { recursive: true });
    await writeFile(path.join(repo.gitDir, "info", "exclude"), EXCLUDE);
    const add = await git(repo, ["add", "-A"]);
    if (add.code !== 0) return skipped(`Couldn't keep a copy for undo (${add.err.trim().slice(0, 200)}).`);
    const commit = await git(repo, ["commit", "--quiet", "--allow-empty", "-m", "Before the task"]);
    if (commit.code !== 0) return skipped(`Couldn't keep a copy for undo (${commit.err.trim().slice(0, 200)}).`);
    const head = await git(repo, ["rev-parse", "HEAD"]);
    return { before: head.out.trim(), status: "ok", note: null, at };
  } catch (e) {
    return skipped(`Couldn't keep a copy for undo (${e instanceof Error ? e.message : "error"}).`);
  }
}

const STATUS: Record<string, Change["status"]> = { A: "added", M: "modified", D: "deleted", T: "modified" };

/** What the task changed in the folder since the snapshot. */
export async function changesSince(taskDir: string, folder: string, before: string, limit = 1000): Promise<{ changes: Change[]; total: number }> {
  const repo = repoOf(taskDir, folder);
  await git(repo, ["add", "-A"]);
  const r = await git(repo, ["diff", "--cached", "--name-status", "--no-renames", "-z", before]);
  if (r.code !== 0) throw new Error("Couldn't compare the folder with its earlier state.");
  const parts = r.out.split("\0").filter(Boolean);
  const all: Change[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = STATUS[parts[i]![0]!];
    if (status) all.push({ path: parts[i + 1]!, status });
  }
  return { changes: all.slice(0, limit), total: all.length };
}

/**
 * Put the folder back as it was at the snapshot: all the changes, or only `only` (paths from the changes list). The state
 * just before the undo is kept too, so an undo is itself recoverable by an admin.
 */
export async function undoChanges(taskDir: string, folder: string, before: string, only?: string[]): Promise<{ restored: number; removed: number }> {
  const repo = repoOf(taskDir, folder);
  const { changes } = await changesSince(taskDir, folder, before, Number.MAX_SAFE_INTEGER);
  const pick = only ? new Set(only) : null;
  const chosen = changes.filter((c) => !pick || pick.has(c.path));
  await git(repo, ["commit", "--quiet", "--allow-empty", "-m", "Before the undo"]);
  let removed = 0;
  for (const c of chosen.filter((x) => x.status === "added")) {
    const full = path.resolve(folder, c.path);
    if (!isInside(folder, full)) continue;
    await rm(full, { force: true });
    removed++;
  }
  const back = chosen.filter((x) => x.status !== "added").map((x) => x.path);
  for (let i = 0; i < back.length; i += 100) {
    const r = await git(repo, ["checkout", before, "--", ...back.slice(i, i + 100)]);
    if (r.code !== 0) throw new Error("Couldn't restore some files.");
  }
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "--quiet", "--allow-empty", "-m", "After the undo"]);
  return { restored: back.length, removed };
}
