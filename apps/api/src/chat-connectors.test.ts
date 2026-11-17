/**
 * Connected apps in chat (services/chat-connectors.ts): a connector's tools offered to Chat AI, against a real Postgres
 * (TEST_DATABASE_URL), a scripted model and a fake MCP mail server. A reading tool runs at once; one the connector's
 * ask-first list covers waits for the person in the chat, and runs only if they approve; a project that allows no
 * connectors gets none; admins can turn it off. Each use is audited.
 */
import { auditLog, eq, message } from "@aatmiq/db";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { asksFirst } from "./services/chat-connectors";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe("ask first, without a server", () => {
  it("follows the connector's list like Work AI: globs, with ! for exceptions", () => {
    const changes = "*,!search_*,!get_*,!list_*";
    expect(asksFirst(changes, "send_mail")).toBe(true);
    expect(asksFirst(changes, "search_mail")).toBe(false);
    expect(asksFirst("*", "search_mail")).toBe(true);
    expect(asksFirst("", "send_mail")).toBe(false);
    expect(asksFirst("create_*,merge_*", "create_issue")).toBe(true);
  });
});

d("connected apps in chat", () => {
  let h: Harness;
  let model: Server;
  let mcp: Server;
  let modelId = "";
  const sent: { to: string; body: string }[] = [];
  const modelSaw: { tools: string[]; messages: { role: string; content: string }[] }[] = [];

  beforeAll(async () => {
    // A tiny MCP mail server (streamable HTTP, JSON answers).
    mcp = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.method === "DELETE") return res.writeHead(200).end();
        const m = JSON.parse(raw || "{}");
        if (!("id" in m)) return res.writeHead(202).end();
        const reply = (result: unknown) => res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "s1" }).end(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }));
        if (m.method === "initialize") return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "mail" } });
        if (m.method === "tools/list")
          return reply({
            tools: [
              { name: "search_mail", description: "Search the mailbox", inputSchema: { type: "object", properties: { q: { type: "string" } } }, annotations: { readOnlyHint: true } },
              { name: "send_mail", description: "Send an email", inputSchema: { type: "object", properties: { to: { type: "string" }, body: { type: "string" } } } },
            ],
          });
        if (m.method === "tools/call") {
          const { name, arguments: a } = m.params;
          if (name === "search_mail") return reply({ content: [{ type: "text", text: `2 emails about ${a.q}: "Buck converter review moved to Friday".` }] });
          sent.push({ to: a.to, body: a.body });
          return reply({ content: [{ type: "text", text: `Sent to ${a.to}.` }] });
        }
        reply({});
      });
    });
    await new Promise<void>((r) => mcp.listen(0, "127.0.0.1", r));
    // The scripted model: one tool call per message kind, then an answer from the result.
    model = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.url === "/v1/models") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        const body = JSON.parse(raw || "{}");
        const r = { tools: (body.tools ?? []).map((t: any) => t.function.name), messages: body.messages ?? [] };
        modelSaw.push(r);
        const user: string = r.messages.filter((x: any) => x.role === "user").at(-1)?.content ?? "";
        const result = r.messages.filter((x: any) => x.role === "tool").at(-1)?.content;
        res.writeHead(200, { "content-type": "text/event-stream" });
        let call: { name: string; args: object } | null = null;
        if (!result && user.includes("FIND") && r.tools.includes("mail__search_mail")) call = { name: "mail__search_mail", args: { q: "review" } };
        if (!result && user.includes("SEND") && r.tools.includes("mail__send_mail")) call = { name: "mail__send_mail", args: { to: "asha@example.com", body: "Review is on Friday." } };
        if (call) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } }] } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: result ? `Result: ${result}` : "No apps used." } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
        }
        res.end("data: [DONE]\n\n");
      });
    });
    await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
    h = await startHarness();
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Model server", type: "openai_compatible", baseUrl: `http://127.0.0.1:${(model.address() as { port: number }).port}/v1` });
    modelId = (await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "std-1", displayName: "std-1", contextLength: 65536, tier: "standard", thinkingSwitch: false, vision: false, sections: ["chat"] })).json.id;
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [modelId], defaultModelId: modelId });
    const c = await h.call(h.owner, "POST", "/api/admin/connectors", {
      name: "mail",
      displayName: "Mail",
      url: `http://127.0.0.1:${(mcp.address() as { port: number }).port}/mcp`,
      auth: "none",
      approveTools: "*,!search_*",
    });
    expect(c.status).toBe(200);
  }, 60_000);
  afterAll(async () => {
    await h?.close();
    for (const s of [model, mcp]) await new Promise<void>((r) => s?.close(() => r()));
  });

  const newChat = async (extra: Record<string, unknown> = {}) => (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId, ...extra })).json.id as string;
  const lastAnswer = async (chatId: string) => (await h.db.select().from(message).where(eq(message.chatId, chatId))).filter((m) => m.role === "assistant").sort((a, b) => +a.createdAt - +b.createdAt).at(-1)!;

  /** Send a message; while it streams, answer the approval it waits for (when `approve` is given). */
  async function ask(chatId: string, content: string, approve?: boolean) {
    const reply = h.call(h.alice, "POST", `/api/chats/${chatId}/messages`, { content, modelId });
    if (approve !== undefined) {
      let waiting: any[] = [];
      for (let i = 0; i < 100 && !waiting.length; i++) {
        await new Promise((r) => setTimeout(r, 50));
        waiting = (await h.call(h.alice, "GET", `/api/chats/${chatId}/approvals`)).json.approvals;
      }
      expect(waiting).toEqual([expect.objectContaining({ connector: "Mail", tool: "send_mail", args: { to: "asha@example.com", body: "Review is on Friday." } })]);
      // Only the chat's own person can answer.
      expect((await h.call(h.bob, "POST", `/api/chats/${chatId}/approvals/${waiting[0].id}`, { approve: true })).status).toBe(404);
      expect((await h.call(h.alice, "POST", `/api/chats/${chatId}/approvals/${waiting[0].id}`, { approve })).status).toBe(200);
    }
    const r = await reply;
    expect(r.status).toBe(200);
    return { body: r.body, saved: await lastAnswer(chatId) };
  }

  it("offers the person's connectors and runs a reading tool at once", async () => {
    const chatId = await newChat();
    const r = await ask(chatId, "FIND the review email");
    expect(modelSaw.at(-2)!.tools).toEqual(expect.arrayContaining(["mail__search_mail", "mail__send_mail"]));
    expect(modelSaw.at(-2)!.messages[0]!.content).toMatch(/connected apps: Mail/);
    expect(r.saved.content).toBe('Result: 2 emails about review: "Buck converter review moved to Friday".');
    expect(r.saved.steps).toEqual([{ tool: "connector", detail: "Mail: search_mail", outcome: "ok" }]);
    expect(r.body).not.toContain("event: approval");
  });

  it("waits for the person before a tool that changes something, and sends only when approved", async () => {
    const declined = await ask(await newChat(), "SEND the summary", false);
    expect(sent).toEqual([]);
    expect(declined.saved.content).toMatch(/^Result: The person declined this/);
    expect(declined.saved.steps).toEqual([{ tool: "connector", detail: "Mail: send_mail", outcome: "declined" }]);

    const approved = await ask(await newChat(), "SEND the summary", true);
    expect(sent).toEqual([{ to: "asha@example.com", body: "Review is on Friday." }]);
    expect(approved.saved.content).toBe("Result: Sent to asha@example.com.");
    expect(approved.body).toMatch(/event: approval\n/);
    expect(approved.body).toMatch(/event: approval_done\ndata: \{"id":"[^"]+","decision":"approved"\}/);
    const audits = await h.db.select().from(auditLog).where(eq(auditLog.action, "chat.connector_used"));
    expect(audits.map((a) => (a.meta as any).decision).sort()).toEqual(["approved", "approved", "declined"]);
  });

  it("a project's connector choice applies to its chats; admins can turn connectors in chat off", async () => {
    const proj = (await h.call(h.alice, "POST", "/api/projects", { workspaceId: h.workspaceId, name: "No apps" })).json.id;
    expect((await h.call(h.alice, "PATCH", `/api/projects/${proj}`, { connectorIds: [] })).status).toBe(200);
    const r = await ask(await newChat({ projectId: proj }), "FIND it");
    expect(modelSaw.at(-1)!.tools).not.toContain("mail__search_mail");
    expect(r.saved.content).toBe("No apps used.");

    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { chatConnectors: false })).status).toBe(200);
    await ask(await newChat(), "FIND it");
    expect(modelSaw.at(-1)!.tools).not.toContain("mail__search_mail");
  });
});
