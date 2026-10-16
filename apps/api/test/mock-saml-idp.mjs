/**
 * A tiny SAML 2.0 identity provider for tests (API and browser). It signs responses with a fresh
 * key and certificate (made with openssl at start), serves its metadata, and answers sign-in
 * requests (HTTP-Redirect) with a form that posts the response to the app (HTTP-POST). Never use it
 * outside tests.
 *
 *   node apps/api/test/mock-saml-idp.mjs 11700 [host]
 *
 * In the browser it shows a sign-in form (any email); `login_hint` signs that address in directly,
 * and so does its session cookie after a first sign-in. GET /start?acs=…&audience=…&email=… signs in
 * without a request, as an app tile does. GET /slo takes a logout request (single logout): it checks
 * the app's signature when it knows the app's certificate (`spCert`), forgets its session, and
 * answers with a signed logout response.
 */
import { execFileSync } from "node:child_process";
import { createVerify, randomBytes, sign as cryptoSign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { SignedXml } from "xml-crypto";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const id = () => `_${randomBytes(16).toString("hex")}`;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/** A key and a self-signed certificate (PEM). */
export function makeCert(cn = "Mock SAML IdP") {
  const dir = mkdtempSync(join(tmpdir(), "mock-saml-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "30", "-subj", `/CN=${cn}`, "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem")], { stdio: "ignore" });
    return { key: readFileSync(join(dir, "k.pem"), "utf8"), cert: readFileSync(join(dir, "c.pem"), "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const certBody = (pem) => pem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, "");

export async function startMockSamlIdp({ port = 0, host = "localhost" } = {}) {
  const { key, cert } = makeCert();
  let entityId = "";
  let ssoUrl = "";
  let sloUrl = "";
  /** Aatmiq's single logout address, from its entity ID (…/sso/<id>/metadata → …/sso/<id>/slo). */
  const spSlo = (spEntityId) => String(spEntityId).replace(/\/metadata$/, "/slo");
  const state = { logins: 0, lastRequest: null, lastLogout: null, spCert: null };
  const SIG_ALG = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";

  /** A message for the HTTP-Redirect binding, signed as the binding signs (over the query string). */
  function redirectUrl(destination, param, xml, { relayState = "", sign = true } = {}) {
    let q = `${param}=${encodeURIComponent(deflateRawSync(Buffer.from(xml)).toString("base64"))}`;
    if (relayState) q += `&RelayState=${encodeURIComponent(relayState)}`;
    if (sign) {
      q += `&SigAlg=${encodeURIComponent(SIG_ALG)}`;
      q += `&Signature=${encodeURIComponent(cryptoSign("RSA-SHA256", Buffer.from(q), key).toString("base64"))}`;
    }
    return `${destination}${destination.includes("?") ? "&" : "?"}${q}`;
  }

  /** The provider asking the app to sign someone out (they signed out elsewhere). */
  function logoutRequest({ destination, nameId, sessionIndex = null, nameIdFormat = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress", sign = true, issuer = entityId }) {
    const xml =
      `<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id()}" Version="2.0" IssueInstant="${iso(0)}" Destination="${esc(destination)}">` +
      `<saml:Issuer>${esc(issuer)}</saml:Issuer><saml:NameID Format="${esc(nameIdFormat)}">${esc(nameId)}</saml:NameID>` +
      (sessionIndex ? `<samlp:SessionIndex>${esc(sessionIndex)}</samlp:SessionIndex>` : "") +
      `</samlp:LogoutRequest>`;
    return redirectUrl(destination, "SAMLRequest", xml, { sign });
  }

  /** The provider's answer to the app's logout request. */
  function logoutResponse({ destination, inResponseTo, relayState = "" }) {
    const xml =
      `<samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id()}" Version="2.0" IssueInstant="${iso(0)}" Destination="${esc(destination)}" InResponseTo="${esc(inResponseTo)}">` +
      `<saml:Issuer>${esc(entityId)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status></samlp:LogoutResponse>`;
    return redirectUrl(destination, "SAMLResponse", xml, { relayState });
  }

  /** The app's logout request: who it names, and whether its signature checks out with `spCert`. */
  function readLogout(url) {
    const xml = inflateRawSync(Buffer.from(url.searchParams.get("SAMLRequest"), "base64")).toString("utf8");
    const raw = url.search.slice(1);
    const part = (k) => raw.split("&").find((t) => t.startsWith(`${k}=`));
    let signed = null;
    if (state.spCert && url.searchParams.get("Signature")) {
      const signedPart = [part("SAMLRequest"), part("RelayState"), part("SigAlg")].filter(Boolean).join("&");
      signed = createVerify("RSA-SHA256").update(signedPart).verify(state.spCert, url.searchParams.get("Signature"), "base64");
    }
    return {
      id: /\sID="([^"]+)"/.exec(xml)?.[1] ?? null,
      issuer: /<(?:\w+:)?Issuer[^>]*>([^<]+)</.exec(xml)?.[1] ?? null,
      nameId: /<(?:\w+:)?NameID[^>]*>([^<]+)</.exec(xml)?.[1] ?? null,
      sessionIndex: /<(?:\w+:)?SessionIndex[^>]*>([^<]+)</.exec(xml)?.[1] ?? null,
      signature: url.searchParams.get("Signature") ? (signed === null ? "unchecked" : signed ? "valid" : "invalid") : "none",
      relayState: url.searchParams.get("RelayState"),
      xml,
    };
  }

  /**
   * A signed response. `sign`: "assertion" (default), "response" or "none"; the other options make
   * the broken responses the tests need.
   */
  function respond({ email, name = "", inResponseTo = null, acs, audience, issuer = entityId, sign = "assertion", nameIdFormat = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress", nameId = email, attrs = {}, notOnOrAfterMs = 5 * 60_000, signWith = key, status = "urn:oasis:names:tc:SAML:2.0:status:Success" }) {
    const irt = inResponseTo ? ` InResponseTo="${esc(inResponseTo)}"` : "";
    const attributes = { ...(name ? { "http://schemas.microsoft.com/identity/claims/displayname": name } : {}), ...(email ? { "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": email } : {}), ...attrs };
    const attrXml = Object.entries(attributes)
      .map(([k, v]) => `<saml:Attribute Name="${esc(k)}"><saml:AttributeValue>${esc(v)}</saml:AttributeValue></saml:Attribute>`)
      .join("");
    const success = status === "urn:oasis:names:tc:SAML:2.0:status:Success";
    const assertion = success
      ? `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id()}" Version="2.0" IssueInstant="${iso(0)}">` +
        `<saml:Issuer>${esc(issuer)}</saml:Issuer>` +
        `<saml:Subject><saml:NameID Format="${esc(nameIdFormat)}">${esc(nameId)}</saml:NameID>` +
        `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${iso(notOnOrAfterMs)}" Recipient="${esc(acs)}"${irt}/></saml:SubjectConfirmation></saml:Subject>` +
        `<saml:Conditions NotBefore="${iso(-60_000)}" NotOnOrAfter="${iso(notOnOrAfterMs)}"><saml:AudienceRestriction><saml:Audience>${esc(audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
        `<saml:AuthnStatement AuthnInstant="${iso(0)}" SessionIndex="${id()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>` +
        `<saml:AttributeStatement>${attrXml}</saml:AttributeStatement>` +
        `</saml:Assertion>`
      : "";
    let xml =
      `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id()}" Version="2.0" IssueInstant="${iso(0)}" Destination="${esc(acs)}"${irt}>` +
      `<saml:Issuer>${esc(issuer)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="${esc(status)}"/></samlp:Status>${assertion}</samlp:Response>`;
    if (sign !== "none" && (success || sign === "response")) {
      const target = sign === "response" ? "Response" : "Assertion";
      const sig = new SignedXml({
        privateKey: signWith,
        publicCert: cert,
        signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
        canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
      });
      sig.addReference({
        xpath: `//*[local-name(.)='${target}']`,
        digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
        transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"],
      });
      sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${target}']/*[local-name(.)='Issuer']`, action: "after" } });
      xml = sig.getSignedXml();
    }
    return Buffer.from(xml).toString("base64");
  }

  /** The request in a sign-in URL: its ID, where to answer and who asks. */
  function readRequest(samlRequest) {
    const xml = inflateRawSync(Buffer.from(samlRequest, "base64")).toString("utf8");
    return {
      id: /\sID="([^"]+)"/.exec(xml)?.[1] ?? null,
      acs: /AssertionConsumerServiceURL="([^"]+)"/.exec(xml)?.[1] ?? null,
      issuer: /<(?:\w+:)?Issuer[^>]*>([^<]+)</.exec(xml)?.[1] ?? null,
      xml,
    };
  }

  const metadata = () =>
    `<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${esc(entityId)}">` +
    `<md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">` +
    `<md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>${certBody(cert)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>` +
    `<md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>` +
    `<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${esc(ssoUrl)}"/>` +
    `<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${esc(ssoUrl)}"/>` +
    `<md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${esc(sloUrl)}"/>` +
    `</md:IDPSSODescriptor></md:EntityDescriptor>`;

  const html = (body) => `<!doctype html><meta charset="utf-8"><title>Mock SAML IdP</title><body style="font-family:sans-serif;max-width:360px;margin:60px auto">${body}</body>`;
  const postBack = (acs, samlResponse, relayState) =>
    html(
      `<form method="post" action="${esc(acs)}"><input type="hidden" name="SAMLResponse" value="${esc(samlResponse)}">` +
        (relayState ? `<input type="hidden" name="RelayState" value="${esc(relayState)}">` : "") +
        `<p>Signing you in…</p><button>Continue</button></form><script>document.forms[0].submit()</script>`,
    );

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, entityId);
    const session = /(?:^|;\s*)mock_saml_user=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    const send = (code, type, body, signedIn) => {
      res.writeHead(code, { "content-type": type, ...(signedIn ? { "set-cookie": `mock_saml_user=${encodeURIComponent(signedIn)}; Path=/; HttpOnly` } : {}) });
      res.end(body);
    };
    if (url.pathname === "/metadata") return send(200, "application/samlmetadata+xml", metadata());
    if (url.pathname === "/sso") {
      if (!url.searchParams.get("SAMLRequest")) return send(400, "text/plain", "No SAMLRequest");
      const r = readRequest(url.searchParams.get("SAMLRequest"));
      state.lastRequest = r;
      const relay = url.searchParams.get("RelayState");
      const email = url.searchParams.get("login_hint") || url.searchParams.get("email") || (session && decodeURIComponent(session));
      if (!email) {
        const keep = ["SAMLRequest", "RelayState"].map((k) => (url.searchParams.get(k) ? `<input type="hidden" name="${k}" value="${esc(url.searchParams.get(k))}">` : "")).join("");
        return send(200, "text/html", html(`<h2>Mock SAML IdP</h2><form method="get" action="/sso">${keep}<label>Email<br><input name="email" type="email" required style="width:100%"></label><br><br><button>Sign in</button></form>`));
      }
      state.logins++;
      const name = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return send(200, "text/html", postBack(r.acs, respond({ email, name, inResponseTo: r.id, acs: r.acs, audience: r.issuer }), relay), email);
    }
    if (url.pathname === "/slo") {
      if (!url.searchParams.get("SAMLRequest")) return send(400, "text/plain", "No SAMLRequest");
      const r = readLogout(url);
      state.lastLogout = r;
      // Signed out here too; back to the app with the answer.
      res.writeHead(302, { location: logoutResponse({ destination: spSlo(r.issuer), inResponseTo: r.id, relayState: r.relayState ?? "" }), "set-cookie": "mock_saml_user=; Path=/; Max-Age=0" });
      return res.end();
    }
    if (url.pathname === "/start") {
      const acs = url.searchParams.get("acs");
      const email = url.searchParams.get("email");
      return send(200, "text/html", postBack(acs, respond({ email, acs, audience: url.searchParams.get("audience") })), email);
    }
    send(404, "text/plain", "not found");
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const base = `http://${host}:${server.address().port}`;
  entityId = `${base}/metadata`;
  ssoUrl = `${base}/sso`;
  sloUrl = `${base}/slo`;
  return {
    get entityId() {
      return entityId;
    },
    ssoUrl,
    sloUrl,
    metadataUrl: entityId,
    logoutRequest,
    logoutResponse,
    cert,
    key,
    state,
    respond,
    readRequest,
    metadata,
    close: () => new Promise((r) => server.close(r)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const idp = await startMockSamlIdp({ port: Number(process.argv[2] ?? 11700), host: process.argv[3] ?? "localhost" });
  console.log(`mock SAML IdP at ${idp.entityId}`);
}
