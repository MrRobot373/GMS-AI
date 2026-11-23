/** Agent AI (opencode) events as Aatmiq's (src/opencode/map.ts). */
import { describe, expect, it } from "vitest";
import { mapOpencodeEvent, newOpencodeState, permissionCall, toolName } from "./opencode/map";

const part = (p: Record<string, unknown>) => ({ type: "message.part.updated", properties: { sessionID: "ses_1", part: { sessionID: "ses_1", messageID: "msg_1", ...p } } });

describe("Agent AI events", () => {
  it("names tools as Work AI does", () => {
    expect(toolName("todowrite")).toBe("todo_write");
    expect(toolName("aatmiq_web_search")).toBe("web_search");
    expect(toolName("notes_create_note", ["notes"])).toBe("mcp__notes__create_note");
    expect(toolName("bash")).toBe("bash");
  });

  it("turns a tool part into one call and one result, with Work AI's argument names", () => {
    const st = newOpencodeState("ses_1");
    expect(mapOpencodeEvent(part({ id: "p1", type: "tool", callID: "c1", tool: "write", state: { status: "pending" } }), st)).toEqual([]);
    const running = mapOpencodeEvent(part({ id: "p1", type: "tool", callID: "c1", tool: "write", state: { status: "running", input: { filePath: "a.md", content: "x" } } }), st);
    expect(running.map((e) => e.type)).toEqual(["assistant", "tool_call"]);
    expect(running[1]).toMatchObject({ name: "write", args: { file_path: "a.md", content: "x" } });
    const done = mapOpencodeEvent(part({ id: "p1", type: "tool", callID: "c1", tool: "write", state: { status: "completed", input: {}, output: "Wrote a.md" } }), st);
    expect(done).toEqual([{ type: "tool_result", callId: "c1", text: "Wrote a.md", isError: false }]);
    // The same part again changes nothing.
    expect(mapOpencodeEvent(part({ id: "p1", type: "tool", callID: "c1", tool: "write", state: { status: "completed", output: "Wrote a.md" } }), st)).toEqual([]);
  });

  it("marks a failed command with its exit code, and a refused call as not run", () => {
    const st = newOpencodeState("ses_1");
    const failed = mapOpencodeEvent(part({ id: "p2", type: "tool", callID: "c2", tool: "bash", state: { status: "completed", input: { command: "false" }, output: "", metadata: { exit: 1 } } }), st);
    expect(failed.at(-1)).toMatchObject({ type: "tool_result", isError: true, exitCode: 1 });
    const refused = mapOpencodeEvent(part({ id: "p3", type: "tool", callID: "c3", tool: "bash", state: { status: "error", input: { command: "rm -rf x" }, error: "The person said no to this action." } }), st);
    expect(refused.at(-1)).toMatchObject({ isError: true, notRun: "The person said no to this action." });
  });

  it("shows finished text once, ends the turn when the session goes idle, and ignores other sessions", () => {
    const st = newOpencodeState("ses_1");
    st.turnOpen = true;
    expect(mapOpencodeEvent(part({ id: "t1", type: "text", text: "Done.", time: { start: 1 } }), st)).toEqual([]);
    expect(mapOpencodeEvent(part({ id: "t1", type: "text", text: "Done.", time: { start: 1, end: 2 } }), st)).toMatchObject([{ type: "assistant", text: "Done." }]);
    expect(mapOpencodeEvent({ type: "message.part.updated", properties: { sessionID: "ses_child", part: { id: "x", sessionID: "ses_child", type: "text", text: "sub", time: { end: 1 } } } }, st)).toEqual([]);
    expect(mapOpencodeEvent({ type: "session.idle", properties: { sessionID: "ses_1" } }, st)).toEqual([{ type: "turn_end", reason: "completed" }, { type: "status", status: "idle" }]);
    // Idle again without a new message: nothing.
    expect(mapOpencodeEvent({ type: "session.idle", properties: { sessionID: "ses_1" } }, st)).toEqual([]);
  });

  it("ends a turn with the model's error", () => {
    const st = newOpencodeState("ses_1");
    st.turnOpen = true;
    mapOpencodeEvent({ type: "session.error", properties: { sessionID: "ses_1", error: { name: "APIError", data: { message: "Provider returned 500" } } } }, st);
    expect(mapOpencodeEvent({ type: "session.idle", properties: { sessionID: "ses_1" } }, st)[0]).toEqual({ type: "turn_end", reason: "error", error: "Provider returned 500" });
  });

  it("never shows the condensed summary, nor a bare reply to opencode's own 'continue' after condensing", () => {
    const st = newOpencodeState("ses_1");
    st.turnOpen = true;
    expect(mapOpencodeEvent(part({ id: "a", type: "text", text: "Lines 2037, 2134.", time: { end: 1 } }), st)).toHaveLength(1);
    mapOpencodeEvent({ type: "message.updated", properties: { sessionID: "ses_1", info: { id: "msg_sum", sessionID: "ses_1", role: "assistant", summary: true, mode: "compaction" } } }, st);
    mapOpencodeEvent(part({ id: "c", type: "compaction", auto: true }), st);
    expect(mapOpencodeEvent({ type: "message.part.updated", properties: { sessionID: "ses_1", part: { id: "s", sessionID: "ses_1", messageID: "msg_sum", type: "text", text: "## Objective ...", time: { end: 2 } } } }, st)).toEqual([]);
    // "I don't have a clear next step": held back, dropped at the end of the turn.
    expect(mapOpencodeEvent({ type: "message.part.updated", properties: { sessionID: "ses_1", part: { id: "f", sessionID: "ses_1", messageID: "msg_2", type: "text", text: "What next?", time: { end: 3 } } } }, st)).toEqual([]);
    expect(mapOpencodeEvent({ type: "session.idle", properties: { sessionID: "ses_1" } }, st).map((e) => e.type)).toEqual(["turn_end", "status"]);
  });

  it("shows a held reply once the agent carries on working after condensing", () => {
    const st = newOpencodeState("ses_1");
    mapOpencodeEvent({ type: "session.compacted", properties: { sessionID: "ses_1" } }, st);
    expect(mapOpencodeEvent(part({ id: "t", type: "text", text: "Carrying on.", time: { end: 1 } }), st)).toEqual([]);
    const next = mapOpencodeEvent(part({ id: "p", type: "tool", callID: "c9", tool: "bash", state: { status: "running", input: { command: "ls" } } }), st);
    expect(next.map((e) => e.type)).toEqual(["assistant", "assistant", "tool_call"]);
    expect(next[0]).toMatchObject({ text: "Carrying on." });
  });

  it("passes the plan and condensing on", () => {
    const st = newOpencodeState("ses_1");
    expect(mapOpencodeEvent({ type: "todo.updated", properties: { sessionID: "ses_1", todos: [{ content: "Make chart", status: "in_progress" }] } }, st)).toEqual([{ type: "plan", items: [{ content: "Make chart", status: "in_progress" }] }]);
    expect(mapOpencodeEvent({ type: "session.compacted", properties: { sessionID: "ses_1" } }, st)[0]?.type).toBe("compacted");
  });
});

describe("Agent AI permission requests", () => {
  it("reads them in Work AI's terms, for the approval rules", () => {
    expect(permissionCall({ permission: "bash", patterns: ["rm -rf scratch"], metadata: { command: "rm -rf scratch" } }, "/w")).toMatchObject({ name: "bash", args: { command: "rm -rf scratch" }, outside: false });
    expect(permissionCall({ permission: "edit", metadata: { filepath: "/w/a.md" } }, "/w")).toMatchObject({ name: "write", outside: false });
    expect(permissionCall({ permission: "edit", metadata: { filepath: "/elsewhere/a.md" } }, "/w")).toMatchObject({ outside: true });
    expect(permissionCall({ permission: "external_directory", patterns: ["/etc/*"] }, "/w").outside).toBe(true);
    expect(permissionCall({ permission: "notes_create_note", metadata: {} }, "/w", ["notes"]).name).toBe("mcp__notes__create_note");
    expect(permissionCall({ permission: "doom_loop", metadata: { tool: "bash" } }, "/w").loop).toBe(true);
  });
});
