# Single sign-on

People sign in with their company account (Google Workspace, Microsoft Entra ID, any OpenID Connect provider such as Okta, Keycloak, Auth0, JumpCloud or OneLogin, or any SAML 2.0 identity provider such as ADFS). When someone leaves the company and IT disables their account, they lose access to Aatmiq too.

Admins configure it in **Admin → Authentication**. Only org owners and admins can do this.

## Licensing

| Provider | Needs license feature | Plans |
|---|---|---|
| Google, Microsoft | `sso` | Chat, Work, Complete, Enterprise |
| Other (OpenID Connect or SAML 2.0) | `oidc` (custom single sign-on and directory sync) | Enterprise |
| Directory sync (SCIM, LDAP / Active Directory) | `oidc` | Enterprise |

In development mode (no license public key configured) every provider is available.

## Setting up a provider

Every OpenID provider uses the same redirect URI, shown in the dialog: `https://<your Aatmiq address>/api/auth/sso/callback`. SAML providers each get their own entity ID and reply URL (below).

- **Google Workspace:** Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID*. Choose type **Web application** and add the redirect URI. Paste the client ID and secret. If you allow exactly one email domain, Google's account chooser is also limited to it.
- **Microsoft Entra ID:** Entra admin center → App registrations → *New registration*. Choose **single tenant**, platform **Web**, and add the redirect URI. Then create a client secret under *Certificates & secrets*. Paste the **Directory (tenant) ID**, the **Application (client) ID** and the secret value. Multi-tenant IDs (`common`, `organizations`) are refused, because any Microsoft directory could then vouch for any email address.
- **Other (OIDC):** create a web application with the authorization code flow, allow the redirect URI, and grant the `openid email profile` scopes. Paste the issuer URL (for example `https://acme.okta.com`), the client ID and the secret. Aatmiq reads `/.well-known/openid-configuration` from the issuer. The **Test** button checks that this server can reach it.

- **Other (SAML 2.0):** the dialog shows Aatmiq's **entity ID** (`…/api/auth/sso/<id>/metadata`, also the address of Aatmiq's metadata, which most providers can import) and **reply URL** (ACS, `…/api/auth/sso/<id>/acs`, HTTP-POST). Create a SAML app at the provider with these two, and have it send the email address as the name ID (format *emailAddress*) or as an `email` attribute; a display name (`displayName`, or first and last name) is used when sent. Then **import the provider's metadata** (its URL, or the XML pasted in): that fills in its entity ID, sign-in URL (HTTP-Redirect), single logout URL (when it has one) and signing certificate. The **Test** button checks the sign-in URL answers and the certificate is valid; the provider's row shows until when, in amber in its last month. During a certificate change, paste both certificates. Where to find the metadata: Entra ID → Enterprise applications → the app → Single sign-on → *App Federation Metadata Url*; Okta → the app → Sign On → *Metadata URL*; Google Workspace → Apps → Web and mobile apps → the SAML app → *Download metadata*; ADFS → `https://<adfs>/FederationMetadata/2007-06/FederationMetadata.xml`.

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

`GET /api/auth/sso/:id/metadata` is Aatmiq's SP metadata: the ACS, the single logout URL (HTTP-Redirect and HTTP-POST) and Aatmiq's signing certificate. Sign-in requests aren't signed and responses can't be encrypted (the TLS connection protects them in transit).

### Single logout (SAML)

