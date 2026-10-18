/**
 * Web search for chat and lessons, through the provider an admin chose: the organization's own
 * SearXNG (searches stay on its server), or a paid service with its key (Ollama web search, Brave,
 * Tavily, Serper). Links come only from what a provider returned, never from what a model wrote.
 *
 * Pages are read only at public addresses: every address a name resolves to is checked, the
 * connection goes to the address that was checked (no DNS-rebinding gap), and each redirect is
 * checked again. See docs/15-gem-ai.md.
 */
import type { WebProvider } from "@aatmiq/shared";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { msg } from "../i18n";
import { isPrivateAddress } from "./egress";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  /** The page's text: from the provider (Ollama, Tavily) or read by readPages. */
  content?: string;
}

export interface WebSearchDeps {
  provider: WebProvider | null;
  /** The SearXNG server (the paid providers have fixed addresses). */
  url: string | null;
  key: string | null;
  /** Outgoing HTTP (tests pass a fake one, which page reads then use too). */
  fetch?: typeof fetch;
  /** Name lookups for page reads (tests replace it). */
  resolve?: (host: string) => Promise<string[]>;
}

export type WebSearchErrorKind = "not_configured" | "auth" | "quota" | "unavailable";

/** A search that didn't happen, with a message for people. Never holds the key. */
export class WebSearchError extends Error {
  constructor(
    readonly kind: WebSearchErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "WebSearchError";
  }
}

const SEARCH_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 8_000;
const PAGE_MAX_BYTES = 1.5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const QUERY_MAX = 300;
const TITLE_MAX = 300;
const SNIPPET_MAX = 600;
const CONTENT_MAX = 3000;
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 200;

/** True when the provider has what it needs: a server for SearXNG, a key for the others. */
export const webSearchReady = (deps: Pick<WebSearchDeps, "provider" | "url" | "key">) =>
  !!deps.provider && (deps.provider === "searxng" ? !!deps.url : !!deps.key);

/* ───────────── Text ───────────── */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", shy: "", zwj: "", zwnj: "",
  ndash: "–", mdash: "—", minus: "−", hellip: "…", bull: "•", middot: "·", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", prime: "′", Prime: "″", deg: "°", plusmn: "±", times: "×", divide: "÷", sdot: "⋅", micro: "µ",
  permil: "‰", sup1: "¹", sup2: "²", sup3: "³", frac12: "½", frac14: "¼", frac34: "¾", copy: "©", reg: "®", trade: "™",
  euro: "€", pound: "£", cent: "¢", yen: "¥", sect: "§", para: "¶", larr: "←", rarr: "→", harr: "↔", uarr: "↑", darr: "↓",
  rArr: "⇒", hArr: "⇔", le: "≤", ge: "≥", ne: "≠", asymp: "≈", equiv: "≡", infin: "∞", radic: "√", part: "∂", nabla: "∇",
  int: "∫", sum: "∑", prod: "∏", ang: "∠", perp: "⊥", prop: "∝", isin: "∈", forall: "∀", exist: "∃", empty: "∅",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω", ohm: "Ω",
};

/** Named (the common ones) and numeric character references. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,8});/gi, (all, ref: string) => {
    if (ref[0] !== "#") return ENTITIES[ref] ?? all;
    const n = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "";
    return n === 0xa0 ? " " : String.fromCodePoint(n);
  });
}

// Control characters can't go into Postgres text or jsonb and only get in the way of a model.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// Inline tags join their text (V<sub>in</sub> is "Vin"); any other tag separates words.
const INLINE_TAG = /<\/?(a|abbr|b|bdi|bdo|cite|code|data|dfn|em|font|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)\b[^>]*>/gi;

/** One line of plain text: tags dropped, entities decoded, whitespace collapsed. */
const plain = (s: string) => decodeEntities(s.replace(INLINE_TAG, "").replace(/<[^>]*>/g, " ")).replace(CONTROL, "").replace(/\s+/g, " ").trim();

