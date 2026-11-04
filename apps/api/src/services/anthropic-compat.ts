/**
 * The Anthropic Messages API on top of our gateway (Super AI, docs/20-super-ai.md). The Claude Code
 * engine speaks only the Anthropic format; our model servers speak OpenAI's. This turns a Messages
 * request into a chat-completions request, and the chat-completions reply (JSON or a stream) back
 * into a Messages reply, so the models, quotas and metering stay exactly those of Work AI.
 *
 * Pure functions: the route (routes/work-internal.ts) does the HTTP.
 */

/* ───────────── Request: Anthropic → OpenAI ───────────── */

type Block = { type: string; [k: string]: unknown };
export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Block[];
}
export interface AnthropicRequest {
  model?: string;
  max_tokens?: number;
  messages?: AnthropicMessage[];
  system?: string | Block[];
  tools?: { name?: string; description?: string; input_schema?: unknown; type?: string }[];
  tool_choice?: { type?: string; name?: string };
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

const textOf = (blocks: unknown): string =>
  typeof blocks === "string"
    ? blocks
    : Array.isArray(blocks)
      ? (blocks as Block[])
          .map((b) => (b.type === "text" && typeof b.text === "string" ? b.text : ""))
          .filter(Boolean)
          .join("\n")
      : "";

/** An image block as an OpenAI image part (a data URL for inline images), or null. */
function imagePart(b: Block): { type: "image_url"; image_url: { url: string } } | null {
  const s = b.source as { type?: string; media_type?: string; data?: string; url?: string } | undefined;
  if (!s) return null;
  if (s.type === "base64" && s.data) return { type: "image_url", image_url: { url: `data:${s.media_type ?? "image/png"};base64,${s.data}` } };
  if (s.type === "url" && s.url) return { type: "image_url", image_url: { url: s.url } };
  return null;
}

type OpenAiMessage = Record<string, unknown>;

/** The chat-completions body for a Messages request. */
export function toOpenAi(req: AnthropicRequest): Record<string, unknown> {
  const messages: OpenAiMessage[] = [];
  const system = textOf(req.system);
  if (system) messages.push({ role: "system", content: system });
  for (const m of req.messages ?? []) {
    const blocks: Block[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (m.role === "assistant") {
      const calls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: String(b.id ?? ""), type: "function", function: { name: String(b.name ?? ""), arguments: JSON.stringify(b.input ?? {}) } }));
      const text = textOf(blocks);
      // Thinking blocks are the model's own and carry a signature only Anthropic's API can check: left out.
      messages.push({ role: "assistant", content: text || (calls.length ? null : ""), ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    // A user turn: the results of earlier tool calls come first (each its own "tool" message, directly
    // after the assistant message that made the calls), then whatever else the person said.
    const results = blocks.filter((b) => b.type === "tool_result");
    const spill: unknown[] = [];
    for (const r of results) {
      const content = r.content;
      let text = textOf(content);
      if (Array.isArray(content)) {
        for (const b of content as Block[]) {
          const img = b.type === "image" ? imagePart(b) : null;
          if (img) {
            spill.push(img);
            text += `${text ? "\n" : ""}[image ${spill.length} follows]`;
          }
        }
      }
      if (r.is_error === true && text) text = `Error: ${text}`;
      messages.push({ role: "tool", tool_call_id: String(r.tool_use_id ?? ""), content: text || "(no output)" });
    }
    const parts: unknown[] = [];
    for (const b of blocks) {
      if (b.type === "text" && typeof b.text === "string" && b.text) parts.push({ type: "text", text: b.text });
      else if (b.type === "image") {
        const img = imagePart(b);
        if (img) parts.push(img);
      }
    }
    parts.push(...spill);
    if (parts.length) {
      const onlyText = parts.every((p) => (p as { type: string }).type === "text");
      messages.push({ role: "user", content: onlyText ? parts.map((p) => (p as { text: string }).text).join("\n") : parts });
    } else if (!results.length) messages.push({ role: "user", content: "" });
  }
  const tools = (req.tools ?? [])
    .filter((t) => t.name && t.input_schema && (!t.type || t.type === "custom"))
    .map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema } }));
  const choice = req.tool_choice?.type;
  const body: Record<string, unknown> = {
    messages,
    ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.top_p !== undefined ? { top_p: req.top_p } : {}),
    ...(req.stop_sequences?.length ? { stop: req.stop_sequences } : {}),
    stream: req.stream === true,
  };
  if (tools.length) {
    body.tools = tools;
    if (choice === "any") body.tool_choice = "required";
    else if (choice === "tool" && req.tool_choice?.name) body.tool_choice = { type: "function", function: { name: req.tool_choice.name } };
    else if (choice === "none") body.tool_choice = "none";
    else body.tool_choice = "auto";
  }
  return body;
}

/* ───────────── Reply: OpenAI → Anthropic ───────────── */

export type StopReason = "end_turn" | "max_tokens" | "tool_use" | "stop_sequence";
export const stopReason = (finish: string | null | undefined): StopReason =>
  finish === "length" ? "max_tokens" : finish === "tool_calls" || finish === "function_call" ? "tool_use" : "end_turn";

const messageId = () => `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const toolId = () => `toolu_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

interface Completion {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/** The Messages reply for a (non-streamed) chat completion. */
export function fromOpenAi(json: Completion, model: string): Record<string, unknown> {
  const choice = json.choices?.[0];
  const content: Block[] = [];
  const text = choice?.message?.content;
  if (text) content.push({ type: "text", text });
  for (const c of choice?.message?.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: c.id || toolId(), name: c.function?.name ?? "", input });
  }
  if (!content.length) content.push({ type: "text", text: "" });
  return {
    id: messageId(),
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: stopReason(choice?.finish_reason),
    stop_sequence: null,
    usage: { input_tokens: json.usage?.prompt_tokens ?? 0, output_tokens: json.usage?.completion_tokens ?? 0 },
  };
}

