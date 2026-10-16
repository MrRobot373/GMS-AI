/** SAML single sign-on: the parts on their own, then end to end against a mock identity provider. */
import { createDb, sql, type DB } from "@aatmiq/db";
import type { Profile } from "@node-saml/node-saml";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeCert, startMockSamlIdp } from "../test/mock-saml-idp.mjs";
import { buildApp } from "./app";
import type { Config } from "./config";
import { identityFromProfile, normalizeCerts, parseIdpMetadata, peekInResponseTo } from "./services/saml";

const profile = (p: Partial<Profile>): Profile => ({ issuer: "idp", nameID: "", nameIDFormat: "", ...p });

describe("SAML: certificates, metadata and attributes", () => {
  const { cert } = makeCert("Unit test");
  const body = cert.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, "");

  it("takes certificates as PEM or Base64, one or several, and refuses anything else", () => {
    expect(normalizeCerts(cert)).toEqual([cert.trim()]);
    expect(normalizeCerts(body)).toEqual([cert.trim()]);
    const other = makeCert("Next year").cert;
    expect(normalizeCerts(`${cert}\n${other}`)).toHaveLength(2);
    expect(() => normalizeCerts("hello")).toThrow("isn't a valid certificate");
    expect(() => normalizeCerts("  ")).toThrow("signing certificate");
  });

  it("reads the identity provider's metadata", async () => {
    const idp = await startMockSamlIdp();
    try {
      const m = parseIdpMetadata(idp.metadata());
      expect(m).toEqual({ entityId: idp.entityId, ssoUrl: idp.ssoUrl, sloUrl: idp.sloUrl, certs: [idp.cert.trim()] });
    } finally {
      await idp.close();
    }
    expect(() => parseIdpMetadata("<html>nope")).toThrow("isn't SAML metadata");
    const postOnly = `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="x"><IDPSSODescriptor><SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://x/sso"/></IDPSSODescriptor></EntityDescriptor>`;
    expect(() => parseIdpMetadata(postOnly)).toThrow("HTTP-Redirect");
  });

  it("finds the email and name the way each provider sends them", () => {
    // Entra ID
    expect(
      identityFromProfile(
        profile({
          nameID: "1f3e-persistent",
          nameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "Asha@Acme.test",
          "http://schemas.microsoft.com/identity/claims/displayname": "Asha Rao",
        }),
      ),
    ).toMatchObject({ subject: "1f3e-persistent", email: "asha@acme.test", name: "Asha Rao" });
    // Okta, with first and last name attributes
    expect(identityFromProfile(profile({ nameID: "ravi@acme.test", nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress", firstName: "Ravi", lastName: "Kumar" }))).toMatchObject({
      subject: "ravi@acme.test",
      email: "ravi@acme.test",
      name: "Ravi Kumar",
    });
    // A transient name ID changes each time: the email is the identity.
    expect(identityFromProfile(profile({ nameID: "_t123", nameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient", email: "mei@acme.test" }))).toMatchObject({
      subject: "mei@acme.test",
      name: "mei",
    });
    expect(() => identityFromProfile(profile({ nameID: "not-an-email" }))).toThrow("didn't send an email");
  });

  it("tells a provider-started answer from one to our request", () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64");
    expect(peekInResponseTo(b64(`<samlp:Response xmlns:samlp="x" ID="_1" InResponseTo="_req9">`))).toBe("_req9");
    expect(peekInResponseTo(b64(`<samlp:Response xmlns:samlp="x" ID="_1">`))).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const APP_URL = "http://localhost:3000";
const d = url ? describe : describe.skip;
type Jar = { cookie: string };
const jar = (): Jar => ({ cookie: "" });

d("SAML single sign-on", () => {
  let app: FastifyInstance;
  let db: DB;
  let close: () => Promise<void>;
  let idp: Awaited<ReturnType<typeof startMockSamlIdp>>;
  const owner = jar();
  let workspaceId = "";
  let connId = "";

  function absorb(j: Jar, set: string | string[] | undefined) {
    if (!set) return;
    const map = new Map(j.cookie.split("; ").filter(Boolean).map((c) => c.split("=") as [string, string]));
    for (const c of Array.isArray(set) ? set : [set]) {
      const [k, ...v] = c.split(";")[0]!.split("=");
      map.set(k!, v.join("="));
    }
    j.cookie = [...map].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async function call(j: Jar | null, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) {
    const res = await app.inject({
      method,
      url: path,
      headers: { origin: APP_URL, ...(j?.cookie ? { cookie: j.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      payload: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (j) absorb(j, res.headers["set-cookie"]);
    let json = null;
    try {
      json = res.json();
    } catch {}
    return { status: res.statusCode, json, headers: res.headers, body: res.body };
  }
  const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
  const errorOf = (location: string) => new URL(location, APP_URL).searchParams.get("sso_error");

  /** Start a sign-in like a browser: the request, the state cookie and what the provider must answer. */
  async function start(email: string, next = "/app") {
    const res = await app.inject({ method: "GET", url: `/api/auth/sso/${connId}/start?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}` });
    const to = new URL(String(res.headers.location));
    expect(to.origin + to.pathname).toBe(idp.ssoUrl);
    expect(to.searchParams.get("login_hint")).toBe(email);
    const request = idp.readRequest(to.searchParams.get("SAMLRequest")!);
    return { request, cookie: String(res.headers["set-cookie"]).split(";")[0]!, relay: to.searchParams.get("RelayState") ?? "" };
  }

  /** The provider posts its answer (from its own site, so without our cookie); our page posts it again with it. */
  async function post(samlResponse: string, cookie: string | null, relay = "") {
    const first = await app.inject({
      method: "POST",
      url: `/api/auth/sso/${connId}/acs`,
      headers: { origin: new URL(idp.ssoUrl).origin, "content-type": "application/x-www-form-urlencoded" },
      payload: form({ SAMLResponse: samlResponse, RelayState: relay }),
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-security-policy"]).toContain("form-action 'self'");
    const action = /action="([^"]+)"/.exec(first.body)![1]!.replace(/&amp;/g, "&");
    const value = /name="SAMLResponse" value="([^"]+)"/.exec(first.body)![1]!;
    expect(value).toBe(samlResponse);
    const again = await app.inject({
      method: "POST",
      url: action,
      headers: { origin: APP_URL, "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) },
      payload: form({ SAMLResponse: value, RelayState: relay }),
    });
    return String(again.headers.location);
  }

  /** The whole sign-in. Returns where the person lands (signed in) or the error they see. */
  async function samlLogin(email: string, opts: { next?: string; tweak?: (r: { inResponseTo: string; acs: string; audience: string }) => string; j?: Jar } = {}) {
    const s = await start(email, opts.next);
    const base = { inResponseTo: s.request.id!, acs: s.request.acs!, audience: s.request.issuer! };
    const response = opts.tweak ? opts.tweak(base) : idp.respond({ email, name: "", ...base });
    const location = await post(response, s.cookie, s.relay);
    if (!location.startsWith("/api/auth/sso/ticket")) return { error: errorOf(location), location };
    const j = opts.j ?? jar();
    const t = await app.inject({ method: "GET", url: location, headers: { origin: APP_URL } });
    absorb(j, t.headers["set-cookie"]);
    return { location: String(t.headers.location), j, error: null };
  }

  beforeAll(async () => {
    idp = await startMockSamlIdp();
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
    await idp?.close();
  });

  it("an admin imports the provider's metadata and adds it; the provider gets ours", async () => {
    expect((await call(owner, "POST", "/api/admin/sso/saml-metadata", { xml: "<nope/>" })).json.error).toContain("isn't SAML metadata");
    const m = (await call(owner, "POST", "/api/admin/sso/saml-metadata", { url: idp.metadataUrl })).json;
    expect(m).toMatchObject({ entityId: idp.entityId, ssoUrl: idp.ssoUrl });
    expect(new Date(m.certExpires).getTime()).toBeGreaterThan(Date.now());

    expect((await call(owner, "POST", "/api/admin/sso", { type: "saml", issuer: m.entityId, samlSsoUrl: m.ssoUrl })).json.error).toContain("certificate");
    expect((await call(owner, "POST", "/api/admin/sso", { type: "saml", issuer: m.entityId, samlSsoUrl: "http://idp.example.com/sso", samlCerts: m.certs })).json.error).toContain("https");
    const r = await call(owner, "POST", "/api/admin/sso", { type: "saml", name: "Okta", issuer: m.entityId, samlSsoUrl: m.ssoUrl, samlCerts: m.certs, domains: ["acme.test"] });
    expect(r.status).toBe(200);
    connId = r.json.id;
    expect(r.json).toMatchObject({
      type: "saml",
      clientId: null,
      sp: { entityId: `${APP_URL}/api/auth/sso/${connId}/metadata`, acsUrl: `${APP_URL}/api/auth/sso/${connId}/acs` },
    });
    expect(r.json.clientSecretEnc).toBeUndefined();
    expect((await call(null, "GET", "/api/public/sso")).json).toEqual([{ id: connId, type: "saml", name: "Okta" }]);
    expect((await call(owner, "POST", `/api/admin/sso/${connId}/test`)).json).toMatchObject({ ok: true });
    expect((await call(null, "GET", "/api/public/desktop")).json.signInOrigins).toEqual([new URL(idp.ssoUrl).origin]);

    const sp = await call(null, "GET", `/api/auth/sso/${connId}/metadata`);
    expect(sp.headers["content-type"]).toContain("samlmetadata+xml");
    expect(sp.body).toContain(`entityID="${APP_URL}/api/auth/sso/${connId}/metadata"`);
    expect(sp.body).toContain(`Location="${APP_URL}/api/auth/sso/${connId}/acs"`);
  });

  it("people without an account or invitation are turned away", async () => {
    expect((await samlLogin("stranger@acme.test")).error).toContain("no account for stranger@acme.test");
  });

  it("an invited person signs in and joins their workspaces", async () => {
    await call(owner, "POST", "/api/admin/invites", { email: "dev@acme.test", workspaces: [{ workspaceId, role: "member" }] });
    const r = await samlLogin("dev@acme.test", { next: "/app/chat", tweak: (b) => idp.respond({ email: "dev@acme.test", name: "Dev Patel", ...b }) });
    expect(r.location).toBe("/app/chat");
    const me = (await call(r.j!, "GET", "/api/me")).json;
    expect(me.user).toMatchObject({ email: "dev@acme.test", name: "Dev Patel", orgRole: "member" });
    expect(me.workspaces[0].id).toBe(workspaceId);
    // Again: the same account.
    await samlLogin("dev@acme.test");
    const { n } = (await db.execute(sql`select count(*)::int as n from "user" where email = 'dev@acme.test'`))[0] as { n: number };
    expect(n).toBe(1);
    const audit = (await call(owner, "GET", "/api/admin/audit")).json.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(["user.sso_created", "auth.sso_login", "auth.sso_added"]));
  });

  it("links an existing password account by email; a response signed over the whole message works too", async () => {
    const r = await samlLogin("owner@acme.test", { tweak: (b) => idp.respond({ email: "owner@acme.test", sign: "response", ...b }) });
    expect(r.error).toBeNull();
    expect((await call(r.j!, "GET", "/api/me")).json.user.orgRole).toBe("owner");
  });

  it("an answer counts only in the browser that asked, and only once", async () => {
    // Without the state cookie.
    const a = await start("dev@acme.test");
    const resA = idp.respond({ email: "dev@acme.test", inResponseTo: a.request.id, acs: a.request.acs!, audience: a.request.issuer! });
    expect(errorOf(await post(resA, null))).toContain("expired");
    // Answering another browser's request.
    const b = await start("dev@acme.test");
    expect(errorOf(await post(resA, b.cookie))).toContain("didn't match this browser");
    // Replayed.
    const c = await start("dev@acme.test");
    const resC = idp.respond({ email: "dev@acme.test", inResponseTo: c.request.id, acs: c.request.acs!, audience: c.request.issuer! });
    expect(await post(resC, c.cookie)).toMatch(/^\/api\/auth\/sso\/ticket/);
    expect(errorOf(await post(resC, c.cookie))).toContain("expired");
  });

  it("refuses forged, unsigned, misaddressed and expired responses", async () => {
    const email = "dev@acme.test";
    const forged = (b: { inResponseTo: string; acs: string; audience: string }) =>
      Buffer.from(Buffer.from(idp.respond({ email, ...b }), "base64").toString().replaceAll("dev@acme.test", "owner@acme.test")).toString("base64");
    expect((await samlLogin(email, { tweak: forged })).error, "forged").toContain("signature couldn't be verified");
    const stranger = makeCert("Somebody else").key;
    expect((await samlLogin(email, { tweak: (b) => idp.respond({ email, signWith: stranger, ...b }) })).error, "other key").toContain("signature couldn't be verified");
    expect((await samlLogin(email, { tweak: (b) => idp.respond({ email, sign: "none", ...b }) })).error, "unsigned").toContain("signature");
    expect((await samlLogin(email, { tweak: (b) => idp.respond({ email, ...b, issuer: "https://evil.test/idp" }) })).error, "wrong issuer").toContain("different identity provider");
    expect((await samlLogin(email, { tweak: (b) => idp.respond({ email, ...b, audience: "https://other-app.test" }) })).error, "wrong audience").toContain("for another app");
    expect((await samlLogin(email, { tweak: (b) => idp.respond({ email, ...b, notOnOrAfterMs: -5 * 60_000 }) })).error, "expired").toContain("expired");
    expect((await samlLogin(email, { tweak: (b) => idp.respond({ email, ...b, status: "urn:oasis:names:tc:SAML:2.0:status:Responder" }) })).error, "refused").toContain("refused the sign-in");
  });

  it("a sign-in started at the provider (its app tile) is started again from Aatmiq", async () => {
    const acs = `${APP_URL}/api/auth/sso/${connId}/acs`;
    const tile = idp.respond({ email: "dev@acme.test", acs, audience: `${APP_URL}/api/auth/sso/${connId}/metadata` });
    expect(await post(tile, null)).toBe(`/api/auth/sso/${connId}/start`);
  });

  it("other email domains are refused; transient name IDs still find the account", async () => {
    await call(owner, "POST", "/api/admin/invites", { email: "eve@evil.test", workspaces: [{ workspaceId, role: "member" }] });
    expect((await samlLogin("eve@evil.test")).error).toContain("can't sign in here");
    const transient = (b: { inResponseTo: string; acs: string; audience: string }) =>
      idp.respond({ email: "dev@acme.test", nameId: `_t${Math.random()}`, nameIdFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient", ...b });
    const one = await samlLogin("dev@acme.test", { tweak: transient });
    const two = await samlLogin("dev@acme.test", { tweak: transient });
    expect((await call(one.j!, "GET", "/api/me")).json.user.id).toBe((await call(two.j!, "GET", "/api/me")).json.user.id);
  });

  it("a certificate rotation: both certificates work while it lasts", async () => {
    const next = makeCert("Next certificate");
    expect((await call(owner, "PATCH", `/api/admin/sso/${connId}`, { samlCerts: `${idp.cert}\n${next.cert}` })).status).toBe(200);
    expect((await samlLogin("dev@acme.test")).error).toBeNull();
    expect((await samlLogin("dev@acme.test", { tweak: (b) => idp.respond({ email: "dev@acme.test", signWith: next.key, ...b }) })).error).toBeNull();
    expect((await call(owner, "PATCH", `/api/admin/sso/${connId}`, { samlCerts: "garbage" })).status).toBe(400);
  });

  it("only the answer route takes forms and posts from other sites", async () => {
    const formPost = await app.inject({ method: "POST", url: "/api/chats", headers: { origin: APP_URL, cookie: owner.cookie, "content-type": "application/x-www-form-urlencoded" }, payload: "workspaceId=x" });
    expect(formPost.statusCode).toBe(415);
    const elsewhere = await app.inject({ method: "POST", url: "/api/admin/sso/saml-metadata", headers: { origin: new URL(idp.ssoUrl).origin, cookie: owner.cookie, "content-type": "application/json" }, payload: "{}" });
    expect(elsewhere.statusCode).toBe(403);
  });

  it("single logout: signing out of Aatmiq signs out at the provider too, with a signed request", async () => {
    // The provider's logout address comes with its metadata; ours, with our signing certificate, with ours.
    const m = (await call(owner, "POST", "/api/admin/sso/saml-metadata", { url: idp.metadataUrl })).json;
    expect(m.sloUrl).toBe(idp.sloUrl);
    const saved = await call(owner, "PATCH", `/api/admin/sso/${connId}`, { samlSloUrl: m.sloUrl });
    expect(saved.json).toMatchObject({ samlSloUrl: idp.sloUrl, sp: { sloUrl: `${APP_URL}/api/auth/sso/${connId}/slo` } });
    const sp = (await call(null, "GET", `/api/auth/sso/${connId}/metadata`)).body;
    expect(sp).toContain(`SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${APP_URL}/api/auth/sso/${connId}/slo"`);
    const certB64 = /<(?:\w+:)?X509Certificate>([^<]+)</.exec(sp)![1]!;
    idp.state.spCert = `-----BEGIN CERTIFICATE-----\n${certB64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
    // The same certificate every time (made once).
    expect((await call(null, "GET", `/api/auth/sso/${connId}/metadata`)).body).toContain(certB64);

    const r = await samlLogin("dev@acme.test");
    const out = await call(r.j!, "POST", "/api/auth/sso/logout", {});
    expect(out.json.redirect).toMatch(new RegExp(`^${idp.sloUrl}\\?SAMLRequest=`));
    expect((await call(r.j!, "GET", "/api/me")).status).toBe(401);
    // The provider gets a request it can check, naming the person and the sign-in.
    const back = await fetch(out.json.redirect, { redirect: "manual" });
    expect(idp.state.lastLogout).toMatchObject({ nameId: "dev@acme.test", signature: "valid", issuer: `${APP_URL}/api/auth/sso/${connId}/metadata` });
    expect(idp.state.lastLogout!.sessionIndex).toBeTruthy();
    // It sends the person back with its answer, which lands on the sign-in page.
    const answer = back.headers.get("location")!;
    expect(answer.startsWith(`${APP_URL}/api/auth/sso/${connId}/slo?SAMLResponse=`)).toBe(true);
    const done = await app.inject({ method: "GET", url: answer.replace(APP_URL, "") });
    expect(done.headers.location).toBe("/login?signed_out=1");
    // Signing out of a password session just signs out.
    const pw = jar();
    await call(pw, "POST", "/api/auth/sign-in/email", { email: "owner@acme.test", password: "correct-horse-battery" });
    expect((await call(pw, "POST", "/api/auth/sso/logout", {})).json).toEqual({ ok: true, redirect: null });
    expect((await call(pw, "GET", "/api/me")).status).toBe(401);
  });

  it("single logout: the provider signs someone out of Aatmiq, with signed requests only", async () => {
    const slo = `${APP_URL}/api/auth/sso/${connId}/slo`;
    const a = await samlLogin("dev@acme.test");
    const b = await samlLogin("dev@acme.test");
    const other = await samlLogin("owner@acme.test");
    const get = (u: string) => app.inject({ method: "GET", url: u.replace(APP_URL, "") });
    // Unsigned, or from another provider: refused, nobody is signed out.
    expect((await get(idp.logoutRequest({ destination: slo, nameId: "dev@acme.test", sign: false }))).statusCode).toBe(400);
    expect((await get(idp.logoutRequest({ destination: slo, nameId: "dev@acme.test", issuer: "https://evil.test/idp" }))).statusCode).toBe(400);
    expect((await call(a.j!, "GET", "/api/me")).status).toBe(200);

    const res = await get(idp.logoutRequest({ destination: slo, nameId: "dev@acme.test" }));
    expect(res.statusCode).toBe(302);
    // Our answer goes back to the provider, signed.
    const answer = new URL(String(res.headers.location));
    expect(answer.origin + answer.pathname).toBe(idp.sloUrl);
    expect(answer.searchParams.get("SAMLResponse")).toBeTruthy();
    expect(answer.searchParams.get("Signature")).toBeTruthy();
    // Both of their sessions end; someone else's doesn't.
    expect((await call(a.j!, "GET", "/api/me")).status).toBe(401);
    expect((await call(b.j!, "GET", "/api/me")).status).toBe(401);
    expect((await call(other.j!, "GET", "/api/me")).status).toBe(200);
    const audit = (await call(owner, "GET", "/api/admin/audit")).json.map((x: { action: string }) => x.action);
    expect(audit).toContain("auth.sso_logout");
  });

  it("turned off, it can't be used", async () => {
    await call(owner, "PATCH", `/api/admin/sso/${connId}`, { enabled: false });
    const res = await app.inject({ method: "GET", url: `/api/auth/sso/${connId}/start` });
    expect(errorOf(String(res.headers.location))).toContain("isn't available");
  });
});
