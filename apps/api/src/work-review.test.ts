/**
 * The independent review: what the reviewer is told, how its report is read and merged with the
 * checks code ran, and what goes back to the builder.
 */
import { describe, expect, it } from "vitest";
import { allGood, feedbackText, mergeResults, parseReport, reviewerPrompt, verificationLine, verificationOf } from "./services/work-review";
import { CONSISTENCY_ID, HYGIENE_ID } from "./services/work-checks";
import { buildAcceptance, type Check } from "./services/work-spec";

const list = () =>
  buildAcceptance({
    build: true,
    milestones: [],
    items: [
      { requirement: "The app is in a folder called expense-tracker", check: { kind: "path_exists", path: "expense-tracker/index.html" } as Check },
      { requirement: "A negative amount is refused with a message on the page", how: "Type -5 and add it", check: { kind: "judged" } as Check },
      { requirement: "The export reads back in", how: "Export, then import the file", check: { kind: "judged" } as Check },
      { requirement: "Newest first", check: { kind: "judged" } as Check },
    ],
  })!;

describe("what the reviewer is told", () => {
  it("has the request word for word, the items to judge, what code already settled, and how to report", () => {
    const a = list();
    const text = reviewerPrompt("Build an expense tracker in a folder called expense-tracker.", a, [{ id: "R1", status: "pass", observed: "expense-tracker/index.html is there" }], true);
    expect(text).toContain("You did not build it and you do not fix it");
    expect(text).toContain("<request>\nBuild an expense tracker in a folder called expense-tracker.\n</request>");
    expect(text).toContain("- R2: A negative amount is refused with a message on the page\n    How to check: Type -5 and add it");
    expect(text).toContain("Already settled by automatic checks");
    expect(text).toContain("- R1: pass (expense-tracker/index.html is there)");
    expect(text).not.toMatch(/- R1: The app is in a folder/);
    expect(text).toContain("click the button that makes it, then read the file (downloads are saved in downloads/)");
    expect(text).toContain("browser_upload");
    expect(text).toContain("browser_resize");
    expect(text).toContain("One entry for each of R2, R3, R4");
    expect(reviewerPrompt("x", a, [], false)).not.toContain("browser_upload");
  });
});

describe("reading the report", () => {
  it("takes JSON, also in a code fence, and says why when it isn't", () => {
    expect(parseReport('{"items":[{"id":"R2","status":"fail","observed":"nothing shown"}]}')).toMatchObject({ ok: true });
    expect(parseReport('```json\n{"items":[]}\n```')).toMatchObject({ ok: true });
    expect(parseReport("not json")).toEqual({ ok: false, error: "review.json isn't valid JSON" });
    expect(parseReport('{"items":[{"id":"R2","status":"maybe"}]}')).toMatchObject({ ok: false });
  });
});

describe("merging the checks with the report", () => {
  const report = (items: object[]) => parseReport(JSON.stringify({ items })) as { ok: true; report: ReturnType<typeof Object> };

  it("code's results stand; judged items come from the report; a pass needs evidence", () => {
    const a = list();
    const r = report([
      { id: "R1", status: "fail", observed: "the reviewer thinks otherwise", evidence: "" },
      { id: "R2", status: "pass", observed: "message shown", evidence: 'typed -5, clicked Add: the page showed "Amount must be positive"' },
      { id: "R3", status: "pass", observed: "fine", evidence: "ok" },
      { id: "R4", status: "fail", observed: "oldest first: 2026-10-05 is on top", evidence: "table rows read in order" },
    ]).report as never;
    const o = mergeResults(a, [{ id: "R1", status: "pass", observed: "expense-tracker/index.html is there" }, { id: HYGIENE_ID, status: "pass", observed: "no leftover files" }], r);
    expect(a.items.map((i) => i.status)).toEqual(["pass", "pass", "unchecked", "fail"]);
    expect(a.items[0]?.observed).toBe("expense-tracker/index.html is there");
    expect(a.items[2]?.observed).toBe("the reviewer said it passed but gave no evidence");
    expect(a.items[3]?.observed).toBe("oldest first: 2026-10-05 is on top");
    expect(o.passed.map((i) => i.id)).toEqual(["R1", "R2"]);
    expect(o.failed.map((i) => i.id)).toEqual(["R4"]);
    expect(o.untested.map((i) => i.id)).toEqual(["R3"]);
    expect(allGood(o)).toBe(false);
  });

  it("an item the reviewer never mentioned is not tested, and a failed code check can't be overturned", () => {
    const a = list();
    const o = mergeResults(a, [{ id: "R1", status: "fail", observed: "expense-tracker/index.html isn't in the working folder" }], { items: [{ id: "R1", status: "pass", observed: "", evidence: "I looked at it and it was there, honest" }] });
    expect(a.items[0]?.status).toBe("fail");
    expect(a.items.slice(1).every((i) => i.status === "unchecked")).toBe(true);
    expect(o.failed.map((i) => i.id)).toEqual(["R1"]);
  });

  it("is all good only when every item passed and nothing is left over", () => {
    const a = list();
    const pass = (id: string) => ({ id, status: "pass" as const, observed: "seen", evidence: "typed it in and read the table back, it matched" });
    const full = { items: [pass("R2"), pass("R3"), pass("R4")] };
    expect(allGood(mergeResults(a, [{ id: "R1", status: "pass", observed: "ok" }, { id: HYGIENE_ID, status: "pass", observed: "no leftover files" }], full))).toBe(true);
    const b = list();
    expect(allGood(mergeResults(b, [{ id: "R1", status: "pass", observed: "ok" }, { id: HYGIENE_ID, status: "fail", observed: "leftover files: DONE, finish.txt" }], full))).toBe(false);
  });
});

