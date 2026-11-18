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
 * "documents"?: [names that must be retrieved, each in the top TOP_K passages], "pages"?: [{ "document": name,
 * "page": n }] (a passage from that page must be among the top TOP_K), "contains"?: [words the answer must contain],
 * "notFound"?: true }] }. Questions use the person's token allowance like any other.
 *
 * Options (acceptance P0 #6: at least 24 of 30 questions have the right evidence in the top 5):
 *   --min-pass N       exit 1 unless at least N cases pass (default: all of them)
 *   --top-k N          the right passage must be among the first N retrieved (default 5)
 *   --retrieval-only   stop each question once its passages are retrieved: no model answer, no tokens used.
 *                      Checks only the retrieval parts (documents, pages, unanswerable ones retrieving nothing)
 *   --report FILE      write the results as JSON (per case, plus pass count and latencies) for the release evidence
 * Reports the time to the first answer (p50 / p95). Exit code 1 when the threshold isn't met.
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const positional = [];
const opts = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) positional.push(argv[i]);
  else if (argv[i] === "--retrieval-only") opts.retrievalOnly = true;
  else opts[argv[i].slice(2)] = argv[++i];
}
const [file] = positional;
const minPass = opts["min-pass"] === undefined ? null : Number(opts["min-pass"]);
const topK = Number(opts["top-k"] ?? 5) || 5;
const retrievalOnly = !!opts.retrievalOnly;
const reportFile = opts.report ?? null;
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
    headers: { origin: process.env.KNOWLEDGE_EVAL_ORIGIN ?? base, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
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

/** Reads the answer's server-sent events into { retrieved, cited, status, answer, firstMs }. */
async function ask(projectId, question) {
  const t0 = Date.now();
  const res = await call("POST", "/api/knowledge/ask", { projectId, question });
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 200)}` };
  const out = { retrieved: [], cited: [], status: "", answer: "", firstMs: null };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const handle = (block) => {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!event || !data) return false;
    const d = JSON.parse(data);
    if (event === "start") out.retrieved = d.citations;
    else if (event === "delta" && out.firstMs === null) out.firstMs = Date.now() - t0;
    else if (event === "done") Object.assign(out, { status: d.status, answer: d.answer, cited: d.citations.filter((x) => x.cited) });
    else if (event === "error") out.error = d.message;
    // Retrieval only: the passages are in, so stop here (the server stops the model when the connection closes).
    return retrievalOnly && event === "start";
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop();
    let stop = false;
    for (const b of blocks) stop ||= handle(b);
    if (stop) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  if (buf.trim()) handle(buf);
  out.firstMs ??= Date.now() - t0;
  return out;
}

const tally = { pass: 0, fail: 0, missed: 0, strays: 0 };
const results = [];
const times = [];
for (const [i, c] of set.cases.entries()) {
  const p = projects.find((x) => x.id === c.project || x.name === c.project);
  const label = `${i + 1}. ${c.question}`;
  if (!p) {
    console.log(`✗ ${label}\n    no project "${c.project}"`);
    tally.fail++;
    results.push({ n: i + 1, question: c.question, pass: false, problems: [`no project "${c.project}"`] });
    continue;
  }
  const r = await ask(p.id, c.question);
  const problems = [];
  const top = (r.retrieved ?? []).slice(0, topK);
  if (r.error) problems.push(`error: ${r.error}`);
  else if (c.notFound) {
    if (!retrievalOnly && r.status !== "not_found") problems.push(`should say "not in the documents", answered from ${[...new Set(r.cited.map((x) => x.name))].join(", ") || "no citation"}`);
    if (r.retrieved.length) {
      tally.strays++;
      problems.push(`retrieved ${r.retrieved.length} passage(s) for a question the documents don't answer (${[...new Set(r.retrieved.map((x) => x.name))].join(", ")})`);
    }
  } else {
    if (!retrievalOnly && r.status !== "answered") problems.push(`status ${r.status}, expected an answer`);
    for (const d of c.documents ?? []) {
      const rank = r.retrieved.findIndex((x) => x.name === d) + 1;
      if (!rank) {
        tally.missed++;
        problems.push(`"${d}" wasn't retrieved`);
      } else if (rank > topK) {
        tally.missed++;
        problems.push(`"${d}" came ${rank}th, not in the top ${topK}`);
      } else if (!retrievalOnly && !r.cited.some((x) => x.name === d)) problems.push(`"${d}" was retrieved but not cited`);
    }
    for (const pg of c.pages ?? []) if (!top.some((x) => x.name === pg.document && x.page === pg.page)) problems.push(`page ${pg.page} of "${pg.document}" isn't in the top ${topK}`);
    if (!retrievalOnly) for (const w of c.contains ?? []) if (!r.answer.toLowerCase().includes(String(w).toLowerCase())) problems.push(`answer doesn't contain "${w}"`);
  }
  // Every citation must be a passage that was retrieved for this question.
  if (!retrievalOnly) for (const x of r.cited ?? []) if (!r.retrieved.some((y) => y.chunkId === x.chunkId)) problems.push(`cites [${x.n}] ${x.name}, which wasn't retrieved`);
  if (r.firstMs !== null && !r.error) times.push(r.firstMs);
  if (problems.length) tally.fail++;
  else tally.pass++;
  results.push({ n: i + 1, question: c.question, pass: !problems.length, problems, retrieved: (r.retrieved ?? []).map((x) => `${x.name}${x.page ? ` p.${x.page}` : ""}`), ms: r.firstMs });
  console.log(`${problems.length ? "✗" : "✓"} ${label}${problems.map((m) => `\n    ${m}`).join("")}`);
}

const pct = (q) => (times.length ? [...times].sort((a, b) => a - b)[Math.min(times.length - 1, Math.floor(q * times.length))] : null);
const total = set.cases.length;
console.log(`\n${tally.pass} passed, ${tally.fail} failed of ${total}${retrievalOnly ? " (retrieval only)" : ""}; right evidence needed in the top ${topK}.`);
if (times.length) console.log(`Time to ${retrievalOnly ? "retrieval" : "first answer"}: p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms.`);
if (tally.strays) console.log(`Unanswerable questions retrieved passages ${tally.strays} time(s): try a lower KNOWLEDGE_MAX_DISTANCE (now the server's default 0.5 unless set).`);
if (tally.missed) console.log(`Expected documents were missed ${tally.missed} time(s): check they're processed and in the project, then try a higher KNOWLEDGE_MAX_DISTANCE.`);
const need = minPass ?? total;
const ok = tally.pass >= need;
console.log(ok ? `Threshold met (${tally.pass} ≥ ${need}).` : `Threshold NOT met: ${tally.pass} < ${need}.`);
if (reportFile) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(reportFile, JSON.stringify({ date: new Date().toISOString(), server: base, topK, retrievalOnly, minPass: need, total, passed: tally.pass, p50Ms: pct(0.5), p95Ms: pct(0.95), results }, null, 2));
  console.log(`Report written to ${reportFile}.`);
}
process.exit(ok ? 0 : 1);
