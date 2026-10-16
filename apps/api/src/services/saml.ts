/**
 * SAML 2.0 single sign-on (Okta, Entra ID, Google Workspace, ADFS, Keycloak, JumpCloud…), started
 * from Aatmiq (SP-initiated): the request ID travels in the person's sealed state cookie and the
 * response must answer it, so a response can't be replayed into another browser. node-saml checks
 * the identity provider's signature (over the response or the assertion), the audience (us) and the
 * time window; the issuer (the provider's entity ID) is checked here.
 */
import type { ssoConnection } from "@aatmiq/db";
import { SAML, ValidateInResponseTo, type CacheProvider, type Profile } from "@node-saml/node-saml";
import { DOMParser } from "@xmldom/xmldom";
import { X509Certificate } from "node:crypto";
import { SsoError, type SsoIdentity } from "./sso";

type Connection = typeof ssoConnection.$inferSelect;

/** What the identity provider needs from us: our entity ID and where it posts its answer. */
export const spEntityId = (appUrl: string, connId: string) => `${appUrl}/api/auth/sso/${connId}/metadata`;
export const acsUrl = (appUrl: string, connId: string) => `${appUrl}/api/auth/sso/${connId}/acs`;
/** Single logout: where the provider sends its logout requests and its answers to ours. */
export const sloUrl = (appUrl: string, connId: string) => `${appUrl}/api/auth/sso/${connId}/slo`;

const BEGIN = "-----BEGIN CERTIFICATE-----";
const END = "-----END CERTIFICATE-----";

/** One or more certificates, as PEM blocks or bare base64 (as metadata has them), checked and in PEM. */
export function normalizeCerts(input: string | string[]): string[] {
  const blocks = (Array.isArray(input) ? input : [input]).flatMap((text) =>
    text.includes(BEGIN)
      ? [...text.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)].map((m) => m[1]!)
      : text.split(/\n\s*\n|,/),
  );
  const certs = blocks.map((b) => b.replace(/\s+/g, "")).filter(Boolean);
  if (!certs.length) throw new SsoError("Paste the identity provider's signing certificate.");
  return certs.map((b64) => {
    const pem = `${BEGIN}\n${b64.match(/.{1,64}/g)!.join("\n")}\n${END}`;
    try {
      new X509Certificate(pem);
    } catch {
      throw new SsoError("That isn't a valid certificate. Paste the identity provider's signing certificate (PEM or Base64).");
    }
    return pem;
  });
}

/** Until when sign-in keeps working with these certificates, for the admin page (the latest of several). */
export function certExpiry(certs: string[]): string | null {
  const ends = certs.flatMap((c) => {
    try {
      return [new Date(new X509Certificate(c).validTo)];
    } catch {
      return [];
    }
  });
  return ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))).toISOString() : null;
}

export interface IdpMetadata {
  entityId: string;
  ssoUrl: string;
  /** Its single logout address (HTTP-Redirect), when it offers one. */
  sloUrl: string | null;
  certs: string[];
}

/** The identity provider's metadata XML → its entity ID, sign-in URL (HTTP-Redirect) and signing certificates. */
export function parseIdpMetadata(xml: string): IdpMetadata {
  const errors: string[] = [];
  const keep = (msg: string) => void errors.push(msg);
  const doc = new DOMParser({ errorHandler: { warning: () => {}, error: keep, fatalError: keep } }).parseFromString(xml, "text/xml");
  const all = (parent: { getElementsByTagNameNS(ns: string, name: string): ArrayLike<Element> }, name: string) =>
    Array.from(parent.getElementsByTagNameNS("*", name));
  const entity = all(doc, "EntityDescriptor")[0];
  if (errors.length || !entity) throw new SsoError("That isn't SAML metadata. Paste the identity provider's metadata XML (or its URL).");
  const idp = all(entity, "IDPSSODescriptor")[0];
  if (!idp) throw new SsoError("This metadata has no identity provider part (IDPSSODescriptor).");
  const sso = all(idp, "SingleSignOnService").find((e) => e.getAttribute("Binding") === "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect");
  if (!sso) throw new SsoError("The identity provider doesn't offer the HTTP-Redirect sign-in binding, which Aatmiq uses.");
  const keys = all(idp, "KeyDescriptor").filter((k) => (k.getAttribute("use") ?? "signing") === "signing");
  const certs = keys.flatMap((k) => all(k, "X509Certificate").map((c) => c.textContent ?? ""));
  const slo = all(idp, "SingleLogoutService").find((e) => e.getAttribute("Binding") === "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect");
  return { entityId: entity.getAttribute("entityID") ?? "", ssoUrl: sso.getAttribute("Location") ?? "", sloUrl: slo?.getAttribute("Location") ?? null, certs: normalizeCerts(certs) };
}

