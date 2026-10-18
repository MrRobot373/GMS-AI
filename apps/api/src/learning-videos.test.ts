/**
 * Lesson videos through yt-dlp, the way Agent-Reach reads YouTube (no API key), against a real
 * Postgres (TEST_DATABASE_URL) with a fake yt-dlp and a fake oEmbed endpoint: the source is chosen
 * from the setting, only real public videos are kept, the query can't become an option, a bot check
 * is said plainly, and saved videos are checked again. Then, with a fake model server: seven videos
 * picked from three searches (only real candidates count, search order when the pick fails),
 * ratings (owner only, the lesson's videos only), the organization's dislikes and an admin's block
 * keeping a video out, and ratings in the data export.
 */
import { and, auditLog, courseLesson, eq, usageEvent, user, videoFeedback, youtubeCache } from "@aatmiq/db";
import { parseModelJson, videoPicksSchema } from "@aatmiq/shared";
import { strFromU8, unzipSync } from "fflate";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_URL, startHarness, type Harness, type Jar } from "../test/gem-harness";
import { applyPicks, orgDisliked } from "./services/lesson-videos";
import { resolveVideoSource, searchVideos, type YtDlpRunner } from "./services/youtube";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe("which source lessons use", () => {
  it("auto prefers the API key, then yt-dlp; a forced source needs what it uses", () => {
    expect(resolveVideoSource("auto", true, true)).toBe("api");
    expect(resolveVideoSource("auto", false, true)).toBe("ytdlp");
    expect(resolveVideoSource("auto", false, false)).toBeNull();
    expect(resolveVideoSource("ytdlp", true, true)).toBe("ytdlp");
    expect(resolveVideoSource("ytdlp", true, false)).toBeNull();
    expect(resolveVideoSource("api", false, true)).toBeNull();
    expect(resolveVideoSource("off", true, true)).toBeNull();
  });
});

/** A fake yt-dlp: one search page with good and bad results, and a bot-check switch. */
function fakeYtDlp() {
  const calls: string[][] = [];
  let blocked = false;
  const entry = (id: string, extra: Record<string, unknown> = {}) => JSON.stringify({ id, title: `Search title ${id}`, channel: "Power Electronics Channel", duration: 754, live_status: null, ...extra });
  const run: YtDlpRunner = async (args) => {
    calls.push(args);
    if (args[0] === "--version") return { code: 0, stdout: "2026.08.19\n", stderr: "" };
    if (blocked) return { code: 1, stdout: "", stderr: "ERROR: [youtube] Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies" };
    const lines = [
      entry("AAAAAAAAAA1"),
      entry("SHORTSHORT2", { duration: 30 }),
      entry("LIVELIVELI3", { live_status: "is_live", duration: null }),
      entry("not-an-id!"),
      entry("PRIVATEVID4"),
      entry("REMOVEDVID5"),
      entry("CCCCCCCCCC6", { duration: 1800 }),
    ];
    return { code: 0, stdout: lines.join("\n") + "\n", stderr: "" };
  };
  return { run, calls, setBlocked: (b: boolean) => (blocked = b) };
}

/** A fake oEmbed: public videos answer 200, private 401, removed 404. */
function fakeOembed() {
  const status: Record<string, number> = { AAAAAAAAAA1: 200, PRIVATEVID4: 401, REMOVEDVID5: 404, CCCCCCCCCC6: 200 };
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    if (u.host !== "www.youtube.com" || u.pathname !== "/oembed") return fetch(input, init);
    const id = new URL(u.searchParams.get("url")!).searchParams.get("v")!;
    const st = status[id] ?? 404;
    if (st !== 200) return new Response("Not Found", { status: st });
    return Response.json({ title: `oEmbed title ${id}`, author_name: "Power Electronics Channel", type: "video" });
  }) as typeof fetch;
  return { fetchFn, remove: (id: string) => (status[id] = 404), fail: (id: string) => (status[id] = 503), restore: (id: string) => (status[id] = 200) };
}

