/**
 * A task that keeps researching (the one missing figure, pages that fail) is told to build with what it has: once after
 * RESEARCH_BUDGET web searches and page reads in a turn, once more after twice that, and never again.
 */
import type { HarnessEngine, HarnessEvent } from "@aatmiq/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { RESEARCH_BUDGET } from "./services/work";

const d = process.env.TEST_DATABASE_URL ? describe : describe.skip;

d("a research budget", () => {
  let h: Harness;
  let emit: ((e: HarnessEvent) => void) | null = null;
  const sent: string[] = [];
  const engine: HarnessEngine = {
    id: "stub",
    start: async (_spec, onEvent) => {
      emit = onEvent;
      return { sessionId: "s", alive: true, send: async (text) => void sent.push(text), stop: async () => undefined };
    },
  };
  beforeAll(async () => {
    h = await startHarness({}, { workEngine: engine });
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Mock", type: "mock" });
    const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "aatmiq-demo", displayName: "Demo", sections: ["chat", "work"] });
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [m.json.id], defaultModelId: m.json.id });
  }, 60_000);
  afterAll(async () => h?.close());

  it("says to build after the budget, again at twice it, then stops reminding", async () => {
    const t = await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Find IKEA sales by country and summarise them" });
    // Until the engine has started and been given the request.
    for (let i = 0; i < 400 && !(emit && sent.length); i++) await new Promise((r) => setTimeout(r, 50));
    expect(emit).not.toBeNull();
    const asked = sent.length;
    const research = async (from: number, n: number) => {
      for (let i = from; i < from + n; i++) {
        emit!({ type: "tool_call", callId: `c${i}`, name: i % 2 ? "web_fetch" : "web_search", args: {} });
        emit!({ type: "tool_result", callId: `c${i}`, text: "page text", isError: false });
      }
      await new Promise((r) => setTimeout(r, 300));
    };
    const reminders = () => sent.slice(asked).filter((s) => /Stop researching|No more research/.test(s));
    await research(0, RESEARCH_BUDGET - 1);
    expect(reminders()).toHaveLength(0);
    // Other tools don't count.
    emit!({ type: "tool_call", callId: "x1", name: "pwsh", args: { command: "python make.py" } });
    await research(100, 1);
    expect(reminders()).toHaveLength(1);
    expect(reminders()[0]).toMatch(new RegExp(`${RESEARCH_BUDGET} web searches and page reads.*build what the person asked`));
    await research(200, RESEARCH_BUDGET);
    expect(reminders()).toHaveLength(2);
    expect(reminders()[1]).toMatch(/No more research: write it now/);
    await research(300, RESEARCH_BUDGET * 2);
    expect(reminders()).toHaveLength(2);
    expect((await h.call(h.alice, "GET", `/api/work/tasks/${t.json.id}`)).json.task.status).toBe("running");
  }, 60_000);
});
