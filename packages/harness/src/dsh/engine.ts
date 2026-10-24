/**
 * DeepSeek Harness engine: one `dsh --profile sdk` process per task, driven over stdio JSON-RPC.
 * The process runs in the task's folder with a scrubbed environment; models, approvals and search
 * go back to Aatmiq through the per-task token.
 */
import { JsonRpcLineTransport } from "@deepseek-ai/dsh-sdk-protocol";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, chown, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { stripReminders } from "../../dsh-plugin/tooling.mjs";
import { resolveFromHarness } from "../files";
import type { HarnessEngine, HarnessEvent, TaskRuntime, TaskSpec } from "../types";
import { buildPatch, PROVIDER_ID } from "./patch";

/** Where the DSH CLI lives: AATMIQ_DSH_CLI (production images, see deploy/dsh), else this package's copy. */
export async function dshCli(): Promise<string> {
  if (process.env.AATMIQ_DSH_CLI) return process.env.AATMIQ_DSH_CLI;
  const pkgPath = resolveFromHarness("@deepseek-ai/dsh/package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { bin?: string | Record<string, string> };
  const bin = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin?.dsh ?? Object.values(pkg.bin ?? {})[0]);
  if (!bin) throw new Error("The DeepSeek Harness package has no CLI entry");
  return join(dirname(pkgPath), bin);
}

export interface Launcher {
  /** Start the runtime process. Process mode runs it directly; container mode wraps it. */
  spawn(args: { cli: string; argv: string[]; cwd: string; env: NodeJS.ProcessEnv; spec: TaskSpec }): ChildProcess;
}

export const processLauncher: Launcher = {
  spawn: ({ cli, argv, cwd, env, spec }) =>
    spawn(process.execPath, [cli, ...argv], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      ...(spec.uid !== undefined ? { uid: spec.uid, gid: spec.gid ?? spec.uid } : {}),
    }),
};

type DshSessionEvent = { type: string; data?: Record<string, unknown> };
type Block = { type: string; text?: string; id?: string; name?: string };

const textOf = (content: unknown) =>
  Array.isArray(content)
    ? (content as Block[])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
    : "";

/** A shell command's ending marker (DSH's bash tool, on a line of its own): the exit code, or how it was stopped. */
const SHELL_END = /(?:^|\n)\[(?:exit code: (-?\d+)|killed by signal: [^\]\n]+|timed out after \d+ms)\]\s*$/;
const SHELL_TOOLS = new Set(["bash", "pwsh"]);

/**
 * Why a call never ran, from its error text (arguments it couldn't take, a tool it doesn't have,
 * an approval that couldn't be asked): those read "Not run" rather than as a failed step.
 */
export function notRunReason(text: string): string | null {
  const m = /^Error: (invalid arguments: .+|unknown tool .+|tool "[^"]+" requires approval, but .+|approval for tool "[^"]+" was cancelled)$/s.exec(text.trim());
  return m ? m[1]!.replace(/^invalid arguments: /, "").trim() : null;
}

/**
 * How a shell command failed, from the marker DSH ends its output with: its exit code (null when a
 * signal or the timeout stopped it). Null when it succeeded.
 */
export function shellFailure(text: string): { exitCode: number | null } | null {
  const m = SHELL_END.exec(text);
  if (!m) return null;
  if (m[1] === undefined) return { exitCode: null };
  return Number(m[1]) === 0 ? null : { exitCode: Number(m[1]) };
}

/**
 * Translate one DSH session event into Aatmiq's vocabulary (or nothing). `calls` remembers each
 * call's tool by its id, so a shell command that exits non-zero can be reported as failed.
 */
