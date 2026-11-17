/**
 * A project's own budget (docs/03-projects.md, "Project budget"): a total per period for everyone in the project, and
 * each person's share of it (their own amount, else the project's per-person amount, else the total split evenly). It
 * applies on top of the workspace's budget, and every call made in the project is counted against it, split into Chat
 * and Work AI, for the project page and the admin usage report.
 */
import { usageEvent } from "@aatmiq/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { quotaFor, quotaMessage } from "./services/quota";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("project budget", () => {
  let h: Harness;
  let adas = "";
  const use = (userId: string, section: "chat" | "work" | "knowledge", tokens: number, projectId: string | null = adas) =>
    h.db.insert(usageEvent).values({ workspaceId: h.workspaceId, userId, projectId, section, inputTokens: tokens, outputTokens: 0 });

  beforeAll(async () => {
    h = await startHarness();
    adas = (await h.call(h.alice, "POST", "/api/projects", { workspaceId: h.workspaceId, name: "ADAS" })).json.id;
    await h.call(h.alice, "PUT", `/api/projects/${adas}/members`, { userId: h.ids.bob, role: "edit" });
  }, 60_000);
  afterAll(async () => h?.close());

  it("has none until the owner or an admin sets one; editors can't", async () => {
    expect((await quotaFor(h.db, h.workspaceId, h.ids.bob, null, adas)).status.scope.kind).toBe("workspace");
    expect((await h.call(h.bob, "PUT", `/api/projects/${adas}/budget`, { tokenLimit: 1000 })).status).toBe(403);
    expect((await h.call(h.alice, "PUT", `/api/projects/${adas}/budget`, { tokenLimit: 1000 })).status).toBe(200);
    const b = (await h.call(h.bob, "GET", `/api/projects/${adas}/budget`)).json;
    // Alice (owner) and Bob share it evenly.
    expect(b).toMatchObject({ tokenLimit: 1000, memberTokenLimit: null, perPerson: 500, canManage: false });
  });

  it("counts each call made in the project, split into Chat and Work AI, per person", async () => {
    await use(h.ids.alice, "chat", 300);
    await use(h.ids.bob, "work", 250);
    await use(h.ids.bob, "knowledge", 50);
    await use(h.ids.bob, "chat", 9999, null); // outside the project: not counted here
    const b = (await h.call(h.alice, "GET", `/api/projects/${adas}/budget`)).json;
    expect(b.used).toEqual({ chat: 300, work: 250, other: 50, total: 600 });
    expect(b.canManage).toBe(true);
    const bob = b.people.find((p: any) => p.userId === h.ids.bob);
    expect(bob).toMatchObject({ allowance: 500, used: { chat: 0, work: 250, other: 50, total: 300 } });
    // Someone who only chats sees the totals and their own row.
    await h.call(h.alice, "PUT", `/api/projects/${adas}/members`, { userId: h.ids.owner, role: "chat" });
  });

  it("refuses a call once a person's share or the project's total is used up, whatever the workspace allows", async () => {
    // Three people now: 1000 / 3 each.
    let q = (await quotaFor(h.db, h.workspaceId, h.ids.bob, null, adas)).status;
    expect(q.scope).toMatchObject({ kind: "project", name: "ADAS" });
    expect(q.result).toMatchObject({ allowed: true, remaining: 33 });
    await use(h.ids.bob, "work", 40);
    q = (await quotaFor(h.db, h.workspaceId, h.ids.bob, null, adas)).status;
    expect(q.result).toMatchObject({ allowed: false, blockedBy: "user" });
    expect(quotaMessage(q)).toBe("You've used your share of the ADAS project's tokens for this period.");
    // A larger share for Bob: now the project's total is what stops him.
    expect((await h.call(h.alice, "PUT", `/api/projects/${adas}/budget/people/${h.ids.bob}`, { tokenLimit: 5000 })).status).toBe(200);
    q = (await quotaFor(h.db, h.workspaceId, h.ids.bob, null, adas)).status;
    expect(q.result).toMatchObject({ allowed: true, remaining: 360 });
    await use(h.ids.bob, "work", 400);
    q = (await quotaFor(h.db, h.workspaceId, h.ids.bob, null, adas)).status;
    expect(q.result).toMatchObject({ allowed: false, blockedBy: "project" });
    expect(quotaMessage(q)).toBe("The ADAS project has used its tokens for this period.");
    // Outside the project nothing changed.
    expect((await quotaFor(h.db, h.workspaceId, h.ids.bob, null, null)).status.result.allowed).toBe(true);
    // The owner's share follows the per-person amount; it has no row of its own.
    expect((await h.call(h.alice, "PUT", `/api/projects/${adas}/budget/people/${h.ids.alice}`, { tokenLimit: 1 })).status).toBe(404);
  });

  it("a per-person amount replaces the even split; clearing the budget lifts it", async () => {
    expect((await h.call(h.alice, "PUT", `/api/projects/${adas}/budget`, { tokenLimit: null, memberTokenLimit: 2000 })).status).toBe(200);
    const q = (await quotaFor(h.db, h.workspaceId, h.ids.alice, null, adas)).status;
    expect(q.result).toMatchObject({ allowed: true, remaining: 1700 });
    await h.call(h.alice, "PUT", `/api/projects/${adas}/budget/people/${h.ids.bob}`, { tokenLimit: null });
    await h.call(h.alice, "PUT", `/api/projects/${adas}/budget`, { memberTokenLimit: null });
    expect((await quotaFor(h.db, h.workspaceId, h.ids.bob, null, adas)).status.scope.kind).toBe("workspace");
  });

  it("shows each project's use in the admin usage report", async () => {
    const r = (await h.call(h.owner, "GET", "/api/admin/usage?days=7")).json;
    expect(r.byProject).toEqual([expect.objectContaining({ id: adas, name: "ADAS", tokens: 1040, chat: 300, work: 690, people: 2 })]);
  });
});
