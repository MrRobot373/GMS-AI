/**
 * When the machine can't run commands at all (the Work AI runtime's command runner fails before anything runs), a task
 * stops after 3 such failures with the reason, instead of retrying for an hour. A command that ran and failed doesn't count.
 */
import type { HarnessEngine, HarnessEvent } from "@aatmiq/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";

const d = process.env.TEST_DATABASE_URL ? describe : describe.skip;

d("a broken command runner", () => {
  let h: Harness;
  let emit: (e: HarnessEvent) => void = () => undefined;
  const engine: HarnessEngine = {
    id: "stub",
    start: async (_spec, onEvent) => {
      emit = onEvent;
      return { sessionId: "s", alive: true, send: async () => undefined, stop: async () => undefined };
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

  const status = async (id: string) => (await h.call(h.alice, "GET", `/api/work/tasks/${id}`)).json.task;
  const call = async (n: number, text: string, isError: boolean) => {
    emit({ type: "tool_call", callId: `c${n}`, name: "bash", args: { command: "python make.py" } });
    emit({ type: "tool_result", callId: `c${n}`, text, isError });
    await new Promise((r) => setTimeout(r, 100));
  };

  it("stops after 3 runner failures in a row, saying why; ordinary failures don't count", async () => {
    const t = await h.call(h.alice, "POST", "/api/work/tasks", { workspaceId: h.workspaceId, prompt: "Make an Excel file" });
    for (let i = 0; i < 60 && !(await status(t.json.id))?.status?.match(/running/); i++) await new Promise((r) => setTimeout(r, 50));
    const broken = "subprocess-local: Windows Job runner exited with exit code 0 before proving its managed range empty";
    await call(1, broken, true);
    await call(2, broken, true);
    // A command that ran and failed resets the count.
    await call(3, "Traceback: NameError: name 'x' is not defined", true);
    await call(4, "ok", false);
    await call(5, broken, true);
    await call(6, broken, true);
    expect((await status(t.json.id)).status).toBe("running");
    await call(7, broken, true);
    const s = await status(t.json.id);
    expect(s.status).toBe("failed");
    expect(s.error).toMatch(/Commands can't run on this server/);
    expect(s.error).toMatch(/Windows Job runner/);
  });
});
