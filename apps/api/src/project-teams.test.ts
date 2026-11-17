/**
 * Cross-team projects (docs/03-projects.md, "People from other teams"): a project lives in one workspace (a team), but
 * people from any team, or a whole group at once, can be added. Someone from another team joins the project's workspace
 * as a guest and reaches only the projects they were added to there: not the projects open to the whole workspace, not
 * its library, no chats or tasks outside a project, no new projects. Leaving their last project there ends the guest
 * membership.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jar, startHarness, type Harness, type Jar } from "../test/gem-harness";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("projects across teams", () => {
  let h: Harness;
  let software = ""; // the harness's workspace: Olga (owner), Alice and Bob
  let firmware = "";
  const farah: { j: Jar; id: string } = { j: jar(), id: "" };
  const gita: { j: Jar; id: string } = { j: jar(), id: "" };
  let adas = "";
  let wiki = "";

  /** Invite someone into one workspace only. */
  async function joinOnly(workspaceId: string, email: string, name: string) {
    const inv = await h.call(h.owner, "POST", "/api/admin/invites", { email, workspaces: [{ workspaceId, role: "member" }] });
    expect(inv.status).toBe(200);
    const j = jar();
    expect((await h.call(j, "POST", `/api/invites/${inv.json.link.split("/invite/")[1]}/accept`, { name, password: "member-password-123" })).status).toBe(200);
    return { j, id: (await h.call(j, "GET", "/api/me")).json.user.id as string };
  }

  beforeAll(async () => {
    h = await startHarness();
    software = h.workspaceId;
    const ws = await h.call(h.owner, "POST", "/api/admin/workspaces", { name: "Firmware" });
    expect(ws.status).toBe(200);
    firmware = ws.json.id;
    Object.assign(farah, await joinOnly(firmware, "farah@gem.test", "Farah Firmware"));
    Object.assign(gita, await joinOnly(firmware, "gita@gem.test", "Gita Firmware"));
    adas = (await h.call(h.alice, "POST", "/api/projects", { workspaceId: software, name: "ADAS" })).json.id;
    wiki = (await h.call(h.bob, "POST", "/api/projects", { workspaceId: software, name: "Team wiki" })).json.id;
    expect((await h.call(h.bob, "PATCH", `/api/projects/${wiki}`, { visibility: "workspace" })).status).toBe(200);
  }, 60_000);
  afterAll(async () => h?.close());

  it("offers people from every team, saying who would join as a guest", async () => {
    const r = await h.call(h.alice, "GET", `/api/projects/${adas}/candidates?q=farah`);
    expect(r.status).toBe(200);
    expect(r.json.people).toEqual([expect.objectContaining({ id: farah.id, workspaceRole: null, teams: ["Firmware"] })]);
    // Only people who can edit the project may look.
    expect((await h.call(h.bob, "GET", `/api/projects/${adas}/candidates`)).status).toBe(404);
  });

  it("adds someone from another team as a guest of the project's workspace", async () => {
    const r = await h.call(h.alice, "PUT", `/api/projects/${adas}/members`, { userId: farah.id, role: "chat" });
    expect(r.json).toMatchObject({ added: 1, guests: 1 });
    const me = (await h.call(farah.j, "GET", "/api/me")).json;
    expect(me.workspaces.find((w: any) => w.id === software)).toMatchObject({ role: "guest", sections: ["chat", "work"] });
    const detail = (await h.call(h.alice, "GET", `/api/projects/${adas}`)).json;
    expect(detail.members.find((m: any) => m.userId === farah.id)).toMatchObject({ guest: true, teams: ["Firmware"] });
  });

  it("a guest sees only their projects there, and the project from their own team", async () => {
    const list = (await h.call(farah.j, "GET", `/api/projects?workspaceId=${software}`)).json;
    expect(list.map((p: any) => p.name)).toEqual(["ADAS"]);
    expect((await h.call(farah.j, "GET", `/api/projects/${adas}`)).status).toBe(200);
    // Open to the whole workspace, but not to guests.
    expect((await h.call(farah.j, "GET", `/api/projects/${wiki}`)).status).toBe(404);
    expect((await h.call(h.alice, "GET", `/api/projects/${wiki}`)).status).toBe(200);
    // From Firmware, ADAS shows under "in your other workspaces".
    const elsewhere = (await h.call(farah.j, "GET", `/api/projects/elsewhere?workspaceId=${firmware}`)).json;
    expect(elsewhere).toEqual([expect.objectContaining({ id: adas, workspaceName: expect.any(String), guest: true })]);
  });

  it("a guest can't read the workspace's library, or share into it", async () => {
    const up = await h.upload(h.bob, "/api/documents", { workspaceId: software, scope: "workspace" }, { name: "team-handbook.txt", type: "text/plain", data: Buffer.from("Software team handbook.") });
    expect(up.status).toBe(200);
    await h.settle();
    const lib = (await h.call(h.alice, "GET", `/api/documents?workspaceId=${software}`)).json;
    expect(JSON.stringify(lib)).toContain("team-handbook.txt");
    const theirs = await h.call(farah.j, "GET", `/api/documents?workspaceId=${software}`);
    expect(JSON.stringify(theirs.json)).not.toContain("team-handbook.txt");
    const share = await h.upload(farah.j, "/api/documents", { workspaceId: software, scope: "workspace" }, { name: "x.txt", type: "text/plain", data: Buffer.from("x") });
    expect(share.status).toBe(403);
  });

  it("a guest chats and runs tasks inside the project, not outside it, and starts no projects", async () => {
    expect((await h.call(farah.j, "POST", "/api/chats", { workspaceId: software, projectId: adas })).status).toBe(200);
    const outside = await h.call(farah.j, "POST", "/api/chats", { workspaceId: software });
    expect(outside.status).toBe(403);
    expect(outside.json.error).toMatch(/guest/);
    expect((await h.call(farah.j, "POST", "/api/projects", { workspaceId: software, name: "Mine" })).status).toBe(403);
    // In their own team nothing changed.
    expect((await h.call(farah.j, "POST", "/api/chats", { workspaceId: firmware })).status).toBe(200);
  });

  it("adds a whole group at once; its people from other teams become guests", async () => {
    const g = await h.call(h.owner, "POST", "/api/admin/groups", { name: "ADAS core", memberIds: [h.ids.bob, gita.id] });
    expect(g.status).toBe(200);
    const r = await h.call(h.alice, "PUT", `/api/projects/${adas}/members`, { groupId: g.json.id, role: "edit" });
    expect(r.json).toMatchObject({ added: 2, guests: 1 });
    const detail = (await h.call(h.alice, "GET", `/api/projects/${adas}`)).json;
    expect(detail.members.map((m: any) => [m.name, m.role, m.guest])).toEqual(
      expect.arrayContaining([
        ["Bob Engineer", "edit", false],
        ["Gita Firmware", "edit", true],
      ]),
    );
    expect((await h.call(h.alice, "PUT", `/api/projects/${adas}/members`, { role: "chat" })).status).toBe(400);
  });

  it("leaving their last project there ends the guest membership; members stay members", async () => {
    expect((await h.call(h.alice, "DELETE", `/api/projects/${adas}/members/${farah.id}`)).status).toBe(200);
    const me = (await h.call(farah.j, "GET", "/api/me")).json;
    expect(me.workspaces.map((w: any) => w.id)).toEqual([firmware]);
    expect((await h.call(farah.j, "GET", `/api/projects/${adas}`)).status).toBe(404);
    expect((await h.call(h.alice, "DELETE", `/api/projects/${adas}/members/${h.ids.bob}`)).status).toBe(200);
    expect((await h.call(h.bob, "GET", "/api/me")).json.workspaces.map((w: any) => w.id)).toContain(software);
  });
});
