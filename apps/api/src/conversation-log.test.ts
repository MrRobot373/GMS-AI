/**
 * Recording conversations for compliance (services/conversation-log.ts): off by default; when on, every question and
 * answer is kept in a record that outlives the chat, only admins download it (CSV, logged), old records are removed after
 * the organization's period, and erasing a person removes theirs.
 */
import { conversationLog, sql } from "@aatmiq/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeTemporaryChats } from "./routes/chat";
import { startHarness, type Harness } from "../test/gem-harness";

const d = process.env.TEST_DATABASE_URL ? describe : describe.skip;

d("recording conversations", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({});
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Mock", type: "mock" });
    const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "aatmiq-demo", displayName: "Demo", sections: ["chat"] });
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [m.json.id], defaultModelId: m.json.id });
  }, 60_000);
  afterAll(async () => h?.close());

  const ask = async (text: string) => {
    const c = await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId });
    await h.call(h.alice, "POST", `/api/chats/${c.json.id}/messages`, { content: text });
    return c.json.id as string;
  };

  it("records nothing while it's off", async () => {
    expect((await h.call(h.owner, "GET", "/api/admin/settings")).json).toMatchObject({ promptLogging: false, conversationLogDays: 365, recordedMessages: 0 });
    await ask("Not recorded");
    expect((await h.db.select().from(conversationLog)).length).toBe(0);
  });

  it("when on, keeps every question and answer, also after the chat is deleted", async () => {
    await h.call(h.owner, "PUT", "/api/admin/settings", { promptLogging: true });
    const chatId = await ask("What is our leave policy?");
    expect((await h.call(h.alice, "DELETE", `/api/chats/${chatId}`)).status).toBeLessThan(300);
    const rows = await h.db.select().from(conversationLog);
    expect(rows.map((r) => r.role).sort()).toEqual(["assistant", "user"]);
    expect(rows.find((r) => r.role === "user")).toMatchObject({ content: "What is our leave policy?", userEmail: "alice@gem.test", chatId });
    expect(rows.find((r) => r.role === "assistant")!.content.length).toBeGreaterThan(0);
  });

  it("only admins download it, and the download is logged", async () => {
    expect((await h.call(h.alice, "GET", "/api/admin/conversation-log/export")).status).toBe(403);
    const r = await h.call(h.owner, "GET", "/api/admin/conversation-log/export");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.body).toContain("What is our leave policy?");
    expect(r.body).not.toContain("Not recorded");
    expect((await h.call(h.owner, "GET", "/api/admin/conversation-log/export?email=bob@gem.test")).body).not.toContain("leave policy");
    const log = (await h.call(h.owner, "GET", "/api/admin/audit?action=conversation_log.exported")).json;
    expect(JSON.stringify(log)).toContain("conversation_log.exported");
  });

  it("a question starting with = can't run as a formula in Excel", async () => {
    await ask("=HYPERLINK(\"http://evil\")");
    const r = await h.call(h.owner, "GET", "/api/admin/conversation-log/export");
    expect(r.body).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it("old records are removed after the organization's period", async () => {
    await h.db.execute(sql`update conversation_log set created_at = now() - interval '400 days' where content = 'What is our leave policy?'`);
    await purgeTemporaryChats(h.db);
    const left = await h.db.select().from(conversationLog);
    expect(left.some((r) => r.content === "What is our leave policy?")).toBe(false);
    expect(left.length).toBeGreaterThan(0);
    expect((await h.call(h.owner, "PUT", "/api/admin/settings", { conversationLogDays: 5 })).status).toBe(400);
  });
});
