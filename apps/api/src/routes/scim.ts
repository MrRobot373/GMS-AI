/**
 * SCIM 2.0 provisioning (RFC 7643, 7644) at /api/scim/v2, for Okta, Microsoft Entra ID, OneLogin,
 * JumpCloud and other identity providers: they create people, keep their name and email up to date,
 * deactivate them when they leave, and keep groups (with their members) in step. The provider
 * authenticates with the bearer token from Admin → Authentication → Provisioning; it's part of the
 * Enterprise plan. People keep signing in with single sign-on.
 *
 * Deleting a person deactivates them: their chats, documents and usage stay for the organization.
 */
import { and, asc, eq, inArray, ne, sql, user, userGroup, userGroupMember, type DB } from "@aatmiq/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { audit, getOrg, type AppContext } from "../context";
import { sha256 } from "../crypto";
import { HttpError } from "../errors";
import { createPerson, freeGroupName, isEmail, normalizeEmail, setGroupMembers, updatePerson } from "../services/directory";

const SCIM_TYPE = "application/scim+json";
const count = () => sql<number>`count(*)::int`;
const USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";
const ENTERPRISE = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
const LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";
const PATCH_OP = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

/** SCIM's own errors: for the identity provider, so in English. */
class ScimError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly scimType?: string,
  ) {
    super(message);
  }
}

type UserRow = typeof user.$inferSelect;
type GroupRow = typeof userGroup.$inferSelect;
type Json = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const bool = (v: unknown) => (typeof v === "boolean" ? v : typeof v === "string" ? v.toLowerCase() === "true" : undefined);

/** `attr eq "value"` (the filters providers send): which attribute and value. */
export function parseFilter(filter: string | undefined): { attr: string; value: string } | null {
  if (!filter) return null;
  const m = /^\s*([\w.]+)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(filter);
  if (!m) throw new ScimError(400, `Only "attribute eq \\"value\\"" filters are supported (got ${filter.slice(0, 100)}).`, "invalidFilter");
  return { attr: m[1]!.toLowerCase(), value: m[2]!.replace(/\\(.)/g, "$1") };
}

/** A person as the provider sends them: the email (userName or the primary email) and a name. */
export function personFrom(body: Json) {
  const emails = Array.isArray(body.emails) ? (body.emails as Json[]) : [];
  const primary = emails.find((e) => e.primary === true) ?? emails.find((e) => str(e.type) === "work") ?? emails[0];
  const userName = str(body.userName);
  const email = isEmail(userName) ? userName : str(primary?.value);
  const name = (body.name ?? {}) as Json;
  const display = str(body.displayName) || str(name.formatted) || [str(name.givenName), str(name.familyName)].filter(Boolean).join(" ");
  return {
    email: email ? normalizeEmail(email) : "",
    name: display || (email ? email.split("@")[0]! : ""),
    externalId: str(body.externalId) || null,
    active: bool(body.active),
  };
}

