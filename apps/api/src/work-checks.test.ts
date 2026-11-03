/**
 * The checks of a build task that code decides. The bad inputs are the ones live runs produced.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { librarySkill } from "@aatmiq/skills";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserService, findChromium } from "./services/browser";
import { startEgressProxy, type EgressProxy } from "./services/egress";
import { CONSISTENCY_ID, HYGIENE_ID, parseCsv, runChecks, strayFiles } from "./services/work-checks";
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

describe("leftovers in a folder of office files", () => {
  it("the scripts, backups, outlines and pictures made on the way are leftovers; the files asked for and scratch/ are not", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stray-office-"));
    await mkdir(join(dir, "scratch"), { recursive: true });
    await mkdir(join(dir, "tmp"), { recursive: true });
    for (const f of ["Sales.xlsx", "Review.pptx", "README.md", "scratch/make.py", "verify_fix2.py", "Sales.xlsx.backup", "outline.md", "chart.png", "tmp/x.txt", ".task/state.json"]) {
      await mkdir(join(dir, f, ".."), { recursive: true });
      await writeFile(join(dir, f), "x");
    }
    const office = listOf({ kind: "office_audit", path: "Sales.xlsx" }, { kind: "office_audit", path: "Review.pptx" });
    expect((await strayFiles(dir, office)).sort()).toEqual(["Sales.xlsx.backup", "chart.png", "outline.md", "tmp/", "verify_fix2.py"]);
    // A software job keeps its code at the top of the folder.
    const software = listOf({ kind: "path_exists", path: "index.html" }, { kind: "office_audit", path: "Sales.xlsx" });
    expect(await strayFiles(dir, software)).toEqual([]);
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

/* ───────────── Excel, PowerPoint and Word files (the Northwind run's defects, as files) ───────────── */

const py = (code: string, ...args: string[]) => execFileSync("python3", ["-c", code, ...args], { encoding: "utf8", timeout: 120_000 });
const hasPython = (() => {
  try {
    py("import openpyxl, pptx, docx");
    return true;
  } catch {
    return false;
  }
})();
const skillScript = (skill: string, script: string) => join(librarySkill(skill)!.dir, "scripts", script);

