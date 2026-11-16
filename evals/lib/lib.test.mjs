// node --test evals/
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EvalError, Skip } from "./errors.mjs";
import { judgePrompt, makeJudge, parseVerdict } from "./judge.mjs";
import { gradeRun, report, summarize } from "./score.mjs";
import { loadTask, loadTasks, select } from "./task.mjs";

const task = { id: "t", criteria: { a: "does a", b: "does b" }, judged: ["b"], instruction: "do it" };

test("a failing criterion is a 0, a grader that cannot run is an error, never a 0", async () => {
  const ok = await gradeRun({ task, grade: async () => ({ a: true, b: { pass: false, note: "no" } }), ctx: {} });
  assert.deepEqual([ok.status, ok.reward, ok.passed, ok.notes], ["graded", { a: 1, b: 0 }, false, { b: "no" }]);
  const err = await gradeRun({ task, grade: async () => { throw new EvalError("no browser"); }, ctx: {} });
  assert.deepEqual([err.status, err.error], ["error", "no browser"]);
  const skipped = await gradeRun({ task, grade: async () => { throw new Skip("no web"); }, ctx: {} });
  assert.equal(skipped.status, "skipped");
  const broken = await gradeRun({ task, grade: async () => { throw new TypeError("x is not a function"); }, ctx: {} });
  assert.equal(broken.status, "error");
  assert.match(broken.error, /grader itself failed/);
  const missing = await gradeRun({ task, grade: async () => ({ a: true }), ctx: {} });
  assert.equal(missing.status, "error");
});

test("a run that died of an outage is an error; one that failed on its own work is graded", async () => {
  const grade = async () => ({ a: false, b: false });
  for (const error of ["rate limit exceeded (429)", "The agent runtime stopped (exit code 1): boom", "provider returned 503"]) {
    assert.equal((await gradeRun({ task, grade, ctx: {}, run: { status: "failed", error } })).status, "error", error);
  }
  assert.equal((await gradeRun({ task, grade, ctx: {}, run: { status: "runner_error", error: "fetch failed" } })).status, "error");
  assert.equal((await gradeRun({ task, grade, ctx: {}, run: { status: "failed", error: "The agent stopped unexpectedly." } })).status, "graded");
  assert.equal((await gradeRun({ task, grade, ctx: {}, run: { status: "timeout" } })).status, "graded");
});

test("errors and skips stay out of the pass rate", () => {
  const rows = [
    { taskId: "t", engine: "dsh", status: "graded", passed: true, reward: { a: 1, b: 1 } },
    { taskId: "t", engine: "dsh", status: "graded", passed: false, reward: { a: 1, b: 0 } },
    { taskId: "t", engine: "dsh", status: "error", reward: {} },
    { taskId: "u", engine: "dsh", status: "skipped", reward: {} },
  ];
  const [t, u] = summarize(rows);
  assert.deepEqual([t.graded, t.passed, t.errors, t.criteria], [2, 1, 1, { a: 1, b: 0.5 }]);
  assert.deepEqual([u.graded, u.skipped], [0, 1]);
  const md = report(rows, { tasks: [{ id: "t" }, { id: "u" }], engines: ["dsh"] });
  assert.match(md, /\| t \| PART 1\/2 \(b\) \+1 err \|/);
  assert.match(md, /\| u \| skipped \|/);
  assert.match(md, /50% \(1\/2, 1 errors left out\)/);
});

test("the judge's verdict is read from the JSON in its reply, and asked for again once", async () => {
  assert.deepEqual(parseVerdict('Sure.\n```json\n{"b": {"pass": true, "why": "ok"}}\n```', ["b"]), { b: { pass: true, why: "ok" } });
  assert.equal(parseVerdict('{"b": {"pass": "yes"}}', ["b"]), null);
  assert.equal(parseVerdict("no json", ["b"]), null);
  const prompts = [];
  const replies = ["I think it passes.", '{"b": {"pass": false, "why": "claims a send"}}'];
  const judge = makeJudge({ ask: async (p) => (prompts.push(p), replies.shift()), task, answer: "Sent!", dir: tmpdir(), files: [] });
  assert.deepEqual(await judge(), { b: { pass: false, why: "claims a send" } });
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /- b: does b/);
  assert.doesNotMatch(prompts[0], /- a: /);
  const down = makeJudge({ ask: async () => { throw new Error("502"); }, task, answer: "", dir: tmpdir(), files: [] });
  await assert.rejects(down(), (e) => e instanceof EvalError && /could not be reached/.test(e.message));
  assert.match(judgePrompt({ request: "r", answer: "", files: "(no files)", criteria: { b: "x" } }), /\(it said nothing\)/);
});

test("tasks are checked when loaded, and selected by id, category or tag", () => {
  const root = mkdtempSync(join(tmpdir(), "evals-"));
  const make = (id, meta, extra = true) => {
    mkdirSync(join(root, id));
    writeFileSync(join(root, id, "task.json"), JSON.stringify({ id, ...meta }));
    if (extra) {
      writeFileSync(join(root, id, "instruction.md"), "do it");
      writeFileSync(join(root, id, "grade.mjs"), "export default async () => ({});");
    }
  };
  make("good", { category: "c", tags: ["x"], criteria: { a_b: "sentence" } });
  assert.equal(loadTask("good", root).criteria.a_b, "sentence");
  make("no-criteria", { criteria: {} });
  assert.throws(() => loadTask("no-criteria", root), /at least one criterion/);
  make("bad-name", { criteria: { "Bad Name": "x" } });
  assert.throws(() => loadTask("bad-name", root), /snake_case/);
  make("bad-judged", { criteria: { a: "x" }, judged: ["z"] });
  assert.throws(() => loadTask("bad-judged", root), /judged criterion "z"/);
  make("bad-needs", { criteria: { a: "x" }, requires: ["wifi"] });
  assert.throws(() => loadTask("bad-needs", root), /unknown requirement/);
  make("no-files", { criteria: { a: "x" } }, false);
  assert.throws(() => loadTask("no-files", root), /instruction\.md is missing/);
  const tasks = [loadTask("good", root)];
  assert.equal(select(tasks, "x").length, 1);
  assert.equal(select(tasks, "c").length, 1);
  assert.throws(() => select(tasks, "nope"), /no task, category or tag called "nope"/);
});

test("every shipped task is well formed", () => {
  const tasks = loadTasks();
  assert.ok(tasks.length >= 10);
  for (const t of tasks) assert.ok(t.instruction.length > 10, t.id);
});
