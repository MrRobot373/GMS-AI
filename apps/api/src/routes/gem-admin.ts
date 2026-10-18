/** Admin → Settings → GEM AI: the module switches, beta calculators, daily limits, lesson videos and their ratings, web search. */
import { eq, organization, sql, videoBlock, type GemSettingsStored } from "@aatmiq/db";
import { gemSettingsSchema, videoBlockSchema, webSearchTestSchema, type WebProvider } from "@aatmiq/shared";
import type { FastifyInstance } from "fastify";
import { audit, getOrg, parse, requireOrgCap, requireUser, type AppContext } from "../context";
import { badRequest } from "../errors";
import { localeOf, msg, tr } from "../i18n";
import { gemStored, getGemSettings, storedWebKeys, videoDeps, webSearchSetup } from "../services/gem";
import { videoFeedbackReport, videoInfo } from "../services/lesson-videos";
import { webSearch, WebSearchError, webSearchReady, type WebSearchDeps } from "../services/web-search";
import { isVideoId, ytDlpStatus } from "../services/youtube";

/** What the Test button searches for: short, harmless, and every provider has results for it. */
const TEST_QUERY = "Ohm's law";

const PROVIDER_NAMES: Record<WebProvider, string> = { searxng: "SearXNG", ollama: "Ollama web search", brave: "Brave Search", tavily: "Tavily", serper: "Serper" };

