/**
 * Project material is for the project's people (docs/decisions.md, D53): an org admin who isn't in the project can manage
 * it (people, settings) but can't read its sources, chats, brain or Knowledge answers, and can't open, rename, share or
 * delete someone's private library file by its id. The workspace's own shared files stay open to admins.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("admins who aren't in a project", () => {
  let h: Harness;
  let projectId = "";
  let sourceId = "";
  let privateId = "";
  let sharedId = "";

  beforeAll(async () => {
    h = await startHarness();
    // Alice owns a project (not open to the workspace) with a source; Bob has a private library file and a shared one.
    projectId = (await h.call(h.alice, "POST", "/api/projects", { workspaceId: h.workspaceId, name: "Secret design" })).json.id;
    const up = await h.upload(h.alice, `/api/projects/${projectId}/sources/upload`, {}, { name: "design.txt", type: "text/plain", data: Buffer.from("The secret voltage is 48 V.") });
    expect(up.status).toBe(200);
    sourceId = up.json.id;
    privateId = (await h.upload(h.bob, "/api/documents", { workspaceId: h.workspaceId }, { name: "bob-private.txt", type: "text/plain", data: Buffer.from("Bob's private notes.") })).json.id;
    sharedId = (await h.upload(h.bob, "/api/documents", { workspaceId: h.workspaceId, scope: "workspace" }, { name: "handbook.txt", type: "text/plain", data: Buffer.from("Everyone's handbook.") })).json.id;
    await h.settle();
  }, 60_000);
  afterAll(async () => h?.close());

  it("manages the project but doesn't see its material", async () => {
    const p = (await h.call(h.owner, "GET", `/api/projects/${projectId}`)).json;
    expect(p).toMatchObject({ name: "Secret design", canEdit: true, managedOnly: true, sources: [], chats: [], tasks: [] });
    expect((await h.call(h.owner, "PUT", `/api/projects/${projectId}/members`, { userId: h.ids.bob, role: "chat" })).status).toBe(200);
    expect((await h.call(h.owner, "PATCH", `/api/projects/${projectId}`, { description: "Reviewed by admin" })).status).toBe(200);
    expect((await h.call(h.owner, "GET", `/api/projects/${projectId}/brain`)).status).toBe(404);
    expect((await h.call(h.owner, "GET", `/api/projects/${projectId}/brain/export`)).status).toBe(404);
    // Members see everything as before.
    const mine = (await h.call(h.alice, "GET", `/api/projects/${projectId}`)).json;
    expect(mine.sources).toHaveLength(1);
    expect(mine.managedOnly).toBeUndefined();
    expect((await h.call(h.bob, "GET", `/api/projects/${projectId}/brain`)).status).toBe(200);
  });

  it("can't open the project's files, or find them by searching", async () => {
    expect((await h.call(h.owner, "GET", `/api/documents/${sourceId}`)).status).toBe(404);
    expect((await h.call(h.owner, "GET", `/api/documents/${sourceId}/content`)).status).toBe(404);
    expect((await h.call(h.owner, "PATCH", `/api/documents/${sourceId}`, { name: "renamed.txt" })).status).toBe(404);
    expect((await h.call(h.owner, "DELETE", `/api/documents/${sourceId}`)).status).toBe(404);
    const s = await h.call(h.owner, "GET", `/api/search?workspaceId=${h.workspaceId}&q=secret`);
    expect(JSON.stringify(s.json.documents)).not.toContain("design.txt");
  });

  it("can't open, rename, share or delete someone's private library file; shared ones stay open", async () => {
    expect((await h.call(h.owner, "GET", `/api/documents/${privateId}`)).status).toBe(404);
    expect((await h.call(h.owner, "PATCH", `/api/documents/${privateId}`, { scope: "workspace" })).status).toBe(404);
    expect((await h.call(h.owner, "DELETE", `/api/documents/${privateId}`)).status).toBe(404);
    expect(JSON.stringify((await h.call(h.owner, "GET", `/api/documents?workspaceId=${h.workspaceId}`)).json)).not.toContain("bob-private.txt");
    // The owner of it still can; the workspace's shared file is open to the admin.
    expect((await h.call(h.bob, "GET", `/api/documents/${privateId}`)).status).toBe(200);
    expect((await h.call(h.owner, "GET", `/api/documents/${sharedId}`)).status).toBe(200);
  });

  it("gets no Knowledge answer from it", async () => {
    const ask = await h.call(h.owner, "POST", "/api/knowledge/ask", { projectId, question: "What is the secret voltage?" });
    expect(ask.status).toBe(404);
  });
});
