/**
 * Work AI within a model's context window: requests that don't fit, long requests, and plans the
 * agent left unfinished (the Ridge Riders task: marked completed with the game never built).
 */
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fitWindow } from "./routes/work-internal";
import { announcesNextStep, answerLeftHanging, definedNames, folderSummary, notesText, symbolIndex, openStepsNudge, pickSkills, reinjection, requestPointer, triesCode, unfinishedNote, withoutJunk, writesCode } from "./services/work";

describe("a model request and the context window", () => {
  const messages = (chars: number) => [{ role: "user", content: "x".repeat(chars) }];
  it("passes a request that fits, and leaves a reply limit that fits alone", () => {
    expect(fitWindow({ messages: messages(40_000), max_tokens: 8192 }, 32_768)).toEqual({});
    expect(fitWindow({ messages: messages(40_000) }, null)).toEqual({});
  });
  it("answers a prompt bigger than the window as an overflow the runtime recognizes (Ollama would cut it silently)", () => {
    const r = fitWindow({ messages: messages(130_000), tools: [{ name: "bash" }] }, 32_768);
    expect("overflow" in r && r.overflow).toMatch(/^Input length \(\d+\) exceeds model's maximum context length \(32768\)\.$/);
    // The pattern pi-ai (DSH's model adapter) reads as a context overflow, so it condenses and retries.
    expect("overflow" in r && /exceeds (?:the )?(?:model'?s )?maximum context length(?: of [\d,]+ tokens?|\s*\([\d,]+\))/i.test(r.overflow)).toBe(true);
  });
  it("lowers a reply limit that would run past the window", () => {
    const r = fitWindow({ messages: messages(100_000), max_tokens: 8192 }, 32_768);
    expect(r).toEqual({ cap: { field: "max_tokens", tokens: 32_768 - 25_008 } });
    expect(fitWindow({ messages: messages(100_000), max_completion_tokens: 9000 }, 32_768)).toMatchObject({ cap: { field: "max_completion_tokens" } });
  });
});

describe("long requests and unfinished plans", () => {
  it("points the agent to a long request saved in its folder, with the opening", () => {
    const brief = `# Ridge Riders\n${"Physics, nine levels, garage, audio. ".repeat(800)}`;
    const p = requestPointer(".task/request-1.md", brief);
    expect(p).toContain(`(${brief.length.toLocaleString("en-US")} characters), so it is saved in \`.task/request-1.md\``);
    expect(p).toContain("Read the whole file first");
    expect(p).toContain("# Ridge Riders");
    expect(p.length).toBeLessThan(2000);
  });
  it("sends back a reply that stops halfway, not a short answer without a full stop", () => {
    expect(answerLeftHanging("Renaming the files:")).toBe(true);
    expect(answerLeftHanging("Next I will write the scene,")).toBe(true);
    expect(answerLeftHanging("Here is the file:\n```js\nconst a = 1;")).toBe(true);
    expect(answerLeftHanging("Result: hello-work")).toBe(false);
    expect(answerLeftHanging("Done. The game is in index.html.")).toBe(false);
    expect(answerLeftHanging("```js\nconst a = 1;\n```")).toBe(false);
  });
  it("sends back a reply that announces its next step and stops, not an offer or a question", () => {
    expect(announcesNextStep("Still 13 pages. Let me try a different approach - use python-docx directly to create a more compact document.")).toBe(true);
    expect(announcesNextStep("The tests pass.\n\nNow I'll write the README.")).toBe(true);
    expect(announcesNextStep("I'm going to fix the camera next.")).toBe(true);
    expect(announcesNextStep("Done. Let me know if you want any changes.")).toBe(false);
    expect(announcesNextStep("Should I also add a dark mode?")).toBe(false);
    expect(announcesNextStep("The game is in ridge-riders/index.html. Open it from the folder to play.")).toBe(false);
    expect(announcesNextStep("## Summary\n\nAll 22 files are created and the terrain test passes.")).toBe(false);
  });
  it("keeps broken-down tokens and leaked reasoning tags out of answers", () => {
    expect(withoutJunk("All tasks are completed.\n\n</think>\n\n## Summary")).toBe("All tasks are completed.\n\n\n\n## Summary");
    expect(withoutJunk("<think>Let me plan.</think>Done.")).toBe("Done.");
    expect(withoutJunk("<unk><unk>")).toBe("");
  });
  it("knows writing code from trying it", () => {
    expect(writesCode("write", { file_path: "ridge-riders/src/world/vehicle.js" })).toBe(true);
    expect(writesCode("edit", { file_path: "game/index.html" })).toBe(true);
    expect(writesCode("write", { file_path: "README.md" })).toBe(false);
    expect(writesCode("read", { file_path: "main.py" })).toBe(false);
    expect(triesCode("browser_open", { url: "game/index.html" })).toBe(true);
    expect(triesCode("bash", { command: "node --check src/main.js" })).toBe(true);
    expect(triesCode("bash", { command: "python3 report.py" })).toBe(true);
    expect(triesCode("bash", { command: "ls -la && cat index.html" })).toBe(false);
  });
  it("lists the open steps when the agent stops early, and names them when the task stops unfinished", () => {
    const open = [{ content: "Write the game scene", status: "in_progress" }, { content: "Write index.html", status: "pending" }];
    expect(openStepsNudge(open)).toContain("- Write the game scene\n- Write index.html");
    expect(unfinishedNote(open, 5)).toBe('Stopped with 2 of 5 planned steps not done: Write the game scene; Write index.html. Send a message (for example "continue") to pick up from there.');
  });
  it("lists the working folder for a restarted agent: sizes, no saved requests or dependencies", async () => {
    const dir = await mkdtemp(join(tmpdir(), "folder-"));
    await mkdir(join(dir, "src/data"), { recursive: true });
    await mkdir(join(dir, ".task"));
    await mkdir(join(dir, "node_modules/phaser"), { recursive: true });
    await writeFile(join(dir, "src/data/vehicles.js"), "x".repeat(3628));
    await writeFile(join(dir, ".task/request-1.md"), "brief");
    await writeFile(join(dir, "node_modules/phaser/index.js"), "x");
    expect(await folderSummary(dir)).toEqual(["src/data/vehicles.js (3,628 bytes)"]);
  });
});

describe("keeping the fixed part of the window small, and giving back what condensing took", () => {
  const skills = [
    { slug: "code-review", description: "Review a code change for bugs and style." },
    { slug: "game-development", description: "Build browser games with canvas, physics and keyboard controls." },
    { slug: "invoice-processing", description: "Read invoices and put their totals in a spreadsheet." },
    { slug: "frontend-design", description: "Design web pages and components that look polished." },
  ];
  it("lists every skill when they fit; on a small window the ones the request is about", () => {
    expect(pickSkills(skills, "anything", 10_000)).toEqual(skills);
    const picked = pickSkills(skills, "Build Ridge Riders, a browser hill-climb game with physics and a canvas", 40);
    expect(picked.map((s) => s.slug)).toEqual(["game-development"]);
    // A vague request still gets skills, in library order, up to the budget.
    expect(pickSkills(skills, "hello", 60).map((s) => s.slug)).toEqual(["code-review", "game-development"]);
    // Library order is kept among the ones chosen.
    expect(pickSkills(skills, "a polished web page for the game", 70).map((s) => s.slug)).toEqual(["game-development", "frontend-design"]);
  });

  it("lists what code defines, by the names other files must use: functions, classes, namespace members, methods", () => {
    const js = `window.RR = window.RR || {};
RR.Input = { keys: {} };
RR.Input.justPressed = function (code) { return !!this.keys[code]; };
RR.Vehicle = class {
  constructor(id) { this.fuel = 100; this.x = 0; this.ctx.font = "12px"; }
  update(dt, level) { ctx.fillStyle = "red"; if (dt) { return 1; } }
  static create(id) {}
};
function mulberry32(a) { return a; }
const GRAVITY = 9.81;
const Menu = {
  enter() {},
  draw: (ctx) => {},
  select: function (i) {},
};
ctx.fillStyle = "x";`;
    const names = definedNames("src/a.js", js);
    expect(names).toEqual(expect.arrayContaining(["RR.Input", "RR.Input.justPressed(code)", "mulberry32(a)", "GRAVITY", "update(dt, level)", "create(id)", "enter()", "draw(ctx)", "select(i)", "instance {fuel, x}"]));
    // A use is not a definition, and keywords are not names.
    expect(names.join(" ")).not.toMatch(/fillStyle|ctx\.font|\bif\(/);
    expect(definedNames("tool.py", "class Report:\n  def build(self, rows):\n    pass\nasync def main(): pass")).toEqual(["build(self, rows)", "main()", "class Report"]);
  });

  it("indexes a folder: newest files first, no vendor, scratch or minified code, within the window's share", async () => {
    const dir = await mkdtemp(join(tmpdir(), "index-"));
    await mkdir(join(dir, "src"));
    await mkdir(join(dir, "vendor"));
    await mkdir(join(dir, "scratch"));
    await writeFile(join(dir, "src/input.js"), "RR.Input = {};\nRR.Input.justPressed = function (code) {};\n");
    await writeFile(join(dir, "vendor/phaser.min.js"), "function a(b){}");
    await writeFile(join(dir, "scratch/check.js"), "function check(){}");
    await writeFile(join(dir, "notes.md"), "function notCode(){}");
    expect(await symbolIndex(dir, 32_768)).toEqual(["src/input.js: RR.Input, RR.Input.justPressed(code)"]);
    await writeFile(join(dir, "src/big.js"), Array.from({ length: 400 }, (_, i) => `function name${i}(a, b) {}`).join("\n"));
    const small = await symbolIndex(dir, 4_096);
    expect(small.join("\n").length).toBeLessThanOrEqual(4_096 * 0.05 * 4 + 20);
    expect(small[0]).toMatch(/^src\/(big|input)\.js: /);
  });

  it("gives back the agent's notes file first, even when it touched no files since", async () => {
    const dir = await mkdtemp(join(tmpdir(), "notes-"));
    expect(await reinjection({ workdir: dir, recentFiles: new Map(), contextWindow: 32_768, plan: null })).toBeNull();
    await mkdir(join(dir, ".task"));
    await writeFile(join(dir, ".task/notes.md"), "# Contracts\n- RR.Input.justPressed(code) -> boolean\n- RR.Input.mousePos = { x, y }\n");
    const back = await reinjection({ workdir: dir, recentFiles: new Map(), contextWindow: 32_768, plan: [{ content: "Write the menu", status: "pending" }] });
    expect(back?.notes).toBe(true);
    expect(back?.files).toEqual([]);
    expect(back?.text).not.toContain("What your code files define");
    expect(back?.text).toContain("Your notes (.task/notes.md");
    expect(back?.text).toContain("RR.Input.justPressed(code) -> boolean");
    expect(back?.text).toContain("Your plan:\n- [pending] Write the menu");
    // Long notes are cut to a share of the window (the start kept) and say where the rest is.
    await writeFile(join(dir, ".task/notes.md"), `# Contracts\n${"- a name and its shape\n".repeat(2000)}`);
    const cut = (await notesText(dir, 32_768))!;
    expect(cut.length).toBeLessThan(5400);
    expect(cut.startsWith("# Contracts")).toBe(true);
    expect(cut).toContain("the rest of the notes is in .task/notes.md");
  });

  it("gives back the files touched most recently, within the window's budget; a big one by name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "reinject-"));
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src/input.js"), "RR.Input = { mousePos: { x: 0, y: 0 } };\n");
    await writeFile(join(dir, "src/vehicle.js"), "x".repeat(20_000));
    await writeFile(join(dir, "old.js"), "function oldThing(a) {}\n");
    const outside = await mkdtemp(join(tmpdir(), "outside-"));
    await writeFile(join(outside, "secret.txt"), "top-secret");
    await symlink(join(outside, "secret.txt"), join(dir, "leak.txt"));
    const recentFiles = new Map([["old.js", 1], ["leak.txt", 2], [join(dir, "src/vehicle.js"), 3], ["src/input.js", 4]]);
    const back = await reinjection({ workdir: dir, recentFiles, contextWindow: 32_768, plan: [{ content: "Write the menu", status: "pending" }] });
    expect(back?.files).toEqual(["src/input.js", "src/vehicle.js", "old.js"]);
    // What the code defines comes back too, so a name can't drift while the files are out of view.
    expect(back?.text).toContain("What your code files define right now");
    expect(back?.text).toContain("old.js: ");
    expect(back?.text).toContain('<file path="src/input.js">\nRR.Input = { mousePos: { x: 0, y: 0 } };');
    expect(back?.text).toContain("- src/vehicle.js (20,000 bytes; read the part you need)");
    expect(back?.text).not.toContain("top-secret");
    expect(back?.text).toContain("Your plan:\n- [pending] Write the menu");
    // Nothing touched and nothing written: nothing to give back. Code in the folder is indexed even when no file was touched.
    expect(await reinjection({ workdir: await mkdtemp(join(tmpdir(), "empty-")), recentFiles: new Map(), contextWindow: 32_768, plan: null })).toBeNull();
    const indexed = await reinjection({ workdir: dir, recentFiles: new Map(), contextWindow: 32_768, plan: null });
    expect(indexed?.files).toEqual([]);
    expect(indexed?.text).toContain("src/input.js: ");
  });
});

