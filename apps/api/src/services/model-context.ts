/** Ollama, behind LiteLLM, uses num_ctx as the context window for a call; without it the server's default (often 16K) applies. */
export function contextRequest(provider: { baseUrl?: string | null }, contextLength: number | null): { num_ctx?: number } {
  const host = provider.baseUrl ?? "";
  if (!contextLength || contextLength <= 0) return {};
  if (!host.includes("100.107.231.75") && !host.includes("desktop-adr28n2")) return {};
  return { num_ctx: contextLength };
}

/** The window a chat request must fit in: the model's, or a safe default when the admin didn't set one. */
export const DEFAULT_CHAT_WINDOW = 16_384;
/** Tokens kept free for the reply. */
export const answerRoom = (window: number) => Math.min(8192, Math.max(2048, Math.floor(window * 0.2)));
