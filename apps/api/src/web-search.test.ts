/**
 * Web search (services/web-search.ts) with a fake fetch keyed on host: each provider's request and
 * how its results are read, errors that never carry the key, pages read only at public addresses
 * (redirects checked too), HTML to text and the cache. Against a real Postgres (TEST_DATABASE_URL):
 * the settings round trip, the environment filling in, and the admin's Test button.
 */
import { auditLog, organization } from "@aatmiq/db";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { loadWebSearch } from "./config";
import type { AppContext } from "./context";
import { createSecretBox } from "./crypto";
import { webSearchSetup } from "./services/gem";
import { clearWebSearchCache, htmlToText, pinnedGet, readPages, webSearch, WebSearchError, webSearchReady, type WebSearchDeps, type WebResult } from "./services/web-search";
import type { YtDlpRunner } from "./services/youtube";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const GOOD = "good-key-7f3a9c";

interface Call {
  host: string;
  method: string;
  url: URL;
  headers: Headers;
  body: any;
}

const PAGE_HTML = `<!doctype html><html><head><title>Ohm</title><style>body{color:red}</style><script>var secret = "do not read";</script></head>
<body><nav><a href="/">Home</a> | <a href="/x">Menu item</a></nav>
<main><h1>Ohm&rsquo;s law</h1><p>The current through a resistor is <b>V&nbsp;/&nbsp;R</b>. Resistance is in &Omega; (&#8486; or &#x3A9;).</p>
<ul><li>V in volts</li><li>R in ohms</li></ul><p>5 &lt; 6 &amp;&amp; 1 &times; 2</p>
<script>alert("nope")</script></main><footer>Copyright footer text</footer></body></html>`;

/** Search providers and web pages, keyed on host. A key starting "bad" is refused, "broke" is out of credit, "busy" is rate limited. */
function fakeWeb() {
  const calls: Call[] = [];
  const keyOf = (h: Headers) => h.get("authorization")?.replace(/^Bearer /, "") ?? h.get("x-subscription-token") ?? h.get("x-api-key") ?? "";
  const refuse = (key: string) =>
    key.startsWith("bad")
      ? new Response(`{"error":"invalid key ${key}"}`, { status: 401 })
      : key.startsWith("broke")
        ? new Response(`{"error":"payment required for ${key}"}`, { status: 402 })
        : key.startsWith("busy")
          ? new Response("slow down", { status: 429 })
          : null;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ host: u.host, method: init?.method ?? "GET", url: u, headers, body });
    const key = keyOf(headers);
    switch (u.host) {
      case "searx.test":
        if (u.pathname.startsWith("/nojson")) return new Response("Forbidden", { status: 403 });
        if (u.pathname.startsWith("/down")) return new Response("oops", { status: 502 });
        return Response.json({
          results: [
            { title: "Ohm's law - Wikipedia", url: "https://en.wikipedia.org/wiki/Ohm%27s_law", content: "Ohm's law states that the current…" },
            { title: "Duplicate", url: "https://en.wikipedia.org/wiki/Ohm%27s_law#History", content: "same page" },
            { title: "Script", url: "javascript:alert(1)", content: "x" },
            { title: "FTP", url: "ftp://files.example.org/ohm.txt", content: "x" },
            { title: "Creds", url: "https://user:pass@example.org/", content: "x" },
            { title: "x".repeat(400), url: "https://www.electronics-tutorials.ws/dccircuits/dcp_2.html", content: "y".repeat(900) },
          ],
        });
      case "ollama.com":
        return (
          refuse(key) ??
          Response.json({ results: [{ title: "Ohm's Law | Fluke", url: "https://www.fluke.com/en/learn/blog/electrical/what-is-ohms-law", content: `Full page text. ${"Ohm. ".repeat(1000)}` }] })
        );
      case "api.search.brave.com":
        return refuse(key) ?? Response.json({ web: { results: [{ title: "Ohm&#39;s Law", url: "https://www.allaboutcircuits.com/textbook/direct-current/chpt-2/voltage-current-resistance-relate/", description: "How <strong>voltage</strong>, current &amp; resistance relate" }] } });
      case "api.tavily.com":
        return refuse(key) ?? Response.json({ results: [{ title: "Ohm's law", url: "https://www.britannica.com/science/Ohms-law", content: "Ohm's law, description of the relationship between current, voltage, and resistance." }] });
      case "google.serper.dev":
        return refuse(key) ?? Response.json({ organic: [{ title: "Ohm's Law Calculator", link: "https://www.rapidtables.com/calc/electric/ohms-law-calculator.html", snippet: "Ohm's law calculator: V = I × R." }] });
      // Pages.
      case "docs.example.org":
        if (u.pathname === "/plain") return new Response("Plain text\n\n\n\nwith   gaps", { headers: { "content-type": "text/plain; charset=utf-8" } });
        if (u.pathname === "/file.pdf") return new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } });
        if (u.pathname === "/latin1") return new Response(Buffer.from("caf\xe9 \xb0C", "latin1"), { headers: { "content-type": "text/html; charset=iso-8859-1" } });
        return new Response(PAGE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
      case "hop.example.org": {
        const to: Record<string, string> = {
          "/meta": "http://169.254.169.254/latest/meta-data/",
          "/inner": "https://inner.example.org/secret",
          "/ok": "https://docs.example.org/plain",
          "/rel": "/ok",
          "/loop1": "/loop2",
          "/loop2": "/loop3",
          "/loop3": "/loop4",
          "/loop4": "/loop5",
          "/js": "javascript:alert(1)",
        };
        if (to[u.pathname]) return new Response(null, { status: 302, headers: { location: to[u.pathname]! } });
        return new Response("not found", { status: 404 });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls, hosts: () => calls.map((c) => c.host) };
}

