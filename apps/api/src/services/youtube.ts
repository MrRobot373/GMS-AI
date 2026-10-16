/**
 * Videos for lessons from the YouTube Data API v3. Every link is built from a video ID the API
 * returned; nothing a model wrote becomes a URL. Searches are cached for a week (a search costs
 * 100 quota units), and saved videos are re-checked so removed or private ones drop out.
 */
import { eq, sql, youtubeCache, type DB, type LessonVideo } from "@aatmiq/db";
import { createHash } from "node:crypto";

const CACHE_DAYS = 7;

export type VideoOutcome = { videos: LessonVideo[]; note: null } | { videos: LessonVideo[]; note: "not_configured" | "quota" | "unavailable" };

export class YouTubeQuotaError extends Error {}

interface Deps {
  db: DB;
  key: string | null;
  apiUrl: string;
  fetch?: typeof fetch;
}

/** ISO 8601 duration (PT1H2M3S) in seconds. */
export function isoDuration(d: string | undefined): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d ?? "");
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

/** A video ID as YouTube issues them (11 characters of [A-Za-z0-9_-]). */
export const isVideoId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);

async function call(deps: Deps, path: string, params: Record<string, string>): Promise<any> {
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
async function details(deps: Deps, ids: string[]): Promise<Map<string, LessonVideo>> {
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

const hashQuery = (q: string) => createHash("sha256").update(q.trim().toLowerCase()).digest("hex");

/** Search (cached), then confirm each result through videos.list. */
export async function searchVideos(deps: Deps, query: string, max = 3): Promise<LessonVideo[]> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!q) return [];
  const h = hashQuery(q);
  const [hit] = await deps.db.select().from(youtubeCache).where(eq(youtubeCache.queryHash, h));
  if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_DAYS * 86_400_000) return hit.results.slice(0, max);
  const r = await call(deps, "search", { part: "id", type: "video", q, maxResults: String(Math.min(10, max + 2)), safeSearch: "strict", relevanceLanguage: "en", videoEmbeddable: "true" });
  const ids: string[] = (r.items ?? []).map((it: any) => it?.id?.videoId).filter(isVideoId);
  const found = await details(deps, ids);
  const videos = ids.map((id) => found.get(id)).filter((v): v is LessonVideo => !!v).map((v) => ({ ...v, query: q }));
  await deps.db
    .insert(youtubeCache)
    .values({ queryHash: h, query: q, results: videos, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: youtubeCache.queryHash, set: { results: videos, fetchedAt: new Date() } });
  return videos.slice(0, max);
}

/** Videos for a lesson from its search phrases, at most `max`, no duplicates. */
export async function videosFor(deps: Deps, queries: string[], max = 4): Promise<VideoOutcome> {
  if (!deps.key) return { videos: [], note: "not_configured" };
  const out: LessonVideo[] = [];
  try {
    for (const q of queries.slice(0, 3)) {
      for (const v of await searchVideos(deps, q, 3)) if (!out.some((o) => o.videoId === v.videoId)) out.push(v);
      if (out.length >= max) break;
    }
    return { videos: out.slice(0, max), note: null };
  } catch (e) {
    return { videos: out, note: e instanceof YouTubeQuotaError ? "quota" : "unavailable" };
  }
}

/** Saved videos that are still up (removed, private or blocked ones are dropped). */
export async function recheckVideos(deps: Deps, videos: LessonVideo[]): Promise<VideoOutcome> {
  if (!deps.key) return { videos, note: "not_configured" };
  try {
    const live = await details(deps, videos.map((v) => v.videoId));
    return { videos: videos.filter((v) => live.has(v.videoId)).map((v) => ({ ...v, ...live.get(v.videoId)!, query: v.query })), note: null };
  } catch (e) {
    return { videos, note: e instanceof YouTubeQuotaError ? "quota" : "unavailable" };
  }
}

/** Drop cache entries older than the cache period (housekeeping). */
export async function purgeYouTubeCache(db: DB) {
  await db.execute(sql`delete from youtube_cache where fetched_at < now() - make_interval(days => ${CACHE_DAYS * 2})`);
}

