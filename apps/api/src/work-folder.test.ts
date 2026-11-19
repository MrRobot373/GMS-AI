/**
 * Working in a folder (services/work-folder.ts, routes/work.ts): a task can work directly in a folder on the server.
 * The rules without a server (allowed roots, links, Aatmiq's own folders, nesting), then against a real Postgres with a
 * stub engine that records the working folder it was given: the task runs in the folder (no private copy), its files
 * are the folder's, uploads are refused, a folder outside the allowed list or one another task is using is refused.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEngine, HarnessEvent, TaskSpec } from "@aatmiq/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { isInside, resolveWorkFolder, type FolderRules } from "./services/work-folder";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe("which folders a task may use", () => {
  let base = "";
  let allowed = "";
  let outside = "";
  let rules: FolderRules;
  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "wf-")));
    allowed = join(base, "projects");
    outside = join(base, "elsewhere");
    await mkdir(join(allowed, "adas", "docs"), { recursive: true });
    await mkdir(join(allowed, ".data", "work"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(allowed, "file.txt"), "x");
    await symlink(outside, join(allowed, "link-out"));
    rules = { roots: [allowed], forbidden: [join(allowed, ".data")] };
  });

  it("accepts a folder inside an allowed root, and the root itself", async () => {
    expect(await resolveWorkFolder(join(allowed, "adas"), rules)).toEqual({ ok: true, path: join(allowed, "adas") });
    expect(await resolveWorkFolder(join(allowed, "adas", "docs") + "/", rules)).toMatchObject({ ok: true });
    // The root itself, when it holds none of Aatmiq's own folders.
    expect(await resolveWorkFolder(allowed, { roots: [allowed], forbidden: [] })).toMatchObject({ ok: true });
  });

  it("refuses everything else, saying why", async () => {
    const no = async (p: string, r = rules) => (await resolveWorkFolder(p, r) as { ok: false; error: string }).error;
    expect(await no("")).toMatch(/full path/);
    expect(await no("adas")).toMatch(/full path/);
    expect(await no(join(allowed, "missing"))).toMatch(/doesn't exist/);
    expect(await no(join(allowed, "file.txt"))).toMatch(/isn't a folder/);
    expect(await no(outside)).toMatch(/isn't one of the folders/);
    expect(await no(join(allowed, "..", "elsewhere"))).toMatch(/isn't one of the folders/);
    // A link inside an allowed folder that leads out is followed first.
    expect(await no(join(allowed, "link-out"))).toMatch(/isn't one of the folders/);
    // Aatmiq's own data, even inside an allowed root, and anything that contains it.
    expect(await no(join(allowed, ".data", "work"))).toMatch(/own data/);
    expect(await no(allowed)).not.toBe("");
    // No roots: the feature is off.
    expect(await no(join(allowed, "adas"), { roots: [], forbidden: [] })).toMatch(/isn't set up/);
  });

  it("compares folders by what they are, not how they're written", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
    expect(isInside("/a/b", "/a")).toBe(false);
  });
});

d("a task working in a folder", () => {
  let h: Harness;
  let base = "";
  let project = "";
  let other = "";
  const specs: TaskSpec[] = [];
  let emit: (e: HarnessEvent) => void = () => undefined;
  const engine: HarnessEngine = {
    id: "stub",
    start: async (spec, onEvent) => {
      specs.push(spec);
      emit = onEvent;
      // Stays running (like a task waiting for its first answer) until the test stops it.
      return { sessionId: "s", alive: true, send: async () => undefined, stop: async () => undefined };
    },
  };

  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "wf-api-")));
    project = join(base, "projects", "adas");
    other = join(base, "other");
    await mkdir(project, { recursive: true });
    await mkdir(other, { recursive: true });
    await writeFile(join(project, "requirements.txt"), "Input range 36-75 V");
    h = await startHarness({ workFolders: [join(base, "projects")] }, { workEngine: engine });
    // A task starts through the API's own address.
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Mock", type: "mock" });
    const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "aatmiq-demo", displayName: "Demo", sections: ["chat", "work"] });
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [m.json.id], defaultModelId: m.json.id });
  }, 60_000);
  afterAll(async () => h?.close());

  const create = (j: typeof h.alice, folder: string | undefined, extra: Record<string, unknown> = {}) =>
    h.call(j, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Summarise the requirements", ...(folder ? { folder } : {}), ...extra });

  it("tells the page whether folders are on", async () => {
    expect((await h.call(h.alice, "GET", `/api/work/info?workspaceId=${h.workspaceId}`)).json.folders).toBe(true);
  });

  it("runs in the folder itself: no private copy, its files are the folder's, uploads are refused", async () => {
    const r = await create(h.alice, project);
    expect(r.status).toBe(200);
    expect(r.json.workFolder).toBe(project);
    for (let i = 0; i < 60 && !specs.length; i++) await new Promise((x) => setTimeout(x, 50));
    if (!specs.length) throw new Error(JSON.stringify((await h.call(h.alice, "GET", `/api/work/tasks/${r.json.id}`)).json.task));
    expect(specs.at(-1)!.workdir).toBe(project);
    const files = (await h.call(h.alice, "GET", `/api/work/tasks/${r.json.id}/files`)).json.files.map((f: { path: string }) => f.path);
    expect(files).toContain("requirements.txt");
    expect((await h.call(h.alice, "GET", `/api/work/tasks/${r.json.id}/files/content?path=requirements.txt`)).body).toBe("Input range 36-75 V");
    expect((await h.call(h.alice, "GET", `/api/work/tasks/${r.json.id}/files/content?path=../other`)).status).toBeGreaterThanOrEqual(400);
    const up = await h.upload(h.alice, `/api/work/tasks/${r.json.id}/files`, {}, { name: "x.txt", type: "text/plain", data: Buffer.from("x") });
    expect(up.status).toBe(400);
    expect((await h.call(h.alice, "GET", `/api/work/tasks/${r.json.id}`)).json.workFolder).toBe(project);
  });

  it("refuses a second task in the same folder (or one inside it) while the first is working", async () => {
    const same = await create(h.bob, project);
    expect(same.status).toBe(409);
    expect(same.json.error).toMatch(/Another task/);
    await mkdir(join(project, "docs"), { recursive: true });
    expect((await create(h.bob, join(project, "docs"))).status).toBe(409);
  });

  it("refuses folders outside the allowed list, and a made-up one", async () => {
    expect((await create(h.alice, other)).status).toBe(400);
    expect((await create(h.alice, join(base, "projects", "nope"))).status).toBe(400);
    // Without a folder a task is private as before.
    const plain = await create(h.alice, undefined);
    expect(plain.status).toBe(200);
    expect(plain.json.workFolder).toBeNull();
  });
});

d("undo and the project's shared folder", () => {
  let h: Harness;
  let base = "";
  let shared = "";
  const specs: TaskSpec[] = [];
  const engine: HarnessEngine = {
    id: "stub",
    start: async (spec) => {
      specs.push(spec);
      return { sessionId: "s", alive: true, send: async () => undefined, stop: async () => undefined };
    },
  };
  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "wf-undo-")));
    shared = join(base, "projects", "shared");
    await mkdir(shared, { recursive: true });
    await writeFile(join(shared, "keep.txt"), "original");
    await writeFile(join(shared, "edit.txt"), "before");
    h = await startHarness({ workFolders: [join(base, "projects")] }, { workEngine: engine });
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Mock", type: "mock" });
    const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "aatmiq-demo", displayName: "Demo", sections: ["chat", "work"] });
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [m.json.id], defaultModelId: m.json.id });
  }, 60_000);
  afterAll(async () => h?.close());

  it("lists what a task changed in the folder and undoes it, all or one file", async () => {
    const pr = await h.call(h.alice, "POST", "/api/projects", { workspaceId: h.workspaceId, name: "Shared" });
    expect((await h.call(h.alice, "PATCH", `/api/projects/${pr.json.id}`, { workFolder: join(base, "nope") })).status).toBe(400);
    const set = await h.call(h.alice, "PATCH", `/api/projects/${pr.json.id}`, { workFolder: shared });
    expect(set.status).toBe(200);
    expect(set.json.workFolder).toBe(shared);
    // The project's folder is the default for its tasks.
    const t = await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, projectId: pr.json.id, prompt: "Edit things" });
    expect(t.status).toBe(200);
    expect(t.json.workFolder).toBe(shared);
    let tries = 0;
    while (!(await h.call(h.alice, "GET", `/api/work/tasks/${t.json.id}`)).json.task?.workSnapshot && tries++ < 80) await new Promise((x) => setTimeout(x, 50));
    expect((await h.call(h.alice, "GET", `/api/work/tasks/${t.json.id}/changes`)).json.changes).toEqual([]);
    // The task changes the folder.
    await writeFile(join(shared, "edit.txt"), "after");
    await writeFile(join(shared, "new.txt"), "new");
    await rm(join(shared, "keep.txt"));
    const ch = (await h.call(h.alice, "GET", `/api/work/tasks/${t.json.id}/changes`)).json;
    expect(Object.fromEntries(ch.changes.map((c: { path: string; status: string }) => [c.path, c.status]))).toEqual({ "edit.txt": "modified", "new.txt": "added", "keep.txt": "deleted" });
    // Not while it is still working.
    expect((await h.call(h.alice, "POST", `/api/work/tasks/${t.json.id}/undo`, {})).status).toBe(409);
    await h.call(h.alice, "POST", `/api/work/tasks/${t.json.id}/cancel`, {});
    expect((await h.call(h.alice, "POST", `/api/work/tasks/${t.json.id}/undo`, { paths: ["unknown.txt"] })).status).toBe(400);
    expect((await h.call(h.bob, "POST", `/api/work/tasks/${t.json.id}/undo`, {})).status).toBeGreaterThanOrEqual(400);
    expect((await h.call(h.alice, "POST", `/api/work/tasks/${t.json.id}/undo`, { paths: ["edit.txt"] })).json).toEqual({ restored: 1, removed: 0 });
    expect(await readFile(join(shared, "edit.txt"), "utf8")).toBe("before");
    expect(await readFile(join(shared, "new.txt"), "utf8")).toBe("new");
    expect((await h.call(h.alice, "POST", `/api/work/tasks/${t.json.id}/undo`, {})).json).toEqual({ restored: 1, removed: 1 });
    expect(await readFile(join(shared, "keep.txt"), "utf8")).toBe("original");
    await expect(readFile(join(shared, "new.txt"))).rejects.toThrow();
    expect((await h.call(h.alice, "GET", `/api/work/tasks/${t.json.id}/changes`)).json.changes).toEqual([]);
    // A private copy instead of the shared folder.
    const priv = await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, projectId: pr.json.id, prompt: "Private", privateCopy: true });
    expect(priv.json.workFolder).toBeNull();
    // The picker lists only folders inside the allowed ones.
    await mkdir(join(shared, "sub"), { recursive: true });
    const roots = (await h.call(h.alice, "GET", "/api/work/folders")).json;
    expect(roots.path).toBeNull();
    const inside = (await h.call(h.alice, "GET", `/api/work/folders?path=${encodeURIComponent(shared)}`)).json;
    expect(inside.folders.map((f: { name: string }) => f.name)).toContain("sub");
    expect((await h.call(h.alice, "GET", `/api/work/folders?path=${encodeURIComponent(base)}`)).status).toBe(400);
  });
});
