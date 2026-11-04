/**
 * The Anthropic Messages API on our gateway: what Claude Code sends becomes an ordinary chat
 * completion, and what comes back is read as Messages.
 */
import { describe, expect, it } from "vitest";
import { anthropicError, fromOpenAi, MessageStream, repairJson, stopReason, toOpenAi } from "./services/anthropic-compat";

describe("a Messages request as a chat completion", () => {
  it("turns system, text, tool calls and their results into the chat roles, results straight after the calls", () => {
    const body = toOpenAi({
      model: "claude-sonnet-5-5",
      max_tokens: 4096,
      system: [{ type: "text", text: "You are an agent." }, { type: "text", text: "Be brief." }],
      stream: true,
      stop_sequences: ["END"],
      messages: [
        { role: "user", content: "List the files" },
        { role: "assistant", content: [{ type: "thinking", thinking: "hmm", signature: "x" }, { type: "text", text: "Looking." }, { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "a.txt\nb.txt" }] }, { type: "text", text: "<system-reminder>go on</system-reminder>" }] },
      ],
      tools: [{ name: "Bash", description: "Run a command", input_schema: { type: "object", properties: { command: { type: "string" } } } }, { type: "web_search_20250305", name: "web_search" }],
      tool_choice: { type: "auto" },
    });
    expect(body.messages).toEqual([
      { role: "system", content: "You are an agent.\nBe brief." },
      { role: "user", content: "List the files" },
      { role: "assistant", content: "Looking.", tool_calls: [{ id: "toolu_1", type: "function", function: { name: "Bash", arguments: '{"command":"ls"}' } }] },
      { role: "tool", tool_call_id: "toolu_1", content: "a.txt\nb.txt" },
      { role: "user", content: "<system-reminder>go on</system-reminder>" },
    ]);
    expect(body.tools).toEqual([{ type: "function", function: { name: "Bash", description: "Run a command", parameters: { type: "object", properties: { command: { type: "string" } } } } }]);
    expect(body).toMatchObject({ max_tokens: 4096, stream: true, stop: ["END"], tool_choice: "auto" });
  });

  it("marks a failed tool result, keeps images as image parts, and maps tool_choice", () => {
    const b = toOpenAi({
      max_tokens: 10,
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "no such file" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }, { type: "text", text: "what is this?" }] },
      ],
      tools: [{ name: "Read", input_schema: {} }],
      tool_choice: { type: "any" },
    });
    expect(b.messages).toEqual([
      { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "Read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "t1", content: "Error: no such file" },
      { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }, { type: "text", text: "what is this?" }] },
    ]);
    expect(b.tool_choice).toBe("required");
    expect(toOpenAi({ max_tokens: 1, messages: [], tools: [{ name: "X", input_schema: {} }], tool_choice: { type: "tool", name: "X" } }).tool_choice).toEqual({ type: "function", function: { name: "X" } });
  });
});

