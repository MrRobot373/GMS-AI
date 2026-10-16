/** Admin → Settings → GEM AI: the module switches, beta calculators, daily limits, YouTube key. */
import { eq, organization } from "@aatmiq/db";
import { gemSettingsSchema } from "@aatmiq/shared";
import type { FastifyInstance } from "fastify";
import { audit, getOrg, parse, requireOrgCap, requireUser, type AppContext } from "../context";
import { gemStored, getGemSettings } from "../services/gem";

export async function gemAdminRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get("/api/admin/gem", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.branding.manage");
    const stored = await gemStored(db);
    return {
      ...(await getGemSettings(db)),
      youtube: stored.youtubeKeyEnc ? "settings" : ctx.cfg.youtubeApiKey ? "environment" : "none",
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
      ...(body.youtubeApiKey !== undefined ? { youtubeKeyEnc: body.youtubeApiKey ? ctx.box.encrypt(body.youtubeApiKey) : null } : {}),
    };
    await db.update(organization).set({ gemSettings: next }).where(eq(organization.id, org.id));
    await audit(ctx, {
      actor: u,
      action: "settings.gem_updated",
      meta: { modules: next.modules, betaCalculators: next.betaCalculators, coursesPerDay: next.coursesPerDay, lessonsPerDay: next.lessonsPerDay, youtubeKeyChanged: body.youtubeApiKey !== undefined },
    });
    return { ok: true };
  });
}
