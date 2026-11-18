#!/usr/bin/env node
/**
 * Bulk, resumable ingest of a folder of documents into GEM AI projects (docs/15-gem-ai.md, "Loading a large corpus").
 * Each sub-folder of <folder> becomes a project (created if it doesn't exist); each file in it is uploaded as a project
 * source and followed until it is ready or failed. Built for the acceptance runs (P0 #4 and #5: 1,000, then 5,000 and
 * 10,000 searchable pages):
 *
 *   KNOWLEDGE_EVAL_URL=http://localhost:3000 KNOWLEDGE_EVAL_EMAIL=you@company.com KNOWLEDGE_EVAL_PASSWORD=… \
 *     node scripts/knowledge-ingest.mjs ./corpus [--state ingest-state.json] [--concurrency 3] [--retries 3] \
 *       [--report ingest-report.json] [--workspace NAME]
 *
 * - Resumable: every file is recorded by SHA-256 in the state file; run it again after an interruption and finished
 *   files are skipped (a file already uploaded but not finished is followed up, not uploaded twice).
 * - Retries each upload with backoff; a file that fails is reported, and the run goes on.
 * - Reports, per project and in total: files, pages, failures, pages per minute, and the slowest files.
 * Exit code 1 when any file failed. Files the server doesn't support are listed as skipped, not failed.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const positional = [];
const opts = {};
for (let i = 0; i < argv.length; i++) argv[i].startsWith("--") ? (opts[argv[i].slice(2)] = argv[++i]) : positional.push(argv[i]);
const [root] = positional;
const base = (process.env.KNOWLEDGE_EVAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = process.env.KNOWLEDGE_EVAL_EMAIL;
const password = process.env.KNOWLEDGE_EVAL_PASSWORD;
if (!root || !email || !password || !existsSync(root)) {
  console.error("Usage: KNOWLEDGE_EVAL_EMAIL=… KNOWLEDGE_EVAL_PASSWORD=… [KNOWLEDGE_EVAL_URL=…] node scripts/knowledge-ingest.mjs <folder> [--state FILE] [--concurrency N] [--retries N] [--report FILE] [--workspace NAME]");
  process.exit(2);
}
const statePath = opts.state ?? "knowledge-ingest-state.json";
const concurrency = Math.max(1, Number(opts.concurrency ?? 3));
const retries = Math.max(1, Number(opts.retries ?? 3));
const SUPPORTED = new Set([".pdf", ".docx", ".xlsx", ".xlsm", ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".log", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = "";
async function call(method, path, body, form) {
  const res = await fetch(base + path, {
    method,
    headers: { origin: process.env.KNOWLEDGE_EVAL_ORIGIN ?? base, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = [...new Map([...cookie.split("; ").filter(Boolean), ...set.map((c) => c.split(";")[0])].map((c) => [c.split("=")[0], c]))].map(([, c]) => c).join("; ");
  return res;
}
const json = async (res) => (res.headers.get("content-type")?.includes("json") ? res.json() : res.text());

if (!(await call("POST", "/api/auth/sign-in/email", { email, password })).ok) {
  console.error("Sign-in failed. Two-step sign-in isn't supported here: use an account without it.");
  process.exit(2);
}
const me = await (await call("GET", "/api/me")).json();
const workspace = opts.workspace ? me.workspaces.find((w) => w.name === opts.workspace || w.id === opts.workspace) : me.workspaces[0];
if (!workspace) {
  console.error("No such workspace for this account.");
  process.exit(2);
}

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { files: {} };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 1));

/** Files to ingest: [{ project, path, name }] (files directly in <folder> go to a project named after it). */
const queue = [];
const skippedType = [];
const walk = (dir, project) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, project ?? e.name);
    else if (e.isFile() && ![statePath, opts.report].filter(Boolean).some((x) => resolve(x) === resolve(p))) (SUPPORTED.has(extname(e.name).toLowerCase()) ? queue : skippedType).push({ project: project ?? basename(root), path: p, name: e.name });
  }
};
walk(root, null);

const projects = new Map((await (await call("GET", `/api/projects?workspaceId=${workspace.id}`)).json()).map((p) => [p.name, p.id]));
async function projectId(name) {
  if (projects.has(name)) return projects.get(name);
  const r = await call("POST", "/api/projects", { workspaceId: workspace.id, name });
  if (!r.ok) throw new Error(`couldn't create project "${name}": ${r.status}`);
  projects.set(name, (await r.json()).id);
  return projects.get(name);
}

