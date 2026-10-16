/**
 * Directory sync: SCIM provisioning as Okta and Entra ID send it, and LDAP / Active Directory sync
 * against a mock directory. Against a real Postgres (TEST_DATABASE_URL).
 */
import { createDb, sql, type DB } from "@aatmiq/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockLdap } from "../test/mock-ldap.mjs";
import { buildApp } from "./app";
import type { Config } from "./config";
import { parseFilter, personFrom, userPatch } from "./routes/scim";
import { normalizeDn, personFromEntry } from "./services/ldap";

describe("SCIM and LDAP: the parts on their own", () => {
  it("reads the filters providers send", () => {
    expect(parseFilter('userName eq "Asha@Acme.test"')).toEqual({ attr: "username", value: "Asha@Acme.test" });
    expect(parseFilter('externalId eq "00u1\\"x"')).toEqual({ attr: "externalid", value: '00u1"x' });
    expect(parseFilter(undefined)).toBeNull();
    expect(() => parseFilter('userName sw "a"')).toThrow("Only");
  });

  it("finds the email and the name however they're sent", () => {
    expect(personFrom({ userName: "Asha@Acme.test", name: { givenName: "Asha", familyName: "Rao" }, externalId: "00u1", active: true })).toEqual({
      email: "asha@acme.test",
      name: "Asha Rao",
      externalId: "00u1",
      active: true,
    });
    // Entra ID: userName may be a UPN that isn't the mailbox; the primary email wins then.
    expect(personFrom({ userName: "asha", displayName: "Asha R", emails: [{ value: "asha@acme.test", type: "work", primary: true }] })).toMatchObject({ email: "asha@acme.test", name: "Asha R" });
    expect(personFrom({ userName: "nobody" }).email).toBe("");
  });

  it("applies PatchOps in both styles: Entra's paths and Okta's value objects", () => {
    const u = { name: "Asha Rao" };
    const ops = (list: { op: "add" | "replace" | "remove"; path: string; value: unknown }[]) => list;
    expect(userPatch(u, ops([{ op: "replace", path: "active", value: "False" }]))).toEqual({ active: false });
    expect(userPatch(u, ops([{ op: "replace", path: "", value: { active: false, displayName: "Asha K" } }]))).toEqual({ active: false, name: "Asha K" });
    expect(userPatch(u, ops([{ op: "replace", path: "name.familyName", value: "Kumar" }]))).toEqual({ name: "Asha Kumar" });
    expect(userPatch(u, ops([{ op: "replace", path: 'emails[type eq "work"].value', value: "asha.k@acme.test" }]))).toEqual({ email: "asha.k@acme.test" });
    expect(userPatch(u, ops([{ op: "remove", path: "title", value: undefined }]))).toEqual({});
  });

  it("reads people from directory entries: Active Directory's disabled flag and binary ids", () => {
    const s = { emailAttr: "mail", nameAttr: "displayName", idAttr: "objectGUID" };
    const guid = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    expect(personFromEntry({ dn: "CN=Asha,OU=Staff,DC=acme", mail: "Asha@Acme.test", displayName: "Asha Rao", objectGUID: guid, userAccountControl: "512" }, s)).toEqual({
      dn: "CN=Asha,OU=Staff,DC=acme",
      externalId: "00112233445566778899aabbccddeeff",
      email: "asha@acme.test",
      name: "Asha Rao",
      disabled: false,
    });
    expect(personFromEntry({ dn: "CN=Old,DC=acme", mail: "old@acme.test", userAccountControl: "514" }, s)).toMatchObject({ disabled: true, name: "old" });
    expect(personFromEntry({ dn: "CN=NoMail,DC=acme" }, s)).toBeNull();
    expect(normalizeDn("CN=Asha Rao, OU=Staff ,DC=acme")).toBe("cn=asha rao,ou=staff,dc=acme");
  });
});

