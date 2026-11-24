/**
 * Agent AI: the opencode engine (https://github.com/anomalyco/opencode, MIT). One `opencode serve --pure` per task,
 * driven over its HTTP API: a session, prompts, and its event stream.
 *
 * Like Super AI, it brings its own prompts and tools (bash, read, write, edit, grep…), and Aatmiq adds the rest:
 * - the model is the task's, through Aatmiq's gateway (the same endpoint Work AI uses), so admins' models, context
 *   sizes, quotas and usage apply;
 * - Aatmiq's tools (web search and reading, browser, documents, calculators, recall) come from opencode/mcp.mjs, and
 *   the task's connectors are opencode's own remote MCP servers;
 * - every action asks first, and Work AI's approval rules decide: safe ones are answered at once, risky ones go to
 *   the person, as in the other engines;
 * - `--pure` (no plugins from npm), no update checks and no sharing: nothing leaves for the internet on its own.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chown, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { briefFor } from "../claude/engine";
import { harnessFile, resolveFromHarness } from "../files";
import { classifyRisk } from "../policy";
import type { HarnessEngine, HarnessEvent, TaskRuntime, TaskSpec } from "../types";
import { mapOpencodeEvent, newOpencodeState, permissionCall, type OpencodeEvent } from "./map";

/** The opencode program: AATMIQ_OPENCODE_BIN, else this platform's build from the opencode-ai package. */
export function opencodeBin(): string | null {
  if (process.env.AATMIQ_OPENCODE_BIN) return existsSync(process.env.AATMIQ_OPENCODE_BIN) ? process.env.AATMIQ_OPENCODE_BIN : null;
  const exe = process.platform === "win32" ? "opencode.exe" : "opencode";
  const os = process.platform === "win32" ? "windows" : process.platform;
  try {
    const req = createRequire(resolveFromHarness("opencode-ai/package.json"));
    for (const name of [`opencode-${os}-${process.arch}`, `opencode-${os}-${process.arch}-baseline`]) {
      try {
        const p = join(dirname(req.resolve(`${name}/package.json`)), "bin", exe);
        if (existsSync(p)) return p;
      } catch {
        /* not this build */
      }
    }
  } catch {
    /* not installed */
  }
  return null;
}

export const opencodeAvailable = async (): Promise<boolean> => opencodeBin() !== null;

const PROVIDER = "aatmiq";
const MODEL = "main";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.floor(n)));

/** opencode's configuration for this task. */
export function opencodeConfig(spec: TaskSpec, mcpEnv: Record<string, string>): Record<string, unknown> {
  const window = Math.max(spec.model.contextWindow || 32_768, 8192);
  return {
    $schema: "https://opencode.ai/config.json",
    autoupdate: false,
    share: "disabled",
    lsp: false,
    formatter: false,
    provider: {
      [PROVIDER]: {
        npm: "@ai-sdk/openai-compatible",
        name: spec.productName,
        options: { baseURL: `${spec.controlUrl}/llm/v1`, apiKey: "{env:AATMIQ_TOKEN}", timeout: false },
        models: {
          [MODEL]: {
            id: spec.model.key,
            name: spec.model.name,
            tool_call: true,
            attachment: !!spec.model.vision,
            limit: { context: window, output: clamp(window / 4, 1024, 32_000) },
          },
        },
      },
    },
    model: `${PROVIDER}/${MODEL}`,
    small_model: `${PROVIDER}/${MODEL}`,
    // Everything asks, and Aatmiq's rules answer (see the engine). Its own web tools would bypass the organization's
    // private search; web_search and web_fetch replace them.
    permission: { "*": "ask", webfetch: "deny", websearch: "deny", codesearch: "deny" },
    mcp: {
      aatmiq: { type: "local", command: [process.execPath, harnessFile("opencode/mcp.mjs")], environment: mcpEnv, enabled: true, timeout: 120_000 },
      ...Object.fromEntries(spec.connectors.map((c) => [c.name, { type: "remote", url: c.url, enabled: true, oauth: false, ...(c.headers && Object.keys(c.headers).length ? { headers: c.headers } : {}) }])),
    },
  };
}

/** Where programs keep settings and caches: private to the task (commands can't write HOME everywhere). */
function cacheDir(spec: TaskSpec) {
  return join(tmpdir(), `aatmiq-task-${basename(dirname(spec.homeDir))}`);
}

