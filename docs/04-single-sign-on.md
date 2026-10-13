# Single sign-on

People sign in with their company account (Google Workspace, Microsoft Entra ID, any OpenID Connect provider such as Okta, Keycloak, Auth0, JumpCloud or OneLogin, or any SAML 2.0 identity provider such as ADFS). When someone leaves the company and IT disables their account, they lose access to Aatmiq too.

Admins configure it in **Admin → Authentication**. Only org owners and admins can do this.

## Licensing

| Provider | Needs license feature | Plans |
|---|---|---|
| Google, Microsoft | `sso` | Chat, Work, Complete, Enterprise |
| Other (OpenID Connect or SAML 2.0) | `oidc` (custom single sign-on) | Enterprise |

In development mode (no license public key configured) every provider is available.

## Setting up a provider

Every OpenID provider uses the same redirect URI, shown in the dialog: `https://<your Aatmiq address>/api/auth/sso/callback`. SAML providers each get their own entity ID and reply URL (below).

- **Google Workspace:** Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID*. Choose type **Web application** and add the redirect URI. Paste the client ID and secret. If you allow exactly one email domain, Google's account chooser is also limited to it.
- **Microsoft Entra ID:** Entra admin center → App registrations → *New registration*. Choose **single tenant**, platform **Web**, and add the redirect URI. Then create a client secret under *Certificates & secrets*. Paste the **Directory (tenant) ID**, the **Application (client) ID** and the secret value. Multi-tenant IDs (`common`, `organizations`) are refused, because any Microsoft directory could then vouch for any email address.
- **Other (OIDC):** create a web application with the authorization code flow, allow the redirect URI, and grant the `openid email profile` scopes. Paste the issuer URL (for example `https://acme.okta.com`), the client ID and the secret. Aatmiq reads `/.well-known/openid-configuration` from the issuer. The **Test** button checks that this server can reach it.

- **Other (SAML 2.0):** the dialog shows Aatmiq's **entity ID** (`…/api/auth/sso/<id>/metadata`, also the address of Aatmiq's metadata, which most providers can import) and **reply URL** (ACS, `…/api/auth/sso/<id>/acs`, HTTP-POST). Create a SAML app at the provider with these two, and have it send the email address as the name ID (format *emailAddress*) or as an `email` attribute; a display name (`displayName`, or first and last name) is used when sent. Then **import the provider's metadata** (its URL, or the XML pasted in): that fills in its entity ID, sign-in URL (HTTP-Redirect) and signing certificate. The **Test** button checks the sign-in URL answers and the certificate is valid; the provider's row shows until when, in amber in its last month. During a certificate change, paste both certificates. Where to find the metadata: Entra ID → Enterprise applications → the app → Single sign-on → *App Federation Metadata Url*; Okta → the app → Sign On → *Metadata URL*; Google Workspace → Apps → Web and mobile apps → the SAML app → *Download metadata*; ADFS → `https://<adfs>/FederationMetadata/2007-06/FederationMetadata.xml`.

Client secrets are encrypted at rest with `APP_SECRET`. SAML needs no secret: responses are checked with the provider's public certificate.

## Who can sign in

1. **Someone who signed in with this provider before** is matched by the provider's stable subject ID (SAML: the name ID, or the email when the name ID is *transient*).
2. **Someone with an existing Aatmiq account** (for example a password account) is matched by email, and the provider is linked to that account.
3. **Someone with a pending invitation** for that email has the invitation accepted: their role and workspaces come from the invitation. Invite links show the SSO buttons too.
4. **Auto-join** (optional, per provider, only together with an allowed-domains list): anyone with an allowed domain gets a Member account in the chosen workspace on first sign-in. This uses a license seat.
5. Everyone else is turned away: *"There's no account for … Ask your admin for an invitation."*

**Allowed email domains** restrict a provider to addresses like `@acme.com`.

The following are always refused:
- deactivated accounts
- addresses whose `email_verified` claim is `false` (Google must say `true`)
- forged or expired sign-in state
- SAML responses that aren't signed by the provider's certificate (the whole response or its assertion), come from another entity ID, are for another audience, have expired (60 s of clock tolerance), answer another browser's request, or are used twice

## Require single sign-on

When this is on, password sign-in (and accepting an invitation with a password) stops working for everyone **except the org owner**. That keeps a way in if the identity provider is down.

The sign-in page then shows only the SSO buttons, plus a small "Organization owner? Sign in with a password" link. Disabling or removing the last provider turns the requirement off automatically, so nobody is locked out.

## How it works

The flow is the authorization code flow with PKCE, a state value and a nonce.

1. `GET /api/auth/sso/:id/start` stores the state, nonce, PKCE verifier and return path in an encrypted, HttpOnly cookie that lasts 10 minutes. It then redirects to the provider.
2. `GET /api/auth/sso/callback` checks the cookie and the state. It exchanges the code using `client_secret_basic` (or `client_secret_post` if that's the only method offered). It then verifies the ID token signature against the provider's JWKS and checks the issuer, audience, nonce and expiry, with 60 s of clock tolerance.
3. It then applies the rules above and creates a one-time **login ticket**. The ticket lasts 2 minutes, is stored hashed, and can be used only once.
4. `GET /api/auth/sso/ticket` is a small Better Auth plugin endpoint. It exchanges the ticket for a normal session cookie. All session rules (for example "deactivated users can't start a session") apply to SSO exactly as they do to passwords.

**SAML** (SP-initiated, HTTP-Redirect to the provider, HTTP-POST back):

1. `GET /api/auth/sso/:id/start` makes the AuthnRequest, records its ID (single use, 10 minutes) and puts it in the same encrypted cookie, then redirects to the provider's sign-in URL (with `login_hint` when the email is known).
2. The provider posts the response to `POST /api/auth/sso/:id/acs`, from its own site. The browser leaves out the `SameSite=Lax` cookie on that cross-site post, so the first time the ACS answers with a small page on Aatmiq's own site that posts the same form again (strict CSP with a nonce), now with the cookie. Forms are accepted on this route only, and it's the one route exempt from the same-origin check for changes (the signed response is what's trusted there).
3. The response must answer the request in this browser's cookie, and that request is used up. [node-saml](https://github.com/node-saml/node-saml) checks the signature, audience and time window; Aatmiq checks the issuer (node-saml does that for logout messages only). Then the same rules and login ticket as for OpenID.
4. A sign-in started at the provider (its app tile in Okta or *My Apps*) has no request to answer: Aatmiq starts one and sends the person to the provider, which, already signed in, answers right away.

`GET /api/auth/sso/:id/metadata` is Aatmiq's SP metadata. Requests aren't signed and responses can't be encrypted (the TLS connection protects them in transit); single logout isn't offered.

Provider access tokens are never stored. Audit events: `auth.sso_login`, `user.sso_created`, `auth.sso_added`, `auth.sso_updated`, `auth.sso_removed`, `auth.sso_required_on`, `auth.sso_required_off`.

## Not done yet

- **SCIM provisioning** and **LDAP** (P4).
- SAML single logout, signed requests and encrypted assertions (no customer has asked).

## Tests

`apps/api/src/sso.test.ts` (OpenID) and `apps/api/src/saml.test.ts` (SAML: certificates, metadata, the attributes each provider sends, and sign-in end to end against `apps/api/test/mock-saml-idp.mjs`, which signs real responses: forged, unsigned, wrong issuer or audience, expired, refused, another browser's, replayed, a provider-started sign-in, a certificate change). In the browser, `tests/e2e/licensing.mjs` adds both kinds through Admin → Authentication and signs in with them.
