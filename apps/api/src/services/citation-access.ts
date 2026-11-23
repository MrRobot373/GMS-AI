/**
 * Stored citations shown again later (the personal-data ZIP, a chat exported as Word or Markdown): a passage is included
 * only while the person can still open its source. A document they lost access to (removed from a project, a project
 * they left, made private) keeps its number but loses its name and text; so does an earlier chat or task of someone else.
 * Web results are public and stay as they are.
 */
import { and, chat, document, inArray, workTask, type Citation, type DB } from "@aatmiq/db";
import { accessibleDocs } from "./documents";

/** The blank a citation becomes when its source is out of reach. */
const hidden = (c: Citation): Citation => ({ n: c.n, kind: c.kind, documentId: null, name: "(no longer available)", page: null, snippet: "", label: c.label ?? null });

/** One person's view of many messages' citations, in as few queries as possible. */
export async function readableCitations(db: DB, userId: string, lists: (Citation[] | null | undefined)[]): Promise<(Citation[] | null)[]> {
  const all = lists.flatMap((l) => l ?? []);
  const docIds = [...new Set(all.map((c) => c.documentId).filter((id): id is string => !!id))];
  const chatIds = [...new Set(all.map((c) => c.chatId).filter((id): id is string => !!id))];
  const taskIds = [...new Set(all.map((c) => c.taskId).filter((id): id is string => !!id))];

  const readableDocs = new Set<string>();
  if (docIds.length) {
    // accessibleDocs works per workspace: the documents' own workspaces.
    const rows = await db.select({ id: document.id, workspaceId: document.workspaceId }).from(document).where(inArray(document.id, docIds));
    for (const ws of new Set(rows.map((r) => r.workspaceId))) {
      const ok = await db
        .select({ id: document.id })
        .from(document)
        .where(and(inArray(document.id, rows.filter((r) => r.workspaceId === ws).map((r) => r.id)), accessibleDocs(ws, userId)));
      for (const r of ok) readableDocs.add(r.id);
    }
  }
  // Earlier chats and tasks: the person's own only (a project-mate's may since have left the project or been deleted).
  const ownChats = new Set(chatIds.length ? (await db.select({ id: chat.id, userId: chat.userId }).from(chat).where(inArray(chat.id, chatIds))).filter((r) => r.userId === userId).map((r) => r.id) : []);
  const ownTasks = new Set(taskIds.length ? (await db.select({ id: workTask.id, userId: workTask.userId }).from(workTask).where(inArray(workTask.id, taskIds))).filter((r) => r.userId === userId).map((r) => r.id) : []);

  const keep = (c: Citation) => {
    if (c.kind === "web") return true;
    if (c.documentId) return readableDocs.has(c.documentId);
    if (c.chatId) return ownChats.has(c.chatId);
    if (c.taskId) return ownTasks.has(c.taskId);
    // Nothing to check it against: no text.
    return !c.snippet;
  };
  return lists.map((l) => (l ? l.map((c) => (keep(c) ? c : hidden(c))) : null));
}
