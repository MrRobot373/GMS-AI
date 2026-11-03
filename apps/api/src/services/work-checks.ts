/**
 * Checks of a build task that code decides, not a model (docs/19-work-ai-reliability-plan.md):
 * a named file or folder is there, a data file parses, a page loads with no script errors, and
 * nothing is left in the folder that only said "done". They run before any reviewer: they are
 * fast, free, and can't be talked round.
 */
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import vm from "node:vm";
import type { BrowserService } from "./browser";
import type { Acceptance, AcceptanceItem } from "./work-spec";

export interface CheckResult {
  id: string;
  status: "pass" | "fail";
  /** What was seen (a fail: what is wrong, specific enough to fix from). */
  observed: string;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** The real path of `rel` inside `root`, links followed; null when it isn't there or leads outside. */
async function inside(root: string, rel: string): Promise<string | null> {
  const base = await realpath(root).catch(() => null);
  const real = base ? await realpath(join(base, rel)).catch(() => null) : null;
  return base && real && (real === base || real.startsWith(base + sep)) ? real : null;
}

/* ───────────── CSV ───────────── */

/**
 * A strict read of CSV (RFC 4180): rows of fields, or what is wrong with the file. Catches the ways
 * generated exports go wrong: a quote that opens a field and never closes where it should, text
 * right after a closing quote, a quote in the middle of an unquoted field, an unterminated quote,
 * and rows with a different number of fields from the header (one character per line, for one).
 */
export function parseCsv(text: string): { rows: string[][] } | { error: string } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  const line = () => rows.length + 1;
  while (i < text.length) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        const next = text[i + 1];
        if (next !== undefined && next !== "," && next !== "\n" && next !== "\r") return { error: `row ${line()}: text right after a closing quote ("${text.slice(Math.max(0, i - 12), i + 12).replace(/\r?\n/g, "⏎")}")` };
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (field !== "") return { error: `row ${line()}: a quote in the middle of a field ("${text.slice(Math.max(0, i - 12), i + 12).replace(/\r?\n/g, "⏎")}")` };
      quoted = true;
      i++;
    } else if (c === ",") {
      endField();
      i++;
    } else if (c === "\r" || c === "\n") {
      endRow();
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (quoted) return { error: `a quote opened in row ${line()} is never closed` };
  if (field !== "" || row.length) endRow();
  const width = rows[0]?.length ?? 0;
  const odd = rows.findIndex((r) => r.length !== width);
  if (rows.length && odd > 0) return { error: `row ${odd + 1} has ${rows[odd]!.length} field(s), the header has ${width}` };
  return { rows };
}

/* ───────────── HTML ───────────── */

/** A page's own problems: files it names that aren't there, and text that would show on the page by mistake. */
async function htmlProblems(file: string, text: string, root: string): Promise<string[]> {
  const problems: string[] = [];
  const noComments = text.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<(html|body)\b/i.test(text) && !/<!doctype/i.test(text)) problems.push("it isn't an HTML page (no <html>, <body> or doctype)");
  // "-->" left after the comments are removed is a broken comment: its end shows as text.
  if (noComments.includes("-->")) problems.push('a broken comment shows "-->" as text on the page');
  if (/<!--/.test(noComments)) problems.push("a comment is opened and never closed, which hides the rest of the page");
  for (const m of text.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi)) {
    const ref = m[1]!;
    if (/^([a-z][a-z0-9+.-]*:|\/\/|data:)/i.test(ref)) continue;
    const target = ref.startsWith("/") ? ref.slice(1) : join(relative(root, dirname(file)), ref);
    if (!(await inside(root, target))) problems.push(`it uses ${ref}, which isn't in the folder`);
  }
  return [...new Set(problems)].slice(0, 6);
}

/* ───────────── The checks ───────────── */

/** A script's syntax, when it isn't a module (an import or export can't be checked here). */
function jsProblem(code: string): string | null {
  try {
    new vm.Script(code);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return /import|export|module/i.test(msg) && /\b(import|export)\b/.test(code) ? null : msg.split("\n")[0]!.slice(0, 160);
  }
}

