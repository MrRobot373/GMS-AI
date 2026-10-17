/** Admin → Settings → GEM AI: the module switches, beta calculators, daily limits, lesson videos. */
import { eq, organization } from "@aatmiq/db";
import { gemSettingsSchema } from "@aatmiq/shared";
import type { FastifyInstance } from "fastify";
import { audit, getOrg, parse, requireOrgCap, requireUser, type AppContext } from "../context";
import { gemStored, getGemSettings, videoDeps } from "../services/gem";
import { ytDlpStatus } from "../services/youtube";

export async function gemAdminRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get("/api/admin/gem", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.branding.manage");
    const stored = await gemStored(db);
    const [settings, deps, yt] = await Promise.all([getGemSettings(db), videoDeps(ctx), ytDlpStatus(ctx.ytDlp)]);
    return {
      ...settings,
      youtube: stored.youtubeKeyEnc ? "settings" : ctx.cfg.youtubeApiKey ? "environment" : "none",
      // What lessons use now, and whether yt-dlp runs here (like Agent-Reach's doctor).
      videos: { source: deps.source, ytDlp: { version: yt.version, error: yt.error, cookies: !!ctx.cfg.ytDlp?.cookies, proxy: !!ctx.cfg.ytDlp?.proxy } },
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
    const next = {
      ...prev,
      modules: { ...cur.modules, ...(body.modules ?? {}) },
      betaCalculators: body.betaCalculators ?? cur.betaCalculators,
      coursesPerDay: body.coursesPerDay ?? cur.coursesPerDay,
      lessonsPerDay: body.lessonsPerDay ?? cur.lessonsPerDay,
      videoSource: body.videoSource ?? cur.videoSource,
      ...(body.youtubeApiKey !== undefined ? { youtubeKeyEnc: body.youtubeApiKey ? ctx.box.encrypt(body.youtubeApiKey) : null } : {}),
    };
    await db.update(organization).set({ gemSettings: next }).where(eq(organization.id, org.id));
    await audit(ctx, {
      actor: u,
      action: "settings.gem_updated",
      meta: { modules: next.modules, betaCalculators: next.betaCalculators, coursesPerDay: next.coursesPerDay, lessonsPerDay: next.lessonsPerDay, videoSource: next.videoSource, youtubeKeyChanged: body.youtubeApiKey !== undefined },
    });
    return { ok: true };
  });
}
