/**
 * Open a page the way a person does: straight from the folder (file://), with a real browser, and report what broke.
 * This is the check the expense tracker and the game failed (JavaScript modules and file reads are blocked on file://).
 */
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EvalError } from "./errors.mjs";

const here = new URL(".", import.meta.url);

function playwright() {
  for (const base of ["../../apps/api/package.json", "../../package.json"]) {
    try {
      return createRequire(new URL(base, here))("playwright-core");
    } catch {
      /* try the next place */
    }
  }
  throw new EvalError("playwright-core isn't installed (run pnpm install); the browser checks can't run");
}

/** A Chromium to start: BROWSER_PATH, one under /opt/pw-browsers, or Playwright's own. */
export function browserPath() {
  if (process.env.BROWSER_PATH && existsSync(process.env.BROWSER_PATH)) return process.env.BROWSER_PATH;
  const root = "/opt/pw-browsers";
  if (existsSync(root)) {
    for (const d of readdirSync(root).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
      for (const rel of ["chrome-linux/chrome", "chrome-linux64/chrome"]) if (existsSync(join(root, d, rel))) return join(root, d, rel);
    }
    if (existsSync(join(root, "chromium", "chrome"))) return join(root, "chromium", "chrome");
  }
  return undefined;
}

/**
 * Open `file` (an absolute path) and run `body({ page, errors })`. `errors` collects uncaught script errors and console
 * errors as they happen. Returns what body returned; the browser is always closed.
 */
export async function withPage(file, body, { viewport = { width: 1280, height: 800 }, settleMs = 600 } = {}) {
  const { chromium } = playwright();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: browserPath(), args: ["--no-sandbox"] });
  } catch (e) {
    throw new EvalError(`no browser could be started (${String(e.message).split("\n")[0]})`);
  }
  try {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    page.on("console", (m) => m.type() === "error" && errors.push(String(m.text()).slice(0, 200)));
    await page.goto(pathToFileURL(file).href);
    await page.waitForTimeout(settleMs);
    return await body({ page, errors });
  } finally {
    await browser.close();
  }
}