/** Fetch metadata from the identity provider's metadata URL. */
export async function fetchIdpMetadata(url: string, fetchImpl: typeof fetch = fetch): Promise<IdpMetadata> {
  let res: Response;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/samlmetadata+xml, application/xml, text/xml" } });
  } catch {
    throw new SsoError(`Couldn't reach ${new URL(url).host}. Check the metadata URL and that this server can reach it.`);
  }
  if (!res.ok) throw new SsoError(`The metadata URL answered ${res.status}.`);
  return parseIdpMetadata(await res.text());
}

/**
 * Holds the one request this browser's sign-in may answer (from its sealed state cookie): its ID and
 * when it was made (node-saml checks the answer comes within requestIdExpirationPeriodMs).
 */
class OneRequest implements CacheProvider {
  constructor(
    public id: string | null = null,
    public at: string | null = null,
  ) {}
  async saveAsync(key: string, value: string) {
    this.id = key;
    this.at = value;
    return { value, createdAt: Date.now() };
  }
  async getAsync(key: string) {
    return key === this.id ? this.at : null;
  }
  async removeAsync(key: string | null) {
    if (key === this.id) this.id = null;
    return key;
  }
}

function client(conn: Connection, appUrl: string, cache: CacheProvider) {
  if (!conn.samlSsoUrl || !conn.samlCerts?.length) throw new SsoError("This sign-in option isn't set up completely.");
  const entityId = spEntityId(appUrl, conn.id);
  return new SAML({
    issuer: entityId,
    audience: entityId,
    callbackUrl: acsUrl(appUrl, conn.id),
    entryPoint: conn.samlSsoUrl,
    idpIssuer: conn.issuer,
    idpCert: conn.samlCerts,
    // Either the whole response or its assertion must carry the provider's signature.
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: false,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: 10 * 60_000,
    cacheProvider: cache,
    acceptedClockSkewMs: 60_000,
    // Any name ID format, and whatever way of signing in the provider requires (MFA, Windows sign-in…).
    identifierFormat: null,
    disableRequestedAuthnContext: true,
  });
}

/** Where to send the person, and the request ID their answer must carry. */
export async function samlStart(conn: Connection, appUrl: string, relayState: string, loginHint?: string) {
  const cache = new OneRequest();
  const url = new URL(await client(conn, appUrl, cache).getAuthorizeUrlAsync(relayState, undefined, {}));
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return { url: url.toString(), requestId: cache.id!, requestAt: cache.at! };
}

/** The request a SAML response says it answers (unverified: only to tell a provider-started sign-in apart). */
export function peekInResponseTo(samlResponse: string): string | null {
  try {
    const xml = Buffer.from(samlResponse, "base64").toString("utf8");
    return /<(?:\w+:)?Response\b[^>]*\sInResponseTo="([^"]+)"/.exec(xml)?.[1] ?? null;
  } catch {
    return null;
  }
}

const first = (v: unknown): string => {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" ? x.trim() : "";
};
const EMAIL_ATTRS = ["email", "mail", "urn:oid:0.9.2342.19200300.100.1.3", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "Email", "emailaddress"];
const NAME_ATTRS = ["http://schemas.microsoft.com/identity/claims/displayname", "displayName", "urn:oid:2.16.840.1.113730.3.1.241", "name", "fullName"];
const GIVEN_ATTRS = ["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname", "givenName", "firstName", "first_name", "urn:oid:2.5.4.42"];
const FAMILY_ATTRS = ["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname", "sn", "surname", "lastName", "last_name", "urn:oid:2.5.4.4"];
const TRANSIENT = "urn:oasis:names:tc:SAML:2.0:nameid-format:transient";
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

