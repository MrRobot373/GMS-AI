/**
 * opencode's server events as Aatmiq's engine-neutral events (Agent AI). Pure, so the mapping is tested without
 * starting anything. Tool names and arguments get Work AI's (filePath → file_path, todowrite → todo_write…) so the task
 * page, its file list and the approval rules treat every engine alike.
 */
import { isAbsolute, relative, resolve } from "node:path";
import type { HarnessEvent } from "../types";

export interface OpencodeEvent {
  type: string;
  properties: Record<string, any>;
}

const NAMES: Record<string, string> = {
  todowrite: "todo_write",
  todoread: "todo_read",
  task: "subagent",
  multiedit: "edit",
  apply_patch: "edit",
  patch: "edit",
  list: "ls",
};

/** Work AI's name for an opencode tool: Aatmiq's own lose their aatmiq_ prefix, a connector's become mcp__<name>__<tool>. */
export function toolName(name: string, connectors: string[] = []): string {
  if (NAMES[name]) return NAMES[name]!;
  if (name.startsWith("aatmiq_")) return name.slice("aatmiq_".length);
  const c = connectors.find((n) => name.startsWith(`${n}_`));
  return c ? `mcp__${c}__${name.slice(c.length + 1)}` : name;
}

/** Work AI's argument names (the timeline and the rules read file_path, old_string, new_string). */
export function toolArgs(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const a = { ...(input as Record<string, unknown>) };
  const rename: Record<string, string> = { filePath: "file_path", oldString: "old_string", newString: "new_string", replaceAll: "replace_all" };
  for (const [from, to] of Object.entries(rename))
    if (from in a) {
      a[to] = a[from];
      delete a[from];
    }
  return a;
}

export interface OpencodeState {
  sessionId: string;
  connectors: string[];
  /** Calls already announced, and those already answered. */
  called: Set<string>;
  answered: Set<string>;
  /** Text parts already shown. */
  texts: Set<string>;
  turnOpen: boolean;
  turnError: string | null;
  /** Messages that are opencode's condensed summaries (never shown). */
  hidden: Set<string>;
  /** Condensing happened this turn: opencode then asks the model to "continue", and a text-only reply to that is filler. */
  afterCompaction: boolean;
  held: HarnessEvent[];
}
export const newOpencodeState = (sessionId: string, connectors: string[] = []): OpencodeState => ({
  sessionId,
  connectors,
  called: new Set(),
  answered: new Set(),
  texts: new Set(),
  turnOpen: false,
  turnError: null,
  hidden: new Set(),
  afterCompaction: false,
  held: [],
});

function errorText(err: unknown): string {
  if (!err || typeof err !== "object") return String(err ?? "The agent stopped.");
  const e = err as { name?: string; data?: { message?: string }; message?: string };
  return String(e.data?.message ?? e.message ?? e.name ?? "The agent stopped.").slice(0, 2000);
}

