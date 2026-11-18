/**
 * Each chat's private folder, where Chat AI runs Python (docs/15-gem-ai.md, "Python in chat"): to calculate, analyse a
 * spreadsheet or a ZIP, draw a chart, or make an Excel, Word, PowerPoint or PDF file the person downloads.
 *
 * Confinement, the same as Work AI's commands:
 * - Landlock (the launcher Work AI's runtime uses): the code can read the system but write only inside the chat's folder
 *   (and /dev/null). It fails closed: with WORK_SANDBOX on and no Landlock, Python isn't offered.
 * - When the API runs as root, the code runs as the person's own Unix user (the same one their Work AI and IDE use),
 *   so it can't read other people's files, and the user firewall keeps it off private networks.
 * - A time limit (whole process group killed), memory and file-size limits, capped output.
 *
 * Layout: <chatDir>/<chatId>/ holds what the code saves (given to the person); inputs/ holds copies of the files the
 * person attached; .run/, .tmp/ are the runner's own.
 */
import { chatDocument, document, eq, type DB } from "@aatmiq/db";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chmod, chown, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { AppContext } from "../context";

export const RUN_TIMEOUT_MS = 90_000;
const OUTPUT_CHARS = 16_000;
const MEMORY_KB = 2_000_000;
const FILE_KB = 300_000;
/** What the folder may hold before new runs are refused (inputs included). */
export const FOLDER_MAX_BYTES = 500 * 1024 * 1024;
const OWN = new Set([".run", ".tmp", ".cache", ".mpl"]);

export interface ChatFile {
  path: string;
  size: number;
  modified: string;
}

export interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  /** Files the run created or changed (outside inputs/ and the runner's own folders). */
  changed: ChatFile[];
}

type Launcher = { path: string; grantArgs: (g: { readOnly?: string[]; readWrite?: string[] }) => string[]; enforcement: "full" | "partial" | "unusable" };

let launcherCache: Launcher | null | undefined;
/** Work AI's Landlock launcher, probed once. null: not installed here. */
function landlock(): Launcher | null {
  if (launcherCache !== undefined) return launcherCache;
  try {
    const m = createRequire(import.meta.url)("@deepseek-ai/node-addon-system/landlock-run") as {
      launcherPath: () => string;
      grantArgs: Launcher["grantArgs"];
      probe: (p?: string, o?: { timeoutMs?: number }) => Launcher["enforcement"];
    };
    const path = m.launcherPath();
    launcherCache = { path, grantArgs: m.grantArgs, enforcement: m.probe(path, { timeoutMs: 3000 }) };
  } catch {
    launcherCache = null;
  }
  return launcherCache;
}

