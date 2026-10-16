#!/usr/bin/env node
/**
 * GEM AI Knowledge evaluation (docs/15-gem-ai.md#evaluating-and-tuning-retrieval): asks a running
 * server a set of questions with known answers and reports, for each, whether the right document
 * was retrieved and cited and whether "not in the documents" was said when it should be.
 *
 *   KNOWLEDGE_EVAL_URL=http://localhost:3000 KNOWLEDGE_EVAL_EMAIL=you@company.com \
 *   KNOWLEDGE_EVAL_PASSWORD=… node scripts/knowledge-eval.mjs scripts/knowledge-eval.example.json
 *
 * The set is JSON: { "workspace"?: name, "cases": [{ "project": name or id, "question": "…",
 * "documents"?: [names that must be retrieved], "contains"?: [words the answer must contain],
 * "notFound"?: true }] }. Questions use the person's token allowance like any other.
 * Exit code 1 when any case fails, so it can run before a release.
 */
import { readFileSync } from "node:fs";

const [file] = process.argv.slice(2);
const base = (process.env.KNOWLEDGE_EVAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = process.env.KNOWLEDGE_EVAL_EMAIL;
const password = process.env.KNOWLEDGE_EVAL_PASSWORD;
if (!file || !email || !password) {
  console.error("Usage: KNOWLEDGE_EVAL_EMAIL=… KNOWLEDGE_EVAL_PASSWORD=… [KNOWLEDGE_EVAL_URL=…] node scripts/knowledge-eval.mjs <cases.json>");
  process.exit(2);
}
const set = JSON.parse(readFileSync(file, "utf8"));

let cookie = "";
async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { origin: base, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = [...new Map([...cookie.split("; ").filter(Boolean), ...set.map((c) => c.split(";")[0])].map((c) => [c.split("=")[0], c]))].map(([, c]) => c).join("; ");
  return res;
}

const signIn = await call("POST", "/api/auth/sign-in/email", { email, password });
if (!signIn.ok) {
  console.error(`Sign-in failed (${signIn.status}). Two-step sign-in isn't supported here: use an account without it.`);
  process.exit(2);
}
const me = await (await call("GET", "/api/me")).json();
const workspace = set.workspace ? me.workspaces.find((w) => w.name === set.workspace || w.id === set.workspace) : me.workspaces[0];
if (!workspace) {
  console.error(`No workspace "${set.workspace}" for ${email}.`);
  process.exit(2);
}
const projects = await (await call("GET", `/api/projects?workspaceId=${workspace.id}`)).json();

/** Reads the answer's server-sent events into { retrieved, cited, status, answer }. */
async function ask(projectId, question) {
  const res = await call("POST", "/api/knowledge/ask", { projectId, question });
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 200)}` };
  const out = { retrieved: [], cited: [], status: "", answer: "" };
  for (const block of (await res.text()).split("\n\n")) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!event || !data) continue;
    const d = JSON.parse(data);
    if (event === "start") out.retrieved = d.citations;
    else if (event === "done") Object.assign(out, { status: d.status, answer: d.answer, cited: d.citations.filter((x) => x.cited) });
    else if (event === "error") out.error = d.message;
  }
  return out;
}

const tally = { pass: 0, fail: 0, missed: 0, strays: 0 };
for (const [i, c] of set.cases.entries()) {
  const p = projects.find((x) => x.id === c.project || x.name === c.project);
  const label = `${i + 1}. ${c.question}`;
  if (!p) {
    console.log(`✗ ${label}\n    no project "${c.project}"`);
    tally.fail++;
    continue;
  }
  const r = await ask(p.id, c.question);
  const problems = [];
  if (r.error) problems.push(`error: ${r.error}`);
  else if (c.notFound) {
    if (r.status !== "not_found") problems.push(`should say "not in the documents", answered from ${[...new Set(r.cited.map((x) => x.name))].join(", ") || "no citation"}`);
    if (r.retrieved.length) {
      tally.strays++;
      problems.push(`retrieved ${r.retrieved.length} passage(s) for a question the documents don't answer (${[...new Set(r.retrieved.map((x) => x.name))].join(", ")})`);
    }
  } else {
    if (r.status !== "answered") problems.push(`status ${r.status}, expected an answer`);
    for (const d of c.documents ?? []) {
      if (!r.retrieved.some((x) => x.name === d)) {
        tally.missed++;
        problems.push(`"${d}" wasn't retrieved`);
      } else if (!r.cited.some((x) => x.name === d)) problems.push(`"${d}" was retrieved but not cited`);
    }
    for (const w of c.contains ?? []) if (!r.answer.toLowerCase().includes(String(w).toLowerCase())) problems.push(`answer doesn't contain "${w}"`);
  }
  // Every citation must be a passage that was retrieved for this question.
  for (const x of r.cited ?? []) if (!r.retrieved.some((y) => y.chunkId === x.chunkId)) problems.push(`cites [${x.n}] ${x.name}, which wasn't retrieved`);
  if (problems.length) tally.fail++;
  else tally.pass++;
  console.log(`${problems.length ? "✗" : "✓"} ${label}${problems.map((m) => `\n    ${m}`).join("")}`);
}

console.log(`\n${tally.pass} passed, ${tally.fail} failed of ${set.cases.length}.`);
if (tally.strays) console.log(`Unanswerable questions retrieved passages ${tally.strays} time(s): try a lower KNOWLEDGE_MAX_DISTANCE (now the server's default 0.5 unless set).`);
if (tally.missed) console.log(`Expected documents were missed ${tally.missed} time(s): check they're processed and in the project, then try a higher KNOWLEDGE_MAX_DISTANCE.`);
process.exit(tally.fail ? 1 : 0);
