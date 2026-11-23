/**
 * Agent AI (the opencode engine, docs/22-agent-ai.md) through the API, with stub engines: a task on it goes to the
 * opencode engine (not Work AI's), is listed under Agent AI only, and is refused when an admin turns Agent AI off.
 */
import type { HarnessEngine, TaskSpec } from "@aatmiq/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";

const d = process.env.TEST_DATABASE_URL ? describe : describe.skip;

d("Agent AI", () => {
  let h: Harness;
  const ran: { engine: string; spec: TaskSpec }[] = [];
  const stub = (id: string): HarnessEngine => ({
    id,
    start: async (spec) => {
      ran.push({ engine: id, spec });
      return { sessionId: "s", alive: true, send: async () => undefined, stop: async () => undefined };
    },
  });

  beforeAll(async () => {
    h = await startHarness({}, { workEngine: stub("dsh"), opencodeEngine: stub("opencode") });
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Mock", type: "mock" });
    const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "aatmiq-demo", displayName: "Demo", contextLength: 65536, sections: ["chat", "work"] });
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [m.json.id], defaultModelId: m.json.id });
  }, 60_000);
  afterAll(async () => h?.close());

  it("is offered when installed, and its tasks run on the opencode engine", async () => {
    expect((await h.call(h.alice, "GET", `/api/work/info?workspaceId=${h.workspaceId}`)).json.agentAi).toBe(true);
    expect((await h.call(h.owner, "GET", "/api/admin/work")).json.agentAiInstalled).toBe(true);
    const t = await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Make a chart", engine: "opencode" });
    expect(t.status).toBe(200);
    expect(t.json.engine).toBe("opencode");
    for (let i = 0; i < 60 && !ran.length; i++) await new Promise((r) => setTimeout(r, 50));
    expect(ran.at(-1)?.engine).toBe("opencode");
    expect(ran.at(-1)?.spec.model.contextWindow).toBe(65536);
    // Listed under Agent AI only.
    const agent = (await h.call(h.alice, "GET", `/api/work/tasks?workspaceId=${h.workspaceId}&engine=opencode`)).json;
    const work = (await h.call(h.alice, "GET", `/api/work/tasks?workspaceId=${h.workspaceId}`)).json;
    expect(agent.map((x: { id: string }) => x.id)).toContain(t.json.id);
    expect(work.map((x: { id: string }) => x.id)).not.toContain(t.json.id);
  });

  it("is refused when an admin turns it off", async () => {
    await h.call(h.owner, "PUT", "/api/admin/work", { agentAi: false });
    expect((await h.call(h.alice, "GET", `/api/work/info?workspaceId=${h.workspaceId}`)).json.agentAi).toBe(false);
    const t = await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Make a chart", engine: "opencode" });
    expect(t.status).toBe(400);
    expect(t.json.error).toMatch(/Agent AI is turned off/);
  });
});
