/**
 * scripts/knowledge-ingest.mjs and knowledge-eval.mjs against a real server: a folder of documents becomes projects with
 * their sources ready; running it again uploads nothing; the evaluation script then checks rank, pages and the
 * threshold in retrieval-only mode (no model needed).
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const run = promisify(execFile);
const PORT = 38917;
const scripts = resolve(__dirname, "../../../scripts");

d("bulk ingest and evaluation scripts", () => {
  let h: Harness;
  let dir = "";
  const env = () => ({ ...process.env, KNOWLEDGE_EVAL_URL: `http://localhost:${PORT}`, KNOWLEDGE_EVAL_ORIGIN: "http://localhost:3000", KNOWLEDGE_EVAL_EMAIL: "owner@gem.test", KNOWLEDGE_EVAL_PASSWORD: "correct-horse-battery" });
  const node = (script: string, args: string[]) => run("node", [join(scripts, script), ...args], { env: env() }).then((r) => ({ code: 0, out: r.stdout })).catch((e) => ({ code: e.code as number, out: String(e.stdout) + String(e.stderr) }));

  beforeAll(async () => {
    h = await startHarness();
    await h.app.listen({ port: PORT, host: "127.0.0.1" });
    dir = await mkdtemp(join(tmpdir(), "corpus-"));
    await mkdir(join(dir, "Inverter"), { recursive: true });
    await mkdir(join(dir, "Charger"), { recursive: true });
    await writeFile(join(dir, "Inverter", "test-report.txt"), "Inverter test report. The heatsink reached 98 degrees at full load during the overtemperature test.");
    await writeFile(join(dir, "Inverter", "notes.md"), "# Notes\nThe enclosure is IP65 rated.");
    await writeFile(join(dir, "Charger", "spec.txt"), "Charger specification. Output is 14.4 V at 10 A for lead-acid batteries.");
    await writeFile(join(dir, "Charger", "model.step"), "not supported");
  }, 60_000);
  afterAll(async () => h?.close());

  it("ingests each sub-folder as a project, follows the files until ready, and skips what's done on a second run", async () => {
    // Outside the corpus, as in real use.
    const out = await mkdtemp(join(tmpdir(), "ingest-out-"));
    const state = join(out, "state.json");
    const report = join(out, "report.json");
    const first = await node("knowledge-ingest.mjs", [dir, "--state", state, "--report", report, "--concurrency", "2"]);
    expect(first.code).toBe(0);
    expect(first.out).toMatch(/3 files ready/);
    expect(first.out).toMatch(/1 skipped/);
    const projects = (await h.call(h.owner, "GET", `/api/projects?workspaceId=${h.workspaceId}`)).json.map((p: any) => p.name).sort();
    expect(projects).toEqual(["Charger", "Inverter"]);
    const rep = JSON.parse(await readFile(report, "utf8"));
    expect(rep).toMatchObject({ files: 3, failed: 0 });
    expect(Object.keys(rep.byProject).sort()).toEqual(["Charger", "Inverter"]);
    // Again: nothing is uploaded twice.
    const before = (await h.call(h.owner, "GET", `/api/projects?workspaceId=${h.workspaceId}`)).json.reduce((n: number, p: any) => n + p.sourceCount, 0);
    const again = await node("knowledge-ingest.mjs", [dir, "--state", state]);
    expect(again.code).toBe(0);
    const after = (await h.call(h.owner, "GET", `/api/projects?workspaceId=${h.workspaceId}`)).json.reduce((n: number, p: any) => n + p.sourceCount, 0);
    expect(after).toBe(before);
  }, 120_000);

  it("the evaluation script checks the right document is in the top 5, and applies --min-pass", async () => {
    const set = join(dir, "cases.json");
    await writeFile(
      set,
      JSON.stringify({
        cases: [
          { project: "Inverter", question: "How hot did the heatsink get in the overtemperature test?", documents: ["test-report.txt"] },
          { project: "Charger", question: "What is the charger output voltage for lead-acid batteries?", documents: ["spec.txt"] },
          { project: "Charger", question: "Which document says the warranty period?", documents: ["nonexistent.pdf"] },
        ],
      }),
    );
    const some = await node("knowledge-eval.mjs", [set, "--retrieval-only", "--min-pass", "2", "--report", join(dir, "eval.json")]);
    expect(some.out).toMatch(/2 passed, 1 failed of 3 \(retrieval only\)/);
    expect(some.out).toMatch(/Threshold met \(2 ≥ 2\)/);
    expect(some.code).toBe(0);
    const all = await node("knowledge-eval.mjs", [set, "--retrieval-only"]);
    expect(all.code).toBe(1);
    expect(all.out).toMatch(/Threshold NOT met: 2 < 3/);
    const rep = JSON.parse(await readFile(join(dir, "eval.json"), "utf8"));
    expect(rep).toMatchObject({ total: 3, passed: 2, retrievalOnly: true, topK: 5 });
    expect(rep.results[0].retrieved[0]).toContain("test-report.txt");
  }, 120_000);
});
