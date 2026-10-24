import { describe, expect, it } from "vitest";
import { restartNote } from "./services/work";

describe("a task interrupted by a restart", () => {
  it("says the work can be continued, and names files that were already saved", () => {
    expect(restartNote([])).toBe("The server restarted while this task was running. Send a message to continue.");
    expect(restartNote(["report.md", "Pump-VFD-study.xlsx"])).toBe(
      "The server restarted while this task was running. Files already saved are still here: report.md, Pump-VFD-study.xlsx. Send a message to continue.",
    );
  });
});
