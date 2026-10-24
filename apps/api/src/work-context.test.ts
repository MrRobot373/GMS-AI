/**
 * Work AI within a model's context window: requests that don't fit, long requests, and plans the
 * agent left unfinished (the Ridge Riders task: marked completed with the game never built).
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fitWindow } from "./routes/work-internal";
import { answerLeftHanging, folderSummary, openStepsNudge, requestPointer, unfinishedNote } from "./services/work";

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
