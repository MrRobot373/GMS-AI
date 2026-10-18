/**
 * Videos for lessons, from one of two sources, and never from what a model wrote:
 *  - the YouTube Data API v3 (needs a key): search.list, then videos.list for each result;
 *  - yt-dlp, the way Agent-Reach reads YouTube (no key): a flat `ytsearch`, then each result
 *    confirmed public and embeddable through YouTube's oEmbed endpoint.
 * Every link is built from a video ID the source returned. Searches are cached for a week, and
 * saved videos are re-checked so removed or private ones drop out. Which of the results a lesson
 * shows is decided in services/lesson-videos.ts.
 */
import { eq, sql, youtubeCache, type DB, type LessonVideo } from "@aatmiq/db";
import type { VideoSource } from "@aatmiq/shared";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CACHE_DAYS = 7;
/** Results asked of each search (the API's maxResults, yt-dlp's ytsearchN), before they're confirmed. */
export const SEARCH_RESULTS = 10;

export type VideoNote = "not_configured" | "quota" | "unavailable" | "blocked";
export type VideoOutcome = { videos: LessonVideo[]; note: VideoNote | null };

export class YouTubeQuotaError extends Error {}
/** YouTube asked this server to sign in ("confirm you're not a bot"): cookies or a proxy help. */
export class YouTubeBlockedError extends Error {}

/** Runs yt-dlp with these arguments (tests pass a fake one). Never through a shell. */
export type YtDlpRunner = (args: string[], opts: { timeoutMs: number }) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface VideoDeps {
  db: DB;
  /** The source in use; null when none is available (no key, no yt-dlp, or switched off). */
  source: "api" | "ytdlp" | null;
  key: string | null;
  apiUrl: string;
  fetch?: typeof fetch;
  ytDlp?: { run: YtDlpRunner; cookies: string | null; proxy: string | null };
}

/** ISO 8601 duration (PT1H2M3S) in seconds. */
export function isoDuration(d: string | undefined): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d ?? "");
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

/** A video ID as YouTube issues them (11 characters of [A-Za-z0-9_-]). */
export const isVideoId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);

/** Which source a lesson uses, from the admin's choice and what this server has. */
export function resolveVideoSource(setting: VideoSource, hasKey: boolean, hasYtDlp: boolean): "api" | "ytdlp" | null {
  if (setting === "off") return null;
  if (setting === "api") return hasKey ? "api" : null;
  if (setting === "ytdlp") return hasYtDlp ? "ytdlp" : null;
  return hasKey ? "api" : hasYtDlp ? "ytdlp" : null;
}

/* ───────────── yt-dlp ───────────── */

/** The real yt-dlp: no shell, a time limit, bounded output, a minimal environment. */
export function ytDlpRunner(path: string): YtDlpRunner {
  return (args, { timeoutMs }) =>
    new Promise((resolve) => {
      execFile(
        path,
        args,
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", LANG: "C.UTF-8" }, windowsHide: true },
        (err, stdout, stderr) => {
          const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 127) : 0;
          resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? (err ? err.message : "")) });
        },
      );
    });
}

const versionCache = new WeakMap<YtDlpRunner, { at: number; version: string | null; error: string | null }>();

/** yt-dlp's version, or why it can't run (checked at most every 10 minutes, like a doctor). */
export async function ytDlpStatus(run: YtDlpRunner): Promise<{ version: string | null; error: string | null }> {
  const hit = versionCache.get(run);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  const r = await run(["--version"], { timeoutMs: 10_000 });
  const version = r.code === 0 && /^\d{4}\.\d{1,2}\.\d{1,2}/.test(r.stdout.trim()) ? r.stdout.trim() : null;
  const out = { at: Date.now(), version, error: version ? null : (r.stderr || r.stdout || "yt-dlp didn't start").trim().slice(0, 300) };
  versionCache.set(run, out);
  return out;
}

const BOT_CHECK = /confirm you.?re not a bot|sign in to confirm|HTTP Error 429/i;

/**
 * yt-dlp writes its cookie jar back to the --cookies file when it exits, so each run gets its own
 * private copy: the admin's file can stay read-only and two searches at once can't corrupt it.
 */
