/**
 * The server's texts in the person's language: error messages, notifications, emails, health checks.
 * They're written in English where they're made (often deep in a service that doesn't know who's
 * asking) and translated on the way out: an error when it's answered, a notification when it's
 * read, an email for its recipient. The catalog's keys are the English texts with `{name}` slots
 * where the code fills in a value; a finished message is matched against them, and the values
 * (a name, a count, another message) go into the translation, translated themselves when they're
 * texts of ours.
 *
 * `src/i18n.test.ts` collects every text the server sends and checks it has its Hindi
 * (docs/14-languages.md).
 */
import type { FastifyRequest } from "fastify";
import { HI } from "./hi";

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** The cookie the web app keeps the interface language in (apps/web/src/i18n/locales.ts). */
export const LOCALE_COOKIE = "aatmiq_lang";

/** Marks a text the server sends, for the catalog check; it's translated where it's sent. */
export const msg = <S extends string>(s: S) => s;

interface Pattern {
  re: RegExp;
  names: string[];
  out: string;
}

const CATALOGS: Record<Locale, { exact: Map<string, string>; patterns: Pattern[] }> = {
  en: { exact: new Map(), patterns: [] },
  hi: compile(HI),
};

function compile(cat: Record<string, string>) {
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [key, out] of Object.entries(cat)) {
    if (!/\{\w+\}/.test(key)) {
      exact.set(key, out);
      continue;
    }
    const names: string[] = [];
    const source = key
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        names.push(m[1]!);
        return "([\\s\\S]+?)";
      })
      .join("");
    patterns.push({ re: new RegExp(`^${source}$`), names, out });
  }
  // The most specific first: the longest fixed text wins when two keys match.
  const fixed = (p: Pattern) => p.re.source.replace(/\(\[\\s\\S\]\+\?\)/g, "").length;
  patterns.sort((a, b) => fixed(b) - fixed(a));
  return { exact, patterns };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];

/** An English text from the server, in this language (as it is when there's no translation). */
export function tr(locale: Locale | null | undefined, text: string, depth = 0): string {
  if (!locale || locale === "en" || !text) return text;
  const cat = CATALOGS[locale];
  const hit = cat.exact.get(text);
  if (hit !== undefined) return hit;
  if (depth > 3) return text;
  // Lines (a notification's body) and lists ("Models, Disk"): each on its own.
  if (text.includes("\n")) return text.split("\n").map((l) => tr(locale, l, depth + 1)).join("\n");
  for (const p of cat.patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const values = new Map(p.names.map((n, i) => [n, tr(locale, m[i + 1]!, depth + 1)]));
    return p.out.replace(/\{(\w+)\}/g, (all, n: string) => values.get(n) ?? all);
  }
  const items = text.split(", ");
  if (items.length > 1 && items.every((i) => cat.exact.has(i))) return items.map((i) => cat.exact.get(i)!).join(", ");
  // A date in a message ("16 October 2026").
  const date = /^(\d{1,2}) (\w+) (\d{4})$/.exec(text);
  if (date && locale === "hi" && MONTHS.includes(date[2]!)) return `${date[1]} ${MONTHS_HI[MONTHS.indexOf(date[2]!)]} ${date[3]}`;
  // Several sentences: each on its own (a message followed by a hint).
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  if (parts.length > 1) {
    const done = parts.map((s) => tr(locale, s, depth + 1));
    if (done.some((s, i) => s !== parts[i])) return done.join(" ");
  }
  return text;
}

/** Fills a key's `{slots}` in English (for texts translated later with tr()). */
export function fill(key: string, params: Record<string, string | number>) {
  return key.replace(/\{(\w+)\}/g, (all, n: string) => (n in params ? String(params[n]) : all));
}

/** The language of the person making a request: the web app's cookie, else English. */
export function localeOf(req: FastifyRequest): Locale {
  const v = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([a-z]+)`).exec(req.headers.cookie ?? "")?.[1];
  return isLocale(v) ? v : "en";
}
