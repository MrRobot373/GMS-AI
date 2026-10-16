/**
 * GEM AI modules (Learning, Calculators, Knowledge): the organization's on/off switches and who
 * may open each module. A module is used when the organization has it on and the person has it
 * among their sections in the workspace (org admins always do). See docs/15-gem-ai.md.
 */
import { organization, type DB, type GemSettingsStored } from "@aatmiq/db";
import { DEFAULT_GEM_SETTINGS, isOrgAdmin, type GemSettings, type Module } from "@aatmiq/shared";
import { requireWorkspaceCap, type AppContext, type SessionUser } from "../context";
import { forbidden, HttpError } from "../errors";
import { msg } from "../i18n";

export async function gemStored(db: DB): Promise<Partial<GemSettingsStored>> {
  const [o] = await db.select({ g: organization.gemSettings }).from(organization).limit(1);
  return o?.g ?? {};
}

export async function getGemSettings(db: DB): Promise<GemSettings> {
  const g = await gemStored(db);
  return {
    modules: { ...DEFAULT_GEM_SETTINGS.modules, ...(g.modules ?? {}) },
    betaCalculators: g.betaCalculators ?? DEFAULT_GEM_SETTINGS.betaCalculators,
    coursesPerDay: g.coursesPerDay ?? DEFAULT_GEM_SETTINGS.coursesPerDay,
    lessonsPerDay: g.lessonsPerDay ?? DEFAULT_GEM_SETTINGS.lessonsPerDay,
  };
}

const NOT_ENABLED: Record<Module, string> = {
  learning: msg("Learning is not enabled for you. Ask your admin."),
  calculators: msg("Calculators are not enabled for you. Ask your admin."),
  knowledge: msg("Knowledge is not enabled for you. Ask your admin."),
};

/** Throws unless the module is on and the person may use it in this workspace. */
export async function requireModule(ctx: AppContext, u: SessionUser, workspaceId: string, module: Module) {
  const settings = await getGemSettings(ctx.db);
  if (!settings.modules[module]) throw new HttpError(403, "This module is turned off for your organization.", "module_off");
  const m = await requireWorkspaceCap(ctx, u, workspaceId, "workspace.use");
  if (m && !m.sections.includes(module) && !isOrgAdmin(u.orgRole)) throw forbidden(NOT_ENABLED[module]);
  return { membership: m, settings };
}

/** The YouTube key: Admin → Settings first, then YOUTUBE_API_KEY. */
export async function youtubeKey(ctx: AppContext): Promise<string | null> {
  const g = await gemStored(ctx.db);
  if (g.youtubeKeyEnc) {
    try {
      return ctx.box.decrypt(g.youtubeKeyEnc);
    } catch {
      return ctx.cfg.youtubeApiKey ?? null;
    }
  }
  return ctx.cfg.youtubeApiKey ?? null;
}
