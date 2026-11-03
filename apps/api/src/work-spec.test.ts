/**
 * The acceptance checklist of a build task: what counts as a build, how a model's draft becomes a
 * checklist (numbering, checks code can run, milestones), and how it's read back to the builder.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Check, acceptanceBrief, applyReview, buildAcceptance, checklistText, isBuildRequest, loadAcceptance, MILESTONE_MIN_ITEMS, safeRelPath, saveAcceptance } from "./services/work-spec";

type Extra = { milestone?: number; how?: string; check?: Check };
const item = (requirement: string, extra: Extra = {}) => ({ requirement, ...extra });
const many = (n: number) => Array.from({ length: n }, (_, i) => item(`Requirement number ${i + 1}`, { milestone: Math.min(4, 1 + Math.floor(i / 3)) }));

describe("what asks for a build", () => {
  it("is a request to make an app, page, game, script or tool; not a question or a document", () => {
    expect(isBuildRequest("Build a small expense tracker web app for our team that I can open straight from a folder")).toBe(true);
    expect(isBuildRequest("Create a Python script that renames the files in a folder by date")).toBe(true);
    expect(isBuildRequest("Write a game in the browser where a truck climbs hills and collects coins")).toBe(true);
    expect(isBuildRequest("What is the difference between a mutex and a semaphore, with an example?")).toBe(false);
    expect(isBuildRequest("Write a letter to the vendor about the late delivery of our order of chairs")).toBe(false);
    expect(isBuildRequest("make a tool")).toBe(false);
    // A long brief that asks for something to be made is a build whatever it's called.
    expect(isBuildRequest(`Develop the following: ${"physics, levels, garage, audio, save data. ".repeat(60)}`)).toBe(true);
  });
});

describe("what asks for files to be made", () => {
  it("is a request for an Excel workbook, a deck or a Word report, not a question about them", () => {
    expect(isBuildRequest("I need a Q3 sales performance pack for our leadership meeting: an Excel workbook, a PowerPoint deck and a Word report.")).toBe(true);
    expect(isBuildRequest("Create a budget spreadsheet (budget.xlsx) for the marketing team with monthly totals")).toBe(true);
    expect(isBuildRequest("Prepare a 10 slide deck on our hiring plan for next quarter")).toBe(true);
    expect(isBuildRequest("How do I make a pivot table in Excel to sum sales by region?")).toBe(false);
    expect(isBuildRequest("What does a PowerPoint transition do and when should I use one")).toBe(false);
  });

  it("keeps an office_audit check for a file in the folder, with only the requirements it knows", () => {
    const a = buildAcceptance({
      build: true,
      milestones: [],
      items: [
        item("The workbook exists with formulas", { check: { kind: "office_audit", path: "Northwind_Q3_Sales.xlsx", require: ["formulas:10", "CHARTS: 2", "notes", "bogus", "pages:6-8"] } }),
        item("The report is 6 to 8 pages", { check: { kind: "office_audit", path: "out/report.docx", require: ["pages:6-8", "toc"] } }),
        item("Not a document", { check: { kind: "office_audit", path: "notes.txt" } }),
        item("Outside the folder", { check: { kind: "office_audit", path: "../secret.xlsx" } }),
      ],
    })!;
    expect(a.items[0]!.check).toEqual({ kind: "office_audit", path: "Northwind_Q3_Sales.xlsx", require: ["formulas:10", "charts:2", "notes", "pages:6-8"] });
    expect(a.items[1]!.check).toMatchObject({ kind: "office_audit", path: "out/report.docx" });
    expect([...(a.items[1]!.check as { require: string[] }).require].sort()).toEqual(["pages:6-8", "toc"]);
    expect(a.items[2]!.check).toEqual({ kind: "judged" });
    expect(a.items[3]!.check).toEqual({ kind: "judged" });
  });
});

describe("files named in a checklist are audited, with what the checklist asks of them", () => {
  // The planner's own wording from the Northwind run (a bare path check for each file, "10‑12" with a non-breaking hyphen).
  const draft = () =>
    buildAcceptance({
      build: true,
      milestones: [{ name: "Workbook" }, { name: "Deck" }, { name: "Report" }],
      items: [
        item("File Northwind_Q3_Sales.xlsx exists", { milestone: 1, check: { kind: "path_exists", path: "Northwind_Q3_Sales.xlsx" } }),
        item("Revenue and margin columns contain formulas, not typed values", { milestone: 1 }),
        item("Workbook includes at least two real Excel charts (revenue by region, monthly trend), a frozen header row, filters on the data", { milestone: 1 }),
        item("File Northwind_Q3_Review.pptx exists", { milestone: 2, check: { kind: "path_exists", path: "Northwind_Q3_Review.pptx" } }),
        item("PowerPoint deck has 10\u201112 slides, uses a consistent theme, short slide text, and speaker notes on every slide", { milestone: 2 }),
        item("PowerPoint uses real Excel charts (not pictures) built from the same numbers as the workbook", { milestone: 2 }),
        item("File Northwind_Q3_Report.docx exists", { milestone: 3, check: { kind: "path_exists", path: "Northwind_Q3_Report.docx" } }),
        item("Word report is about 6\u20118 pages, includes a cover page, table of contents, heading styles, page numbers in the footer, and the document title in the header", { milestone: 3 }),
        item("Every figure in the deck and the report is the same as in the workbook", { milestone: 3 }),
      ],
    })!;

  it("turns a bare path check on an office file into an audit and reads the requirements from the items", () => {
    const a = draft();
    expect(a.items[0]!.check).toEqual({ kind: "office_audit", path: "Northwind_Q3_Sales.xlsx", require: ["charts:2", "formulas:10"] });
    expect(a.items[3]!.check).toEqual({ kind: "office_audit", path: "Northwind_Q3_Review.pptx", require: ["notes", "slides:10-12", "charts:1"] });
    // "about 6-8 pages" allows a page either side.
    expect(a.items[6]!.check).toEqual({ kind: "office_audit", path: "Northwind_Q3_Report.docx", require: ["toc", "page_numbers", "header_title", "pages:5-9"] });
    // The judged items stay judged: the reviewer still tests what code can't.
    expect(a.items[4]!.check).toEqual({ kind: "judged" });
  });

  it("one item per file: the planner's second audit of the same file is merged into the first, and 'about' still allows a page either side", () => {
    const a = buildAcceptance({
      build: true,
      milestones: [],
      items: [
        item("Word report Northwind_Q3_Report.docx exists", { check: { kind: "path_exists", path: "Northwind_Q3_Report.docx" } }),
        item("Document length is about 6 to 8 pages"),
        item("Page numbers appear in the footer and the document title in the header"),
        // The same file again, with its own requirements (and the strict range the planner wrote).
        item("Word file Northwind_Q3_Report.docx passes an office audit for required elements", { check: { kind: "office_audit", path: "Northwind_Q3_Report.docx", require: ["toc", "pages:6-8", "charts:2"] } }),
      ],
    })!;
    expect(a.items).toHaveLength(3);
    const c = a.items[0]!.check;
    expect(c).toMatchObject({ kind: "office_audit", path: "Northwind_Q3_Report.docx" });
    expect((c as { require: string[] }).require.sort()).toEqual(["charts:2", "header_title", "page_numbers", "pages:5-9", "toc"].sort());
  });

  it("keeps what the planner asked for, and leaves ordinary files alone", () => {
    const a = buildAcceptance({
      build: true,
      milestones: [],
      items: [
        item("The deck is saved as deck.pptx with 12 to 14 slides", { check: { kind: "office_audit", path: "deck.pptx", require: ["slides:12-14"] } }),
        item("The app is in index.html", { check: { kind: "path_exists", path: "index.html" } }),
        item("It works"),
      ],
    })!;
    expect(a.items[0]!.check).toEqual({ kind: "office_audit", path: "deck.pptx", require: ["slides:12-14"] });
    expect(a.items[1]!.check).toEqual({ kind: "path_exists", path: "index.html" });
  });
});

describe("a checklist from a model's draft", () => {
  it("numbers the items and keeps checks code can run; one stage for a small brief", () => {
    const a = buildAcceptance({
      build: true,
      milestones: [{ name: "ignored for a small brief" }, { name: "also ignored" }],
      items: [
        item("The app is in a folder called expense-tracker", { check: { kind: "path_exists", path: "expense-tracker/index.html" } }),
        item("The export reads back in", { how: "Export, then import the file", check: { kind: "judged" } }),
        item("The page loads without script errors", { check: { kind: "page_loads_clean", page: "expense-tracker/index.html" } }),
        item("The data file parses", { check: { kind: "file_parses", path: "data/seed.json", format: "json" } }),
      ],
    });
    expect(a?.items.map((i) => i.id)).toEqual(["R1", "R2", "R3", "R4"]);
    expect(a?.milestones).toEqual([{ n: 1, name: "Build" }]);
    expect(a?.items.every((i) => i.milestone === 1 && i.status === "unchecked")).toBe(true);
    expect(a?.items[0]?.check).toEqual({ kind: "path_exists", path: "expense-tracker/index.html" });
    expect(a?.items[1]).toMatchObject({ how: "Export, then import the file", check: { kind: "judged" } });
    expect(a?.items[3]?.check).toEqual({ kind: "file_parses", path: "data/seed.json", format: "json" });
  });

  it("turns a check that points outside the folder, or a page that isn't HTML, into a judged item", () => {
    const a = buildAcceptance({
      build: true,
      milestones: [],
      items: [
        item("Reads the system file", { check: { kind: "path_exists", path: "/etc/passwd" } }),
        item("Reads a parent folder", { check: { kind: "file_parses", path: "../secret.json", format: "json" } }),
        item("The main script loads", { check: { kind: "page_loads_clean", page: "app/main.js" } }),
      ],
    });
    expect(a?.items.map((i) => i.check.kind)).toEqual(["judged", "judged", "judged"]);
    expect(safeRelPath("./a/b.txt")).toBe("a/b.txt");
    expect(safeRelPath("a\\b.txt")).toBe("a/b.txt");
    for (const bad of ["", "/abs", "C:/x", "a/../b", "a//b"]) expect(safeRelPath(bad)).toBeNull();
  });

  it("isn't a checklist when it isn't a build, or has too few items to test", () => {
    expect(buildAcceptance({ build: false, milestones: [], items: many(8) })).toBeNull();
    expect(buildAcceptance({ build: true, milestones: [], items: [item("Only one"), item("Only two")] })).toBeNull();
  });

  it("splits a big brief into stages in the model's order, each with items, numbered from 1", () => {
    const a = buildAcceptance({
      build: true,
      milestones: [{ name: "Data" }, { name: "Physics" }, { name: "Screens" }, { name: "Docs" }],
      items: many(MILESTONE_MIN_ITEMS + 3),
    })!;
    expect(a.milestones.map((m) => m.name)).toEqual(["Data", "Physics", "Screens", "Docs"]);
    expect(a.milestones.map((m) => m.n)).toEqual([1, 2, 3, 4]);
    expect(new Set(a.items.map((i) => i.milestone))).toEqual(new Set([1, 2, 3, 4]));
    expect(a.items.at(0)?.milestone).toBe(1);
    expect(a.items.at(-1)?.milestone).toBe(4);
  });

  it("drops a stage the model named but gave no item, and puts an item with no stage in the last one", () => {
    const a = buildAcceptance({
      build: true,
      milestones: [{ name: "Core" }, { name: "Never used" }, { name: "Polish" }],
      items: [...many(MILESTONE_MIN_ITEMS).map((it) => ({ ...it, milestone: it.milestone === 1 ? 1 : 3 })), item("No stage given")],
    })!;
    expect(a.milestones.map((m) => m.name)).toEqual(["Core", "Polish"]);
    expect(a.items.at(-1)?.milestone).toBe(2);
    expect(a.items.every((i) => i.milestone >= 1 && i.milestone <= 2)).toBe(true);
  });

  it("applies the review pass: what the first call missed is added, what it invented or repeated is removed", () => {
    const draft = { build: true, milestones: [], items: [item("First"), item("Invented"), item("Third")] };
    const merged = applyReview(draft, { add: [item("Missed: the README")], remove: [2] });
    expect(merged.items.map((i) => i.requirement)).toEqual(["First", "Third", "Missed: the README"]);
  });
});

describe("the checklist the builder reads", () => {
  const a = buildAcceptance({
    build: true,
    milestones: [{ name: "Data" }, { name: "Screens" }],
    items: Array.from({ length: MILESTONE_MIN_ITEMS }, (_, i) => item(`Requirement ${i + 1}`, { milestone: i < 4 ? 1 : 2 })),
  })!;

  it("shows each item with its state and what was found when it failed", () => {
    a.items[0]!.status = "pass";
    a.items[1]!.status = "fail";
    a.items[1]!.observed = "the export has one character per line";
    const lines = checklistText(a);
    expect(lines[0]).toBe("- R1 ✓ Requirement 1");
    expect(lines[1]).toBe("- R2 ✗ Requirement 2 (found: the export has one character per line)");
    expect(lines[2]).toBe("- R3 · Requirement 3");
  });

  it("with stages, the current stage's items come first and the rest follow", () => {
    const lines = checklistText(a, 2);
    expect(lines[0]).toBe("This stage, 2 of 2 (Screens):");
    expect(lines[1]).toBe("- R5 · Requirement 5");
    expect(lines).toContain("All the other stages:");
    expect(lines.indexOf("- R1 ✓ Requirement 1")).toBeGreaterThan(lines.indexOf("All the other stages:"));
  });

  it("is told it can't be edited, and is kept in the folder", async () => {
    expect(acceptanceBrief(a)).toContain("You cannot edit it");
    expect(acceptanceBrief(a)).toContain(".task/acceptance.json");
    const dir = await mkdtemp(join(tmpdir(), "acceptance-"));
    expect(await loadAcceptance(dir)).toBeNull();
    await saveAcceptance(dir, a);
    expect(await loadAcceptance(dir)).toEqual(a);
  });
});