export function mapEvent(ev: DshSessionEvent, calls?: Map<string, string>): HarnessEvent | null {
  const d = ev.data ?? {};
  switch (ev.type) {
    case "user/message": {
      const src = d.source as { kind?: string } | undefined;
      if (src?.kind !== "user") return null; // runtime context and plugin notes stay internal
      return { type: "user", id: String(d.id ?? ""), text: textOf(d.content) };
    }
    case "assistant/message": {
      const m = d.message as { id?: string; content?: Block[] } | undefined;
      const usage = d.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      return {
        type: "assistant",
        id: String(m?.id ?? ""),
        text: textOf(m?.content),
        toolCalls: (m?.content ?? []).filter((b) => b.type === "tool-call").map((b) => ({ callId: String(b.id), name: String(b.name) })),
        usage: usage ? { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } : undefined,
      };
    }
    case "tool/call": {
      let args: unknown = d.arguments;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          /* keep the raw string */
        }
      }
      if (calls) {
        calls.set(String(d.callId), String(d.name));
        // Only the latest calls matter; a long task shouldn't keep every id.
        if (calls.size > 500) calls.delete(calls.keys().next().value!);
      }
      return { type: "tool_call", callId: String(d.callId), name: String(d.name), args };
    }
    case "tool/result": {
      const m = d.message as { toolCallId?: string; content?: Block[]; isError?: boolean } | undefined;
      const callId = String(m?.toolCallId ?? "");
      // Plan reminders are for the agent, not for the person reading the step.
      const text = stripReminders(textOf(m?.content));
      const name = calls?.get(callId);
      calls?.delete(callId);
      // DSH returns a command that exited non-zero as a result; for people it's a failed step.
      const failed = !m?.isError && name && SHELL_TOOLS.has(name) ? shellFailure(text) : null;
      const notRun = m?.isError ? notRunReason(text) : null;
      return {
        type: "tool_result",
        callId,
        text,
        isError: !!m?.isError || failed !== null,
        ...(failed?.exitCode != null ? { exitCode: failed.exitCode } : {}),
        ...(notRun ? { notRun } : {}),
      };
    }
    case "todo/write": {
      const items = (d.todos ?? d.items) as { content?: string; status?: string }[] | undefined;
      return Array.isArray(items) ? { type: "plan", items: items.map((t) => ({ content: String(t.content ?? ""), status: String(t.status ?? "pending") })) } : null;
    }
    // Older steps were condensed to make room (a failed attempt closes with an error and changes nothing).
    case "compaction/end":
      return d.error ? null : { type: "compacted" };
    case "session/title":
      return typeof d.title === "string" ? { type: "title", title: d.title } : null;
    case "turn/end": {
      const r = d.reason as { kind?: string; error?: { message?: string } } | undefined;
      return { type: "turn_end", reason: r?.kind ?? "completed", ...(r?.error?.message ? { error: r.error.message } : {}) };
    }
    default:
      return null;
  }
}

/** Proxy settings, passed through so tasks work behind a corporate proxy. */
const PROXY_ENV = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy"];
/**
 * Certificates for a TLS-inspecting firewall: a bundle file each, and a folder. A command that
 * can't read the file one names fails every download ("Could not find a suitable TLS CA certificate
 * bundle"), so a task only ever gets them in a form its own user can read.
 */
const CA_FILE_ENV = ["SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "NODE_EXTRA_CA_CERTS", "PIP_CERT", "CURL_CA_BUNDLE"];
const CA_DIR_ENV = ["SSL_CERT_DIR"];
export const NETWORK_ENV = [...PROXY_ENV, ...CA_FILE_ENV, ...CA_DIR_ENV];
const CA_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Whether `uid` can read a file (or list a folder): its own permissions and every parent folder's.
 * Unset `uid`: this process. Task users have a group of their own, so only owner and other bits count.
 */
export async function readableBy(path: string, uid: number | undefined, folder = false): Promise<boolean> {
  if (uid === undefined || uid === process.getuid?.()) return access(path, constants.R_OK | (folder ? constants.X_OK : 0)).then(() => true, () => false);
  const allows = (s: { uid: number; mode: number }, bits: number) => ((s.uid === uid ? s.mode >> 6 : s.mode) & bits) === bits;
  /** Every folder above `p` can be passed through. */
  const reachable = async (p: string) => {
    for (let d = dirname(p); ; d = dirname(d)) {
      if (!allows(await stat(d), 1)) return false;
      if (dirname(d) === d) return true;
    }
  };
  try {
    const real = await realpath(path);
    const s = await stat(real);
    if (!(folder ? s.isDirectory() : s.isFile()) || !allows(s, folder ? 5 : 4)) return false;
    // A link is followed from where it is: the folders above the name count too, not only the target's.
    return (await reachable(real)) && (real === resolve(path) || (await reachable(resolve(path))));
  } catch {
    return false;
  }
}

/** A copy of a certificate bundle in `dir`, owned by `uid`; null when it can't be made. */
async function copyBundle(src: string, target: { uid?: number; gid?: number; dir?: string }): Promise<string | null> {
  if (!target.dir) return null;
  try {
    const s = await stat(src);
    if (!s.isFile() || s.size > CA_MAX_BYTES) return null;
    const data = await readFile(src);
    await mkdir(target.dir, { recursive: true });
    const dest = join(target.dir, `${createHash("sha256").update(src).digest("hex").slice(0, 12)}-${basename(src)}`);
    await writeFile(dest, data, { mode: 0o644 });
    await chmod(dest, 0o644);
    if (target.uid !== undefined) {
      const gid = target.gid ?? target.uid;
      await chown(target.dir, target.uid, gid);
      await chown(dest, target.uid, gid);
    }
    return dest;
  } catch {
    return null;
  }
}

/**
 * The deployment's network settings for a process run as `target.uid` (this process's user when
 * unset). Proxy settings pass as they are. A certificate file that user can't read is copied into
 * `target.dir` (a folder of its own) and the variable names the copy; a folder it can't read, or a
 * file that can't be copied, is left out, so tools fall back to the system's certificates.
 */
export async function networkEnv(target: { uid?: number; gid?: number; dir?: string } = {}): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of PROXY_ENV) if (process.env[k]) out[k] = process.env[k]!;
  const copies = new Map<string, string | null>();
  for (const k of CA_FILE_ENV) {
    const src = process.env[k];
    if (!src) continue;
    if (await readableBy(src, target.uid)) {
      out[k] = src;
      continue;
    }
    if (!copies.has(src)) copies.set(src, await copyBundle(src, target));
    const copy = copies.get(src);
    if (copy) out[k] = copy;
  }
  for (const k of CA_DIR_ENV) {
    const src = process.env[k];
    if (src && (await readableBy(src, target.uid, true))) out[k] = src;
  }
  return out;
}

