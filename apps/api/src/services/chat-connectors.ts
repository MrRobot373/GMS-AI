/**
 * Connectors in chat (docs/09-connectors.md, "In chat"): the person's connected apps (Gmail, Drive, Calendar, GitHub…)
 * as tools Chat AI can call, with each person's own sign-in, the same as Work AI. A tool the connector's "ask first"
 * list covers (by default everything that isn't reading), or that the server marks destructive, waits for the person to
 * approve it in the chat; the rest run at once. A project's connector choice applies to its chats.
 */
import { and, connector, connectorAccount, eq, type DB } from "@aatmiq/db";
import type { FunctionTool } from "@aatmiq/model-gateway";
import { randomUUID } from "node:crypto";
import type { Connectors } from "./connectors";
import { McpAuthError, McpSession, type McpToolFull } from "./mcp";

type Connector = typeof connector.$inferSelect;

/** At most this many connector tools are offered in one message (they all go into the prompt). */
export const MAX_CONNECTOR_TOOLS = 48;
const LIST_TTL_MS = 10 * 60_000;
const RESULT_CHARS = 14_000;
/** How long an approval waits for the person. */
export const APPROVAL_TIMEOUT_MS = 5 * 60_000;
/** The wait in use (tests shorten it). */
export const approvalWait = { ms: APPROVAL_TIMEOUT_MS };

export interface ConnectorTool {
  connector: Pick<Connector, "id" | "name" | "displayName" | "url" | "auth">;
  tool: McpToolFull;
  /** The person approves each call in the chat first. */
  approve: boolean;
}

const lists = new Map<string, { at: number; tools: McpToolFull[] }>();
/** A connector that failed isn't tried again for a while, so one down service doesn't slow every message. */
const failed = new Map<string, { at: number; why: string }>();
const FAILED_TTL_MS = 2 * 60_000;
const LIST_TIMEOUT_MS = 8_000;

const glob = (g: string) => new RegExp(`^${g.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);

/**
 * Whether a tool waits for the person, by the connector's "ask first" list (Admin → Work AI → Connectors), the same
 * rule as Work AI's: comma-separated globs, "!" excludes ("*,!get_*,!list_*" asks before everything but reading).
 */
export function asksFirst(approveTools: string, tool: string): boolean {
  const globs = approveTools.split(",").map((s) => s.trim()).filter(Boolean);
  const never = globs.filter((g) => g.startsWith("!")).map((g) => glob(g.slice(1)));
  return globs.some((g) => !g.startsWith("!") && glob(g).test(tool)) && !never.some((g) => g.test(tool));
}

/** The model-facing name: <connector>__<tool>, in the characters and length providers accept. */
export const toolName = (connectorName: string, tool: string) => `${connectorName}__${tool}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);

/**
 * The tools of the connectors this person can use here: open and shared-token ones, and OAuth ones they connected.
 * A connector that fails is left out and named in `problems`.
 */
export async function chatConnectorTools(
  db: DB,
  connectors: Connectors,
  o: { userId: string; only: string[] | null; fetch?: typeof fetch },
): Promise<{ tools: FunctionTool[]; byName: Map<string, ConnectorTool>; problems: string[] }> {
  const rows = (await db.select().from(connector).where(eq(connector.enabled, true))).filter((c) => !o.only || o.only.includes(c.id));
  const connected = new Set(
    (await db.select({ id: connectorAccount.connectorId }).from(connectorAccount).where(and(eq(connectorAccount.userId, o.userId), eq(connectorAccount.status, "ok")))).map((a) => a.id),
  );
  const usable = rows.filter((c) => c.auth !== "oauth" || connected.has(c.id));
  const byName = new Map<string, ConnectorTool>();
  const tools: FunctionTool[] = [];
  const problems: string[] = [];
  await Promise.all(
    usable.map(async (c) => {
      const key = `${c.id}:${c.auth === "oauth" ? o.userId : "*"}`;
      const down = failed.get(key);
      if (down && Date.now() - down.at < FAILED_TTL_MS) {
        problems.push(`${c.displayName}: ${down.why}`);
        return;
      }
      try {
        let listed = lists.get(key);
        if (!listed || Date.now() - listed.at > LIST_TTL_MS) {
          const s = await McpSession.open(c.url, await connectors.upstreamHeaders(c, o.userId), { fetch: o.fetch, timeoutMs: LIST_TIMEOUT_MS });
          try {
            listed = { at: Date.now(), tools: await s.listTools() };
          } finally {
            await s.close();
          }
          lists.set(key, listed);
        }
        for (const t of listed.tools) {
          const name = toolName(c.name, t.name);
          byName.set(name, { connector: c, tool: t, approve: asksFirst(c.approveTools, t.name) || t.annotations?.destructiveHint === true });
        }
        failed.delete(key);
      } catch (e) {
        const why = e instanceof Error ? e.message : "unreachable";
        failed.set(key, { at: Date.now(), why });
        problems.push(`${c.displayName}: ${why}`);
      }
    }),
  );
  for (const [name, e] of [...byName.entries()].slice(0, MAX_CONNECTOR_TOOLS)) {
    tools.push({
      type: "function",
      function: {
        name,
        description: `[${e.connector.displayName}] ${(e.tool.description ?? e.tool.title ?? e.tool.name).slice(0, 600)}${e.approve ? " (The person approves this before it runs.)" : ""}`,
        parameters: (e.tool.inputSchema as Record<string, unknown> | undefined) ?? { type: "object", properties: {} },
      },
    });
  }
  return { tools, byName, problems };
}