export async function gemAdminRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get("/api/admin/gem", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.branding.manage");
    const stored = await gemStored(db);
    const [settings, deps, yt, web] = await Promise.all([getGemSettings(db), videoDeps(ctx), ytDlpStatus(ctx.ytDlp), webSearchSetup(ctx)]);
    return {
      ...settings,
      // The choice in use, which WEB_SEARCH_PROVIDER fills in until one is made here.
      webProvider: web.provider ?? "off",
      youtube: stored.youtubeKeyEnc ? "settings" : ctx.cfg.youtubeApiKey ? "environment" : "none",
      // What lessons use now, and whether yt-dlp runs here (like Agent-Reach's doctor).
      videos: { source: deps.source, ytDlp: { version: yt.version, error: yt.error, cookies: !!ctx.cfg.ytDlp?.cookies, proxy: !!ctx.cfg.ytDlp?.proxy } },
      // Never the key itself: only where it comes from.
      web: {
        provider: web.provider,
        providerFrom: web.providerFrom,
        url: web.url,
        urlFrom: web.urlFrom,
        key: web.keyFrom,
        ready: webSearchReady({ provider: web.provider, url: web.url, key: web.key }),
      },
    };
  });

  app.put("/api/admin/gem", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.branding.manage");
    const body = parse(gemSettingsSchema, req.body);
    const org = await getOrg(db);
    if (!org) return { ok: false };
    const prev = await gemStored(db);
    const cur = await getGemSettings(db);
    // A key belongs to one provider (the one chosen in the same save, else the one in use), and each
    // provider keeps its own: saving Tavily's leaves Brave's, and "" removes only this provider's.
    let webKey: Pick<GemSettingsStored, "webKeysEnc" | "webKeyEnc" | "webKeyProvider"> | null = null;
    if (body.webKey !== undefined) {
      const p = body.webProvider ?? (await webSearchSetup(ctx)).provider;
      const paid = p && p !== "off" && p !== "searxng" ? p : null;
      if (body.webKey && !paid) throw badRequest("Choose Ollama, Brave, Tavily or Serper before adding a key.");
      const keys = storedWebKeys(prev);
      if (paid && body.webKey) keys[paid] = ctx.box.encrypt(body.webKey);
      else if (paid) delete keys[paid];
      webKey = { webKeysEnc: keys, webKeyEnc: null, webKeyProvider: null };
    }
    const next = {
      ...prev,
      modules: { ...cur.modules, ...(body.modules ?? {}) },
      betaCalculators: body.betaCalculators ?? cur.betaCalculators,
      coursesPerDay: body.coursesPerDay ?? cur.coursesPerDay,
      lessonsPerDay: body.lessonsPerDay ?? cur.lessonsPerDay,
      videoSource: body.videoSource ?? cur.videoSource,
      ...(body.youtubeApiKey !== undefined ? { youtubeKeyEnc: body.youtubeApiKey ? ctx.box.encrypt(body.youtubeApiKey) : null } : {}),
      // Left unset until chosen here, so WEB_SEARCH_PROVIDER / _URL keep filling in.
      ...(body.webProvider !== undefined ? { webProvider: body.webProvider } : {}),
      ...(body.webUrl !== undefined ? { webUrl: body.webUrl } : {}),
      ...(webKey ?? {}),
      chatWebSearch: body.chatWebSearch ?? cur.chatWebSearch,
      lessonCheck: body.lessonCheck ?? cur.lessonCheck,
    };
    await db.update(organization).set({ gemSettings: next }).where(eq(organization.id, org.id));
    await audit(ctx, {
      actor: u,
      action: "settings.gem_updated",
      meta: {
        modules: next.modules,
        betaCalculators: next.betaCalculators,
        coursesPerDay: next.coursesPerDay,
        lessonsPerDay: next.lessonsPerDay,
        videoSource: next.videoSource,
        youtubeKeyChanged: body.youtubeApiKey !== undefined,
        webProvider: next.webProvider ?? null,
        webUrl: next.webUrl ?? null,
        webKeyChanged: body.webKey !== undefined,
        chatWebSearch: next.chatWebSearch,
        lessonCheck: next.lessonCheck,
      },
    });
    return { ok: true };
  });

  /** One search with what's typed (or what's saved), to see the provider answer before relying on it. */
  app.post("/api/admin/gem/test-web", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.branding.manage");
    const b = parse(webSearchTestSchema, req.body);
    const saved = await webSearchSetup(ctx, b.provider);
    const provider = b.provider ?? saved.provider;
    const deps: WebSearchDeps = {
      provider,
      url: provider === "searxng" ? (b.url ?? saved.url) : null,
      key: provider && provider !== "searxng" ? b.key || saved.key : null,
      fetch: ctx.fetch,
    };
    const locale = localeOf(req);
    const failed = (error: string, kind: string, ms = 0) => ({ ok: false, results: 0, ms, sample: [], error: tr(locale, error), kind });
    // What's missing, said here rather than chat's "an admin can choose a provider".
    if (!webSearchReady(deps)) {
      const name = provider ? PROVIDER_NAMES[provider] : "";
      return failed(!provider ? msg("Choose a provider first.") : provider === "searxng" ? msg("Add your SearXNG server's address first, then test it.") : msg(`Add the API key for ${name} first, then test it.`), "not_configured");
    }
    const started = Date.now();
    try {
      const results = await webSearch(deps, TEST_QUERY, { max: 5, cache: false });
      // An answer with nothing in it isn't working: a SearXNG whose engines are all blocked answers 200 with no results.
      if (!results.length) {
        const empty = provider === "searxng" ? msg("SearXNG answered, but found nothing for a test search: its search engines may be blocked or not responding. Check them in its settings.") : msg("The provider answered, but found nothing for a test search. Try again, or check your plan.");
        return failed(empty, "empty", Date.now() - started);
      }
      return { ok: true, results: results.length, ms: Date.now() - started, sample: results.slice(0, 3).map((r) => ({ title: r.title, url: r.url })), error: null };
    } catch (e) {
      return failed(e instanceof WebSearchError ? e.message : msg("The search provider couldn't be reached."), e instanceof WebSearchError ? e.kind : "unavailable", Date.now() - started);
    }
  });

  /** How people rated lesson videos: totals, the most disliked and most liked, and the blocked list. */
  app.get("/api/admin/gem/videos/feedback", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.branding.manage");
    return videoFeedbackReport(db);
  });

  /**
   * Block a video for the whole organization (or unblock it). A blocked video is never offered to a
   * lesson again; lessons that have it are checked again the next time they're opened, and drop it.
   */
  app.put<{ Params: { videoId: string } }>("/api/admin/gem/videos/:videoId/block", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.branding.manage");
    const videoId = req.params.videoId;
    if (!isVideoId(videoId)) throw badRequest("That isn't a YouTube video ID.");
    const b = parse(videoBlockSchema, req.body);
    const info = (await videoInfo(db, [videoId])).get(videoId);
    if (b.blocked) {
      const reason = b.reason || null;
      await db
        .insert(videoBlock)
        .values({ videoId, blockedBy: u.id, reason, title: info?.title ?? null, channel: info?.channel ?? null })
        .onConflictDoUpdate({ target: videoBlock.videoId, set: { reason } });
      await db.execute(sql`update course_lesson set videos_checked_at = null where videos @> ${JSON.stringify([{ videoId }])}::jsonb`);
    } else {
      await db.delete(videoBlock).where(eq(videoBlock.videoId, videoId));
    }
    await audit(ctx, { actor: u, action: b.blocked ? "video.blocked" : "video.unblocked", targetType: "video", targetId: videoId, meta: { title: info?.title ?? null, reason: b.reason || null } });
    return { ok: true };
  });
}
