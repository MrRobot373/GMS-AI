/** Claude Code's messages as Aatmiq's events. */
import { describe, expect, it } from "vitest";
import { mapMessage, newState, notRunReason, toolName } from "./claude/map";

const use = (id: string, name: string, input: unknown) => ({ type: "assistant", message: { id: `m_${id}`, content: [{ type: "text", text: "On it." }, { type: "tool_use", id, name, input }], usage: { input_tokens: 100, output_tokens: 7 } } });
const result = (id: string, content: unknown, is_error = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error }] } });

describe("tool names", () => {
  it("Claude Code's tools carry Work AI's names, and ours lose their prefix", () => {
    expect(["Bash", "Read", "Write", "Edit", "MultiEdit", "Skill", "mcp__aatmiq__web_fetch"].map(toolName)).toEqual(["bash", "read", "write", "edit", "edit", "Skill", "web_fetch"]);
  });
});

describe("a turn", () => {
  it("an assistant message is its words and calls, then a call event for each, with the tokens it used", () => {
    const ev = mapMessage(use("t1", "Bash", { command: "ls", description: "List" }), newState());
    expect(ev).toEqual([
      { type: "assistant", id: "m_t1", text: "On it.", toolCalls: [{ callId: "t1", name: "bash" }], usage: { inputTokens: 100, outputTokens: 7 } },
      { type: "tool_call", callId: "t1", name: "bash", args: { command: "ls", description: "List" } },
    ]);
  });

  it("results answer their calls; a failing command carries its exit code; a refusal reads as not run", () => {
    const st = newState();
    mapMessage(use("t1", "Bash", { command: "false" }), st);
    expect(mapMessage(result("t1", [{ type: "text", text: "Exit code 2\nboom" }], true), st)).toEqual([{ type: "tool_result", callId: "t1", text: "Exit code 2\nboom", isError: true, exitCode: 2 }]);
    mapMessage(use("t2", "Bash", { command: "rm x" }), st);
    const refused = mapMessage(result("t2", "The user doesn't want to proceed with this tool use. The tool use was rejected.", true), st)[0];
    expect(refused).toMatchObject({ isError: true, notRun: "The user doesn't want to proceed with this tool use. The tool use was rejected." });
    expect(notRunReason("<tool_use_error>InputValidationError: file_path is required</tool_use_error>")).toBe("InputValidationError: file_path is required");
    expect(notRunReason("it just failed")).toBeNull();
  });

  it("a subagent's steps are shown but its own words are not the task's", () => {
    const ev = mapMessage({ ...use("s1", "Read", { file_path: "/a" }), parent_tool_use_id: "agent1" }, newState());
    expect(ev.map((e) => e.type)).toEqual(["tool_call"]);
  });

  it("the end of a turn: done, cut off by length, or failed, each followed by idle", () => {
    expect(mapMessage({ type: "result", subtype: "success", is_error: false }, newState())).toEqual([{ type: "turn_end", reason: "completed" }, { type: "status", status: "idle" }]);
    expect(mapMessage({ type: "result", subtype: "success", is_error: false, stop_reason: "max_tokens" }, newState())[0]).toMatchObject({ reason: "max-tokens" });
    expect(mapMessage({ type: "result", subtype: "error_during_execution", is_error: true, errors: ["The model server answered 502"] }, newState())[0]).toEqual({ type: "turn_end", reason: "error", error: "The model server answered 502" });
  });

  it("condensing the context is reported with the tokens it freed", () => {
    expect(mapMessage({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 24000 } }, newState())[0]).toMatchObject({ type: "compacted", tokens: 24000 });
  });
});

describe("the plan", () => {
  it("TaskCreate adds items, the result gives each its number, TaskUpdate changes or removes them", () => {
    const st = newState();
    const plans = (ev: ReturnType<typeof mapMessage>) => ev.filter((e) => e.type === "plan").map((e) => (e as { items: { content: string; status: string }[] }).items);
    expect(plans(mapMessage(use("c1", "TaskCreate", { subject: "Write the data" }), st))).toEqual([[{ content: "Write the data", status: "pending" }]]);
    mapMessage(result("c1", "Task #1 created successfully"), st);
    mapMessage(use("c2", "TaskCreate", { subject: "Draw the chart" }), st);
    mapMessage(result("c2", "Task #2 created successfully"), st);
    expect(plans(mapMessage(use("u1", "TaskUpdate", { taskId: "1", status: "completed" }), st))).toEqual([[{ content: "Write the data", status: "completed" }, { content: "Draw the chart", status: "pending" }]]);
    expect(plans(mapMessage(use("u2", "TaskUpdate", { taskId: "2", status: "deleted" }), st))).toEqual([[{ content: "Write the data", status: "completed" }]]);
    expect(plans(mapMessage(use("u3", "TaskUpdate", { taskId: "99", status: "completed" }), st))).toEqual([]);
    // The older TodoWrite replaces the whole list.
    expect(plans(mapMessage(use("w1", "TodoWrite", { todos: [{ content: "A", status: "in_progress" }] }), st))).toEqual([[{ content: "A", status: "in_progress" }]]);
  });
});
