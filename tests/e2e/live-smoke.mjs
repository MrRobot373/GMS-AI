/**
 * Live smoke test with REAL models (no fake LLM): every AI feature of GEM AI against a running server,
 * through its API. For staging, release candidates and a new model server; it spends tokens.
 *
 *   SMOKE_EMAIL=admin@company.com SMOKE_PASSWORD=… BASE_URL=https://gem.example.com node tests/e2e/live-smoke.mjs
 *
 * Signs in as an org admin (without two-step sign-in), uses the first workspace (or SMOKE_WORKSPACE, by
 * name) and whatever chat models it has, and checks: each model answers; Auto picks a tier; answers from
 * an attached document with a citation; a project's instructions and sources; the calculator tool in
 * chat (rules path, exact numbers); Learning (outline and one validated lesson); Knowledge (cited
 * answer, "not in the documents"); Work AI (writes, runs and saves files); Code (an IDE starts).
 * SMOKE_ONLY=chat,learning,knowledge,work,code runs a subset. Everything it creates is named "[smoke]";
 * SMOKE_CLEANUP=1 deletes it at the end. Exit code 1 when a check fails.
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
const ONLY = new Set((process.env.SMOKE_ONLY ?? "chat,learning,knowledge,work,code").split(",").map((s) => s.trim()));
if (!EMAIL || !PASSWORD) {
  console.error("Set SMOKE_EMAIL and SMOKE_PASSWORD (an org admin without two-step sign-in), and BASE_URL.");
  process.exit(2);
}

let cookie = "";
async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { origin: BASE, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    const map = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
    for (const c of set) map.set(c.split("=")[0], c.split(";")[0]);
    cookie = [...map.values()].join("; ");
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}
async function upload(path, fields, name, type, data) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append("file", new Blob([data], { type }), name);
  const res = await fetch(BASE + path, { method: "POST", headers: { origin: BASE, cookie }, body: fd });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}
/** Server-sent events → [{ event, data }] */
async function sse(path, body) {
  const r = await call("POST", path, body);
  if (r.status !== 200) return { status: r.status, events: [], error: r.text.slice(0, 300) };
  const events = r.text
    .split("\n\n")
    .map((b) => ({ event: /^event: (.+)$/m.exec(b)?.[1], data: /^data: (.+)$/m.exec(b)?.[1] }))
    .filter((e) => e.event)
    .map((e) => {
      let data = e.data;
      try {
        data = JSON.parse(e.data);
      } catch {}
      return { event: e.event, data };
    });
  return { status: 200, events };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, every = 3000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v?.done) return v;
    await sleep(every);
  }
  return v;
}
/** Model answers in LaTeX as often as in plain text: compare numbers on a plain version. */
const plain = (s) => (s ?? "").replace(/\\text\{([^}]*)\}/g, "$1").replace(/[$\\{}]/g, " ").replace(/\s+/g, " ");

let passed = 0;
let failed = 0;
function check(area, name, ok, detail) {
  ok ? passed++ : failed++;
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`${ok ? "PASS" : "FAIL"} [${area}] ${name}${d ? ` :: ${d.slice(0, ok ? 220 : 900)}` : ""}`);
}
const created = { chats: [], projects: [], documents: [], courses: [], tasks: [], code: [] };

const si = await call("POST", "/api/auth/sign-in/email", { email: EMAIL, password: PASSWORD });
if (si.status !== 200) {
  console.error(`Sign-in failed (${si.status}): ${si.text.slice(0, 200)}`);
  process.exit(2);
}
const me = (await call("GET", "/api/me")).json;
const ws = (process.env.SMOKE_WORKSPACE ? me.workspaces.find((w) => w.name === process.env.SMOKE_WORKSPACE) : me.workspaces[0])?.id;
if (!ws) {
  console.error("No workspace.");
  process.exit(2);
}
const models = ((await call("GET", `/api/workspaces/${ws}/models?section=chat`)).json ?? []).filter((m) => m.id !== "auto");
console.log(`${BASE} · workspace ${ws} · ${models.length} chat models: ${models.map((m) => m.displayName).join(", ")}\n`);

const text = (events) => events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
async function ask(content, o = {}) {
  const chat = (await call("POST", "/api/chats", { workspaceId: ws, modelId: o.modelId ?? "auto", projectId: o.projectId, title: `[smoke] ${o.title ?? content.slice(0, 60)}` })).json;
  created.chats.push(chat.id);
  const t = Date.now();
  const r = await sse(`/api/chats/${chat.id}/messages`, { content, documentIds: o.documentIds });
  const ev = (n) => r.events.find((e) => e.event === n)?.data;
  return { chat, ms: Date.now() - t, answer: text(r.events), start: ev("start"), done: ev("done"), error: ev("error")?.message ?? r.error };
}

