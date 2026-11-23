/** A long chat stays inside the model's window (packages/model-gateway/src/fit.ts). */
import { countTokens, fitToWindow, type ChatMessage } from "@aatmiq/model-gateway";
import { describe, expect, it } from "vitest";

const tokens = (ms: ChatMessage[]) => ms.reduce((n, m) => n + countTokens(m.content) + (m.tool_calls ? countTokens(JSON.stringify(m.tool_calls)) : 0) + 8, 0);
const long = (n: number) => "x".repeat(n);

describe("fitting a chat into the model's window", () => {
  it("leaves a short chat alone", () => {
    const ms: ChatMessage[] = [{ role: "system", content: "sys" }, { role: "user", content: "hi" }];
    expect(fitToWindow(ms, 8000, 2000)).toEqual({ messages: ms, dropped: 0, shortened: false });
  });

  it("drops the oldest turns first, keeping the instructions and the new question", () => {
    const ms: ChatMessage[] = [{ role: "system", content: "rules" }];
    for (let i = 0; i < 60; i++) ms.push({ role: "user", content: `q${i} ${long(900)}` }, { role: "assistant", content: `a${i} ${long(900)}` });
    ms.push({ role: "user", content: "the new question" });
    const r = fitToWindow(ms, 16_384, 4096);
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.messages[0]!.content).toBe("rules");
    expect(r.messages.at(-1)!.content).toBe("the new question");
    expect(r.messages[1]!.role).toBe("user");
    expect(tokens(r.messages)).toBeLessThanOrEqual(16_384 - 4096);
    // The newest turns are the ones kept.
    expect(r.messages.at(-2)!.content.startsWith("a59")).toBe(true);
  });

  it("shortens big tool results of this turn without separating them from their call", () => {
    const ms: ChatMessage[] = [
      { role: "system", content: "rules" },
      { role: "user", content: "summarise these pages" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "read_page", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: long(200_000) },
    ];
    const r = fitToWindow(ms, 16_384, 4096);
    expect(r.shortened).toBe(true);
    expect(r.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(r.messages[3]!.content).toContain("shortened to fit");
    expect(tokens(r.messages)).toBeLessThanOrEqual(16_384 - 4096);
  });
});