/** Whitespace collapsed, paragraph breaks kept. */
const tidy = (s: string) =>
  s
    .replace(CONTROL, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A page's readable text: scripts, styles, navigation and footers dropped; blocks become lines. */
export function htmlToText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|nav|footer|head|iframe|select)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol|dl|dt|dd|h[1-6]|tr|table|section|article|main|blockquote|pre|figure|figcaption|header)\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/t[dh]\s*>/gi, " | ")
    .replace(INLINE_TAG, "")
    .replace(/<[^>]*>/g, " ");
  return tidy(decodeEntities(body));
}

/* ───────────── Search ───────────── */

interface Raw {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
  content?: unknown;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** An http(s) link a provider returned, without credentials; null for anything else. */
function safeUrl(v: unknown): URL | null {
  if (typeof v !== "string" || v.length > 2048) return null;
  try {
    const u = new URL(v);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password || !u.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

/** Only http(s) links, each once, with titles, snippets and page text trimmed. */
function clean(raw: Raw[], max: number, maxChars: number): WebResult[] {
  const out: WebResult[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const u = safeUrl(r.url);
    if (!u) continue;
    u.hash = "";
    const href = u.href;
    const key = href.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const content = r.content !== undefined ? clip(tidy(str(r.content)), maxChars) : "";
    out.push({
      title: clip(plain(str(r.title)) || u.hostname, TITLE_MAX),
      url: href,
      snippet: clip(plain(str(r.snippet)) || plain(content), SNIPPET_MAX),
      ...(content ? { content } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** One request to the provider; the status says what went wrong, never the key or the body. */
async function call(deps: WebSearchDeps, url: string | URL, init: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  } catch (e) {
    const late = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new WebSearchError("unavailable", late ? msg("The search provider didn't answer in time.") : msg("The search provider couldn't be reached."));
  }
  if (!res.ok) await res.body?.cancel().catch(() => undefined);
  if (res.status === 401 || res.status === 403) {
    // SearXNG answers 403 when JSON results aren't switched on in its settings.
    throw new WebSearchError("auth", deps.provider === "searxng" ? msg("SearXNG refused JSON results. Add json to search.formats in its settings.yml.") : msg("The search provider refused the key."));
  }
  if (res.status === 402 || res.status === 429) throw new WebSearchError("quota", msg("The search provider's limit is used up. Try again later, or check the plan."));
  if (!res.ok) throw new WebSearchError("unavailable", msg(`The search provider answered ${res.status}.`));
  try {
    return await res.json();
  } catch {
    throw new WebSearchError("unavailable", msg("The search provider's answer couldn't be read."));
  }
}

const json = (body: unknown, headers: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json", ...headers },
  body: JSON.stringify(body),
});

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

/** Each provider's request, and its results in one shape. */
const PROVIDERS: Record<WebProvider, (deps: WebSearchDeps, q: string, max: number) => Promise<Raw[]>> = {
  async searxng(deps, q) {
    const u = new URL("search", deps.url!.replace(/\/?$/, "/"));
    u.searchParams.set("q", q);
    u.searchParams.set("format", "json");
    u.searchParams.set("safesearch", "1");
    u.searchParams.set("language", "en");
    const r = await call(deps, u, { headers: { accept: "application/json" } });
    return arr(r?.results).map((x) => ({ title: x.title, url: x.url, snippet: x.content }));
  },
  async ollama(deps, q, max) {
    const r = await call(deps, "https://ollama.com/api/web_search", json({ query: q, max_results: Math.min(max, 10) }, { authorization: `Bearer ${deps.key}` }));
    // Ollama returns the page's text, so it isn't read again.
    return arr(r?.results).map((x) => ({ title: x.title, url: x.url, content: str(x.content) }));
  },
  async brave(deps, q, max) {
    const u = new URL("https://api.search.brave.com/res/v1/web/search");
    u.searchParams.set("q", q);
    u.searchParams.set("count", String(Math.min(max, 20)));
    const r = await call(deps, u, { headers: { accept: "application/json", "x-subscription-token": deps.key! } });
    return arr(r?.web?.results).map((x) => ({ title: x.title, url: x.url, snippet: x.description }));
  },
  async tavily(deps, q, max) {
    const r = await call(deps, "https://api.tavily.com/search", json({ query: q, max_results: Math.min(max, 20), search_depth: "basic" }, { authorization: `Bearer ${deps.key}` }));
    return arr(r?.results).map((x) => ({ title: x.title, url: x.url, content: str(x.content) }));
  },
  async serper(deps, q, max) {
    const r = await call(deps, "https://google.serper.dev/search", json({ q, num: Math.min(max, 20) }, { "x-api-key": deps.key! }));
    return arr(r?.organic).map((x) => ({ title: x.title, url: x.link, snippet: x.snippet }));
  },
};

const cache = new Map<string, { at: number; results: WebResult[] }>();

/** Forget cached searches (tests; an admin changing the provider doesn't need it: the key differs). */
export function clearWebSearchCache() {
  cache.clear();
}

/**
 * Search the web with the provider in `deps`. Results are cached for 10 minutes per provider and
 * query; `cache: false` (the admin's Test button) always asks the provider.
 */
export async function webSearch(deps: WebSearchDeps, query: string, opts: { max?: number; maxChars?: number; cache?: boolean } = {}): Promise<WebResult[]> {
  const q = query.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, QUERY_MAX).trim();
  if (!webSearchReady(deps)) throw new WebSearchError("not_configured", msg("Web search isn't set up. An admin can choose a provider in Admin → Settings → GEM AI."));
  if (!q) return [];
  const max = Math.max(1, Math.min(20, Math.round(opts.max ?? 8)));
  const maxChars = Math.max(200, opts.maxChars ?? CONTENT_MAX);
  const key = [deps.provider, deps.url ?? "", max, maxChars, q.toLowerCase()].join("\n");
  const hit = opts.cache === false ? undefined : cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results.map((r) => ({ ...r }));
  const results = clean(await PROVIDERS[deps.provider!](deps, q, max), max, maxChars);
  cache.delete(key);
  cache.set(key, { at: Date.now(), results });
  // Oldest first in a Map: drop from the front.
  for (const k of cache.keys()) {
    if (cache.size <= CACHE_MAX) break;
    cache.delete(k);
  }
  return results.map((r) => ({ ...r }));
}

/* ───────────── Reading pages ───────────── */

/** A page that may not be read (a private address, a type we don't read). */
export class PageRefused extends Error {}

const defaultResolve = async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** The public address to connect to for this host, or PageRefused. */
async function publicAddress(deps: WebSearchDeps, hostname: string): Promise<string> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new PageRefused(`${host} is a private address`);
    return host;
  }
  // Names that only mean something inside a network (and single labels like "intranet").
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) throw new PageRefused(`${host} is an internal name`);
  let addrs: string[];
  try {
    addrs = await (deps.resolve ?? defaultResolve)(host);
  } catch {
    throw new PageRefused(`${host} couldn't be found`);
  }
  // Every answer must be public: one private record is enough to refuse.
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new PageRefused(`${host} points to a private address`);
  return addrs[0]!;
}

interface Page {
  status: number;
  location: string | null;
  type: string;
  body: Buffer;
}

const PAGE_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; AatmiqReader/1.0)",
  accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
  "accept-language": "en",
};

