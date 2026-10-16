/**
 * What SCIM provisioning and LDAP sync have in common: people and groups that a directory keeps up
 * to date (`directory` = "scim" or "ldap", with the directory's own id in `externalId`). The
 * directory creates people, renames them, deactivates them when they leave and reactivates them
 * when they come back; a person an admin deactivated stays deactivated. The organization's owner is
 * never managed by a directory, so a directory can't lock everyone out.
 */
import { DEFAULT_MEMBER_SECTIONS } from "@aatmiq/shared";
import { and, asc, eq, inArray, isNull, session, sql, user, userGroup, userGroupMember, workspace, workspaceMember, type DB } from "@aatmiq/db";
import { randomUUID } from "node:crypto";
import { audit, type AppContext } from "../context";

export type Directory = "scim" | "ldap";

export interface DirectoryPerson {
  email: string;
  name: string;
  externalId: string | null;
  active: boolean;
}

/** Where the directory's new people join: the chosen workspace, else the first one. */
export async function joinWorkspace(db: DB, preferred: string | null | undefined) {
  const [ws] = preferred
    ? await db.select({ id: workspace.id }).from(workspace).where(and(eq(workspace.id, preferred), isNull(workspace.archivedAt)))
    : await db.select({ id: workspace.id }).from(workspace).where(isNull(workspace.archivedAt)).orderBy(asc(workspace.createdAt)).limit(1);
  return ws?.id ?? null;
}

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

/** A new person from the directory (a seat when active), in the directory's workspace. */
export async function createPerson(ctx: AppContext, dir: Directory, p: DirectoryPerson, workspaceId: string | null | undefined) {
  if (p.active) await ctx.license.requireSeats(1, { countPending: false });
  const id = randomUUID();
  const now = new Date();
  await ctx.db.insert(user).values({
    id,
    email: normalizeEmail(p.email),
    name: p.name,
    emailVerified: true,
    orgRole: "member",
    status: p.active ? "active" : "deactivated",
    directory: dir,
    externalId: p.externalId,
    directoryDisabled: !p.active,
    createdAt: now,
    updatedAt: now,
  });
  const ws = await joinWorkspace(ctx.db, workspaceId);
  if (ws) await ctx.db.insert(workspaceMember).values({ workspaceId: ws, userId: id, role: "member", sections: DEFAULT_MEMBER_SECTIONS }).onConflictDoNothing();
  await audit(ctx, { action: "user.directory_created", targetType: "user", targetId: id, meta: { directory: dir, email: p.email } });
  return id;
}

type Row = typeof user.$inferSelect;

/**
 * Brings an account in line with the directory: name, email, the directory link and whether it's
 * active. Returns what changed.
 */
export async function updatePerson(ctx: AppContext, dir: Directory, row: Row, p: Partial<DirectoryPerson>) {
  if (row.orgRole === "owner") return { changed: false, activated: false, deactivated: false };
  const set: Partial<Row> = {};
  if (row.directory !== dir) set.directory = dir;
  if (p.externalId !== undefined && p.externalId !== row.externalId) set.externalId = p.externalId;
  if (p.name && p.name !== row.name) set.name = p.name;
  if (p.email && normalizeEmail(p.email) !== row.email && isEmail(p.email)) {
    const [taken] = await ctx.db.select({ id: user.id }).from(user).where(eq(sql`lower(${user.email})`, normalizeEmail(p.email)));
    if (!taken) set.email = normalizeEmail(p.email);
  }
  let activated = false;
  let deactivated = false;
  if (p.active === false && row.status === "active") {
    set.status = "deactivated";
    set.directoryDisabled = true;
    deactivated = true;
  } else if (p.active === true && row.status !== "active" && row.directoryDisabled) {
    // Only what the directory switched off: an admin's deactivation stands.
    await ctx.license.requireSeats(1, { countPending: false });
    set.status = "active";
    set.directoryDisabled = false;
    activated = true;
  }
  if (!Object.keys(set).length) return { changed: false, activated, deactivated };
  await ctx.db
    .update(user)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(user.id, row.id));
  if (deactivated) await ctx.db.delete(session).where(eq(session.userId, row.id));
  if (activated || deactivated)
    await audit(ctx, { action: deactivated ? "user.deactivated" : "user.reactivated", targetType: "user", targetId: row.id, meta: { directory: dir } });
  return { changed: true, activated, deactivated };
}

/** The group's members become exactly these people (owners included: membership locks nobody out). */
export async function setGroupMembers(db: DB, groupId: string, userIds: string[]) {
  const want = new Set(userIds);
  const have = new Set((await db.select({ userId: userGroupMember.userId }).from(userGroupMember).where(eq(userGroupMember.groupId, groupId))).map((m) => m.userId));
  const add = [...want].filter((id) => !have.has(id));
  const remove = [...have].filter((id) => !want.has(id));
  if (add.length) await db.insert(userGroupMember).values(add.map((userId) => ({ groupId, userId }))).onConflictDoNothing();
  if (remove.length) await db.delete(userGroupMember).where(and(eq(userGroupMember.groupId, groupId), inArray(userGroupMember.userId, remove)));
  return { added: add.length, removed: remove.length };
}

/** A group name that isn't taken (a group the admins made keeps its name). */
export async function freeGroupName(db: DB, name: string, exceptId?: string) {
  const base = name.trim().slice(0, 120) || "Directory group";
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? base : `${base} (${i})`;
    const [taken] = await db.select({ id: userGroup.id }).from(userGroup).where(eq(userGroup.name, candidate));
    if (!taken || taken.id === exceptId) return candidate;
  }
  return `${base} (${randomUUID().slice(0, 6)})`;
}
