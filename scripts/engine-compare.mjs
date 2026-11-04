#!/usr/bin/env node
/**
 * Run the same brief on Work AI (the DSH engine) and Super AI (the Claude Code engine), one after
 * the other, with the same model, and put the results side by side (docs/20-super-ai.md).
 *
 *   AATMIQ_EMAIL=you@example.com AATMIQ_PASSWORD=… \
 *   node scripts/engine-compare.mjs --prompt-file scripts/briefs/primes-smoke.md --model main
 *
 * It signs in as you, creates a task per engine, approves every approval the task asks for, waits
 * for it to finish (or stops it at the time limit), and saves for each engine: result.json (status,
 * time, tokens, tool calls and errors, the final answer), events.json (the whole timeline) and
 * files/ (everything the task made, byte for byte). summary.md puts the engines next to each other.
 * With --audit it also runs the document audit (python3 + python-pptx/openpyxl/python-docx, and
 * LibreOffice for page counts) on any Excel, PowerPoint or Word files, so office briefs can be judged.
 *
 * Nothing but Node 22 is needed. Settings come from the environment, so no secret is ever written
 * to a file or printed:
 *
 *   AATMIQ_EMAIL, AATMIQ_PASSWORD   the account to sign in as (required)
 *   AATMIQ_URL                      the API (default http://localhost:4000)
 *   AATMIQ_ORIGIN                   the web app's address, which the API checks (default http://localhost:3000)
 *
 * Options:
 *   --prompt "…" | --prompt-file f  the brief (required)
 *   --engine dsh|claude|both        Work AI, Super AI, or both in turn (default both)
 *   --model <name or id>            a model of the Work AI section, by display name or id (default: the workspace's default)
 *   --workspace <name or id>        default: your first workspace
 *   --out <dir>                     default ./engine-compare-out
 *   --label <name>                  names the run's folder (default: the brief's file name, or "brief")
 *   --timeout-min <n>               working-time limit per engine (default 60)
 *   --audit [require]               audit office files, e.g. --audit notes,toc,page_numbers,pages:5-9,slides:10-12,charts:2
 *   --no-approve                    don't approve for the task (it will wait for you in the app)
 *
 * Super AI must be turned on (Admin → Work AI → Super AI) and installed on the server.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/* ───────────── Arguments ───────────── */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
};
if (flag("help") || flag("h")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^\/\*\*\n|^ \* ?/gm, ""));
  process.exit(0);
}
const die = (msg) => {
  console.error(`engine-compare: ${msg}`);
  process.exit(2);
};

const EMAIL = process.env.AATMIQ_EMAIL;
const PASSWORD = process.env.AATMIQ_PASSWORD;
if (!EMAIL || !PASSWORD) die("set AATMIQ_EMAIL and AATMIQ_PASSWORD in the environment (the password is never printed or saved).");
const API = (process.env.AATMIQ_URL ?? "http://localhost:4000").replace(/\/$/, "");
const ORIGIN = (process.env.AATMIQ_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
const promptFile = opt("prompt-file");
const prompt = (opt("prompt") ?? (promptFile ? readFileSync(promptFile, "utf8") : "")).trim();
if (!prompt) die("give the brief with --prompt \"…\" or --prompt-file <file>.");
const engineArg = opt("engine") ?? "both";
if (!["dsh", "claude", "both"].includes(engineArg)) die("--engine is dsh, claude or both.");
const engines = engineArg === "both" ? ["dsh", "claude"] : [engineArg];
const timeoutMs = Number(opt("timeout-min") ?? 60) * 60_000;
const label = (opt("label") ?? (promptFile ? basename(promptFile).replace(/\.[^.]+$/, "") : "brief")).replace(/[^\w.-]+/g, "-");
const outRoot = resolve(opt("out") ?? "engine-compare-out", label);
const auditRequire = flag("audit") ? (opt("audit") ?? "") : null;
const approve = !flag("no-approve");

const NAMES = { dsh: "Work AI (DSH)", claude: "Super AI (Claude Code)" };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, n = 200) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/* ───────────── The API ───────────── */

let cookie = "";
const absorb = (res) => {
  const set = res.headers.getSetCookie?.() ?? [];
  if (!set.length) return;
  const jar = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
  for (const c of set) jar.set(c.split("=")[0], c.split(";")[0]);
  cookie = [...jar.values()].join("; ");
};
const headers = (body) => ({ origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) });