export function createOpencodeEngine(opts: { bin?: string } = {}): HarnessEngine {
  return {
    id: "opencode",
    async start(spec, onEvent) {
      const bin = opts.bin ?? opencodeBin();
      if (!bin) throw new Error("Agent AI (opencode) isn't installed on this server.");
      await mkdir(spec.workdir, { recursive: true });
      const home = join(spec.homeDir, "opencode");
      const dirs = { config: join(home, "config"), data: join(home, "data"), cache: join(home, "cache"), state: join(home, "state") };
      for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });
      // The skill library, where opencode looks for skills.
      const skills = join(dirs.config, "opencode", "skills");
      await mkdir(dirname(skills), { recursive: true });
      await rm(skills, { recursive: true, force: true });
      if (spec.skillsDir) await symlink(spec.skillsDir, skills, process.platform === "win32" ? "junction" : "dir").catch(() => undefined); // a junction needs no admin rights on Windows
      const tools = [spec.webSearch && "web", spec.browser && "browser", spec.calculators && "calculators", !spec.review && "documents"].filter(Boolean).join(",");
      const mcpEnv = { AATMIQ_CONTROL_URL: spec.controlUrl, AATMIQ_TOKEN: spec.token, AATMIQ_TOOLS: tools };
      const configPath = join(home, "opencode.json");
      await writeFile(configPath, `${JSON.stringify(opencodeConfig(spec, mcpEnv), null, 2)}\n`, { mode: 0o600 });
      const caches = cacheDir(spec);
      if (process.platform !== "win32") for (const d of [caches, join(caches, "config"), join(caches, "cache")]) await mkdir(d, { recursive: true, mode: 0o700 });
      if (spec.uid !== undefined) {
        const gid = spec.gid ?? spec.uid;
        const own = [spec.workdir, spec.homeDir, home, configPath, ...Object.values(dirs), dirname(skills), join(dirs.config, "opencode"), ...(process.platform !== "win32" ? [caches, join(caches, "config"), join(caches, "cache")] : [])];
        for (const p of own) await chown(p, spec.uid, gid).catch(() => undefined);
      }

      const password = randomBytes(24).toString("hex");
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: home,
        XDG_CONFIG_HOME: dirs.config,
        XDG_DATA_HOME: dirs.data,
        XDG_CACHE_HOME: dirs.cache,
        XDG_STATE_HOME: dirs.state,
        OPENCODE_CONFIG: configPath,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_DISABLE_AUTOUPDATE: "1",
        OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
        OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
        OPENCODE_DISABLE_MODELS_FETCH: "1",
        AATMIQ_TOKEN: spec.token,
        LANG: process.env.LANG ?? "C.UTF-8",
        TZ: process.env.TZ ?? "UTC",
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        ...(process.platform === "win32"
          ? { SystemRoot: process.env.SystemRoot ?? "C:\\Windows", ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT, TEMP: process.env.TEMP, TMP: process.env.TMP, APPDATA: join(home, "appdata"), LOCALAPPDATA: join(home, "localappdata") }
          : { MPLCONFIGDIR: join(caches, "config", "matplotlib"), PIP_CACHE_DIR: join(caches, "cache", "pip"), PYTHONUSERBASE: join(caches, "local"), npm_config_cache: join(caches, "cache", "npm") }),
        // Requests to the gateway go straight to it, never through a proxy.
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      };

      const child: ChildProcess = spawn(bin, ["serve", "--pure", "--hostname", "127.0.0.1", "--port", "0"], {
        cwd: spec.workdir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        ...(spec.uid !== undefined ? { uid: spec.uid, gid: spec.gid ?? spec.uid } : {}),
      });
      let alive = true;
      let stderr = "";
      child.stderr?.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
      const url = await new Promise<string>((resolve, reject) => {
        let out = "";
        const timer = setTimeout(() => reject(new Error(`Agent AI didn't start in time.${stderr ? `\n${stderr.slice(-500)}` : ""}`)), 60_000);
        child.stdout?.on("data", (d) => {
          out += d;
          const m = /listening on (http:\/\/[^\s]+)/.exec(out);
          if (m) {
            clearTimeout(timer);
            resolve(m[1]!.replace(/\/$/, ""));
          }
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`Agent AI stopped while starting (exit ${code}).${stderr ? `\n${stderr.slice(-500)}` : ""}`));
        });
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });
      const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
      const api = async (path: string, init: RequestInit = {}) => {
        const res = await fetch(`${url}${path}`, { ...init, headers: { authorization: auth, "content-type": "application/json", accept: "application/json" } });
        const text = await res.text();
        if (!res.ok) throw new Error(`Agent AI answered ${res.status}: ${text.slice(0, 300)}`);
        return text ? JSON.parse(text) : null;
      };

      const session = (await api("/session", { method: "POST", body: JSON.stringify({ title: "Task" }) })) as { id: string };
      const sid = session.id;
      const connectorNames = spec.connectors.map((c) => c.name);
      const st = newOpencodeState(sid, connectorNames);
      const policy = { approvals: spec.approvals, askForNetwork: spec.askForNetwork, connectors: spec.connectors.map((c) => ({ name: c.name, approveTools: c.approveTools })) };
      const abort = new AbortController();

      /** Ask a person in Aatmiq (a refusal, an expiry or a failure all mean no). */
      const ask = async (name: string, reason: string): Promise<"yes" | "no" | "unavailable"> => {
        const control = async (path: string, init: RequestInit = {}) => {
          const res = await fetch(`${spec.controlUrl}${path}`, { ...init, signal: abort.signal, headers: { authorization: `Bearer ${spec.token}`, "content-type": "application/json" } });
          const body = (await res.json().catch(() => ({}))) as Record<string, any>;
          if (!res.ok) throw new Error(String(body.error ?? res.status));
          return body;
        };
        try {
          const { id } = await control("/approvals", { method: "POST", body: JSON.stringify({ callId: null, toolName: name, reason }) });
          for (;;) {
            if (abort.signal.aborted) return "unavailable";
            const r = await control(`/approvals/${encodeURIComponent(id)}?wait=25`);
            if (r.status === "approved") return "yes";
            if (r.status === "rejected") return "no";
            if (r.status === "expired") return "unavailable";
          }
        } catch {
          return "unavailable";
        }
      };

      const answerPermission = async (p: Record<string, any>) => {
        const call = permissionCall(p, spec.workdir, connectorNames);
        let reason = call.outside ? "Works outside the task's folder" : call.loop ? "The agent is repeating the same step" : classifyRisk({ name: call.name, args: call.args }, policy);
        if (spec.review && reason) reason = null;
        let reply: "once" | "reject" = "once";
        let message: string | undefined;
        if (reason) {
          if (spec.review) reply = "reject";
          else {
            const a = await ask(call.name, reason);
            if (a !== "yes") {
              reply = "reject";
              message = a === "no" ? "The person said no to this action." : "No one was available to approve this action.";
            }
          }
        }
        await api(`/permission/${encodeURIComponent(p.id)}/reply`, { method: "POST", body: JSON.stringify({ reply, ...(message ? { message } : {}) }) }).catch(() =>
          api(`/session/${encodeURIComponent(p.sessionID ?? sid)}/permissions/${encodeURIComponent(p.id)}`, { method: "POST", body: JSON.stringify({ response: reply }) }).catch(() => undefined),
        );
      };

      // The event stream: what the agent does, and what it asks.
      const events = (async () => {
        while (alive && !abort.signal.aborted) {
          try {
            const res = await fetch(`${url}/event`, { headers: { authorization: auth, accept: "text/event-stream" }, signal: abort.signal });
            if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let i: number;
              while ((i = buf.indexOf("\n\n")) >= 0) {
                const chunk = buf.slice(0, i);
                buf = buf.slice(i + 2);
                const data = chunk
                  .split("\n")
                  .filter((l) => l.startsWith("data:"))
                  .map((l) => l.slice(5).trimStart())
                  .join("\n");
                if (!data) continue;
                let ev: OpencodeEvent;
                try {
                  ev = JSON.parse(data) as OpencodeEvent;
                } catch {
                  continue;
                }
                if (ev.type === "permission.asked" || ev.type === "permission.updated") {
                  void answerPermission(ev.properties as Record<string, any>);
                  continue;
                }
                if (ev.type === "question.asked") {
                  const q = ev.properties as { id: string };
                  void api(`/question/${encodeURIComponent(q.id)}/reject`, { method: "POST", body: "{}" }).catch(() => undefined);
                  continue;
                }
                for (const e of mapOpencodeEvent(ev, st)) onEvent(e);
              }
            }
          } catch {
            if (!alive || abort.signal.aborted) return;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      })();

      child.on("exit", (code) => {
        if (!alive) return;
        alive = false;
        abort.abort();
        onEvent({ type: "exit", code, ...(code ? { error: `Agent AI stopped (exit ${code}).${stderr ? `\n${stderr.trim().split("\n").slice(-4).join("\n")}` : ""}` } : {}) });
      });

      // The folder's full path, stated plainly: without it the model guesses one and writes beside the folder.
      const brief = `Your working folder is ${spec.workdir} (this is the current directory). Save every file you make inside it, using paths relative to it; never write above it.\n\n${briefFor(spec)}`;
      const runtime: TaskRuntime = {
        sessionId: sid,
        get alive() {
          return alive;
        },
        async send(text) {
          if (!alive) throw new Error("The agent isn't running.");
          st.turnOpen = true;
          st.turnError = null;
          onEvent({ type: "status", status: "running" } satisfies HarnessEvent);
          await api(`/session/${encodeURIComponent(sid)}/prompt_async`, {
            method: "POST",
            body: JSON.stringify({ parts: [{ type: "text", text }], model: { providerID: PROVIDER, modelID: MODEL }, system: brief }),
          });
        },
        async stop() {
          if (!alive) return;
          await api(`/session/${encodeURIComponent(sid)}/abort`, { method: "POST", body: "{}" }).catch(() => undefined);
          alive = false;
          abort.abort();
          child.kill("SIGTERM");
          await Promise.race([events, new Promise((r) => setTimeout(r, 3000))]);
          if (child.exitCode === null) child.kill("SIGKILL");
          onEvent({ type: "exit", code: 0 });
        },
      };
      return runtime;
    },
  };
}
