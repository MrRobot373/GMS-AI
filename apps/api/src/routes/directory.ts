/**
 * Admin → Authentication → Directory: SCIM provisioning (a token for the identity provider) and
 * LDAP / Active Directory sync (the connection, a test, and syncing now). Both are Enterprise.
 */
import { eq, organization, ssoConnection, type LdapSettingsStored } from "@aatmiq/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit, getOrg, parse, requireOrgCap, requireUser, type AppContext } from "../context";
import { randomToken, sha256 } from "../crypto";
import { badRequest, HttpError } from "../errors";
import { localeOf, tr } from "../i18n";
import { LDAP_PRESETS, LdapError, lastSync, ldapPassword, readPeople, syncLdap } from "../services/ldap";
import { scimCounts } from "./scim";

const ldapInput = z.object({
  enabled: z.boolean().default(true),
  url: z.string().trim().min(1).max(500),
  startTls: z.boolean().default(false),
  caCert: z.string().trim().max(20_000).nullable().optional(),
  bindDn: z.string().trim().min(1).max(500),
  /** Empty or missing: keep the saved one. */
  bindPassword: z.string().max(500).optional(),
  userBase: z.string().trim().min(1).max(500),
  userFilter: z.string().trim().min(3).max(2000),
  emailAttr: z.string().trim().min(1).max(100).default("mail"),
  nameAttr: z.string().trim().min(1).max(100).default("displayName"),
  idAttr: z.string().trim().min(1).max(100).default("objectGUID"),
  groupBase: z.string().trim().max(500).nullable().optional(),
  groupFilter: z.string().trim().max(2000).default("(objectClass=group)"),
  groupNameAttr: z.string().trim().min(1).max(100).default("cn"),
  memberAttr: z.string().trim().min(1).max(100).default("member"),
  intervalMinutes: z.number().int().min(15).max(24 * 60).default(60),
  workspaceId: z.string().nullable().optional(),
});