/** The events for one opencode event (none for the many people don't see). */
export function mapOpencodeEvent(ev: OpencodeEvent, st: OpencodeState): HarnessEvent[] {
  const p = ev.properties ?? {};
  // Only this task's session: a sub-agent's own steps run in a child session.
  const sid = p.sessionID ?? p.part?.sessionID ?? p.info?.sessionID ?? p.info?.id;
  if (sid && sid !== st.sessionId) return [];
  const out: HarnessEvent[] = [];
  if (ev.type === "message.updated") {
    const info = (p.info ?? {}) as Record<string, any>;
    if (info.summary === true || info.mode === "compaction" || info.agent === "compaction") st.hidden.add(String(info.id));
    return out;
  }
  if (ev.type === "message.part.updated") {
    const part = p.part as Record<string, any>;
    if (part.type === "compaction") {
      st.afterCompaction = true;
      return out;
    }
    if (part.type === "text" && !part.synthetic && part.time?.end && !st.texts.has(part.id) && !st.hidden.has(String(part.messageID))) {
      st.texts.add(part.id);
      const text = String(part.text ?? "");
      if (text.trim()) {
        const e: HarnessEvent = { type: "assistant", id: String(part.messageID ?? part.id), text, toolCalls: [] };
        // After condensing, a reply is shown only once the agent does something again (a bare "done" or "what next?" isn't).
        if (st.afterCompaction) st.held.push(e);
        else out.push(e);
      }
    } else if (part.type === "tool") {
      if (st.afterCompaction) {
        out.push(...st.held);
        st.held = [];
        st.afterCompaction = false;
      }
      const callId = String(part.callID ?? part.id);
      const name = toolName(String(part.tool ?? ""), st.connectors);
      const state = (part.state ?? {}) as Record<string, any>;
      if (!st.called.has(callId) && state.status !== "pending") {
        st.called.add(callId);
        out.push({ type: "assistant", id: String(part.messageID ?? callId), text: "", toolCalls: [{ callId, name }] });
        out.push({ type: "tool_call", callId, name, args: toolArgs(state.input) });
        if (name === "todo_write" && Array.isArray(state.input?.todos))
          out.push({ type: "plan", items: (state.input.todos as { content?: string; status?: string }[]).map((t) => ({ content: String(t.content ?? ""), status: String(t.status ?? "pending") })) });
      }
      if ((state.status === "completed" || state.status === "error") && !st.answered.has(callId)) {
        st.answered.add(callId);
        const isError = state.status === "error";
        const text = isError ? String(state.error ?? "Failed") : String(state.output ?? "");
        const exit = name === "bash" ? (state.metadata?.exit ?? state.metadata?.exitCode) : undefined;
        const refused = isError && /rejected|denied|said no|not allowed|No one was available/i.test(text);
        out.push({
          type: "tool_result",
          callId,
          text,
          isError: isError || (typeof exit === "number" && exit !== 0),
          ...(typeof exit === "number" && exit !== 0 ? { exitCode: exit } : {}),
          ...(refused ? { notRun: text.split("\n")[0]!.slice(0, 300) } : {}),
        });
      }
    }
    return out;
  }
  if (ev.type === "todo.updated" && Array.isArray(p.todos)) {
    out.push({ type: "plan", items: (p.todos as { content?: string; status?: string }[]).map((t) => ({ content: String(t.content ?? ""), status: String(t.status ?? "pending") })) });
    return out;
  }
  if (ev.type === "session.compacted") {
    st.afterCompaction = true;
    out.push({ type: "compacted", summary: "Older steps were condensed to make room in the context window.", steps: 0, tokens: 0 });
    return out;
  }
  if (ev.type === "session.error") {
    st.turnError = errorText(p.error);
    if (/abort/i.test(String(p.error?.name ?? ""))) st.turnError = null;
    return out;
  }
  const idle = ev.type === "session.idle" || (ev.type === "session.status" && p.status?.type === "idle");
  if (idle && st.turnOpen) {
    st.turnOpen = false;
    st.held = [];
    st.afterCompaction = false;
    out.push({ type: "turn_end", reason: st.turnError ? "error" : "completed", ...(st.turnError ? { error: st.turnError } : {}) });
    out.push({ type: "status", status: "idle" });
    st.turnError = null;
  }
  return out;
}

/** What an opencode permission request is, in Work AI's terms (for the approval rules). */
export function permissionCall(p: Record<string, any>, workdir: string, connectors: string[] = []): { name: string; args: Record<string, unknown>; outside: boolean; loop: boolean } {
  const kind = String(p.permission ?? p.type ?? "");
  const meta = (p.metadata ?? {}) as Record<string, any>;
  const patterns: string[] = Array.isArray(p.patterns) ? p.patterns : p.pattern ? [].concat(p.pattern) : [];
  if (kind === "bash") return { name: "bash", args: { command: String(meta.command ?? patterns.join(" ")) }, outside: false, loop: false };
  if (kind === "external_directory") {
    // The folder it wants (opencode gives a glob like "E:\data\*"): so Aatmiq's own data can be refused outright.
    const dir = String(meta.filepath ?? meta.filePath ?? meta.parentDir ?? patterns[0] ?? "").replace(/[\\/]?\*+$/, "");
    return { name: "read", args: dir ? { path: dir } : {}, outside: true, loop: false };
  }
  if (kind === "doom_loop") return { name: String(meta.tool ?? "tool"), args: {}, outside: false, loop: true };
  if (kind === "edit" || kind === "write") {
    const file = String(meta.filepath ?? meta.filePath ?? patterns[0] ?? "");
    const abs = file ? resolve(workdir, file) : workdir;
    const rel = relative(workdir, abs);
    return { name: "write", args: { file_path: file }, outside: !!file && (rel.startsWith("..") || isAbsolute(rel)), loop: false };
  }
  return { name: toolName(kind, connectors), args: (toolArgs(meta.input ?? meta) as Record<string, unknown>) ?? {}, outside: false, loop: false };
}
