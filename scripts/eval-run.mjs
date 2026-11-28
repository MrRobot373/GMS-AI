#!/usr/bin/env node
/**
 * Run the eval tasks (evals/) on Work AI and Super AI and score them per criterion. See evals/README.md.
 *
 *   AATMIQ_EMAIL=you@example.com AATMIQ_PASSWORD=… node scripts/eval-run.mjs --engine both --model main --judge-model main
 *   node scripts/eval-run.mjs --list
 *   node scripts/eval-run.mjs --selftest           # grades the graders: needs no server, no model
 *
 * Options:
 *   --engine dsh|claude|opencode|both|all   Work AI, Super AI, Agent AI; both = Work AI and Super AI; all = the three (default dsh)
 *   --model <name>             the Work AI model under test (default: the workspace's)
 *   --judge-model <name>       a chat model that judges the criteria a program can't check (one judge for every run)
 *   --task a,b                 task ids, categories or tags (default all)
 *   --attempts N               runs per task and engine (default 1)
 *   --out <dir>                default ./eval-out/<time>
 *   --workspace <name or id>   default: your first workspace
 *   --timeout-min N            cap each task's time (default: the task's own)
 *   --no-judge                 leave out tasks that need the judge
 *   --no-approve               don't approve for the task
 *   --json                     print results.json to stdout when done
 * Settings (never written to a file): AATMIQ_EMAIL, AATMIQ_PASSWORD, AATMIQ_URL, AATMIQ_ORIGIN.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, clip } from "../evals/lib/client.mjs";
import { makeCtx, listFiles } from "../evals/lib/ctx.mjs";
import { makeJudge } from "../evals/lib/judge.mjs";
import { gradeRun, report, summarize } from "../evals/lib/score.mjs";
import { selftest } from "../evals/lib/selftest.mjs";
import { loadTasks, select } from "../evals/lib/task.mjs";
import { runTask } from "../evals/lib/client.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
};
const die = (m) => {
  console.error(`eval-run: ${m}`);
  process.exit(2);
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let tasks;
try {
  tasks = select(loadTasks(), opt("task"));
} catch (e) {
  die(e.message);
}

if (flag("list")) {
  for (const t of tasks) console.log(`${t.id.padEnd(22)} ${t.category.padEnd(11)} ${t.title}${t.judged.length ? "  [judge]" : ""}${t.requires.length ? `  needs: ${t.requires.join(", ")}` : ""}`);
  process.exit(0);
}

if (flag("selftest")) {
  const rows = await selftest(tasks);
  let bad = 0;
  for (const r of rows) {
    if (r.outcome === "problem") bad++;
    console.log(`${r.outcome === "ok" ? "ok     " : r.outcome === "problem" ? "PROBLEM" : "not run"}  ${r.task} / ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
  }
  const notRun = rows.filter((r) => r.outcome === "not-run").length;
  console.log(`\n${rows.length - bad - notRun} ok, ${bad} problem(s), ${notRun} not run (a tool is missing here).`);
  process.exit(bad ? 1 : 0);
}

/* ───────────── A real run ───────────── */

const EMAIL = process.env.AATMIQ_EMAIL;
const PASSWORD = process.env.AATMIQ_PASSWORD;
if (!EMAIL || !PASSWORD) die("set AATMIQ_EMAIL and AATMIQ_PASSWORD in the environment (never on the command line).");
const engineArg = opt("engine") ?? "dsh";
if (!["dsh", "claude", "opencode", "both", "all"].includes(engineArg)) die('--engine must be "dsh", "claude", "opencode", "both" or "all".');
const engines = engineArg === "both" ? ["dsh", "claude"] : engineArg === "all" ? ["dsh", "claude", "opencode"] : [engineArg];
const NAMES = { dsh: "Work AI", claude: "Super AI", opencode: "Agent AI" };
const attempts = Math.max(1, Number(opt("attempts") ?? 1));
const approve = !flag("no-approve");
const outRoot = resolve(opt("out") ?? join("eval-out", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)));
mkdirSync(outRoot, { recursive: true });