async function upload(pid, f) {
  const data = await readFile(f.path);
  const form = new FormData();
  form.append("file", new Blob([data]), f.name);
  for (let attempt = 1; ; attempt++) {
    const res = await call("POST", `/api/projects/${pid}/sources/upload`, undefined, form).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) return (await res.json()).id;
    const msg = `${res.status} ${(await res.text()).slice(0, 160)}`;
    if (attempt >= retries || (res.status >= 400 && res.status < 500 && res.status !== 429)) throw new Error(msg);
    await sleep(1000 * 2 ** attempt);
  }
}

/** Wait until the server has finished the document: { status, pages }. */
async function finished(pid, documentId, timeoutMs = 30 * 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const p = await (await call("GET", `/api/projects/${pid}`)).json();
    const s = p.sources?.find((x) => x.id === documentId);
    if (s && s.status !== "processing") return { status: s.status, pages: s.pageCount ?? 0, error: s.error ?? null };
    await sleep(2000);
  }
  return { status: "timeout", pages: 0, error: "still processing after 30 minutes" };
}

const started = Date.now();
let done = 0;
const total = queue.length;
async function one(f) {
  const hash = createHash("sha256").update(await readFile(f.path)).digest("hex");
  const key = `${f.project}/${hash}`;
  const known = state.files[key];
  if (known?.status === "ready") return void done++;
  const t0 = Date.now();
  try {
    const pid = await projectId(f.project);
    const documentId = known?.documentId ?? (await upload(pid, f));
    state.files[key] = { name: f.name, project: f.project, documentId, status: "uploaded" };
    save();
    const r = await finished(pid, documentId);
    state.files[key] = { name: f.name, project: f.project, documentId, status: r.status, pages: r.pages, error: r.error, seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    state.files[key] = { name: f.name, project: f.project, status: "failed", error: String(e.message ?? e), seconds: Math.round((Date.now() - t0) / 1000) };
  }
  save();
  const r = state.files[key];
  done++;
  console.log(`[${done}/${total}] ${r.status === "ready" ? "✓" : "✗"} ${f.project}/${f.name}${r.pages ? ` (${r.pages} p., ${r.seconds}s)` : ""}${r.error ? ` — ${r.error}` : ""}`);
}
const lanes = Array.from({ length: concurrency }, async () => {
  for (let f; (f = queue.shift()); ) await one(f);
});
await Promise.all(lanes);

const rows = Object.values(state.files);
const ready = rows.filter((r) => r.status === "ready");
const failed = rows.filter((r) => r.status !== "ready");
const pages = ready.reduce((n, r) => n + (r.pages ?? 0), 0);
const minutes = (Date.now() - started) / 60_000;
const byProject = {};
for (const r of rows) (byProject[r.project] ??= { files: 0, pages: 0, failed: 0 }), byProject[r.project].files++, (byProject[r.project].pages += r.status === "ready" ? (r.pages ?? 0) : 0), (byProject[r.project].failed += r.status === "ready" ? 0 : 1);
console.log(`\n${ready.length} files ready (${pages} pages), ${failed.length} failed, ${skippedType.length} skipped (type not supported).`);
console.log(`This run: ${minutes.toFixed(1)} minutes${minutes > 0.05 ? `, about ${Math.round((pages) / minutes)} pages per minute (pages counted over everything ready, so a resumed run reads low)` : ""}.`);
for (const [name, v] of Object.entries(byProject)) console.log(`  ${name}: ${v.files} files, ${v.pages} pages${v.failed ? `, ${v.failed} failed` : ""}`);
for (const r of failed) console.log(`  ✗ ${r.project}/${r.name}: ${r.error}`);
if (opts.report) {
  writeFileSync(opts.report, JSON.stringify({ date: new Date().toISOString(), server: base, files: ready.length, pages, failed: failed.length, skippedType: skippedType.map((f) => f.name), minutes, byProject, slowest: [...ready].sort((a, b) => b.seconds - a.seconds).slice(0, 10).map((r) => ({ name: r.name, pages: r.pages, seconds: r.seconds })), failures: failed }, null, 2));
  console.log(`Report written to ${opts.report}.`);
}
process.exit(failed.length ? 1 : 0);
