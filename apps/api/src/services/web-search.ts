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
import { connect as netConnect, isIP, type LookupFunction, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { msg } from "../i18n";
import { hostAllowed, isPrivateAddress } from "./egress";
import { pdfRead } from "./extract";

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
  /**
   * Internal hosts an admin allows (Work AI's *Internal sites it may open*, as the egress proxy
   * reads them): read although they're private, connecting directly.
   */
  allowedHosts?: string[];
  /** A corporate proxy (http://host:port, HTTPS_PROXY) public pages are read through; unset: directly. */
  proxy?: string | null;
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
 * Each search for a ">" or a tag is remembered, so none is made twice over the same text.
 */

// Inline tags join their text (V<sub>in</sub> is "Vin"); any other tag separates words.
const INLINE = new Set("a abbr b bdi bdo cite code data dfn em font i kbd mark q s samp small span strong sub sup time u var wbr".split(" "));
const BLOCK = new Set("p div li ul ol dl dt dd h1 h2 h3 h4 h5 h6 tr table section article main blockquote pre figure figcaption header".split(" "));
/** Dropped with what's in them. */
const SKIPPED = new Set("script style noscript template svg nav footer head iframe select aside".split(" "));
/** Their content is never text: one left open runs to the end of the page. */
const RAW = new Set(["script", "style"]);
/**
 * Elements not read wherever they are, by their attributes: navigation that isn't a <nav>, and
 * language pickers (Wikipedia's 100-odd other-language links sit inside its <main>).
 */
const NOT_READ = /\brole\s*=\s*["']?navigation\b|\bclass\s*=\s*["'][^"']*\binterlanguage-link\b|\baria-label\s*=\s*["'](?:[\w ]*\s)?(?:languages?|this article in other languages)["']/i;
/** Elements that never have content (no closing tag to look for). */
const VOID = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
/** Where a page's main text may be (see mainRegion). */
const CONTAINERS = new Set("body main article section div td".split(" "));
/** More than any page read holds; a longer text is cut here before it's scanned. */
const HTML_MAX = 2_000_000;
/** How deep containers are followed when looking for the main text (real pages nest a few dozen). */
const MAX_DEPTH = 256;
/** How many elements nested in a skipped one (a menu in a menu) are counted to find its end. */
const MAX_NESTED = 32;

const isNameStart = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isNameChar = (c: number) => isNameStart(c) || (c >= 48 && c <= 57) || c === 45 || c === 58 || c === 95;

/**
 * Where `find(from)` is next found at or after `pos`. What a search learned (nothing between where
 * it started and what it found) is kept, so it's searched again only for a `pos` outside that.
 */
function remembered(find: (from: number) => number) {
  let from = -1;
  let at = -1;
  return (pos: number) => {
    if (from !== -1 && pos >= from && (at === -1 || pos <= at)) return at;
    const found = find(pos);
    // Started earlier and found the same: nothing in between either.
    if (!(found === at && from !== -1 && pos < from)) at = found;
    from = pos;
    return at;
  };
}

interface Tag {
  name: string;
  closing: boolean;
  /** Where the tag starts ("<") and ends (after ">"). */
  start: number;
  end: number;
  /** Its attributes' text. */
  attrs: string;
  selfClosing: boolean;
}

/** A forward-only walk over a page's text and tags, with the remembered searches it needs. */
class Scanner {
  private readonly nextLt: (pos: number) => number;
  readonly nextGt: (pos: number) => number;
  private readonly finders = new Map<string, (pos: number) => number>();
  constructor(readonly s: string) {
    this.nextLt = remembered((p) => s.indexOf("<", p));
    this.nextGt = remembered((p) => s.indexOf(">", p));
  }

  /** Where `re` (a global pattern, named by `key`) next matches at or after `pos`; -1 if never. */
  find(key: string, re: () => RegExp, pos: number): number {
    let f = this.finders.get(key);
    if (!f) {
      const r = re();
      f = remembered((p) => {
        r.lastIndex = p;
        return r.exec(this.s)?.index ?? -1;
      });
      this.finders.set(key, f);
    }
    return f(pos);
  }

  /**
   * Where the `</name` that closes an element whose content starts at `pos` is (nested ones
   * counted); -1 if it's never closed. Only the first few nested elements are counted: past them
   * it's the next closing tag, so a page of a million nested tags isn't walked once per tag.
   */
  closeOf(name: string, pos: number, nested = true): number {
    const close = (p: number) => this.find(`/${name}`, () => new RegExp(`</${name}(?=[\\s/>])`, "gi"), p);
    const first = close(pos);
    if (!nested || first < 0) return first;
    const open = (p: number) => this.find(name, () => new RegExp(`<${name}(?=[\\s/>])`, "gi"), p);
    let depth = 1;
    let p = pos;
    for (let step = 0; step < MAX_NESTED; step++) {
      const c = close(p);
      if (c < 0) return -1;
      const o = open(p);
      if (o >= 0 && o < c) {
        depth++;
        p = o + 1;
        continue;
      }
      if (--depth === 0) return c;
      p = c + 1;
    }
    return first;
  }

  /**
   * Calls `text` with the text between tags and `tag` with each tag. A tag handler can return where
   * to go on from (to skip an element's content), or -1 to stop. A "<" that starts no tag ("5 < 6")
   * is text; a comment left open hides the rest, as it does in a browser.
   */
  run(text: (t: string) => void, tag: (t: Tag) => number | void) {
    const s = this.s;
    let i = 0;
    while (i < s.length) {
      const lt = this.nextLt(i);
      if (lt < 0) {
        text(s.slice(i));
        break;
      }
      if (lt > i) text(s.slice(i, lt));
      i = lt + 1;
      if (s.startsWith("<!--", lt)) {
        const end = s.indexOf("-->", lt + 2);
        if (end < 0) break;
        text(" ");
        i = end + 3;
        continue;
      }
      const c1 = s.charCodeAt(lt + 1);
      const closing = c1 === 47;
      // <!doctype …>, <?xml …?>, and "</" without a name: dropped up to their ">".
      const other = c1 === 33 || c1 === 63 || (closing && !isNameStart(s.charCodeAt(lt + 2)));
      if (!other && !isNameStart(c1) && !closing) {
        text("<");
        continue;
      }
      let e = closing ? lt + 2 : lt + 1;
      if (!other) while (e < s.length && isNameChar(s.charCodeAt(e))) e++;
      const gt = this.nextGt(other ? lt + 2 : e);
      const lt2 = this.nextLt(lt + 1);
      if (gt < 0 || (lt2 >= 0 && lt2 < gt)) {
        text("<");
        continue;
      }
      i = gt + 1;
      if (other) {
        text(" ");
        continue;
      }
      const name = s.slice(closing ? lt + 2 : lt + 1, e).toLowerCase();
      const next = tag({ name, closing, start: lt, end: gt + 1, attrs: s.slice(e, gt), selfClosing: s.charCodeAt(gt - 1) === 47 });
      if (next === -1) break;
      if (typeof next === "number") i = next;
    }
  }
}

/**
 * For a page (not a title or snippet): where to go on after an element that isn't read (scripts,
 * styles, navigation, headers, footers, sidebars, forms), -1 to stop, or undefined to read it. A
 * header with the page's title in it is read; so is a form that holds the page's content (some
 * sites wrap everything in one). Hidden parts are read: tabs of specifications often start hidden.
 */
function skipped(sc: Scanner, t: Tag): number | undefined {
  if (t.closing || VOID.has(t.name)) return undefined;
  // "<svg/>" holds nothing; "<script/>" is still open, as a browser reads it.
  if (t.selfClosing && !RAW.has(t.name)) return undefined;
  const conditional = t.name === "header" || t.name === "form";
  if (!SKIPPED.has(t.name) && !conditional && !NOT_READ.test(t.attrs)) return undefined;
  // Scripts and styles end at their first closing tag, and so do headers and forms (which don't
  // nest, and are read on when they hold content); other elements count the ones nested in them.
  const close = sc.closeOf(t.name, t.end, !RAW.has(t.name) && !conditional);
  if (close < 0) return RAW.has(t.name) ? -1 : undefined;
  const holds = (key: string, re: () => RegExp) => {
    const at = sc.find(key, re, t.end);
    return at !== -1 && at < close;
  };
  if (t.name === "header" && holds("title", () => /<h[12](?=[\s/>])/gi)) return undefined;
  if (t.name === "form" && holds("content", () => /<(p|table|article|main|h[1-3])(?=[\s/>])/gi)) return undefined;
  const end = sc.nextGt(close + 2 + t.name.length);
  return end < 0 ? -1 : end + 1;
}

/** One line of a title or snippet: tags dropped, words kept apart. */
function stripInline(html: string): string {
  const s = html.length > HTML_MAX ? html.slice(0, HTML_MAX) : html;
  const out: string[] = [];
  new Scanner(s).run(
    (t) => out.push(t),
    (t) => void out.push(INLINE.has(t.name) ? "" : " "),
  );
  return out.join("");
}

/**
 * A page's text: blocks on their own lines, headings marked (`## Heading`), list items as bullets,
 * table rows as `a | b | c`, and what isn't read (see `skipped`) dropped.
 */
function stripPage(html: string): string {
  const sc = new Scanner(html);
  const out: string[] = [];
  let rowCells = 0;
  let inCell = false;
  let pre = 0;
  sc.run(
    // Line breaks in the page's source are spaces, as in a browser; inside <pre> they're kept.
    (t) => out.push(pre > 0 ? t : t.replace(/\s+/g, " ")),
    (t) => {
      const skip = skipped(sc, t);
      if (skip !== undefined) {
        if (skip !== -1) out.push(" ");
        return skip;
      }
      const { name, closing } = t;
      if (name === "pre" && !t.selfClosing) pre = Math.max(0, pre + (closing ? -1 : 1));
      if (name === "td" || name === "th") {
        if (closing) inCell = false;
        else {
          out.push(rowCells++ > 0 ? " | " : " ");
          inCell = true;
        }
        return;
      }
      // Each row starts a line; a table is a block of its own.
      if (name === "tr" || name === "table") {
        rowCells = 0;
        inCell = false;
        if (name === "table" || !closing) out.push("\n");
        return;
      }
      if (INLINE.has(name)) return;
      // Inside a table cell everything stays on the row's line.
      if (inCell) return void out.push(" ");
      const level = /^h([1-6])$/.exec(name)?.[1];
      if (level) return void out.push(closing ? "\n" : `\n${"#".repeat(Number(level))} `);
      if (name === "br" || name === "hr") return void out.push("\n");
      if (closing && BLOCK.has(name)) return void out.push("\n");
      if (!closing && name === "li") return void out.push("\n• ");
      out.push(" ");
    },
  );
  return out.join("");
}

interface Region {
  start: number;
  end: number;
  /** Characters of text in it, links not counted. */
  total: number;
}

/**
 * Where a page's main text is: its `<main>` (or role="main"), else the article that holds most of
 * the articles' text, else the block whose own text is the largest (paragraphs count for their
 * block and half for the one around it, links don't count). A block that leaves out much of the
 * page's text isn't trusted: null, read the whole page.
 */
function mainRegion(html: string): Region | null {
  const sc = new Scanner(html);
  interface Box {
    name: string;
    start: number;
    main: boolean;
    direct: number;
    total: number;
    childDirect: number;
  }
  const root: Box = { name: "", start: 0, main: false, direct: 0, total: 0, childDirect: 0 };
  const stack: Box[] = [root];
  const mains: Region[] = [];
  const articles: Region[] = [];
  let best: (Region & { score: number }) | null = null;
  let inLink = 0;
  const finish = (b: Box, end: number) => {
    b.total += b.direct;
    const parent = stack.at(-1)!;
    parent.total += b.total;
    parent.childDirect += b.direct;
    const r = { start: b.start, end, total: b.total };
    if (b.main) mains.push(r);
    if (b.name === "article") articles.push(r);
    const score = b.direct + b.childDirect / 2;
    if (!best || score > best.score) best = { ...r, score };
  };
  sc.run(
    (t) => {
      if (inLink) return;
      let n = 0;
      for (let k = 0; k < t.length; k++) if (t.charCodeAt(k) > 32) n++;
      stack.at(-1)!.direct += n;
    },
    (t) => {
      const skip = skipped(sc, t);
      if (skip !== undefined) return skip;
      if (t.name === "a" && !t.selfClosing) inLink = Math.max(0, inLink + (t.closing ? -1 : 1));
      const container = CONTAINERS.has(t.name) || (!t.closing && /\brole\s*=\s*["']?main\b/i.test(t.attrs));
      if (!container) return;
      if (!t.closing) {
        if (t.selfClosing || stack.length > MAX_DEPTH) return;
        stack.push({ name: t.name, start: t.end, main: t.name === "main" || /\brole\s*=\s*["']?main\b/i.test(t.attrs), direct: 0, total: 0, childDirect: 0 });
        return;
      }
      // Close the element and any left open inside it.
      const at = stack.findLastIndex((b) => b.name === t.name);
      if (at < 1) return;
      while (stack.length > at) finish(stack.pop()!, t.start);
    },
  );
  while (stack.length > 1) finish(stack.pop()!, html.length);
  const page = root.total + root.direct;
  if (page === 0) return null;
  const main = mains.sort((a, b) => b.total - a.total)[0];
  // <main> wins when it holds a fair share of the page: a small one (a notice, a cookie banner) next
  // to the real text doesn't, and a short page's <main> needs no 200 characters.
  if (main && main.total >= page * 0.3 && (main.total >= 200 || main.total >= page * 0.5)) return main;
  const article = articles.sort((a, b) => b.total - a.total)[0];
  const inArticles = articles.reduce((n, a) => n + a.total, 0);
  if (article && article.total >= 200 && article.total >= inArticles * 0.5 && article.total >= page * 0.25) return article;
  const block = best as (Region & { score: number }) | null;
  return block && block.total >= page * 0.6 ? block : null;
}

/** One line of plain text: tags dropped, entities decoded, whitespace collapsed. */
const plain = (s: string) => decodeEntities(stripInline(s.slice(0, 20_000))).replace(CONTROL, "").replace(/\s+/g, " ").trim();

/** Whitespace collapsed, paragraph breaks kept. */
const tidy = (s: string) =>
  s
    .replace(CONTROL, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * A page's readable text: its main part (see mainRegion) with headings (`## …`), paragraphs, lists
 * and table rows (`a | b | c`); scripts, styles, navigation, headers, footers, sidebars and forms
 * dropped.
 */
export function htmlToText(html: string): string {
  const s = html.length > HTML_MAX ? html.slice(0, HTML_MAX) : html;
  const region = mainRegion(s);
  return tidy(decodeEntities(stripPage(region ? s.slice(region.start, region.end) : s)));
}

/** The page's `<title>`, as one line (empty when it has none). */
export function pageTitle(html: string): string {
  const head = html.slice(0, 200_000);
  const open = /<title(\s[^>]*)?>/i.exec(head);
  if (!open) return "";
  const close = head.indexOf("</", open.index + open[0].length);
  return clip(plain(head.slice(open.index + open[0].length, close < 0 ? undefined : close)), TITLE_MAX);
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

/**
 * The address to connect to for this host, or PageRefused; the lookup ends with `signal`. Null when
 * a corporate proxy (`deps.proxy`) is to resolve a public name local DNS doesn't know. A host an
 * admin allows (`deps.allowedHosts`) may be internal.
 */
async function publicAddress(deps: WebSearchDeps, hostname: string, signal?: AbortSignal): Promise<string | null> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const allowed = hostAllowed(host, deps.allowedHosts ?? []);
  if (isIP(host)) {
    if (!allowed && isPrivateAddress(host)) throw new PageRefused(`${host} is a private address`);
    return host;
  }
  // Names that only mean something inside a network (and single labels like "intranet").
  if (!allowed && (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host))) throw new PageRefused(`${host} is an internal name`);
  let addrs: string[];
  try {
    addrs = await abortable((deps.resolve ?? defaultResolve)(host, signal), signal);
  } catch (e) {
    if (signal?.aborted) throw signal.reason;
    // Behind a corporate proxy local DNS may not know public names: that proxy resolves them.
    if (deps.proxy && !allowed) return null;
    throw new PageRefused(`${host} couldn't be found`);
  }
  if (!addrs.length) throw new PageRefused(`${host} couldn't be found`);
  // Every answer must be public: one private record is enough to refuse.
  if (!allowed && addrs.some(isPrivateAddress)) throw new PageRefused(`${host} points to a private address`);
  return addrs[0]!;
}

interface Page {
  status: number;
  location: string | null;
  type: string;
  body: Buffer;
  /** The whole body arrived (it wasn't cut at the size cap). */
  full: boolean;
}

const PAGE_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; AatmiqReader/1.0)",
  accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/pdf;q=0.8,*/*;q=0.1",
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

/** Reads a response: the status and redirect, or up to the type's cap of the (decompressed) body. */
function readResponse(res: IncomingMessage, capFor: (type: string) => number, resolve: (p: Page) => void, reject: (e: unknown) => void) {
  const status = res.statusCode ?? 0;
  const location = typeof res.headers.location === "string" ? res.headers.location : null;
  const type = String(res.headers["content-type"] ?? "");
  if (status !== 200) {
    res.resume();
    return resolve({ status, location, type, body: Buffer.alloc(0), full: true });
  }
  // The cap counts what comes out of decompression, so a small gzip bomb can't fill memory.
  const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
  const unzip = enc === "gzip" || enc === "x-gzip" ? createGunzip() : enc === "deflate" ? createInflate() : enc === "br" ? createBrotliDecompress() : null;
  const stream = unzip ? res.pipe(unzip) : res;
  if (unzip) res.on("error", (e) => unzip.destroy(e));
  const cap = capFor(type);
  collect(stream, cap).then((body) => {
    res.destroy();
    resolve({ status, location, type, body, full: body.length < cap });
  }, reject);
}

const GET_HEADERS = { ...PAGE_HEADERS, "accept-encoding": "gzip, deflate, br" };

/**
 * GET with the connection made to `address`, the one that was checked (TLS still checks the name).
 * Exported for tests.
 */
export function pinnedGet(url: URL, address: string, signal: AbortSignal, capFor: (type: string) => number = () => PAGE_MAX_BYTES): Promise<Page> {
  const family = isIP(address);
  const pinned: LookupFunction = (_host, opts, cb) => ((opts as { all?: boolean }).all ? cb(null, [{ address, family }]) : cb(null, address, family));
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, { method: "GET", headers: GET_HEADERS, lookup: pinned, agent: false, signal }, (res) =>
      readResponse(res, capFor, resolve, reject),
    );
    req.on("error", reject);
    req.end();
  });
}

/** A tunnel to `host:port` through an HTTP proxy (CONNECT), as the egress proxy makes one. */
function tunnel(proxy: URL, host: string, port: number, signal: AbortSignal): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = netConnect(Number(proxy.port || 80), proxy.hostname);
    const fail = (e: unknown) => {
      s.destroy();
      reject(e);
    };
    const stop = () => fail(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    const auth = proxy.username ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}\r\n` : "";
    const target = isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
    s.once("connect", () => s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth}\r\n`));
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("latin1");
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      s.off("data", onData);
      s.off("error", fail);
      signal.removeEventListener("abort", stop);
      if (!/^HTTP\/1\.[01] 200/.test(buf)) return fail(new Error(`the proxy answered ${buf.split("\r\n")[0]}`));
      const rest = Buffer.from(buf.slice(end + 4), "latin1");
      if (rest.length) s.unshift(rest);
      resolve(s);
    };
    s.on("data", onData);
    s.on("error", fail);
  });
}

