/**
 * Checked lessons (services/learning.ts, services/learning-check.ts) against a real Postgres
 * (TEST_DATABASE_URL), a fake model server with three tiers (a standard model writes, an advanced
 * one checks) and a fake SearXNG with pages keyed on host: lessons written from web sources and
 * saved with the checker's corrections, issues and sources; a calculation that doesn't come out
 * sent back once; a checker or a search that fails never fails the lesson; "Check this lesson" as
 * a new version, the owner's alone; links only from the provider; the check switched off.
 */
import { courseLesson, eq, sql, usageEvent, workspace } from "@aatmiq/db";
import { lessonCheckSchema, parseModelJson } from "@aatmiq/shared";
import { strFromU8, unzipSync } from "fflate";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { APP_URL, startHarness, type Harness } from "../test/gem-harness";
import { buildVerification, researchQueries, runCalcChecks } from "./services/learning-check";
import { clearWebSearchCache } from "./services/web-search";
import type { YtDlpRunner } from "./services/youtube";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe("lesson checks, without a server", () => {
  it("builds 2–3 search queries from the topic, the lesson title and its summary", () => {
    const q = researchQueries("Three-phase inverters", "SVPWM: sector identification and dwell times", "How the reference vector's sector picks the active vectors and how long each is applied.");
    expect(q).toEqual([
      "SVPWM sector identification dwell times Three-phase inverters",
      "Three-phase inverters reference vector's sector picks active vectors long each applied",
      "SVPWM sector identification dwell times worked example",
    ]);
    // Nothing twice; the topic isn't repeated when the title has it.
    expect(researchQueries("Ohm's law", "Ohm's law", "Ohm's law")).toEqual(["Ohm's law", "Ohm's law worked example"]);
  });

  it("works out the calculations: within 0.5 %, or 1e-9 near zero; unreadable ones aren't judged", () => {
    const r = runCalcChecks([
      { label: "a", expression: "12 / 4", claimed: 3.01 },
      { label: "b", expression: "12 / 4", claimed: 3.02 },
      { label: "c", expression: "1 - 1", claimed: 1e-10 },
      { label: "d", expression: "x + 1", claimed: 2 },
      { label: "e", expression: "rand()", claimed: 0.5 },
      { label: "f", expression: "sqrt(2) * 230", claimed: 325.3 },
    ]);
    expect(r.map((x) => x.ok)).toEqual([true, false, true, null, null, true]);
    expect(r[1]).toMatchObject({ computed: 3, claimed: 3.02 });
    expect(r[3]!.computed).toBeNull();
  });

  it("reads a checker's reply leniently, strips links, and keeps only real source numbers", () => {
    const lesson = goodLesson("Ohm's law", "I = 3 A");
    const r = parseModelJson(
      lessonCheckSchema,
      JSON.stringify({
        issues: [{ part: "Equations", problem: "Wrong sign, see https://made-up.example/x", fix: "Fixed.", severity: "critical", sources: [1, 2, 7] }, { part: "banana", problem: "p", fix: "f" }],
        lesson,
        calcChecks: [{ label: "I", expression: "12/4", claimed: "3" }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.issues[0]).toMatchObject({ part: "equation", severity: "high", problem: "Wrong sign, see" });
    expect(r.value.issues[1]).toMatchObject({ part: "other", severity: "medium", sources: [] });
    expect(r.value.calcChecks[0]!.claimed).toBe(3);
    const v = buildVerification({ research: { sources: [src("a"), src("b")], queries: ["q"], provider: "searxng", note: null }, model: { id: "m", name: "Big" }, issues: r.value.issues, calc: [] });
    expect(v.issues[0]!.sources).toEqual([1, 2]);
    expect(v.status).toBe("corrected");
    expect(v.sources).toEqual([
      { n: 1, title: "a", url: "https://docs.example.org/a" },
      { n: 2, title: "b", url: "https://docs.example.org/b" },
    ]);
    // A missing calcChecks is an empty list, not a failed check.
    expect(parseModelJson(lessonCheckSchema, JSON.stringify({ issues: [], lesson })).ok).toBe(true);
    expect(parseModelJson(lessonCheckSchema, JSON.stringify({ issues: [] })).ok).toBe(false);
  });
});

const src = (t: string) => ({ title: t, url: `https://docs.example.org/${t}`, snippet: t });

/** A lesson that passes lessonSchema, with a link the model wrote in its theory. */
function goodLesson(title: string, answer: string, refs = [{ title: "Engineering Circuit Analysis", author: "Hayt, Kemmerly and Durbin", kind: "book" }]) {
  return {
    title,
    objectives: ["Apply Ohm's law with units"],
    prerequisites: [],
    theory: "Ohm's law relates voltage, current and resistance. See https://made-up.example/ohm for more.",
    explanation: "For a linear resistor the current is proportional to the voltage across it, as [this page](http://made-up.example/x) shows.",
    equations: [{ name: "Ohm's law", expression: "V = I·R", symbols: [{ symbol: "V", meaning: "voltage", unit: "V" }], validity: "Linear resistors at constant temperature" }],
    workedExample: { problem: "A 12 V supply drives a 4 Ω resistor. Find the current.", given: ["V = 12 V", "R = 4 Ω"], steps: ["I = V / R = 12 / 4"], answer },
    diagrams: [],
    commonMistakes: ["Mixing up kΩ and Ω"],
    videoQueries: ["ohms law"],
    references: refs,
    takeaways: ["V = I·R for linear resistors"],
  };
}

const WRITTEN = (title: string) => goodLesson(title, "I = 4 A", [
  { title: "Engineering Circuit Analysis", author: "Hayt, Kemmerly and Durbin", kind: "book" },
  { title: "The Imaginary Handbook of Volts", author: "Nobody", kind: "book" },
]);

/** What the checker sends back for each course topic (and round). */
function checkReply(topic: string, round: number, title: string): string {
  const corrected = { ...goodLesson(title, "I = 3 A"), theory: "Ohm's law relates voltage, current and resistance, as https://checker-invented.example/page explains." };
  if (topic.includes("CHECK-FAIL")) return "I looked at the lesson and it seems mostly fine.";
  if (topic.includes("CHECK-CALC")) {
    if (round === 1) return JSON.stringify({ issues: [], lesson: WRITTEN(title), calcChecks: [{ label: "Answer", expression: "12 / 4", claimed: 4 }] });
    return JSON.stringify({
      issues: [{ part: "workedExample", problem: "12 V / 4 Ω is 3 A, not 4 A.", fix: "The answer is I = 3 A.", severity: "high", sources: [] }],
      lesson: corrected,
      calcChecks: [
        { label: "Answer", expression: "12 / 4", claimed: 3 },
        { label: "Power", expression: "12 * 3", claimed: 40 },
      ],
    });
  }
  return [
    "```json",
    JSON.stringify({
      issues: [
        { part: "workedExample", problem: "12 V / 4 Ω is 3 A, not 4 A.", fix: "The answer is I = 3 A.", severity: "high", sources: [1, 9] },
        { part: "references", problem: "The Imaginary Handbook of Volts can't be found.", fix: "Removed it.", severity: "medium", sources: [] },
      ],
      lesson: corrected,
      calcChecks: [{ label: "Answer", expression: "12 / 4", claimed: 3 }],
    }),
    "```",
  ].join("\n");
}

const page = (path: string) => `<!doctype html><html><body><nav>Menu</nav><main><h1>Page ${path}</h1><p>Text of ${path}: I = V / R, so 12 V across 4 Ω gives 3 A.</p></main></body></html>`;

/** SearXNG at searx.test (/down answers 502); pages at docs.example.org; inner.example.org is private. */
function fakeWeb(stageNow: () => Promise<string | null>) {
  const searches: { q: string; stage: string | null }[] = [];
  const pages: string[] = [];
  const results = new Set<string>();
  const result = (u: string, title: string) => (results.add(u), { url: u, title, content: `Snippet for ${title}` });
  const fetchFn = (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    if (u.host === "searx.test") {
      if (u.pathname.startsWith("/down")) return new Response("bad gateway", { status: 502 });
      const q = u.searchParams.get("q") ?? "";
      const entry = { q, stage: null as string | null };
      searches.push(entry);
      entry.stage = await stageNow();
      if (/Imaginary/.test(q)) return Response.json({ results: [] });
      if (/Engineering Circuit Analysis/.test(q)) return Response.json({ results: [result("https://books.example.org/hayt", "Engineering Circuit Analysis, 9th edition")] });
      return Response.json({
        results: [result("https://docs.example.org/r1", "Ohm's law explained"), result("https://docs.example.org/r2", "Resistor basics"), result("https://inner.example.org/x", "Inner notes"), result("https://docs.example.org/r3", "Worked examples")],
      });
    }
    pages.push(u.host + u.pathname);
    if (u.host === "docs.example.org") return new Response(page(u.pathname), { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, searches, pages, results };
}

const DNS: Record<string, string[]> = { "docs.example.org": ["93.184.216.34"], "books.example.org": ["93.184.216.35"], "inner.example.org": ["10.1.2.3"] };
const resolve = async (host: string) => {
  const a = DNS[host];
  if (!a) throw new Error("ENOTFOUND");
  return a;
};

d("checked lessons", () => {
  let h: Harness;
  let server: Server;
  const stageNow = async () => {
    const rows = await h.db.select({ stage: courseLesson.stage }).from(courseLesson).where(eq(courseLesson.status, "generating"));
    return rows[0]?.stage ?? null;
  };
  const web = fakeWeb(stageNow);
  const noYtDlp: YtDlpRunner = async () => ({ code: 127, stdout: "", stderr: "not installed" });
  /** Every request the fake model server got, with the lesson's stage at that moment. */
  const seen: { model: string; kind: "judge" | "outline" | "lesson" | "check" | "other"; system: string; user: string; messages: { role: string; content: string }[]; stage: string | null }[] = [];
  const ids: Record<string, string> = {};
  let courseId = "";
  /** Every check answers in prose (the check fails), or never answers. */
  let failChecks = false;
  let hangChecks = false;
  /** The writer of "Power in resistors" waits for this (another of the course's lessons is busy). */
  let hold: Promise<void> | null = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        if (req.url === "/v1/models") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        const body = JSON.parse(raw || "{}");
        const messages: { role: string; content: string }[] = body.messages ?? [];
        const system = messages[0]?.content ?? "";
        const user = messages.find((m) => m.role === "user")?.content ?? "";
        const field = (name: string) => new RegExp(`^${name}: (.+)$`, "m").exec(user)?.[1]?.trim() ?? "";
        const kind = system.startsWith("You rate how hard") ? "judge" : system.includes("<<GEM:OUTLINE>>") ? "outline" : system.includes("<<GEM:LESSON>>") ? "lesson" : system.includes("<<GEM:CHECK>>") ? "check" : "other";
        seen.push({ model: body.model, kind, system, user, messages, stage: kind === "lesson" || kind === "check" ? await stageNow() : null });
        if (kind === "check" && hangChecks) return;
        let answer = "";
        if (kind === "judge") answer = "medium";
        else if (kind === "outline") {
          answer = JSON.stringify({
            title: `${field("Topic")} course`,
            description: "A course on resistors.",
            prerequisites: [],
            modules: [
              {
                title: "Basics",
                summary: "Voltage, current and resistance.",
                lessons: [
                  // No "law" in a title: Auto's rules would take it for a legal question.
                  { title: "Current in a resistor", summary: "Voltage, current and resistance in a resistor." },
                  { title: "Power in resistors", summary: "P = V·I and heating." },
                ],
              },
            ],
          });
        } else if (kind === "lesson") {
          if (hold && field("Lesson") === "Power in resistors") await hold;
          answer = JSON.stringify(WRITTEN(field("Lesson")));
        } else if (kind === "check" && failChecks) answer = "I looked at the lesson and it seems mostly fine.";
        else if (kind === "check") {
          const round = messages.at(-1)!.content.includes("gave different results") ? 2 : 1;
          answer = checkReply(field("Topic"), round, field("Lesson"));
        }
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } })}\n\n`);
        res.end("data: [DONE]\n\n");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;

    h = await startHarness({ webSearch: { provider: null, url: null, key: null }, youtubeApiKey: null }, { fetch: web.fetchFn, resolve, ytDlp: noYtDlp });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Model server", type: "openai_compatible", baseUrl: base });
    expect(p.status).toBe(200);
    const add = async (key: string, tier: string) =>
      (ids[key] = (await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: key, displayName: key, contextLength: 131072, tier, thinkingSwitch: false, vision: false, sections: ["chat"] })).json.id);
    await add("fast-1", "fast");
    await add("std-1", "standard");
    await add("adv-1", "advanced");
    expect((await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [ids["fast-1"], ids["std-1"], ids["adv-1"]], defaultModelId: ids["std-1"] })).status).toBe(200);
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "searxng", webUrl: "http://searx.test" })).status).toBe(200);
  }, 60_000);

  afterAll(async () => {
    await h?.close();
    await new Promise<void>((r) => server?.close(() => r()));
  });
  afterEach(() => {
    clearWebSearchCache();
    web.searches.length = 0;
    web.pages.length = 0;
  });

  async function newCourse(topic: string) {
    const before = seen.length;
    const r = await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic, level: "basic" });
    expect(r.status).toBe(200);
    await h.app.learning.idle();
    const l = await h.call(h.alice, "GET", `/api/learning/courses/${r.json.id}/lessons/0`);
    expect(l.json.status).toBe("ready");
    return { id: r.json.id as string, lesson: l.json, sent: seen.slice(before) };
  }

  it("writes the lesson from web sources, checks it on the Advanced tier and saves the corrections", async () => {
    const { id, lesson: l, sent } = await newCourse("Resistor basics");
    courseId = id;
    // The standard model wrote it, the advanced one checked it; no model wrote the search queries.
    const writer = sent.find((s) => s.kind === "lesson")!;
    const checker = sent.filter((s) => s.kind === "check");
    expect(writer.model).toBe("std-1");
    expect(checker.map((c) => c.model)).toEqual(["adv-1"]);
    expect(sent.filter((s) => s.kind === "other")).toEqual([]);

    // Research: 2–3 queries from the topic and the outline, each result once, pages read only at public addresses.
    const research = web.searches.filter((s) => s.stage === "researching").map((s) => s.q);
    expect(research).toEqual(["Current resistor basics", "Resistor basics Voltage current resistance", "Current resistor worked example"]);
    expect(web.pages.sort()).toEqual(["docs.example.org/r1", "docs.example.org/r2", "docs.example.org/r3"]);
    expect(writer.user).toContain("<sources>\n[1] Ohm's law explained (docs.example.org)\nPage /r1\nText of /r1");
    expect(writer.user).toContain("[3] Inner notes (inner.example.org)\nSnippet for Inner notes");
    expect(writer.system).toMatch(/Don't copy their text/);
    expect(writer.stage).toBe("writing");

    // The checker got the lesson, the numbered sources and a lookup of each reference.
    const c = checker[0]!;
    expect(c.stage).toBe("checking");
    expect(c.user).toContain("<lesson>");
    expect(c.user).toContain('"answer": "I = 4 A"');
    expect(c.user).toContain("[4] Worked examples (docs.example.org)");
    expect(c.user).toContain("Reference 1: Engineering Circuit Analysis, Hayt, Kemmerly and Durbin\n- Engineering Circuit Analysis, 9th edition (books.example.org)");
    expect(c.user).toContain("Reference 2: The Imaginary Handbook of Volts, Nobody\n(nothing found)");
    expect(web.searches.filter((s) => s.stage === "checking").map((s) => s.q)).toEqual(["Engineering Circuit Analysis Hayt, Kemmerly and Durbin", "The Imaginary Handbook of Volts Nobody"]);

    // The corrected lesson is what's saved, with the issues, the arithmetic and the sources.
    expect(l.content.workedExample.answer).toBe("I = 3 A");
    expect(l.content.references.map((r: { title: string }) => r.title)).toEqual(["Engineering Circuit Analysis"]);
    const v = l.verification;
    expect(v).toMatchObject({ status: "corrected", model: "adv-1", modelId: ids["adv-1"], provider: "searxng", researchNote: null, reason: null });
    expect(v.issues).toHaveLength(2);
    // [9] matches no source: only [1] is kept.
    expect(v.issues[0]).toEqual({ part: "workedExample", problem: "12 V / 4 Ω is 3 A, not 4 A.", fix: "The answer is I = 3 A.", severity: "high", sources: [1] });
    expect(v.issues[1]).toMatchObject({ part: "reference", severity: "medium" });
    expect(v.calc).toEqual([{ label: "Answer", expression: "12 / 4", claimed: 3, computed: 3, ok: true }]);
    expect(v.sources.map((s: { n: number }) => s.n)).toEqual([1, 2, 3, 4]);
    expect(Date.now() - Date.parse(v.checkedAt)).toBeLessThan(60_000);
    expect(l.stage).toBeNull();
    expect(l.canCheck).toBe(true);

    // Links: only the provider's, in the sources; none the writer or the checker wrote.
    expect(v.sources.every((s: { url: string }) => web.results.has(s.url))).toBe(true);
    expect(JSON.stringify(l.content)).not.toMatch(/https?:|made-up|checker-invented/);
    expect(l.content.theory).toBe("Ohm's law relates voltage, current and resistance, as explains.");

    // The checker is metered under Learning against the person's budget, like the writer.
    const usage = (await h.db.select().from(usageEvent).where(eq(usageEvent.userId, h.ids.alice))).filter((u) => u.section === "learning");
    expect(usage.filter((u) => u.modelId === ids["adv-1"]).map((u) => u.status)).toEqual(["ok"]);
    expect(usage.filter((u) => u.modelId === ids["std-1"])).toHaveLength(2);
  });

  it("a calculation that doesn't come out goes back to the checker once; what's still wrong is recorded", async () => {
    const { lesson: l, sent } = await newCourse("CHECK-CALC circuits");
    const checks = sent.filter((s) => s.kind === "check");
    expect(checks).toHaveLength(2);
    expect(checks[1]!.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(checks[1]!.messages[3]!.content).toContain("- Answer: 12 / 4 = 3, but the lesson says 4.");
    expect(l.content.workedExample.answer).toBe("I = 3 A");
    const v = l.verification;
    expect(v.status).toBe("corrected");
    expect(v.calc).toEqual([
      { label: "Answer", expression: "12 / 4", claimed: 3, computed: 3, ok: true },
      { label: "Power", expression: "12 * 3", claimed: 40, computed: 36, ok: false },
    ]);
    expect(v.issues.at(-1)).toEqual({ part: "other", problem: "Power: 12 * 3 comes to 36, but the lesson says 40.", fix: "Not corrected: check this value before you rely on it.", severity: "high", sources: [], open: true });
    // Both rounds are metered.
    const usage = (await h.db.select().from(usageEvent).where(eq(usageEvent.modelId, ids["adv-1"]!))).length;
    expect(usage).toBe(3);
  });

  it("a checker that fails leaves the lesson ready, as written, and not checked, with the reason", async () => {
    const before = (await h.db.select().from(usageEvent).where(eq(usageEvent.modelId, ids["adv-1"]!))).length;
    const { id, lesson: l } = await newCourse("CHECK-FAIL circuits");
    expect(l.status).toBe("ready");
    expect(l.error).toBeNull();
    expect(l.content.workedExample.answer).toBe("I = 4 A");
    // Its links are stripped all the same.
    expect(JSON.stringify(l.content)).not.toMatch(/https?:|made-up/);
    expect(l.verification).toMatchObject({ status: "not_checked", model: null, issues: [], calc: [] });
    expect(l.verification.reason).toBe("The checking model's reply didn't match the required format twice, so the lesson is shown as written.");
    // The sources found are still listed.
    expect(l.verification.sources).toHaveLength(4);
    const tried = (await h.db.select().from(usageEvent).where(eq(usageEvent.modelId, ids["adv-1"]!))).slice(before);
    expect(tried.map((u) => u.status)).toEqual(["error", "error"]);
    // In the person's language.
    const res = await h.app.inject({ method: "GET", url: `/api/learning/courses/${id}/lessons/0`, headers: { origin: APP_URL, cookie: `${h.alice.cookie}; aatmiq_lang=hi` } });
    expect(res.json().verification.reason).toBe("जाँचने वाले मॉडल का उत्तर दोनों बार ज़रूरी प्रारूप में नहीं था, इसलिए पाठ जैसा लिखा गया था वैसा ही दिखाया गया है।");
  });

  it("a search that fails still writes and checks the lesson, and says why", async () => {
    await h.call(h.owner, "PUT", "/api/admin/gem", { webUrl: "http://searx.test/down" });
    const { lesson: l, sent } = await newCourse("Resistors with research down");
    expect(sent.find((s) => s.kind === "lesson")!.user).not.toContain("<sources>");
    const check = sent.find((s) => s.kind === "check")!;
    expect(check.user).toContain("There are no web sources for this lesson");
    expect(check.user).toContain("(the search failed)");
    expect(l.verification).toMatchObject({ status: "corrected", sources: [], researchNote: "Web search failed: The search provider answered 502." });
    // No sources: the issue's [1] goes.
    expect(l.verification.issues[0].sources).toEqual([]);
    await h.call(h.owner, "PUT", "/api/admin/gem", { webUrl: "http://searx.test" });
  });

  it("Check this lesson: a new version, videos kept, the owner's alone and counted like a new version", async () => {
    const video = { videoId: "AAAAAAAAAA1", title: "Ohm's law in 10 minutes", channel: "Circuits", durationSeconds: 600 };
    const [v1] = await h.db.select().from(courseLesson).where(eq(courseLesson.courseId, courseId));
    await h.db.update(courseLesson).set({ videos: [video], videosNote: null }).where(eq(courseLesson.id, v1!.id));

    for (const who of [h.bob, h.owner]) expect((await h.call(who, "POST", `/api/learning/courses/${courseId}/lessons/0/check`)).status).toBe(404);
    expect((await h.call(null, "POST", `/api/learning/courses/${courseId}/lessons/0/check`)).status).toBe(401);
    // A lesson that hasn't been written can't be checked.
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/1/check`)).status).toBe(400);

    const before = seen.length;
    const r = await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/0/check`);
    expect(r.json).toEqual({ ok: true, status: "generating" });
    await h.app.learning.idle();
    const sent = seen.slice(before);
    // Research and a check; nothing rewritten.
    expect(sent.map((s) => s.kind)).toEqual(["check"]);
    expect(sent[0]!.stage).toBe("checking");
    expect(web.searches.some((s) => s.stage === "researching")).toBe(true);
    const l = (await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`)).json;
    expect(l.version).toBe(2);
    expect(l.versions.map((x: { version: number; current: boolean }) => [x.version, x.current])).toEqual([
      [1, false],
      [2, true],
    ]);
    // As saved, with the person's rating and the organization's counts (none yet).
    expect(l.videos).toEqual([{ ...video, myRating: null, myReason: null, counts: { up: 0, ok: 0, down: 0 } }]);
    expect(l.verification).toMatchObject({ status: "corrected", model: "adv-1", rechecked: true });
    expect(l.modelId).toBe(ids["adv-1"]);
    // The earlier version is still there as it was (written from its sources, not checked later).
    const v1Check = (await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0?version=1`)).json.verification;
    expect(v1Check.status).toBe("corrected");
    expect(v1Check.rechecked).toBeUndefined();

    // It counts against the day's lessons, like writing a new version.
    await h.call(h.owner, "PUT", "/api/admin/gem", { lessonsPerDay: 1 });
    const limited = await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/0/check`);
    expect(limited.status).toBe(429);
    await h.call(h.owner, "PUT", "/api/admin/gem", { lessonsPerDay: 60 });
  });

  it("the person's data export has each lesson version's check", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/me/export", headers: { origin: APP_URL, cookie: h.alice.cookie } });
    expect(res.statusCode).toBe(200);
    const files = unzipSync(new Uint8Array(res.rawPayload));
    const courses = Object.keys(files).filter((n) => n.startsWith("learning/")).map((n) => JSON.parse(strFromU8(files[n]!)));
    const ohm = courses.find((c) => c.topic === "Resistor basics")!;
    expect(ohm.lessons.filter((l: { verification: unknown }) => l.verification).map((l: { version: number; verification: { status: string } }) => [l.version, l.verification.status])).toEqual([
      [1, "corrected"],
      [2, "corrected"],
    ]);
  });

  it("with the check switched off, lessons are written as before: no search, no check", async () => {
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { lessonCheck: false })).status).toBe(200);
    const before = seen.length;
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/1/generate`)).status).toBe(200);
    await h.app.learning.idle();
    const l = (await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/1`)).json;
    expect(l.status).toBe("ready");
    expect(l.verification).toBeNull();
    expect(l.canCheck).toBe(false);
    expect(seen.slice(before).map((s) => s.kind)).toEqual(["judge", "lesson"]);
    expect(seen.at(-1)!.user).not.toContain("<sources>");
    expect(web.searches).toEqual([]);
    // Nor can a lesson be checked by hand.
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/1/check`)).status).toBe(403);
    await h.call(h.owner, "PUT", "/api/admin/gem", { lessonCheck: true });
  });

  it("without a web search provider the lesson is still checked, without sources", async () => {
    await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "off" });
    const { lesson: l, sent } = await newCourse("Resistors offline");
    expect(web.searches).toEqual([]);
    expect(sent.filter((s) => s.kind === "check").map((s) => s.model)).toEqual(["adv-1"]);
    expect(l.verification).toMatchObject({ status: "corrected", provider: null, sources: [], researchNote: null });
    expect(sent.find((s) => s.kind === "check")!.user).not.toContain("<reference_lookups>");
    await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "searxng" });
  });

  const versionsOf = async (id: string, n: number) => (await h.call(h.alice, "GET", `/api/learning/courses/${id}/lessons/${n}`)).json.versions as { version: number; status: string; current: boolean; error: string | null }[];
  let rechecks = "";

  it("a check that doesn't finish leaves the lesson shown, with its check, and isn't counted against the day", async () => {
    await h.call(h.owner, "PUT", "/api/admin/gem", { coursesPerDay: 50 });
    rechecks = (await newCourse("Resistor rechecks")).id;
    failChecks = true;
    try {
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/0/check`)).json).toEqual({ ok: true, status: "generating" });
      await h.app.learning.idle();
    } finally {
      failChecks = false;
    }
    const l = (await h.call(h.alice, "GET", `/api/learning/courses/${rechecks}/lessons/0`)).json;
    // Still version 1, with its "Checked · corrections"; the attempt is a failed version that says why.
    expect(l.version).toBe(1);
    expect(l.verification).toMatchObject({ status: "corrected", model: "adv-1" });
    expect(l.versions.map((v: { version: number; status: string; current: boolean }) => [v.version, v.status, v.current])).toEqual([
      [1, "ready", true],
      [2, "failed", false],
    ]);
    expect(l.versions[1].error).toBe("The check didn't finish: the checking model's reply didn't match the required format twice. The lesson shown is unchanged.");
    const [attempt] = await h.db.select().from(courseLesson).where(eq(courseLesson.id, (await h.db.select({ id: courseLesson.id }).from(courseLesson).where(sql`${courseLesson.courseId} = ${rechecks} and ${courseLesson.version} = 2`))[0]!.id));
    expect(attempt!.modelId).toBeNull();
  });

  it("asking twice while another of the course's lessons is being written makes one check, not two", async () => {
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    try {
      // Lesson 2 is being written (and waits); a check of lesson 1 queues behind it.
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/1/generate`)).status).toBe(200);
      const before = seen.length;
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/0/check`)).json).toEqual({ ok: true, status: "generating" });
      // The new version is there at once, so the page shows it and a second ask finds it busy.
      expect((await versionsOf(rechecks, 0)).filter((v) => v.status === "generating")).toHaveLength(1);
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/0/check`)).json).toEqual({ ok: true, status: "generating" });
      expect((await versionsOf(rechecks, 0)).filter((v) => v.status === "generating")).toHaveLength(1);
      release();
      await h.app.learning.idle();
      expect(seen.slice(before).filter((s) => s.kind === "check" && s.user.includes("Lesson: Current in a resistor"))).toHaveLength(1);
    } finally {
      release();
      hold = null;
    }
    expect((await versionsOf(rechecks, 0)).map((v) => [v.version, v.status, v.current])).toEqual([
      [1, "ready", false],
      [2, "failed", false],
      [3, "ready", true],
    ]);
  });

  it("a check or a new version uses one of the day's lessons, not two; showing another version uses none", async () => {
    // Everything written before today.
    await h.db.execute(sql`update course_lesson set updated_at = now() - interval '2 days'`);
    await h.call(h.owner, "PUT", "/api/admin/gem", { lessonsPerDay: 2 });
    try {
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/0/check`)).status).toBe(200);
      await h.app.learning.idle();
      // One lesson today: the version replaced keeps its date, so a second fits.
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/0/regenerate`)).status).toBe(200);
      await h.app.learning.idle();
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/0/check`)).status).toBe(429);
      // Showing version 1 again isn't writing one.
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/0/restore`, { version: 1 })).status).toBe(200);
      await h.call(h.owner, "PUT", "/api/admin/gem", { lessonsPerDay: 3 });
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${rechecks}/lessons/0/check`)).status).toBe(200);
      await h.app.learning.idle();
    } finally {
      await h.call(h.owner, "PUT", "/api/admin/gem", { lessonsPerDay: 60 });
    }
  });

  it("a checker that never answers is given up: the lesson is saved as written, not checked, and says why", async () => {
    h.app.learning.timeouts.check = 300;
    hangChecks = true;
    try {
      const { lesson: l } = await newCourse("Resistor slow checks");
      expect(l).toMatchObject({ status: "ready", stage: null });
      expect(l.content.workedExample.answer).toBe("I = 4 A");
      expect(l.verification).toMatchObject({ status: "not_checked", reason: "The checking model didn't answer in time, so the lesson is shown as written." });
    } finally {
      hangChecks = false;
      h.app.learning.timeouts.check = 10 * 60_000;
    }
  });

  it("with the token allowance used up, nothing is searched for a lesson or a check: it says why", async () => {
    const { id } = await newCourse("Resistor budget");
    await h.db.update(workspace).set({ tokenLimit: 1 }).where(eq(workspace.id, h.workspaceId));
    try {
      web.searches.length = 0;
      const before = seen.length;
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${id}/lessons/1/generate`)).status).toBe(200);
      await h.app.learning.idle();
      const l = (await h.call(h.alice, "GET", `/api/learning/courses/${id}/lessons/1`)).json;
      expect(l).toMatchObject({ status: "failed", error: "You've used your token allowance for this period." });
      expect((await h.call(h.alice, "POST", `/api/learning/courses/${id}/lessons/0/check`)).status).toBe(200);
      await h.app.learning.idle();
      const checked = await versionsOf(id, 0);
      expect(checked.at(-1)).toMatchObject({ status: "failed", current: false, error: "The check didn't run: You've used your token allowance for this period." });
      // No paid search and no model call was made for either.
      expect(web.searches).toEqual([]);
      expect(seen.slice(before).filter((s) => s.kind === "lesson" || s.kind === "check")).toEqual([]);
    } finally {
      await h.db.update(workspace).set({ tokenLimit: null }).where(eq(workspace.id, h.workspaceId));
    }
  });
});
