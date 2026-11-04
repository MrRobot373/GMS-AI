/**
 * The Anthropic Messages API for the Claude Code engine (Super AI, docs/20-super-ai.md):
 *
 *   POST /api/internal/work/llm/v1/messages               a Messages request, answered by the task's model
 *   POST /api/internal/work/llm/v1/messages/count_tokens  an estimate of a request's size
 *   GET  /api/internal/work/llm/v1/models[/:id]           the one model a task has
 *
 * It's a translator: the request becomes a chat completion and goes to the OpenAI-format route next
 * door (over loopback, with the task's own token), so the model, quota, retries, window fitting and
 * metering are exactly those of Work AI; the reply is turned back into a Messages reply.
 */
import { estimateTokens } from "@aatmiq/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context";
import { anthropicError, fromOpenAi, MessageStream, toOpenAi, type AnthropicRequest } from "../services/anthropic-compat";

const BASE = "/api/internal/work/llm/v1";
const internal = { config: { rateLimit: false } } as const;

export async function workAnthropicRoutes(app: FastifyInstance, ctx: AppContext) {
  const { work } = ctx;

  /** The task's token: Claude Code sends it as a bearer token or as x-api-key. */
  const tokenOf = (req: FastifyRequest): string | null => {
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    const key = req.headers["x-api-key"];
    const token = bearer ?? (typeof key === "string" ? key : "");
    return token && work.fromToken(token) ? token : null;
  };
  const refuse = (status: number, message: string, code?: string) => {
    const e = anthropicError(status, message, code);
    return { status: e.status, body: e.body };
  };

  app.post(`${BASE}/messages`, { ...internal, bodyLimit: 64 * 1024 * 1024 }, async (req, reply) => {
    const token = tokenOf(req);
    if (!token) {
      const e = refuse(401, "This task isn't running.");
      return reply.status(e.status).send(e.body);
    }
    const body = (req.body ?? {}) as AnthropicRequest;
    const model = body.model ?? "aatmiq";
    const open = toOpenAi(body);
    const abort = new AbortController();
    let finished = false;
    reply.raw.on("close", () => {
      if (!finished) abort.abort();
    });
    let upstream: Response;
    try {
      upstream = await fetch(`http://127.0.0.1:${req.socket.localPort}/api/internal/work/llm/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(open),
        signal: abort.signal,
      });
    } catch (e) {
      finished = true;
      const err = refuse(502, `The model server couldn't be reached (${e instanceof Error ? e.message : "network error"}).`);
      return reply.status(err.status).send(err.body);
    }
    if (!upstream.ok || !upstream.body) {
      finished = true;
      const j = (await upstream.json().catch(() => null)) as { error?: { message?: string; type?: string } } | null;
      const err = refuse(upstream.status >= 400 ? upstream.status : 502, j?.error?.message ?? `The model server answered ${upstream.status}.`, j?.error?.type);
      return reply.status(err.status).send(err.body);
    }
    if (!body.stream) {
      finished = true;
      return reply.send(fromOpenAi((await upstream.json()) as Parameters<typeof fromOpenAi>[0], model));
    }
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const stream = new MessageStream(model, estimateTokens(JSON.stringify(open.messages)));
    const decoder = new TextDecoder();
    try {
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        const out = stream.push(decoder.decode(chunk, { stream: true }));
        if (out) res.write(out);
      }
      res.write(stream.end());
    } catch (e) {
      if (!abort.signal.aborted) res.write(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "api_error", message: `The reply was cut off (${e instanceof Error ? e.message : "stream error"}).` } })}\n\n`);
    } finally {
      finished = true;
      res.end();
    }
  });

  app.post(`${BASE}/messages/count_tokens`, internal, async (req, reply) => {
    if (!tokenOf(req)) {
      const e = refuse(401, "This task isn't running.");
      return reply.status(e.status).send(e.body);
    }
    const b = (req.body ?? {}) as AnthropicRequest;
    return { input_tokens: estimateTokens(JSON.stringify([b.system ?? "", b.messages ?? [], b.tools ?? []])) };
  });

  const modelInfo = { type: "model", id: "aatmiq", display_name: "Aatmiq model", created_at: "2026-01-01T00:00:00Z" };
  app.get(`${BASE}/models`, internal, async (req, reply) => {
    if (!tokenOf(req)) {
      const e = refuse(401, "This task isn't running.");
      return reply.status(e.status).send(e.body);
    }
    return { data: [modelInfo], has_more: false, first_id: modelInfo.id, last_id: modelInfo.id };
  });
  app.get(`${BASE}/models/:id`, internal, async (req, reply) => {
    if (!tokenOf(req)) {
      const e = refuse(401, "This task isn't running.");
      return reply.status(e.status).send(e.body);
    }
    return { ...modelInfo, id: (req.params as { id: string }).id };
  });
}
