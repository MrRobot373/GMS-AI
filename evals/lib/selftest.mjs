/**
 * Grading the graders. For every task: the reference solution (solution/) must pass every criterion, and every known-bad
 * sample (broken/<name>/) must fail the criteria its expect.json names. A grader that passes broken work, or fails good
 * work, is a lie in every score after it: this is how we notice (lossless-memory's lessons: "the measurement tool that
 * claimed a feature had a 0% success rate").
 *
 * A case's folder: files/ (what the agent made), answer.md (its final reply), events.json (its timeline, default none),
 * make.py (runs in a fresh folder to make binary files such as .xlsx; args from make-args.txt), expect.json ({"fail": [...]}).
 * Judged criteria use a stand-in judge that passes, so only the programmatic criteria are checked here.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { makeCtx } from "./ctx.mjs";
import { EvalError } from "./errors.mjs";
import { gradeRun } from "./score.mjs";

const standIn = (task) => async (names) => Object.fromEntries((names ?? task.judged).map((n) => [n, { pass: true, why: "(stand-in judge)" }]));

async function materialize(task, caseDir, makePy) {
  const dir = mkdtempSync(join(tmpdir(), `eval-${task.id}-`));
  if (existsSync(join(caseDir, "files"))) cpSync(join(caseDir, "files"), dir, { recursive: true });
  const make = existsSync(join(caseDir, "make.py")) ? join(caseDir, "make.py") : makePy;
  if (make && existsSync(make)) {
    const args = existsSync(join(caseDir, "make-args.txt")) ? readFileSync(join(caseDir, "make-args.txt"), "utf8").trim().split(/\s+/) : [];
    const r = spawnSync("python3", [make, ...args], { cwd: dir, encoding: "utf8", timeout: 120_000 });
    if (r.error?.code === "ENOENT") throw new EvalError("python3 isn't installed here");
    if (r.status !== 0) throw new EvalError(`make.py failed: ${String(r.stderr).split("\n").filter(Boolean).slice(-2).join(" | ")}`);
  }
  return dir;
}

/** One case. Returns { task, name, outcome: "ok" | "problem" | "not-run", detail }. */
async function runCase(task, grade, name, caseDir, expectFail, makePy) {
  let dir;
  try {
    dir = await materialize(task, caseDir, makePy);
    const answer = existsSync(join(caseDir, "answer.md")) ? readFileSync(join(caseDir, "answer.md"), "utf8") : "";
    const events = existsSync(join(caseDir, "events.json")) ? JSON.parse(readFileSync(join(caseDir, "events.json"), "utf8")) : [];
    const ctx = makeCtx({ answer, dir, events, judge: standIn(task), info: { webSearch: true, browser: true } });
    const g = await gradeRun({ task, grade, ctx });
    if (g.status === "error") return { task: task.id, name, outcome: "not-run", detail: g.error };
    if (g.status === "skipped") return { task: task.id, name, outcome: "not-run", detail: g.error };
    if (!expectFail) {
      const failed = Object.entries(g.reward).filter(([, v]) => v === 0).map(([k]) => k);
      return failed.length ? { task: task.id, name, outcome: "problem", detail: `the reference solution fails: ${failed.join(", ")}${Object.keys(g.notes).length ? ` (${JSON.stringify(g.notes)})` : ""}` } : { task: task.id, name, outcome: "ok" };
    }
    const stillPass = expectFail.filter((k) => g.reward[k] !== 0);
    return stillPass.length ? { task: task.id, name, outcome: "problem", detail: `known-bad work passes: ${stillPass.join(", ")}` } : { task: task.id, name, outcome: "ok" };
  } catch (e) {
    return { task: task.id, name, outcome: e instanceof EvalError ? "not-run" : "problem", detail: String(e.message ?? e).split("\n")[0] };
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

export async function selftest(tasks) {
  const results = [];
  for (const task of tasks) {
    const grade = (await import(new URL(`file://${join(task.dir, "grade.mjs")}`).href)).default;
    if (typeof grade !== "function") {
      results.push({ task: task.id, name: "grade.mjs", outcome: "problem", detail: "must export a default function" });
      continue;
    }
    const sol = join(task.dir, "solution");
    if (!existsSync(sol)) results.push({ task: task.id, name: "solution", outcome: "problem", detail: "has no solution/ (a grader nobody has seen pass can't be trusted)" });
    else results.push(await runCase(task, grade, "solution", sol, null, null));
    const broken = join(task.dir, "broken");
    if (existsSync(broken)) {
      for (const name of readdirSync(broken).sort()) {
        const d = join(broken, name);
        if (!existsSync(join(d, "expect.json"))) continue;
        const expect = JSON.parse(readFileSync(join(d, "expect.json"), "utf8"));
        const makePy = existsSync(join(sol, "make.py")) ? join(sol, "make.py") : null;
        results.push(await runCase(task, grade, `broken/${name}`, d, expect.fail ?? [], makePy));
      }
    }
  }
  return results;
}