d("GEM AI Learning: videos through yt-dlp (no key)", () => {
  let h: Harness;
  const yt = fakeYtDlp();
  const oe = fakeOembed();
  let courseId = "";

  beforeAll(async () => {
    h = await startHarness({ youtubeApiKey: null }, { fetch: oe.fetchFn, ytDlp: yt.run });
  });
  afterAll(async () => {
    await h?.close();
  });

  it("with no key, Auto uses yt-dlp, and the admin sees that it runs", async () => {
    const g = await h.call(h.owner, "GET", "/api/admin/gem");
    expect(g.status).toBe(200);
    expect(g.json.videoSource).toBe("auto");
    expect(g.json.videos).toMatchObject({ source: "ytdlp", ytDlp: { version: "2026.08.19", error: null } });
  });

  it("a lesson gets real public videos only, and the query can't become an option", async () => {
    const c = await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic: "Buck converters --exec touch /tmp/pwned", level: "basic" });
    expect(c.status).toBe(200);
    courseId = c.json.id;
    await h.app.learning.idle();
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/0/generate`)).status).toBe(200);
    await h.app.learning.idle();
    const l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    expect(l.json.status).toBe("ready");
    expect(l.json.videosNote).toBeNull();
    // Shorts, live streams, malformed IDs, private and removed videos are left out.
    expect(l.json.videos.map((v: { videoId: string }) => v.videoId)).toEqual(["AAAAAAAAAA1", "CCCCCCCCCC6"]);
    // Titles come from oEmbed; thumbnails are built from the ID.
    expect(l.json.videos[0]).toMatchObject({ title: "oEmbed title AAAAAAAAAA1", durationSeconds: 754, thumbnail: "https://i.ytimg.com/vi/AAAAAAAAAA1/mqdefault.jpg" });
    const search = yt.calls.find((a) => a.some((x) => x.startsWith("ytsearch")))!;
    expect(search).toEqual(expect.arrayContaining(["--ignore-config", "--no-cache-dir", "--flat-playlist", "--dump-json"]));
    // The whole query is one argument after "ytsearchN:", never options of its own.
    expect(search.at(-1)).toMatch(/^ytsearch\d+:Buck converters --exec touch/);
    expect(search.filter((x) => x === "--exec")).toEqual([]);
  });

  it("a bot check is said plainly, not as 'no videos found'", async () => {
    yt.setBlocked(true);
    await h.db.delete(youtubeCache);
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/1/generate`)).status).toBe(200);
    await h.app.learning.idle();
    const l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/1`);
    expect(l.json.status).toBe("ready");
    expect(l.json.videos).toEqual([]);
    expect(l.json.videosNote).toBe("blocked");
    yt.setBlocked(false);
  });

  it("a video that's gone drops out when saved videos are checked again, one YouTube didn't answer for stays", async () => {
    const lessonId = (await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`)).json.id;
    oe.remove("AAAAAAAAAA1");
    oe.fail("CCCCCCCCCC6");
    await h.app.learning.refreshVideos(lessonId);
    let l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    expect(l.json.videos.map((v: { videoId: string }) => v.videoId)).toEqual(["CCCCCCCCCC6"]);
    oe.remove("CCCCCCCCCC6");
    await h.app.learning.refreshVideos(lessonId);
    l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    expect(l.json.videos).toEqual([]);
    oe.restore("CCCCCCCCCC6");
  });

  it("yt-dlp gets its own copy of the cookies file, and the proxy", async () => {
    const original = join(mkdtempSync(join(tmpdir(), "cookies-test-")), "cookies.txt");
    writeFileSync(original, "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\n");
    let seen: { path: string; content: string; args: string[] } | null = null;
    const run: YtDlpRunner = async (args, opts) => {
      const path = args[args.indexOf("--cookies") + 1]!;
      seen = { path, content: readFileSync(path, "utf8"), args };
      writeFileSync(path, "yt-dlp writes its cookie jar back here");
      return yt.run(args, opts);
    };
    const deps = { db: h.db, source: "ytdlp" as const, key: null, apiUrl: "", fetch: oe.fetchFn, ytDlp: { run, cookies: original, proxy: "socks5://proxy:1080" } };
    const videos = await searchVideos(deps, "cookie copy test", 3);
    expect(videos.map((v) => v.videoId)).toEqual(["CCCCCCCCCC6"]);
    expect(seen!.path).not.toBe(original);
    expect(seen!.content).toContain("SID\tabc");
    expect(seen!.args).toEqual(expect.arrayContaining(["--proxy", "socks5://proxy:1080"]));
    // The admin's file is untouched and the copy is gone.
    expect(readFileSync(original, "utf8")).toContain("SID\tabc");
    expect(existsSync(seen!.path)).toBe(false);
    // A cookies file that can't be read is an error, not a search without cookies.
    await expect(searchVideos({ ...deps, ytDlp: { ...deps.ytDlp, cookies: join(tmpdir(), "no-such-cookies.txt") } }, "missing cookies test", 3)).rejects.toThrow(/YT_DLP_COOKIES/);
  });

  it("switched off, or the API chosen without a key: no videos, and it says why", async () => {
    for (const videoSource of ["off", "api"] as const) {
      expect((await h.call(h.owner, "PUT", "/api/admin/gem", { videoSource })).status).toBe(200);
      expect((await h.call(h.owner, "GET", "/api/admin/gem")).json.videos.source).toBeNull();
      await h.db.delete(youtubeCache);
      const n = videoSource === "off" ? 2 : 3;
      await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/${n}/generate`);
      await h.app.learning.idle();
      const l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/${n}`);
      expect(l.json.videosNote).toBe("not_configured");
    }
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { videoSource: "ytdlp" })).status).toBe(200);
    expect((await h.call(h.owner, "GET", "/api/admin/gem")).json.videos.source).toBe("ytdlp");
  });
});

