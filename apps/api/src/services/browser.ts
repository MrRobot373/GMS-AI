/**
 * The Work AI browser: one headless Chromium per task, run by the API and driven by the agent's
 * browser_* tools (through the internal API, with the task's token). It runs as the task's own
 * Unix user when tasks are isolated, keeps its profile in the task's runtime folder, saves
 * screenshots and downloads into the task folder, and reaches the web only through the egress
 * proxy (no private or internal addresses unless an admin allows them).
 *
 * Pages come back as text with numbered elements ("[4] button "Sign in""), which the agent uses
 * to click or type. A click or Enter that would submit a form is held until the agent repeats it
 * with confirm_submit, which the approval policy turns into a question for the person.
 *
 * Pages the agent built are opened from the task folder under http://task.local/, so it can try
 * them the way a person would: script errors come back with each view, and on those pages it can
 * press keys and click at a point (a canvas game has no elements to number), read the text a page
 * drew on its canvas (with where it is), and evaluate an expression in the page to check its state.
 * A model that can't see screenshots isn't blind there.
 */
import { chown, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { EgressProxy } from "./egress";

export const MAX_TEXT = 12_000;
const NAV_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;

export class BrowserError extends Error {}

/** Where the task's own files are served to its browser (never on the network). */
export const LOCAL_ORIGIN = "http://task.local";
const LOCAL_MAX_BYTES = 20 * 1024 * 1024;
/** Script errors kept per view, and how much of each. */
const MAX_ERRORS = 10;
const ERROR_CHARS = 300;
/** How long an expression may run, and how much of its result comes back. */
const EVAL_TIMEOUT_MS = 5_000;
const EVAL_CHARS = 4_000;
/** Canvas text counts as on screen when drawn this close to the newest (the latest frames of a game that redraws). */
const CANVAS_TEXT_MS = 250;
const MAX_CANVAS_TEXTS = 40;

/**
 * Runs in pages from the task folder: remembers the text a page draws on a canvas and where (in
 * page pixels, for browser_click_at), since canvas text isn't in the page's DOM.
 */
const CANVAS_TEXT_HOOK = `(() => {
  if (location.origin !== ${JSON.stringify(LOCAL_ORIGIN)}) return;
  const seen = new Map();
  Object.defineProperty(window, "__aatmiqCanvasText", { value: seen });
  const proto = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (!proto) return;
  for (const name of ["fillText", "strokeText"]) {
    const original = proto[name];
    proto[name] = function (text, x, y, ...rest) {
      try {
        const t = String(text).trim();
        if (t) {
          const m = this.getTransform();
          const r = this.canvas.getBoundingClientRect();
          const sx = r.width / (this.canvas.width || 1), sy = r.height / (this.canvas.height || 1);
          seen.delete(t);
          seen.set(t, { x: Math.round((m.a * x + m.c * y + m.e) * sx + r.left), y: Math.round((m.b * x + m.d * y + m.f) * sy + r.top), at: performance.now() });
          if (seen.size > 300) seen.delete(seen.keys().next().value);
        }
      } catch {}
      return original.call(this, text, x, y, ...rest);
    };
  }
})();`;
const LOCAL_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/**
 * The file a task.local path names, or null: it must be a file (a folder means its index.html)
 * inside the task folder once every link is followed, and not too big.
 */
export async function localFile(workdir: string, pathname: string): Promise<string | null> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  const root = await realpath(workdir).catch(() => null);
  if (!root) return null;
  const inside = (p: string) => p === root || p.startsWith(root + sep);
  let real = await realpath(join(root, rel)).catch(() => null);
  if (!real || !inside(real)) return null;
  let info = await stat(real).catch(() => null);
  if (info?.isDirectory()) {
    real = await realpath(join(real, "index.html")).catch(() => null);
    if (!real || !inside(real)) return null;
    info = await stat(real).catch(() => null);
  }
  return info?.isFile() && info.size <= LOCAL_MAX_BYTES ? real : null;
}

/** Where the browser lives for one task. */
export interface BrowserTarget {
  /** The task folder: screenshots and downloads go here. */
  workdir: string;
  /** Private folder for the browser profile (cookies, cache). */
  profileDir: string;
  /** Run as this Unix user (tasks isolated); undefined: as the API's user. */
  uid?: number;
}

