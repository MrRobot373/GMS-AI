/**
 * The edit tool made forgiving. 183 of the 201 failed edits in the recorded tasks were "old_string was
 * not found"; these are the shapes behind them.
 */
import { describe, expect, it } from "vitest";
import { editHint, nearestRegion, repairEdit, similarity } from "../dsh-plugin/editfix.mjs";
import { cleanArgs } from "../dsh-plugin/tooling.mjs";

const file = [
  "class Vehicle {",
  "  create(def, upgrades, terrain) {",
  "    if (!def) throw new Error('Vehicle definition not provided');",
  "    const body = world.createBody({ type: 'dynamic' });",
  "    return body;",
  "  }",
  "}",
].join("\n");

describe("an old_string that is off by spacing", () => {
  it("is left alone when it is in the file exactly", () => {
    expect(repairEdit(file, "    return body;", "    return null;")).toBeNull();
  });

  it("finds the block when the model wrote it with other indentation, and indents the new text to match", () => {
    const fix = repairEdit(file, "create(def, upgrades, terrain) {\n  if (!def) throw new Error('Vehicle definition not provided');", "create(def, upgrades, terrain) {\n  if (!def) throw new Error('No definition');\n  upgrades = upgrades || [];")!;
    expect(fix.how).toBe("spaces and indentation");
    expect(fix.oldString).toBe("  create(def, upgrades, terrain) {\n    if (!def) throw new Error('Vehicle definition not provided');");
    expect(fix.newString).toBe("  create(def, upgrades, terrain) {\n    if (!def) throw new Error('No definition');\n    upgrades = upgrades || [];");
  });

  it("learns the file's indentation line by line: the first line is flush, the inner lines are not", () => {
    const text = "function f() {\n    if (a) {\n        return 1;\n    }\n}\n";
    // The model remembers two-space indentation, and writes a deeper line the old block didn't have.
    const fix = repairEdit(text, "function f() {\n  if (a) {\n    return 1;\n  }\n}", "function f() {\n  if (a) {\n    log(a);\n    return 2;\n  }\n}")!;
    expect(fix.newString).toBe("function f() {\n    if (a) {\n        log(a);\n        return 2;\n    }\n}");
    // A tab-indented file.
    const tabs = repairEdit("{\n\tx();\n\ty();\n}", "{\n    x();\n    y();\n}", "{\n    x();\n    z();\n    y();\n}")!;
    expect(tabs.newString).toBe("{\n\tx();\n\tz();\n\ty();\n}");
  });

  it("finds a block that differs in trailing spaces and line endings", () => {
    const text = "a();   \nb();\t\nc();\n";
    const fix = repairEdit(text, "a();\r\nb();", "a();\r\nbb();")!;
    expect(fix).toMatchObject({ how: "trailing spaces", oldString: "a();   \nb();\t", newString: "a();\nbb();" });
  });

  it("ignores blank lines at the edges of the model's block, and does not repeat them", () => {
    const fix = repairEdit(file, "\n  return   body;\n", "\n  return null;\n")!;
    expect(fix.oldString).toBe("    return body;");
    expect(fix.newString).toBe("    return null;");
  });

  it("finds a longer block whose middle line the model remembered a little differently", () => {
    const old = ["  create(def, upgrades, terrain) {", "    if (!def) throw new Error('Vehicle definition missing');", "    const body = world.createBody({ type: 'dynamic' });", "    return body;"].join("\n");
    const fix = repairEdit(file, old, old.replace("return body;", "return body.id;"))!;
    expect(fix.how).toBe("a few lines that differ a little");
    expect(fix.oldString).toContain("Vehicle definition not provided");
  });

  it("does nothing when the place is not unique, or the lines are not there", () => {
    const twice = "  x = 1;  \n  y = 2;\nz();\n  x = 1;\n  y = 2;  \n";
    expect(repairEdit(twice, "x = 1;\ny = 2;", "x = 3;\ny = 2;")).toBeNull();
    // Lines the model remembers that were never in the file: nothing safe to do.
    expect(repairEdit("<script src=\"a.js\"></script>\n<script src=\"level.js\"></script>", "<script src=\"save.js\"></script>\n<script src=\"level.js\"></script>", "x")).toBeNull();
    expect(repairEdit(file, "ab", "x")).toBeNull(); // too short to trust
  });
});

describe("what a failed edit is told", () => {
  const html = ["<head>", '    <script src="src/world/pickups.js"></script>', '    <script src="src/scenes/level.js"></script>', "</head>"].join("\n");
  const old = '    <script src="src/core/save.js"></script>\n    <script src="src/scenes/level.js"></script>';

  it("shows the closest lines of the file, with their numbers", () => {
    const near = nearestRegion(html, old)!;
    expect(near.text).toContain('3:     <script src="src/scenes/level.js"></script>');
    const hint = editHint('old_string was not found in "index.html"', html, old, "x", "index.html")!;
    expect(hint).toContain('Your old_string is not in "index.html" as written');
    expect(hint).toContain("closest text is at lines");
    expect(nearestRegion("completely\nother\ntext", "zzzzzzzzzz qqqqqqqq")).toBeNull();
  });

  it("says when the change is already there, or does nothing", () => {
    expect(editHint('old_string was not found in "a"', "let x = 2;", "let x = 1;", "let x = 2;", "a")).toContain("already contains your new_string");
    expect(editHint("old_string and new_string must differ", "x", "x", "x", "a")).toContain("changes nothing");
    expect(editHint("some other error", "x", "x", "y", "a")).toBeNull();
  });

  it("warns about a very long block, and, from the second miss in a row, to read the file again", () => {
    const longOld = Array.from({ length: 30 }, (_, i) => `line ${i} of invented code`).join("\n");
    const hint = editHint('old_string was not found in "a.js"', "other\ncontent", longOld, "y", "a.js", 2)!;
    expect(hint).toContain("30 lines long");
    expect(hint).toContain("This is the 2nd edit in a row");
    expect(editHint('old_string was not found in "a.js"', "other", "one", "y", "a.js", 3)).toContain("3rd edit in a row");
    expect(editHint('old_string was not found in "a.js"', "other", "one", "y", "a.js", 4)).toContain("4th edit in a row");
    expect(hint).toContain("Read the file now");
    expect(editHint('old_string was not found in "a.js"', "other", "one", "y", "a.js", 1)).not.toContain("in a row");
  });

  it("similarity is 1 for the same text modulo spacing and low for different text", () => {
    expect(similarity("  a = 1;", "a   =  1;")).toBe(1);
    expect(similarity("create the body", "zzz qqq xxx")).toBeLessThan(0.2);
  });
});

describe("read arguments", () => {
  it("drops an offset or limit below 1 (0 meant from the start) and reads one sent as text", () => {
    expect(cleanArgs("read", { file_path: "a.js", offset: 0 }, "workspace-write")).toEqual({ file_path: "a.js" });
    expect(cleanArgs("read", { file_path: "a.js", offset: -3, limit: 0 }, "workspace-write")).toEqual({ file_path: "a.js" });
    expect(cleanArgs("read", { file_path: "a.js", offset: "20", limit: 50 }, "workspace-write")).toEqual({ file_path: "a.js", offset: 20, limit: 50 });
  });
});