const SPEC = `GMS-7731 motor drive specification, revision C.
Rated power 7.5 kW at 415 V three-phase, 50 Hz. Rated current 14.2 A.
The drive's switching frequency is 8 kHz, adjustable from 2 to 16 kHz.
Overload: 150 % for 60 seconds every 10 minutes. Ambient temperature range -10 to 50 °C; derate 2 % per °C above 40 °C.`;

if (ONLY.has("chat")) {
  for (const m of models) {
    const r = await ask("In one sentence: what does a buck converter do? Then give the ideal output voltage for Vin = 24 V and duty 0.5.", { modelId: m.id, title: `model ${m.displayName}` });
    check("chat", `${m.displayName} answers`, !r.error && /\b12(\.0+)?\s*V/.test(plain(r.answer)) && r.done?.usage?.outputTokens > 0, { ms: r.ms, error: r.error, answer: r.answer.slice(0, 160) });
  }
  const easy = await ask("hi, thanks!");
  check("auto", "a greeting is answered (Auto)", !easy.error && !!easy.answer, { model: easy.start?.model?.displayName, routing: easy.start?.routing });
  const hard = await ask(
    "Derive the small-signal control-to-output transfer function of a buck converter in continuous conduction mode, including the ESR zero of the output capacitor, and explain how you would design a Type III compensator for 20 kHz crossover with 60° phase margin. Show the equations.",
  );
  // Auto's tiers depend on how the admin set them up; with fast models in use, a hard question must not get one.
  const tiers = new Set(models.map((m) => m.tier).filter(Boolean));
  check("auto", "a hard question is answered, not by the fast tier", !hard.error && hard.answer.length > 500 && (tiers.size < 2 || hard.start?.routing?.tier !== "fast"), { model: hard.start?.model?.displayName, routing: hard.start?.routing, ms: hard.ms });

  const doc = await upload("/api/documents", { workspaceId: ws }, "[smoke] gms-7731-spec.txt", "text/plain", Buffer.from(SPEC));
  if (doc.json?.id) created.documents.push(doc.json.id);
  await sleep(3000);
  const withDoc = await ask("What is the overload rating, and how much must the drive derate at 45 °C ambient?", { documentIds: [doc.json?.id] });
  check("documents", "answer from an attached document, with a citation", !withDoc.error && /150/.test(withDoc.answer) && /10\s*%/.test(plain(withDoc.answer)) && withDoc.start?.citations?.length > 0, { upload: doc.status, answer: withDoc.answer.slice(0, 200) });

  const proj = (await call("POST", "/api/projects", { workspaceId: ws, name: "[smoke] Motor drive", instructions: "Always end your answer with the line 'Project: GMS-7731'." })).json;
  created.projects.push(proj.id);
  await upload(`/api/projects/${proj.id}/sources/upload`, {}, "gms-7731-spec.txt", "text/plain", Buffer.from(SPEC));
  await sleep(3000);
  const pc = await ask("What switching frequency does the drive use, and what range is allowed?", { projectId: proj.id });
  check("projects", "project chat uses its instructions and sources", !pc.error && /8\s*kHz/i.test(plain(pc.answer)) && /Project: GMS-7731/.test(pc.answer), { answer: pc.answer.slice(0, 200) });

  const calcs = [
    ["What is the ideal output voltage of a buck converter at 48 V input and 0.4 duty?", "buck-ideal", "Vout", 19.2],
    ["I've got a 5 V supply driving a red LED (2 V forward) at 20 mA — what resistor should I use?", "led-resistor", "R", 150],
    ["How much torque does a motor make at 7.5 kW and 1440 rpm?", "torque-speed-power", "T", 49.7359],
  ];
  for (const [q, id, key, want] of calcs) {
    const r = await ask(q);
    const out = r.start?.calculation?.outputs?.find((o) => o.key === key);
    check("calculator", `${id} in chat`, r.start?.calculation?.calculatorId === id && Math.abs((out?.value ?? NaN) - want) < 0.001 * want, { via: r.start?.calculation?.via, value: out?.value, answer: r.answer.slice(0, 120) });
  }
}

if (ONLY.has("learning")) {
  const t = Date.now();
  const cr = await call("POST", "/api/learning/courses", { workspaceId: ws, topic: "[smoke] RC low-pass filters", level: "basic" });
  if (cr.json?.id) created.courses.push(cr.json.id);
  const course = await until(async () => {
    const r = (await call("GET", `/api/learning/courses/${cr.json?.id}`)).json;
    return { done: r?.status !== "generating", r };
  }, 300_000);
  const ok = course?.r?.status === "ready" && course.r.lessons?.length >= 2;
  check("learning", "a real model writes the outline", ok, { ms: Date.now() - t, status: course?.r?.status, error: course?.r?.error, lessons: course?.r?.lessons?.length });
  if (ok) {
    await call("POST", `/api/learning/courses/${cr.json.id}/lessons/0/generate`, {});
    const lesson = await until(async () => {
      const r = (await call("GET", `/api/learning/courses/${cr.json.id}/lessons/0`)).json;
      return { done: r?.status === "ready" || r?.status === "failed", r };
    }, 400_000);
    const l = lesson?.r;
    const eqs = l?.content?.equations ?? [];
    check("learning", "a lesson is written, validated and kept", l?.status === "ready" && !!l.content?.workedExample && eqs.every((e) => (e.validity ?? "").length > 0), { status: l?.status, error: l?.error, equations: eqs.length, videos: l?.videos?.length ?? 0, videosNote: l?.videosNote });
  }
}