export async function scimRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, cfg } = ctx;
  const base = `${cfg.appUrl}/api/scim/v2`;

  const userJson = (u: UserRow) => {
    const [given, ...rest] = u.name.split(" ");
    return {
      schemas: [USER],
      id: u.id,
      ...(u.externalId ? { externalId: u.externalId } : {}),
      userName: u.email,
      name: { formatted: u.name, givenName: given ?? "", familyName: rest.join(" ") },
      displayName: u.name,
      emails: [{ value: u.email, type: "work", primary: true }],
      active: u.status === "active",
      meta: { resourceType: "User", created: u.createdAt.toISOString(), lastModified: u.updatedAt.toISOString(), location: `${base}/Users/${u.id}` },
    };
  };

  async function groupJson(g: GroupRow, withMembers = true) {
    const members = withMembers
      ? await db
          .select({ id: user.id, name: user.name })
          .from(userGroupMember)
          .innerJoin(user, eq(user.id, userGroupMember.userId))
          .where(eq(userGroupMember.groupId, g.id))
          .orderBy(asc(user.name))
      : [];
    return {
      schemas: [GROUP],
      id: g.id,
      ...(g.externalId ? { externalId: g.externalId } : {}),
      displayName: g.name,
      ...(withMembers ? { members: members.map((m) => ({ value: m.id, display: m.name, $ref: `${base}/Users/${m.id}` })) } : {}),
      meta: { resourceType: "Group", created: g.createdAt.toISOString(), lastModified: g.updatedAt.toISOString(), location: `${base}/Groups/${g.id}` },
    };
  }

  const list = (resources: unknown[], total: number, startIndex: number) => ({ schemas: [LIST], totalResults: total, startIndex, itemsPerPage: resources.length, Resources: resources });
  const paging = (q: { startIndex?: string; count?: string }) => {
    const startIndex = Math.max(1, Number(q.startIndex) || 1);
    const count = Math.min(200, Math.max(0, q.count === undefined ? 100 : Number(q.count) || 0));
    return { startIndex, count };
  };

  /** A person the provider manages (not the owner). */
  async function managedUser(id: string) {
    const [u] = await db.select().from(user).where(and(eq(user.id, id), eq(user.directory, "scim")));
    if (!u || u.orgRole === "owner") throw new ScimError(404, `User ${id} not found.`);
    return u;
  }

  async function managedGroup(id: string) {
    const [g] = await db.select().from(userGroup).where(and(eq(userGroup.id, id), eq(userGroup.directory, "scim")));
    if (!g) throw new ScimError(404, `Group ${id} not found.`);
    return g;
  }

  /** Member ids the provider sent, kept to people it manages or that exist (unknown ids are ignored). */
  async function memberIds(values: unknown): Promise<string[]> {
    const ids = (Array.isArray(values) ? values : [values]).map((m) => str((m as Json | undefined)?.value)).filter(Boolean);
    if (!ids.length) return [];
    return (await db.select({ id: user.id }).from(user).where(inArray(user.id, ids))).map((r) => r.id);
  }

  async function scimSettings() {
    const org = await getOrg(db);
    return { org, scim: org?.scimSettings ?? null };
  }

  app.register(
    async (scim) => {
      scim.addContentTypeParser("application/scim+json", { parseAs: "string" }, (_req, body, done) => {
        try {
          done(null, body ? JSON.parse(body as string) : {});
        } catch {
          done(new ScimError(400, "The body isn't valid JSON.", "invalidSyntax"), undefined);
        }
      });

      scim.setErrorHandler((err: Error & { statusCode?: number }, req, reply: FastifyReply) => {
        const status = err instanceof ScimError ? err.status : err instanceof HttpError ? err.statusCode : err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
        if (status >= 500) req.log.error(err);
        return reply
          .status(status)
          .type(SCIM_TYPE)
          .send({ schemas: [ERROR], status: String(status), detail: status >= 500 ? "Something went wrong on the server." : err.message, ...(err instanceof ScimError && err.scimType ? { scimType: err.scimType } : {}) });
      });

      // The provider's token, and the license.
      scim.addHook("onRequest", async (req: FastifyRequest) => {
        const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1]?.trim();
        const { org, scim: s } = await scimSettings();
        if (!s || !token) throw new ScimError(401, "Provisioning isn't set up, or the token is missing.");
        const a = Buffer.from(sha256(token));
        const b = Buffer.from(s.tokenHash);
        if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ScimError(401, "The token isn't valid. Copy a new one from Admin → Authentication → Provisioning.");
        if (!(await ctx.license.hasFeature("oidc"))) throw new ScimError(403, "Provisioning (SCIM) is part of the Enterprise plan.");
        // When it was last used, at most once a minute.
        const last = s.lastUsedAt ? Date.parse(s.lastUsedAt) : 0;
        if (org && Date.now() - last > 60_000) await db.execute(sql`update organization set scim_settings = jsonb_set(scim_settings, '{lastUsedAt}', to_jsonb(${new Date().toISOString()}::text)) where id = ${org.id}`);
      });
      scim.addHook("onSend", async (_req, reply, payload) => {
        if (String(reply.getHeader("content-type") ?? "").startsWith("application/json")) reply.type(SCIM_TYPE);
        return payload;
      });

      /* ───────────── Discovery ───────────── */

      scim.get("/ServiceProviderConfig", async () => ({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        documentationUri: "https://github.com/MrRobot373/Monolith-AI/blob/main/docs/04-single-sign-on.md",
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer token", description: "The token from Admin → Authentication → Provisioning.", primary: true }],
        meta: { resourceType: "ServiceProviderConfig", location: `${base}/ServiceProviderConfig` },
      }));
      scim.get("/ResourceTypes", async () =>
        list(
          [
            { schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "User", name: "User", endpoint: "/Users", schema: USER, schemaExtensions: [{ schema: ENTERPRISE, required: false }] },
            { schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "Group", name: "Group", endpoint: "/Groups", schema: GROUP },
          ],
          2,
          1,
        ),
      );
      scim.get("/Schemas", async () =>
        list(
          [
            { id: USER, name: "User", attributes: ["userName", "name", "displayName", "emails", "active", "externalId"].map((name) => ({ name })) },
            { id: GROUP, name: "Group", attributes: ["displayName", "members", "externalId"].map((name) => ({ name })) },
          ],
          2,
          1,
        ),
      );

      /* ───────────── Users ───────────── */

      scim.get<{ Querystring: { filter?: string; startIndex?: string; count?: string } }>("/Users", async (req) => {
        const f = parseFilter(req.query.filter);
        const { startIndex, count: n } = paging(req.query);
        const notOwner = ne(user.orgRole, "owner");
        const where = !f
          ? and(eq(user.directory, "scim"), notOwner)
          : f.attr === "username" || f.attr === "emails.value" || f.attr === "emails"
            ? // Anyone with that email, so the provider can match accounts that existed before it.
              and(eq(sql`lower(${user.email})`, normalizeEmail(f.value)), notOwner)
            : f.attr === "externalid"
              ? and(eq(user.directory, "scim"), eq(user.externalId, f.value), notOwner)
              : f.attr === "id"
                ? and(eq(user.directory, "scim"), eq(user.id, f.value), notOwner)
                : null;
        if (!where) throw new ScimError(400, `Filtering on ${f!.attr} isn't supported.`, "invalidFilter");
        const [{ total }] = (await db.select({ total: count() }).from(user).where(where)) as [{ total: number }];
        const rows = n ? await db.select().from(user).where(where).orderBy(asc(user.createdAt)).limit(n).offset(startIndex - 1) : [];
        return list(rows.map(userJson), total, startIndex);
      });

      scim.get<{ Params: { id: string } }>("/Users/:id", async (req) => userJson(await managedUser(req.params.id)));

      scim.post("/Users", async (req, reply) => {
        const p = personFrom((req.body ?? {}) as Json);
        if (!isEmail(p.email)) throw new ScimError(400, "Send the person's email address as userName or as their primary email.", "invalidValue");
        const [existing] = await db.select().from(user).where(eq(sql`lower(${user.email})`, p.email));
        if (existing) throw new ScimError(409, `A person with ${p.email} already exists. Find them with a userName filter and update them instead.`, "uniqueness");
        const { scim: s } = await scimSettings();
        let id: string;
        try {
          id = await createPerson(ctx, "scim", { email: p.email, name: p.name, externalId: p.externalId, active: p.active !== false }, s?.workspaceId);
        } catch (e) {
          if (e instanceof HttpError && e.statusCode === 402) throw new ScimError(403, e.message);
          throw e;
        }
        const [u] = await db.select().from(user).where(eq(user.id, id));
        return reply.status(201).send(userJson(u!));
      });

      /** PUT replaces the person; it's also how a provider takes over an account that existed before. */
      scim.put<{ Params: { id: string } }>("/Users/:id", async (req) => {
        const [u] = await db.select().from(user).where(eq(user.id, req.params.id));
        if (!u || u.orgRole === "owner" || (u.directory && u.directory !== "scim")) throw new ScimError(404, `User ${req.params.id} not found.`);
        const p = personFrom((req.body ?? {}) as Json);
        await apply(u, { email: p.email || undefined, name: p.name || undefined, externalId: p.externalId, active: p.active ?? true });
        return userJson((await db.select().from(user).where(eq(user.id, u.id)))[0]!);
      });

      scim.patch<{ Params: { id: string } }>("/Users/:id", async (req) => {
        const [u] = await db.select().from(user).where(eq(user.id, req.params.id));
        if (!u || u.orgRole === "owner" || (u.directory && u.directory !== "scim")) throw new ScimError(404, `User ${req.params.id} not found.`);
        const change = userPatch(u, operations(req.body));
        await apply(u, change);
        return userJson((await db.select().from(user).where(eq(user.id, u.id)))[0]!);
      });

      scim.delete<{ Params: { id: string } }>("/Users/:id", async (req, reply) => {
        const u = await managedUser(req.params.id);
        await apply(u, { active: false });
        // No longer the provider's: a new assignment finds them by email again.
        await db.update(user).set({ directory: null, externalId: null }).where(eq(user.id, u.id));
        return reply.status(204).send();
      });

      async function apply(u: UserRow, p: { email?: string; name?: string; externalId?: string | null; active?: boolean }) {
        try {
          await updatePerson(ctx, "scim", u, p);
        } catch (e) {
          if (e instanceof HttpError && e.statusCode === 402) throw new ScimError(403, e.message);
          throw e;
        }
      }

      /* ───────────── Groups ───────────── */

      scim.get<{ Querystring: { filter?: string; startIndex?: string; count?: string; excludedAttributes?: string } }>("/Groups", async (req) => {
        const f = parseFilter(req.query.filter);
        const { startIndex, count: n } = paging(req.query);
        const where = !f
          ? eq(userGroup.directory, "scim")
          : f.attr === "displayname"
            ? and(eq(userGroup.directory, "scim"), eq(userGroup.name, f.value))
            : f.attr === "externalid"
              ? and(eq(userGroup.directory, "scim"), eq(userGroup.externalId, f.value))
              : f.attr === "id"
                ? and(eq(userGroup.directory, "scim"), eq(userGroup.id, f.value))
                : null;
        if (!where) throw new ScimError(400, `Filtering on ${f!.attr} isn't supported.`, "invalidFilter");
        const [{ total }] = (await db.select({ total: count() }).from(userGroup).where(where)) as [{ total: number }];
        const rows = n ? await db.select().from(userGroup).where(where).orderBy(asc(userGroup.createdAt)).limit(n).offset(startIndex - 1) : [];
        const withMembers = !/\bmembers\b/i.test(req.query.excludedAttributes ?? "");
        return list(await Promise.all(rows.map((g) => groupJson(g, withMembers))), total, startIndex);
      });

      scim.get<{ Params: { id: string }; Querystring: { excludedAttributes?: string } }>("/Groups/:id", async (req) =>
        groupJson(await managedGroup(req.params.id), !/\bmembers\b/i.test(req.query.excludedAttributes ?? "")),
      );

      scim.post("/Groups", async (req, reply) => {
        const body = (req.body ?? {}) as Json;
        const name = str(body.displayName);
        if (!name) throw new ScimError(400, "Send the group's displayName.", "invalidValue");
        const [g] = await db
          .insert(userGroup)
          .values({ name: await freeGroupName(db, name), directory: "scim", externalId: str(body.externalId) || null })
          .returning();
        await setGroupMembers(db, g!.id, await memberIds(body.members));
        await audit(ctx, { action: "group.directory_created", targetType: "group", targetId: g!.id, meta: { directory: "scim", name } });
        return reply.status(201).send(await groupJson(g!));
      });

      scim.put<{ Params: { id: string } }>("/Groups/:id", async (req) => {
        const g = await managedGroup(req.params.id);
        const body = (req.body ?? {}) as Json;
        const name = str(body.displayName);
        if (name && name !== g.name) await db.update(userGroup).set({ name: await freeGroupName(db, name, g.id), updatedAt: new Date() }).where(eq(userGroup.id, g.id));
        if (body.externalId !== undefined) await db.update(userGroup).set({ externalId: str(body.externalId) || null }).where(eq(userGroup.id, g.id));
        await setGroupMembers(db, g.id, await memberIds(body.members ?? []));
        return groupJson((await db.select().from(userGroup).where(eq(userGroup.id, g.id)))[0]!);
      });

      scim.patch<{ Params: { id: string } }>("/Groups/:id", async (req, reply) => {
        const g = await managedGroup(req.params.id);
        for (const op of operations(req.body)) {
          const path = op.path.toLowerCase();
          if (path === "displayname" || (!path && typeof (op.value as Json)?.displayName === "string")) {
            const name = path ? str(op.value) : str((op.value as Json).displayName);
            if (name) await db.update(userGroup).set({ name: await freeGroupName(db, name, g.id), updatedAt: new Date() }).where(eq(userGroup.id, g.id));
          } else if (path === "externalid") {
            await db.update(userGroup).set({ externalId: str(op.value) || null }).where(eq(userGroup.id, g.id));
          } else if (path === "members" || path.startsWith("members[") || (!path && (op.value as Json)?.members)) {
            const filtered = /^members\[value eq "([^"]+)"\]$/i.exec(op.path);
            const value = path ? op.value : (op.value as Json).members;
            const ids = filtered ? [filtered[1]!] : await memberIds(value);
            if (op.op === "add") {
              if (ids.length) await db.insert(userGroupMember).values(ids.map((userId) => ({ groupId: g.id, userId }))).onConflictDoNothing();
            } else if (op.op === "remove") {
              // Without values: everyone.
              if (!filtered && value === undefined) await db.delete(userGroupMember).where(eq(userGroupMember.groupId, g.id));
              else if (ids.length) await db.delete(userGroupMember).where(and(eq(userGroupMember.groupId, g.id), inArray(userGroupMember.userId, ids)));
            } else await setGroupMembers(db, g.id, ids);
          }
        }
        await db.update(userGroup).set({ updatedAt: new Date() }).where(eq(userGroup.id, g.id));
        // Entra ID expects 204 for group changes; a body is fine for the rest.
        return reply.status(204).send();
      });

      scim.delete<{ Params: { id: string } }>("/Groups/:id", async (req, reply) => {
        const g = await managedGroup(req.params.id);
        await db.delete(userGroup).where(eq(userGroup.id, g.id));
        await audit(ctx, { action: "group.directory_deleted", targetType: "group", targetId: g.id, meta: { directory: "scim", name: g.name } });
        return reply.status(204).send();
      });
    },
    { prefix: "/api/scim/v2" },
  );
}