/**
 * GET through a corporate proxy: a CONNECT tunnel to the checked address (or to the name, when
 * the proxy resolves it) for https, the page's whole URL for http. TLS checks the page's name.
 * Exported for tests.
 */
export async function proxiedGet(url: URL, address: string | null, proxy: URL, signal: AbortSignal, capFor: (type: string) => number = () => PAGE_MAX_BYTES): Promise<Page> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol === "https:") {
    const raw = await tunnel(proxy, address ?? host, Number(url.port || 443), signal);
    const socket = tlsConnect({ socket: raw, servername: isIP(host) ? undefined : host, ALPNProtocols: ["http/1.1"] });
    return new Promise((resolve, reject) => {
      // No agent (the socket is given), so the default port is said here: the Host header leaves out 443.
      const req = httpsRequest(url, { method: "GET", headers: GET_HEADERS, createConnection: () => socket, defaultPort: 443, signal }, (res) => readResponse(res, capFor, resolve, reject));
      req.on("error", reject);
      req.end();
    });
  }
  const auth = proxy.username ? { "proxy-authorization": `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}` } : {};
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: proxy.hostname, port: Number(proxy.port || 80), method: "GET", path: url.href, headers: { ...GET_HEADERS, host: url.host, ...auth }, agent: false, signal },
      (res) => readResponse(res, capFor, resolve, reject),
    );
    req.on("error", reject);
    req.end();
  });
}

