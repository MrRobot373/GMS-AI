import { makeT, msg, type Translate } from "@/i18n";

export { formatTokens } from "@aatmiq/shared";

const EN = makeT("en");

/** A chat's title: untitled chats are "New chat" on the server, shown in the page's language. */
export const chatTitle = (title: string, t: Translate = EN) => (title === "New chat" ? t("New chat") : title);

/** "just now", "5m ago"… in the page's language (pass useT()'s t). */
export function timeAgo(iso: string | Date, t: Translate = EN): string {
  const at = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 45) return t("just now");
  const m = Math.round(s / 60);
  if (m < 60) return t("{n}m ago", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("{n}h ago", { n: h });
  const d = Math.round(h / 24);
  if (d < 30) return t("{n}d ago", { n: d });
  return t.date(at, { month: "short", day: "numeric", year: "numeric" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function greeting(t: Translate = EN): string {
  const h = new Date().getHours();
  return t(h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
}

/** Auto's tiers, as people read them. */
export const TIER_NAMES = { fast: msg("Fast"), standard: msg("Standard"), advanced: msg("Advanced") } as const;