describe("what goes back to the builder, and what is kept", () => {
  it("lists what failed with what was found, what couldn't be tested, and the leftovers", () => {
    const a = list();
    const o = mergeResults(
      a,
      [{ id: "R1", status: "pass", observed: "ok" }, { id: HYGIENE_ID, status: "fail", observed: "leftover files: DONE, finish.txt" }],
      { items: [{ id: "R4", status: "fail", observed: "oldest first", evidence: "rows read in order" }, { id: "R3", status: "untested", observed: "no file chooser could be used", evidence: "" }] },
    );
    const text = feedbackText(o, 1);
    expect(text).toContain("round 1 of 3");
    expect(text).toContain("Not right:\n- R4 Newest first\n    found: oldest first");
    expect(text).toContain("Could not be tested");
    expect(text).toContain("- R3 The export reads back in");
    expect(text).toContain("move into scratch/): DONE, finish.txt");
    expect(text).toContain("You cannot edit it");
    expect(text).not.toContain("R1");
  });

  it("keeps each item's state, the leftovers row and a one-line summary", () => {
    const a = list();
    const o = mergeResults(a, [{ id: "R1", status: "pass", observed: "ok" }, { id: HYGIENE_ID, status: "pass", observed: "no leftover files" }], { items: [{ id: "R2", status: "fail", observed: "no message", evidence: "typed -5, nothing shown" }] });
    const v = verificationOf(a, o, { rounds: 2, reviewTaskId: "t-1" });
    expect(v).toMatchObject({ rounds: 2, passed: 2, total: 5, reviewTaskId: "t-1" });
    expect(v.items.map((i) => `${i.id}:${i.status}`)).toEqual(["R1:pass", "R2:fail", "R3:untested", "R4:untested", "H1:pass"]);
    expect(verificationLine(v)).toBe("2 of 5 requirements met; not met or not tested: R2, R3, R4");
    expect(verificationLine({ ...v, passed: 5, items: v.items.map((i) => ({ ...i, status: "pass" as const })) })).toBe("All 5 requirements checked and met");
    expect(verificationLine({ ...v, skipped: "the reviewer didn't write a report" })).toBe("Not reviewed: the reviewer didn't write a report");
  });
});

describe("a review of documents", () => {
  const docs = () =>
    buildAcceptance({
      build: true,
      milestones: [],
      items: [
        { requirement: "The workbook has the Data and Summary sheets", check: { kind: "office_audit", path: "Sales.xlsx", require: ["formulas:10"] } as Check },
        { requirement: "The report says which region leads", how: "Compare with the data", check: { kind: "judged" } as Check },
        { requirement: "The deck has notes on every slide", check: { kind: "judged" } as Check },
      ],
    })!;

  it("tells the reviewer to read the files, render the pages and recompute every claim from the data", () => {
    const text = reviewerPrompt("Make a sales pack.", docs(), [{ id: "R1", status: "pass", observed: "Sales.xlsx audited" }], false);
    expect(text).toContain("python-pptx");
    expect(text).toContain("pdftotext -layout");
    expect(text).toContain("Recompute every statement of fact");
    expect(text).toContain("text in another language");
    // A software review isn't told any of this.
    expect(reviewerPrompt("x", list(), [], false)).not.toContain("Recompute every statement of fact");
  });

  it("tells the builder what its last changes broke, ahead of what else is wrong", () => {
    const a = docs();
    const det = [{ id: "R1", status: "fail" as const, observed: "Summary: 26 aggregation formulas calculate to 0" }];
    const o = mergeResults(a, det, null);
    const text = feedbackText(o, 2, { regressed: ["R1"] });
    expect(text).toContain("These passed in the last review and fail now, so your last changes broke them: R1");
    expect(text.indexOf("broke them")).toBeLessThan(text.indexOf("Not right:"));
    expect(feedbackText(o, 2)).not.toContain("broke them");
  });

  it("a figure the workbook doesn't have fails the review, goes back to the builder and is kept in the result", () => {
    const a = docs();
    const det = [
      { id: "R1", status: "pass" as const, observed: "Sales.xlsx audited" },
      { id: CONSISTENCY_ID, status: "fail" as const, observed: 'Review.pptx: "0.0%" looks like a failed calculation' },
    ];
    const report = { items: [{ id: "R2", status: "pass" as const, observed: "", evidence: "West leads: 4,527,582 vs North 3,593,890 by my own sum" }, { id: "R3", status: "pass" as const, observed: "", evidence: "python-pptx: notes on 11 of 11 slides" }] };
    const o = mergeResults(a, det, report);
    expect(o.consistency?.status).toBe("fail");
    expect(allGood(o)).toBe(false);
    expect(feedbackText(o, 1)).toContain('Figures that don\'t come from the workbook: Review.pptx: "0.0%" looks like a failed calculation');
    const v = verificationOf(a, o, { rounds: 1, reviewTaskId: null });
    expect(v.items.find((i) => i.id === CONSISTENCY_ID)).toMatchObject({ status: "fail" });
    expect(v.total).toBe(4);
  });
});