/** GET through the given fetch (tests): the address was checked the same way. */
async function fetchGet(f: typeof fetch, url: URL, signal: AbortSignal, capFor: (type: string) => number): Promise<Page> {
  const res = await f(url.href, { redirect: "manual", signal, headers: PAGE_HEADERS });
  const page = { status: res.status, location: res.headers.get("location"), type: res.headers.get("content-type") ?? "" };
  if (res.status !== 200 || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    return { ...page, body: Buffer.alloc(0), full: true };
  }
  const cap = capFor(page.type);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  while (n < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const body = Buffer.concat(parts).subarray(0, cap);
  return { ...page, body, full: body.length < cap };
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

/** A page's text as `loadPage` read it. */
interface Loaded {
  /** Where the page was in the end (after redirects). */
  url: string;
  kind: "html" | "pdf" | "text";
  title: string;
  text: string;
  /** The page is longer than was read (the size cap, or a PDF's page limit). */
  cut: boolean;
  /** A PDF's pages: how many were read (from the first) and how many it has. */
  pages?: { read: number; total: number };
}

interface LoadOptions {
  maxChars: number;
  timeoutMs: number;
  /** Largest PDF read (a PDF cut at the cap is seldom readable, so a bigger one is refused). */
  pdfMaxBytes: number;
  pdfMaxPages: number;
  /** Also read JSON, XML, CSV and Markdown as text (the agent's web_fetch). */
  anyText: boolean;
}

const isPdf = (type: string) => /^application\/(x-)?pdf/.test(type);
const isHtml = (type: string) => /^(text\/html|application\/xhtml\+xml)/.test(type);
const isText = (type: string, any: boolean) =>
  /^text\/plain/.test(type) || (any && /^(text\/(csv|markdown|x-markdown|xml|tab-separated-values)|application\/(json|xml|[\w.+-]+\+(json|xml)))/.test(type));

/**
 * One page's text, following at most 3 redirects, each to a public address. The time covers
 * everything: the name lookups, every hop and the download. HTML, plain text, and the text a PDF
 * carries (datasheets, application notes, standards), without OCR: a scanned PDF has none.
 */
async function loadPage(deps: WebSearchDeps, href: string, o: LoadOptions): Promise<Loaded> {
  const signal = AbortSignal.timeout(o.timeoutMs);
  const capFor = (type: string) => (isPdf(type.toLowerCase()) ? o.pdfMaxBytes : PAGE_MAX_BYTES);
  let url = safeUrl(href);
  for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
    signal.throwIfAborted();
    const address = await publicAddress(deps, url.hostname, signal);
    // Allowed internal hosts are reached directly (a corporate proxy usually can't reach them).
    const proxy = deps.proxy && !hostAllowed(url.hostname, deps.allowedHosts ?? []) ? new URL(deps.proxy) : null;
    const page = deps.fetch
      ? await fetchGet(deps.fetch, url, signal, capFor)
      : proxy
        ? await proxiedGet(url, address, proxy, signal, capFor)
        : await pinnedGet(url, address!, signal, capFor);
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
    if (isPdf(type)) {
      // A PDF's index is at its end: one cut at the size cap is seldom readable, so it isn't parsed.
      if (!page.full) throw new PageRefused(`a PDF over ${megabytes(o.pdfMaxBytes)} MB`);
      const pdf = await pdfRead(page.body, { maxChars: o.maxChars, maxPages: o.pdfMaxPages, signal });
      const text = tidy(pdf.text);
      // Cut when pages were left unread (the page limit, or the text budget), not only at the size cap.
      const cut = text.length > o.maxChars || pdf.pagesRead < pdf.numPages;
      return { url: url.href, kind: "pdf", title: "", text: clip(text, o.maxChars), cut, pages: { read: pdf.pagesRead, total: pdf.numPages } };
    }
    const html = isHtml(type);
    if (!html && !isText(type, o.anyText)) throw new PageRefused(`${type || "no content type"} isn't read`);
    const raw = decode(page.body, page.type, html);
    const text = html ? htmlToText(raw) : tidy(raw);
    return { url: url.href, kind: html ? "html" : "text", title: html ? pageTitle(raw) : "", text: clip(text, o.maxChars), cut: !page.full || text.length > o.maxChars };
  }
  throw new PageRefused(url ? "too many redirects" : "not an http(s) link");
}

/** A size in MB as people write it: 10, 1.5. */
const megabytes = (bytes: number) => +(bytes / 1024 / 1024).toFixed(1);

/** One page's text for a search result (see loadPage), at most `maxChars` of it. */
export async function readPage(deps: WebSearchDeps, href: string, maxChars = CONTENT_MAX, timeoutMs = PAGE_TIMEOUT_MS): Promise<string> {
  const page = await loadPage(deps, href, { maxChars, timeoutMs, pdfMaxBytes: PAGE_MAX_BYTES, pdfMaxPages: 30, anyText: false });
  return page.text;
}

/** A part of a page, as the agent's web_fetch reads it. */
export interface FetchedPage {
  url: string;
  status: number;
  title: string | null;
  kind: "html" | "pdf" | "text";
  text: string;
  /** Where this part starts, where the next one would (null: this is the last), and the text's length. */
  offset: number;
  next: number | null;
  total: number;
  /** The page is longer than is read at all (`total` is what can be read). */
  cut: boolean;
  /** A PDF's pages: how many were read (from the first) and how many it has; null for other pages. */
  pages: { read: number; total: number } | null;
}

/** The agent reads a page in parts this long (about 5,000 tokens). */
export const FETCH_PART_CHARS = 20_000;
/** At most this much of one page is read (a 1.5 MB page, a 60-page PDF). */
const FETCH_MAX_CHARS = 300_000;
const FETCH_TIMEOUT_MS = 30_000;
const FETCH_PDF_MAX_BYTES = 10 * 1024 * 1024;
const FETCH_CACHE_MS = 10 * 60_000;
const FETCH_CACHE_MAX = 30;
/** Pages read lately, so reading on (`offset`) doesn't download the page again. */
const fetched = new Map<string, { at: number; page: Loaded }>();

/** Forget pages read lately (tests). */
export function clearFetchCache() {
  fetched.clear();
}

/**
 * A page for the agent's web_fetch: its main text (see htmlToText), or a PDF's text, from `offset`
 * on, `chars` at a time. Public addresses only, each redirect checked; at most 1.5 MB of a page or
 * 10 MB of a PDF (60 pages), 30 seconds. A page read in the last 10 minutes isn't downloaded again.
 */
export async function fetchPage(deps: WebSearchDeps, href: string, opts: { offset?: number; chars?: number } = {}): Promise<FetchedPage> {
  const key = safeUrl(href.trim())?.href;
  if (!key) throw new PageRefused("not an http(s) link");
  let hit = fetched.get(key);
  if (!hit || Date.now() - hit.at > FETCH_CACHE_MS) {
    const page = await loadPage(deps, key, { maxChars: FETCH_MAX_CHARS, timeoutMs: FETCH_TIMEOUT_MS, pdfMaxBytes: FETCH_PDF_MAX_BYTES, pdfMaxPages: 60, anyText: true });
    hit = { at: Date.now(), page };
    fetched.delete(key);
    fetched.set(key, hit);
    for (const k of fetched.keys()) {
      if (fetched.size <= FETCH_CACHE_MAX) break;
      fetched.delete(k);
    }
  }
  const { page } = hit;
  const total = page.text.length;
  const chars = Math.max(1000, Math.min(FETCH_PART_CHARS, Math.round(opts.chars ?? FETCH_PART_CHARS)));
  const offset = Math.max(0, Math.min(total, Math.floor(opts.offset ?? 0)));
  let end = Math.min(total, offset + chars);
  // A part ends at a line break (or a space) where there is one near the end, so no line is split.
  if (end < total) {
    const nl = page.text.lastIndexOf("\n", end);
    const sp = page.text.lastIndexOf(" ", end);
    const at = nl > offset + chars * 0.7 ? nl + 1 : sp > offset + chars * 0.7 ? sp + 1 : end;
    end = at;
  }
  // The offset is used as given, even mid-word: `next` can fall mid-word (a long run with no space
  // to end the part at), and following it must give back every character.
  return {
    url: page.url,
    status: 200,
    title: page.title || null,
    kind: page.kind,
    text: page.text.slice(offset, end),
    offset,
    next: end < total ? end : null,
    total,
    cut: page.cut,
    pages: page.pages ?? null,
  };
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
        // Skipped: private, too slow, not text (or a PDF that can't be read), or gone. The snippet still says something.
      }
    }),
  );
  return results.map((r) => (r.content ? { ...r, content: clip(r.content, maxChars) } : read.has(r) ? { ...r, content: read.get(r)! } : { ...r }));
}