let pythonCache: string | null | undefined;
function python(): string | null {
  if (pythonCache !== undefined) return pythonCache;
  // Windows installs it as "python" (or the "py" launcher); Linux and macOS as "python3".
  const names = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
  pythonCache = null;
  for (const name of names) {
    const r = spawnSync(name, ["-c", "import sys; print(sys.executable)"], { encoding: "utf8", timeout: 5000 });
    if (r.status === 0 && /3\./.test(spawnSync(name, ["-c", "import sys; print(sys.version)"], { encoding: "utf8" }).stdout)) {
      pythonCache = r.stdout.trim() || name;
      break;
    }
  }
  return pythonCache;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n / 2)}\n… (${s.length - n} characters left out) …\n${s.slice(-n / 2)}` : s);

export class ChatSandbox {
  constructor(private ctx: AppContext) {}

  get root() {
    return resolve(this.ctx.cfg.chatDir ?? ".data/chat");
  }
  /** Runs as the person's Unix user (API as root, isolation not off). */
  get isolated() {
    return process.getuid?.() === 0 && this.ctx.cfg.workIsolation !== "off";
  }
  /** Why Python can't run here, or null when it can. */
  unavailable(): string | null {
    if (!python()) return "Python 3 isn't installed on this server (it must run as python, python3 or py).";
    if (this.ctx.cfg.workSandbox === "off") return null;
    if (process.platform === "win32") return "On Windows programs can't be confined, so Python in chat is off. For a test machine only, set WORK_SANDBOX=off to run it unconfined.";
    const l = landlock();
    if (!l || l.enforcement === "unusable") return "This server can't confine programs (no Landlock); set WORK_SANDBOX=off only if you accept running them unconfined.";
    return null;
  }

  dir(chatId: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(chatId)) throw new Error("bad chat id");
    return join(this.root, chatId);
  }

  /** A path inside the chat's folder, or null if it would leave it (or reach the runner's own files). */
  async safe(chatId: string, rel: string): Promise<string | null> {
    const base = this.dir(chatId);
    const p = resolve(base, rel.replace(/^\/+/, ""));
    if (p !== base && !p.startsWith(base + sep)) return null;
    const first = relative(base, p).split(sep)[0] ?? "";
    if (OWN.has(first)) return null;
    // No symlinks on the way: the code could have planted one pointing outside.
    let cur = base;
    for (const part of relative(base, p).split(sep).filter(Boolean)) {
      cur = join(cur, part);
      const s = await lstat(cur).catch(() => null);
      if (!s) break;
      if (s.isSymbolicLink()) return null;
    }
    return p;
  }

  private async prepare(chatId: string, userId: string): Promise<{ dir: string; uid?: number }> {
    const dir = this.dir(chatId);
    await mkdir(this.root, { recursive: true });
    for (const d of [dir, join(dir, "inputs"), join(dir, ".run"), join(dir, ".tmp")]) await mkdir(d, { recursive: true });
    if (!this.isolated) return { dir };
    const uid = await this.ctx.code.uidFor(userId);
    await chmod(this.root, 0o711);
    await chown(dir, uid, uid);
    await chmod(dir, 0o700);
    for (const d of ["inputs", ".run", ".tmp"]) await chown(join(dir, d), uid, uid);
    return { dir, uid };
  }

  /** Copies of the chat's attached documents in inputs/, by their names (what's there already is kept). */
  async syncInputs(chatId: string, userId: string): Promise<string[]> {
    const { dir, uid } = await this.prepare(chatId, userId);
    const docs = await this.ctx.db
      .select({ id: document.id, name: document.name, key: document.storageKey })
      .from(chatDocument)
      .innerJoin(document, eq(document.id, chatDocument.documentId))
      .where(eq(chatDocument.chatId, chatId));
    const names: string[] = [];
    for (const d of docs) {
      const name = basename(d.name).replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 120) || d.id;
      const to = join(dir, "inputs", name);
      names.push(`inputs/${name}`);
      if (await stat(to).catch(() => null)) continue;
      const data = await this.ctx.storage.get(d.key).catch(() => null);
      if (!data) continue;
      await writeFile(to, data);
      if (uid !== undefined) await chown(to, uid, uid);
    }
    return names;
  }

  /** A file the person attached that isn't a document (a ZIP, a script, data): straight into inputs/. */
  async addInput(chatId: string, userId: string, name: string, data: Buffer): Promise<string> {
    const { dir, uid } = await this.prepare(chatId, userId);
    if ((await this.size(chatId)) + data.length > FOLDER_MAX_BYTES) throw new Error("This chat's folder is full.");
    const clean = basename(name).replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 120) || "file";
    const to = join(dir, "inputs", clean);
    await writeFile(to, data);
    if (uid !== undefined) await chown(to, uid, uid);
    return `inputs/${clean}`;
  }

  /** Everything in the folder the person may download, newest first. */
  async list(chatId: string): Promise<ChatFile[]> {
    const base = this.dir(chatId);
    const out: ChatFile[] = [];
    const walk = async (d: string, depth: number) => {
      if (depth > 6 || out.length > 500) return;
      for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (depth === 0 && OWN.has(e.name)) continue;
        if (e.name === "__pycache__") continue;
        const p = join(d, e.name);
        if (e.isDirectory()) await walk(p, depth + 1);
        else if (e.isFile()) {
          const s = await stat(p);
          out.push({ path: relative(base, p).split(sep).join("/"), size: s.size, modified: s.mtime.toISOString() });
        }
      }
    };
    await walk(base, 0);
    return out.sort((a, b) => b.modified.localeCompare(a.modified));
  }

  async size(chatId: string): Promise<number> {
    return (await this.list(chatId)).reduce((n, f) => n + f.size, 0);
  }

  async read(chatId: string, rel: string): Promise<Buffer | null> {
    const p = await this.safe(chatId, rel);
    if (!p) return null;
    const s = await lstat(p).catch(() => null);
    if (!s?.isFile()) return null;
    return readFile(p);
  }

  async remove(chatId: string) {
    await rm(this.dir(chatId), { recursive: true, force: true }).catch(() => undefined);
  }

  /** Run Python in the chat's folder. */
  async run(chatId: string, userId: string, code: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<RunResult> {
    const why = this.unavailable();
    if (why) throw new Error(why);
    if ((await this.size(chatId)) > FOLDER_MAX_BYTES) throw new Error("This chat's folder is full: delete files or start a new chat.");
    await this.syncInputs(chatId, userId);
    const { dir, uid } = await this.prepare(chatId, userId);
    const script = join(dir, ".run", "main.py");
    await writeFile(script, code);
    if (uid !== undefined) await chown(script, uid, uid);
    const before = new Map((await this.list(chatId)).map((f) => [f.path, f.modified]));

    const py = python()!;
    // Limits first, then the program: memory, CPU seconds, file size, processes.
    const limits = `ulimit -v ${MEMORY_KB}; ulimit -t ${Math.ceil((opts.timeoutMs ?? RUN_TIMEOUT_MS) / 1000) + 5}; ulimit -f ${FILE_KB}; ulimit -u 256 2>/dev/null; exec "$0" -I -X utf8 .run/main.py`;
    const windows = process.platform === "win32";
    const l = this.ctx.cfg.workSandbox === "off" || windows ? null : landlock();
    // Windows (WORK_SANDBOX=off): no shell limits and no confinement; the run folder is just the working directory.
    const argv = windows ? [py, "-I", "-X", "utf8", ".run/main.py"] : l ? [l.path, ...l.grantArgs({ readOnly: ["/"], readWrite: ["/dev/null", dir] }), "--", "/bin/sh", "-c", limits, py] : ["/bin/sh", "-c", limits, py];
    const env = {
      ...(windows ? { SystemRoot: process.env.SystemRoot ?? "C:\\Windows", PATHEXT: process.env.PATHEXT ?? "", USERPROFILE: dir } : {}),
      PATH: windows ? (process.env.PATH ?? "") : "/usr/local/bin:/usr/bin:/bin",
      HOME: dir,
      TMPDIR: join(dir, ".tmp"),
      MPLCONFIGDIR: join(dir, ".tmp"),
      MPLBACKEND: "Agg",
      LANG: "C.UTF-8",
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONIOENCODING: "utf-8",
    };
    const child = spawn(argv[0]!, argv.slice(1), { cwd: dir, env, detached: !windows, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...(uid !== undefined ? { uid, gid: uid } : {}) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout = (stdout + b).slice(-OUTPUT_CHARS * 4)));
    child.stderr.on("data", (b) => (stderr = (stderr + b).slice(-OUTPUT_CHARS * 4)));
    let timedOut = false;
    const kill = () => {
      try {
        if (windows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { timeout: 5000 });
        else process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs ?? RUN_TIMEOUT_MS);
    opts.signal?.addEventListener("abort", kill, { once: true });
    const exitCode = await new Promise<number | null>((res) => {
      child.on("close", (c) => res(c));
      child.on("error", () => res(null));
    });
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", kill);
    const changed = (await this.list(chatId)).filter((f) => !f.path.startsWith("inputs/") && before.get(f.path) !== f.modified);
    return { exitCode, timedOut, stdout: clip(stdout, OUTPUT_CHARS), stderr: clip(stderr, OUTPUT_CHARS / 2), changed };
  }
}

/** Remove the folders of chats that no longer exist (deleted, or temporary ones cleaned up). */
export async function sweepChatFolders(db: DB, sandbox: ChatSandbox): Promise<number> {
  const names = await readdir(sandbox.root).catch(() => [] as string[]);
  if (!names.length) return 0;
  const { chat, inArray } = await import("@aatmiq/db");
  const alive = new Set((await db.select({ id: chat.id }).from(chat).where(inArray(chat.id, names))).map((c) => c.id));
  let n = 0;
  for (const name of names) {
    if (alive.has(name)) continue;
    await rm(join(sandbox.root, name), { recursive: true, force: true }).catch(() => undefined);
    n++;
  }
  return n;
}