/** Who signed in, from the provider's attributes (names differ by provider). */
export function identityFromProfile(profile: Profile): SsoIdentity {
  const pick = (names: string[]) => names.map((n) => first(profile[n])).find(Boolean) ?? "";
  const nameId = profile.nameID?.trim() ?? "";
  const email = (pick(EMAIL_ATTRS) || (isEmail(nameId) ? nameId : "")).toLowerCase();
  if (!isEmail(email)) throw new SsoError("The identity provider didn't send an email address. Send it as the name ID or an “email” attribute.");
  const name = pick(NAME_ATTRS) || [pick(GIVEN_ATTRS), pick(FAMILY_ATTRS)].filter(Boolean).join(" ") || email.split("@")[0]!;
  // A transient name ID changes at every sign-in: the email is the stable identity then.
  const subject = nameId && profile.nameIDFormat !== TRANSIENT ? nameId : email;
  return { subject, email, name, claims: {} };
}

/** Who the provider signed in, as single logout names them. */
export interface SamlSubject {
  nameId: string;
  nameIdFormat: string | null;
  sessionIndex: string | null;
}

/** Check the provider's answer to this browser's request, and say who signed in. */
export async function samlComplete(conn: Connection, appUrl: string, samlResponse: string, request: { id: string; at: string }): Promise<SsoIdentity & { saml: SamlSubject }> {
  let profile: Profile | null;
  try {
    ({ profile } = await client(conn, appUrl, new OneRequest(request.id, request.at)).validatePostResponseAsync({ SAMLResponse: samlResponse }));
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/InResponseTo/.test(msg)) throw new SsoError("The sign-in response didn't match this browser. Please try again.");
    if (/signature/i.test(msg)) throw new SsoError("The identity provider's signature couldn't be verified. Check its certificate in Admin → Authentication.");
    if (/issuer/i.test(msg)) throw new SsoError("The response came from a different identity provider than the one set up. Check its entity ID.");
    if (/audience/i.test(msg)) throw new SsoError("The identity provider sent the response for another app. Check the entity ID (audience) set there.");
    // An expired subject confirmation is reported as "no valid subject confirmation".
    if (/expired|not yet valid|too old|subject confirmation/i.test(msg)) throw new SsoError("The sign-in response has expired. Check the server's clock, then try again.");
    if (/Responder|Requester|AuthnFailed|status/i.test(msg)) throw new SsoError(`The identity provider refused the sign-in (${msg}).`);
    throw new SsoError(`The sign-in response couldn't be read (${msg}).`);
  }
  if (!profile) throw new SsoError("The identity provider didn't say who signed in.");
  // node-saml checks the issuer of logout messages only: the signed assertion's is checked here.
  if (profile.issuer !== conn.issuer) throw new SsoError("The response came from a different identity provider than the one set up. Check its entity ID.");
  return {
    ...identityFromProfile(profile),
    saml: { nameId: profile.nameID, nameIdFormat: profile.nameIDFormat || null, sessionIndex: profile.sessionIndex ?? null },
  };
}

/**
 * Our metadata, for the identity provider (most can import it from the URL): where it answers, our
 * single logout address (both bindings) and the certificate our logout messages are signed with.
 * Sign-in requests stay unsigned, and the metadata says so.
 */
export function spMetadata(conn: Connection, appUrl: string, signing?: { key: string; cert: string }) {
  const entityId = spEntityId(appUrl, conn.id);
  const slo = sloUrl(appUrl, conn.id);
  const xml = new SAML({
    issuer: entityId,
    callbackUrl: acsUrl(appUrl, conn.id),
    logoutCallbackUrl: slo,
    idpCert: "unused",
    identifierFormat: null,
    wantAssertionsSigned: false,
    ...(signing ? { privateKey: signing.key, publicCert: signing.cert } : {}),
  }).generateServiceProviderMetadata(null, signing?.cert ?? null);
  return xml
    .replace(/AuthnRequestsSigned="true"/, 'AuthnRequestsSigned="false"')
    .replace(/(\s*)<SingleLogoutService /, `$1<SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${slo}"/>$1<SingleLogoutService `);
}