const client = createClient();
await client.signIn(EMAIL, PASSWORD);
const workspace = await client.workspace(opt("workspace")).catch((e) => die(e.message));
const model = await client.model(workspace.id, "work", opt("model")).catch((e) => die(e.message));
const judgeModel = await client.model(workspace.id, "chat", opt("judge-model")).catch((e) => die(e.message));
const info = await client.info(workspace.id).catch(() => ({}));
// Whether the server's browser is on (admins only can ask: if it can't be asked, assume it is).
const admin = await client.call("GET", "/api/admin/work").catch(() => null);
if (admin) info.browser = !!admin.settings?.browser && !!admin.browserInstalled;
if (engines.includes("claude") && !info.superAi) die("Super AI is off or not installed on this server (Admin → Work AI).");
if (engines.includes("opencode") && !info.agentAi) die("Agent AI is off or not installed on this server (Admin → Work AI).");
if (flag("no-judge")) tasks = tasks.filter((t) => !t.judged.length);
else if (!judgeModel && tasks.some((t) => t.judged.length)) log("note: no --judge-model, so tasks with judged criteria will count as errors (or leave them out with --no-judge).");
log(`workspace ${workspace.name}; model ${model?.displayName ?? "the workspace default"}; judge ${judgeModel?.displayName ?? "none"}; ${tasks.length} task(s) x ${engines.map((e) => NAMES[e]).join(", ")} x ${attempts}`);

const rows = [];
for (const task of tasks) {
  const grade = (await import(new URL(`file://${join(task.dir, "grade.mjs")}`).href)).default;
  for (const engine of engines) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const row = { taskId: task.id, engine, attempt };
      const dir = join(outRoot, task.id, engine, `attempt-${attempt}`);
      const tag = `${task.id} / ${NAMES[engine]} / ${attempt}`;
      if (task.requires.includes("browser") && info.browser === false) {
        rows.push({ ...row, status: "skipped", reward: {}, error: "this server's browser is off" });
        log(`${tag}: skipped (browser is off)`);
        continue;
      }
      if (task.requires.includes("web") && info.webSearch === false) {
        rows.push({ ...row, status: "skipped", reward: {}, error: "no web search on this server" });
        log(`${tag}: skipped (no web search)`);
        continue;
      }
      log(`${tag}: running`);
      const { result, events } = await runTask({ client, engine, workspaceId: workspace.id, modelId: model?.id, prompt: task.instruction, timeoutMs: Number(opt("timeout-min") ? opt("timeout-min") * 60_000 : task.timeoutSec * 1000), approve, dir, log: (m) => log(`${tag}: ${m}`) });
      const filesDir = join(dir, "files");
      const files = listFiles(filesDir);
      const judge = judgeModel
        ? makeJudge({ ask: (p) => client.ask(workspace.id, judgeModel.id, p), task, answer: result.finalAnswer, dir: filesDir, files })
        : undefined;
      const ctx = makeCtx({ answer: result.finalAnswer, dir: filesDir, events, judge, info });
      const g = await gradeRun({ task, grade, ctx, run: result });
      Object.assign(row, g, { runStatus: result.status, seconds: result.seconds, inputTokens: result.inputTokens, outputTokens: result.outputTokens, approvals: result.approvals, answer: clip(result.finalAnswer, 400) });
      writeFileSync(join(dir, "grade.json"), `${JSON.stringify(row, null, 2)}\n`);
      rows.push(row);
      log(`${tag}: ${g.status === "graded" ? (g.passed ? "PASS" : `FAIL (${Object.entries(g.reward).filter(([, v]) => !v).map(([k]) => k).join(", ")})`) : `${g.status}: ${g.error}`}`);
    }
  }
}

writeFileSync(join(outRoot, "results.json"), `${JSON.stringify({ model: model?.displayName ?? null, judge: judgeModel?.displayName ?? null, engines, attempts, rows, summary: summarize(rows) }, null, 2)}\n`);
const details = rows.filter((r) => r.status !== "graded" || !r.passed).map((r) => `- ${r.taskId} / ${NAMES[r.engine]} / attempt ${r.attempt}: ${r.status === "graded" ? Object.entries(r.reward).filter(([, v]) => !v).map(([k]) => `${k}${r.notes?.[k] ? ` (${r.notes[k]})` : ""}`).join(", ") : `${r.status}: ${r.error}`}`);
const summary = [`# Eval: ${engines.map((e) => NAMES[e]).join(" vs ")}`, "", `Model: ${model?.displayName ?? "the workspace default"}. Judge: ${judgeModel?.displayName ?? "none"}. Attempts per task: ${attempts}.`, "", report(rows, { tasks, engines, names: NAMES }), "", ...(details.length ? ["## What failed", "", ...details, ""] : []), "Errors and skipped tasks are left out of the pass rate: a missing tool or a provider outage is not the agent's mistake.", ""].join("\n");
writeFileSync(join(outRoot, "summary.md"), summary);
console.log(`\n${summary}\nSaved in ${outRoot}`);
if (flag("json")) console.log(readFileSync(join(outRoot, "results.json"), "utf8"));