export async function directoryRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, box, cfg, license } = ctx;

  async function requireFeature() {
    if (!(await license.hasFeature("oidc"))) throw new HttpError(402, "Directory sync (SCIM and LDAP) is part of the Enterprise plan.", "feature_unavailable");
  }

  function ldapView(s: LdapSettingsStored | null | undefined) {
    if (!s) return null;
    const { bindPasswordEnc, ...rest } = s;
    return { ...rest, hasPassword: !!bindPasswordEnc };
  }

  async function view(req: FastifyRequest) {
    const org = await getOrg(db);
    const locale = localeOf(req);
    const last = await lastSync(db);
    const scim = org?.scimSettings ?? null;
    const sso = await db.select({ id: ssoConnection.id }).from(ssoConnection).where(eq(ssoConnection.enabled, true));
    return {
      feature: await license.hasFeature("oidc"),
      // People from a directory sign in with single sign-on.
      ssoEnabled: sso.length > 0,
      scim: {
        on: !!scim,
        baseUrl: `${cfg.appUrl}/api/scim/v2`,
        tokenHint: scim?.tokenHint ?? null,
        createdAt: scim?.createdAt ?? null,
        lastUsedAt: scim?.lastUsedAt ?? null,
        workspaceId: scim?.workspaceId ?? null,
        ...(await scimCounts(db)),
      },
      // What went wrong, in the reader's language.
      ldap: {
        settings: ldapView(org?.ldapSettings),
        last: last && { ...last, error: last.error && tr(locale, last.error), skipped: last.skipped.map((x) => tr(locale, x)) },
        presets: LDAP_PRESETS,
      },
    };
  }

  app.get("/api/admin/directory", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    return view(req);
  });

  /* ───────────── SCIM ───────────── */

  /** A new token (shown once); the old one stops working. */
  app.post("/api/admin/directory/scim/token", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    await requireFeature();
    const org = await getOrg(db);
    if (!org) throw badRequest("Organization not found");
    const token = `aatmiq_scim_${randomToken(32)}`;
    await db
      .update(organization)
      .set({ scimSettings: { tokenHash: sha256(token), tokenHint: token.slice(-4), createdAt: new Date().toISOString(), lastUsedAt: null, workspaceId: org.scimSettings?.workspaceId ?? null } })
      .where(eq(organization.id, org.id));
    await audit(ctx, { actor: u, action: org.scimSettings ? "directory.scim_token_replaced" : "directory.scim_on" });
    return { ...(await view(req)), token };
  });

  app.put("/api/admin/directory/scim", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const body = parse(z.object({ workspaceId: z.string().nullable() }), req.body);
    const org = await getOrg(db);
    if (!org?.scimSettings) throw badRequest("Turn on provisioning first.");
    await db.update(organization).set({ scimSettings: { ...org.scimSettings, workspaceId: body.workspaceId } }).where(eq(organization.id, org.id));
    await audit(ctx, { actor: u, action: "directory.scim_updated", meta: body });
    return view(req);
  });

  /** Turns provisioning off: the token stops working; people and groups stay as they are. */
  app.delete("/api/admin/directory/scim", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const org = await getOrg(db);
    if (org) await db.update(organization).set({ scimSettings: null }).where(eq(organization.id, org.id));
    await audit(ctx, { actor: u, action: "directory.scim_off" });
    return view(req);
  });

  /* ───────────── LDAP ───────────── */

  /** The settings as sent, with the saved password when no new one is given. */
  async function settingsFrom(body: unknown): Promise<LdapSettingsStored> {
    const b = parse(ldapInput, body);
    const saved = (await getOrg(db))?.ldapSettings;
    let url: URL;
    try {
      url = new URL(b.url);
    } catch {
      throw badRequest("Enter the directory's address, e.g. ldaps://dc.acme.local.");
    }
    if (url.protocol !== "ldap:" && url.protocol !== "ldaps:") throw badRequest("The address must start with ldap:// or ldaps://.");
    // Never the bind password in the clear over the network.
    if (url.protocol === "ldap:" && !b.startTls && !["localhost", "127.0.0.1"].includes(url.hostname))
      throw badRequest("Use ldaps://, or turn on StartTLS: the service account's password mustn't cross the network unencrypted.");
    if (b.caCert && !b.caCert.includes("BEGIN CERTIFICATE")) throw badRequest("Paste the CA certificate in PEM (it starts with -----BEGIN CERTIFICATE-----).");
    return {
      enabled: b.enabled,
      url: b.url,
      startTls: b.startTls,
      caCert: b.caCert || null,
      bindDn: b.bindDn,
      bindPasswordEnc: b.bindPassword ? box.encrypt(b.bindPassword) : (saved?.bindPasswordEnc ?? null),
      userBase: b.userBase,
      userFilter: b.userFilter,
      emailAttr: b.emailAttr,
      nameAttr: b.nameAttr,
      idAttr: b.idAttr,
      groupBase: b.groupBase || null,
      groupFilter: b.groupFilter,
      groupNameAttr: b.groupNameAttr,
      memberAttr: b.memberAttr,
      intervalMinutes: b.intervalMinutes,
      workspaceId: b.workspaceId ?? null,
    };
  }

  app.put("/api/admin/directory/ldap", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    await requireFeature();
    const s = await settingsFrom(req.body);
    const org = await getOrg(db);
    if (!org) throw badRequest("Organization not found");
    await db.update(organization).set({ ldapSettings: s }).where(eq(organization.id, org.id));
    await audit(ctx, { actor: u, action: "directory.ldap_saved", meta: { url: s.url, userBase: s.userBase, groups: !!s.groupBase, enabled: s.enabled } });
    return view(req);
  });

  /** Connects with the settings in the form (saved or not) and says what it finds; changes nothing. */
  app.post("/api/admin/directory/ldap/test", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const s = await settingsFrom(req.body);
    try {
      const r = await readPeople(s, ldapPassword(s, box));
      return { ok: true, people: r.people.length, withoutEmail: r.withoutEmail, groups: r.groups.length, sample: r.people.slice(0, 5).map((p) => ({ email: p.email, name: p.name, disabled: p.disabled })) };
    } catch (e) {
      if (e instanceof LdapError) return { ok: false, message: tr(localeOf(req), e.message) };
      throw e;
    }
  });

  app.post("/api/admin/directory/ldap/sync", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    await requireFeature();
    const body = parse(z.object({ allowMass: z.boolean().optional() }), req.body ?? {});
    const s = (await getOrg(db))?.ldapSettings;
    if (!s) throw badRequest("Save the directory's settings first.");
    const result = await syncLdap(ctx, s, { allowMass: body.allowMass });
    await audit(ctx, { actor: u, action: "directory.ldap_sync_run", meta: { ok: result.ok, allowMass: !!body.allowMass } });
    return { ...(await view(req)), result: { ...result, error: result.error && tr(localeOf(req), result.error) } };
  });

  /** Stops syncing: people and groups stay as they are (and can be edited by hand again). */
  app.delete("/api/admin/directory/ldap", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const org = await getOrg(db);
    if (org) await db.update(organization).set({ ldapSettings: null }).where(eq(organization.id, org.id));
    await audit(ctx, { actor: u, action: "directory.ldap_off" });
    return view(req);
  });
}
