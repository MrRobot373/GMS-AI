/**
 * Lesson videos through yt-dlp, the way Agent-Reach reads YouTube (no API key), against a real
 * Postgres (TEST_DATABASE_URL) with a fake yt-dlp and a fake oEmbed endpoint: the source is chosen
 * from the setting, only real public videos are kept, the query can't become an option, a bot check
 * is said plainly, and saved videos are checked again.
 */
import { youtubeCache } from "@aatmiq/db";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
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
