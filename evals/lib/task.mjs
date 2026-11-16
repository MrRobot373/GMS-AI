/** Loading tasks: evals/tasks/<id>/{task.json, instruction.md, grade.mjs, solution/, broken/}. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TASKS = join(ROOT, "tasks");

const NEEDS = new Set(["browser", "web", "judge", "office", "playwright"]);

/** One task, read from its folder (throws with the task's name when it is malformed). */
export function loadTask(id, root = TASKS) {
  const dir = join(root, id);
  const fail = (m) => {
    throw new Error(`eval task "${id}": ${m}`);
  };
  if (!existsSync(join(dir, "task.json"))) fail("task.json is missing");
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(dir, "task.json"), "utf8"));
  } catch (e) {
    fail(`task.json is not valid JSON (${e.message})`);
  }
  if (meta.id !== id) fail(`"id" must be the folder name ("${id}"), not "${meta.id}"`);
  if (!existsSync(join(dir, "instruction.md"))) fail("instruction.md is missing");
  if (!existsSync(join(dir, "grade.mjs"))) fail("grade.mjs is missing");
  if (!meta.criteria || !Object.keys(meta.criteria).length) fail('"criteria" must name at least one criterion');
  for (const [k, v] of Object.entries(meta.criteria)) if (!/^[a-z][a-z0-9_]*$/.test(k) || typeof v !== "string" || !v.trim()) fail(`criterion "${k}" needs a snake_case name and a sentence`);
  for (const j of meta.judged ?? []) if (!(j in meta.criteria)) fail(`judged criterion "${j}" is not in "criteria"`);
  for (const r of meta.requires ?? []) if (!NEEDS.has(r)) fail(`unknown requirement "${r}" (one of ${[...NEEDS].join(", ")})`);
  return {
    id,
    dir,
    category: meta.category ?? "general",
    title: meta.title ?? id,
    tags: meta.tags ?? [],
    timeoutSec: meta.timeoutSec ?? 600,
    requires: meta.requires ?? [],
    criteria: meta.criteria,
    judged: meta.judged ?? [],
    instruction: readFileSync(join(dir, "instruction.md"), "utf8").trim(),
  };
}

/** Every task, sorted by id. */
export function loadTasks(root = TASKS) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => statSync(join(root, d)).isDirectory())
    .sort()
    .map((id) => loadTask(id, root));
}

/** The tasks a command line asks for: ids, categories or tags, comma separated; empty means all. */
export function select(tasks, spec) {
  const want = String(spec ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!want.length) return tasks;
  const picked = tasks.filter((t) => want.some((w) => w === t.id || w === t.category || t.tags.includes(w)));
  const unknown = want.filter((w) => !tasks.some((t) => w === t.id || w === t.category || t.tags.includes(w)));
  if (unknown.length) throw new Error(`no task, category or tag called ${unknown.map((u) => `"${u}"`).join(", ")}. Tasks: ${tasks.map((t) => t.id).join(", ")}.`);
  return picked;
}
