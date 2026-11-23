/**
 * Keep a request inside the model's context window. A long chat (and the web pages, files and Python output its tools
 * bring in) grows past the window; the server then cuts the prompt itself (losing the instructions or the question) or
 * fails. Here, in order, until it fits: the oldest turns go (an assistant turn and its tool results go together, so no
 * tool result is left without its call), then the largest tool results are shortened, then the system prompt's extra
 * context, then the question itself. The system prompt and the newest question always stay.
 */
import type { ChatMessage } from "./index";

/** Tokens a text takes, counted on the safe side (code and non-English text use more than 4 characters a token). */
export const countTokens = (text: string) => Math.ceil(text.length / 3);
const size = (m: ChatMessage) => countTokens(m.content) + (m.tool_calls ? countTokens(JSON.stringify(m.tool_calls)) : 0) + 8;
const total = (ms: ChatMessage[]) => ms.reduce((n, m) => n + size(m), 0);
const CUT = "\n\n[… shortened to fit the model's memory …]\n\n";

/** Cut a text to about `tokens`, keeping its beginning and end. */
function shorten(text: string, tokens: number): string {
  const chars = Math.max(200, tokens * 3 - CUT.length);
  if (text.length <= chars) return text;
  const head = Math.ceil(chars * 0.7);
  return text.slice(0, head) + CUT + text.slice(text.length - (chars - head));
}

/**
 * `messages`: the system prompt first, then history, then the newest user message and anything after it (this turn's
 * tool calls). `window`: the model's context in tokens; `answer`: tokens kept free for the reply.
 */
export function fitToWindow(messages: ChatMessage[], window: number, answer: number): { messages: ChatMessage[]; dropped: number; shortened: boolean } {
  const budget = Math.max(1024, window - answer);
  if (total(messages) <= budget || messages.length < 2) return { messages, dropped: 0, shortened: false };
  const out = messages.map((m) => ({ ...m }));
  let lastUser = out.length - 1;
  while (lastUser > 0 && out[lastUser]!.role !== "user") lastUser--;
  if (lastUser <= 0) lastUser = out.length - 1;
  // 1. The oldest turns, between the system prompt and this turn.
  let dropped = 0;
  while (total(out) > budget && lastUser > 1) {
    out.splice(1, 1);
    lastUser--;
    dropped++;
    // Don't start the history on a tool result or an assistant turn.
    while (lastUser > 1 && out[1]!.role !== "user") {
      out.splice(1, 1);
      lastUser--;
      dropped++;
    }
  }
  if (total(out) <= budget) return { messages: out, dropped, shortened: false };
  // 2. The largest tool results, then 3. the system prompt, then 4. the question: each to what's left.
  const order = [
    ...out.map((m, i) => ({ m, i })).filter((x) => x.m.role === "tool").sort((a, b) => size(b.m) - size(a.m)).map((x) => x.i),
    0,
    lastUser,
  ];
  for (const i of order) {
    const over = total(out) - budget;
    if (over <= 0) break;
    const m = out[i]!;
    m.content = shorten(m.content, Math.max(i === 0 ? 1500 : 300, countTokens(m.content) - over));
  }
  return { messages: out, dropped, shortened: true };
}