async function runOne(item: AcceptanceItem, o: { workdir: string; browser?: BrowserService; browserKey: string; profileDir: string; uid?: number }): Promise<CheckResult | null> {
  const c = item.check;
  if (c.kind === "judged") return null;
  if (c.kind === "path_exists") {
    const real = await inside(o.workdir, c.path);
    return real ? { id: item.id, status: "pass", observed: `${c.path} is there` } : { id: item.id, status: "fail", observed: `${c.path} isn't in the working folder` };
  }
  if (c.kind === "file_parses") {
    const real = await inside(o.workdir, c.path);
    const info = real ? await stat(real).catch(() => null) : null;
    if (!real || !info?.isFile()) return { id: item.id, status: "fail", observed: `${c.path} isn't in the working folder` };
    if (info.size > MAX_FILE_BYTES) return { id: item.id, status: "pass", observed: `${c.path} is too big to check here (${info.size} bytes)` };
    const text = await readFile(real, "utf8");
    if (c.format === "json") {
      try {
        JSON.parse(text);
        return { id: item.id, status: "pass", observed: `${c.path} is valid JSON` };
      } catch (e) {
        return { id: item.id, status: "fail", observed: `${c.path} isn't valid JSON: ${(e instanceof Error ? e.message : "").slice(0, 120)}` };
      }
    }
    if (c.format === "csv") {
      const r = parseCsv(text);
      return "error" in r ? { id: item.id, status: "fail", observed: `${c.path} isn't a valid CSV: ${r.error}` } : { id: item.id, status: "pass", observed: `${c.path} is a valid CSV with ${r.rows.length} row(s)` };
    }
    if (c.format === "js") {
      const p = jsProblem(text);
      return p ? { id: item.id, status: "fail", observed: `${c.path} has a syntax error: ${p}` } : { id: item.id, status: "pass", observed: `${c.path} has no syntax errors` };
    }
    const problems = await htmlProblems(real, text, o.workdir);
    return problems.length ? { id: item.id, status: "fail", observed: `${c.path}: ${problems.join("; ")}` } : { id: item.id, status: "pass", observed: `${c.path} is a sound HTML page` };
  }
  // page_loads_clean: opened in the browser, as a person would
  if (!o.browser) return null;
  try {
    const v = await o.browser.open(o.browserKey, async () => ({ workdir: o.workdir, profileDir: o.profileDir, uid: o.uid }), c.page);
    if (v.errors?.length) return { id: item.id, status: "fail", observed: `${c.page} opens with script errors: ${v.errors.slice(0, 3).join(" | ")}` };
    if (!v.text.trim() && !v.canvasText?.length) return { id: item.id, status: "fail", observed: `${c.page} opens as a blank page` };
    return { id: item.id, status: "pass", observed: `${c.page} opens with no script errors` };
  } catch (e) {
    return { id: item.id, status: "fail", observed: `${c.page} can't be opened: ${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}` };
  }
}

/** Files that only said "done" or were used to try things, left in the folder the person gets. */
const SIGNAL_FILE = /^(done|finish(ed)?|complete(d)?|completed|success|status|result|summary|test\d*|tmp|temp|debug|scratch\d*)(\.(txt|md|html?|json|log))?$/i;
const SIGNAL_PAGE = /^(test|debug|check|tmp|temp)[-_]?\w*\.html?$/i;

/**
 * Leftovers in the working folder (top level and one folder down): signal files and test pages
 * the checklist doesn't name, and a README the request asked for being the only exception.
 */
export async function strayFiles(workdir: string, a: Acceptance): Promise<string[]> {
  const named = new Set(a.items.flatMap((i) => ("path" in i.check ? [i.check.path.toLowerCase()] : "page" in i.check ? [i.check.page.toLowerCase()] : [])));
  const out: string[] = [];
  const look = async (dir: string, depth: number) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith(".") || ["node_modules", "scratch", "downloads", "screenshots", "vendor"].includes(e.name)) continue;
      const rel = relative(workdir, join(dir, e.name)).split(sep).join("/");
      if (e.isDirectory()) {
        if (depth < 1) await look(join(dir, e.name), depth + 1);
      } else if ((SIGNAL_FILE.test(e.name) || SIGNAL_PAGE.test(e.name)) && !named.has(rel.toLowerCase()) && !/^readme/i.test(e.name)) out.push(rel);
    }
  };
  await look(workdir, 0);
  return out.slice(0, 10);
}

/** The id the leftovers check goes by in a review (it isn't one of the request's requirements). */
export const HYGIENE_ID = "H1";
export const HYGIENE_TEXT = "No leftover files that only signal \"done\" or were used to test (DONE, finish.txt, test pages)";

/**
 * Run the checks code can decide, for the items of the given stages (all when none given), and
 * the leftovers check. Items that need judging aren't in the result.
 */
export async function runChecks(
  a: Acceptance,
  o: { workdir: string; browser?: BrowserService; browserKey: string; profileDir: string; uid?: number; milestone?: number },
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const item of a.items) {
    if (o.milestone !== undefined && item.milestone > o.milestone) continue;
    const r = await runOne(item, o);
    if (r) results.push(r);
  }
  await o.browser?.close(o.browserKey).catch(() => undefined);
  // The leftovers check belongs to the end of a build, not to its early stages.
  if (o.milestone === undefined || o.milestone >= a.milestones.length) {
    const stray = await strayFiles(o.workdir, a);
    results.push(stray.length ? { id: HYGIENE_ID, status: "fail", observed: `leftover files: ${stray.join(", ")}` } : { id: HYGIENE_ID, status: "pass", observed: "no leftover files" });
  }
  return results;
}