async function withCookies<T>(deps: VideoDeps, fn: (cookies: string | null) => Promise<T>): Promise<T> {
  const src = deps.ytDlp!.cookies;
  if (!src) return fn(null);
  const dir = await mkdtemp(join(tmpdir(), "aatmiq-ytdlp-"));
  try {
    const copy = join(dir, "cookies.txt");
    try {
      await copyFile(src, copy);
      await chmod(copy, 0o600);
    } catch {
      throw new Error("The yt-dlp cookies file (YT_DLP_COOKIES) can't be read");
    }
    return await fn(copy);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function baseArgs(deps: VideoDeps, cookies: string | null): string[] {
  const proxy = deps.ytDlp!.proxy;
  return ["--ignore-config", "--no-cache-dir", "--no-warnings", "--socket-timeout", "15", ...(cookies ? ["--cookies", cookies] : []), ...(proxy ? ["--proxy", proxy] : [])];
}

/** A flat search: one request for the results page, no video page is opened. */
async function ytDlpSearch(deps: VideoDeps, q: string, n: number): Promise<LessonVideo[]> {
  // The query is one argument after "ytsearchN:", so it can never be read as an option.
  const r = await withCookies(deps, (cookies) => deps.ytDlp!.run([...baseArgs(deps, cookies), "--flat-playlist", "--dump-json", `ytsearch${n}:${q}`], { timeoutMs: 60_000 }));
  if (BOT_CHECK.test(r.stderr)) throw new YouTubeBlockedError("YouTube asked this server to sign in");
  if (r.code !== 0 && !r.stdout.trim()) throw new Error(`yt-dlp failed: ${r.stderr.trim().slice(0, 200)}`);
  const out: LessonVideo[] = [];
  for (const line of r.stdout.split("\n")) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isVideoId(e.id)) continue;
    // Live, upcoming and very short (Shorts) or very long videos aren't lesson material.
    if (typeof e.live_status === "string" && e.live_status !== "not_live" && e.live_status !== "was_live") continue;
    const duration = typeof e.duration === "number" ? Math.round(e.duration) : null;
    if (duration === null || duration < 60 || duration > 4 * 3600) continue;
    out.push({
      videoId: e.id,
      title: String(e.title ?? "").slice(0, 300),
      channel: String(e.channel ?? e.uploader ?? "").slice(0, 200),
      durationSeconds: duration,
      // Built from the ID, like the watch link: nothing from the page becomes a URL.
      thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
    });
  }
  return out;
}

/**
 * YouTube's oEmbed answer for a video: its title and channel when it's public and embeddable,
 * null when it isn't (removed, private, not embeddable), "error" when YouTube couldn't be asked.
 */
async function oembed(deps: VideoDeps, id: string): Promise<{ title: string; channel: string } | null | "error"> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    const res = await (deps.fetch ?? fetch)(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 200) {
      const j = (await res.json()) as { title?: unknown; author_name?: unknown };
      return { title: String(j.title ?? "").slice(0, 300), channel: String(j.author_name ?? "").slice(0, 200) };
    }
    if ([400, 401, 403, 404].includes(res.status)) return null;
    return "error";
  } catch {
    return "error";
  }
}

/**
 * The videos that are still public and embeddable, checked a few at a time, and the IDs YouTube
 * couldn't be asked about this time (neither confirmed nor gone).
 */
async function oembedCheck(deps: VideoDeps, videos: LessonVideo[]): Promise<{ live: Map<string, LessonVideo>; unsure: Set<string> }> {
  const live = new Map<string, LessonVideo>();
  const unsure = new Set<string>();
  for (let i = 0; i < videos.length; i += 4) {
    const batch = videos.slice(i, i + 4);
    const answers = await Promise.all(batch.map((v) => oembed(deps, v.videoId)));
    answers.forEach((a, k) => {
      const v = batch[k]!;
      if (a === "error") unsure.add(v.videoId);
      else if (a) live.set(v.videoId, { ...v, title: a.title || v.title, channel: a.channel || v.channel });
    });
  }
  if (videos.length && unsure.size === videos.length) throw new Error("YouTube couldn't be reached");
  return { live, unsure };
}

/* ───────────── YouTube Data API ───────────── */

async function call(deps: VideoDeps, path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${deps.apiUrl.replace(/\/$/, "")}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", deps.key!);
  const res = await (deps.fetch ?? fetch)(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 403 || res.status === 429) {
    const body = await res.text().catch(() => "");
    if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(body) || res.status === 429) throw new YouTubeQuotaError("YouTube quota used up");
    throw new Error(`YouTube refused the request (${res.status})`);
  }
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
  return res.json();
}

