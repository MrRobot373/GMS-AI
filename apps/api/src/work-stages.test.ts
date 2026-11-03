/**
 * Milestone build mode: what a stage's fresh session is told, what the progress file records, the
 * state kept across restarts, and the snapshot commits.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitSnapshot, loadProgress, loadState, progressEntry, progressTail, saveState, stagePrompt } from "./services/work-stages";
import { buildAcceptance, MILESTONE_MIN_ITEMS } from "./services/work-spec";

const big = () =>
  buildAcceptance({
    build: true,
    milestones: [{ name: "Data" }, { name: "Physics" }, { name: "Screens" }],
    items: Array.from({ length: MILESTONE_MIN_ITEMS }, (_, i) => ({ requirement: `Requirement ${i + 1}`, milestone: 1 + Math.floor(i / 3) })),
  })!;

describe("a stage's opening message", () => {
  it("has the request, this stage's items, the progress so far and what the code defines; and no history", () => {
    const a = big();
    a.items[0]!.status = "pass";
    const text = stagePrompt({
      a,
      stage: 2,
      request: "Build Ridge Riders, a hill-climb game.",
      progress: "## Stage 1 of 3: Data\n- R1 ✓ Requirement 1\n",
      names: ["src/data/vehicles.js: window.RR_VEHICLES"],
      files: ["src/data/vehicles.js (3,628 bytes)"],
      notes: null,
    });
    expect(text).toContain("You are building stage 2 of 3: Physics.");
    expect(text).toContain("THE REQUEST:\nBuild Ridge Riders, a hill-climb game.");
    expect(text).toContain("This stage, 2 of 3 (Physics):\n- R4 · Requirement 4");
    expect(text).toContain("WHAT EARLIER STAGES DID (.task/progress.md):\n## Stage 1 of 3: Data");
    expect(text).toContain("src/data/vehicles.js: window.RR_VEHICLES");
    expect(text).toContain("Build only this stage's items now.");
    expect(text).not.toContain("final answer summarizes the whole product");
    expect(text).not.toContain("THE PERSON'S LATEST MESSAGE");
  });

  it("the first stage says nothing is built; the last asks for a summary of the whole product; a follow-up is passed on", () => {
    const a = big();
    const first = stagePrompt({ a, stage: 1, request: "r", progress: "", names: [], files: [], notes: null });
    expect(first).toContain("Nothing has been built yet.");
    const last = stagePrompt({ a, stage: 3, request: "r", progress: "x", names: [], files: [], notes: "# Contracts\n- RR.Input.justPressed(code)", latest: "also add a pause key" });
    expect(last).toContain("final answer summarizes the whole product");
    expect(last).toContain("YOUR NOTES FROM EARLIER:\n# Contracts");
    expect(last).toContain("THE PERSON'S LATEST MESSAGE:\nalso add a pause key");
  });
});

describe("the progress file and the state", () => {
  it("records a done stage with its items and the files then; a long file keeps its newest stages", () => {
    const a = big();
    a.items[3]!.status = "pass";
    a.items[4]!.status = "fail";
    a.items[4]!.observed = "the car never moves";
    const entry = progressEntry(a, 2, ["src/world/vehicle.js (7,621 bytes)"], new Date("2026-11-03T10:30:00Z"));
    expect(entry).toContain("## Stage 2 of 3: Physics (done 2026-11-03 10:30 UTC)");
    expect(entry).toContain("- R4 ✓ Requirement 4");
    expect(entry).toContain("- R5 ✗ Requirement 5 (found: the car never moves)");
    expect(entry).toContain("  src/world/vehicle.js (7,621 bytes)");
    const long = `## Stage 1\n${"x".repeat(9000)}\n## Stage 4 newest`;
    expect(progressTail(long).startsWith("…")).toBe(true);
    expect(progressTail(long)).toContain("## Stage 4 newest");
    expect(progressTail("short")).toBe("short");
  });

  it("keeps the stage and review round across a restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "state-"));
    expect(await loadState(dir)).toBeNull();
    expect(await loadProgress(dir)).toBe("");
    await saveState(dir, { milestone: 3, reviewRound: 1 });
    expect(await loadState(dir)).toEqual({ milestone: 3, reviewRound: 1 });
    await writeFile(join(dir, ".task/state.json"), "not json");
    expect(await loadState(dir)).toBeNull();
  });
});

describe("snapshots", () => {
  it("commits the work after each stage and leaves the task's own bookkeeping out", async () => {
    const dir = await mkdtemp(join(tmpdir(), "snap-"));
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src/a.js"), "const a = 1;\n");
    await saveState(dir, { milestone: 1, reviewRound: 0 });
    let chowned = "";
    expect(await gitSnapshot(dir, "Stage 1 of 3: Data", async (p) => void (chowned = p))).toBe(true);
    expect(chowned).toBe(join(dir, ".git"));
    await writeFile(join(dir, "src/b.js"), "const b = 2;\n");
    expect(await gitSnapshot(dir, "Stage 2 of 3: Physics")).toBe(true);
    const git = (...args: string[]) => execFileSync("git", ["-c", "safe.directory=*", ...args], { cwd: dir, encoding: "utf8" }).trim();
    expect(git("log", "--format=%s").split("\n")).toEqual(["Stage 2 of 3: Physics", "Stage 1 of 3: Data"]);
    expect(git("ls-files").split("\n").sort()).toEqual(["src/a.js", "src/b.js"]);
  });
});
