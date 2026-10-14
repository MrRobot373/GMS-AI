/** The languages, without React: the server's root layout reads the cookie with these. */
export type Locale = "en" | "hi";
export const LOCALES: Locale[] = ["en", "hi"];
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", hi: "हिन्दी" };
/** Remembers the language for pages before sign-in, and lets the server render in it. */
export const LOCALE_COOKIE = "aatmiq_lang";
export const isLocale = (v: unknown): v is Locale => v === "en" || v === "hi";
