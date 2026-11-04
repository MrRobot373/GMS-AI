/**
 * Claude Code SDK messages as Aatmiq's engine-neutral events (docs/20-super-ai.md). Pure, so the
 * mapping is tested without starting anything.
 *
 * Tool names are given Work AI's names (Bash → bash, Edit → edit…) so the task page, its file list
 * and the approval rules treat both engines alike; the arguments already match (command, file_path,
 * old_string, new_string…).
 */
import type { HarnessEvent } from "../types";

type Block = { type: string; [k: string]: unknown };
export interface SdkMessage {
  type: string;
  subtype?: string;
  uuid?: string;
  parent_tool_use_id?: string | null;
  message?: { id?: string; role?: string; content?: string | Block[]; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
  is_error?: boolean;
  result?: string;
  stop_reason?: string | null;
  compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number };
  errors?: string[];
}

const NAMES: Record<string, string> = {
  Bash: "bash",
  Read: "read",
  Write: "write",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Glob: "glob",
  Grep: "grep",
  TodoWrite: "todo_write",
  Task: "subagent",
  Agent: "subagent",
  BashOutput: "bash_output",
  KillShell: "kill_shell",
};

/** The name Work AI uses for a Claude Code tool (an MCP tool of ours loses its mcp__aatmiq__ prefix). */
export const toolName = (name: string): string => NAMES[name] ?? name.replace(/^mcp__aatmiq__/, "");

const blocksOf = (c: string | Block[] | undefined): Block[] => (typeof c === "string" ? [{ type: "text", text: c }] : (c ?? []));
const textOf = (c: string | Block[] | undefined): string =>
  blocksOf(c)
    .map((b) => (b.type === "text" && typeof b.text === "string" ? b.text : ""))
    .filter(Boolean)
    .join("\n");

/** Why a call never ran, from its error text: a refusal or arguments it couldn't take read "Not run", not "failed". */
export function notRunReason(text: string): string | null {
  const t = text.trim();
  const tagged = /^<tool_use_error>([\s\S]*)<\/tool_use_error>$/.exec(t);
  if (tagged) return tagged[1]!.trim().slice(0, 300);
  if (/^(Permission to use .+ has been denied|The user doesn't want to proceed|Not allowed)/.test(t)) return t.split("\n")[0]!.slice(0, 300);
  return null;
}

export interface MapState {
  /** Each call's tool, by id (a result is told apart by the call it answers). */
  calls: Map<string, string>;
  /** The plan Claude Code keeps with TaskCreate / TaskUpdate, as the person sees it. */
  plan: { id: string | null; content: string; status: string }[];
  /** A TaskCreate call's place in the plan until its result says which number it got. */
  creating: Map<string, number>;
}
export const newState = (): MapState => ({ calls: new Map(), plan: [], creating: new Map() });

const planEvent = (st: MapState): HarnessEvent => ({ type: "plan", items: st.plan.map((t) => ({ content: t.content, status: t.status })) });

/** TaskCreate and TaskUpdate (or the older TodoWrite) as changes to the plan; true when the plan changed. */
function trackPlan(name: string, callId: string, input: Record<string, unknown> | undefined, st: MapState): boolean {
  if (name === "TodoWrite") {
    const todos = input?.todos as { content?: string; status?: string }[] | undefined;
    if (!Array.isArray(todos)) return false;
    st.plan = todos.map((t) => ({ id: null, content: String(t.content ?? ""), status: String(t.status ?? "pending") }));
    return true;
  }
  if (name === "TaskCreate") {
    st.creating.set(callId, st.plan.push({ id: null, content: String(input?.subject ?? input?.description ?? "Task"), status: "pending" }) - 1);
    return true;
  }
  if (name === "TaskUpdate") {
    const id = String(input?.taskId ?? "");
    const at = st.plan.findIndex((t) => t.id === id);
    if (at < 0) return false;
    if (input?.status === "deleted") st.plan.splice(at, 1);
    else {
      if (typeof input?.status === "string") st.plan[at]!.status = input.status;
      if (typeof input?.subject === "string") st.plan[at]!.content = input.subject;
    }
    return true;
  }
  return false;
}

/** The events for one SDK message (none for the many it sends that people don't see). */
export function mapMessage(m: SdkMessage, st: MapState): HarnessEvent[] {
  const out: HarnessEvent[] = [];
  if (m.type === "assistant" && m.message) {
    const blocks = blocksOf(m.message.content);
    const uses = blocks.filter((b) => b.type === "tool_use");
    // A subagent's own words and plans are its own; its steps are shown (as for Work AI's subagents).
    const own = !m.parent_tool_use_id;
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => String(b.text ?? ""))
      .join("\n");
    const u = m.message.usage;
    if (own) {
      out.push({
        type: "assistant",
        id: String(m.message.id ?? m.uuid ?? ""),
        text,
        toolCalls: uses.map((b) => ({ callId: String(b.id), name: toolName(String(b.name)) })),
        ...(u ? { usage: { inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), outputTokens: u.output_tokens ?? 0 } } : {}),
      });
    }
    for (const b of uses) {
      const name = toolName(String(b.name));
      st.calls.set(String(b.id), name);
      if (st.calls.size > 500) st.calls.delete(st.calls.keys().next().value!);
      out.push({ type: "tool_call", callId: String(b.id), name, args: b.input });
      if (own && trackPlan(String(b.name), String(b.id), b.input as Record<string, unknown> | undefined, st)) out.push(planEvent(st));
    }
    return out;
  }
  if (m.type === "user" && m.message) {
    for (const b of blocksOf(m.message.content)) {
      if (b.type !== "tool_result") continue;
      const callId = String(b.tool_use_id ?? "");
      const text = textOf(b.content as string | Block[] | undefined);
      const name = st.calls.get(callId);
      st.calls.delete(callId);
      // A new plan item learns its number from the result ("Task #3 created").
      const slot = st.creating.get(callId);
      if (slot !== undefined) {
        st.creating.delete(callId);
        const n = /#(\d+)/.exec(text);
        if (n && st.plan[slot]) st.plan[slot]!.id = n[1]!;
      }
      const isError = b.is_error === true;
      const exit = isError && name === "bash" ? /^Exit code (\d+)/.exec(text) : null;
      const notRun = isError ? notRunReason(text) : null;
      out.push({ type: "tool_result", callId, text: notRun ? text.replace(/<\/?tool_use_error>/g, "") : text, isError, ...(exit ? { exitCode: Number(exit[1]) } : {}), ...(notRun ? { notRun } : {}) });
    }
    return out;
  }
  if (m.type === "system" && m.subtype === "compact_boundary") {
    const c = m.compact_metadata;
    out.push({ type: "compacted", summary: `Older steps were condensed to make room in the context window${c?.trigger ? ` (${c.trigger})` : ""}.`, steps: 0, tokens: c?.pre_tokens ?? 0 });
    return out;
  }
  if (m.type === "result") {
    const error = m.is_error ? (m.errors?.join("; ") || m.result || m.subtype || "The agent stopped.") : undefined;
    const reason = !m.is_error && m.subtype === "success" ? (m.stop_reason === "max_tokens" ? "max-tokens" : "completed") : m.subtype === "error_max_turns" ? "max-turns" : "error";
    out.push({ type: "turn_end", reason, ...(error ? { error: String(error).slice(0, 2000) } : {}) });
    out.push({ type: "status", status: "idle" });
  }
  return out;
}