const DNS: Record<string, string[]> = {
  "docs.example.org": ["93.184.216.34"],
  "hop.example.org": ["93.184.216.35"],
  "inner.example.org": ["10.1.2.3"],
  "mixed.example.org": ["93.184.216.36", "192.168.0.10"],
  "v6.example.org": ["fd00::1"],
  "mapped.example.org": ["::ffff:127.0.0.1"],
};
const resolve = async (host: string) => {
  const a = DNS[host];
  if (!a) throw new Error("ENOTFOUND");
  return a;
};

describe("web search providers", () => {
  const web = fakeWeb();
  const deps = (provider: WebSearchDeps["provider"], extra: Partial<WebSearchDeps> = {}): WebSearchDeps => ({ provider, url: null, key: GOOD, fetch: web.fetchFn, ...extra });
  afterEach(() => {
    clearWebSearchCache();
    web.calls.length = 0;
  });

  it("SearXNG: GET /search as JSON with safe search, only http(s) links, each once, trimmed", async () => {
    const r = await webSearch(deps("searxng", { url: "http://searx.test/", key: null }), "  Ohm's   law  ");
    const c = web.calls[0]!;
    expect(c.method).toBe("GET");
    expect(c.url.pathname).toBe("/search");
    expect(Object.fromEntries(c.url.searchParams)).toEqual({ q: "Ohm's law", format: "json", safesearch: "1", language: "en" });
    expect(r.map((x) => x.url)).toEqual(["https://en.wikipedia.org/wiki/Ohm%27s_law", "https://www.electronics-tutorials.ws/dccircuits/dcp_2.html"]);
    expect(r[0]).toEqual({ title: "Ohm's law - Wikipedia", url: "https://en.wikipedia.org/wiki/Ohm%27s_law", snippet: "Ohm's law states that the current…" });
    expect(r[1]!.title.length).toBeLessThanOrEqual(300);
    expect(r[1]!.snippet.length).toBeLessThanOrEqual(600);
    // A server under a path keeps its path.
    await webSearch(deps("searxng", { url: "http://searx.test/searxng", key: null }), "ohm");
    expect(web.calls[1]!.url.pathname).toBe("/searxng/search");
  });

  it("Ollama: POST with the key as a bearer token; its page text is kept and trimmed", async () => {
    const r = await webSearch(deps("ollama"), "Ohm's law", { max: 3 });
    const c = web.calls[0]!;
    expect(c.method).toBe("POST");
    expect(c.url.href).toBe("https://ollama.com/api/web_search");
    expect(c.headers.get("authorization")).toBe(`Bearer ${GOOD}`);
    expect(c.body).toEqual({ query: "Ohm's law", max_results: 3 });
    expect(r[0]!.content!.startsWith("Full page text.")).toBe(true);
    expect(r[0]!.content!.length).toBeLessThanOrEqual(3000);
    expect(r[0]!.snippet.length).toBeLessThanOrEqual(600);
  });

  it("Brave: GET with the subscription token; tags and entities leave the snippet", async () => {
    const r = await webSearch(deps("brave"), "Ohm's law", { max: 4 });
    const c = web.calls[0]!;
    expect(c.url.origin + c.url.pathname).toBe("https://api.search.brave.com/res/v1/web/search");
    expect(Object.fromEntries(c.url.searchParams)).toEqual({ q: "Ohm's law", count: "4" });
    expect(c.headers.get("x-subscription-token")).toBe(GOOD);
    expect(c.headers.get("accept")).toBe("application/json");
    expect(r[0]).toMatchObject({ title: "Ohm's Law", snippet: "How voltage, current & resistance relate" });
    expect(r[0]!.content).toBeUndefined();
  });

  it("Tavily: POST with basic depth; Serper: POST with X-API-KEY and organic results", async () => {
    const t = await webSearch(deps("tavily"), "Ohm's law", { max: 5 });
    expect(web.calls[0]!.url.href).toBe("https://api.tavily.com/search");
    expect(web.calls[0]!.headers.get("authorization")).toBe(`Bearer ${GOOD}`);
    expect(web.calls[0]!.body).toEqual({ query: "Ohm's law", max_results: 5, search_depth: "basic" });
    expect(t[0]).toMatchObject({ url: "https://www.britannica.com/science/Ohms-law", content: expect.stringContaining("relationship between current") });
    const s = await webSearch(deps("serper"), "Ohm's law", { max: 6 });
    expect(web.calls[1]!.url.href).toBe("https://google.serper.dev/search");
    expect(web.calls[1]!.headers.get("x-api-key")).toBe(GOOD);
    expect(web.calls[1]!.body).toEqual({ q: "Ohm's law", num: 6 });
    expect(s[0]).toEqual({ title: "Ohm's Law Calculator", url: "https://www.rapidtables.com/calc/electric/ohms-law-calculator.html", snippet: "Ohm's law calculator: V = I × R." });
  });

  it("the query is trimmed to 300 characters", async () => {
    await webSearch(deps("searxng", { url: "http://searx.test", key: null }), "ohm ".repeat(200));
    expect(web.calls[0]!.url.searchParams.get("q")!.length).toBeLessThanOrEqual(300);
  });

  it("a refused key, a used-up plan and a broken provider are told apart, and the key is never in the message", async () => {
    const kinds: Record<string, string> = {};
    for (const key of ["bad-key-1234", "broke-key-5678", "busy-key-9012"]) {
      for (const provider of ["ollama", "brave", "tavily", "serper"] as const) {
        const e = await webSearch(deps(provider, { key }), "ohm").catch((x) => x);
        expect(e).toBeInstanceOf(WebSearchError);
        expect(e.message).not.toContain(key);
        expect(e.stack ?? "").not.toContain(key);
        kinds[`${provider}:${key.split("-")[0]}`] = e.kind;
      }
    }
    expect(new Set(Object.entries(kinds).filter(([k]) => k.endsWith(":bad")).map(([, v]) => v))).toEqual(new Set(["auth"]));
    expect(new Set(Object.entries(kinds).filter(([k]) => !k.endsWith(":bad")).map(([, v]) => v))).toEqual(new Set(["quota"]));
    const nojson = await webSearch(deps("searxng", { url: "http://searx.test/nojson", key: null }), "ohm").catch((x) => x);
    expect(nojson).toMatchObject({ kind: "auth", message: expect.stringContaining("search.formats") });
    expect(await webSearch(deps("searxng", { url: "http://searx.test/down", key: null }), "ohm").catch((x) => x)).toMatchObject({ kind: "unavailable", message: "The search provider answered 502." });
    const late = await webSearch({ ...deps("brave"), fetch: (async () => Promise.reject(new DOMException("timed out", "TimeoutError"))) as typeof fetch }, "ohm").catch((x) => x);
    expect(late).toMatchObject({ kind: "unavailable", message: "The search provider didn't answer in time." });
    const garbled = await webSearch({ ...deps("brave"), fetch: (async () => new Response("<html>not json</html>")) as typeof fetch }, "ohm").catch((x) => x);
    expect(garbled).toMatchObject({ kind: "unavailable" });
  });

  it("without a provider, a SearXNG server or a key, nothing is sent", async () => {
    for (const dd of [deps(null), deps("searxng", { key: null }), deps("brave", { key: null })]) {
      expect(webSearchReady(dd)).toBe(false);
      await expect(webSearch(dd, "ohm")).rejects.toMatchObject({ kind: "not_configured" });
    }
    expect(web.calls).toEqual([]);
  });

  it("caches a search for 10 minutes per provider and query", async () => {
    const searx = deps("searxng", { url: "http://searx.test", key: null });
    const first = await webSearch(searx, "Ohm's law");
    first[0]!.title = "changed by a caller";
    const again = await webSearch(searx, "ohm's LAW");
    expect(web.calls).toHaveLength(1);
    expect(again[0]!.title).toBe("Ohm's law - Wikipedia");
    await webSearch(deps("brave"), "Ohm's law");
    expect(web.calls).toHaveLength(2);
    await webSearch(searx, "Ohm's law", { cache: false });
    expect(web.calls).toHaveLength(3);
    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60_000);
    await webSearch(searx, "Ohm's law");
    spy.mockRestore();
    expect(web.calls).toHaveLength(4);
  });
});