const url = process.env.TEST_DATABASE_URL;
const APP_URL = "http://localhost:3000";
const d = url ? describe : describe.skip;
type Jar = { cookie: string };
const jar = (): Jar => ({ cookie: "" });

d("Directory sync", () => {
  let app: FastifyInstance;
  let db: DB;
  let close: () => Promise<void>;
  const owner = jar();
  let token = "";
  let workspaceId = "";

  async function call(j: Jar | null, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) {
    const res = await app.inject({
      method,
      url: path,
      headers: { origin: APP_URL, ...(j?.cookie ? { cookie: j.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      payload: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers["set-cookie"];
    if (j && set) {
      const map = new Map(j.cookie.split("; ").filter(Boolean).map((c) => c.split("=") as [string, string]));
      for (const c of Array.isArray(set) ? set : [set]) {
        const [k, ...v] = c.split(";")[0]!.split("=");
        map.set(k!, v.join("="));
      }
      j.cookie = [...map].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    let json = null;
    try {
      json = res.json();
    } catch {}
    return { status: res.statusCode, json, headers: res.headers };
  }

  /** The identity provider calling SCIM (no Origin, a bearer token, SCIM's media type). */
  async function scim(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown, bearer = token) {
    const res = await app.inject({
      method,
      url: `/api/scim/v2${path}`,
      headers: { authorization: `Bearer ${bearer}`, ...(body !== undefined ? { "content-type": "application/scim+json" } : {}) },
      payload: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = res.json();
    } catch {}
    return { status: res.statusCode, json, type: String(res.headers["content-type"] ?? "") };
  }
  const patchOp = (Operations: unknown[]) => ({ schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations });
  const person = async (email: string) => ((await db.execute(sql`select * from "user" where email = ${email}`)) as unknown as Record<string, unknown>[])[0];

  beforeAll(async () => {
    ({ db, close } = createDb(url));
    await db.execute(sql`
      do $$ declare r record; begin
        for r in (select tablename from pg_tables where schemaname = 'public' and tablename not like '%drizzle%') loop
          execute 'truncate table "' || r.tablename || '" cascade';
        end loop;
      end $$;`);
    const cfg: Config = { appUrl: APP_URL, databaseUrl: url!, secret: "test-secret-test-secret-test-secret-1234", allowMockProvider: true, port: 0, storageDir: "" };
    app = await buildApp(db, cfg);
    await call(owner, "POST", "/api/setup", { orgName: "Acme", name: "Owner", email: "owner@acme.test", password: "correct-horse-battery" });
    workspaceId = (await call(owner, "GET", "/api/me")).json.workspaces[0].id;
  });
  afterAll(async () => {
    await app?.close();
    await close?.();
  });

  /* ───────────── SCIM ───────────── */

  it("an admin turns provisioning on and gets a token; nothing works without it", async () => {
    expect((await scim("GET", "/ServiceProviderConfig", undefined, "nope")).status).toBe(401);
    const on = await call(owner, "POST", "/api/admin/directory/scim/token");
    expect(on.status).toBe(200);
    token = on.json.token;
    expect(token).toMatch(/^aatmiq_scim_/);
    expect(on.json.scim).toMatchObject({ on: true, baseUrl: `${APP_URL}/api/scim/v2`, tokenHint: token.slice(-4) });
    // The token is shown once: never again.
    expect(JSON.stringify((await call(owner, "GET", "/api/admin/directory")).json)).not.toContain(token);
    const cfg = await scim("GET", "/ServiceProviderConfig");
    expect(cfg.status).toBe(200);
    expect(cfg.type).toContain("application/scim+json");
    expect(cfg.json.patch.supported).toBe(true);
    const bad = await scim("GET", "/Users", undefined, "aatmiq_scim_wrong");
    expect(bad.json).toMatchObject({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: "401" });
  });

  it("creates people (in the chosen workspace), finds them by userName, and refuses duplicates", async () => {
    const r = await scim("POST", "/Users", {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: "asha@acme.test",
      externalId: "00u-asha",
      name: { givenName: "Asha", familyName: "Rao" },
      emails: [{ value: "asha@acme.test", type: "work", primary: true }],
      active: true,
    });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ userName: "asha@acme.test", externalId: "00u-asha", displayName: "Asha Rao", active: true, meta: { resourceType: "User" } });
    const id = r.json.id;
    expect((await scim("GET", `/Users/${id}`)).json.userName).toBe("asha@acme.test");
    const found = await scim("GET", `/Users?filter=${encodeURIComponent('userName eq "ASHA@acme.test"')}`);
    expect(found.json).toMatchObject({ totalResults: 1, Resources: [{ id }] });
    expect((await scim("GET", `/Users?filter=${encodeURIComponent('userName eq "nobody@acme.test"')}`)).json.totalResults).toBe(0);
    expect((await scim("POST", "/Users", { userName: "asha@acme.test" })).json).toMatchObject({ status: "409", scimType: "uniqueness" });
    expect((await scim("POST", "/Users", { userName: "no-email" })).status).toBe(400);
    // In Aatmiq: a member of the first workspace, marked as kept up to date by SCIM.
    const users = (await call(owner, "GET", "/api/admin/users")).json as { email: string; directory: string | null; workspaces: { workspaceId: string }[] }[];
    expect(users.find((u) => u.email === "asha@acme.test")).toMatchObject({ directory: "scim", workspaces: [{ workspaceId }] });
  });

  it("the owner isn't the provider's to change", async () => {
    expect((await scim("GET", `/Users?filter=${encodeURIComponent('userName eq "owner@acme.test"')}`)).json.totalResults).toBe(0);
    const ownerId = (await person("owner@acme.test"))!.id as string;
    expect((await scim("PATCH", `/Users/${ownerId}`, patchOp([{ op: "replace", path: "active", value: false }]))).status).toBe(404);
  });

  it("deactivating (Entra's PatchOp) ends their sessions; the provider brings them back, but not after an admin's deactivation", async () => {
    const id = (await person("asha@acme.test"))!.id as string;
    const off = await scim("PATCH", `/Users/${id}`, patchOp([{ op: "Replace", path: "active", value: "False" }]));
    expect(off.status).toBe(200);
    expect(off.json.active).toBe(false);
    expect((await person("asha@acme.test"))!.status).toBe("deactivated");
    // Okta's style: a value object without a path.
    expect((await scim("PATCH", `/Users/${id}`, patchOp([{ op: "replace", value: { active: true } }]))).json.active).toBe(true);
    // An admin deactivates them: the provider can't undo that.
    expect((await call(owner, "PATCH", `/api/admin/users/${id}`, { status: "deactivated" })).status).toBe(200);
    expect((await scim("PATCH", `/Users/${id}`, patchOp([{ op: "replace", path: "active", value: true }]))).json.active).toBe(false);
    expect((await call(owner, "PATCH", `/api/admin/users/${id}`, { status: "active" })).status).toBe(200);
  });

  it("renames, changes the email, and takes over an account that existed before (matched by email)", async () => {
    const id = (await person("asha@acme.test"))!.id as string;
    const put = await scim("PUT", `/Users/${id}`, { userName: "asha.rao@acme.test", name: { formatted: "Asha Rao Kumar" }, externalId: "00u-asha", active: true });
    expect(put.json).toMatchObject({ userName: "asha.rao@acme.test", displayName: "Asha Rao Kumar" });
    // A person invited by hand earlier: the provider finds them by email, then updates them.
    await call(owner, "POST", "/api/admin/invites", { email: "ravi@acme.test", workspaces: [{ workspaceId, role: "member" }] });
    const inv = await call(owner, "POST", "/api/admin/invites", { email: "mei@acme.test", workspaces: [{ workspaceId, role: "member" }] });
    await app.inject({ method: "POST", url: `/api/invites/${inv.json.link.split("/invite/")[1]}/accept`, headers: { origin: APP_URL, "content-type": "application/json" }, payload: JSON.stringify({ name: "Mei", password: "another-good-password" }) });
    const mei = (await scim("GET", `/Users?filter=${encodeURIComponent('userName eq "mei@acme.test"')}`)).json.Resources[0];
    expect(mei.externalId).toBeUndefined();
    expect((await scim("PATCH", `/Users/${mei.id}`, patchOp([{ op: "add", path: "externalId", value: "00u-mei" }]))).json.externalId).toBe("00u-mei");
    expect((await person("mei@acme.test"))!.directory).toBe("scim");
  });

  it("groups: created with members, members added and removed, renamed, and locked against edits by hand", async () => {
    const asha = (await person("asha.rao@acme.test"))!.id as string;
    const mei = (await person("mei@acme.test"))!.id as string;
    const g = await scim("POST", "/Groups", { schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"], displayName: "Engineering", externalId: "grp-eng", members: [{ value: asha }] });
    expect(g.status).toBe(201);
    expect(g.json.members).toEqual([expect.objectContaining({ value: asha })]);
    const id = g.json.id;
    expect((await scim("PATCH", `/Groups/${id}`, patchOp([{ op: "Add", path: "members", value: [{ value: mei }] }]))).status).toBe(204);
    expect((await scim("GET", `/Groups/${id}`)).json.members).toHaveLength(2);
    expect((await scim("PATCH", `/Groups/${id}`, patchOp([{ op: "Remove", path: `members[value eq "${asha}"]` }]))).status).toBe(204);
    expect((await scim("GET", `/Groups/${id}`)).json.members).toEqual([expect.objectContaining({ value: mei })]);
    await scim("PATCH", `/Groups/${id}`, patchOp([{ op: "Replace", path: "displayName", value: "Platform" }]));
    const list = await scim("GET", `/Groups?filter=${encodeURIComponent('displayName eq "Platform"')}&excludedAttributes=members`);
    expect(list.json.Resources).toEqual([expect.objectContaining({ id, displayName: "Platform" })]);
    expect(list.json.Resources[0].members).toBeUndefined();
    // In Admin → Groups: models and budgets can be given; name and members come from the directory.
    expect((await call(owner, "PATCH", `/api/admin/groups/${id}`, { memberIds: [asha] })).status).toBe(400);
    expect((await call(owner, "PATCH", `/api/admin/groups/${id}`, { tokenLimit: 1_000_000, memberIds: [mei] })).status).toBe(200);
    expect((await scim("DELETE", `/Groups/${id}`)).status).toBe(204);
    expect((await scim("GET", `/Groups/${id}`)).status).toBe(404);
  });

  it("deleting a person deactivates them (their work stays); a new token replaces the old one", async () => {
    const id = (await person("asha.rao@acme.test"))!.id as string;
    expect((await scim("DELETE", `/Users/${id}`)).status).toBe(204);
    expect((await scim("GET", `/Users/${id}`)).status).toBe(404);
    expect(await person("asha.rao@acme.test")).toMatchObject({ status: "deactivated", directory: null });
    const old = token;
    token = (await call(owner, "POST", "/api/admin/directory/scim/token")).json.token;
    expect((await scim("GET", "/Users", undefined, old)).status).toBe(401);
    expect((await scim("GET", "/Users")).status).toBe(200);
    expect((await call(owner, "GET", "/api/admin/directory")).json.scim).toMatchObject({ on: true, people: 1 });
    const audit = (await call(owner, "GET", "/api/admin/audit")).json.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(["user.directory_created", "user.deactivated", "group.directory_created", "directory.scim_on", "directory.scim_token_replaced"]));
  });

  /* ───────────── LDAP ───────────── */

  it("LDAP: tests the connection, then syncs people and groups; leavers are deactivated, returners come back", async () => {
    const ldap = await startMockLdap({
      users: { "cn=svc,dc=acme,dc=test": "svc-password" },
      entries: [
        { dn: "uid=kim,ou=people,dc=acme,dc=test", attributes: { objectClass: ["inetOrgPerson"], mail: "Kim@acme.test", cn: "Kim Lee", entryUUID: "e-kim" } },
        { dn: "uid=lee,ou=people,dc=acme,dc=test", attributes: { objectClass: ["inetOrgPerson"], mail: "lee@acme.test", cn: "Lee Park", entryUUID: "e-lee" } },
        { dn: "uid=omar,ou=people,dc=acme,dc=test", attributes: { objectClass: ["inetOrgPerson"], mail: "omar@acme.test", cn: "Omar", entryUUID: "e-omar" } },
        { dn: "uid=nomail,ou=people,dc=acme,dc=test", attributes: { objectClass: ["inetOrgPerson"], cn: "No Mail", entryUUID: "e-x" } },
        // Kept up to date by SCIM: LDAP leaves them alone.
        { dn: "uid=mei,ou=people,dc=acme,dc=test", attributes: { objectClass: ["inetOrgPerson"], mail: "mei@acme.test", cn: "Mei (LDAP)", entryUUID: "e-mei" } },
        { dn: "cn=sales,ou=groups,dc=acme,dc=test", attributes: { objectClass: "groupOfNames", cn: "Sales", entryUUID: "g-sales", member: ["uid=kim,ou=people,dc=acme,dc=test", "UID=Lee, OU=People, DC=acme, DC=test"] } },
      ],
    });
    try {
      const settings = {
        url: ldap.url,
        bindDn: "cn=svc,dc=acme,dc=test",
        bindPassword: "svc-password",
        userBase: "ou=people,dc=acme,dc=test",
        userFilter: "(&(objectClass=inetOrgPerson)(mail=*))",
        emailAttr: "mail",
        nameAttr: "cn",
        idAttr: "entryUUID",
        groupBase: "ou=groups,dc=acme,dc=test",
        groupFilter: "(objectClass=groupOfNames)",
        workspaceId,
      };
      // Plain ldap:// to another host would send the password in the clear.
      expect((await call(owner, "POST", "/api/admin/directory/ldap/test", { ...settings, url: "ldap://dc.acme.test" })).json.error).toContain("StartTLS");
      expect((await call(owner, "POST", "/api/admin/directory/ldap/test", { ...settings, bindPassword: "wrong" })).json).toMatchObject({ ok: false, message: expect.stringContaining("refused the service account") });
      const test = await call(owner, "POST", "/api/admin/directory/ldap/test", settings);
      expect(test.json).toMatchObject({ ok: true, people: 4, withoutEmail: 0, groups: 1 });
      expect((await call(owner, "PUT", "/api/admin/directory/ldap", settings)).status).toBe(200);
      const saved = (await call(owner, "GET", "/api/admin/directory")).json.ldap.settings;
      expect(saved).toMatchObject({ hasPassword: true, userBase: settings.userBase });
      expect(JSON.stringify(saved)).not.toContain("svc-password");

      const first = (await call(owner, "POST", "/api/admin/directory/ldap/sync", {})).json.result;
      expect(first).toMatchObject({ ok: true, people: 4, created: 3, groups: 1, heldBack: 0 });
      expect(first.skipped).toEqual([expect.stringContaining("mei@acme.test")]);
      expect(await person("kim@acme.test")).toMatchObject({ name: "Kim Lee", directory: "ldap", external_id: "e-kim", status: "active" });
      const groups = (await call(owner, "GET", "/api/admin/groups")).json as { name: string; directory: string; members: { email: string }[] }[];
      expect(groups.find((g) => g.name === "Sales")).toMatchObject({ directory: "ldap" });
      expect(groups.find((g) => g.name === "Sales")!.members.map((m) => m.email).sort()).toEqual(["kim@acme.test", "lee@acme.test"]);

      // Lee leaves; Kim is renamed; the next sync follows.
      ldap.state.entries = ldap.state.entries.filter((e) => !e.dn.startsWith("uid=lee"));
      ldap.state.entries.find((e) => e.dn.startsWith("uid=kim"))!.attributes.cn = "Kim Lee-Park";
      const second = (await call(owner, "POST", "/api/admin/directory/ldap/sync", {})).json.result;
      expect(second).toMatchObject({ ok: true, deactivated: 1, updated: 1 });
      expect((await person("lee@acme.test"))!.status).toBe("deactivated");
      expect((await person("kim@acme.test"))!.name).toBe("Kim Lee-Park");
      // Lee comes back.
      ldap.state.entries.push({ dn: "uid=lee,ou=people,dc=acme,dc=test", attributes: { objectClass: ["inetOrgPerson"], mail: "lee@acme.test", cn: "Lee Park", entryUUID: "e-lee" } });
      expect((await call(owner, "POST", "/api/admin/directory/ldap/sync", {})).json.result).toMatchObject({ reactivated: 1 });

      // A wrong filter that finds nobody changes nothing.
      await call(owner, "PUT", "/api/admin/directory/ldap", { ...settings, userFilter: "(objectClass=nothing)" });
      const none = (await call(owner, "POST", "/api/admin/directory/ldap/sync", {})).json.result;
      expect(none).toMatchObject({ ok: false, error: expect.stringContaining("found nobody") });
      expect((await person("kim@acme.test"))!.status).toBe("active");
      // Six more people, then a filter that finds only one of the nine: more than half would go,
      // so nobody is deactivated…
      for (const n of ["p1", "p2", "p3", "p4", "p5", "p6"])
        ldap.state.entries.push({ dn: `uid=${n},ou=people,dc=acme,dc=test`, attributes: { objectClass: ["inetOrgPerson"], mail: `${n}@acme.test`, cn: n, entryUUID: `e-${n}` } });
      await call(owner, "PUT", "/api/admin/directory/ldap", settings);
      expect((await call(owner, "POST", "/api/admin/directory/ldap/sync", {})).json.result.created).toBe(6);
      await call(owner, "PUT", "/api/admin/directory/ldap", { ...settings, userFilter: "(&(objectClass=inetOrgPerson)(mail=kim@acme.test))" });
      const held = (await call(owner, "POST", "/api/admin/directory/ldap/sync", {})).json.result;
      expect(held).toMatchObject({ ok: true, heldBack: 8, deactivated: 0 });
      expect((await person("p1@acme.test"))!.status).toBe("active");
      // …and Health says so. Asked to, an admin's sync goes ahead.
      const health = (await call(owner, "GET", "/api/admin/health")).json.checks.find((c: { id: string }) => c.id === "directory:ldap");
      expect(health).toMatchObject({ level: "warn", area: "Directory" });
      expect((await call(owner, "POST", "/api/admin/directory/ldap/sync", { allowMass: true })).json.result.deactivated).toBe(8);
      expect((await person("p1@acme.test"))!.status).toBe("deactivated");

      // The directory unreachable: the sync fails, Health shows it, nothing changes.
      ldap.state.failSearch = "server busy";
      await call(owner, "PUT", "/api/admin/directory/ldap", settings);
      expect((await call(owner, "POST", "/api/admin/directory/ldap/sync", {})).json.result.ok).toBe(false);
      expect((await call(owner, "GET", "/api/admin/health")).json.checks.find((c: { id: string }) => c.id === "directory:ldap")).toMatchObject({ level: "error" });
      // Turned off: people stay as they are.
      expect((await call(owner, "DELETE", "/api/admin/directory/ldap")).json.ldap.settings).toBeNull();
      expect((await person("kim@acme.test"))!.status).toBe("active");
    } finally {
      await ldap.close();
    }
  });
});
