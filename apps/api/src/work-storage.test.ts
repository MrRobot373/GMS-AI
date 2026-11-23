/**
 * Work AI storage (services/work-storage.ts): a person over their limit can't start new tasks until they delete old ones,
 * and finished tasks past the retention are removed with their folders. Pinned tasks, tasks still working, recent ones
 * and a person's own working folder are kept.
 */
import type { HarnessEngine } from "@aatmiq/harness";
import { eq, sql, workTask } from "@aatmiq/db";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";

const d = process.env.TEST_DATABASE_URL ? describe : describe.skip;

d("Work AI storage", () => {
  let h: Harness;
  let workDir = "";
  let outside = "";
  const engine: HarnessEngine = { id: "stub", start: async () => ({ sessionId: "s", alive: true, send: async () => undefined, stop: async () => undefined }) };

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ws-work-"));
    outside = await realpath(await mkdtemp(join(tmpdir(), "ws-own-")));
    await writeFile(join(outside, "keep-me.txt"), "a person's own file");
    h = await startHarness({ workDir, workFolders: [outside] }, { workEngine: engine });
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Mock", type: "mock" });
    const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "aatmiq-demo", displayName: "Demo", sections: ["chat", "work"] });
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [m.json.id], defaultModelId: m.json.id });
  }, 60_000);
  afterAll(async () => h?.close());

  const task = async (extra: Record<string, unknown> = {}) => (await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Make a file", start: false, ...extra })).json;
  const fill = async (id: string, mb: number) => {
    const files = join(workDir, id, "files");
    await mkdir(files, { recursive: true });
    await writeFile(join(files, "big.bin"), Buffer.alloc(mb * 1024 * 1024));
  };

  it("a person over their limit can't start a new task until they delete old ones", async () => {
    const t = await task();
    await fill(t.id, 12);
    await h.call(h.owner, "PUT", "/api/admin/work", { taskStorageMbPerUser: 10 });
    expect((await h.call(h.alice, "GET", "/api/work/storage")).json).toEqual({ usedMb: 12, limitMb: 10 });
    const refused = await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Another", start: false });
    expect(refused.status).toBe(413);
    expect(refused.json.error).toMatch(/use 12 MB of your 10 MB/);
    // Others aren't affected.
    expect((await h.call(h.bob, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Mine", start: false })).status).toBe(200);
    // Deleting the task frees the space at once.
    await h.call(h.alice, "DELETE", `/api/work/tasks/${t.id}`);
    expect((await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Now fits", start: false })).status).toBe(200);
    await h.call(h.owner, "PUT", "/api/admin/work", { taskStorageMbPerUser: null });
  });

  it("removes finished tasks past the retention, keeping pinned, recent and working ones, and people's own folders", async () => {
    const old = await task();
    const pinned = await task();
    const recent = await task();
    const working = await task();
    const inFolder = await task({ folder: outside });
    for (const t of [old, pinned, recent, working, inFolder]) await fill(t.id, 1);
    const ago = sql`now() - interval '40 days'`;
    await h.db.update(workTask).set({ status: "completed", updatedAt: ago }).where(eq(workTask.id, old.id));
    await h.db.update(workTask).set({ status: "completed", updatedAt: ago, pinned: true }).where(eq(workTask.id, pinned.id));
    await h.db.update(workTask).set({ status: "completed" }).where(eq(workTask.id, recent.id));
    await h.db.update(workTask).set({ status: "running", updatedAt: ago }).where(eq(workTask.id, working.id));
    await h.db.update(workTask).set({ status: "failed", updatedAt: ago }).where(eq(workTask.id, inFolder.id));

    // Off by default: nothing is removed.
    expect(await (h.app as unknown as { workRunner: { cleanUpOldTasks(): Promise<number> } }).workRunner.cleanUpOldTasks()).toBe(0);
    await h.call(h.owner, "PUT", "/api/admin/work", { taskRetentionDays: 30 });
    expect(await (h.app as unknown as { workRunner: { cleanUpOldTasks(): Promise<number> } }).workRunner.cleanUpOldTasks()).toBe(2);
    const left = new Set((await h.db.select({ id: workTask.id }).from(workTask)).map((r) => r.id));
    expect(left.has(old.id)).toBe(false);
    expect(existsSync(join(workDir, old.id))).toBe(false);
    for (const t of [pinned, recent, working]) expect(left.has(t.id)).toBe(true);
    // The task that worked in a person's folder is gone; the folder and its files are not.
    expect(left.has(inFolder.id)).toBe(false);
    expect(existsSync(join(outside, "keep-me.txt"))).toBe(true);
  });
});