describe("reading pages", () => {
  const web = fakeWeb();
  const deps: WebSearchDeps = { provider: "brave", url: null, key: GOOD, fetch: web.fetchFn, resolve };
  const result = (u: string, extra: Partial<WebResult> = {}): WebResult => ({ title: u, url: u, snippet: "s", ...extra });

  it("HTML becomes text: no scripts, styles, navigation or footer; entities decoded; blocks on their own lines", () => {
    const text = htmlToText(PAGE_HTML);
    expect(text).toContain("Ohm\u2019s law");
    // &Omega; is the Greek letter, &#8486; the ohm sign.
    expect(text).toContain("The current through a resistor is V / R. Resistance is in \u03a9 (\u2126 or \u03a9).");
    expect(text).toContain("• V in volts");
    expect(text).toContain("5 < 6 && 1 × 2");
    for (const gone of ["secret", "do not read", "color:red", "Menu item", "Copyright footer", "alert"]) expect(text).not.toContain(gone);
    expect(text).not.toMatch(/ {2}|\n{3}/);
  });

  it("reads public pages, refuses private ones (by IP, by name, mixed answers, after a redirect) and keeps provider text", async () => {
    const input = [
      result("https://docs.example.org/ohm"),
      result("http://10.0.0.5/admin"),
      result("http://[::1]:4000/api"),
      result("http://localhost:4000/api/admin"),
      result("http://intranet/wiki"),
      result("https://inner.example.org/secret"),
      result("https://mixed.example.org/page"),
      result("https://v6.example.org/page"),
      result("https://mapped.example.org/page"),
      result("https://hop.example.org/meta"),
      result("https://hop.example.org/inner"),
      result("https://hop.example.org/js"),
      result("https://hop.example.org/ok"),
      result("https://hop.example.org/rel"),
      result("https://hop.example.org/loop1"),
      result("https://docs.example.org/file.pdf"),
      result("https://docs.example.org/latin1"),
      result("https://unknown.example.org/page"),
      result("https://www.fluke.com/ohms-law", { content: "Provider text. ".repeat(400) }),
    ];
    const out = await readPages(deps, input, { max: 30, maxChars: 500 });
    expect(out.map((r) => r.url)).toEqual(input.map((r) => r.url));
    const content = Object.fromEntries(out.map((r) => [r.url, r.content]));
    expect(content["https://docs.example.org/ohm"]).toContain("The current through a resistor is V / R");
    expect(content["https://docs.example.org/ohm"]).not.toContain("do not read");
    // Followed to a public page, absolute and relative.
    expect(content["https://hop.example.org/ok"]).toBe("Plain text\n\nwith gaps");
    expect(content["https://hop.example.org/rel"]).toBe("Plain text\n\nwith gaps");
    expect(content["https://docs.example.org/latin1"]).toBe("café °C");
    for (const refused of [
      "http://10.0.0.5/admin",
      "http://[::1]:4000/api",
      "http://localhost:4000/api/admin",
      "http://intranet/wiki",
      "https://inner.example.org/secret",
      "https://mixed.example.org/page",
      "https://v6.example.org/page",
      "https://mapped.example.org/page",
      "https://hop.example.org/meta",
      "https://hop.example.org/inner",
      "https://hop.example.org/js",
      "https://hop.example.org/loop1",
      "https://docs.example.org/file.pdf",
      "https://unknown.example.org/page",
    ])
      expect(content[refused], refused).toBeUndefined();
    // Private addresses were never asked; at most 3 redirects were followed.
    const hosts = web.hosts();
    for (const h of ["10.0.0.5", "[::1]:4000", "localhost:4000", "intranet", "inner.example.org", "mixed.example.org", "v6.example.org", "mapped.example.org", "169.254.169.254", "unknown.example.org"]) expect(hosts).not.toContain(h);
    expect(web.calls.filter((c) => c.url.pathname.startsWith("/loop")).map((c) => c.url.pathname)).toEqual(["/loop1", "/loop2", "/loop3", "/loop4"]);
    // Text the provider sent isn't fetched again, only trimmed.
    expect(hosts).not.toContain("www.fluke.com");
    expect(content["https://www.fluke.com/ohms-law"]!.length).toBeLessThanOrEqual(500);
  });

  it("reads at most `max` pages", async () => {
    web.calls.length = 0;
    const out = await readPages(deps, [result("https://docs.example.org/a"), result("https://docs.example.org/b"), result("https://docs.example.org/c")], { max: 2 });
    expect(out.filter((r) => r.content)).toHaveLength(2);
    expect(web.calls).toHaveLength(2);
  });

  describe("the connection goes to the address that was checked", () => {
    let server: Server;
    let port = 0;
    const seen: { host?: string; encoding?: string }[] = [];
    beforeAll(async () => {
      server = createServer((req, res) => {
        seen.push({ host: req.headers.host, encoding: req.headers["accept-encoding"] as string });
        if (req.url === "/gz") {
          res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
          return res.end(gzipSync("<p>compressed page</p>"));
        }
        if (req.url === "/big") {
          res.writeHead(200, { "content-type": "text/plain" });
          return res.end("a".repeat(3 * 1024 * 1024));
        }
        if (req.url === "/moved") {
          res.writeHead(301, { location: "http://10.0.0.1/" });
          return res.end();
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<p>hello</p>");
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it("connects to the given address with the page's own name, decompresses, caps the size and reports redirects", async () => {
      // This name doesn't exist anywhere: the request only arrives because it's pinned.
      const page = await pinnedGet(new URL(`http://reader.example.invalid:${port}/`), "127.0.0.1", AbortSignal.timeout(5000));
      expect(page.status).toBe(200);
      expect(page.body.toString()).toBe("<p>hello</p>");
      expect(seen.at(-1)!.host).toBe(`reader.example.invalid:${port}`);
      const gz = await pinnedGet(new URL(`http://reader.example.invalid:${port}/gz`), "127.0.0.1", AbortSignal.timeout(5000));
      expect(gz.body.toString()).toBe("<p>compressed page</p>");
      const big = await pinnedGet(new URL(`http://reader.example.invalid:${port}/big`), "127.0.0.1", AbortSignal.timeout(5000));
      expect(big.body.length).toBe(1.5 * 1024 * 1024);
      const moved = await pinnedGet(new URL(`http://reader.example.invalid:${port}/moved`), "127.0.0.1", AbortSignal.timeout(5000));
      expect(moved).toMatchObject({ status: 301, location: "http://10.0.0.1/" });
    });
  });
});

describe("WEB_SEARCH_* in the environment", () => {
  it("reads the provider, the SearXNG URL and the key, and refuses a key without its provider", () => {
    expect(loadWebSearch({})).toEqual({ provider: null, url: null, key: null });
    expect(loadWebSearch({ WEB_SEARCH_PROVIDER: "searxng", WEB_SEARCH_URL: "http://searxng:8080/" })).toEqual({ provider: "searxng", url: "http://searxng:8080", key: null });
    expect(loadWebSearch({ WEB_SEARCH_PROVIDER: "brave", WEB_SEARCH_KEY: "k" })).toEqual({ provider: "brave", url: null, key: "k" });
    expect(loadWebSearch({ WEB_SEARCH_PROVIDER: "off" })).toEqual({ provider: null, url: null, key: null });
    expect(() => loadWebSearch({ WEB_SEARCH_PROVIDER: "bing" })).toThrow(/WEB_SEARCH_PROVIDER/);
    expect(() => loadWebSearch({ WEB_SEARCH_KEY: "k" })).toThrow(/WEB_SEARCH_PROVIDER/);
    expect(() => loadWebSearch({ WEB_SEARCH_PROVIDER: "searxng", WEB_SEARCH_KEY: "k" })).toThrow(/WEB_SEARCH_PROVIDER/);
    expect(() => loadWebSearch({ WEB_SEARCH_PROVIDER: "searxng", WEB_SEARCH_URL: "file:///etc/passwd" })).toThrow(/WEB_SEARCH_URL/);
  });
});

d("web search settings and the Test button", () => {
  let h: Harness;
  const web = fakeWeb();
  const noYtDlp: YtDlpRunner = async () => ({ code: 127, stdout: "", stderr: "not installed" });
  const SECRET = "test-secret-test-secret-test-secret-1234";

  beforeAll(async () => {
    h = await startHarness({ webSearch: { provider: null, url: null, key: null } }, { fetch: web.fetchFn, ytDlp: noYtDlp });
  });
  afterAll(async () => {
    await h?.close();
  });
  afterEach(() => clearWebSearchCache());

  const gem = async () => (await h.call(h.owner, "GET", "/api/admin/gem")).json;

  it("is off by default; chat web search and lesson checks default on", async () => {
    const g = await gem();
    expect(g).toMatchObject({ webProvider: "off", webUrl: null, chatWebSearch: true, lessonCheck: true });
    expect(g.web).toEqual({ provider: null, providerFrom: "none", url: null, urlFrom: "none", key: "none", ready: false });
  });

  it("saves a provider and its key encrypted; the key never comes back, and isn't in the audit log", async () => {
    const key = "brave-secret-0123456789";
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "brave", webKey: key })).status).toBe(200);
    const res = await h.call(h.owner, "GET", "/api/admin/gem");
    expect(res.json).toMatchObject({ webProvider: "brave", web: { provider: "brave", providerFrom: "settings", key: "settings", ready: true } });
    expect(res.body).not.toContain(key);
    const [o] = await h.db.select({ g: organization.gemSettings }).from(organization);
    expect(JSON.stringify(o!.g)).not.toContain(key);
    expect(o!.g).toMatchObject({ webProvider: "brave", webKeyProvider: "brave" });
    expect(createSecretBox(SECRET).decrypt(o!.g!.webKeyEnc!)).toBe(key);
    const audits = await h.db.select().from(auditLog);
    const entry = audits.filter((a) => a.action === "settings.gem_updated").at(-1)!;
    expect(entry.meta).toMatchObject({ webProvider: "brave", webKeyChanged: true });
    expect(JSON.stringify(audits)).not.toContain(key);
    // Other saves leave the provider and key alone.
    await h.call(h.owner, "PUT", "/api/admin/gem", { coursesPerDay: 9 });
    expect((await gem()).web).toMatchObject({ provider: "brave", key: "settings" });
  });

  it("a key saved for one provider is never sent to another", async () => {
    await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "tavily" });
    expect((await gem()).web).toMatchObject({ provider: "tavily", key: "none", ready: false });
    web.calls.length = 0;
    const t = await h.call(h.owner, "POST", "/api/admin/gem/test-web", {});
    expect(t.json).toMatchObject({ ok: false, kind: "not_configured" });
    expect(web.calls).toEqual([]);
    // Back to Brave: its key is there again.
    await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "brave" });
    expect((await gem()).web).toMatchObject({ provider: "brave", key: "settings", ready: true });
  });

  it("Test searches with the saved values, or with what's typed, and says what went wrong", async () => {
    web.calls.length = 0;
    const ok = await h.call(h.owner, "POST", "/api/admin/gem/test-web", {});
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ ok: true, results: 1, error: null, sample: [{ title: "Ohm's Law", url: expect.stringMatching(/^https:\/\/www\.allaboutcircuits\.com\//) }] });
    expect(typeof ok.json.ms).toBe("number");
    expect(web.calls[0]!.url.searchParams.get("q")).toBe("Ohm's law");
    expect(web.calls[0]!.headers.get("x-subscription-token")).toBe("brave-secret-0123456789");
    // Typed values: another provider and its key, not saved.
    const typed = await h.call(h.owner, "POST", "/api/admin/gem/test-web", { provider: "serper", key: "typed-serper-key" });
    expect(typed.json).toMatchObject({ ok: true, results: 1 });
    expect(web.calls.at(-1)!.headers.get("x-api-key")).toBe("typed-serper-key");
    expect((await gem()).web.provider).toBe("brave");
    // A wrong key: said plainly, without the key.
    const bad = await h.call(h.owner, "POST", "/api/admin/gem/test-web", { provider: "ollama", key: "bad-ollama-key-42" });
    expect(bad.json).toMatchObject({ ok: false, kind: "auth", error: "The search provider refused the key.", results: 0, sample: [] });
    expect(bad.body).not.toContain("bad-ollama-key-42");
    // In Hindi for someone using the interface in Hindi.
    const hi = await h.call({ cookie: `${h.owner.cookie}; aatmiq_lang=hi` }, "POST", "/api/admin/gem/test-web", { provider: "ollama", key: "bad-ollama-key-42" });
    expect(hi.json.error).toBe("खोज प्रोवाइडर ने कुंजी स्वीकार नहीं की।");
    // A SearXNG URL that's typed (the admin's own server may be on this machine or the LAN).
    const searx = await h.call(h.owner, "POST", "/api/admin/gem/test-web", { provider: "searxng", url: "http://searx.test" });
    expect(searx.json).toMatchObject({ ok: true, results: 2 });
  });

  it("SearXNG: the URL set here, else Work AI's; a key can't be saved for it", async () => {
    await h.db.update(organization).set({ workSettings: { searxngUrl: "http://searx.test" } });
    await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "searxng", webUrl: "" });
    expect((await gem()).web).toEqual({ provider: "searxng", providerFrom: "settings", url: "http://searx.test", urlFrom: "work", key: "none", ready: true });
    expect((await h.call(h.owner, "POST", "/api/admin/gem/test-web", {})).json).toMatchObject({ ok: true, results: 2 });
    await h.call(h.owner, "PUT", "/api/admin/gem", { webUrl: "http://searx.test/own" });
    expect((await gem()).web).toMatchObject({ url: "http://searx.test/own", urlFrom: "settings" });
    expect((await gem()).webUrl).toBe("http://searx.test/own");
    const bad = await h.call(h.owner, "PUT", "/api/admin/gem", { webKey: "pointless" });
    expect(bad.status).toBe(400);
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { webUrl: "ftp://searx.test" })).status).toBe(400);
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "bing" })).status).toBe(400);
  });

  it("the switches for chat and lesson checks are saved and kept", async () => {
    await h.call(h.owner, "PUT", "/api/admin/gem", { chatWebSearch: false, lessonCheck: false });
    expect(await gem()).toMatchObject({ chatWebSearch: false, lessonCheck: false });
    await h.call(h.owner, "PUT", "/api/admin/gem", { betaCalculators: true });
    expect(await gem()).toMatchObject({ chatWebSearch: false, lessonCheck: false });
    await h.call(h.owner, "PUT", "/api/admin/gem", { chatWebSearch: true, lessonCheck: true });
    expect(await gem()).toMatchObject({ chatWebSearch: true, lessonCheck: true });
  });

  it("removing the key and switching off", async () => {
    await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "brave", webKey: "" });
    expect((await gem()).web).toMatchObject({ provider: "brave", key: "none", ready: false });
    await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "off" });
    expect(await gem()).toMatchObject({ webProvider: "off", web: { provider: null, ready: false } });
  });

  it("only org admins see the settings or run the test", async () => {
    expect((await h.call(h.alice, "GET", "/api/admin/gem")).status).toBe(403);
    expect((await h.call(h.alice, "PUT", "/api/admin/gem", { webProvider: "brave" })).status).toBe(403);
    web.calls.length = 0;
    expect((await h.call(h.alice, "POST", "/api/admin/gem/test-web", { provider: "searxng", url: "http://searx.test" })).status).toBe(403);
    expect((await h.call(null, "POST", "/api/admin/gem/test-web", { provider: "searxng", url: "http://searx.test" })).status).toBe(401);
    expect(web.calls).toEqual([]);
  });

  it("the environment fills in what isn't set here; an explicit Off wins", async () => {
    const box = createSecretBox(SECRET);
    const ctx = (webSearch: NonNullable<AppContext["cfg"]["webSearch"]>) => ({ db: h.db, box, cfg: { webSearch } }) as unknown as AppContext;
    const envBrave = { provider: "brave" as const, url: "http://searx.env", key: "env-brave-key" };
    await h.db.update(organization).set({ gemSettings: {}, workSettings: { searxngUrl: "http://searx.work" } });
    expect(await webSearchSetup(ctx(envBrave))).toEqual({ provider: "brave", providerFrom: "environment", url: "http://searx.env", urlFrom: "environment", key: "env-brave-key", keyFrom: "environment" });
    // An explicit "off" here wins over the environment.
    await h.db.update(organization).set({ gemSettings: { webProvider: "off" } });
    expect((await webSearchSetup(ctx(envBrave))).provider).toBeNull();
    // Another provider chosen here: the environment's Brave key isn't sent to it.
    await h.db.update(organization).set({ gemSettings: { webProvider: "tavily" } });
    expect(await webSearchSetup(ctx(envBrave))).toMatchObject({ provider: "tavily", key: null, keyFrom: "none" });
    // A key saved here wins over the environment's for the same provider.
    await h.db.update(organization).set({ gemSettings: { webProvider: "brave", webKeyEnc: box.encrypt("settings-key"), webKeyProvider: "brave" } });
    expect(await webSearchSetup(ctx(envBrave))).toMatchObject({ key: "settings-key", keyFrom: "settings" });
    // SearXNG with nothing set here or in the environment: Work AI's server.
    await h.db.update(organization).set({ gemSettings: { webProvider: "searxng" } });
    expect(await webSearchSetup(ctx({ provider: null, url: null, key: null }))).toMatchObject({ provider: "searxng", url: "http://searx.work", urlFrom: "work", key: null });
  });
});
