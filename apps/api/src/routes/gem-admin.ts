/** Admin → Settings → GEM AI: the module switches, beta calculators, daily limits, lesson videos and their ratings, web search. */
import { eq, organization, sql, videoBlock } from "@aatmiq/db";
import { gemSettingsSchema, videoBlockSchema, webSearchTestSchema } from "@aatmiq/shared";
import type { FastifyInstance } from "fastify";
import { audit, getOrg, parse, requireOrgCap, requireUser, type AppContext } from "../context";
import { badRequest } from "../errors";
import { localeOf, msg, tr } from "../i18n";
import { gemStored, getGemSettings, videoDeps, webSearchSetup } from "../services/gem";
import { videoFeedbackReport, videoInfo } from "../services/lesson-videos";
import { webSearch, WebSearchError, webSearchReady, type WebSearchDeps } from "../services/web-search";
import { isVideoId, ytDlpStatus } from "../services/youtube";

/** What the Test button searches for: short, harmless, and every provider has results for it. */
const TEST_QUERY = "Ohm's law";

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
    // A key belongs to one provider: the one chosen in the same save, else the one in use.
    let webKey: { webKeyEnc: string | null; webKeyProvider: "ollama" | "brave" | "tavily" | "serper" | null } | null = null;
    if (body.webKey !== undefined) {
      const p = body.webProvider ?? (await webSearchSetup(ctx)).provider;
      if (!body.webKey) webKey = { webKeyEnc: null, webKeyProvider: null };
      else if (!p || p === "off" || p === "searxng") throw badRequest("Choose Ollama, Brave, Tavily or Serper before adding a key.");
      else webKey = { webKeyEnc: ctx.box.encrypt(body.webKey), webKeyProvider: p };
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
    const started = Date.now();
    try {
      const results = await webSearch(deps, TEST_QUERY, { max: 5, cache: false });
      return { ok: true, results: results.length, ms: Date.now() - started, sample: results.slice(0, 3).map((r) => ({ title: r.title, url: r.url })), error: null };
    } catch (e) {
      const error = e instanceof WebSearchError ? e.message : msg("The search provider couldn't be reached.");
      return { ok: false, results: 0, ms: Date.now() - started, sample: [], error: tr(localeOf(req), error), kind: e instanceof WebSearchError ? e.kind : "unavailable" };
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