/**
 * Put `extras` in front of `base`, skipping a directory that is already listed.
 * Comparison ignores case and a trailing slash, so `C:\Windows\System32` and
 * `c:\windows\system32\` are the same entry.
 */
export function prependPath(base: string | undefined, extras: string[], sep: string): string {
  const keyOf = (dir: string) => dir.replace(/[\\/]+$/, "").trim().toLowerCase();
  const have = new Set((base ?? "").split(sep).map(keyOf).filter(Boolean));
  const add: string[] = [];
  for (const dir of extras) {
    const key = keyOf(dir);
    if (!key || have.has(key)) continue;
    have.add(key);
    add.push(dir);
  }
  return [...add, base].filter((s) => s && s.length > 0).join(sep);
}

/**
 * Directories a Windows task shell needs even when the API process was started with a short PATH:
 * `cmd.exe`, Windows PowerShell, and a real Python (ahead of the Store alias, which PowerShell
 * refuses to run inside a pipeline).
 */
export async function windowsPathExtras(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const extras = [join(systemRoot, "System32"), join(systemRoot, "System32", "WindowsPowerShell", "v1.0")];
  const pyRoot = join(process.env.LOCALAPPDATA || "", "Programs", "Python");
  const found = await readdir(pyRoot, { withFileTypes: true }).catch(() => []);
  const installs = found
    .filter((d) => d.isDirectory() && /^Python\d+/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const name of installs) {
    const dir = join(pyRoot, name);
    if (await access(join(dir, "python.exe")).then(() => true, () => false)) extras.push(dir);
  }
  return extras;
}

/** Environment for the runtime: nothing from the API process leaks in (no database URL, no secrets). */
async function runtimeEnv(spec: TaskSpec): Promise<NodeJS.ProcessEnv> {
  const sep = process.platform === "win32" ? ";" : ":";
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  return {
    PATH: prependPath(process.env.PATH ?? (process.platform === "win32" ? "" : "/usr/local/bin:/usr/bin:/bin"), await windowsPathExtras(), sep),
    HOME: spec.homeDir,
    DSH_HOME: spec.homeDir,
    LANG: process.env.LANG ?? "C.UTF-8",
    TZ: process.env.TZ ?? "UTC",
    // Python otherwise encodes stdout as the console code page and a check that prints a
    // non-ASCII character dies, which the agent reads as a failed deliverable and rebuilds.
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    NODE_ENV: "production",
    DSH_PERMISSION_MODE: spec.sandbox === "off" ? "danger-full-access" : "workspace-write",
    AATMIQ_TOKEN: spec.token,
    ...(process.platform === "win32"
      ? {
          SystemRoot: systemRoot,
          ComSpec: join(systemRoot, "System32", "cmd.exe"),
          PATHEXT: process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD",
          ...(process.env.LOCALAPPDATA ? { LOCALAPPDATA: process.env.LOCALAPPDATA } : {}),
        }
      : {}),
    ...(await networkEnv({ uid: spec.uid, gid: spec.gid, dir: join(spec.homeDir, "ca") })),
  };
}