/** A JSON call; a few retries on network blips. Throws with the server's own message on an error status. */
async function call(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(API + path, { method, headers: headers(body), body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) });
      absorb(res);
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${clip(json?.error ?? json?.message ?? text, 300)}`);
      return json;
    } catch (e) {
      if (attempt >= 3 || /→ \d{3}:/.test(e.message)) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
}
async function bytes(path) {
  const res = await fetch(API + path, { headers: headers(), signal: AbortSignal.timeout(120_000) });
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
}

/* ───────────── One run ───────────── */

const FINAL = new Set(["completed", "failed", "cancelled"]);

function summarize(events) {
  const tools = {};
  let toolErrors = 0;
  let finalAnswer = "";
  for (const e of events) {
    if (e.kind === "tool_call") tools[e.data?.name ?? "?"] = (tools[e.data?.name ?? "?"] ?? 0) + 1;
    else if (e.kind === "tool_result" && e.data?.isError) toolErrors++;
    else if (e.kind === "assistant" && (e.data?.text ?? "").trim()) finalAnswer = e.data.text;
  }
  return { tools, toolErrors, finalAnswer };
}

async function runOne({ engine, workspaceId, modelId, dir }) {
  mkdirSync(join(dir, "files"), { recursive: true });
  const result = { engine, name: NAMES[engine], status: "not_started", startedAt: new Date().toISOString(), notes: [] };
  const save = () => writeFileSync(join(dir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  try {
    const created = await call("POST", "/api/work/tasks", { workspaceId, prompt, ...(modelId ? { modelId } : {}), ...(engine === "claude" ? { engine: "claude" } : {}) });
    result.taskId = created.id;
    log(`${NAMES[engine]}: task ${created.id}`);
    save();

    const approved = new Set();
    result.approvalLog = [];
    const t0 = Date.now();
    let snap;
    let last = "";
    for (let errors = 0; ; ) {
      try {
        snap = await call("GET", `/api/work/tasks/${created.id}`);
        errors = 0;
      } catch (e) {
        if (++errors > 10) throw e;
        await sleep(4000);
        continue;
      }
      const st = snap.task.status;
      if (st !== last) log(`${NAMES[engine]}: ${st}`);
      last = st;
      if (approve) {
        const pending = (await call("GET", `/api/work/approvals?workspaceId=${workspaceId}`).catch(() => [])).filter((a) => a.taskId === created.id);
        for (const a of pending) {
          if (approved.has(a.id)) continue;
          approved.add(a.id);
          await call("POST", `/api/work/approvals/${a.id}`, { decision: "approve" }).catch((e) => result.notes.push(`Approval failed: ${e.message}`));
          result.approvalLog.push({ tool: a.toolName, reason: a.reason ?? null });
          log(`${NAMES[engine]}: approved ${a.toolName} (${clip(a.reason, 70)})`);
        }
      }
      if (FINAL.has(st)) break;
      if (Date.now() - t0 > timeoutMs) {
        result.timedOut = true;
        log(`${NAMES[engine]}: out of time; stopping it`);
        await call("POST", `/api/work/tasks/${created.id}/cancel`, {}).catch(() => undefined);
        await sleep(3000);
        snap = await call("GET", `/api/work/tasks/${created.id}`).catch(() => snap);
        break;
      }
      await sleep(4000);
    }
    await sleep(1500); // the last events are written just before the status changes
    snap = await call("GET", `/api/work/tasks/${created.id}`);
    const t = snap.task;
    writeFileSync(join(dir, "events.json"), `${JSON.stringify(snap.events, null, 1)}\n`);
    const s = summarize(snap.events);
    Object.assign(result, {
      status: result.timedOut ? "timeout" : t.status,
      finishedAt: t.finishedAt ?? new Date().toISOString(),
      inputTokens: t.inputTokens ?? null,
      outputTokens: t.outputTokens ?? null,
      toolCalls: s.tools,
      toolErrors: s.toolErrors,
      approvals: result.approvalLog.length,
      finalAnswer: s.finalAnswer || t.result || "",
      error: t.error ?? null,
      verification: t.verification ? { passed: t.verification.passed, total: t.verification.total, rounds: t.verification.rounds } : null,
    });
    result.seconds = Math.round((Date.parse(result.finishedAt) - Date.parse(result.startedAt)) / 100) / 10;

    const listed = await call("GET", `/api/work/tasks/${created.id}/files`);
    result.files = [];
    const root = join(dir, "files");
    for (const f of listed.files ?? []) {
      const dest = resolve(root, f.path);
      if (dest !== root && !dest.startsWith(root + sep)) continue; // never write outside the folder
      const r = await bytes(`/api/work/tasks/${created.id}/files/content?path=${encodeURIComponent(f.path)}&download=1`);
      if (r.status === 200) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, r.buf);
      }
      result.files.push({ path: f.path, bytes: f.size, saved: r.status === 200 });
    }
  } catch (e) {
    result.error = result.error ?? clip(e.message, 800);
    result.notes.push(`Runner error: ${clip(e.message, 500)}`);
    if (result.status === "not_started") result.status = "runner_error";
  }
  save();
  return result;
}

/** The document audit on the Excel, PowerPoint and Word files a run made. */
function audit(result, dir) {
  const files = (result.files ?? []).filter((f) => f.saved && /\.(xlsx|pptx|docx)$/i.test(f.path) && !f.path.includes("/")).map((f) => join(dir, "files", f.path));
  if (!files.length) return null;
  const script = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "skills", "library", "document-checks", "scripts", "office_audit.py");
  if (!existsSync(script)) return { error: "document-checks/scripts/office_audit.py not found" };
  const args = ["-I", script, ...files, "--agree", ...(auditRequire ? ["--require", auditRequire] : [])];
  try {
    return { output: execFileSync("python3", args, { encoding: "utf8", timeout: 600_000, stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    // Exit status 1 means "there are failures": the report is still on stdout.
    return e.stdout ? { output: String(e.stdout) } : { error: clip(e.message, 300) };
  }
}

/* ───────────── Main ───────────── */

await call("POST", "/api/auth/sign-in/email", { email: EMAIL, password: PASSWORD });
const me = await call("GET", "/api/me");
const wanted = opt("workspace");
const workspace = (me.workspaces ?? []).find((w) => !wanted || w.id === wanted || w.name.toLowerCase() === wanted.toLowerCase());
if (!workspace) die(`no workspace${wanted ? ` called "${wanted}"` : ""} for this account.`);
const models = await call("GET", `/api/workspaces/${workspace.id}/models?section=work`);
const flat = (models ?? []).flatMap((m) => [m, ...(m.tiers ?? []).map((t) => ({ id: t.modelId, displayName: t.displayName }))]);
const wantedModel = opt("model");
const model = wantedModel ? flat.find((m) => m.id === wantedModel || m.displayName?.toLowerCase() === wantedModel.toLowerCase() || m.modelKey?.toLowerCase() === wantedModel.toLowerCase()) : null;
if (wantedModel && !model) die(`no model "${wantedModel}" for Work AI in this workspace. Available: ${flat.map((m) => m.displayName).join(", ")}.`);
log(`workspace ${workspace.name}; model ${model?.displayName ?? "the workspace default"}; engines ${engines.map((e) => NAMES[e]).join(" then ")}`);
mkdirSync(outRoot, { recursive: true });
writeFileSync(join(outRoot, "brief.md"), `${prompt}\n`);

const results = [];
for (const engine of engines) {
  const dir = join(outRoot, engine);
  const r = await runOne({ engine, workspaceId: workspace.id, modelId: model?.id, dir });
  if (auditRequire !== null) {
    const a = audit(r, dir);
    if (a?.output) writeFileSync(join(dir, "audit.txt"), a.output);
    r.audit = a ? { failures: (a.output?.match(/^\s+FAIL\b/gm) ?? []).length, warnings: (a.output?.match(/^\s+WARN\b/gm) ?? []).length, error: a.error } : null;
  }
  writeFileSync(join(dir, "result.json"), `${JSON.stringify(r, null, 2)}\n`);
  log(`${NAMES[engine]}: ${r.status} in ${r.seconds ?? "?"} s; ${r.files?.length ?? 0} files; tools ${JSON.stringify(r.toolCalls ?? {})}`);
  results.push(r);
}

/* ───────────── Side by side ───────────── */

const n = (v) => (v == null ? "?" : Number(v).toLocaleString("en"));
const row = (title, f) => `| ${title} | ${results.map((r) => f(r)).join(" | ")} |`;
const summary = [
  `# ${label}: ${results.map((r) => r.name).join(" vs ")}`,
  "",
  `Model: ${model?.displayName ?? "the workspace default"}. The brief is in brief.md.`,
  "",
  `| | ${results.map((r) => r.name).join(" | ")} |`,
  `|---|${results.map(() => "---").join("|")}|`,
  row("Status", (r) => r.status + (r.error ? ` (${clip(r.error, 90)})` : "")),
  row("Time", (r) => (r.seconds != null ? `${Math.floor(r.seconds / 60)} min ${Math.round(r.seconds % 60)} s` : "?")),
  row("Tokens in / out", (r) => `${n(r.inputTokens)} / ${n(r.outputTokens)}`),
  row("Tool calls", (r) => Object.entries(r.toolCalls ?? {}).map(([k, v]) => `${k} ${v}`).join(", ") || "none"),
  row("Tool errors", (r) => String(r.toolErrors ?? "?")),
  row("Approvals asked", (r) => String(r.approvals ?? 0)),
  row("Files", (r) => String(r.files?.length ?? 0)),
  ...(results.some((r) => r.verification) ? [row("Independent review", (r) => (r.verification ? `${r.verification.passed} of ${r.verification.total} met, ${r.verification.rounds} round(s)` : "none"))] : []),
  ...(auditRequire !== null ? [row("Audit (FAIL / WARN)", (r) => (r.audit ? `${r.audit.failures} / ${r.audit.warnings}` : "no office files"))] : []),
  "",
  "## What each said at the end",
  "",
  ...results.flatMap((r) => [`### ${r.name}`, "", clip(r.finalAnswer, 1500) || "(nothing)", ""]),
  "Open each engine's files/ folder and judge the work yourself: what it says is not what it did.",
  "",
].join("\n");
writeFileSync(join(outRoot, "summary.md"), summary);
console.log(`\n${summary}\nSaved in ${outRoot}`);
