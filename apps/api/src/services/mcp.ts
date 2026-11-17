/**
 * A minimal MCP client (streamable HTTP) for checking a connector from Admin → Connectors:
 * connect, initialize and list the tools it offers. The agent runtime has its own client.
 */

export interface McpTool {
  name: string;
  description?: string;
}

async function readRpc(res: Response, id: number): Promise<Record<string, unknown>> {
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();
  const messages: Record<string, unknown>[] = [];
  if (type.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        messages.push(JSON.parse(line.slice(5).trim()));
      } catch {
        /* skip */
      }
    }
  } else if (text.trim()) {
    const json = JSON.parse(text);
    messages.push(...(Array.isArray(json) ? json : [json]));
  }
  const reply = messages.find((m) => m.id === id);
  if (!reply) throw new Error("The server didn't answer the request.");
  const err = reply.error as { message?: string } | undefined;
  if (err) throw new Error(err.message ?? "The server returned an error.");
  return (reply.result ?? {}) as Record<string, unknown>;
}

export async function probeMcp(url: string, headers: Record<string, string> = {}, timeoutMs = 10_000): Promise<{ serverName: string | null; tools: McpTool[] }> {
  const signal = AbortSignal.timeout(timeoutMs);
  const base = { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers };
  let session: string | null = null;
  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(url, { method: "POST", headers: { ...base, ...(session ? { "mcp-session-id": session } : {}) }, body: JSON.stringify(body), signal });
    if (res.status === 401 || res.status === 403) throw new Error(`The server refused the credentials (${res.status}).`);
    if (!res.ok && res.status !== 202) throw new Error(`The server answered ${res.status}.`);
    session = res.headers.get("mcp-session-id") ?? session;
    return res;
  };
  const init = await readRpc(
    await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "aatmiq", version: "1" } },
    }),
    1,
  );
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }).then((r) => r.body?.cancel());
  const list = await readRpc(await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), 2);
  const tools = ((list.tools as { name: string; description?: string }[] | undefined) ?? []).map((t) => ({ name: t.name, description: t.description?.slice(0, 300) }));
  const info = init.serverInfo as { name?: string } | undefined;
  if (session) await fetch(url, { method: "DELETE", headers: { ...base, "mcp-session-id": session }, signal }).catch(() => undefined);
  return { serverName: info?.name ?? null, tools };
}

/** A tool as a server lists it, with what's needed to offer it to a model. */
export interface McpToolFull {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** MCP tool annotations: readOnlyHint true means it only reads (nothing is changed). */
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string };
}

/**
 * One MCP session over streamable HTTP: initialize, then list or call tools, then close. Used by Chat AI's connectors
 * (services/chat-connectors.ts); Work AI's runtime has its own client.
 */
export class McpSession {
  private session: string | null = null;
  private id = 0;
  private base: Record<string, string>;
  private constructor(
    private url: string,
    headers: Record<string, string>,
    private fetchImpl: typeof fetch,
  ) {
    this.base = { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers };
  }

  static async open(url: string, headers: Record<string, string>, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<McpSession> {
    const s = new McpSession(url, headers, opts.fetch ?? fetch);
    await s.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "aatmiq", version: "1" } }, opts.timeoutMs ?? 15_000);
    await s.post({ jsonrpc: "2.0", method: "notifications/initialized" }, AbortSignal.timeout(opts.timeoutMs ?? 15_000)).then((r) => r.body?.cancel());
    return s;
  }

  private async post(body: Record<string, unknown>, signal: AbortSignal) {
    const res = await this.fetchImpl(this.url, { method: "POST", headers: { ...this.base, ...(this.session ? { "mcp-session-id": this.session } : {}) }, body: JSON.stringify(body), signal });
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel().catch(() => undefined);
      throw new McpAuthError(`The server refused the credentials (${res.status}).`);
    }
    if (!res.ok && res.status !== 202) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`The server answered ${res.status}.`);
    }
    this.session = res.headers.get("mcp-session-id") ?? this.session;
    return res;
  }

  async rpc(method: string, params: Record<string, unknown>, timeoutMs = 60_000): Promise<Record<string, unknown>> {
    const id = ++this.id;
    return readRpc(await this.post({ jsonrpc: "2.0", id, method, params }, AbortSignal.timeout(timeoutMs)), id);
  }

  async listTools(): Promise<McpToolFull[]> {
    const out: McpToolFull[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await this.rpc("tools/list", cursor ? { cursor } : {}, 20_000);
      out.push(...((r.tools as McpToolFull[] | undefined) ?? []));
      cursor = typeof r.nextCursor === "string" ? r.nextCursor : undefined;
      if (!cursor) break;
    }
    return out;
  }

  /** Call a tool; its text content joined, and whether the server said it failed. */
  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 60_000): Promise<{ text: string; isError: boolean }> {
    const r = await this.rpc("tools/call", { name, arguments: args }, timeoutMs);
    const parts = (r.content as { type: string; text?: string; resource?: { text?: string; uri?: string } }[] | undefined) ?? [];
    const text = parts
      .map((p) => (p.type === "text" ? (p.text ?? "") : p.type === "resource" ? (p.resource?.text ?? p.resource?.uri ?? "") : `[${p.type}]`))
      .filter(Boolean)
      .join("\n\n");
    const structured = !text && r.structuredContent ? JSON.stringify(r.structuredContent) : "";
    return { text: text || structured, isError: r.isError === true };
  }

  async close() {
    if (this.session) await this.fetchImpl(this.url, { method: "DELETE", headers: { ...this.base, "mcp-session-id": this.session }, signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  }
}

export class McpAuthError extends Error {}
