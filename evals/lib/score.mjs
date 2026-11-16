/** Turning a grader's answer into a reward, and rewards into a report. */
import { EvalError, Skip } from "./errors.mjs";

/** Provider trouble is not the agent's failure: such a run is an error, not a 0. */
const INFRA = /rate limit|quota|too many requests|overloaded|\b50[234]\b|ECONN|ETIMEDOUT|fetch failed|provider|model server|couldn't reach|runtime (stopped|couldn't start)|didn't start/i;

/**
 * Grade one finished run. `grade` is the task's grade.mjs default export; returns
 *   { status: "graded" | "error" | "skipped", reward: {criterion: 0|1}, notes: {criterion: string}, passed, error }
 */
export async function gradeRun({ task, grade, ctx, run }) {
  const out = { status: "graded", reward: {}, notes: {}, passed: false };
  if (run && (run.status === "runner_error" || (run.status === "failed" && INFRA.test(run.error ?? "")))) {
    return { ...out, status: "error", error: `the run did not finish for reasons outside the agent's work: ${String(run.error ?? run.status).slice(0, 200)}` };
  }
  let raw;
  try {
    raw = await grade(ctx);
  } catch (e) {
    if (e instanceof Skip) return { ...out, status: "skipped", error: e.message };
    if (e instanceof EvalError) return { ...out, status: "error", error: e.message };
    return { ...out, status: "error", error: `the grader itself failed: ${String(e.stack ?? e.message).split("\n").slice(0, 3).join(" | ")}` };
  }
  for (const name of Object.keys(task.criteria)) {
    const v = raw?.[name];
    if (v === undefined) return { ...out, status: "error", error: `the grader gave no result for criterion "${name}"` };
    const pass = typeof v === "object" && v !== null ? v.pass === true : v === true;
    out.reward[name] = pass ? 1 : 0;
    if (typeof v === "object" && v?.note) out.notes[name] = String(v.note).slice(0, 300);
  }
  out.passed = Object.values(out.reward).every((v) => v === 1);
  return out;
}

/** Roll attempts up per task and engine; errors and skips are left out of the score. */
export function summarize(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.taskId}\u0000${r.engine}`;
    if (!groups.has(key)) groups.set(key, { taskId: r.taskId, engine: r.engine, attempts: [] });
    groups.get(key).attempts.push(r);
  }
  return [...groups.values()].map((g) => {
    const graded = g.attempts.filter((a) => a.status === "graded");
    const criteria = {};
    for (const a of graded) for (const [k, v] of Object.entries(a.reward)) (criteria[k] ??= []).push(v);
    return {
      taskId: g.taskId,
      engine: g.engine,
      graded: graded.length,
      passed: graded.filter((a) => a.passed).length,
      errors: g.attempts.filter((a) => a.status === "error").length,
      skipped: g.attempts.filter((a) => a.status === "skipped").length,
      criteria: Object.fromEntries(Object.entries(criteria).map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length])),
    };
  });
}

/** A Markdown table: one row per task, one column per engine, plus the overall pass rate. */
export function report(rows, { tasks, engines, names = { dsh: "Work AI", claude: "Super AI" } }) {
  const sums = summarize(rows);
  const cell = (taskId, engine) => {
    const s = sums.find((x) => x.taskId === taskId && x.engine === engine);
    if (!s) return "–";
    if (!s.graded) return s.skipped ? "skipped" : s.errors ? "error" : "–";
    const failing = Object.entries(s.criteria).filter(([, v]) => v < 1).map(([k]) => k);
    return `${s.passed === s.graded ? "PASS" : s.passed ? "PART" : "FAIL"} ${s.passed}/${s.graded}${failing.length ? ` (${failing.join(", ")})` : ""}${s.errors ? ` +${s.errors} err` : ""}`;
  };
  const total = (engine) => {
    const mine = sums.filter((s) => s.engine === engine);
    const graded = mine.reduce((n, s) => n + s.graded, 0);
    const passed = mine.reduce((n, s) => n + s.passed, 0);
    const errors = mine.reduce((n, s) => n + s.errors, 0);
    return `${graded ? Math.round((passed / graded) * 100) : 0}% (${passed}/${graded}${errors ? `, ${errors} errors left out` : ""})`;
  };
  return [
    `| Task | ${engines.map((e) => names[e] ?? e).join(" | ")} |`,
    `|---|${engines.map(() => "---").join("|")}|`,
    ...tasks.map((t) => `| ${t.id} | ${engines.map((e) => cell(t.id, e)).join(" | ")} |`),
    `| **Pass rate** | ${engines.map(total).join(" | ")} |`,
  ].join("\n");
}