/** Up to `cap` bytes of a stream, then it's closed. */
function collect(stream: NodeJS.ReadableStream & { destroy(): void }, cap: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let n = 0;
    const done = () => resolve(Buffer.concat(parts).subarray(0, cap));
    stream.on("data", (c: Buffer) => {
      parts.push(c);
      n += c.length;
      if (n >= cap) {
        stream.removeAllListeners("data");
        stream.destroy();
        done();
      }
    });
    stream.on("end", done);
    stream.on("error", (e) => (n >= cap ? done() : reject(e)));
  });
}

/**
 * GET with the connection made to `address`, the one that was checked (TLS still checks the name).
 * Exported for tests.
 */
export function pinnedGet(url: URL, address: string, signal: AbortSignal): Promise<Page> {
  const family = isIP(address);
  const pinned: LookupFunction = (_host, opts, cb) => ((opts as { all?: boolean }).all ? cb(null, [{ address, family }]) : cb(null, address, family));
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      { method: "GET", headers: { ...PAGE_HEADERS, "accept-encoding": "gzip, deflate, br" }, lookup: pinned, agent: false, signal },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const type = String(res.headers["content-type"] ?? "");
        if (status !== 200) {
          res.resume();
          return resolve({ status, location, type, body: Buffer.alloc(0) });
        }
        // The cap counts what comes out of decompression, so a small gzip bomb can't fill memory.
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const unzip = enc === "gzip" || enc === "x-gzip" ? createGunzip() : enc === "deflate" ? createInflate() : enc === "br" ? createBrotliDecompress() : null;
        const stream = unzip ? res.pipe(unzip) : res;
        if (unzip) res.on("error", (e) => unzip.destroy(e));
        collect(stream, PAGE_MAX_BYTES).then((body) => {
          res.destroy();
          resolve({ status, location, type, body });
        }, reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** GET through the given fetch (tests): the address was checked the same way. */
async function fetchGet(f: typeof fetch, url: URL, signal: AbortSignal): Promise<Page> {
  const res = await f(url.href, { redirect: "manual", signal, headers: PAGE_HEADERS });
  const page = { status: res.status, location: res.headers.get("location"), type: res.headers.get("content-type") ?? "" };
  if (res.status !== 200 || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    return { ...page, body: Buffer.alloc(0) };
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  while (n < PAGE_MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return { ...page, body: Buffer.concat(parts).subarray(0, PAGE_MAX_BYTES) };
}

function decode(body: Buffer, type: string, html: boolean): string {
  const head = html ? body.subarray(0, 2048).toString("latin1") : "";
  const label = /charset\s*=\s*["']?([\w.:-]+)/i.exec(type)?.[1] ?? /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(label).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

/** One page's text, following at most 3 redirects, each to a public address. */
export async function readPage(deps: WebSearchDeps, href: string, maxChars = CONTENT_MAX): Promise<string> {
  const signal = AbortSignal.timeout(PAGE_TIMEOUT_MS);
  let url = safeUrl(href);
  for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
    const address = await publicAddress(deps, url.hostname);
    const page = deps.fetch ? await fetchGet(deps.fetch, url, signal) : await pinnedGet(url, address, signal);
    if (page.status >= 300 && page.status < 400 && page.location) {
      let next: URL | null = null;
      try {
        next = safeUrl(new URL(page.location, url).href);
      } catch {
        next = null;
      }
      if (!next) throw new PageRefused("redirect to a link that isn't http(s)");
      url = next;
      continue;
    }
    if (page.status !== 200) throw new Error(`the page answered ${page.status}`);
    const type = page.type.toLowerCase();
    const html = /^(text\/html|application\/xhtml\+xml)/.test(type);
    if (!html && !/^text\/plain/.test(type)) throw new PageRefused(`${type || "no content type"} isn't read`);
    const text = html ? htmlToText(decode(page.body, page.type, true)) : tidy(decode(page.body, page.type, false));
    return clip(text, maxChars);
  }
  throw new PageRefused(url ? "too many redirects" : "not an http(s) link");
}

/**
 * Fill `content` for results that have none, by reading the page: http(s) only, public addresses
 * only. Up to `max` pages are read at once; one that fails keeps its snippet and no content. Text a
 * provider already returned (Ollama, Tavily) isn't fetched again, only trimmed to `maxChars`.
 */
export async function readPages(deps: WebSearchDeps, results: WebResult[], opts: { max?: number; maxChars?: number } = {}): Promise<WebResult[]> {
  const maxChars = Math.max(200, opts.maxChars ?? CONTENT_MAX);
  const todo = results.filter((r) => !r.content).slice(0, Math.max(0, opts.max ?? 4));
  const read = new Map<WebResult, string>();
  await Promise.all(
    todo.map(async (r) => {
      try {
        const text = await readPage(deps, r.url, maxChars);
        if (text) read.set(r, text);
      } catch {
        // Skipped: private, too slow, not text, or gone. The snippet still says something.
      }
    }),
  );
  return results.map((r) => (r.content ? { ...r, content: clip(r.content, maxChars) } : read.has(r) ? { ...r, content: read.get(r)! } : { ...r }));
}