/** An error in the Messages format; the text Claude Code matches on to condense its context when a prompt is too long. */
export function anthropicError(status: number, message: string, code?: string): { status: number; body: { type: "error"; error: { type: string; message: string } } } {
  if (code === "context_length_exceeded") return { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: `prompt is too long: ${message}` } } };
  const type = status === 401 ? "authentication_error" : status === 402 || status === 403 ? "permission_error" : status === 404 ? "not_found_error" : status === 429 ? "rate_limit_error" : status === 529 || status === 503 ? "overloaded_error" : status >= 500 ? "api_error" : "invalid_request_error";
  return { status, body: { type: "error", error: { type, message } } };
}

/**
 * Turns the chat-completions stream into the Messages stream, a chunk at a time. `push` takes the
 * decoded text of the upstream (any split of it), `finish` closes the message. Each returns the
 * server-sent events to write.
 */
export class MessageStream {
  private buf = "";
  private started = false;
  private done = false;
  private open: { index: number; kind: "text" | "tool" } | null = null;
  private next = 0;
  private tools = new Map<number, { index: number; sentArgs: boolean }>();
  private pending = new Map<number, string>();
  private finish: string | null = null;
  private usage = { input: 0, output: 0 };
  private anything = false;

  constructor(
    private model: string,
    private inputGuess = 0,
  ) {}

  private ev(type: string, data: Record<string, unknown>) {
    return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  }

  private start(out: string[]) {
    if (this.started) return;
    this.started = true;
    out.push(this.ev("message_start", { message: { id: messageId(), type: "message", role: "assistant", model: this.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: this.inputGuess, output_tokens: 0 } } }));
  }

  private close(out: string[]) {
    if (!this.open) return;
    // A tool call that never got arguments is a call with none: say so, as the API does.
    if (this.open.kind === "tool") {
      const t = [...this.tools.values()].find((x) => x.index === this.open!.index);
      if (t && !t.sentArgs) {
        t.sentArgs = true;
        out.push(this.ev("content_block_delta", { index: t.index, delta: { type: "input_json_delta", partial_json: "{}" } }));
      }
    }
    out.push(this.ev("content_block_stop", { index: this.open.index }));
    this.open = null;
  }

  private line(raw: string, out: string[]) {
    if (!raw.startsWith("data:")) return;
    const data = raw.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let json: { choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } | null };
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    this.start(out);
    if (json.usage && typeof json.usage.prompt_tokens === "number") this.usage = { input: json.usage.prompt_tokens, output: json.usage.completion_tokens ?? 0 };
    const choice = json.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (delta?.content) {
      if (this.open?.kind !== "text") {
        this.close(out);
        this.open = { index: this.next++, kind: "text" };
        out.push(this.ev("content_block_start", { index: this.open.index, content_block: { type: "text", text: "" } }));
      }
      this.anything = true;
      out.push(this.ev("content_block_delta", { index: this.open.index, delta: { type: "text_delta", text: delta.content } }));
    }
    for (const tc of delta?.tool_calls ?? []) {
      const i = tc.index ?? 0;
      let t = this.tools.get(i);
      if (!t) {
        const name = tc.function?.name;
        if (!name) {
          // Arguments arrived before the name: keep them until it does.
          if (tc.function?.arguments) this.pending.set(i, (this.pending.get(i) ?? "") + tc.function.arguments);
          continue;
        }
        this.close(out);
        t = { index: this.next++, sentArgs: false };
        this.tools.set(i, t);
        this.open = { index: t.index, kind: "tool" };
        this.anything = true;
        out.push(this.ev("content_block_start", { index: t.index, content_block: { type: "tool_use", id: tc.id || toolId(), name, input: {} } }));
        const early = this.pending.get(i);
        this.pending.delete(i);
        if (early) {
          t.sentArgs = true;
          out.push(this.ev("content_block_delta", { index: t.index, delta: { type: "input_json_delta", partial_json: early } }));
        }
      }
      const args = tc.function?.arguments;
      if (args) {
        t.sentArgs = true;
        out.push(this.ev("content_block_delta", { index: t.index, delta: { type: "input_json_delta", partial_json: args } }));
      }
    }
    if (choice.finish_reason) this.finish = choice.finish_reason;
  }

  push(chunk: string): string {
    const out: string[] = [];
    this.buf += chunk;
    let at: number;
    while ((at = this.buf.indexOf("\n")) >= 0) {
      this.line(this.buf.slice(0, at).replace(/\r$/, ""), out);
      this.buf = this.buf.slice(at + 1);
    }
    return out.join("");
  }

  end(): string {
    if (this.done) return "";
    this.done = true;
    const out: string[] = [];
    if (this.buf.trim()) this.line(this.buf.trim(), out);
    this.buf = "";
    this.start(out);
    if (!this.anything) {
      this.close(out);
      this.open = { index: this.next++, kind: "text" };
      out.push(this.ev("content_block_start", { index: this.open.index, content_block: { type: "text", text: "" } }));
    }
    this.close(out);
    out.push(this.ev("message_delta", { delta: { stop_reason: stopReason(this.finish), stop_sequence: null }, usage: { input_tokens: this.usage.input || this.inputGuess, output_tokens: this.usage.output } }));
    out.push(this.ev("message_stop", {}));
    return out.join("");
  }
}
