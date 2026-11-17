/**
 * Project access (docs/03-projects.md).
 * - owner: full control
 * - "edit": instructions, sources, members
 * - "chat": chat inside the project, read instructions and sources, read chats shared to the project
 * Org admins and workspace admins can manage every project in their workspace.
 * Chats stay private to their author unless shared to the project.
 *
 * People from other teams join a project as guests of its workspace (role "guest"): they reach the projects they were
 * added to and nothing else there (no projects open to the whole workspace, no library, no chats outside a project).
 */
import { and, eq, or, project, projectMember, sql, workspaceMember, type DB } from "@aatmiq/db";
import { isOrgAdmin } from "@aatmiq/shared";
import type { AppContext, SessionUser } from "../context";
import { getMembership, requireWorkspaceCap } from "../context";
import { forbidden, notFound } from "../errors";

export type ProjectRole = "owner" | "edit" | "chat";

/** What a guest gets in the workspace they were invited into: chat and Work AI in their projects. */
export const GUEST_SECTIONS = ["chat", "work"];

export async function isWorkspaceAdmin(ctx: AppContext, u: SessionUser, workspaceId: string): Promise<boolean> {
  const m = await requireWorkspaceCap(ctx, u, workspaceId, "workspace.use");
  return isOrgAdmin(u.orgRole) || m?.role === "admin";
}

/** A guest here: in this workspace only through projects they were added to. Org admins never are. */
export async function isGuest(ctx: AppContext, u: SessionUser, workspaceId: string): Promise<boolean> {
  if (isOrgAdmin(u.orgRole)) return false;
  return (await getMembership(ctx.db, workspaceId, u.id))?.role === "guest";
}

/** Refuse what only the workspace's own members may do (a chat outside a project, a project, the library). */
export async function requireNotGuest(ctx: AppContext, u: SessionUser, workspaceId: string) {
  if (await isGuest(ctx, u, workspaceId)) throw forbidden("You're a guest in this workspace: you can work only inside the projects you were added to.");
}

export async function getProjectAccess(ctx: AppContext, u: SessionUser, projectId: string) {
  const [p] = await ctx.db.select().from(project).where(eq(project.id, projectId));
  if (!p) throw notFound("Project not found");
  const wm = await getMembership(ctx.db, p.workspaceId, u.id);
  const admin = isOrgAdmin(u.orgRole) || wm?.role === "admin";
  const [m] = await ctx.db
    .select({ role: projectMember.role })
    .from(projectMember)
    .where(and(eq(projectMember.projectId, p.id), eq(projectMember.userId, u.id)));
  let role: ProjectRole | null = null;
  if (p.ownerId === u.id) role = "owner";
  else if (m?.role === "edit" || admin) role = "edit";
  // Open to the workspace: its own members, not guests (they see only the projects they were added to).
  else if (m || (p.visibility === "workspace" && wm && wm.role !== "guest")) role = "chat";
  if (!role) throw notFound("Project not found");
  return { project: p, role, admin, canEdit: role !== "chat" };
}

export async function requireProjectEdit(ctx: AppContext, u: SessionUser, projectId: string) {
  const a = await getProjectAccess(ctx, u, projectId);
  if (!a.canEdit) throw forbidden("You need edit access to this project.");
  return a;
}

/** SQL condition on `project` rows the user can open (admins: all in the workspace; guests: only their own). */
export function projectVisibleTo(userId: string, admin: boolean, guest = false) {
  if (admin) return sql`true`;
  const own = or(eq(project.ownerId, userId), sql`exists (select 1 from project_member pm where pm.project_id = "project"."id" and pm.user_id = ${userId})`)!;
  return guest ? own : or(own, eq(project.visibility, "workspace"))!;
}

/**
 * Someone from another team is added to a project: they become a guest of its workspace, unless they're in it already.
 * Returns true when that made them a guest.
 */
export async function ensureProjectGuest(db: DB, workspaceId: string, userId: string): Promise<boolean> {
  const r = await db.insert(workspaceMember).values({ workspaceId, userId, role: "guest", sections: GUEST_SECTIONS }).onConflictDoNothing().returning({ userId: workspaceMember.userId });
  return r.length > 0;
}

/** After someone leaves a project: a guest who is in none of the workspace's projects any more stops being a guest. */
export async function dropProjectGuestIfDone(db: DB, workspaceId: string, userId: string): Promise<boolean> {
  const r = await db.execute(sql`
    delete from workspace_member wm
    where wm.workspace_id = ${workspaceId} and wm.user_id = ${userId} and wm.role = 'guest'
      and not exists (select 1 from project p where p.workspace_id = ${workspaceId}
                      and (p.owner_id = ${userId} or exists (select 1 from project_member pm where pm.project_id = p.id and pm.user_id = ${userId})))
    returning wm.user_id`);
  return (r as unknown as unknown[]).length > 0;
}

/** Raw SQL: is document `docIdSql` a source of any project this user can open? */
export function docInAccessibleProject(docIdSql: ReturnType<typeof sql.raw>, userId: string) {
  return sql`exists (
    select 1 from project_source ps join project p on p.id = ps.project_id
    where ps.document_id = ${docIdSql}
      and (p.owner_id = ${userId}
           or (p.visibility = 'workspace' and exists (select 1 from workspace_member wm where wm.workspace_id = p.workspace_id and wm.user_id = ${userId} and wm.role <> 'guest'))
           or exists (select 1 from project_member pm where pm.project_id = p.id and pm.user_id = ${userId})
           or exists (select 1 from workspace_member wm join "user" u on u.id = wm.user_id
                      where wm.workspace_id = p.workspace_id and wm.user_id = ${userId} and wm.role = 'admin')
           or exists (select 1 from "user" u where u.id = ${userId} and u.org_role in ('owner', 'admin'))))`;
}

export async function projectDb(db: DB, id: string) {
  const [p] = await db.select().from(project).where(eq(project.id, id));
  return p ?? null;
}
