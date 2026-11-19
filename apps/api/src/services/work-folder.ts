/**
 * Working in a folder (docs/06-work-ai.md, "Working in a folder"): a Work AI or Super AI task can work directly in a
 * folder on the machine Aatmiq runs on instead of in a private copy. Safety rules, all checked here:
 * - only folders inside the roots an admin allowed (Admin → Work AI, or WORK_FOLDERS), so a typed path can't reach the
 *   system, other people's files or Aatmiq's own data;
 * - links are resolved first (a link inside an allowed folder that leads outside it is refused);
 * - the folder must exist and be a directory (it is never created for the person);
 * - Aatmiq's own folders (task folders, uploads, chat and Code homes) and anything containing them are refused;
 * - two tasks can't work in the same folder (or one inside another) at once.
 */
import { and, eq, inArray, isNotNull, workTask, type DB } from "@aatmiq/db";
import { access, constants, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fill, msg } from "../i18n";

const WIN = process.platform === "win32";
const same = (a: string) => (WIN ? a.toLowerCase() : a);

/** Whether `child` is `parent` or inside it (both real, absolute paths). */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(same(parent), same(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export interface FolderRules {
  /** Admin's list plus WORK_FOLDERS. */
  roots: string[];
  /** Aatmiq's own folders: never a task's folder, and nothing that contains one. */
  forbidden: string[];
}

export type FolderResult = { ok: true; path: string } | { ok: false; error: string };

const real = (p: string) => realpath(p).catch(() => null);

/** The allowed roots as real paths (a root that doesn't exist is skipped). */
export async function realRoots(roots: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const r of roots) {
    const p = r.trim();
    if (!p || !path.isAbsolute(p)) continue;
    const rp = await real(p);
    if (rp) out.push(rp);
  }
  return out;
}

/** The folder a person typed, as the real path to work in, or why it can't be used. */
export async function resolveWorkFolder(input: string, rules: FolderRules): Promise<FolderResult> {
  const typed = input.trim();
  if (!typed || typed.includes("\0")) return { ok: false, error: msg("Enter the folder's full path.") };
  if (!path.isAbsolute(typed)) return { ok: false, error: msg("Use the folder's full path, for example E:\\Projects\\ADAS or /data/projects/adas.") };
  const roots = await realRoots(rules.roots);
  if (!roots.length) return { ok: false, error: msg("Working in a folder isn't set up: an admin lists the folders people may use in Admin → Work AI.") };
  const folder = await real(path.resolve(typed));
  if (!folder) return { ok: false, error: msg("That folder doesn't exist on the server. Check the path (it must be a folder on the machine Aatmiq runs on).") };
  const s = await stat(folder).catch(() => null);
  if (!s?.isDirectory()) return { ok: false, error: msg("That path isn't a folder.") };
  if (!roots.some((r) => isInside(r, folder))) return { ok: false, error: msg("That folder isn't one of the folders you may work in. Ask an admin to allow it (Admin → Work AI).") };
  for (const f of rules.forbidden) {
    const rf = (await real(f)) ?? path.resolve(f);
    if (isInside(rf, folder) || isInside(folder, rf)) return { ok: false, error: msg("That folder holds Aatmiq's own data and can't be used.") };
  }
  if (path.parse(folder).root === folder) return { ok: false, error: msg("Pick a folder, not a whole drive.") };
  try {
    await access(folder, constants.R_OK | constants.W_OK);
  } catch {
    return { ok: false, error: msg("Aatmiq can't read and write that folder. Check its permissions.") };
  }
  return { ok: true, path: folder };
}

/** A task (other than `exceptTaskId`) still using this folder, or one inside or around it. */
export async function folderBusy(db: DB, folder: string, exceptTaskId?: string): Promise<string | null> {
  const rows = await db
    .select({ id: workTask.id, folder: workTask.workFolder, title: workTask.title })
    .from(workTask)
    .where(and(isNotNull(workTask.workFolder), inArray(workTask.status, ["queued", "running", "needs_approval"])));
  for (const r of rows) {
    if (r.id === exceptTaskId || !r.folder) continue;
    if (isInside(r.folder, folder) || isInside(folder, r.folder)) return r.title;
  }
  return null;
}

/** Roots from WORK_FOLDERS (";"-separated, the way PATH is on Windows). */
export const rootsFromEnv = (value: string | undefined) => (value ?? "").split(";").map((s) => s.trim()).filter(Boolean);

/** What a person is told when a task is already working in the folder. */
export const busyMessage = (title: string) => fill(msg("Another task (\"{title}\") is working in this folder. Wait for it to finish, or stop it."), { title });