export function createDshEngine(opts: { launcher?: Launcher; initializeTimeoutMs?: number } = {}): HarnessEngine {
  const launcher = opts.launcher ?? processLauncher;
  return {
    id: "dsh",
    async start(spec, onEvent) {
      await mkdir(spec.workdir, { recursive: true });
      await mkdir(spec.homeDir, { recursive: true });
      const patchPath = join(spec.homeDir, "aatmiq.patch.yml");
      await writeFile(patchPath, buildPatch(spec));
      if (spec.uid !== undefined) {
        const gid = spec.gid ?? spec.uid;
        for (const p of [spec.workdir, spec.homeDir, patchPath]) await chown(p, spec.uid, gid);
      }
      const cli = await dshCli();
      const child = launcher.spawn({ cli, argv: ["--profile", "sdk", "--patch", patchPath], cwd: spec.workdir, env: await runtimeEnv(spec), spec });

      let stderr = "";
      child.stderr?.on("data", (b: Buffer) => {
        stderr = (stderr + b.toString()).slice(-4000);
      });
      let alive = true;
      const exited = new Promise<void>((resolve) => {
        child.on("exit", (code) => {
          alive = false;
          onEvent({ type: "exit", code, ...(code ? { error: stderr.trim().split("\n").slice(-5).join("\n") } : {}) });
          resolve();
        });
        child.on("error", (e) => {
          alive = false;
          onEvent({ type: "exit", code: -1, error: e.message });
          resolve();
        });
      });

      const transport = new JsonRpcLineTransport(child.stdout!, child.stdin!);
      // The task's own session; subagents run in sessions of their own. Their steps are shown, but
      // their messages, plans and turn ends are theirs: the task ends when its own turn does and no
      // subagent is still working (a finished subagent wakes the main agent for another turn).
      // `children` holds the subagents working right now.
      const sessionId = `session-${randomUUID().replaceAll("-", "")}`;
      const calls = new Map<string, string>();
      const children = new Set<string>();
      let held: HarnessEvent | null = null;
      let rootRunning = false;
      let settle: NodeJS.Timeout | undefined;
      const releaseHeld = () => {
        clearTimeout(settle);
        settle = setTimeout(() => {
          if (held && !rootRunning && children.size === 0) {
            const e = held;
            held = null;
            onEvent(e);
          }
        }, 3000);
      };
      transport.onNotification((method, params) => {
        if (method === "session.event") {
          const mapped = mapEvent(params.event as DshSessionEvent, calls);
          if (!mapped) return;
          if (params.sessionId !== sessionId) {
            if (mapped.type === "tool_call" || mapped.type === "tool_result") onEvent(mapped);
            return;
          }
          if (mapped.type === "turn_end" && children.size > 0) {
            held = mapped;
            return;
          }
          if (mapped.type === "user" && held) held = null; // the main agent was woken for another turn
          onEvent(mapped);
        } else if (method === "session.status") {
          if (params.sessionId !== sessionId) {
            // A subagent that stopped working (an interrupted one never reports "finished") no
            // longer holds the task open; one that's woken again (a message from the agent) does.
            if (!children.has(String(params.sessionId)) && params.status !== "running") return;
            if (params.status === "running") children.add(String(params.sessionId));
            else children.delete(String(params.sessionId));
            if (held && children.size === 0) releaseHeld();
            return;
          }
          rootRunning = params.status === "running";
          if (rootRunning) held = null;
          onEvent({ type: "status", status: rootRunning ? "running" : "idle" });
        } else if (method === "subagent.started") {
          children.add(String(params.childSessionId));
        } else if (method === "subagent.finished") {
          children.delete(String(params.childSessionId));
          if (held && children.size === 0) releaseHeld();
        }
      });
      transport.start();

      // A cold start on Windows loads the runtime and every skill before this returns.
      // 60 seconds was not enough: the process was alive and the task failed with nothing done.
      const timeout = opts.initializeTimeoutMs ?? 180_000;
      try {
        await Promise.race([
          transport.request("initialize", { cwd: spec.workdir, provider: PROVIDER_ID, model: spec.model.key }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("The agent runtime didn't start in time.")), timeout)),
          exited.then(() => {
            throw new Error(`The agent runtime stopped while starting.${stderr ? ` ${stderr.trim().split("\n").slice(-3).join(" ")}` : ""}`);
          }),
        ]);
      } catch (e) {
        child.kill("SIGKILL");
        // The runtime's own last words explain more than "input closed".
        const tail = stderr.trim().split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 500);
        if (tail && !(e as Error).message.includes(tail)) throw new Error(`The agent runtime couldn't start: ${tail}`);
        if ((e as Error).message === "The agent runtime didn't start in time.") {
          throw new Error("The agent runtime was still starting when the time limit ran out. Send the task again.");
        }
        throw e;
      }

      const runtime: TaskRuntime = {
        sessionId,
        get alive() {
          return alive;
        },
        async send(text) {
          await transport.request("session/prompt", { sessionId, contentBlocks: [{ type: "text", text }] });
        },
        async stop() {
          if (!alive) return;
          try {
            await Promise.race([transport.request("shutdown", {}), new Promise((r) => setTimeout(r, 3000))]);
          } catch {
            /* already gone */
          }
          if (alive) child.kill("SIGTERM");
          await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
          if (alive) child.kill("SIGKILL");
        },
      };
      return runtime;
    },
  };
}