describe("a chat completion as a Messages reply", () => {
  it("text and tool calls become content blocks; the finish reason and usage carry over", () => {
    const r = fromOpenAi({ choices: [{ message: { content: "Running it.", tool_calls: [{ id: "call_9", function: { name: "Bash", arguments: '{"command":"ls"}' } }, { function: { name: "Bad", arguments: "{oops" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 120, completion_tokens: 15 } }, "m");
    expect(r).toMatchObject({ type: "message", role: "assistant", model: "m", stop_reason: "tool_use", usage: { input_tokens: 120, output_tokens: 15 } });
    const content = r.content as Record<string, unknown>[];
    expect(content[0]).toEqual({ type: "text", text: "Running it." });
    expect(content[1]).toEqual({ type: "tool_use", id: "call_9", name: "Bash", input: { command: "ls" } });
    expect(content[2]).toMatchObject({ type: "tool_use", name: "Bad", input: {} });
    expect(String((content[2] as { id: string }).id)).toMatch(/^toolu_/);
    expect(stopReason("length")).toBe("max_tokens");
    expect(stopReason("stop")).toBe("end_turn");
  });

  it("errors use the Messages shape, and an overflow reads as 'prompt is too long' so Claude Code condenses", () => {
    expect(anthropicError(429, "slow down")).toEqual({ status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } });
    expect(anthropicError(402, "allowance").body.error.type).toBe("permission_error");
    // A provider's 413 (a per-minute token cap) keeps its own words and isn't dressed up as a 32 MB image problem.
    const big = anthropicError(413, "The model server answered 413: Limit 8000, Requested 8027");
    expect(big.status).toBe(400);
    expect(big.body.error.message).toContain("per-minute token limit");
    expect(big.body.error.message).toContain("Limit 8000, Requested 8027");
    const o = anthropicError(400, "this request needs 40,000 tokens", "context_length_exceeded");
    expect(o.body.error).toEqual({ type: "invalid_request_error", message: "prompt is too long: this request needs 40,000 tokens" });
  });
});

const sse = (...chunks: unknown[]) => chunks.map((c) => `data: ${typeof c === "string" ? c : JSON.stringify(c)}\n\n`).join("");
const events = (text: string) => text.split("\n\n").filter(Boolean).map((e) => JSON.parse(e.split("\ndata: ")[1]!) as Record<string, any>);

describe("the stream", () => {
  it("a text answer: start, one text block of deltas, stop, with the usage", () => {
    const s = new MessageStream("m", 50);
    const out = s.push(sse({ choices: [{ delta: { role: "assistant", content: "Hel" } }] }, { choices: [{ delta: { content: "lo" } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 60, completion_tokens: 4 } }, "[DONE]")) + s.end();
    const ev = events(out);
    expect(ev.map((e) => e.type)).toEqual(["message_start", "content_block_start", "content_block_delta", "content_block_delta", "content_block_stop", "message_delta", "message_stop"]);
    expect(ev[2]!.delta).toEqual({ type: "text_delta", text: "Hel" });
    expect(ev[5]).toMatchObject({ delta: { stop_reason: "end_turn" }, usage: { input_tokens: 60, output_tokens: 4 } });
  });

  it("text then a tool call: two blocks, the arguments streamed as partial JSON, stop reason tool_use; any split of the bytes", () => {
    const whole = sse(
      { choices: [{ delta: { content: "Checking." } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "Bash", arguments: "" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"command":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"ls"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    );
    const s = new MessageStream("m");
    let out = "";
    for (let i = 0; i < whole.length; i += 7) out += s.push(whole.slice(i, i + 7)); // an awkward split
    out += s.end();
    const ev = events(out);
    const starts = ev.filter((e) => e.type === "content_block_start");
    expect(starts.map((e) => e.content_block.type)).toEqual(["text", "tool_use"]);
    expect(starts[1]!.content_block).toMatchObject({ id: "call_1", name: "Bash", input: {} });
    const json = ev.filter((e) => e.delta?.type === "input_json_delta").map((e) => e.delta.partial_json).join("");
    expect(JSON.parse(json)).toEqual({ command: "ls" });
    expect(ev.find((e) => e.type === "message_delta")!.delta.stop_reason).toBe("tool_use");
    // Each block is closed before the next opens.
    const order = ev.filter((e) => e.type.startsWith("content_block_") && e.type !== "content_block_delta").map((e) => `${e.type}:${e.index}`);
    expect(order).toEqual(["content_block_start:0", "content_block_stop:0", "content_block_start:1", "content_block_stop:1"]);
  });

  it("a tool call with no arguments gets {}, arguments that arrive before the name are kept, and an empty reply still has a block", () => {
    const a = new MessageStream("m");
    const none = events(a.push(sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c", function: { name: "Glob" } }] } }] }, { choices: [{ delta: {}, finish_reason: "tool_calls" }] })) + a.end());
    expect(none.filter((e) => e.delta?.type === "input_json_delta").map((e) => e.delta.partial_json)).toEqual(["{}"]);

    const b = new MessageStream("m");
    const early = events(b.push(sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: 0, id: "c2", function: { name: "T" } }] } }] })) + b.end());
    expect(early.filter((e) => e.delta?.type === "input_json_delta").map((e) => e.delta.partial_json).join("")).toBe('{"a":1}');

    const empty = events(new MessageStream("m").end());
    expect(empty.map((e) => e.type)).toEqual(["message_start", "content_block_start", "content_block_stop", "message_delta", "message_stop"]);
    expect(empty[1]!.content_block).toEqual({ type: "text", text: "" });
  });
});

describe("tool arguments a model wrote as invalid JSON", () => {
  it("leaves valid JSON exactly as it was", () => {
    const ok = '{"command":"cd E:\\\\GEM AI\\\\files; echo \\"hi\\"\\nls","n":1}';
    expect(repairJson(ok)).toBe(ok);
    expect(repairJson("")).toBe("");
  });

  it("reads a Windows path written with single backslashes literally, even where \\f, \\n, \\t, \\r or \\b would be escapes", () => {
    // What Qwen sent: E:\GEM AI\apps\api\.data\work\19fe\files\node_modules\tmp\runtime\bin
    const raw = '{"command":"cd \\"E:\\GEM AI\\apps\\api\\.data\\work\\19fe\\files\\node_modules\\tmp\\runtime\\bin\\x\\" ; npm install","description":"Install"}';
    expect(() => JSON.parse(raw)).toThrow();
    const fixed = JSON.parse(repairJson(raw));
    expect(fixed.command).toBe('cd "E:\\GEM AI\\apps\\api\\.data\\work\\19fe\\files\\node_modules\\tmp\\runtime\\bin\\x" ; npm install');
    // (A backslash right before a quote can't be told from an escaped quote: that one is read as the quote.)
    expect(fixed.description).toBe("Install");
  });

  it("fixes an invalid escape and a raw newline in an ordinary string, a trailing comma, and gives up on a cut-off string", () => {
    expect(JSON.parse(repairJson('{"pattern":"\\d+\\.\\w","path":"src",}'))).toEqual({ pattern: "\\d+\\.\\w", path: "src" });
    expect(JSON.parse(repairJson('{"content":"line one\nline two\ttab"}'))).toEqual({ content: "line one\nline two\ttab" });
    const cut = '{"content":"a very long file that was cut o';
    expect(repairJson(cut)).toBe(cut);
  });

  it("a streamed call is repaired as a whole when its block closes, and the call arrives intact", () => {
    const bad = '{"command":"cd E:\\GEM AI\\files"}';
    const s = new MessageStream("m");
    const out = s.push(sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "PowerShell", arguments: bad.slice(0, 18) } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: bad.slice(18) } }] } }] }, { choices: [{ delta: {}, finish_reason: "tool_calls" }] })) + s.end();
    const ev = events(out);
    const json = ev.filter((e) => e.delta?.type === "input_json_delta").map((e) => e.delta.partial_json).join("");
    expect(JSON.parse(json)).toEqual({ command: "cd E:\\GEM AI\\files" });
    // The same through a plain (non-streamed) reply.
    const r = fromOpenAi({ choices: [{ message: { tool_calls: [{ id: "c", function: { name: "PowerShell", arguments: bad } }] }, finish_reason: "tool_calls" }] }, "m");
    expect((r.content as { input: unknown }[])[0]!.input).toEqual({ command: "cd E:\\GEM AI\\files" });
  });
});
