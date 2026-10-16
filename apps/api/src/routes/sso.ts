import { account, and, asc, eq, gte, inArray, invitation, isNull, or, organization, session, sql, ssoConnection, ssoSession, user, workspace, workspaceMember } from "@aatmiq/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes, randomUUID } from "node:crypto";
import { PRODUCT_NAME, DEFAULT_MEMBER_SECTIONS } from "@aatmiq/shared";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { ssoTicketId, ticketValue } from "../auth";
import { audit, getOrg, notify, parse, requireOrgCap, requireUser, type AppContext } from "../context";
import { randomToken, sha256 } from "../crypto";
import { badRequest, HttpError, notFound } from "../errors";
import {
  authorizationUrl,
  clearSsoCaches,
  completeSignIn,
  discover,
  emailDomainAllowed,
  GOOGLE_ISSUER,
  microsoftIssuer,
  newAuthRequest,
  SsoError,
  type SsoIdentity,
} from "../services/sso";
import {
  acsUrl,
  certExpiry,
  fetchIdpMetadata,
  normalizeCerts,
  parseIdpMetadata,
  peekInResponseTo,
  samlComplete,
  samlLogoutMessage,
  samlLogoutResponseUrl,
  samlLogoutUrl,
  samlStart,
  sloUrl,
  spEntityId,
  spMetadata,
  type SamlSubject,
} from "../services/saml";
import { samlSigning } from "../services/saml-signing";

const STATE_COOKIE = "aatmiq_sso";
const samlRequestId = (id: string) => `saml-request:${id}`;
const STATE_TTL_MS = 10 * 60_000;

const domainList = z
  .array(z.string().trim().toLowerCase().transform((d) => d.replace(/^@/, "")))
  .max(50)
  .refine((ds) => ds.every((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)), "Enter domains like example.com");

type SsoType = "google" | "microsoft" | "oidc" | "saml";

const connectionInput = z.object({
  /** SAML: the form picks the ID first, so the admin can enter our URLs at the provider before saving. */
  id: z.string().uuid().optional(),
  type: z.enum(["google", "microsoft", "oidc", "saml"]),
  name: z.string().trim().min(1).max(60).optional(),
  /** OpenID: the issuer URL. SAML: the identity provider's entity ID. */
  issuer: z.string().trim().max(1000).optional(),
  tenantId: z.string().trim().optional(),
  clientId: z.string().trim().min(1).max(500).optional(),
  clientSecret: z.string().trim().min(1).max(2000).optional(),
  samlSsoUrl: z.string().trim().max(2000).optional(),
  /** Optional: the identity provider's single logout address. */
  samlSloUrl: z.string().trim().max(2000).nullable().optional(),
  /** PEM or Base64; several for a certificate rotation. */
  samlCerts: z.string().max(50_000).optional(),
  domains: domainList.default([]),
  autoJoin: z.boolean().default(false),
  defaultWorkspaceId: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
});
// No defaults here: a partial update must leave untouched fields as they are.
const connectionUpdate = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  issuer: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
  clientId: z.string().trim().min(1).max(500).optional(),
  clientSecret: z.string().trim().min(1).max(2000).optional(),
  samlSsoUrl: z.string().trim().max(2000).optional(),
  samlSloUrl: z.string().trim().max(2000).nullable().optional(),
  samlCerts: z.string().max(50_000).optional(),
  domains: domainList.optional(),
  autoJoin: z.boolean().optional(),
  defaultWorkspaceId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

const BROAD_TENANTS = new Set(["common", "organizations", "consumers"]);

function httpsUrl(raw: string | undefined, example: string, what: string) {
  let u: URL;
  try {
    u = new URL(raw?.trim() ?? "");
  } catch {
    throw badRequest(`Enter the ${what}, e.g. ${example}`);
  }
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw badRequest(`The ${what} must use https.`);
  return u.toString();
}

function issuerFor(type: SsoType, input: { issuer?: string; tenantId?: string }) {
  if (type === "google") return GOOGLE_ISSUER;
  if (type === "saml") {
    // An entity ID is a URI: often a URL, sometimes a URN (urn:…), or the identity provider's own name.
    const id = input.issuer?.trim() ?? "";
    if (!id) throw badRequest("Enter the identity provider's entity ID (Issuer), or import its metadata.");
    return id;
  }
  if (type === "microsoft") {
    const t = input.tenantId?.trim() ?? "";
    if (!t) throw badRequest("Enter your Microsoft Entra directory (tenant) ID.");
    // Multi-tenant endpoints would let any Microsoft directory vouch for any email address.
    if (BROAD_TENANTS.has(t.toLowerCase())) throw badRequest("Use your organization's own directory (tenant) ID, not “common” or “organizations”.");
    if (!/^[a-zA-Z0-9.-]+$/.test(t)) throw badRequest("That doesn't look like a directory (tenant) ID.");
    return microsoftIssuer(t);
  }
  const iss = input.issuer?.trim().replace(/\/$/, "") ?? "";
  let u: URL;
  try {
    u = new URL(iss);
  } catch {
    throw badRequest("Enter the issuer URL, e.g. https://acme.okta.com");
  }
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) throw badRequest("The issuer URL must use https.");
  return iss;
}

