/**
 * task_recall: the agent searches its own task's full record, word for word.
 *
 * Condensing older steps keeps a long job going, but a summary loses the exact line (a command's output, a path, a number,
 * an error, something the person said). The record is all still stored (work_event), so instead of guessing, the agent
 * searches it. Two projects reached the same answer on their own: Kortix continues in a fresh context and "searches the
 * session's full record for the exact lines it needs, nothing is summarized", and lossless-memory keeps every line with a
 * timestamp and searches by time first, words second. Results come back in time order, verbatim, with when each happened.
 */
import { and, desc, eq, gte, inArray, lte, sql, workEvent, type DB } from "@aatmiq/db";

export const RECALL_KINDS = ["user", "assistant", "tool_call", "tool_result"] as const;
export type RecallKind = (typeof RECALL_KINDS)[number];

/** The words an entry must all contain (at most eight, lower case, 2+ characters, quotes and wildcards removed). */
export function recallTerms(query: string | undefined): string[] {
  return [...new Set((query ?? "").toLowerCase().replace(/["'`%_\\]/g, " ").split(/\s+/).filter((w) => w.length >= 2))].slice(0, 8);
}

/** An entry's searchable text, as the database sees it. */
const SEARCHABLE = sql`(coalesce(data->>'text', '') || ' ' || coalesce(data->>'name', '') || ' ' || coalesce(data->>'args', '') || ' ' || coalesce(data->>'error', ''))`;

export interface RecallRow {
  seq: number;
  kind: string;
  createdAt: Date;
  data: Record<string, unknown>;
}

/** What an entry says, as plain text. */
export function entryText(row: Pick<RecallRow, "kind" | "data">): string {
  const d = row.data;
  if (row.kind === "tool_call") return `${String(d.name ?? "tool")} ${typeof d.args === "string" ? d.args : JSON.stringify(d.args ?? {})}`;
  return String(d.text ?? "");
}

/** A short label: who or what, and for a result its outcome. */
function label(row: RecallRow, names: Map<string, string>): string {
  const d = row.data;
  if (row.kind === "tool_call") return `tool call (${String(d.name ?? "?")})`;
  if (row.kind === "tool_result") {
    const name = names.get(String(d.callId ?? ""));
    return `tool result${name ? ` (${name})` : ""}${d.isError ? ", an error" : ""}${typeof d.exitCode === "number" && d.exitCode !== 0 ? `, exit code ${d.exitCode}` : ""}`;
  }
  return row.kind === "user" ? "the person" : "you";
}

/** "3 min ago", "2 h ago": how long before `now`. */
export function ago(then: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/** A window of `text` around the first place a term appears, with … where it was cut. */
export function excerpt(text: string, terms: string[], width: number): string {
  if (text.length <= width) return text;
  const lower = text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, Math.min(at - Math.floor(width / 4), text.length - width));
  return `${start > 0 ? "…" : ""}${text.slice(start, start + width)}${start + width < text.length ? "…" : ""}`;
}

const WIDTH = 700;
const WHOLE = 6000;

export interface RecallArgs {
  query?: string;
  kind?: RecallKind;
  sinceMinutes?: number;
  beforeMinutes?: number;
  seq?: number;
  offset?: number;
  limit?: number;
}

/** The text the agent reads. Never reaches outside the task: every query is scoped to `taskId`. */
export async function recall(db: DB, taskId: string, a: RecallArgs, now = new Date()): Promise<string> {
  // One entry, whole (in parts when long).
  if (a.seq !== undefined) {
    const [row] = await db.select().from(workEvent).where(and(eq(workEvent.taskId, taskId), eq(workEvent.seq, a.seq), inArray(workEvent.kind, [...RECALL_KINDS])));
    if (!row) return `There is no entry #${a.seq} in this task's record.`;
    const text = entryText(row as RecallRow);
    const from = Math.max(0, a.offset ?? 0);
    const part = text.slice(from, from + WHOLE);
    const more = from + WHOLE < text.length;
    const names = new Map<string, string>();
    if (row.kind === "tool_result") {
      const [c] = await db.select().from(workEvent).where(and(eq(workEvent.taskId, taskId), eq(workEvent.kind, "tool_call"), sql`${workEvent.data}->>'callId' = ${String(row.data.callId ?? "")}`));
      if (c) names.set(String(row.data.callId), String(c.data.name ?? ""));
    }
    return [`#${row.seq} · ${row.createdAt.toISOString().slice(0, 19)}Z (${ago(row.createdAt, now)}) · ${label(row as RecallRow, names)}`, "", part || "(empty)", ...(more ? ["", `(more: call task_recall with seq ${row.seq} and offset ${from + WHOLE}; ${text.length.toLocaleString("en-US")} characters in all)`] : [])].join("\n");
  }

  const terms = recallTerms(a.query);
  const kinds = a.kind ? [a.kind] : [...RECALL_KINDS];
  const limit = Math.min(Math.max(a.limit ?? 8, 1), 20);
  // Not the agent's own searches of the record (they'd match themselves).
  const own = sql`not exists (select 1 from work_event c where c.task_id = ${workEvent.taskId} and c.kind = 'tool_call' and c.data->>'name' in ('task_recall', 'mcp__aatmiq__task_recall') and (c.data->>'callId' = ${workEvent.data}->>'callId' or c.seq = ${workEvent.seq}))`;
  const where = and(
    eq(workEvent.taskId, taskId),
    inArray(workEvent.kind, kinds),
    own,
    ...terms.map((t) => sql`lower(${SEARCHABLE}) like ${`%${t}%`}`),
    a.sinceMinutes ? gte(workEvent.createdAt, new Date(now.getTime() - a.sinceMinutes * 60_000)) : undefined,
    a.beforeMinutes ? lte(workEvent.createdAt, new Date(now.getTime() - a.beforeMinutes * 60_000)) : undefined,
  );
  const total = Number((await db.select({ n: sql<number>`count(*)::int` }).from(workEvent).where(where))[0]?.n ?? 0);
  if (!total) return `Nothing in this task's record matches${terms.length ? ` "${terms.join(" ")}"` : ""}${a.sinceMinutes || a.beforeMinutes ? " in that time" : ""}. Every word must appear: try fewer or different words.`;
  // The newest matches, then shown oldest first (the order things happened).
  const rows = ((await db.select().from(workEvent).where(where).orderBy(desc(workEvent.seq)).limit(limit)) as RecallRow[]).reverse();
  const calls = rows.filter((r) => r.kind === "tool_result").map((r) => String(r.data.callId ?? "")).filter(Boolean);
  const names = new Map<string, string>();
  if (calls.length) {
    for (const c of await db.select().from(workEvent).where(and(eq(workEvent.taskId, taskId), eq(workEvent.kind, "tool_call"), inArray(sql`${workEvent.data}->>'callId'`, calls)))) names.set(String(c.data.callId), String(c.data.name ?? ""));
  }
  return [
    `${total} match${total === 1 ? "" : "es"}${total > rows.length ? `; showing the ${rows.length} newest, oldest first` : ""}. Word for word from this task's record:`,
    ...rows.flatMap((r) => ["", `#${r.seq} · ${r.createdAt.toISOString().slice(11, 19)}Z (${ago(r.createdAt, now)}) · ${label(r, names)}`, excerpt(entryText(r), terms, WIDTH)]),
    "",
    `(task_recall with seq N reads entry #N whole${total > rows.length ? "; add words or since_minutes / before_minutes to narrow" : ""})`,
  ].join("\n");
}

/** One line for a tool call: what it did, short. */
export function trailLine(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const what = [a.command, a.file_path, a.path, a.url, a.query, a.queries, a.expression, a.element, a.text].find((v) => v !== undefined && v !== "");
  const s = typeof what === "string" ? what : what !== undefined ? JSON.stringify(what) : "";
  return `${name}${s ? `: ${s.replace(/\s+/g, " ").slice(0, 100)}` : ""}`;
}

/** The last few steps, oldest first: "where you were", cheap enough to put after every condensing. */
export async function recentTrail(db: DB, taskId: string, n = 8): Promise<string[]> {
  const rows = await db.select().from(workEvent).where(and(eq(workEvent.taskId, taskId), eq(workEvent.kind, "tool_call"))).orderBy(desc(workEvent.seq)).limit(n);
  return rows.reverse().filter((r) => !/task_recall/.test(String(r.data.name ?? ""))).map((r) => `#${r.seq} ${trailLine(String(r.data.name ?? "?"), r.data.args)}`);
}