(hasPython ? describe : describe.skip)("the audit of documents", () => {
  it("fails a workbook that shows 9.37 as 937%, passes one that stores a fraction", async () => {
    const dir = await mkdtemp(join(tmpdir(), "office-x-"));
    py(
      `import sys, openpyxl
for name, v in (("bad.xlsx", 9.37), ("good.xlsx", 0.0937)):
    wb = openpyxl.Workbook(); ws = wb.active; ws.append(["Order", "Discount %"]); ws.append([1, v]); ws["B2"].number_format = "0.0%"
    wb.save(sys.argv[1] + "/" + name)`,
      dir,
    );
    const a = listOf({ kind: "office_audit", path: "bad.xlsx" }, { kind: "office_audit", path: "good.xlsx" }, { kind: "office_audit", path: "missing.xlsx" });
    const by = Object.fromEntries((await runChecks(a, { workdir: dir, browserKey: "k", profileDir: join(dir, "p") })).map((r) => [r.id, r]));
    expect(by.R1).toMatchObject({ status: "fail" });
    expect(by.R1!.observed).toContain("formatted as percent");
    expect(by.R1!.observed).toContain("937%");
    expect(by.R2).toMatchObject({ status: "pass" });
    expect(by.R3).toMatchObject({ status: "fail", observed: "missing.xlsx isn't in the working folder" });
  }, 120_000);

  it("fails a deck with a chart on its table and no speaker notes; passes the deck the skill builds", async () => {
    const dir = await mkdtemp(join(tmpdir(), "office-p-"));
    py(
      `import sys
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches
prs = Presentation(); s = prs.slides.add_slide(prs.slide_layouts[5]); s.shapes.title.text = "Revenue by region"
s.shapes.add_table(4, 3, Inches(0.5), Inches(1.5), Inches(6), Inches(2)); cd = CategoryChartData(); cd.categories = ["A", "B"]; cd.add_series("R", [1, 2])
s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(2), Inches(5), Inches(3), cd)
prs.save(sys.argv[1] + "/bad.pptx")`,
      dir,
    );
    await writeFile(join(dir, "outline.md"), "# Review\nSample data\n> Welcome.\n\n## West leads at 4.5M\n- Central follows\n```chart bar \"Revenue\"\nWest, 4527582\nCentral, 3988472\n```\n> Notes here.\n");
    execFileSync("python3", [skillScript("presentations", "outline_to_pptx.py"), join(dir, "outline.md"), join(dir, "good.pptx")], { timeout: 60_000 });
    const a = listOf({ kind: "office_audit", path: "bad.pptx", require: ["notes", "charts:1"] }, { kind: "office_audit", path: "good.pptx", require: ["notes", "charts:1", "slides:2-2"] });
    const by = Object.fromEntries((await runChecks(a, { workdir: dir, browserKey: "k", profileDir: join(dir, "p") })).map((r) => [r.id, r]));
    expect(by.R1).toMatchObject({ status: "fail" });
    expect(by.R1!.observed).toContain("overlaps");
    expect(by.R1!.observed).toContain("speaker notes are missing");
    expect(by.R2).toMatchObject({ status: "pass" });
  }, 120_000);

  it("fails a typed table of contents and a leaked template, passes the report the skill builds", async () => {
    const dir = await mkdtemp(join(tmpdir(), "office-d-"));
    py(
      `import sys
from docx import Document
d = Document(); d.add_heading("Report", 1); d.add_paragraph("Table of Contents")
for t, n in (("Summary", 2), ("Regions", 3), ("Risks", 4)): d.add_paragraph(f"{t}..........................{n}")
d.add_heading("Summary", 1); d.add_paragraph("Generated: {datetime.now().strftime('%d %B %Y')}")
d.save(sys.argv[1] + "/bad.docx")`,
      dir,
    );
    await writeFile(join(dir, "report.md"), "# Sales report\nSample data\n\n---\n## Contents\n[TOC]\n---\n## Summary\nWest led.\n\n1. One\n2. Two\n\n## Risks\n1. Again from one\n");
    execFileSync("python3", [skillScript("word-documents", "md_to_docx.py"), join(dir, "report.md"), join(dir, "good.docx"), "--title", "Sales report", "--cover"], { timeout: 180_000 });
    const a = listOf({ kind: "office_audit", path: "bad.docx", require: ["toc"] }, { kind: "office_audit", path: "good.docx", require: ["toc", "page_numbers", "header_title"] });
    const by = Object.fromEntries((await runChecks(a, { workdir: dir, browserKey: "k", profileDir: join(dir, "p") })).map((r) => [r.id, r]));
    expect(by.R1).toMatchObject({ status: "fail" });
    expect(by.R1!.observed).toContain("typed text");
    expect(by.R1!.observed).toContain("datetime.now()");
    expect(by.R2).toMatchObject({ status: "pass" });
  }, 240_000);

  it("a figure the workbook doesn't have, or a 0.0%, fails the figures check; the workbook's own figures pass", async () => {
    const dir = await mkdtemp(join(tmpdir(), "office-f-"));
    py(
      `import sys, openpyxl
from pptx import Presentation
from pptx.util import Inches
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Summary"; ws.append(["Region", "Revenue"]); ws.append(["West", 4527582]); ws.append(["North", 3593890]); wb.save(sys.argv[1] + "/Sales.xlsx")
for name, text in (("ok.pptx", "West earned 4,527,582 and North 3,593,890"), ("bad.pptx", "Overall achievement of 0.0% against targets")):
    prs = Presentation(); s = prs.slides.add_slide(prs.slide_layouts[5]); s.shapes.title.text = "Revenue"
    s.shapes.add_textbox(Inches(1), Inches(2), Inches(6), Inches(1)).text_frame.text = text; prs.save(sys.argv[1] + "/" + name)`,
      dir,
    );
    const run = (deck: string) => runChecks(listOf({ kind: "office_audit", path: "Sales.xlsx" }, { kind: "office_audit", path: deck }), { workdir: dir, browserKey: "k", profileDir: join(dir, "p") });
    const ok = (await run("ok.pptx")).find((r) => r.id === CONSISTENCY_ID);
    expect(ok).toMatchObject({ status: "pass" });
    const bad = (await run("bad.pptx")).find((r) => r.id === CONSISTENCY_ID);
    expect(bad).toMatchObject({ status: "fail" });
    expect(bad!.observed).toContain('"0.0%" looks like a failed calculation');
  }, 120_000);
});