/* ───────────── Single logout ───────────── */

/**
 * The client for logout messages: signed with our key (providers check it), and without the
 * request-ID check (a provider's logout request answers nothing of ours). Sign-in requests stay
 * unsigned, as before, so providers set up earlier keep working.
 */
function logoutClient(conn: Connection, appUrl: string, signing: { key: string; cert: string }) {
  if (!conn.samlCerts?.length) throw new SsoError("This sign-in option isn't set up completely.");
  const entityId = spEntityId(appUrl, conn.id);
  return new SAML({
    issuer: entityId,
    audience: entityId,
    callbackUrl: acsUrl(appUrl, conn.id),
    entryPoint: conn.samlSloUrl ?? conn.samlSsoUrl ?? undefined,
    logoutUrl: conn.samlSloUrl ?? undefined,
    logoutCallbackUrl: sloUrl(appUrl, conn.id),
    idpIssuer: conn.issuer,
    idpCert: conn.samlCerts,
    privateKey: signing.key,
    publicCert: signing.cert,
    signatureAlgorithm: "sha256",
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: false,
    validateInResponseTo: ValidateInResponseTo.never,
    acceptedClockSkewMs: 60_000,
    identifierFormat: null,
  });
}

/** Where to send someone who signs out of Aatmiq, so the provider signs them out too. */
export async function samlLogoutUrl(conn: Connection, appUrl: string, signing: { key: string; cert: string }, subject: SamlSubject, relayState = "") {
  if (!conn.samlSloUrl) return null;
  const profile: Profile = { issuer: conn.issuer, nameID: subject.nameId, nameIDFormat: subject.nameIdFormat ?? "", ...(subject.sessionIndex ? { sessionIndex: subject.sessionIndex } : {}) };
  return logoutClient(conn, appUrl, signing).getLogoutUrlAsync(profile, relayState, {});
}

/**
 * A logout message from the provider: its request to sign someone out (it signed them out
 * elsewhere), or its answer to ours. Signatures are checked with its certificate.
 */
export async function samlLogoutMessage(
  conn: Connection,
  appUrl: string,
  signing: { key: string; cert: string },
  message: { query: Record<string, unknown>; originalQuery: string } | { body: Record<string, string> },
): Promise<{ request: Profile | null; response: boolean }> {
  const saml = logoutClient(conn, appUrl, signing);
  try {
    if ("query" in message) {
      const isRequest = typeof message.query.SAMLRequest === "string";
      // node-saml accepts an unsigned redirect: anyone could then sign people out.
      if (isRequest && typeof message.query.Signature !== "string") throw new SsoError("The identity provider's logout request isn't signed.");
      const { profile } = await saml.validateRedirectAsync(message.query as never, message.originalQuery);
      return isRequest ? { request: profile, response: false } : { request: null, response: true };
    }
    if (message.body.SAMLRequest) return { request: (await saml.validatePostRequestAsync(message.body)).profile, response: false };
    const { loggedOut } = await saml.validatePostResponseAsync(message.body);
    return { request: null, response: loggedOut };
  } catch (e) {
    if (e instanceof SsoError) throw e;
    const m = (e as Error).message ?? "";
    if (/signature/i.test(m)) throw new SsoError("The identity provider's signature couldn't be verified. Check its certificate in Admin → Authentication.");
    throw new SsoError(`The logout message couldn't be read (${m}).`);
  }
}

/** Our answer to the provider's logout request. */
export async function samlLogoutResponseUrl(conn: Connection, appUrl: string, signing: { key: string; cert: string }, request: Profile, relayState = "") {
  return logoutClient(conn, appUrl, signing).getLogoutResponseUrlAsync(request, relayState, {}, true);
}