interface Operation {
  op: "add" | "replace" | "remove";
  path: string;
  value: unknown;
}

/** A PatchOp's operations, with the op in lower case (Entra sends "Replace"). */
function operations(body: unknown): Operation[] {
  const b = (body ?? {}) as Json;
  const schemas = Array.isArray(b.schemas) ? b.schemas : [];
  if (!schemas.includes(PATCH_OP) || !Array.isArray(b.Operations)) throw new ScimError(400, "Send a PatchOp with Operations.", "invalidSyntax");
  return (b.Operations as Json[]).map((o) => {
    const op = str(o.op).toLowerCase();
    if (op !== "add" && op !== "replace" && op !== "remove") throw new ScimError(400, `Unknown operation ${str(o.op)}.`, "invalidSyntax");
    return { op, path: str(o.path), value: o.value };
  });
}

/** What a user PatchOp changes: active, the name, the email, the external id. */
export function userPatch(u: Pick<UserRow, "name">, ops: Operation[]) {
  const out: { email?: string; name?: string; externalId?: string | null; active?: boolean } = {};
  let given: string | undefined;
  let family: string | undefined;
  const set = (path: string, value: unknown) => {
    const p = path.toLowerCase();
    if (p === "active") out.active = bool(value);
    else if (p === "username" && isEmail(str(value))) out.email = str(value);
    else if (p === "displayname" || p === "name.formatted") out.name = str(value) || undefined;
    else if (p === "name.givenname") given = str(value);
    else if (p === "name.familyname") family = str(value);
    else if (p === "externalid") out.externalId = str(value) || null;
    else if ((p === "emails" || p.startsWith("emails[")) && value !== undefined) {
      const v = Array.isArray(value) ? (value as Json[]).find((e) => e.primary === true) ?? (value as Json[])[0] : value;
      const email = typeof v === "string" ? v : str((v as Json | undefined)?.value);
      if (isEmail(email)) out.email = email;
    } else if (p === "name" && value && typeof value === "object") {
      for (const [k, x] of Object.entries(value as Json)) set(`name.${k}`, x);
    }
  };
  for (const op of ops) {
    if (op.op === "remove") continue;
    if (op.path) set(op.path, op.value);
    // Okta and others send the changes as an object without a path.
    else if (op.value && typeof op.value === "object") for (const [k, v] of Object.entries(op.value as Json)) set(k, v);
  }
  if (!out.name && (given !== undefined || family !== undefined)) {
    const [g0, ...rest] = u.name.split(" ");
    out.name = [given ?? g0, family ?? rest.join(" ")].filter(Boolean).join(" ") || undefined;
  }
  return out;
}

/** For Admin → Authentication: how many people and groups the provider manages. */
export async function scimCounts(db: DB) {
  const [{ people }] = (await db.select({ people: count() }).from(user).where(eq(user.directory, "scim"))) as [{ people: number }];
  const [{ groups }] = (await db.select({ groups: count() }).from(userGroup).where(eq(userGroup.directory, "scim"))) as [{ groups: number }];
  return { people, groups };
}
