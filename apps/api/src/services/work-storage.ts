/**
 * Work AI storage (Admin → Work AI → Storage): task folders grow with every file an agent makes, so an admin can
 * - remove finished tasks (their timeline and their private folder) after N days without activity; pinned tasks, tasks
 *   still working and a person's own folders (Working in a folder) are never touched;
 * - cap how much one person's tasks may hold: over the cap, new tasks are refused with how much is used and what to do.
 * Usage is measured on disk (the task's private folder: files, notes, runtime) and kept for a few minutes.
 */
import { and, eq, inArray, isNull, lt, workTask, type DB } from "@aatmiq/db";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const FINISHED = ["completed", "failed", "cancelled"] as const;
const CACHE_MS = 5 * 60_000;

/** Bytes under a folder (links not followed; unreadable parts skipped). */
export async function folderBytes(dir: string): Promise<number> {
  let total = 0;
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) total += (await stat(p).catch(() => null))?.size ?? 0;
    }
  };
  await walk(dir);
  return total;
}

const usageCache = new Map<string, { bytes: number; at: number }>();

/** What one person's tasks hold on disk. */
export async function userTaskBytes(db: DB, taskDir: (id: string) => string, userId: string, opts: { fresh?: boolean } = {}): Promise<number> {
  const hit = usageCache.get(userId);
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_MS) return hit.bytes;
  const tasks = await db.select({ id: workTask.id }).from(workTask).where(eq(workTask.userId, userId));
  let bytes = 0;
  for (const t of tasks) bytes += await folderBytes(taskDir(t.id));
  usageCache.set(userId, { bytes, at: Date.now() });
  return bytes;
}

export const forgetUsage = (userId?: string) => (userId ? usageCache.delete(userId) : usageCache.clear());

/** Finished, unpinned tasks with no activity for `days` (top-level ones; their reviewers go with them). */
export async function oldTasks(db: DB, days: number, limit = 200): Promise<{ id: string; userId: string }[]> {
  return db
    .select({ id: workTask.id, userId: workTask.userId })
    .from(workTask)
    .where(and(inArray(workTask.status, [...FINISHED]), eq(workTask.pinned, false), isNull(workTask.parentId), lt(workTask.updatedAt, new Date(Date.now() - days * 86_400_000))))
    .limit(limit);
}

export const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
