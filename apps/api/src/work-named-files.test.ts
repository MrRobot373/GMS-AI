/** A task told to make named files is reminded once if it says it's done without them (services/work.ts). */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { missingFiles, namedFiles } from "./services/work";

describe("files a request asks for", () => {
  it("finds the file names in a request", () => {
    expect(namedFiles("Create sales.xlsx with 12 months of data, make a PNG bar chart, and write report.md summarising the trends.")).toEqual(["sales.xlsx", "report.md"]);
    expect(namedFiles("Make a chart (PNG) from this data")).toEqual([]);
    // Files to be deleted or moved aren't promised.
    expect(namedFiles("Make scratch/a.txt, then delete the scratch folder with rm -rf.")).toEqual([]);
    expect(namedFiles("Rename old.md to new.md")).toEqual([]);
    expect(namedFiles("Read https://example.com/a.pdf and save the summary to out/summary.docx")).toEqual(["summary.docx"]);
  });

  it("leaves out files the person gives: a missing one is for the agent to say, not to make", () => {
    // The missing-attachment eval: the reminder sent the agent off to build sales.xlsx after it had said, rightly, that none was attached.
    expect(namedFiles("Summarize the attached sales.xlsx in three bullet points.")).toEqual([]);
    expect(namedFiles("Use data from motor_log.csv and save the chart as chart.png")).toEqual(["chart.png"]);
    expect(namedFiles("Check my report.docx with the document checks.")).toEqual([]);
    expect(namedFiles("Make a summary table of these pumps in summary.xlsx here.")).toEqual(["summary.xlsx"]);
    expect(namedFiles("Fix the bug and write the result to fixed.csv")).toEqual(["fixed.csv"]);
  });

  it("says which are missing from the folder (any case, a few levels down)", async () => {
    const d = await mkdtemp(join(tmpdir(), "nf-"));
    await mkdir(join(d, "out"));
    await writeFile(join(d, "Sales.xlsx"), "x");
    await writeFile(join(d, "out", "summary.docx"), "x");
    expect(await missingFiles(d, ["sales.xlsx", "summary.docx", "report.md"])).toEqual(["report.md"]);
  });
});