describe("which picks count", () => {
  const v = (n: number) => ({ videoId: `VID${String(n).padStart(8, "0")}`, title: `Video ${n}`, channel: "C" });
  const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v);

  it("only real candidates, each once, at most seven, best first, with their line", () => {
    const picks = [12, 3, 3, 0, -1, 2.5, Number.NaN, 1, 10, 4, 5, 6, 7, 8].map((index) => ({ index, why: index === 3 ? "Full lecture" : "" }));
    const out = applyPicks(candidates, picks)!;
    expect(out.map((x) => x.videoId)).toEqual([3, 1, 10, 4, 5, 6, 7].map((n) => v(n).videoId));
    expect(out[0]!.why).toBe("Full lecture");
    expect(out[1]).not.toHaveProperty("why");
    // Nothing real: the caller keeps search order.
    expect(applyPicks(candidates, [{ index: 99, why: "x" }])).toBeNull();
    expect(applyPicks(candidates, [])).toBeNull();
  });

  it("reads the picker's reply leniently and strips links from its lines", () => {
    const r = parseModelJson(videoPicksSchema, '{"picks": [{"index": "4", "why": "See https://made-up.example/x for a lecture"}, {"index": "four"}, {"index": 2, "why": 7}]}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.picks[0]).toEqual({ index: 4, why: "See for a lecture" });
    expect(Number.isNaN(r.value.picks[1]!.index)).toBe(true);
    expect(r.value.picks[2]).toEqual({ index: 2, why: "" });
    expect(parseModelJson(videoPicksSchema, "{}").ok).toBe(true);
  });

  it("the organization's dislike: at least two Not helpful and more of those than Helpful", () => {
    expect(orgDisliked({ up: 0, ok: 0, down: 2 })).toBe(true);
    expect(orgDisliked({ up: 1, ok: 3, down: 2 })).toBe(true);
    expect(orgDisliked({ up: 2, ok: 0, down: 2 })).toBe(false);
    expect(orgDisliked({ up: 0, ok: 0, down: 1 })).toBe(false);
    expect(orgDisliked(undefined)).toBe(false);
  });
});

const vid = (n: number) => `VID${String(n).padStart(8, "0")}`;
/** Each search phrase's results: the second and third overlap the one before by two. */
const QUERY_BASE: Record<string, number> = { "resistors explained": 0, "ohms law lecture": 8, "resistor colour code": 16 };

