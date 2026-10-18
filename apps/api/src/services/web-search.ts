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
import { lookup, Resolver } from "node:dns/promises";
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
  /** Name lookups for page reads (tests replace it); `signal` is the page's time running out. */
  resolve?: (host: string, signal?: AbortSignal) => Promise<string[]>;
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
/** Per DNS query; two tries per server, all within the page's 8 seconds. */
const DNS_TIMEOUT_MS = 2_000;
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

/*
 * Tags are found by scanning forward, never by a pattern that can run back over the page: a page of
 * a million "<" (or of tags and comments left open) takes no longer than any other page its size.
 * Each search for a ">" or a closing tag is remembered, so none is made twice over the same text.
 */

// Inline tags join their text (V<sub>in</sub> is "Vin"); any other tag separates words.
const INLINE = new Set("a abbr b bdi bdo cite code data dfn em font i kbd mark q s samp small span strong sub sup time u var wbr".split(" "));
const BLOCK = new Set("p div li ul ol dl dt dd h1 h2 h3 h4 h5 h6 tr table section article main blockquote pre figure figcaption header".split(" "));
/** Dropped with what's in them. */
const SKIPPED = new Set("script style noscript template svg nav footer head iframe select".split(" "));
/** Their content is never text: one left open runs to the end of the page. */
const RAW = new Set(["script", "style"]);
/** More than any page read (1.5 MB) holds; a longer text is cut here before it's scanned. */
const HTML_MAX = 2_000_000;

const isNameStart = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isNameChar = (c: number) => isNameStart(c) || (c >= 48 && c <= 57) || c === 45 || c === 58 || c === 95;

/** Where `find(from)` is next found at or after `pos`, searched again only when `pos` has passed it. */
function remembered(find: (from: number) => number) {
  let from = -1;
  let at = -1;
  return (pos: number) => {
    if (from === -1 || pos < from || (at !== -1 && at < pos)) {
      from = pos;
      at = find(pos);
    }
    return at;
  };
}

/** What a tag becomes in the text: a line break, a bullet, a cell separator, a space, or nothing. */
function tagText(name: string, closing: boolean, lines: boolean): string {
  if (INLINE.has(name)) return "";
  if (!lines) return " ";
  if (name === "br" || name === "hr") return "\n";
  if (closing && BLOCK.has(name)) return "\n";
  if (!closing && name === "li") return "\n• ";
  if (closing && (name === "td" || name === "th")) return " | ";
  return " ";
}

/**
 * The text between the tags. `lines`: a page (blocks on their own lines, scripts, styles,
 * navigation and footers dropped); otherwise one line (a title or a snippet). A "<" that starts no
 * tag ("5 < 6") is text; a comment left open hides the rest, as it does in a browser.
 */
function stripTags(html: string, lines: boolean): string {
  const s = html.length > HTML_MAX ? html.slice(0, HTML_MAX) : html;
  const out: string[] = [];
  const nextLt = remembered((p) => s.indexOf("<", p));
  const nextGt = remembered((p) => s.indexOf(">", p));
  const closes = new Map<string, (pos: number) => number>();
  const closeOf = (name: string, pos: number) => {
    let f = closes.get(name);
    if (!f) {
      const re = new RegExp(`</${name}(?=[\\s/>])`, "gi");
      f = remembered((p) => {
        re.lastIndex = p;
        return re.exec(s)?.index ?? -1;
      });
      closes.set(name, f);
    }
    return f(pos);
  };
  let i = 0;
  while (i < s.length) {
    const lt = nextLt(i);
    if (lt < 0) {
      out.push(s.slice(i));
      break;
    }
    if (lt > i) out.push(s.slice(i, lt));
    i = lt + 1;
    if (s.startsWith("<!--", lt)) {
      const end = s.indexOf("-->", lt + 2);
      if (end < 0) break;
      out.push(" ");
      i = end + 3;
      continue;
    }
    const c1 = s.charCodeAt(lt + 1);
    const closing = c1 === 47;
    // <!doctype …>, <?xml …?>, and "</" without a name: dropped up to their ">".
    const other = c1 === 33 || c1 === 63 || (closing && !isNameStart(s.charCodeAt(lt + 2)));
    if (!other && !isNameStart(c1) && !closing) {
      out.push("<");
      continue;
    }
    let e = closing ? lt + 2 : lt + 1;
    if (!other) while (e < s.length && isNameChar(s.charCodeAt(e))) e++;
    const gt = nextGt(other ? lt + 2 : e);
    const lt2 = nextLt(lt + 1);
    if (gt < 0 || (lt2 >= 0 && lt2 < gt)) {
      out.push("<");
      continue;
    }
    i = gt + 1;
    if (other) {
      out.push(" ");
      continue;
    }
    const name = s.slice(closing ? lt + 2 : lt + 1, e).toLowerCase();
    // "<svg/>" holds nothing; "<script/>" is still open, as a browser reads it.
    if (lines && !closing && SKIPPED.has(name) && (RAW.has(name) || s.charCodeAt(gt - 1) !== 47)) {
      const close = closeOf(name, i);
      if (close >= 0) {
        const end = nextGt(close + 2 + name.length);
        if (end < 0) break;
        out.push(" ");
        i = end + 1;
      } else if (RAW.has(name)) break;
      else out.push(" ");
      continue;
    }
    out.push(tagText(name, closing, lines));
  }
  return out.join("");
}