if (ONLY.has("knowledge")) {
  const proj = (await call("POST", "/api/projects", { workspaceId: ws, name: "[smoke] Inverter 5 kW" })).json;
  created.projects.push(proj.id);
  const docs = {
    "inverter-test-report.txt": "5 kW inverter test report, revision B. During the 45 °C ambient soak the heatsink reached 98 °C and the inverter derated to 3.8 kW after 40 minutes. The root cause was a blocked fan inlet; a new inlet filter fixed it.",
    "design-review-notes.txt": "Design review, 5 kW inverter, gate driver. Gate resistor changed from 10 Ω to 6.8 Ω to cut switching loss; dv/dt is now 12 V/ns.",
  };
  for (const [name, body] of Object.entries(docs)) await upload(`/api/projects/${proj.id}/sources/upload`, {}, name, "text/plain", Buffer.from(body));
  await sleep(4000);
  const kask = async (question) => {
    const r = await sse("/api/knowledge/ask", { projectId: proj.id, question });
    const done = r.events.find((e) => e.event === "done")?.data;
    return { status: done?.status ?? r.error, answer: done?.answer ?? "", cited: (done?.citations ?? []).filter((x) => x.cited).map((x) => x.name) };
  };
  const q1 = await kask("What overtemperature problem did the 5 kW inverter have, and how was it fixed?");
  check("knowledge", "a cited answer from the project's documents", q1.status === "answered" && q1.cited.includes("inverter-test-report.txt") && /fan|filter/i.test(q1.answer), q1);
  const q2 = await kask("What gate resistor is used now?");
  check("knowledge", "a specific fact, cited", q2.status === "answered" && /6\.8/.test(q2.answer) && q2.cited.includes("design-review-notes.txt"), q2);
  const q3 = await kask("What is the warranty period for the gearbox?");
  check("knowledge", "says when the documents don't contain the answer", q3.status === "not_found", q3);
}

if (ONLY.has("work")) {
  const t = Date.now();
  const task = await call("POST", "/api/work/tasks", { workspaceId: ws, prompt: "[smoke] Write a Python script calc.py that prints the ideal buck output voltage for Vin = 48 V and D = 0.1 … 0.9 as a table, run it, save the table to result.txt, and tell me the value for D = 0.4." });
  check("work", "a task starts", task.status === 200, task.status === 200 ? "" : task.text.slice(0, 300));
  if (task.status === 200) {
    created.tasks.push(task.json.id);
    const end = await until(async () => {
      const r = (await call("GET", `/api/work/tasks/${task.json.id}`)).json;
      if (r?.task?.status === "needs_approval") {
        for (const a of (await call("GET", `/api/work/approvals?workspaceId=${ws}`)).json.filter((x) => x.taskId === task.json.id)) await call("POST", `/api/work/approvals/${a.id}`, { decision: "approve" });
      }
      return { done: ["completed", "failed", "cancelled"].includes(r?.task?.status), r };
    }, 600_000, 5000);
    const result = await call("GET", `/api/work/tasks/${task.json.id}/files/content?path=result.txt`);
    check("work", "the agent writes, runs and saves files", end?.r?.task?.status === "completed" && result.status === 200 && /19\.2/.test(result.text), { ms: Date.now() - t, status: end?.r?.task?.status, error: end?.r?.task?.error, result: result.text.slice(0, 160) });
  }
}

if (ONLY.has("code")) {
  const w = await call("POST", "/api/code/workspaces", { workspaceId: ws, name: "smoke-code" });
  if (w.json?.id) created.code.push(w.json.id);
  const o = w.status === 200 ? await call("POST", `/api/code/workspaces/${w.json.id}/open`, {}) : w;
  check("code", "a code workspace opens the IDE", o.status === 200 && /\/code\/ide/.test(o.json?.url ?? ""), o.status === 200 ? o.json.url : o.text.slice(0, 300));
}

if (process.env.SMOKE_CLEANUP === "1") {
  for (const id of created.chats) await call("DELETE", `/api/chats/${id}`);
  for (const id of created.courses) await call("DELETE", `/api/learning/courses/${id}`);
  for (const id of created.projects) await call("DELETE", `/api/projects/${id}`);
  for (const id of created.documents) await call("DELETE", `/api/documents/${id}`);
  for (const id of created.code) await call("DELETE", `/api/code/workspaces/${id}`);
  console.log("\nCleaned up what the smoke test created (Work AI tasks are kept in the task list).");
}
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