/** A lesson that passes lessonSchema, asking for three video searches. */
const lessonJson = (title: string) => ({
  title,
  objectives: ["Apply Ohm's law with units"],
  prerequisites: [],
  theory: "Ohm's law relates voltage, current and resistance in a linear resistor.",
  explanation: "For a linear resistor the current is proportional to the voltage across it, so I = V / R.",
  equations: [{ name: "Ohm's law", expression: "V = I·R", symbols: [{ symbol: "V", meaning: "voltage", unit: "V" }], validity: "Linear resistors at constant temperature" }],
  workedExample: { problem: "A 12 V supply drives a 4 Ω resistor. Find the current.", given: ["V = 12 V", "R = 4 Ω"], steps: ["I = V / R = 12 / 4"], answer: "I = 3 A" },
  diagrams: [],
  commonMistakes: ["Mixing up kΩ and Ω"],
  videoQueries: Object.keys(QUERY_BASE),
  references: [],
  takeaways: ["V = I·R for linear resistors"],
});

d("GEM AI Learning: seven picked videos, rated", () => {
  let h: Harness;
  let server: Server;
  const searches: string[] = [];
  /** What the picker answers (the user message it got → its reply). */
  let pick: (user: string) => string = () => "";
  /** The picker never answers. */
  let hangPick = false;
  const seen: { kind: string; model: string; user: string }[] = [];
  const ids: Record<string, string> = {};
  const course: Record<"alice" | "bob" | "owner", string> = { alice: "", bob: "", owner: "" };

  const ytDlp: YtDlpRunner = async (args) => {
    if (args[0] === "--version") return { code: 0, stdout: "2026.08.19\n", stderr: "" };
    const m = /^ytsearch(\d+):(.*)$/.exec(args.at(-1)!)!;
    searches.push(args.at(-1)!);
    const base = QUERY_BASE[m[2]!] ?? 100;
    const lines = Array.from({ length: Number(m[1]) }, (_, i) => JSON.stringify({ id: vid(base + i + 1), title: `Search ${base + i + 1}`, channel: "Circuits", duration: 600 + i, live_status: null }));
    return { code: 0, stdout: lines.join("\n") + "\n", stderr: "" };
  };
  const fetchFn = (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    if (u.host === "www.youtube.com" && u.pathname === "/oembed") {
      const id = new URL(u.searchParams.get("url")!).searchParams.get("v")!;
      return Response.json({ title: `Title of ${id}`, author_name: `Channel of ${id}` });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const videoIds = (l: { videos: { videoId: string }[] }) => l.videos.map((v) => v.videoId);
  const lessonOf = async (j: Jar, courseId: string, n: number) => (await h.call(j, "GET", `/api/learning/courses/${courseId}/lessons/${n}`)).json;
  const write = async (j: Jar, courseId: string, n: number) => {
    expect((await h.call(j, "POST", `/api/learning/courses/${courseId}/lessons/${n}/generate`)).status).toBe(200);
    await h.app.learning.idle();
    return lessonOf(j, courseId, n);
  };
  const newCourse = async (j: Jar, topic: string) => {
    const r = await h.call(j, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic, level: "basic" });
    expect(r.status).toBe(200);
    await h.app.learning.idle();
    return r.json.id as string;
  };
  const rate = (j: Jar | null, courseId: string, n: number, videoId: string, body: unknown) => h.call(j, "PUT", `/api/learning/courses/${courseId}/lessons/${n}/videos/${videoId}/feedback`, body);
  /** Every candidate, in the order the picker was shown them. */
  const inOrder = (user: string) => JSON.stringify({ picks: [...user.matchAll(/^\[(\d+)\] /gm)].map((m) => ({ index: Number(m[1]), why: `Good lecture ${m[1]}` })) });

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.url === "/v1/models") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        const body = JSON.parse(raw || "{}");
        const messages: { role: string; content: string }[] = body.messages ?? [];
        const system = messages[0]?.content ?? "";
        const user = messages.find((m) => m.role === "user")?.content ?? "";
        const field = (name: string) => new RegExp(`^${name}: (.+)$`, "m").exec(user)?.[1]?.trim() ?? "";
        const kind = system.startsWith("You rate how hard") ? "judge" : system.includes("<<GEM:OUTLINE>>") ? "outline" : system.includes("<<GEM:LESSON>>") ? "lesson" : system.includes("<<GEM:VIDEOS>>") ? "videos" : "other";
        seen.push({ kind, model: body.model, user });
        if (kind === "videos" && hangPick) return;
        const answer =
          kind === "judge"
            ? "medium"
            : kind === "outline"
              ? JSON.stringify({
                  title: `${field("Topic")} course`,
                  description: "A course on resistors.",
                  prerequisites: [],
                  modules: [{ title: "Basics", summary: "Voltage, current and resistance.", lessons: ["Current in a resistor", "Power in resistors", "Resistors in series", "Resistors in parallel"].map((title) => ({ title, summary: `${title}, worked through.` })) }],
                })
              : kind === "lesson"
                ? JSON.stringify(lessonJson(field("Lesson")))
                : kind === "videos"
                  ? pick(user)
                  : "";
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } })}\n\n`);
        res.end("data: [DONE]\n\n");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    h = await startHarness({ youtubeApiKey: null }, { fetch: fetchFn, ytDlp });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Model server", type: "openai_compatible", baseUrl: base });
    expect(p.status).toBe(200);
    const add = async (key: string, tier: string) =>
      (ids[key] = (await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: key, displayName: key, contextLength: 131072, tier, thinkingSwitch: false, vision: false, sections: ["chat"] })).json.id);
    await add("fast-1", "fast");
    await add("std-1", "standard");
    expect((await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [ids["fast-1"], ids["std-1"]], defaultModelId: ids["std-1"] })).status).toBe(200);
    // Lessons as written (learning-check.test.ts covers the check).
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { lessonCheck: false, videoSource: "ytdlp" })).status).toBe(200);
  }, 60_000);
  afterAll(async () => {
    await h?.close();
    await new Promise<void>((r) => server?.close(() => r()));
  });

  it("up to seven videos, picked by the fast model from every result of three searches; invented numbers don't count", async () => {
    pick = () => JSON.stringify({ picks: [12, 3, 3, 99, 0, 1, 25, 5, 7, 8, 9].map((index) => ({ index, why: `Pick ${index}: a full lecture https://made-up.example/v` })) });
    const before = seen.length;
    course.alice = await newCourse(h.alice, "Resistors");
    const l = await lessonOf(h.alice, course.alice, 0);
    expect(l.status).toBe("ready");
    // Three searches of ten results each.
    expect(searches).toEqual(Object.keys(QUERY_BASE).map((q) => `ytsearch10:${q}`));
    // The picker saw every confirmed result once (26 after the overlaps), numbered from 1.
    const asked = seen.slice(before).filter((s) => s.kind === "videos");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.model).toBe("fast-1");
    expect(asked[0]!.user).toContain("Lesson: Current in a resistor");
    expect(asked[0]!.user).toContain("- Apply Ohm's law with units");
    expect(asked[0]!.user).toContain(`[1] Title of ${vid(1)} · Channel of ${vid(1)} · 10 min · no ratings yet`);
    expect(asked[0]!.user).toContain("[26] ");
    expect(asked[0]!.user).not.toContain("[27] ");
    // Seven, best first; 99 and 0 match no candidate and the second 3 is a repeat.
    expect(videoIds(l)).toEqual([12, 3, 1, 25, 5, 7, 8].map(vid));
    expect(l.videos[0]).toMatchObject({ title: `Title of ${vid(12)}`, why: "Pick 12: a full lecture", myRating: null, myReason: null, counts: { up: 0, ok: 0, down: 0 } });
    // Metered under Learning on the fast model (which may also have judged requests, under Chat).
    const usage = await h.db.select().from(usageEvent).where(and(eq(usageEvent.modelId, ids["fast-1"]!), eq(usageEvent.section, "learning")));
    expect(usage.map((u) => u.status)).toEqual(["ok"]);
  });

  it("a pick that names no real video, or a pick call that fails, keeps search order", async () => {
    pick = () => JSON.stringify({ picks: [{ index: 99, why: "Invented" }, { index: "three" }] });
    let l = await write(h.alice, course.alice, 1);
    expect(videoIds(l)).toEqual([1, 2, 3, 4, 5, 6, 7].map(vid));
    expect(l.videos.some((v: { why?: string }) => v.why)).toBe(false);

    pick = () => "I'd rather not choose.";
    const before = seen.length;
    l = await write(h.alice, course.alice, 2);
    expect(l.status).toBe("ready");
    expect(videoIds(l)).toEqual([1, 2, 3, 4, 5, 6, 7].map(vid));
    // One try only: search order is the fallback, not a retry.
    expect(seen.slice(before).filter((s) => s.kind === "videos")).toHaveLength(1);
    const usage = await h.db.select().from(usageEvent).where(and(eq(usageEvent.modelId, ids["fast-1"]!), eq(usageEvent.section, "learning")));
    expect(usage.map((u) => u.status).sort()).toEqual(["error", "ok", "ok"]);
  });

  it("a pick call that never answers is given up after a while, and the lesson is saved in search order", async () => {
    h.app.learning.timeouts.pick = 300;
    hangPick = true;
    try {
      const started = Date.now();
      const id = await newCourse(h.alice, "Resistors, picked slowly");
      const l = await lessonOf(h.alice, id, 0);
      expect(l.status).toBe("ready");
      expect(l.stage).toBeNull();
      expect(videoIds(l)).toEqual([1, 2, 3, 4, 5, 6, 7].map(vid));
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      hangPick = false;
      h.app.learning.timeouts.pick = 45_000;
    }
  });

  it("ratings: the course's owner only, a video of that lesson only, and they can be changed or taken back", async () => {
    pick = inOrder;
    const v12 = vid(12);
    for (const who of [h.bob, h.owner]) expect((await rate(who, course.alice, 0, v12, { rating: "up" })).status).toBe(404);
    expect((await rate(null, course.alice, 0, v12, { rating: "up" })).status).toBe(401);
    // Not in this lesson, not a video ID, not a rating.
    expect((await rate(h.alice, course.alice, 0, vid(2), { rating: "up" })).status).toBe(404);
    expect((await rate(h.alice, course.alice, 0, "not-a-video-id", { rating: "up" })).status).toBe(404);
    expect((await rate(h.alice, course.alice, 0, v12, { rating: "meh" })).status).toBe(400);
    expect((await rate(h.alice, course.alice, 0, v12, { rating: "down", reason: "boring" })).status).toBe(400);
    expect((await rate(h.alice, course.alice, 0, v12, {})).status).toBe(400);

    let r = await rate(h.alice, course.alice, 0, v12, { rating: "up", reason: "off_topic" });
    expect(r.status).toBe(200);
    // A reason goes only with Not helpful.
    expect(r.json).toEqual({ myRating: "up", myReason: null, counts: { up: 1, ok: 0, down: 0 } });
    r = await rate(h.alice, course.alice, 0, v12, { rating: "ok" });
    expect(r.json.counts).toEqual({ up: 0, ok: 1, down: 0 });
    r = await rate(h.alice, course.alice, 0, v12, { rating: "down", reason: "too_long" });
    expect(r.json).toEqual({ myRating: "down", myReason: "too_long", counts: { up: 0, ok: 0, down: 1 } });
    let l = await lessonOf(h.alice, course.alice, 0);
    expect(l.videos.find((v: { videoId: string }) => v.videoId === v12)).toMatchObject({ myRating: "down", myReason: "too_long", counts: { up: 0, ok: 0, down: 1 } });
    // One rating per person and video.
    expect(await h.db.select().from(videoFeedback).where(eq(videoFeedback.userId, h.ids.alice))).toHaveLength(1);
    r = await rate(h.alice, course.alice, 0, v12, { rating: null });
    expect(r.json).toEqual({ myRating: null, myReason: null, counts: { up: 0, ok: 0, down: 0 } });
    expect(await h.db.select().from(videoFeedback).where(eq(videoFeedback.userId, h.ids.alice))).toHaveLength(0);
    // A video of an earlier version of the lesson can be rated too.
    const [v1] = await h.db.select().from(courseLesson).where(and(eq(courseLesson.courseId, course.alice), eq(courseLesson.ordinal, 1)));
    await h.db.insert(courseLesson).values({ courseId: course.alice, ordinal: 1, version: 2, current: false, title: v1!.title, status: "ready", content: v1!.content, videos: [{ videoId: vid(40), title: "Older", channel: "C" }] });
    expect((await rate(h.alice, course.alice, 1, vid(40), { rating: "ok" })).status).toBe(200);
    expect((await rate(h.alice, course.alice, 1, vid(40), { rating: null })).status).toBe(200);
    l = await lessonOf(h.alice, course.alice, 1);
    expect(l.version).toBe(1);
  });

  it("the owner's Not helpful and the organization's dislikes keep a video out of new lessons; ratings so far go to the picker", async () => {
    // Alice: 3 not helpful (her own), 7 helpful.
    expect((await rate(h.alice, course.alice, 0, vid(3), { rating: "down", reason: "off_topic" })).status).toBe(200);
    expect((await rate(h.alice, course.alice, 0, vid(7), { rating: "up" })).status).toBe(200);
    // Bob's lesson still has 3: one Not helpful in the organization isn't enough.
    course.bob = await newCourse(h.bob, "Resistors for Bob");
    let l = await lessonOf(h.bob, course.bob, 0);
    expect(videoIds(l)).toEqual([1, 2, 3, 4, 5, 6, 7].map(vid));
    expect(l.videos.find((v: { videoId: string }) => v.videoId === vid(7)).counts).toEqual({ up: 1, ok: 0, down: 0 });
    expect(l.videos[0].why).toBe("Good lecture 1");
    for (const [n, rating] of [[5, "down"], [7, "down"], [2, "up"]] as const) expect((await rate(h.bob, course.bob, 0, vid(n), { rating })).status).toBe(200);
    course.owner = await newCourse(h.owner, "Resistors for Olga");
    expect((await rate(h.owner, course.owner, 0, vid(5), { rating: "down", reason: "poor_quality" })).status).toBe(200);
    expect((await rate(h.owner, course.owner, 0, vid(7), { rating: "down", reason: "off_topic" })).status).toBe(200);

    // 5 (two Not helpful) and 7 (two against one) are out for everyone; 3 for Alice, who marked it.
    const before = seen.length;
    l = await write(h.alice, course.alice, 3);
    expect(videoIds(l)).toEqual([1, 2, 4, 6, 8, 9, 10].map(vid));
    const asked = seen.slice(before).find((s) => s.kind === "videos")!;
    for (const n of [3, 5, 7]) expect(asked.user).not.toContain(`Title of ${vid(n)}`);
    expect(asked.user).toContain(`[2] Title of ${vid(2)} · Channel of ${vid(2)} · 10 min · rated 1 helpful, 0 okay, 0 not helpful`);
    // Alice's own earlier lesson keeps what it has; her Not helpful video is still there for Undo.
    expect(videoIds(await lessonOf(h.alice, course.alice, 0))).toContain(vid(3));
  });

  it("admins see the ratings and block a video: it leaves lessons and isn't offered again", async () => {
    expect((await h.call(h.alice, "GET", "/api/admin/gem/videos/feedback")).status).toBe(403);
    let rep = (await h.call(h.owner, "GET", "/api/admin/gem/videos/feedback")).json;
    expect(rep.totals).toEqual({ ratings: 7, up: 2, ok: 0, down: 5, videos: 4, people: 3, blocked: 0 });
    expect(rep.mostDisliked.map((v: { videoId: string }) => v.videoId)).toEqual([vid(5), vid(7), vid(3)]);
    expect(rep.mostDisliked[0]).toMatchObject({ title: `Title of ${vid(5)}`, channel: `Channel of ${vid(5)}`, up: 0, ok: 0, down: 2, reasons: [{ reason: "poor_quality", n: 1 }], leftOut: true });
    expect(rep.mostDisliked[2]).toMatchObject({ down: 1, leftOut: false, reasons: [{ reason: "off_topic", n: 1 }] });
    expect(rep.mostLiked.map((v: { videoId: string }) => v.videoId)).toEqual([vid(2), vid(7)]);

    expect((await h.call(h.alice, "PUT", `/api/admin/gem/videos/${vid(2)}/block`, { blocked: true })).status).toBe(403);
    expect((await h.call(h.owner, "PUT", "/api/admin/gem/videos/not-a-video-id/block", { blocked: true })).status).toBe(400);
    expect((await h.call(h.owner, "PUT", `/api/admin/gem/videos/${vid(2)}/block`, {})).status).toBe(400);
    expect((await h.call(h.owner, "PUT", `/api/admin/gem/videos/${vid(2)}/block`, { blocked: true, reason: "An advert" })).status).toBe(200);
    const [entry] = await h.db.select().from(auditLog).where(eq(auditLog.action, "video.blocked"));
    expect(entry).toMatchObject({ targetType: "video", targetId: vid(2), actorId: h.ids.owner });

    // Gone from the lessons that had it at once; they're due for a check, which drops it from what's saved.
    const lesson3 = () => h.db.select().from(courseLesson).where(and(eq(courseLesson.courseId, course.alice), eq(courseLesson.ordinal, 3)));
    expect((await lesson3())[0]!.videosCheckedAt).toBeNull();
    expect(videoIds(await lessonOf(h.alice, course.alice, 3))).not.toContain(vid(2));
    await h.app.learning.refreshVideos((await lesson3())[0]!.id);
    const [saved] = await lesson3();
    expect(saved!.videos!.map((v) => v.videoId)).toEqual([1, 4, 6, 8, 9, 10].map(vid));
    expect(saved!.videosCheckedAt).not.toBeNull();
    // Never offered again: Bob's new version of his lesson doesn't get it.
    const before = seen.length;
    expect((await h.call(h.bob, "POST", `/api/learning/courses/${course.bob}/lessons/0/regenerate`)).status).toBe(200);
    await h.app.learning.idle();
    expect(seen.slice(before).find((s) => s.kind === "videos")!.user).not.toContain(`Title of ${vid(2)}`);
    expect(videoIds(await lessonOf(h.bob, course.bob, 0))).toEqual([1, 3, 4, 6, 8, 9, 10].map(vid));

    rep = (await h.call(h.owner, "GET", "/api/admin/gem/videos/feedback")).json;
    expect(rep.totals.blocked).toBe(1);
    expect(rep.blocked).toEqual([expect.objectContaining({ videoId: vid(2), title: `Title of ${vid(2)}`, channel: `Channel of ${vid(2)}`, reason: "An advert", blockedBy: "Olga Owner" })]);
    expect(rep.mostLiked.map((v: { videoId: string }) => v.videoId)).toEqual([vid(7)]);

    // Unblocked: offered again, but lessons that dropped it don't get it back.
    expect((await h.call(h.owner, "PUT", `/api/admin/gem/videos/${vid(2)}/block`, { blocked: false })).status).toBe(200);
    expect((await h.call(h.owner, "GET", "/api/admin/gem/videos/feedback")).json.blocked).toEqual([]);
    expect(videoIds(await lessonOf(h.alice, course.alice, 3))).not.toContain(vid(2));
  });

  it("the Data API asks for ten results a search", async () => {
    const asked: URL[] = [];
    const api = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      asked.push(u);
      return Response.json({ items: [] });
    }) as typeof fetch;
    await searchVideos({ db: h.db, source: "api", key: "k", apiUrl: "http://yt.test/youtube/v3", fetch: api }, "ten results please");
    expect(asked[0]!.pathname).toBe("/youtube/v3/search");
    expect(asked[0]!.searchParams.get("maxResults")).toBe("10");
  });

  it("a person's ratings are in their data export, and go when they're erased", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/me/export", headers: { origin: APP_URL, cookie: h.alice.cookie } });
    expect(res.statusCode).toBe(200);
    const files = unzipSync(new Uint8Array(res.rawPayload));
    const ratings = JSON.parse(strFromU8(files["learning/video-ratings.json"]!));
    expect(ratings.map((r: { videoId: string; rating: string; reason: string | null; lesson: string }) => [r.videoId, r.rating, r.reason, r.lesson])).toEqual([
      [vid(3), "down", "off_topic", "Current in a resistor"],
      [vid(7), "up", null, "Current in a resistor"],
    ]);
    expect(strFromU8(files["README.txt"]!)).toContain("your ratings of lesson videos");

    expect(await h.db.select().from(videoFeedback).where(eq(videoFeedback.userId, h.ids.bob))).toHaveLength(3);
    await h.db.delete(user).where(eq(user.id, h.ids.bob));
    expect(await h.db.select().from(videoFeedback).where(eq(videoFeedback.userId, h.ids.bob))).toHaveLength(0);
  });
});
