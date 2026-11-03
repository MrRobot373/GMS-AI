/**
 * The checks of a build task that code decides. The bad inputs are the ones live runs produced.
 */
import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserService, findChromium } from "./services/browser";
import { startEgressProxy, type EgressProxy } from "./services/egress";
import { HYGIENE_ID, parseCsv, runChecks, strayFiles } from "./services/work-checks";
import { buildAcceptance, type Acceptance, type Check } from "./services/work-spec";

describe("reading a CSV strictly", () => {
  it("accepts quoted fields, commas and quotes inside them, and both line endings", () => {
    const r = parseCsv('Date,Amount,Category,Note\r\n2026-10-05,120.5,Travel,"Taxi, airport"\r\n2026-10-20,30,Food,"Lunch ""team"""\n2026-11-03,10,Food,Coffee\n');
    expect(r).toEqual({
      rows: [
        ["Date", "Amount", "Category", "Note"],
        ["2026-10-05", "120.5", "Travel", "Taxi, airport"],
        ["2026-10-20", "30", "Food", 'Lunch "team"'],
        ["2026-11-03", "10", "Food", "Coffee"],
      ],
    });
  });

  it("rejects the export whose every row began with a stray quote", () => {
    const r = parseCsv('Date,Amount,Category,Note\n"2026-10-05,120.5,Travel,"Taxi, airport"\n"2026-10-20,30,Food,"Lunch ""team"""\n');
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toMatch(/right after a closing quote|never closed/);
  });

  it("rejects the export with one character on each line (rows with 1 field under a 4-field header)", () => {
    const r = parseCsv("Date,Amount,Category,Note\r\n2\r\n0\r\n2\r\n6\r\n-\r\n");
    expect((r as { error: string }).error).toBe("row 2 has 1 field(s), the header has 4");
  });

  it("rejects an unclosed quote and a quote in the middle of a field", () => {
    expect((parseCsv('a,b\n"open,1') as { error: string }).error).toContain("never closed");
    expect((parseCsv('a,b\nx"y,1') as { error: string }).error).toContain("quote in the middle of a field");
  });
});

/** A checklist of the given checks, numbered. */
const listOf = (...checks: Check[]): Acceptance =>
  buildAcceptance({ build: true, milestones: [], items: [...checks, { kind: "judged" } as Check, { kind: "judged" } as Check].slice(0, Math.max(3, checks.length)).map((check, i) => ({ requirement: `Requirement ${i + 1}`, check })) })!;

describe("the checks code decides", () => {
  it("path, JSON, CSV, script and page checks pass what is right and say what's wrong", async () => {
    const dir = await mkdtemp(join(tmpdir(), "checks-"));
    await mkdir(join(dir, "expense-tracker/js"), { recursive: true });
    await writeFile(join(dir, "expense-tracker/index.html"), '<!doctype html><html><body><script src="js/app.js"></script><link rel="stylesheet" href="style.css"></body></html>');
    await writeFile(join(dir, "expense-tracker/js/app.js"), "const a = 1;\n");
    await writeFile(join(dir, "data.json"), '{"a": 1}');
    await writeFile(join(dir, "bad.json"), '{"a": ');
    await writeFile(join(dir, "export.csv"), 'a,b\n"x,1\n');
    await writeFile(join(dir, "broken.js"), "function (");
    await writeFile(join(dir, "module.js"), "import x from './x.js';\nexport default x;\n");
    await writeFile(join(dir, "page.html"), "<html><body><p>Table</p>\n-- Expenses Table -->\n</body></html>");
    const a = listOf(
      { kind: "path_exists", path: "expense-tracker/index.html" },
      { kind: "path_exists", path: "expense-tracker" },
      { kind: "path_exists", path: "nope/index.html" },
      { kind: "file_parses", path: "data.json", format: "json" },
      { kind: "file_parses", path: "bad.json", format: "json" },
      { kind: "file_parses", path: "export.csv", format: "csv" },
      { kind: "file_parses", path: "broken.js", format: "js" },
      { kind: "file_parses", path: "module.js", format: "js" },
      { kind: "file_parses", path: "page.html", format: "html" },
      { kind: "file_parses", path: "expense-tracker/index.html", format: "html" },
      { kind: "judged" },
    );
    const results = await runChecks(a, { workdir: dir, browserKey: "k", profileDir: join(dir, "..", "p") });
    const by = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(by.R1).toMatchObject({ status: "pass" });
    expect(by.R2).toMatchObject({ status: "pass" });
    expect(by.R3).toMatchObject({ status: "fail", observed: "nope/index.html isn't in the working folder" });
    expect(by.R4).toMatchObject({ status: "pass" });
    expect(by.R5!.status).toBe("fail");
    expect(by.R6!.observed).toContain("isn't a valid CSV");
    expect(by.R7!.observed).toContain("syntax error");
    expect(by.R8).toMatchObject({ status: "pass" });
    expect(by.R9!.observed).toContain('a broken comment shows "-->" as text');
    // The page names a stylesheet that was never written.
    expect(by.R10!.observed).toContain("it uses style.css, which isn't in the folder");
    // A judged item isn't decided by code.
    expect(by.R11).toBeUndefined();
  });

  it("doesn't follow a link out of the folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "checks-"));
    const outside = await mkdtemp(join(tmpdir(), "outside-"));
    await writeFile(join(outside, "secret.json"), "{}");
    const { symlink } = await import("node:fs/promises");
    await symlink(join(outside, "secret.json"), join(dir, "leak.json"));
    const [r] = await runChecks(listOf({ kind: "path_exists", path: "leak.json" }), { workdir: dir, browserKey: "k", profileDir: join(dir, "p") });
    expect(r).toMatchObject({ id: "R1", status: "fail" });
  });
});

