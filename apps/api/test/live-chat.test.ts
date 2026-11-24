/**
 * Live Chat regression: real models, real web search, real Python, every chat pattern and setting, with checks.
 * Skipped unless a model server is given. Run it with the local .env loaded (it reads, never prints, the keys):
 *   LIVE_MODEL_URL   OpenAI-compatible base (…/v1), else SETUP_MODEL_URL
 *   LIVE_MODEL_KEY   its key, else SETUP_MODEL_API_KEY
 *   LIVE_STANDARD / LIVE_ADVANCED / LIVE_FAST / LIVE_EMBED   model names (default inkling, inkling, fast, embed)
 *   WEB_SEARCH_URL   SearXNG for web search (optional: web scenarios are skipped without it)
 *   LIVE_OUT         JSON results file (default live-chat-results.json); LIVE_ONLY: comma-separated scenario ids or areas
 * TEST_DATABASE_URL must be a database the tests may empty.
 */
import { message, eq } from "@aatmiq/db";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./gem-harness";

const URL_ = process.env.LIVE_MODEL_URL ?? process.env.SETUP_MODEL_URL;
const KEY = process.env.LIVE_MODEL_KEY ?? process.env.SETUP_MODEL_API_KEY;
const d = process.env.TEST_DATABASE_URL && URL_ ? describe : describe.skip;
const OUT = process.env.LIVE_OUT ?? "live-chat-results.json";
const ONLY = (process.env.LIVE_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

type ModelPick = "auto" | "standard" | "advanced" | "fast";
interface Turn {
  text: string;
  webSearch?: boolean;
  research?: boolean;
  docs?: string[];
}
interface Check {
  name: string;
  test: (r: TurnResult, all: TurnResult[]) => boolean;
}
interface Scenario {
  id: string;
  area: string;
  title: string;
  model: ModelPick;
  turns: (string | Turn)[];
  checks?: Check[];
  /** Runs alone (it changes organization settings). */
  alone?: boolean;
  setup?: (h: Harness) => Promise<void>;
  teardown?: (h: Harness) => Promise<void>;
  project?: boolean;
}
interface TurnResult {
  id: string;
  turn: number;
  prompt: string;
  model: string | null;
  routing: { tier: string; difficulty: string | null; by: string; reason: string; thinking: boolean } | null;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
  steps: { tool: string; detail: string; outcome?: string; why?: string }[];
  answer: string;
  reasoningChars: number;
  citations: number;
  /** Searches made before the answer (the web button on), not as tools. */
  webQueries: number;
  files: string[];
  error: string | null;
  chatId: string;
  messageId: string | null;
}

const has = (re: RegExp): Check => ({ name: `answer matches ${re}`, test: (r) => re.test(r.answer) });
const lacks = (re: RegExp, name?: string): Check => ({ name: name ?? `answer doesn't match ${re}`, test: (r) => !re.test(r.answer) });
const tier = (t: string): Check => ({ name: `Auto picks ${t}`, test: (r) => r.routing?.tier === t });
const used = (tool: string): Check => ({ name: `uses ${tool}`, test: (r) => r.steps.some((s) => s.tool === tool) });
const usedOk = (tool: string): Check => ({ name: `${tool} works`, test: (r) => r.steps.some((s) => s.tool === tool && !["failed", "off", "empty", "limit", "0"].includes(s.outcome ?? "")) });
/** Searched the web: as a tool, or before answering (the web button on). */
const searched: Check = { name: "searches the web", test: (r) => r.webQueries > 0 || r.steps.some((s) => s.tool === "web_search") };
const noTools: Check = { name: "no tools", test: (r) => r.steps.length === 0 };
const noError: Check = { name: "no error", test: (r) => !r.error };
const cited: Check = { name: "cites a source", test: (r) => r.citations > 0 && /\[\d+\]/.test(r.answer) };
const file = (re: RegExp): Check => ({ name: `makes a file ${re}`, test: (r) => r.files.some((f) => re.test(f)) });
const noAsk = lacks(/\b(shall i|should i (go ahead|proceed)|would you like me to (proceed|go ahead|build|create)|do you want me to (proceed|build|create))\b/i, "doesn't stop to ask");
const thinks: Check = { name: "thinking kept", test: (r) => r.reasoningChars > 0 };

const SCENARIOS: Scenario[] = [
  // ── Plain chat: quality, no tools ──
  { id: "greet", area: "basic", title: "Greeting", model: "auto", turns: ["hi"], checks: [noError, noTools, tier("fast")] },
  { id: "fact", area: "basic", title: "Quick fact", model: "auto", turns: ["What is the capital of Australia?"], checks: [noError, has(/canberra/i), tier("fast")] },
  { id: "explain", area: "basic", title: "Explanation", model: "auto", turns: ["Explain how a buck converter works, for a junior engineer."], checks: [noError, has(/inductor/i), has(/duty/i), tier("standard")] },
  { id: "email", area: "basic", title: "Writing an email", model: "auto", turns: ["Write a short polite email to a supplier asking to move our delivery from 12 March to 19 March because our site isn't ready."], checks: [noError, has(/19 March|March 19/i), lacks(/\[insert|\{.*\}/i, "no unfilled placeholders like [insert…]")] },
  { id: "code", area: "basic", title: "Code with tests", model: "auto", turns: ["Write a Python function that reads a CSV of transactions (date,amount) and returns monthly totals, with two pytest tests."], checks: [noError, has(/def \w+\(/), has(/def test_\w+/), has(/```python/)] },
  { id: "math", area: "basic", title: "Word problem", model: "auto", turns: ["A train leaves at 9:40 and travels 245 km at 70 km/h. When does it arrive? Show the working briefly."], checks: [noError, has(/13:10|1:10\s*(pm|p\.m\.)/i)] },
  { id: "hindi", area: "basic", title: "Hindi", model: "auto", turns: ["भारत की राजधानी क्या है? एक वाक्य में उत्तर दें।"], checks: [noError, has(/दिल्ली/)] },
  { id: "memory", area: "basic", title: "Remembers earlier turns", model: "auto", turns: ["My name is Ravi and I design solar inverters.", "What do I design, and what's my name? One line."], checks: [noError, has(/solar inverter/i), has(/ravi/i)] },
  { id: "page", area: "basic", title: "Make a web page", model: "auto", turns: ["Make a simple HTML page that lists the 8 planets with a search box that filters them."], checks: [noError, noAsk, has(/<(!doctype|html|input)/i)] },

  // ── Auto routing ──
  { id: "route-translate", area: "auto", title: "Translate (easy)", model: "auto", turns: ["Translate to Hindi: Please send the report by Friday."], checks: [tier("fast")] },
  { id: "route-design", area: "auto", title: "System design (hard)", model: "auto", turns: ["Design a database schema for a hospital's appointments, doctors and billing."], checks: [tier("advanced"), noError] },
  { id: "route-legal", area: "auto", title: "Legal question (hard)", model: "auto", turns: ["What is the notice period an employer in India must give under the Industrial Disputes Act before retrenchment?"], checks: [tier("advanced")] },
  { id: "route-debug", area: "auto", title: "Debug an error (hard)", model: "auto", turns: ["Why does this fail? TypeError: Cannot read properties of undefined (reading 'map')\n    at render (List.tsx:12)\n\nconst List = ({items}) => items.map(i => <li>{i}</li>)"], checks: [tier("advanced"), has(/undefined|default|\?\./i)] },
  { id: "route-followup", area: "auto", title: "Follow-up keeps the difficulty", model: "auto", turns: ["Design a database schema for a small library: books, members, loans.", "and add fines"], checks: [{ name: "follow-up stays on advanced", test: (r) => r.routing?.tier === "advanced" }] },

  // ── Same prompts, each model ──
  ...(["fast", "standard"] as const).flatMap((m) => [
    { id: `cmp-${m}-explain`, area: "models", title: `${m}: explanation`, model: m, turns: ["What is the difference between a MOSFET and an IGBT, and when would you choose each?"], checks: [noError, has(/igbt/i)] },
    { id: `cmp-${m}-math`, area: "models", title: `${m}: reasoning`, model: m, turns: ["If 3 machines make 3 parts in 3 minutes, how long do 100 machines take to make 100 parts?"], checks: [noError, has(/\b3 minutes\b|three minutes/i)] },
    { id: `cmp-${m}-write`, area: "models", title: `${m}: writing`, model: m, turns: ["Write a 3-line LinkedIn post announcing our new 5 kW solar inverter."], checks: [noError] },
    { id: `cmp-${m}-code`, area: "models", title: `${m}: code`, model: m, turns: ["Write a JavaScript function debounce(fn, ms)."], checks: [noError, has(/setTimeout/), has(/clearTimeout/)] },
    { id: `cmp-${m}-hindi`, area: "models", title: `${m}: Hindi`, model: m, turns: ["ओम के नियम को दो वाक्यों में समझाइए।"], checks: [noError, has(/[ऀ-ॿ]{5,}/)] },
  ]),

  // ── Tools ──
  { id: "web-one", area: "tools", title: "Web: current fact, read and cite", model: "auto", turns: [{ text: "What is the latest LTS version of Node.js right now?", webSearch: true }], checks: [noError, searched, cited] },
  { id: "web-many", area: "tools", title: "Web: compare two things (several searches)", model: "auto", turns: [{ text: "Compare the Raspberry Pi 5 and the Orange Pi 5: CPU, RAM options and price in India.", webSearch: true }], checks: [noError, used("web_search"), cited, { name: "at most 6 searches", test: (r) => r.steps.filter((s) => s.tool === "web_search" && s.outcome !== "limit").length <= 6 }] },
  { id: "web-404", area: "tools", title: "Web: a page that doesn't exist", model: "auto", turns: [{ text: "Read https://example.com/this-page-does-not-exist-12345 and summarise it.", webSearch: true }], checks: [noError, { name: "says it couldn't read it", test: (r) => /couldn'?t|could not|unable|not (be )?(found|available|accessible)|404|doesn'?t exist|didn'?t work|example domain/i.test(r.answer) }] },
  { id: "web-noneed", area: "tools", title: "Web on, but nothing to look up", model: "auto", turns: [{ text: "Explain Ohm's law in two sentences.", webSearch: true }], checks: [noError, { name: "doesn't search for a textbook fact", test: (r) => !r.steps.some((s) => s.tool === "web_search") }, { name: "not sent to the advanced tier", test: (r) => r.routing?.tier !== "advanced" }] },
  { id: "chain", area: "tools", title: "Chained: web, then Python", model: "auto", turns: [{ text: "Find today's USD to INR exchange rate on the web, then use Python to convert 1,234 USD to INR and show the working.", webSearch: true }], checks: [noError, used("web_search"), used("run_python"), has(/\d{2,3}(,\d{3})+|\d{5,}/)] },
  { id: "py-excel", area: "tools", title: "Python: an Excel file", model: "auto", turns: ["Calculate compound interest on 2,50,000 INR at 8.5% a year for 7 years and save a year-by-year table as interest.xlsx."], checks: [noError, usedOk("run_python"), file(/\.xlsx$/), has(/4,?4\d,?\d{3}|4\.4\d lakh/i)] },
  { id: "py-chart", area: "tools", title: "Python: a chart", model: "auto", turns: ["Plot y = sin(x) and y = cos(x) from 0 to 2π on one chart and save it as waves.png."], checks: [noError, usedOk("run_python"), file(/\.png$/)] },
  { id: "py-data", area: "tools", title: "Python on an attached CSV", model: "auto", turns: [{ text: "Which region had the highest total sales in the attached file, and by how much did it beat the second?", docs: ["sales.csv"] }], checks: [noError, has(/north/i), has(/\b5,?100\b|\b5100\b/)] },
  { id: "docs", area: "tools", title: "Documents: answer from the organization's files", model: "auto", turns: [{ text: "According to our travel policy, what class can I fly for a 9-hour flight?", docs: ["travel-policy.txt"] }], checks: [noError, has(/business/i), has(/manager/i)] },
  { id: "calc", area: "tools", title: "Calculators", model: "auto", turns: ["What current flows through a 46 ohm resistor at 230 V?"], checks: [noError, has(/\b5(\.0+)?\s*A\b|5 amp/i)] },
  { id: "limit", area: "tools", title: "Search limit", model: "auto", turns: [{ text: "List the current CEO of each of these 10 companies, each checked on the web: Tata Motors, Infosys, Wipro, HCL, TCS, Reliance, Adani Ports, Bajaj Auto, Mahindra, Larsen & Toubro.", webSearch: true }], checks: [noError, { name: "no more than 6 searches run", test: (r) => r.steps.filter((s) => s.tool === "web_search" && s.outcome !== "limit").length <= 6 }] },
  { id: "think", area: "tools", title: "Thinking is shown and kept", model: "standard", turns: ["Is 1001 a prime number? Explain briefly."], checks: [noError, thinks, has(/7\s*[×x*]\s*11\s*[×x*]\s*13|not (a )?prime/i)] },
  { id: "research", area: "tools", title: "Deep research", model: "auto", turns: [{ text: "Write a short research brief on the IEC 61439 standard: what it covers, its parts, and what changed in the 2020/2021 editions.", webSearch: true, research: true }], checks: [noError, searched, usedOk("read_page"), cited, tier("advanced")] },

  // ── Chat features ──
  { id: "project", area: "features", title: "Project: its instructions and notes", model: "auto", project: true, turns: ["What switching frequency does our converter use?"], checks: [noError, has(/250\s*kHz/i), { name: "follows the project's 3-bullet rule", test: (r) => (r.answer.match(/^\s*[-*•]\s/gm) ?? []).length === 3 }] },
];

d("live chat regression", () => {
  let h: Harness;
  const ids: Record<ModelPick, string> = { auto: "auto", standard: "", advanced: "", fast: "" };
  const names = new Map<string, string>();
  const docs = new Map<string, string>();
  const results: TurnResult[] = [];
  const features: { name: string; ok: boolean; detail: string }[] = [];
  let projectId = "";

  const save = () => writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), results, features, scenarios: SCENARIOS.map((s) => ({ id: s.id, area: s.area, title: s.title, model: s.model, checks: (s.checks ?? []).map((c) => c.name) })) }, null, 2));

  beforeAll(async () => {
    h = await startHarness({ workSandbox: "off" });
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Gateway", type: "openai_compatible", baseUrl: URL_, ...(KEY ? { apiKey: KEY } : {}) });
    expect(p.status).toBe(200);
    // A model can be added once per provider: the advanced tier gets a second provider for the same server (as in a real setup).
    const p2 = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Gateway (advanced)", type: "openai_compatible", baseUrl: URL_, ...(KEY ? { apiKey: KEY } : {}) });
    const add = async (key: string, name: string, tierName: string | null, kind: "chat" | "embedding" = "chat") => {
      const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: tierName === "advanced" ? p2.json.id : p.json.id, modelKey: key, displayName: name, kind, ...(kind === "chat" ? { contextLength: 131072, tier: tierName, sections: ["chat", "work"] } : { sections: [] }) });
      expect(m.status, JSON.stringify(m.json)).toBe(200);
      names.set(m.json.id, name);
      return m.json.id as string;
    };
    ids.standard = await add(process.env.LIVE_STANDARD ?? "inkling", "standard", "standard");
    ids.advanced = await add(process.env.LIVE_ADVANCED ?? "inkling", "advanced", "advanced");
    ids.fast = await add(process.env.LIVE_FAST ?? "fast", "fast", "fast");
    const embed = await add(process.env.LIVE_EMBED ?? "embed", "embed", null, "embedding");
    expect((await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [ids.standard, ids.advanced, ids.fast], defaultModelId: ids.standard, embeddingModelId: embed })).status).toBe(200);
    if (process.env.WEB_SEARCH_URL) expect((await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "searxng", webUrl: process.env.WEB_SEARCH_URL, chatWebSearch: true, chatSandbox: true })).status).toBe(200);
    // Documents for the document and Python scenarios.
    const upload = async (name: string, type: string, text: string) => {
      const r = await h.upload(h.alice, "/api/documents", { workspaceId: h.workspaceId, scope: "workspace" }, { name, type, data: Buffer.from(text) });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      docs.set(name, r.json.id);
    };
    await upload("travel-policy.txt", "text/plain", "Acme travel policy (2026).\nFlights: economy class for flights under 6 hours. Business class is allowed for flights over 6 hours, with your manager's approval in advance.\nHotels: up to 150 EUR a night in Europe, 9,000 INR in India.\nMeals: actual cost up to 60 EUR a day.");
    await upload("sales.csv", "text/csv", ["region,month,sales", "North,Jan,12000", "North,Feb,13500", "North,Mar,14600", "South,Jan,11000", "South,Feb,12500", "South,Mar,11500", "East,Jan,9000", "East,Feb,9500", "East,Mar,10100", "West,Jan,7000", "West,Feb,7200", "West,Mar,7400"].join("\n"));
    await h.settle();
    // A project with instructions and a note.
    const pr = await h.call(h.alice, "POST", "/api/projects", { workspaceId: h.workspaceId, name: "DC-DC converter", instructions: "Always answer in exactly three bullet points, nothing else." });
    projectId = pr.json.id;
    await h.call(h.alice, "POST", `/api/projects/${projectId}/sources/note`, { title: "Design notes", content: "Our DC-DC converter (model DCX-48) switches at 250 kHz. Input range 36-75 V. Output 12 V at 10 A." });
    await h.settle();
  }, 300_000);
  afterAll(async () => {
    save();
    await h?.close();
  });

  const events = (body: string) => [...body.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => ({ event: m[1]!, data: JSON.parse(m[2]!) }));

  /** One message, and what came of it. */
  async function send(id: string, turn: number, chatId: string, t: Turn, model: ModelPick, extra: Record<string, unknown> = {}, who = h.alice): Promise<TurnResult> {
    const t0 = Date.now();
    const r = await h.call(who, "POST", `/api/chats/${chatId}/messages`, {
      content: t.text,
      modelId: ids[model],
      ...(t.webSearch !== undefined ? { webSearch: t.webSearch } : {}),
      ...(t.research ? { research: true } : {}),
      ...(t.docs?.length ? { documentIds: t.docs.map((n) => docs.get(n)!) } : {}),
      ...extra,
    });
    const ms = Date.now() - t0;
    const ev = r.status === 200 ? events(r.body) : [];
    const done = ev.find((e) => e.event === "done")?.data;
    const err = ev.find((e) => e.event === "error")?.data?.message ?? (r.status !== 200 ? `${r.status} ${JSON.stringify(r.json).slice(0, 200)}` : null);
    const saved = done?.messageId ? (await h.db.select().from(message).where(eq(message.id, done.messageId)))[0] : undefined;
    const files = ((await h.call(who, "GET", `/api/chats/${chatId}/files`)).json?.files ?? []).map((f: { path: string }) => f.path);
    return {
      id,
      turn,
      prompt: t.text,
      model: saved?.modelId ? (names.get(saved.modelId) ?? saved.modelId) : null,
      routing: (saved?.routing as TurnResult["routing"]) ?? null,
      ms,
      inputTokens: saved?.inputTokens ?? null,
      outputTokens: saved?.outputTokens ?? null,
      steps: (saved?.steps as TurnResult["steps"]) ?? [],
      answer: saved?.content ?? "",
      reasoningChars: saved?.reasoning?.length ?? 0,
      citations: Array.isArray(saved?.citations) ? saved!.citations!.length : 0,
      webQueries: (saved?.web as { queries?: string[] } | null)?.queries?.length ?? 0,
      files,
      error: err ?? saved?.error ?? null,
      chatId,
      messageId: done?.messageId ?? null,
    };
  }

  async function run(s: Scenario) {
    await s.setup?.(h);
    const chat = await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId: ids[s.model], ...(s.project ? { projectId } : {}) });
    const mine: TurnResult[] = [];
    for (const [i, raw] of s.turns.entries()) {
      const t = typeof raw === "string" ? { text: raw } : raw;
      const r = await send(s.id, i + 1, chat.json.id, t, s.model);
      mine.push(r);
      results.push(r);
      save();
    }
    const last = mine.at(-1)!;
    (last as TurnResult & { checks?: { name: string; ok: boolean }[] }).checks = (s.checks ?? []).map((c) => {
      let ok = false;
      try {
        ok = c.test(last, mine);
      } catch {
        ok = false;
      }
      return { name: c.name, ok };
    });
    save();
    await s.teardown?.(h);
  }

  const picked = SCENARIOS.filter((s) => !ONLY.length || ONLY.includes(s.id) || ONLY.includes(s.area)).filter((s) => process.env.WEB_SEARCH_URL || !s.turns.some((t) => typeof t !== "string" && t.webSearch));

  it("runs every scenario", async () => {
    // Two at a time: a model server serves a couple of requests together; settings scenarios run alone.
    const queue = picked.filter((s) => !s.alone);
    const workers = Array.from({ length: Number(process.env.LIVE_PARALLEL ?? 2) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) await run(s);
    });
    await Promise.all(workers);
    for (const s of picked.filter((x) => x.alone)) await run(s);
  }, 4 * 3600_000);

  it("chat features: branches, export, temporary, group chat, settings", async () => {
    if (ONLY.length && !ONLY.includes("features")) return;
    const note = (name: string, ok: boolean, detail = "") => {
      features.push({ name, ok, detail });
      save();
    };
    const newChat = async (extra: Record<string, unknown> = {}) => (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId: ids.fast, ...extra })).json.id as string;

    // Regenerate: a second answer next to the first.
    const c1 = await newChat();
    const first = await send("feat-regen", 1, c1, { text: "Give me one name for a solar startup." }, "fast");
    const userId = (await h.db.select().from(message).where(eq(message.id, first.messageId!)))[0]?.parentId;
    const again = await send("feat-regen", 2, c1, { text: "" }, "fast", { content: undefined, regenerateOf: userId });
    const siblings = (await h.db.select().from(message).where(eq(message.chatId, c1))).filter((m) => m.role === "assistant" && m.parentId === userId);
    note("Regenerate makes a second answer beside the first", !again.error && siblings.length === 2, `${siblings.length} answers`);

    // Edit an earlier message: a new branch from the start.
    const branch = await send("feat-edit", 1, c1, { text: "Give me one name for a wind-energy startup instead." }, "fast", { parentId: null });
    const roots = (await h.db.select().from(message).where(eq(message.chatId, c1))).filter((m) => m.role === "user" && m.parentId === null);
    note("Editing an earlier message starts a branch", !branch.error && roots.length === 2, `${roots.length} first messages`);

    // Export.
    const md = await h.call(h.alice, "GET", `/api/chats/${c1}/export?format=md`);
    const docx = await h.call(h.alice, "GET", `/api/chats/${c1}/export?format=docx`);
    note("Export as Markdown and Word", md.status === 200 && md.body.includes("wind-energy") && docx.status === 200 && docx.headers["content-type"]?.includes("officedocument"), `md ${md.status}, docx ${docx.status}`);

    // Temporary chat: answered, not listed.
    const tmp = await newChat({ temporary: true });
    const tr = await send("feat-temp", 1, tmp, { text: "Say OK." }, "fast");
    const listed = ((await h.call(h.alice, "GET", `/api/chats?workspaceId=${h.workspaceId}`)).json as { id: string }[]).some((c) => c.id === tmp);
    note("Temporary chat answers and stays out of the list", !tr.error && !listed, listed ? "listed" : "not listed");

    // Group chat: shared to the project with replies on; another member writes in it.
    await h.call(h.alice, "PUT", `/api/projects/${projectId}/members`, { userId: (await h.call(h.bob, "GET", "/api/me")).json.user.id, role: "chat" });
    const g = (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId: ids.fast, projectId })).json.id as string;
    await send("feat-group", 1, g, { text: "Our next review is on Monday." }, "fast");
    const share = await h.call(h.alice, "PATCH", `/api/chats/${g}`, { sharedToProject: true, sharedCanReply: true });
    const bobSays = await send("feat-group", 2, g, { text: "When is the next review?" }, "fast", {}, h.bob);
    note("Group chat: a project member replies in a shared chat", share.status === 200 && !bobSays.error && /monday/i.test(bobSays.answer), bobSays.error ?? bobSays.answer.slice(0, 80));

    // Settings: web search off for chat, Python off.
    if (process.env.WEB_SEARCH_URL) {
      await h.call(h.owner, "PUT", "/api/admin/gem", { chatWebSearch: false });
      const off = await send("feat-web-off", 1, await newChat(), { text: "What is the latest version of Python?", webSearch: true }, "standard");
      note("Admin turns web search off: chat doesn't search", !off.steps.some((s) => s.tool === "web_search"), `${off.steps.map((s) => s.tool).join(",") || "no tools"}`);
      await h.call(h.owner, "PUT", "/api/admin/gem", { chatWebSearch: true });
    }
    await h.call(h.owner, "PUT", "/api/admin/gem", { chatSandbox: false });
    const noPy = await send("feat-py-off", 1, await newChat(), { text: "Use Python to compute the sum of squares from 1 to 100." }, "standard");
    note("Admin turns Python off: chat doesn't run it", !noPy.steps.some((s) => s.tool === "run_python"), `${noPy.steps.map((s) => s.tool).join(",") || "no tools"}; ${noPy.answer.match(/338350/) ? "answer 338350" : "answer differs"}`);
    await h.call(h.owner, "PUT", "/api/admin/gem", { chatSandbox: true });

    // Choosing a model directly: Auto stays out of it.
    const direct = await send("feat-direct", 1, await newChat(), { text: "Hi" }, "standard");
    note("A model picked by hand is used as is", direct.model === "standard" && (direct.routing?.by === "rules" || direct.routing === null) && /directly/.test(direct.routing?.reason ?? "asked for directly"), `${direct.model} / ${direct.routing?.reason ?? "no routing"}`);
  }, 3600_000);
});
