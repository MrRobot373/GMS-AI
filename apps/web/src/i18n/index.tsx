"use client";

/**
 * Interface languages. The English text is the key: `t("New chat")`, `t("{n} files", { n })`, and
 * `t.n(count, "{n} file", "{n} files")` for plurals. A key missing from a catalog shows in English.
 * Strings defined outside components are marked with `msg("…")` and translated where they're shown.
 * `scripts/check-i18n.mjs` checks every key has its translation (it runs with the web app's tests).
 */
import { createContext, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { UiTextContext } from "@aatmiq/ui/text";
import { HI } from "./hi";

import { LOCALE_COOKIE, type Locale } from "./locales";

export { isLocale, LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "./locales";

const CATALOGS: Record<Locale, Record<string, string>> = { en: {}, hi: HI };
/** BCP 47 tags for dates and numbers (English keeps the browser's own format). */
const TAGS: Record<Locale, string | undefined> = { en: undefined, hi: "hi-IN" };


/** Marks a string for translation where it's defined; translate it with t() where it's shown. */
export const msg = <S extends string>(s: S) => s;

type Primitive = string | number;
export interface Translate {
  (key: string, params?: Record<string, Primitive>): string;
  /** With elements among the values: returns elements. */
  (key: string, params: Record<string, ReactNode>): ReactNode;
  /** A count: the catalog has "one|other" for the key "one|other". */
  n(count: number, one: string, other: string, params?: Record<string, Primitive>): string;
  /** Dates (and dates with times) in this language. */
  date(d: string | number | Date, opts?: Intl.DateTimeFormatOptions): string;
  dateTime(d: string | number | Date, opts?: Intl.DateTimeFormatOptions): string;
  num(n: number, opts?: Intl.NumberFormatOptions): string;
  locale: Locale;
}

function fill(text: string, params?: Record<string, ReactNode>): ReactNode {
  if (!params) return text;
  const parts = text.split(/\{(\w+)\}/g);
  // Odd indexes are parameter names.
  const out = parts.map((p, i) => (i % 2 ? (params[p] ?? `{${p}}`) : p));
  if (out.every((x) => typeof x === "string" || typeof x === "number")) return out.join("");
  return out.map((x, i) => <Fragment key={i}>{x}</Fragment>);
}

export function makeT(locale: Locale): Translate {
  const cat = CATALOGS[locale];
  const rules = new Intl.PluralRules(locale);
  const t = ((key: string, params?: Record<string, ReactNode>) => fill(cat[key] ?? key, params)) as Translate;
  t.n = (count, one, other, params) => {
    const forms = (cat[`${one}|${other}`] ?? `${one}|${other}`).split("|");
    const text = rules.select(count) === "one" ? forms[0]! : (forms[1] ?? forms[0]!);
    return fill(text, { n: count.toLocaleString(TAGS[locale]), ...params }) as string;
  };
  t.date = (d, opts) => new Date(d).toLocaleDateString(TAGS[locale], opts);
  t.dateTime = (d, opts) => new Date(d).toLocaleString(TAGS[locale], opts);
  t.num = (n, opts) => n.toLocaleString(TAGS[locale], opts);
  t.locale = locale;
  return t;
}

const TContext = createContext<Translate>(makeT("en"));
const SetContext = createContext<(l: Locale) => void>(() => {});

/** A fixed language for part of the page. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo(() => makeT(locale), [locale]);
  const ui = useMemo(() => ({ close: t("Close") }), [t]);
  return (
    <TContext.Provider value={t}>
      <UiTextContext.Provider value={ui}>{children}</UiTextContext.Provider>
    </TContext.Provider>
  );
}

/** The page's language: starts with what the server rendered (the cookie), changes with the person's setting. */
export function LocaleRoot({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setState] = useState<Locale>(initial);
  const set = useCallback((l: Locale) => {
    setState(l);
    document.documentElement.lang = l;
    document.cookie = `${LOCALE_COOKIE}=${l}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }, []);
  return (
    <SetContext.Provider value={set}>
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </SetContext.Provider>
  );
}

export const useT = () => useContext(TContext);
export const useSetLocale = () => useContext(SetContext);

/** Whether this browser already has a language (otherwise pages before sign-in use the organization's). */
export const hasLocaleCookie = () => typeof document !== "undefined" && new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=`).test(document.cookie);
