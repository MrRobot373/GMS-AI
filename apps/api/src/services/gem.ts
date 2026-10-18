/**
 * GEM AI modules (Learning, Calculators, Knowledge): the organization's on/off switches and who
 * may open each module. A module is used when the organization has it on and the person has it
 * among their sections in the workspace (org admins always do). See docs/15-gem-ai.md.
 */
import { organization, type DB, type GemSettingsStored } from "@aatmiq/db";
import { DEFAULT_GEM_SETTINGS, isOrgAdmin, type GemSettings, type Module, type WebProvider } from "@aatmiq/shared";
import { requireWorkspaceCap, type AppContext, type SessionUser } from "../context";
import { forbidden, HttpError } from "../errors";
import { msg } from "../i18n";
import type { WebSearchDeps } from "./web-search";
import { resolveVideoSource, ytDlpStatus, type VideoDeps } from "./youtube";

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
    videoSource: g.videoSource ?? DEFAULT_GEM_SETTINGS.videoSource,
    webProvider: g.webProvider ?? DEFAULT_GEM_SETTINGS.webProvider,
    webUrl: g.webUrl ?? DEFAULT_GEM_SETTINGS.webUrl,
    chatWebSearch: g.chatWebSearch ?? DEFAULT_GEM_SETTINGS.chatWebSearch,
    lessonCheck: g.lessonCheck ?? DEFAULT_GEM_SETTINGS.lessonCheck,
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

/** How lesson videos are found on this server: the admin's choice, the key, and whether yt-dlp runs. */
export async function videoDeps(ctx: AppContext): Promise<VideoDeps> {
  const [settings, key, yt] = await Promise.all([getGemSettings(ctx.db), youtubeKey(ctx), ytDlpStatus(ctx.ytDlp)]);
  return {
    db: ctx.db,
    source: resolveVideoSource(settings.videoSource, !!key, !!yt.version),
    key,
    apiUrl: ctx.cfg.youtubeApiUrl ?? "https://www.googleapis.com/youtube/v3",
    fetch: ctx.fetch,
    ytDlp: { run: ctx.ytDlp, cookies: ctx.cfg.ytDlp?.cookies ?? null, proxy: ctx.cfg.ytDlp?.proxy ?? null },
  };
}

/** Where each part of the web search setup comes from: Admin → Settings, the environment, or Work AI. */
export interface WebSearchSetup {
  /** The provider in use; null when web search is off. */
  provider: WebProvider | null;
  /** Where the saved choice comes from ("settings" also when the admin chose Off). */
  providerFrom: "settings" | "environment" | "none";
  /** The SearXNG server (whichever provider is chosen, so the admin page can show it). */
  url: string | null;
  urlFrom: "settings" | "environment" | "work" | "none";
  /** The key for `provider` (each provider keeps its own); one saved for another provider is never used. */
  key: string | null;
  keyFrom: "settings" | "environment" | "none";
}

/** Each paid provider's stored key (encrypted), including one saved before keys were kept per provider. */
export function storedWebKeys(g: Partial<GemSettingsStored>): NonNullable<GemSettingsStored["webKeysEnc"]> {
  return { ...(g.webKeyEnc && g.webKeyProvider ? { [g.webKeyProvider]: g.webKeyEnc } : {}), ...(g.webKeysEnc ?? {}) };
}

/**
 * The web search setup, each part from Admin → Settings when it's set there (an explicit "Off"
 * included), else WEB_SEARCH_PROVIDER / _URL / _KEY; the SearXNG server last falls back to Work
 * AI's. `provider` asks about another provider than the chosen one (the admin's Test button).
 */
export async function webSearchSetup(ctx: AppContext, provider?: WebProvider): Promise<WebSearchSetup> {
  const [o] = await ctx.db.select({ g: organization.gemSettings, w: organization.workSettings }).from(organization).limit(1);
  const g: Partial<GemSettingsStored> = o?.g ?? {};
  const env = ctx.cfg.webSearch ?? { provider: null, url: null, key: null };
  const chosen = provider ?? (g.webProvider !== undefined ? g.webProvider : env.provider) ?? "off";
  const p = chosen === "off" ? null : chosen;
  const providerFrom = g.webProvider !== undefined ? "settings" : env.provider ? "environment" : "none";
  const work = o?.w?.searxngUrl ?? null;
  const [url, urlFrom] = g.webUrl ? [g.webUrl, "settings" as const] : env.url ? [env.url, "environment" as const] : work ? [work, "work" as const] : [null, "none" as const];
  let key: string | null = null;
  let keyFrom: WebSearchSetup["keyFrom"] = "none";
  if (p && p !== "searxng") {
    const enc = storedWebKeys(g)[p];
    if (enc) {
      try {
        key = ctx.box.decrypt(enc);
        keyFrom = "settings";
      } catch {
        // Encrypted with another APP_SECRET: the environment's key, if there is one, still works.
      }
    }
    if (!key && env.key && env.provider === p) {
      key = env.key;
      keyFrom = "environment";
    }
  }
  return { provider: p, providerFrom, url, urlFrom, key, keyFrom };
}

/** What chat and lessons search with (webSearch() says "not_configured" when it's off or incomplete). */
export async function webSearchDeps(ctx: AppContext): Promise<WebSearchDeps> {
  const s = await webSearchSetup(ctx);
  return { provider: s.provider, url: s.provider === "searxng" ? s.url : null, key: s.key, fetch: ctx.fetch, resolve: ctx.resolve };
}