/** One line of plain text: tags dropped, entities decoded, whitespace collapsed. */
const plain = (s: string) => decodeEntities(stripTags(s.slice(0, 20_000), false)).replace(CONTROL, "").replace(/\s+/g, " ").trim();

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
  return tidy(decodeEntities(stripTags(html, true)));
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
    // A provider's page text is cut long before it's tidied: only maxChars of it is kept.
    const content = r.content !== undefined ? clip(tidy(str(r.content).slice(0, Math.max(20_000, maxChars * 10))), maxChars) : "";
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

/** `p`, or the signal's reason as soon as it's aborted (what `p` was doing carries on, unseen). */
function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", stop);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", stop);
        reject(e);
      },
    );
  });
}

/**
 * A name's addresses (IPv4 first) from the DNS servers themselves: each query has its own timeout
 * and is cancelled with the page, and none of them takes one of the few threads that the system
 * resolver (getaddrinfo) shares with every other lookup in the process. Only when no DNS server
 * can be reached at all does the system resolver answer, bounded by the page's time.
 */
async function defaultResolve(host: string, signal?: AbortSignal): Promise<string[]> {
  const r = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
  const cancel = () => r.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const [v4, v6] = await Promise.allSettled([r.resolve4(host), r.resolve6(host)]);
    const addrs = [...(v4.status === "fulfilled" ? v4.value : []), ...(v6.status === "fulfilled" ? v6.value : [])];
    if (addrs.length) return addrs;
    const why = v4.status === "rejected" ? (v4.reason as NodeJS.ErrnoException) : null;
    if (why?.code === "ECONNREFUSED") return (await abortable(lookup(host, { all: true, verbatim: true }), signal)).map((a) => a.address);
    throw why ?? new Error(`${host} has no addresses`);
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/** The public address to connect to for this host, or PageRefused; the lookup ends with `signal`. */
async function publicAddress(deps: WebSearchDeps, hostname: string, signal?: AbortSignal): Promise<string> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new PageRefused(`${host} is a private address`);
    return host;
  }
  // Names that only mean something inside a network (and single labels like "intranet").
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) throw new PageRefused(`${host} is an internal name`);
  let addrs: string[];
  try {
    addrs = await abortable((deps.resolve ?? defaultResolve)(host, signal), signal);
  } catch (e) {
    if (signal?.aborted) throw signal.reason;
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

/**
 * One page's text, following at most 3 redirects, each to a public address. The 8 seconds cover
 * everything: the name lookups, every hop and the download.
 */
export async function readPage(deps: WebSearchDeps, href: string, maxChars = CONTENT_MAX, timeoutMs = PAGE_TIMEOUT_MS): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = safeUrl(href);
  for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
    signal.throwIfAborted();
    const address = await publicAddress(deps, url.hostname, signal);
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