When the provider has a single logout URL (filled in from its metadata, or pasted in the provider's dialog), signing out works both ways:

- **Signing out of Aatmiq** also signs the person out at the provider: Aatmiq sends a signed LogoutRequest for the session they signed in with, and the provider sends them back to Aatmiq's sign-in page. If the provider can't be reached, they're still signed out of Aatmiq.
- **Signing out at the provider** (or of another app that uses it) signs them out of Aatmiq: the provider sends a LogoutRequest to `…/api/auth/sso/<id>/slo` (the dialog shows it; also in the metadata), and Aatmiq ends every session that came from that sign-in (the name ID and session index), then answers with a signed LogoutResponse.

Logout requests must be signed by the provider's certificate; unsigned ones are refused. Aatmiq signs its own messages with a key it makes on first use (RSA-2048, stored encrypted with `APP_SECRET`). Its certificate is in the metadata, so re-import the metadata at the provider after turning on single logout if it doesn't refresh it on its own. Each session's link to its SAML sign-in (name ID, format, session index) is kept until the session ends.

## Directory sync

Admin → Authentication → **Directory** keeps people and groups in step with the company's directory:
- new people get a Member account (in the workspace you choose, or the first one), which uses a license seat;
- name and email changes follow;
- people who leave, or are disabled, are deactivated and signed out everywhere. Their chats, documents and usage stay with the organization.

Groups arrive with their members; give them models and budgets in Admin → Groups. Their names and members are then managed by the directory and can't be changed by hand, but their models and budgets can.

People from the directory sign in with single sign-on (add a provider above); Aatmiq never sees their directory password. The users list shows a **SCIM** or **LDAP** badge next to them.

The directory never touches the **org owner**. If an admin deactivates someone by hand, the directory doesn't turn them back on; reactivate them in Admin → Users. A person kept by SCIM is left alone by LDAP (and the other way round), so use one or the other.

### SCIM (Okta, Microsoft Entra ID, OneLogin, JumpCloud)

The identity provider sends the changes as they happen (SCIM 2.0, RFC 7643/7644).

1. In Admin → Authentication → Directory → **Provisioning (SCIM)**, choose **Turn on**. Copy the **SCIM base URL** (`https://<your Aatmiq address>/api/scim/v2`) and the **token**. The token is shown only once; **New token** replaces it, and the old one stops working at once.
2. At the provider:
   - **Okta:** the app → *General* → enable SCIM provisioning. Then on *Provisioning*, set the SCIM connector base URL, unique identifier field `userName`, the actions *Push New Users, Push Profile Updates, Push Groups*, and authentication mode *HTTP Header* with the token. Turn on *Create Users, Update User Attributes, Deactivate Users* under *To App*.
   - **Microsoft Entra ID:** the enterprise app → *Provisioning* → mode *Automatic*. Set the tenant URL to the SCIM base URL and the secret token to the token. Then *Test Connection*, keep the default attribute mappings (`userPrincipalName` or `mail` → `userName`), assign users and groups, and start provisioning.
   - **OneLogin, JumpCloud and others:** SCIM 2.0 with a bearer token, `userName` as the email.

What Aatmiq reads:
- **People:** `userName` (the email, or the primary or work address in `emails`), `displayName` (or `name.givenName` and `name.familyName`), `active` and `externalId`.
- **Groups:** `displayName`, `members` and `externalId`.

PATCH, PUT and filters on `userName`, `emails`, `externalId` and `id` work as Okta and Entra send them. A provider's DELETE deactivates the person; it doesn't erase them (use Admin → Users → *Erase* for that). Someone who already has an account with the same email isn't duplicated: the provider finds them by `userName` and takes the account over (Okta and Entra do this on their own). The token is stored hashed.

### LDAP / Active Directory

Aatmiq reads the directory on a schedule (every 15 minutes to 24 hours; the default is an hour) with a **read-only service account**. It never writes to the directory.

1. Make a service account that can read people and groups (in Active Directory, an ordinary domain user is enough).
2. In Admin → Authentication → Directory → **LDAP / Active Directory**, choose **Set up**, then **Fill in for** *Active Directory* or *OpenLDAP* (this fills in the filters and attributes below).
3. Enter:
   - the address: `ldaps://dc.acme.local` (port 636), or `ldap://` with **StartTLS**. Plain `ldap://` is accepted only for `localhost`, so the password never crosses the network unencrypted;
   - the CA certificate (PEM) when the directory's certificate isn't from a public authority, as with most domain controllers;
   - the bind DN and password (stored encrypted with `APP_SECRET`);
   - the people base DN (`OU=Staff,DC=acme,DC=local`);
   - optionally, a groups base DN.
4. **Test** connects and shows how many people and groups it finds, with a few examples. It changes nothing. **Save**, then **Sync now** or wait for the schedule.

| | Active Directory | OpenLDAP |
|---|---|---|
| People filter | `(&(objectCategory=person)(objectClass=user)(mail=*))` | `(&(objectClass=inetOrgPerson)(mail=*))` |
| Email, name, ID | `mail`, `displayName`, `objectGUID` | `mail`, `cn`, `entryUUID` |
| Groups filter, name, members | `(objectClass=group)`, `cn`, `member` | `(objectClass=groupOfNames)`, `cn`, `member` |

The ID attribute must never change for a person, so a renamed or moved person stays the same account. In Active Directory, a disabled account (the `userAccountControl` flag) is deactivated. Someone who drops out of the filter, or out of the base DN, is deactivated too. To leave someone out on purpose, narrow the filter, for example with `(memberOf=CN=Aatmiq users,OU=Groups,DC=acme,DC=local)`.

**A safety check for mass deactivation.** A wrong base DN or filter would look like everyone left. So when a sync would deactivate more than half of the directory's people (and more than 5), it deactivates nobody and says how many it held back. Admin → Health shows this too. If they really left, choose **Deactivate them**. A search that finds nobody at all changes nothing.

Each sync's result (found, created, updated, deactivated, skipped, and any error) shows on the Directory card. Admin → Health shows when the last sync failed, held people back, or is overdue. With several API servers, only one runs each sync. **Turn off** stops syncing; people and groups stay as they are and can be edited by hand again.

Aatmiq reads only the attributes above (email, name, ID, the AD account flag, and group names and members), and stores the email, name and ID. Mention this in your staff notice (see `legal/`).


Provider access tokens are never stored.

Audit events:
- **Sign-in:** `auth.sso_login`, `auth.sso_logout`, `user.sso_created`.
- **Providers:** `auth.sso_added`, `auth.sso_updated`, `auth.sso_removed`, `auth.sso_required_on`, `auth.sso_required_off`.
- **Directory:** `directory.scim_on`, `directory.scim_token_replaced`, `directory.scim_updated`, `directory.scim_off`, `directory.ldap_saved`, `directory.ldap_sync_run`, `directory.ldap_synced`, `directory.ldap_off`.
- **People and groups from a directory:** `user.directory_created`, `user.deactivated` and `user.reactivated` (with the directory named), `group.directory_created`, `group.directory_deleted`.

## Not done yet

- **Signing in with an LDAP password.** People from LDAP sign in with single sign-on. Checking a password against the directory would bring back passwords (and two-step sign-in) for SSO people.
- Signed SAML sign-in requests and encrypted assertions (no customer has asked).

## Tests

`apps/api/src/sso.test.ts` (OpenID) and `apps/api/src/saml.test.ts` (SAML: certificates, metadata, the attributes each provider sends, and sign-in end to end against `apps/api/test/mock-saml-idp.mjs`, which signs real responses: forged, unsigned, wrong issuer or audience, expired, refused, another browser's, replayed, a provider-started sign-in, a certificate change, and single logout both ways, with unsigned logout requests refused).

`apps/api/src/directory.test.ts` covers directory sync:
- **SCIM**, as Okta and Entra send it: creating, filters, PATCH and PUT, deactivating, groups and members, a wrong token, the plan, and the owner left alone.
- **LDAP**, against `apps/api/test/mock-ldap.mjs`, a small LDAP server: Active Directory's disabled flag, leavers and returners, renamed people, groups, the mass-deactivation hold-back, a wrong service-account password, a search that finds nobody, and a failing server. In the browser, `tests/e2e/licensing.mjs` adds both kinds through Admin → Authentication and signs in with them.