const DEFAULT_NAME = { google: "Google", microsoft: "Microsoft", oidc: "Single sign-on", saml: "Single sign-on" } as const;
/** Custom providers, OpenID Connect or SAML, are one license feature. */
const FEATURE_FOR = { google: "sso", microsoft: "sso", oidc: "oidc", saml: "oidc" } as const;

function readCookie(req: FastifyRequest, name: string) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.cookie ?? "");
  return m ? decodeURIComponent(m[1]!) : null;
}

export async function ssoRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, box, cfg, license } = ctx;
  const redirectUri = `${cfg.appUrl}/api/auth/sso/callback`;
  const secure = cfg.appUrl.startsWith("https://");
  const stateCookie = (value: string, maxAge: number) =>
    `${STATE_COOKIE}=${encodeURIComponent(value)}; Path=/api/auth/sso; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

  const publicConn = (c: typeof ssoConnection.$inferSelect) => {
    const { clientSecretEnc: _s, ...rest } = c;
    if (c.type !== "saml") return rest;
    // What to enter at the identity provider.
    const sp = { entityId: spEntityId(cfg.appUrl, c.id), acsUrl: acsUrl(cfg.appUrl, c.id), metadataUrl: spEntityId(cfg.appUrl, c.id), sloUrl: sloUrl(cfg.appUrl, c.id) };
    return { ...rest, sp, certExpires: certExpiry(c.samlCerts ?? []) };
  };

  /* ───────────── Sign-in flow ───────────── */

  function fail(reply: FastifyReply, message: string, invite?: string | null) {
    const target = invite ? `/invite/${encodeURIComponent(invite)}` : "/login";
    return reply.header("set-cookie", stateCookie("", 0)).redirect(`${target}?sso_error=${encodeURIComponent(message)}`);
  }

  app.get<{ Params: { id: string }; Querystring: { next?: string; invite?: string; email?: string } }>("/api/auth/sso/:id/start", async (req, reply) => {
    const [conn] = await db.select().from(ssoConnection).where(eq(ssoConnection.id, req.params.id));
    const invite = req.query.invite ?? null;
    if (!conn || !conn.enabled) return fail(reply, "This sign-in option isn't available.", invite);
    if (!(await license.hasFeature(FEATURE_FOR[conn.type]))) return fail(reply, "Single sign-on isn't included in your organization's license.", invite);
    const next = req.query.next && /^\/(?!\/)/.test(req.query.next) ? req.query.next : "/app";
    const exp = Date.now() + STATE_TTL_MS;
    if (conn.type === "saml") {
      let started;
      try {
        started = await samlStart(conn, cfg.appUrl, randomToken(), req.query.email);
      } catch (e) {
        return fail(reply, e instanceof SsoError ? e.message : "Couldn't start single sign-on.", invite);
      }
      // The request is answered once, by this browser (the sealed cookie) and only once (this record).
      const actx = await ctx.auth.$context;
      await actx.internalAdapter.createVerificationValue({ identifier: samlRequestId(started.requestId), value: conn.id, expiresAt: new Date(exp) });
      const sealed = box.encrypt(JSON.stringify({ connId: conn.id, requestId: started.requestId, requestAt: started.requestAt, next, invite, exp }));
      return reply.header("set-cookie", stateCookie(sealed, STATE_TTL_MS / 1000)).redirect(started.url);
    }
    const r = newAuthRequest();
    let url: string;
    try {
      url = await authorizationUrl(conn, { redirectUri, state: r.state, nonce: r.nonce, challenge: r.challenge, loginHint: req.query.email });
    } catch (e) {
      return fail(reply, e instanceof SsoError ? e.message : "Couldn't start single sign-on.", invite);
    }
    const sealed = box.encrypt(JSON.stringify({ ...r, connId: conn.id, next, invite, exp }));
    return reply.header("set-cookie", stateCookie(sealed, STATE_TTL_MS / 1000)).redirect(url);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>("/api/auth/sso/callback", async (req, reply) => {
    let st: { state: string; nonce: string; verifier: string; connId: string; next: string; invite: string | null; exp: number };
    try {
      st = JSON.parse(box.decrypt(readCookie(req, STATE_COOKIE) ?? ""));
    } catch {
      return fail(reply, "Your sign-in session expired. Please try again.");
    }
    if (st.exp < Date.now() || !req.query.state || req.query.state !== st.state) return fail(reply, "Your sign-in session expired. Please try again.", st.invite);
    if (req.query.error) return fail(reply, req.query.error_description || "Sign-in was cancelled.", st.invite);
    if (!req.query.code) return fail(reply, "The provider didn't complete the sign-in.", st.invite);

    const [conn] = await db.select().from(ssoConnection).where(eq(ssoConnection.id, st.connId));
    if (!conn || !conn.enabled || conn.type === "saml") return fail(reply, "This sign-in option isn't available.", st.invite);

    let identity;
    try {
      identity = await completeSignIn(conn, box.decrypt(conn.clientSecretEnc ?? ""), { code: req.query.code, verifier: st.verifier, nonce: st.nonce, redirectUri });
    } catch (e) {
      req.log.warn({ err: e }, "sso sign-in failed");
      return fail(reply, e instanceof SsoError ? e.message : "Single sign-on failed.", st.invite);
    }
    return finishSignIn(req, reply, conn, identity, st);
  });

  /* ───────────── SAML ───────────── */

  // The identity provider posts its answers and logout requests as forms; only these routes take form bodies.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 512 * 1024 }, (req, body, done) => {
    if (!/^\/api\/auth\/sso\/[^/]+\/(acs|slo)(\?|$)/.test(req.url)) return done(new HttpError(415, "Unsupported content type"), undefined);
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  /** Our metadata (and our entity ID): identity providers can import it from this URL. */
  app.get<{ Params: { id: string } }>("/api/auth/sso/:id/metadata", async (req, reply) => {
    const [conn] = await db.select().from(ssoConnection).where(eq(ssoConnection.id, req.params.id));
    if (!conn || conn.type !== "saml") throw notFound("Not found");
    // With our signing certificate: providers check our logout messages with it.
    return reply.type("application/samlmetadata+xml; charset=utf-8").send(spMetadata(conn, cfg.appUrl, await samlSigning(db, box)));
  });

  /**
   * The identity provider's answer (HTTP-POST binding). It arrives from the provider's site, so the
   * browser leaves out our SameSite=Lax state cookie; the first time, a page on our own site posts the
   * same form again, now with the cookie. A sign-in started at the provider (its app tile) has no
   * request of ours to answer: it's restarted from here, and the provider, already signed in, answers.
   */
  app.post<{ Params: { id: string }; Querystring: { again?: string }; Body: { SAMLResponse?: string; RelayState?: string } }>(
    "/api/auth/sso/:id/acs",
    async (req, reply) => {
      const samlResponse = typeof req.body?.SAMLResponse === "string" ? req.body.SAMLResponse : "";
      if (!samlResponse) return fail(reply, "The identity provider didn't complete the sign-in.");
      const [conn] = await db.select().from(ssoConnection).where(eq(ssoConnection.id, req.params.id));
      if (!conn || !conn.enabled || conn.type !== "saml") return fail(reply, "This sign-in option isn't available.");
      const cookie = readCookie(req, STATE_COOKIE);
      if (!cookie && !req.query.again) {
        const nonce = randomBytes(16).toString("base64");
        const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        const relay = typeof req.body?.RelayState === "string" ? `<input type="hidden" name="RelayState" value="${esc(req.body.RelayState)}">` : "";
        return reply
          .type("text/html; charset=utf-8")
          .header("cache-control", "no-store")
          // The form may end up at the provider: a sign-in it started is restarted from here (form-action
          // covers where the post's redirects lead too).
          .header("content-security-policy", `default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self' ${new URL(conn.samlSsoUrl!).origin}; frame-ancestors 'none'`)
          .send(
            `<!doctype html><meta charset="utf-8"><title>Signing in…</title>` +
              `<form method="post" action="/api/auth/sso/${encodeURIComponent(req.params.id)}/acs?again=1">` +
              `<input type="hidden" name="SAMLResponse" value="${esc(samlResponse)}">${relay}` +
              `<noscript><button type="submit">Continue signing in</button></noscript></form>` +
              `<script nonce="${nonce}">document.forms[0].submit()</script>`,
          );
      }
      let st: { connId: string; requestId: string; requestAt: string; next: string; invite: string | null; exp: number } | null = null;
      try {
        st = JSON.parse(box.decrypt(cookie ?? ""));
      } catch {
        st = null;
      }
      if (!st || st.connId !== conn.id || !st.requestId || st.exp < Date.now()) {
        // Started at the provider: start again from here. (Our own requests always get an answer that
        // names them, so this doesn't repeat; without cookies the answer is refused below.)
        if (!peekInResponseTo(samlResponse)) return reply.redirect(`/api/auth/sso/${encodeURIComponent(conn.id)}/start`);
        return fail(reply, "Your sign-in session expired. Please try again.", st?.invite);
      }
      const used = await (await ctx.auth.$context).internalAdapter.consumeVerificationValue(samlRequestId(st.requestId));
      if (!used || used.value !== conn.id) return fail(reply, "Your sign-in session expired. Please try again.", st.invite);
      if (!(await license.hasFeature(FEATURE_FOR.saml))) return fail(reply, "Single sign-on isn't included in your organization's license.", st.invite);
      let identity;
      try {
        identity = await samlComplete(conn, cfg.appUrl, samlResponse, { id: st.requestId, at: st.requestAt });
      } catch (e) {
        req.log.warn({ err: e }, "saml sign-in failed");
        return fail(reply, e instanceof SsoError ? e.message : "Single sign-on failed.", st.invite);
      }
      return finishSignIn(req, reply, conn, identity, st, identity.saml);
    },
  );

  /* ───────────── Signing out, and single logout ───────────── */

  /**
   * Signing out. After a SAML sign-in, when the provider offers single logout, the browser goes on to
   * the provider, which signs the person out there too and sends them back to /slo.
   */
  app.post("/api/auth/sso/logout", async (req, reply) => {
    const headers = fromNodeHeaders(req.headers);
    const current = await ctx.auth.api.getSession({ headers }).catch(() => null);
    let redirect: string | null = null;
    if (current) {
      const [link] = await db.select().from(ssoSession).where(eq(ssoSession.sessionId, current.session.id));
      const [conn] = link ? await db.select().from(ssoConnection).where(eq(ssoConnection.id, link.connectionId)) : [];
      if (link && conn?.enabled && conn.samlSloUrl) {
        try {
          redirect = await samlLogoutUrl(conn, cfg.appUrl, await samlSigning(db, box), link);
        } catch (e) {
          req.log.warn({ err: e }, "saml logout request failed");
        }
      }
    }
    // Better Auth ends the session and clears its cookie.
    const res = await ctx.auth.api.signOut({ headers, asResponse: true }).catch(() => null);
    for (const c of res?.headers.getSetCookie() ?? []) reply.header("set-cookie", c);
    return { ok: true, redirect };
  });

  /**
   * The provider's logout messages: its request to end someone's sessions (they signed out
   * elsewhere), answered with a signed response; or its answer to our request.
   */
  async function singleLogout(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, message: Parameters<typeof samlLogoutMessage>[3], relayState: string) {
    const [conn] = await db.select().from(ssoConnection).where(eq(ssoConnection.id, req.params.id));
    if (!conn || conn.type !== "saml") return reply.redirect("/login");
    const signing = await samlSigning(db, box);
    const isRequest = "query" in message ? typeof message.query.SAMLRequest === "string" : !!message.body.SAMLRequest;
    let result;
    try {
      result = await samlLogoutMessage(conn, cfg.appUrl, signing, message);
    } catch (e) {
      req.log.warn({ err: e }, "saml logout message refused");
      // An answer to our request: the person is signed out here already.
      if (!isRequest) return reply.redirect("/login?signed_out=1");
      return reply.status(400).type("text/plain; charset=utf-8").send(e instanceof SsoError ? e.message : "The logout request couldn't be read.");
    }
    if (!result.request) return reply.redirect("/login?signed_out=1");
    const index = result.request.sessionIndex;
    const ended = await db
      .select({ id: ssoSession.sessionId })
      .from(ssoSession)
      .where(
        and(
          eq(ssoSession.connectionId, conn.id),
          eq(ssoSession.nameId, result.request.nameID),
          ...(index ? [or(eq(ssoSession.sessionIndex, index), isNull(ssoSession.sessionIndex))] : []),
        ),
      );
    if (ended.length) await db.delete(session).where(inArray(session.id, ended.map((e) => e.id)));
    await audit(ctx, { action: "auth.sso_logout", targetType: "sso_connection", targetId: conn.id, meta: { connection: conn.name, sessions: ended.length }, ip: req.ip });
    return reply.redirect(await samlLogoutResponseUrl(conn, cfg.appUrl, signing, result.request, relayState));
  }

  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>("/api/auth/sso/:id/slo", async (req, reply) =>
    singleLogout(req, reply, { query: req.query, originalQuery: req.url.split("?")[1] ?? "" }, typeof req.query.RelayState === "string" ? req.query.RelayState : ""),
  );
  app.post<{ Params: { id: string }; Body: Record<string, string> }>("/api/auth/sso/:id/slo", async (req, reply) =>
    singleLogout(req, reply, { body: req.body ?? {} }, typeof req.body?.RelayState === "string" ? req.body.RelayState : ""),
  );

  /** After the provider vouched for someone: find or create their account, then sign them in. */
  async function finishSignIn(
    req: FastifyRequest,
    reply: FastifyReply,
    conn: typeof ssoConnection.$inferSelect,
    identity: SsoIdentity,
    st: { next: string; invite: string | null },
    saml?: SamlSubject,
  ) {
    if (!emailDomainAllowed(conn, identity.email))
      return fail(reply, `${identity.email} can't sign in here. Use your ${conn.domains.join(" or ")} account.`, st.invite);

    const providerId = `sso:${conn.id}`;
    let userId: string | null = null;
    let created = false;

    // 1. Signed in with this provider before.
    const [linked] = await db
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, providerId), eq(account.accountId, identity.subject)));
    if (linked) userId = linked.userId;

    // 2. An existing account with the same email (password or another provider): link it.
    if (!userId) {
      const [existing] = await db.select({ id: user.id }).from(user).where(eq(sql`lower(${user.email})`, identity.email));
      if (existing) userId = existing.id;
    }

    // 3. A pending invitation for this email, or 4. auto-join for an allowed domain.
    if (!userId) {
      const [inv] = await db
        .select()
        .from(invitation)
        .where(and(eq(invitation.email, identity.email), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gte(invitation.expiresAt, new Date())));
      if (inv) {
        userId = await createUser(identity.email, identity.name, inv.orgRole);
        for (const w of inv.workspaces)
          await db.insert(workspaceMember).values({ workspaceId: w.workspaceId, userId, role: w.role, sections: DEFAULT_MEMBER_SECTIONS }).onConflictDoNothing();
        await db.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
        created = true;
      } else if (conn.autoJoin && conn.domains.length) {
        try {
          await license.requireSeats(1);
        } catch (e) {
          return fail(reply, e instanceof HttpError ? e.message : "No seats are left.", st.invite);
        }
        userId = await createUser(identity.email, identity.name, "member");
        const [ws] = conn.defaultWorkspaceId
          ? await db.select({ id: workspace.id }).from(workspace).where(and(eq(workspace.id, conn.defaultWorkspaceId), isNull(workspace.archivedAt)))
          : await db.select({ id: workspace.id }).from(workspace).where(isNull(workspace.archivedAt)).orderBy(asc(workspace.createdAt)).limit(1);
        if (ws) await db.insert(workspaceMember).values({ workspaceId: ws.id, userId, role: "member", sections: DEFAULT_MEMBER_SECTIONS }).onConflictDoNothing();
        created = true;
      } else {
        return fail(reply, `There's no account for ${identity.email} yet. Ask your admin for an invitation.`, st.invite);
      }
    }

    const [u] = await db.select({ id: user.id, status: user.status, name: user.name, orgRole: user.orgRole }).from(user).where(eq(user.id, userId));
    if (!u || u.status !== "active") return fail(reply, "Your account is deactivated. Ask your admin for help.", st.invite);

    if (!linked) {
      await db
        .insert(account)
        .values({ id: randomUUID(), userId: u.id, providerId, accountId: identity.subject, createdAt: new Date(), updatedAt: new Date() })
        .onConflictDoNothing();
    }
    const actor = { id: u.id, email: identity.email, name: u.name, image: null, orgRole: u.orgRole };
    if (created) await audit(ctx, { actor, action: "user.sso_created", targetType: "user", targetId: u.id, meta: { connection: conn.name }, ip: req.ip });
    await audit(ctx, { actor, action: "auth.sso_login", targetType: "sso_connection", targetId: conn.id, meta: { connection: conn.name }, ip: req.ip });

    const ticket = randomToken();
    const actx = await ctx.auth.$context;
    await actx.internalAdapter.createVerificationValue({
      identifier: ssoTicketId(sha256(ticket)),
      value: ticketValue({ userId: u.id, ...(saml ? { saml: { connectionId: conn.id, ...saml } } : {}) }),
      expiresAt: new Date(Date.now() + 2 * 60_000),
    });
    return reply
      .header("set-cookie", stateCookie("", 0))
      .redirect(`/api/auth/sso/ticket?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(st.next)}`);
  }

  async function createUser(email: string, name: string, orgRole: "owner" | "admin" | "member") {
    const id = randomUUID();
    await db.insert(user).values({ id, email, name, emailVerified: true, orgRole, createdAt: new Date(), updatedAt: new Date() });
    return id;
  }

  /* ───────────── Admin: Authentication ───────────── */

  /** Active people who sign in with a password but haven't set up two-step sign-in. */
  async function withoutTwoStep(ssoRequired: boolean) {
    const rows = await db
      .select({ id: user.id, orgRole: user.orgRole })
      .from(user)
      .where(
        and(
          eq(user.status, "active"),
          eq(user.twoFactorEnabled, false),
          sql`exists (select 1 from ${account} where ${account.userId} = ${sql.raw(`"user"."id"`)} and ${account.providerId} = 'credential')`,
        ),
      );
    return rows.filter((r) => !ssoRequired || r.orgRole === "owner");
  }

  async function authSettings() {
    const org = await getOrg(db);
    const connections = await db.select().from(ssoConnection).orderBy(asc(ssoConnection.createdAt));
    return {
      ssoRequired: org?.ssoRequired ?? false,
      twoFactorRequired: org?.twoFactorRequired ?? false,
      twoFactorDeadline: org?.twoFactorRequired && org.twoFactorDeadline && org.twoFactorDeadline > new Date() ? org.twoFactorDeadline.toISOString() : null,
      withoutTwoStep: (await withoutTwoStep(org?.ssoRequired ?? false)).length,
      redirectUri,
      /** SAML: our entity ID is `<samlBase>/<id>/metadata`, the reply (ACS) URL `<samlBase>/<id>/acs`. */
      samlBase: `${cfg.appUrl}/api/auth/sso`,
      connections: connections.map(publicConn),
      features: { sso: await license.hasFeature("sso"), oidc: await license.hasFeature("oidc") },
    };
  }

  app.get("/api/admin/auth", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    return authSettings();
  });

  app.put("/api/admin/auth", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const body = parse(
      z.object({
        ssoRequired: z.boolean().optional(),
        twoFactorRequired: z.boolean().optional(),
        /** Days people without two-step sign-in may keep working (with reminders) before it's enforced. */
        twoFactorGraceDays: z.number().int().min(0).max(30).optional(),
      }),
      req.body,
    );
    const org = await getOrg(db);
    if (body.ssoRequired !== undefined) {
      const { ssoRequired } = body;
      if (ssoRequired) {
        const live = await db.select({ id: ssoConnection.id }).from(ssoConnection).where(eq(ssoConnection.enabled, true));
        if (!live.length) throw badRequest("Add and enable a sign-in provider before requiring single sign-on.");
      }
      await db.update(organization).set({ ssoRequired }).where(eq(organization.id, org!.id));
      await audit(ctx, { actor: u, action: ssoRequired ? "auth.sso_required_on" : "auth.sso_required_off", targetType: "organization", targetId: org!.id });
    }
    if (body.twoFactorRequired !== undefined) {
      const { twoFactorRequired } = body;
      // The admin goes first, so turning the rule on never locks them out of this page.
      if (twoFactorRequired && (await withoutTwoStep(org?.ssoRequired ?? false)).some((r) => r.id === u.id)) {
        throw badRequest("Set up two-step sign-in for your own account first (Settings → Security).");
      }
      const graceDays = twoFactorRequired ? (body.twoFactorGraceDays ?? 0) : 0;
      const deadline = twoFactorRequired && graceDays > 0 ? new Date(Date.now() + graceDays * 86_400_000) : null;
      await db.update(organization).set({ twoFactorRequired, twoFactorDeadline: deadline }).where(eq(organization.id, org!.id));
      await audit(ctx, {
        actor: u,
        action: twoFactorRequired ? "auth.two_factor_required_on" : "auth.two_factor_required_off",
        targetType: "organization",
        targetId: org!.id,
        ...(twoFactorRequired ? { meta: { graceDays, deadline: deadline?.toISOString() ?? null } } : {}),
      });
      if (twoFactorRequired && !org?.twoFactorRequired) {
        // Tell the people it affects, with the date (or that they'll be asked at their next visit).
        const people = (await withoutTwoStep(org?.ssoRequired ?? false)).map((r) => r.id).filter((id) => id !== u.id);
        const when = deadline ? deadline.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
        await notify(db, people, {
          type: "security",
          title: when ? `Set up two-step sign-in by ${when}` : "Two-step sign-in is now required",
          body: when
            ? `Your organization requires two-step sign-in from ${when}. Set it up in Settings → Security; it takes a minute with an authenticator app.`
            : "Your organization now requires two-step sign-in: you'll be asked to set it up before you continue.",
          link: "/app/settings#security",
        });
      }
    }
    return authSettings();
  });

  async function requireFeatureFor(type: SsoType) {
    if (!(await license.hasFeature(FEATURE_FOR[type])))
      throw new HttpError(
        402,
        FEATURE_FOR[type] === "oidc" ? "Custom single sign-on (OpenID Connect or SAML) is part of the Enterprise plan." : "Google and Microsoft sign-in aren't included in your license.",
        "feature_unavailable",
      );
  }

  /** What each kind of provider needs: client ID and secret for OpenID, sign-in URL and certificate for SAML. */
  function credentials(type: SsoType, body: { clientId?: string; clientSecret?: string; samlSsoUrl?: string; samlSloUrl?: string | null; samlCerts?: string }) {
    if (type === "saml") {
      const samlSsoUrl = httpsUrl(body.samlSsoUrl, "https://acme.okta.com/app/…/sso/saml", "identity provider's sign-in URL (SSO URL)");
      let samlCerts: string[];
      try {
        samlCerts = normalizeCerts(body.samlCerts ?? "");
      } catch (e) {
        throw badRequest((e as Error).message);
      }
      const samlSloUrl = body.samlSloUrl ? httpsUrl(body.samlSloUrl, "https://acme.okta.com/app/…/slo/saml", "identity provider's single logout URL") : null;
      return { clientId: null, clientSecretEnc: null, samlSsoUrl, samlSloUrl, samlCerts };
    }
    if (!body.clientId) throw badRequest("Enter the client ID.");
    if (!body.clientSecret) throw badRequest("Enter the client secret.");
    return { clientId: body.clientId, clientSecretEnc: box.encrypt(body.clientSecret), samlSsoUrl: null, samlCerts: null };
  }

  async function checkWorkspace(id: string | null | undefined) {
    if (!id) return;
    const [w] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, id));
    if (!w) throw badRequest("Unknown workspace");
  }

  app.post("/api/admin/sso", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const body = parse(connectionInput, req.body);
    await requireFeatureFor(body.type);
    if (body.autoJoin && !body.domains.length) throw badRequest("List your email domains to let people join automatically.");
    await checkWorkspace(body.defaultWorkspaceId);
    if (body.id && (await db.select({ id: ssoConnection.id }).from(ssoConnection).where(eq(ssoConnection.id, body.id))).length)
      throw badRequest("A provider with this ID exists already. Close the form and start again.");
    const [c] = await db
      .insert(ssoConnection)
      .values({
        ...(body.id && body.type === "saml" ? { id: body.id } : {}),
        type: body.type,
        name: body.name || DEFAULT_NAME[body.type],
        issuer: issuerFor(body.type, body),
        tenantId: body.type === "microsoft" ? body.tenantId!.trim() : null,
        ...credentials(body.type, body),
        domains: body.domains,
        autoJoin: body.autoJoin,
        defaultWorkspaceId: body.defaultWorkspaceId ?? null,
        enabled: body.enabled,
      })
      .returning();
    await audit(ctx, { actor: u, action: "auth.sso_added", targetType: "sso_connection", targetId: c!.id, meta: { type: c!.type, name: c!.name, domains: c!.domains } });
    return publicConn(c!);
  });

  app.patch<{ Params: { id: string } }>("/api/admin/sso/:id", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const [c] = await db.select().from(ssoConnection).where(eq(ssoConnection.id, req.params.id));
    if (!c) throw notFound("Sign-in provider not found");
    const body = parse(connectionUpdate, req.body);
    if (body.enabled) await requireFeatureFor(c.type);
    const domains = body.domains ?? c.domains;
    const autoJoin = body.autoJoin ?? c.autoJoin;
    if (autoJoin && !domains.length) throw badRequest("List your email domains to let people join automatically.");
    await checkWorkspace(body.defaultWorkspaceId);
    let samlFields = {};
    if (c.type === "saml") {
      if (body.samlSsoUrl !== undefined) samlFields = { ...samlFields, samlSsoUrl: httpsUrl(body.samlSsoUrl, "https://acme.okta.com/app/…/sso/saml", "identity provider's sign-in URL (SSO URL)") };
      if (body.samlSloUrl !== undefined)
        samlFields = { ...samlFields, samlSloUrl: body.samlSloUrl ? httpsUrl(body.samlSloUrl, "https://acme.okta.com/app/…/slo/saml", "identity provider's single logout URL") : null };
      if (body.samlCerts !== undefined) {
        try {
          samlFields = { ...samlFields, samlCerts: normalizeCerts(body.samlCerts) };
        } catch (e) {
          throw badRequest((e as Error).message);
        }
      }
    }
    const [saved] = await db
      .update(ssoConnection)
      .set({
        name: body.name,
        ...(c.type !== "saml" ? { clientId: body.clientId, ...(body.clientSecret ? { clientSecretEnc: box.encrypt(body.clientSecret) } : {}) } : samlFields),
        ...(body.issuer !== undefined || body.tenantId !== undefined
          ? { issuer: issuerFor(c.type, { issuer: body.issuer ?? c.issuer, tenantId: body.tenantId ?? c.tenantId ?? undefined }), tenantId: c.type === "microsoft" ? (body.tenantId ?? c.tenantId) : null }
          : {}),
        domains,
        autoJoin,
        defaultWorkspaceId: body.defaultWorkspaceId,
        enabled: body.enabled,
        updatedAt: new Date(),
      })
      .where(eq(ssoConnection.id, c.id))
      .returning();
    // Turning off the last provider also turns off "require SSO", so nobody is locked out.
    const live = await db.select({ id: ssoConnection.id }).from(ssoConnection).where(eq(ssoConnection.enabled, true));
    if (!live.length) await db.update(organization).set({ ssoRequired: false });
    clearSsoCaches();
    await audit(ctx, {
      actor: u,
      action: "auth.sso_updated",
      targetType: "sso_connection",
      targetId: c.id,
      meta: { ...body, clientSecret: body.clientSecret ? "(changed)" : undefined, samlCerts: body.samlCerts ? "(changed)" : undefined },
    });
    return publicConn(saved!);
  });

  app.delete<{ Params: { id: string } }>("/api/admin/sso/:id", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const [c] = await db.delete(ssoConnection).where(eq(ssoConnection.id, req.params.id)).returning();
    if (!c) throw notFound("Sign-in provider not found");
    const live = await db.select({ id: ssoConnection.id }).from(ssoConnection).where(eq(ssoConnection.enabled, true));
    if (!live.length) await db.update(organization).set({ ssoRequired: false });
    await audit(ctx, { actor: u, action: "auth.sso_removed", targetType: "sso_connection", targetId: c.id, meta: { name: c.name } });
    return { ok: true };
  });

  /** Check the provider's configuration is reachable (the client secret is checked at the first sign-in). */
  app.post<{ Params: { id: string } }>("/api/admin/sso/:id/test", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const [c] = await db.select().from(ssoConnection).where(eq(ssoConnection.id, req.params.id));
    if (!c) throw notFound("Sign-in provider not found");
    clearSsoCaches();
    if (c.type === "saml") {
      const until = certExpiry(c.samlCerts ?? []);
      if (!until || new Date(until) < new Date()) return { ok: false, message: "The identity provider's certificate has expired. Paste its new one." };
      const host = new URL(c.samlSsoUrl!).host;
      try {
        // Any answer will do: without a sign-in request most providers answer with an error page.
        await fetch(c.samlSsoUrl!, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
      } catch {
        return { ok: false, message: `Couldn't reach ${host}. Check the sign-in URL and that this server can reach it.` };
      }
      const date = new Date(until).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
      return { ok: true, issuer: c.issuer, message: `Reached ${host}. The certificate is valid until ${date}.` };
    }
    try {
      const d = await discover(c.issuer);
      return { ok: true, issuer: d.issuer, message: `Reached ${new URL(d.authorization_endpoint).host}.` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Couldn't reach the provider." };
    }
  });

  /** Read an identity provider's SAML metadata (pasted, or from its URL) to fill in the form. */
  app.post("/api/admin/sso/saml-metadata", async (req) => {
    const u = await requireUser(ctx, req);
    requireOrgCap(u, "org.auth.manage");
    const body = parse(z.object({ url: z.string().trim().optional(), xml: z.string().max(500_000).optional() }), req.body);
    try {
      const m = body.xml?.trim() ? parseIdpMetadata(body.xml) : await fetchIdpMetadata(httpsUrl(body.url, "https://login.microsoftonline.com/…/federationmetadata.xml", "metadata URL"));
      return { entityId: m.entityId, ssoUrl: m.ssoUrl, sloUrl: m.sloUrl, certs: m.certs.join("\n"), certExpires: certExpiry(m.certs) };
    } catch (e) {
      if (e instanceof SsoError) throw badRequest(e.message);
      throw e;
    }
  });

  /**
   * For the desktop app (apps/desktop): that this is Aatmiq, and where its windows may go: the app,
   * the IDE's own host, and the identity providers sign-in sends people to.
   */
  app.get("/api/public/desktop", async () => {
    const org = await getOrg(db);
    const conns = await db
      .select({ type: ssoConnection.type, issuer: ssoConnection.issuer, samlSsoUrl: ssoConnection.samlSsoUrl })
      .from(ssoConnection)
      .where(eq(ssoConnection.enabled, true));
    // The issuer, and its authorization endpoint, which may live elsewhere (best effort: cached,
    // and an unreachable provider doesn't hold the answer up).
    const found = await Promise.all(
      conns.map(async (c) => {
        if (c.type === "saml") return c.samlSsoUrl ? [new URL(c.samlSsoUrl).origin] : [];
        const d = await Promise.race([discover(c.issuer).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 4000).unref())]);
        return [c.issuer, d?.authorization_endpoint].flatMap((u) => {
          try {
            return u ? [new URL(u).origin] : [];
          } catch {
            return [];
          }
        });
      }),
    );
    const signIn = new Set(found.flat());
    return {
      product: "aatmiq",
      name: org?.productName ?? PRODUCT_NAME,
      appOrigin: new URL(ctx.cfg.appUrl).origin,
      ideOrigin: ctx.cfg.ideUrl ? new URL(ctx.cfg.ideUrl).origin : null,
      signInOrigins: [...signIn],
    };
  });

  /** For the sign-in page: which buttons to show. */
  app.get("/api/public/sso", async () => {
    const conns = await db
      .select({ id: ssoConnection.id, type: ssoConnection.type, name: ssoConnection.name })
      .from(ssoConnection)
      .where(eq(ssoConnection.enabled, true))
      .orderBy(asc(ssoConnection.createdAt));
    const allowed = [];
    for (const c of conns) if (await license.hasFeature(FEATURE_FOR[c.type])) allowed.push(c);
    return allowed;
  });
}