/** Look up videos by ID: only public, embeddable, processed ones come back. */
async function details(deps: VideoDeps, ids: string[]): Promise<Map<string, LessonVideo>> {
  const out = new Map<string, LessonVideo>();
  const valid = [...new Set(ids.filter(isVideoId))];
  for (let i = 0; i < valid.length; i += 50) {
    const r = await call(deps, "videos", { part: "snippet,contentDetails,status", id: valid.slice(i, i + 50).join(","), maxResults: "50" });
    for (const v of r.items ?? []) {
      if (!isVideoId(v.id)) continue;
      if (v.status?.privacyStatus !== "public" || v.status?.uploadStatus === "rejected" || v.status?.uploadStatus === "deleted") continue;
      if (v.status?.embeddable === false) continue;
      out.set(v.id, {
        videoId: v.id,
        title: String(v.snippet?.title ?? "").slice(0, 300),
        channel: String(v.snippet?.channelTitle ?? "").slice(0, 200),
        publishedAt: v.snippet?.publishedAt,
        durationSeconds: isoDuration(v.contentDetails?.duration),
        thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url,
      });
    }
  }
  return out;
}

/* ───────────── Both ───────────── */

// The result count is part of the key: searches cached when fewer results were asked for aren't reused.
const hashQuery = (q: string) => createHash("sha256").update(`${SEARCH_RESULTS}:${q.trim().toLowerCase()}`).digest("hex");

/** Search (cached), then confirm each result: videos.list for the API, oEmbed for yt-dlp. */
export async function searchVideos(deps: VideoDeps, query: string, max = SEARCH_RESULTS): Promise<LessonVideo[]> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!q || !deps.source) return [];
  const h = hashQuery(q);
  const [hit] = await deps.db.select().from(youtubeCache).where(eq(youtubeCache.queryHash, h));
  if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_DAYS * 86_400_000) return hit.results.slice(0, max);
  let videos: LessonVideo[];
  if (deps.source === "api") {
    const r = await call(deps, "search", { part: "id", type: "video", q, maxResults: String(SEARCH_RESULTS), safeSearch: "strict", relevanceLanguage: "en", videoEmbeddable: "true" });
    const ids: string[] = (r.items ?? []).map((it: any) => it?.id?.videoId).filter(isVideoId);
    const found = await details(deps, ids);
    videos = ids.map((id) => found.get(id)).filter((v): v is LessonVideo => !!v);
  } else {
    const candidates = await ytDlpSearch(deps, q, SEARCH_RESULTS);
    // Only confirmed videos are offered; one YouTube couldn't be asked about isn't.
    const { live } = await oembedCheck(deps, candidates);
    videos = candidates.map((v) => live.get(v.videoId)).filter((v): v is LessonVideo => !!v);
  }
  videos = videos.map((v) => ({ ...v, query: q }));
  await deps.db
    .insert(youtubeCache)
    .values({ queryHash: h, query: q, results: videos, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: youtubeCache.queryHash, set: { results: videos, fetchedAt: new Date() } });
  return videos.slice(0, max);
}

const noteFor = (e: unknown): VideoNote => (e instanceof YouTubeQuotaError ? "quota" : e instanceof YouTubeBlockedError ? "blocked" : "unavailable");

/**
 * The candidates for a lesson: every confirmed result of up to 3 of its search phrases, in search
 * order, each video once. Picking among them is services/lesson-videos.ts's job. When a search
 * fails, what the earlier ones found is kept, with the note.
 */
export async function videoCandidates(deps: VideoDeps, queries: string[]): Promise<VideoOutcome> {
  if (!deps.source) return { videos: [], note: "not_configured" };
  const out: LessonVideo[] = [];
  try {
    for (const q of queries.slice(0, 3)) {
      for (const v of await searchVideos(deps, q)) if (!out.some((o) => o.videoId === v.videoId)) out.push(v);
    }
    return { videos: out, note: null };
  } catch (e) {
    return { videos: out, note: noteFor(e) };
  }
}

/** Saved videos that are still up (removed, private or blocked ones are dropped). */
export async function recheckVideos(deps: VideoDeps, videos: LessonVideo[]): Promise<VideoOutcome> {
  if (!deps.source) return { videos, note: "not_configured" };
  try {
    if (deps.source === "api") {
      const live = await details(deps, videos.map((v) => v.videoId));
      return { videos: videos.filter((v) => live.has(v.videoId)).map((v) => ({ ...v, ...live.get(v.videoId)!, query: v.query })), note: null };
    }
    // A saved video drops out only when YouTube says it's gone, not when one request failed.
    const { live, unsure } = await oembedCheck(deps, videos.filter((v) => isVideoId(v.videoId)));
    return { videos: videos.filter((v) => live.has(v.videoId) || unsure.has(v.videoId)).map((v) => ({ ...v, ...live.get(v.videoId), query: v.query })), note: null };
  } catch (e) {
    return { videos, note: noteFor(e) };
  }
}

/** Drop cache entries older than the cache period (housekeeping). */
export async function purgeYouTubeCache(db: DB) {
  await db.execute(sql`delete from youtube_cache where fetched_at < now() - make_interval(days => ${CACHE_DAYS * 2})`);
}