describe("leftover files", () => {
  it("names the files that only said done, and test pages, unless the checklist names them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stray-"));
    await mkdir(join(dir, "app"), { recursive: true });
    await mkdir(join(dir, "scratch"), { recursive: true });
    for (const f of ["app/DONE", "app/finish.txt", "app/test.html", "app/index.html", "README.md", "scratch/test.html", "result.json", "debug.log", "test.csv", "test2.csv", "app/test-import.csv", "app/expenses.csv"]) await writeFile(join(dir, f), "x");
    const a = listOf({ kind: "path_exists", path: "result.json" });
    expect((await strayFiles(dir, a)).sort()).toEqual(["app/DONE", "app/finish.txt", "app/test-import.csv", "app/test.html", "debug.log", "test.csv", "test2.csv"]);
    const results = await runChecks(a, { workdir: dir, browserKey: "k", profileDir: join(dir, "p") });
    expect(results.find((r) => r.id === HYGIENE_ID)).toMatchObject({ status: "fail" });
  });
});

const chrome = findChromium();
(chrome ? describe : describe.skip)("a page opens clean, in the browser", () => {
  let egress: EgressProxy;
  let browser: BrowserService;
  beforeAll(async () => {
    egress = await startEgressProxy({ allowedHosts: () => [], upstream: null, resolve: async () => [] });
    browser = new BrowserService({ executablePath: chrome, egress: async () => egress, runtimeDir: await mkdtemp(join(tmpdir(), "checks-br-")) });
  });
  afterAll(async () => {
    await browser?.closeAll();
    await egress?.close();
    createServer().close();
  });
  it("passes a page that runs and fails one with a script error or nothing on it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "checks-pages-"));
    await writeFile(join(dir, "good.html"), "<!doctype html><title>Good</title><h1>Hello</h1>");
    await writeFile(join(dir, "bad.html"), "<!doctype html><title>Bad</title><h1>Hello</h1><script>RR.Input.mousePos;</script>");
    await writeFile(join(dir, "blank.html"), "<!doctype html><title>Blank</title>");
    const a = listOf({ kind: "page_loads_clean", page: "good.html" }, { kind: "page_loads_clean", page: "bad.html" }, { kind: "page_loads_clean", page: "blank.html" });
    const results = await runChecks(a, { workdir: dir, browser, browserKey: "k1", profileDir: join(dir, "..", "profile-checks") });
    const by = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(by.R1).toMatchObject({ status: "pass" });
    expect(by.R2!.status).toBe("fail");
    expect(by.R2!.observed).toContain("RR is not defined");
    expect(by.R3).toMatchObject({ status: "fail", observed: "blank.html opens as a blank page" });
  }, 60_000);
});