export interface PageView {
  url: string;
  title: string;
  /** Page text with numbered elements, cut to MAX_TEXT. */
  text: string;
  truncated: boolean;
  /** Files the page downloaded since the last action, relative to the task folder. */
  downloads: string[];
  /** Script errors on the page since the last action. */
  errors?: string[];
  /** Pages from the task folder: text drawn on a canvas in its latest frames, with where it is ("START at 640,330"). */
  canvasText?: string[];
  /** browser_eval: the expression's value, as JSON. */
  result?: string;
}

/** Find the system's Chromium: BROWSER_PATH, the image's /usr/bin/chromium, or Playwright's own copy. */
/** Chrome and Edge on Windows, where the Linux Chromium paths don't exist. */
function windowsBrowsers(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") return [];
  const local = env.LOCALAPPDATA;
  const pf = env.PROGRAMFILES;
  const pf86 = env["PROGRAMFILES(X86)"];
  return [
    local && join(local, "Google", "Chrome", "Application", "chrome.exe"),
    pf && join(pf, "Google", "Chrome", "Application", "chrome.exe"),
    pf86 && join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    pf && join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
    pf86 && join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter((p): p is string => !!p);
}

export function findChromium(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const p of [env.BROWSER_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser", ...windowsBrowsers(env)])
    if (p && existsSync(p)) return p;
  try {
    const p = chromium.executablePath();
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Runs in the page (plain JavaScript, so no build step rewrites it): numbers the visible elements
 * a person could use and returns the page as text, each element where it appears:
 * [n] role "name" (value).
 */
export const SNAPSHOT = String.raw`(() => {
  const doc = document;
  doc.querySelectorAll("[data-aatmiq-ref]").forEach((el) => el.removeAttribute("data-aatmiq-ref"));
  const interactive = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [contenteditable=""], [contenteditable="true"]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
  const label = (e) => {
    const by = e.getAttribute("aria-labelledby");
    const aria = e.getAttribute("aria-label") || (by && doc.getElementById(by) ? doc.getElementById(by).textContent : "");
    const byFor = e.id ? (doc.querySelector('label[for="' + CSS.escape(e.id) + '"]') || {}).textContent : "";
    const wrap = e.closest("label") ? e.closest("label").textContent : "";
    const own = e.tagName === "INPUT" ? e.placeholder || wrap || e.name : e.innerText || e.title || e.getAttribute("alt") || wrap;
    return clean(aria || byFor || own).slice(0, 100);
  };
  const role = (el) => {
    const r = el.getAttribute("role");
    if (r) return r;
    const t = el.tagName.toLowerCase();
    if (t === "a") return "link";
    if (t === "select") return "select";
    if (t === "textarea") return "textbox";
    if (t === "summary") return "button";
    if (t === "input") {
      const type = el.type;
      if (["submit", "button", "reset", "image"].includes(type)) return "button";
      if (["checkbox", "radio"].includes(type)) return type;
      return "textbox";
    }
    if (el.hasAttribute("contenteditable")) return "textbox";
    return t;
  };
  let n = 0;
  const refs = new Map();
  for (const el of Array.from(doc.querySelectorAll(interactive))) {
    if (!visible(el) || el.disabled) continue;
    refs.set(el, ++n);
    el.setAttribute("data-aatmiq-ref", String(n));
  }
  const out = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = clean(node.textContent);
      if (t && node.parentElement && visible(node.parentElement) && !node.parentElement.closest("[data-aatmiq-ref]")) out.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    const tag = el.tagName;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "svg", "SVG"].includes(tag)) return;
    const ref = refs.get(el);
    if (ref) {
      let value = "";
      if (tag === "SELECT") value = " (selected: " + ((el.selectedOptions[0] || {}).text || "") + "; options: " + Array.from(el.options).map((o) => o.text).slice(0, 15).join(" | ") + ")";
      else if (el.type === "checkbox" || el.type === "radio") value = el.checked ? " (checked)" : " (not checked)";
      else if ((tag === "INPUT" || tag === "TEXTAREA") && el.type !== "submit" && el.type !== "button") value = el.type === "password" ? (el.value ? " (filled)" : "") : el.value ? " (value: " + el.value.slice(0, 80) + ")" : "";
      const href = tag === "A" ? " → " + (el.getAttribute("href") || "").slice(0, 120) : "";
      out.push("[" + ref + "] " + role(el) + ' "' + label(el) + '"' + value + href);
      return;
    }
    if (/^H[1-6]$/.test(tag)) {
      const t = clean(el.innerText);
      if (t && visible(el)) out.push("#".repeat(Number(tag[1])) + " " + t);
      return;
    }
    el.childNodes.forEach(walk);
  };
  walk(doc.body || doc.documentElement);
  return out.join("\n");
})()`;

/** Runs in the page: would clicking (or pressing Enter in) this element submit a form? */
const SUBMITS = String.raw`(e, enter) => {
  const form = e.form || e.closest("form");
  if (!form) return false;
  if (enter) return e.tagName === "INPUT" && !["checkbox", "radio", "button", "file"].includes(e.type);
  if (e.tagName === "BUTTON") return (e.getAttribute("type") || "submit").toLowerCase() === "submit";
  return e.tagName === "INPUT" && (e.type === "submit" || e.type === "image");
}`;

/** Asks the page whether element [ref] submits a form (false when it can't tell). */
async function submits(page: Page, ref: number, enter: boolean): Promise<boolean> {
  const expr = `(${SUBMITS})(document.querySelector('[data-aatmiq-ref="${Number(ref)}"]'), ${enter ? "true" : "false"})`;
  return ((await page.evaluate(expr).catch(() => false)) as boolean) === true;
}

interface Session {
  context: BrowserContext;
  /** Short temp folder (Chromium's sockets live there; Unix socket paths max out at 108 bytes). */
  tmp: string;
  page: Page;
  target: BrowserTarget;
  egress: EgressProxy;
  downloads: string[];
  /** A page load the egress proxy refused (plain HTTP), reported with the next view. */
  blocked: { host: string; reason: string } | null;
  /** Script errors since the last view (uncaught exceptions and console errors). */
  errors: string[];
  lastUsed: number;
}

export interface BrowserServiceOptions {
  executablePath: string | null;
  egress: () => Promise<EgressProxy>;
  /** Folder for the wrapper that starts Chromium as a task's user. */
  runtimeDir: string;
  idleMinutes?: number;
  log?: (msg: string, err?: unknown) => void;
}

export class BrowserService {
  /** Internal hosts the admin allows (Admin → Work AI); the egress proxy reads it on every request. */
  allowedHosts: string[] = [];
  private sessions = new Map<string, Session>();
  private starting = new Map<string, Promise<Session>>();
  private sweeper: NodeJS.Timeout;

  constructor(private opts: BrowserServiceOptions) {
    const idle = (opts.idleMinutes ?? 10) * 60_000;
    this.sweeper = setInterval(() => {
      for (const [id, s] of this.sessions) if (Date.now() - s.lastUsed > idle) void this.close(id);
    }, 60_000);
    this.sweeper.unref();
  }

  get available() {
    return !!this.opts.executablePath;
  }

  /** The egress proxy (started on first use), also used by task containers in container mode. */
  egress() {
    return this.opts.egress();
  }

  private async wrapper(): Promise<string> {
    const p = join(this.opts.runtimeDir, "aatmiq-chromium");
    await mkdir(this.opts.runtimeDir, { recursive: true });
    await writeFile(
      p,
      `#!/bin/sh\nexec setpriv --reuid="$AATMIQ_BROWSER_UID" --regid="$AATMIQ_BROWSER_UID" --clear-groups -- "$AATMIQ_BROWSER_BIN" "$@"\n`,
      { mode: 0o755 },
    );
    return p;
  }

  private async start(taskId: string, target: BrowserTarget): Promise<Session> {
    if (!this.opts.executablePath)
      throw new BrowserError("The browser isn't installed on this server. Ask your admin.");
    const egress = await this.opts.egress();
    const dirs = {
      data: join(target.profileDir, "data"),
      home: join(target.profileDir, "home"),
      cache: join(target.profileDir, "cache"),
      config: join(target.profileDir, "config"),
    };
    for (const d of Object.values(dirs)) await mkdir(d, { recursive: true, mode: 0o700 });
    // Chromium puts sockets in TMPDIR; a task folder's path is too long for them, so use /tmp.
    const tmp = await mkdtemp(join(existsSync("/tmp") ? "/tmp" : tmpdir(), "aatmiq-br-"));
    if (target.uid !== undefined)
      for (const d of [target.profileDir, ...Object.values(dirs), tmp])
        await chown(d, target.uid, target.uid);
    const asUser = target.uid !== undefined && process.getuid?.() === 0;
    const context = await chromium
      .launchPersistentContext(dirs.data, {
        executablePath: asUser ? await this.wrapper() : this.opts.executablePath,
        headless: true,
        // Chromium's own sandbox needs user namespaces, which containers usually lack; the task's
        // own Unix user and the egress proxy are the boundary here.
        chromiumSandbox: false,
        proxy: { server: egress.url, bypass: "<-loopback>" },
        viewport: { width: 1280, height: 900 },
        acceptDownloads: true,
        locale: "en-US",
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: dirs.home,
          XDG_CACHE_HOME: dirs.cache,
          XDG_CONFIG_HOME: dirs.config,
          TMPDIR: tmp,
          ...(asUser
            ? {
                AATMIQ_BROWSER_UID: String(target.uid),
                AATMIQ_BROWSER_BIN: this.opts.executablePath,
              }
            : {}),
        },
        args: ["--disable-dev-shm-usage", "--no-first-run", "--disable-features=ServiceWorker"],
      })
      .catch(async (e: unknown) => {
        await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
        throw e;
      });
    context.setDefaultTimeout(ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    // Only web pages: no file://, chrome:// or other schemes, whatever a page links to.
    await context.route(/^(?!https?:|data:|blob:|about:)/i, (route) => route.abort("accessdenied"));
    await context.addInitScript(CANVAS_TEXT_HOOK);
    // The task's own files, for trying what the agent built. Nothing under task.local reaches the network.
    await context.route(`${LOCAL_ORIGIN}/**`, async (route) => {
      const file = await localFile(target.workdir, new URL(route.request().url()).pathname);
      if (!file) return route.fulfill({ status: 404, contentType: "text/plain; charset=utf-8", body: "Not found in the task folder." });
      await route.fulfill({ status: 200, contentType: LOCAL_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", body: await readFile(file) });
    });
    const page = context.pages()[0] ?? (await context.newPage());
    const s: Session = {
      context,
      tmp,
      page,
      target,
      egress,
      downloads: [],
      blocked: null,
      errors: [],
      lastUsed: Date.now(),
    };
    const error = (text: string) => {
      if (s.errors.length < MAX_ERRORS) s.errors.push(text.slice(0, ERROR_CHARS));
    };
    const watch = (p: Page) => {
      p.on("response", (r) => {
        const why = r.headers()["x-aatmiq-blocked"];
        if (why && r.request().isNavigationRequest())
          s.blocked = { host: new URL(r.url()).hostname, reason: decodeURIComponent(why) };
      });
      p.on("pageerror", (e) => error(e.stack?.split("\n").slice(0, 2).join(" ") || e.message));
      p.on("console", (m) => {
        if (m.type() === "error") error(m.text());
      });
    };
    watch(page);
    context.on("page", watch);
    context.on("page", (p) => {
      // A link that opens a new tab: follow it in the same view.
      s.page = p;
    });
    context.on("close", () => this.sessions.delete(taskId));
    const onDownload = async (d: import("playwright-core").Download) => {
      try {
        const dir = join(target.workdir, "downloads");
        await mkdir(dir, { recursive: true });
        const file = join(
          dir,
          d
            .suggestedFilename()
            .replace(/[/\\\0]/g, "_")
            .slice(0, 120) || "download",
        );
        await d.saveAs(file);
        if (target.uid !== undefined)
          await chown(dir, target.uid, target.uid).then(() =>
            chown(file, target.uid!, target.uid!),
          );
        s.downloads.push(relative(target.workdir, file));
      } catch (e) {
        this.opts.log?.("browser: saving a download failed", e);
      }
    };
    context.on("page", (p) => p.on("download", (d) => void onDownload(d)));
    page.on("download", (d) => void onDownload(d));
    this.sessions.set(taskId, s);
    return s;
  }

  private async session(taskId: string, target: () => Promise<BrowserTarget>): Promise<Session> {
    const have = this.sessions.get(taskId);
    if (have) {
      have.lastUsed = Date.now();
      return have;
    }
    let p = this.starting.get(taskId);
    if (!p) {
      p = target().then((t) => this.start(taskId, t));
      this.starting.set(taskId, p);
      p.finally(() => this.starting.delete(taskId)).catch(() => undefined);
    }
    return p;
  }

  private refused(host: string, reason: string): never {
    throw new BrowserError(
      `The browser can't open ${host}: ${reason}. Pages on the organization's private network are off limits unless an admin allows them.`,
    );
  }

  private async view(s: Session): Promise<PageView> {
    await s.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    if (s.blocked) {
      const b = s.blocked;
      s.blocked = null;
      this.refused(b.host, b.reason);
    }
    if (s.page.url().startsWith("chrome-error://")) {
      const last = s.egress.lastBlock();
      if (last && Date.now() - last.at < 15_000) this.refused(last.host, last.reason);
      throw new BrowserError("The page couldn't be loaded.");
    }
    // Give scripts a moment to render; never wait long for pages that keep connections open.
    await s.page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => undefined);
    const text = ((await s.page.evaluate(SNAPSHOT).catch(() => "")) as string) || "";
    const downloads = s.downloads.splice(0);
    const errors = s.errors.splice(0);
    const canvasText = s.page.url().startsWith(`${LOCAL_ORIGIN}/`)
      ? (((await s.page
          .evaluate(
            ([ms, max]) => {
              const seen = (window as unknown as { __aatmiqCanvasText?: Map<string, { x: number; y: number; at: number }> }).__aatmiqCanvasText;
              if (!seen) return [];
              const newest = Math.max(...[...seen.values()].map((v) => v.at));
              return [...seen.entries()]
                .filter(([, v]) => newest - v.at <= ms)
                .slice(-max)
                .map(([t, v]) => `${t.slice(0, 80)} at ${v.x},${v.y}`);
            },
            [CANVAS_TEXT_MS, MAX_CANVAS_TEXTS] as const,
          )
          .catch(() => [])) as string[]))
      : [];
    return {
      url: s.page.url(),
      title: await s.page.title().catch(() => ""),
      text: text.slice(0, MAX_TEXT),
      truncated: text.length > MAX_TEXT,
      downloads,
      ...(errors.length ? { errors } : {}),
      ...(canvasText.length ? { canvasText } : {}),
    };
  }

  private async explain(e: unknown, url?: string): Promise<never> {
    const msg = e instanceof Error ? e.message : String(e);
    if (url) {
      const egress = await this.opts.egress();
      const host = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "";
        }
      })();
      const why = host ? egress.recentBlock(host) : null;
      if (why) this.refused(host, why);
    }
    if (/ERR_NAME_NOT_RESOLVED/.test(msg))
      throw new BrowserError("That address couldn't be found.");
    if (/Timeout/i.test(msg)) throw new BrowserError("The page took too long to respond.");
    if (/ERR_ACCESS_DENIED|ERR_BLOCKED/.test(msg))
      throw new BrowserError("That address can't be opened in the browser.");
    throw new BrowserError(
      msg
        .split("\n")[0]!
        .replace(/^[a-zA-Z.]+: /, "")
        .slice(0, 300),
    );
  }

  private element(s: Session, ref: number) {
    if (!Number.isInteger(ref) || ref < 1)
      throw new BrowserError("Use an element number from the last page view, like 3.");
    return s.page.locator(`[data-aatmiq-ref="${ref}"]`).first();
  }

  private async exists(s: Session, ref: number) {
    const el = this.element(s, ref);
    if ((await el.count()) === 0)
      throw new BrowserError(
        `There's no element [${ref}] on the page any more. Look at the latest page view and use its numbers.`,
      );
    return el;
  }

  /**
   * A page from the task folder as its task.local address: a path in the folder
   * (`game/index.html`), a file:// address inside it, or task.local itself. Null for anything else.
   */
  private async localAddress(url: string, target: () => Promise<BrowserTarget>): Promise<string | null> {
    if (url.startsWith(`${LOCAL_ORIGIN}/`) || url === LOCAL_ORIGIN) return url;
    const { workdir } = await target();
    let rel: string | null = null;
    if (/^file:/i.test(url)) {
      let path: string;
      try {
        path = fileURLToPath(url);
      } catch {
        throw new BrowserError("That isn't a file address.");
      }
      const root = await realpath(workdir).catch(() => workdir);
      rel = relative(root, path);
      if (rel.startsWith("..") || rel.startsWith(sep)) throw new BrowserError("Only files in your working folder can be opened.");
    } else if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      const candidate = url.replace(/^\.?\//, "");
      if (await localFile(workdir, `/${candidate}`)) rel = candidate;
    }
    if (rel === null) return null;
    return `${LOCAL_ORIGIN}/${rel.split(sep).map(encodeURIComponent).join("/")}`;
  }

  /** Keys and clicks at a point only on pages from the task folder: elsewhere they could submit a form unasked. */
  private local(s: Session) {
    if (!s.page.url().startsWith(`${LOCAL_ORIGIN}/`))
      throw new BrowserError("This works on pages from your working folder only: open one with browser_open and its path, like game/index.html.");
  }

  async open(taskId: string, target: () => Promise<BrowserTarget>, url: string): Promise<PageView> {
    const local = await this.localAddress(url, target);
    let u: URL;
    try {
      u = new URL(local ?? (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`));
    } catch {
      throw new BrowserError("That isn't a web address.");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:")
      throw new BrowserError("Only http and https pages can be opened.");
    const s = await this.session(taskId, target);
    try {
      await s.page.goto(u.href, { waitUntil: "domcontentloaded" });
    } catch (e) {
      await this.explain(e, u.href);
    }
    return this.view(s);
  }

  async click(
    taskId: string,
    target: () => Promise<BrowserTarget>,
    ref: number,
    confirmSubmit: boolean,
  ): Promise<PageView> {
    const s = await this.session(taskId, target);
    const el = await this.exists(s, ref);
    if (!confirmSubmit && (await submits(s.page, ref, false)))
      throw new BrowserError(
        `[${ref}] submits a form. If that's what the task needs, call browser_click again with confirm_submit: true.`,
      );
    try {
      await el.click();
    } catch (e) {
      await this.explain(e, s.page.url());
    }
    return this.view(s);
  }

  async type(
    taskId: string,
    target: () => Promise<BrowserTarget>,
    ref: number,
    text: string,
    submit: boolean,
    confirmSubmit: boolean,
  ): Promise<PageView> {
    const s = await this.session(taskId, target);
    const el = await this.exists(s, ref);
    if (submit && !confirmSubmit && (await submits(s.page, ref, true)))
      throw new BrowserError(
        `Pressing Enter in [${ref}] submits a form. If that's what the task needs, call browser_type again with confirm_submit: true.`,
      );
    try {
      await el.fill(text);
      if (submit) await el.press("Enter");
    } catch (e) {
      await this.explain(e, s.page.url());
    }
    return this.view(s);
  }

  async select(
    taskId: string,
    target: () => Promise<BrowserTarget>,
    ref: number,
    option: string,
  ): Promise<PageView> {
    const s = await this.session(taskId, target);
    const el = await this.exists(s, ref);
    try {
      await el.selectOption({ label: option }).catch(() => el.selectOption(option));
    } catch (e) {
      await this.explain(e);
    }
    return this.view(s);
  }

  /** Press a key (held for `holdMs`, as a player holds the gas) on a page from the task folder. */
  async press(taskId: string, target: () => Promise<BrowserTarget>, key: string, holdMs: number): Promise<PageView> {
    const s = await this.session(taskId, target);
    this.local(s);
    if (!/^(?:(?:Shift|Control|Alt|Meta)\+)*[A-Za-z0-9]{1,20}$/.test(key))
      throw new BrowserError("Name one key, like ArrowRight, Enter, Space, KeyW or Shift+Tab.");
    try {
      // A plain press lasts as long as a person's: a game that reads keys once a frame misses an instant one.
      if (holdMs > 0) {
        await s.page.keyboard.down(key);
        await s.page.waitForTimeout(holdMs);
        await s.page.keyboard.up(key);
      } else await s.page.keyboard.press(key, { delay: 100 });
      await s.page.waitForTimeout(300);
    } catch (e) {
      await this.explain(e);
    }
    return this.view(s);
  }

  /** Click at a point of the viewport (CSS pixels) on a page from the task folder, for canvas apps and games. */
  async clickAt(taskId: string, target: () => Promise<BrowserTarget>, x: number, y: number): Promise<PageView> {
    const s = await this.session(taskId, target);
    this.local(s);
    try {
      await s.page.mouse.click(x, y);
      await s.page.waitForTimeout(300);
    } catch (e) {
      await this.explain(e);
    }
    return this.view(s);
  }

  /**
   * Evaluate a JavaScript expression in a page from the task folder (its state: the current scene,
   * a score, whether a function exists) and return its value as JSON, with the page view.
   */
  async evaluate(taskId: string, target: () => Promise<BrowserTarget>, expression: string): Promise<PageView> {
    const s = await this.session(taskId, target);
    this.local(s);
    let result: string;
    try {
      const run = s.page.evaluate(async (expr) => {
        const value = await (0, eval)(expr);
        if (value === undefined) return "undefined";
        try {
          return JSON.stringify(value, (_k, v) => (typeof v === "function" ? `[function ${v.name || ""}]` : v), 1) ?? String(value);
        } catch {
          return String(value);
        }
      }, expression);
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new BrowserError(`The expression didn't finish in ${EVAL_TIMEOUT_MS / 1000} seconds.`)), EVAL_TIMEOUT_MS));
      result = await Promise.race([run, timeout]);
    } catch (e) {
      if (e instanceof BrowserError) throw e;
      throw new BrowserError(`The expression failed: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]!.replace(/^page\.evaluate: /, "").slice(0, 300)}`);
    }
    return { ...(await this.view(s)), result: result.length > EVAL_CHARS ? `${result.slice(0, EVAL_CHARS)}… (${result.length - EVAL_CHARS} more characters)` : result };
  }

  async back(taskId: string, target: () => Promise<BrowserTarget>): Promise<PageView> {
    const s = await this.session(taskId, target);
    await s.page.goBack().catch(() => undefined);
    return this.view(s);
  }

  /** The page's text from `offset` (for pages longer than one view). */
  async read(
    taskId: string,
    target: () => Promise<BrowserTarget>,
    offset: number,
  ): Promise<PageView & { offset: number; total: number }> {
    const s = await this.session(taskId, target);
    const v = await this.view(s);
    const full = ((await s.page.evaluate(SNAPSHOT).catch(() => "")) as string) || "";
    const start = Math.max(0, Math.min(offset, full.length));
    return {
      ...v,
      text: full.slice(start, start + MAX_TEXT),
      truncated: start + MAX_TEXT < full.length,
      offset: start,
      total: full.length,
    };
  }

  /** Saves a PNG in the task folder and returns its path relative to it. */
  async screenshot(
    taskId: string,
    target: () => Promise<BrowserTarget>,
    fullPage: boolean,
  ): Promise<{ file: string; url: string; title: string }> {
    const s = await this.session(taskId, target);
    const dir = join(s.target.workdir, "screenshots");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
    await s.page.screenshot({ path: file, fullPage });
    if (s.target.uid !== undefined) {
      await chown(dir, s.target.uid, s.target.uid);
      await chown(file, s.target.uid, s.target.uid);
    }
    return {
      file: relative(s.target.workdir, file),
      url: s.page.url(),
      title: await s.page.title().catch(() => ""),
    };
  }

  async close(taskId: string) {
    const s = this.sessions.get(taskId);
    this.sessions.delete(taskId);
    await s?.context.close().catch(() => undefined);
    if (s) await rm(s.tmp, { recursive: true, force: true }).catch(() => undefined);
  }

  async closeAll() {
    clearInterval(this.sweeper);
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
}