/** Forget a person's cached tool lists (after connecting or disconnecting). */
export function forgetConnectorTools(userId?: string) {
  for (const m of [lists, failed]) for (const k of [...m.keys()]) if (!userId || k.endsWith(`:${userId}`) || k.endsWith(":*")) m.delete(k);
}

/* ───────────── Approvals in the chat ───────────── */

interface Pending {
  chatId: string;
  userId: string;
  /** What the person is asked (shown again if the page is reloaded). */
  about: Record<string, unknown>;
  resolve: (d: "approved" | "declined" | "expired") => void;
}
const pending = new Map<string, Pending>();

/** Wait for the person to approve a call (or not). Resolves "expired" after the timeout or when the answer stops. */
export function awaitApproval(
  chatId: string,
  userId: string,
  signal: AbortSignal,
  about: Record<string, unknown> = {},
  timeoutMs = approvalWait.ms,
): { id: string; decision: Promise<"approved" | "declined" | "expired"> } {
  const id = randomUUID();
  const decision = new Promise<"approved" | "declined" | "expired">((resolve) => {
    const done = (d: "approved" | "declined" | "expired") => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      pending.delete(id);
      resolve(d);
    };
    const timer = setTimeout(() => done("expired"), timeoutMs);
    const onAbort = () => done("expired");
    signal.addEventListener("abort", onAbort, { once: true });
    pending.set(id, { chatId, userId, about, resolve: done });
  });
  return { id, decision };
}

/** What's waiting for this person's approval in a chat. */
export function waitingApprovals(chatId: string, userId: string) {
  return [...pending.entries()].filter(([, p]) => p.chatId === chatId && p.userId === userId).map(([id, p]) => ({ id, ...p.about }));
}

/** The person's answer. False when there's no such waiting call in their chat. */
export function decideApproval(id: string, chatId: string, userId: string, approve: boolean): boolean {
  const p = pending.get(id);
  if (!p || p.chatId !== chatId || p.userId !== userId) return false;
  p.resolve(approve ? "approved" : "declined");
  return true;
}

/** Call a connector tool for this person. Never throws: a failure is text for the model. */
export async function callConnectorTool(
  connectors: Connectors,
  e: ConnectorTool,
  userId: string,
  args: Record<string, unknown>,
  opts: { fetch?: typeof fetch } = {},
): Promise<{ text: string; ok: boolean }> {
  const attempt = async (forceRefresh: boolean) => {
    const s = await McpSession.open(e.connector.url, await connectors.upstreamHeaders(e.connector as Connector, userId, forceRefresh), { fetch: opts.fetch });
    try {
      return await s.callTool(e.tool.name, args);
    } finally {
      await s.close();
    }
  };
  try {
    let r: { text: string; isError: boolean };
    try {
      r = await attempt(false);
    } catch (err) {
      if (!(err instanceof McpAuthError) || e.connector.auth !== "oauth") throw err;
      r = await attempt(true);
    }
    const text = r.text.length > RESULT_CHARS ? `${r.text.slice(0, RESULT_CHARS)}\n… (${r.text.length - RESULT_CHARS} more characters left out)` : r.text;
    return { text: r.isError ? `${e.connector.displayName} reported an error: ${text}` : text || "(no content)", ok: !r.isError };
  } catch (err) {
    const why = err instanceof McpAuthError ? `${e.connector.displayName} refused the sign-in. Connect it again in Work AI → Connections.` : `${e.connector.displayName} couldn't do it: ${err instanceof Error ? err.message : "unreachable"}.`;
    return { text: why, ok: false };
  }
}
