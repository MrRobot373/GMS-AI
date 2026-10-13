/**
 * Licensing + single sign-on, across the three apps (started by run-licensing.sh):
 *   Super Admin console :3100 → issues a key → a licensed Aatmiq :3200 sets up with it, checks in,
 *   enforces seats, follows term changes and revocation; then SSO through a mock OpenID provider :11600
 *   and a mock SAML identity provider :11700.
 */
import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";

const CONSOLE = "http://localhost:3100";
const APP = "http://localhost:3200";
const IDP = "http://127.0.0.1:11600";
const SAML_IDP = "http://127.0.0.1:11700";
const OUT = new URL("./results-licensing/shots/", import.meta.url).pathname;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const results = [];
const consoleErrors = [];
let n = 0;

async function newUser(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of (40\d|402)/.test(m.text())) consoleErrors.push(`[${tag}] ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${tag}] pageerror: ${e.message}`));
  page.setDefaultTimeout(10000);
  return { ctx, page };
}
async function step(area, name, page, fn) {
  n++;
  const id = String(n).padStart(2, "0");
  try {
    await fn();
    results.push({ id, area, name, ok: true });
  } catch (e) {
    results.push({ id, area, name, ok: false, err: e.message.split("\n")[0].slice(0, 220) });
    await page?.screenshot({ path: `${OUT}FAIL-${id}.png` }).catch(() => {});
  }
}
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Wait until the page is at a URL, through chains of pages that post themselves on (SAML): those
 * interrupt one navigation with the next, which waitForURL reports as an error.
 */
async function landOn(page, re, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!re.test(page.url())) {
    if (Date.now() > end) throw new Error(`still at ${page.url()}: ${(await page.content().catch(() => "")).replace(/\s+/g, " ").slice(0, 400)}`);
    await page.waitForTimeout(200);
  }
  await page.waitForLoadState().catch(() => {});
}
const toast = (page, text) => page.locator("[data-sonner-toast]", { hasText: text }).first().waitFor({ timeout: 10000 });
/** Call the product API as the signed-in page (same cookies). */
const apiAs = async (page, method, path, data) => {
  const r = await page.request.fetch(`${APP}${path}`, { method, data, headers: { origin: APP } });
  return { status: r.status(), json: await r.json().catch(() => null) };
};

/* ═════════════ Super Admin console ═════════════ */
const { page: sa } = await newUser("console");
let key = "";
await step("Console", "Wrong password is refused; Super Admin signs in", sa, async () => {
  await sa.goto(`${CONSOLE}/`);
  await sa.waitForURL("**/login");
  await sa.fill('input[type="email"]', "root@aatmiq.test");
  await sa.fill('input[type="password"]', "not-the-password");
  await sa.click("button:has-text('Sign in')");
  await sa.getByText("Wrong email or password").waitFor();
  await sa.fill('input[type="password"]', "super-secret-password");
  await sa.click("button:has-text('Sign in')");
  await sa.locator("h1", { hasText: "Overview" }).waitFor();
});
await step("Console", "Create a customer", sa, async () => {
  await sa.click("nav >> text=Customers");
  await sa.click("button:has-text('New customer')");
  await sa.fill('[role="dialog"] input >> nth=0', "Globex Corp");
  await sa.fill('[role="dialog"] input[type="email"]', "it@globex.test");
  await sa.click('[role="dialog"] >> button:has-text("Create")');
  await sa.getByTestId("customer-name").filter({ hasText: "Globex Corp" }).waitFor();
});
await step("Console", "Issue a Work license for 3 seats and copy the key", sa, async () => {
  await sa.click("button:has-text('Issue license')");
  await sa.getByTestId("license-tier").selectOption("work");
  await sa.getByTestId("license-seats-input").fill("3");
  await sa.fill('[role="dialog"] input[placeholder="#22D3EE"]', "#A78BFA");
  await sa.click('[role="dialog"] >> button:has-text("Issue license")');
  await toast(sa, "License issued");
  await sa.getByTestId("license-card").getByText("Work plan").waitFor();
  await sa.getByTestId("copy-key").click();
  key = await sa.evaluate(() => navigator.clipboard.readText());
  expect(key.split(".").length === 3, "key is not a JWT");
  await sa.screenshot({ path: `${OUT}console-customer.png` });
});
await step("Console", "Settings show the public key to configure deployments", sa, async () => {
  await sa.click("nav >> text=Settings");
  const v = await sa.getByTestId("public-key").inputValue();
  expect(v.startsWith("LICENSE_PUBLIC_KEY=MCowBQYDK2Vw"), `unexpected ${v.slice(0, 40)}`);
});

/* ═════════════ Licensed product: setup ═════════════ */
const { page: owner } = await newUser("owner");
await step("Setup", "Setup needs a genuine key and previews it", owner, async () => {
  await owner.goto(`${APP}/setup`);
  await owner.fill('input[placeholder="Acme Labs"]', "Globex Corp");
  await owner.getByTestId("setup-license").fill("not-a-key-at-all-but-long-enough");
  await owner.click("text=Continue");
  await owner.getByText("doesn't look like a valid license key").waitFor();
  await owner.getByTestId("setup-license").fill(key);
  await owner.getByTestId("setup-license").press("Tab");
  // Leaving the field validates and previews the key; the accent comes from the license.
  await owner.getByTestId("license-preview").filter({ hasText: "Globex Corp · Work plan" }).waitFor();
  const accent = await owner.evaluate(() => document.documentElement.style.getPropertyValue("--accent"));
  expect(accent.toLowerCase() === "#a78bfa", `accent ${accent}`);
  await owner.click("text=Continue");
  await owner.fill('input[placeholder="Asha Rao"]', "Gina Owner");
  await owner.fill('input[type="email"]', "gina@globex.test");
  await owner.fill('input[type="password"]', "correct-horse-battery");
  await owner.click("text=Create workspace");
  await owner.waitForURL("**/app/chat");
});
await step("License", "Admin → License shows the plan, seats and a check-in", owner, async () => {
  await owner.goto(`${APP}/admin/license`);
  await owner.getByTestId("license-tier").filter({ hasText: "Work plan" }).waitFor();
  await owner.getByTestId("license-seats").filter({ hasText: "1 / 3" }).waitFor();
  await owner.getByText("Licensed to Globex Corp").waitFor();
  for (let i = 0; i < 10 && (await owner.getByTestId("last-check-in").innerText()) === "Never"; i++) {
    await wait(500);
    await owner.reload();
  }
  await owner.getByTestId("last-check-in").filter({ hasText: "just now" }).waitFor();
  await owner.screenshot({ path: `${OUT}admin-license.png` });
});
await step("License", "The console sees the check-in (counts only)", sa, async () => {
  await sa.click("nav >> text=Customers");
  await sa.getByTestId("customer-row").filter({ hasText: "Globex Corp" }).click();
  await sa.getByTestId("license-last-check-in").filter({ hasText: "just now · v1.0.0" }).waitFor();
  await sa.getByTestId("license-seats").filter({ hasText: "1 / 3" }).waitFor();
});
await step("License", "Seat limit blocks the 4th person (pending invitations count)", owner, async () => {
  const me = (await apiAs(owner, "GET", "/api/me")).json;
  const ws = [{ workspaceId: me.workspaces[0].id, role: "member" }];
  expect((await apiAs(owner, "POST", "/api/admin/invites", { email: "a@globex.test", workspaces: ws })).status === 200, "invite a");
  expect((await apiAs(owner, "POST", "/api/admin/invites", { email: "b@globex.test", workspaces: ws })).status === 200, "invite b");
  await owner.goto(`${APP}/admin/users`);
  await owner.click("text=Invite people");
  await owner.fill('input[placeholder="name@company.com"]', "c@globex.test");
  await owner.locator('[role="dialog"] input[type="checkbox"]').first().check();
  await owner.click("text=Create invitation");
  await toast(owner, "covers 3 people");
});
await step("License", "More seats in the console reach the server at check-in", owner, async () => {
  await sa.locator('button[aria-label="License options"]').click();
  await sa.getByRole("menuitem", { name: "Change terms" }).click();
  await sa.getByTestId("license-seats-input").fill("6");
  await sa.click('[role="dialog"] >> button:has-text("Save")');
  await sa.getByTestId("license-seats").filter({ hasText: "/ 6" }).waitFor();
  await owner.goto(`${APP}/admin/license`);
  await owner.click("button:has-text('Check in now')");
  await owner.getByTestId("license-seats").filter({ hasText: "/ 6" }).waitFor();
});
await step("License", "Revoking stops the deployment; restoring brings it back", owner, async () => {
  await sa.locator('button[aria-label="License options"]').click();
  await sa.getByRole("menuitem", { name: "Revoke" }).click();
  await sa.click('[role="dialog"] >> button:has-text("Revoke license")');
  await owner.click("button:has-text('Check in now')");
  await owner.getByTestId("license-banner").filter({ hasText: "revoked" }).waitFor();
  const me = (await apiAs(owner, "GET", "/api/me")).json;
  const blocked = await apiAs(owner, "POST", "/api/chats", { workspaceId: me.workspaces[0].id });
  expect(blocked.status === 402, `expected 402, got ${blocked.status}`);
  await owner.goto(`${APP}/app/chat`);
  await owner.getByTestId("license-banner").waitFor();
  await owner.screenshot({ path: `${OUT}revoked-banner.png` });
  await sa.locator('button[aria-label="License options"]').click();
  await sa.getByRole("menuitem", { name: "Restore" }).click();
  await apiAs(owner, "POST", "/api/admin/license/check-in");
  await owner.reload();
  await owner.locator("textarea").first().waitFor();
  expect((await owner.getByTestId("license-banner").count()) === 0, "banner still shown");
});

/* ═════════════ Single sign-on ═════════════ */
await step("SSO", "Custom OIDC is an Enterprise feature until the license includes it", owner, async () => {
  await owner.goto(`${APP}/admin/authentication`);
  await owner.getByTestId("add-oidc").filter({ hasText: "Enterprise" }).waitFor();
  expect(await owner.getByTestId("add-oidc").isDisabled(), "OIDC should be locked on the Work plan");
  expect(await owner.getByTestId("add-saml").isDisabled(), "SAML should be locked on the Work plan");
  await sa.locator('button[aria-label="License options"]').click();
  await sa.getByRole("menuitem", { name: "Change terms" }).click();
  await sa.locator('[role="dialog"] button', { hasText: "Custom single sign-on" }).click();
  await sa.click('[role="dialog"] >> button:has-text("Save")');
  await sa.locator('[role="dialog"]').waitFor({ state: "detached" });
  await sa.getByTestId("license-card").getByText(/Custom single sign-on/).waitFor();
  await apiAs(owner, "POST", "/api/admin/license/check-in");
  await owner.reload();
  expect(!(await owner.getByTestId("add-oidc").isDisabled()), "OIDC still locked after the upgrade");
});
await step("SSO", "Add an OpenID Connect provider and test it", owner, async () => {
  await owner.goto(`${APP}/admin/authentication`);
  await owner.getByTestId("add-oidc").click();
  expect((await owner.getByTestId("redirect-uri").inputValue()) === `${APP}/api/auth/sso/callback`, "redirect uri");
  await owner.fill('[role="dialog"] input[placeholder="Okta"]', "Okta");
  await owner.fill('[role="dialog"] input[placeholder="https://acme.okta.com"]', IDP);
  await owner.locator('[role="dialog"] label', { hasText: "Client ID" }).locator("input").fill("aatmiq-test");
  await owner.locator('[role="dialog"] label', { hasText: "Client secret" }).locator("input").fill("test-secret");
  await owner.fill('[role="dialog"] input[placeholder="acme.com"]', "globex.test");
  await owner.click('[role="dialog"] >> button:has-text("Add provider")');
  await owner.getByTestId("sso-connection").filter({ hasText: "Okta" }).waitFor();
  await owner.getByTestId("sso-connection").locator("button", { hasText: "Test" }).click();
  await toast(owner, "Reached 127.0.0.1:11600");
  await owner.screenshot({ path: `${OUT}admin-authentication.png` });
});
await step("SSO", "An invited person signs in with SSO", owner, async () => {
  const me = (await apiAs(owner, "GET", "/api/me")).json;
  await apiAs(owner, "POST", "/api/admin/invites", { email: "sam@globex.test", workspaces: [{ workspaceId: me.workspaces[0].id, role: "member" }] });
  const { page: sam } = await newUser("sam");
  await sam.goto(`${APP}/login`);
  await sam.getByTestId("sso-oidc").filter({ hasText: "Continue with Okta" }).click();
  await sam.waitForURL(`${IDP}/authorize**`);
  await sam.fill('input[name="email"]', "sam@globex.test");
  await sam.fill('input[name="name"]', "Sam Sharma");
  await sam.click("button:has-text('Sign in')");
  await sam.waitForURL("**/app/chat");
  await sam.getByRole("heading", { name: /, Sam/ }).waitFor();
  await sam.close();
});
await step("SSO", "Someone without an invitation is turned away with a clear message", owner, async () => {
  const { page: x } = await newUser("stranger");
  await x.goto(`${APP}/login`);
  await x.getByTestId("sso-oidc").click();
  await x.fill('input[name="email"]', "nobody@globex.test");
  await x.click("button:has-text('Sign in')");
  await x.waitForURL("**/login?sso_error=**");
  await x.getByText("no account for nobody@globex.test").waitFor();
  await x.close();
});
await step("SSO", "Cancelling at the provider returns with a message", owner, async () => {
  const { page: x } = await newUser("cancel");
  await x.goto(`${APP}/login`);
  await x.getByTestId("sso-oidc").click();
  await x.click("button:has-text('Cancel')");
  await x.getByText("You cancelled the sign-in.").waitFor();
  await x.close();
});
await step("SSO", "An invite link offers SSO for the invited address", owner, async () => {
  const me = (await apiAs(owner, "GET", "/api/me")).json;
  const inv = (await apiAs(owner, "POST", "/api/admin/invites", { email: "ivy@globex.test", workspaces: [{ workspaceId: me.workspaces[0].id, role: "member" }] })).json;
  const { page: ivy } = await newUser("ivy");
  await ivy.goto(inv.link.replace("http://localhost:3200", APP));
  await ivy.getByText("Join Globex Corp").waitFor();
  await ivy.getByTestId("sso-oidc").click();
  // The invited address is passed as a hint, so the mock provider signs it in directly.
  await ivy.waitForURL("**/app**");
  expect((await apiAs(ivy, "GET", "/api/me")).json.user.email === "ivy@globex.test", "wrong user");
  await ivy.close();
});
let samlAcs = "";
let samlEntity = "";
await step("SSO", "Add a SAML provider from its metadata URL and test it", owner, async () => {
  await owner.goto(`${APP}/admin/authentication`);
  await owner.click("button:has-text('Add provider')");
  await owner.getByTestId("add-saml").click();
  samlEntity = await owner.getByTestId("saml-entity-id").inputValue();
  samlAcs = await owner.getByTestId("saml-acs").inputValue();
  expect(/\/api\/auth\/sso\/[0-9a-f-]{36}\/metadata$/.test(samlEntity) && samlAcs === samlEntity.replace(/metadata$/, "acs"), "our SAML URLs");
  await owner.fill('[role="dialog"] input[placeholder="Okta"]', "Entra");
  await owner.getByTestId("saml-metadata").fill(`${SAML_IDP}/metadata`);
  await owner.click('[role="dialog"] >> button:has-text("Import")');
  await toast(owner, "Read the provider's metadata");
  expect((await owner.getByTestId("saml-issuer").inputValue()) === `${SAML_IDP}/metadata`, "entity ID from the metadata");
  expect((await owner.getByTestId("saml-sso-url").inputValue()) === `${SAML_IDP}/sso`, "SSO URL from the metadata");
  expect((await owner.getByTestId("saml-certs").inputValue()).startsWith("-----BEGIN CERTIFICATE-----"), "certificate from the metadata");
  await owner.fill('[role="dialog"] input[placeholder="acme.com"]', "globex.test");
  await owner.screenshot({ path: `${OUT}admin-saml.png` });
  await owner.click('[role="dialog"] >> button:has-text("Add provider")');
  const row = owner.getByTestId("sso-connection").filter({ hasText: "Entra" });
  await row.getByTestId("cert-expiry").filter({ hasText: "Certificate valid until" }).waitFor();
  await row.locator("button", { hasText: "Test" }).click();
  await toast(owner, "Reached 127.0.0.1:11700");
  // Our metadata, at our entity ID, for the provider to import.
  const md = await owner.request.get(samlEntity);
  expect(md.ok() && (await md.text()).includes(`Location="${samlAcs}"`), "our metadata");
});
await step("SSO", "An invited person signs in with SAML", owner, async () => {
  const me = (await apiAs(owner, "GET", "/api/me")).json;
  await apiAs(owner, "POST", "/api/admin/invites", { email: "sia.verma@globex.test", workspaces: [{ workspaceId: me.workspaces[0].id, role: "member" }] });
  const { page: sia } = await newUser("sia");
  await sia.goto(`${APP}/login`);
  await sia.getByTestId("sso-saml").filter({ hasText: "Continue with Entra" }).click();
  await sia.waitForURL(`${SAML_IDP}/sso**`);
  await sia.fill('input[name="email"]', "sia.verma@globex.test");
  await sia.click("button:has-text('Sign in')");
  await landOn(sia, /localhost:3200\/app\/chat/);
  const who = (await apiAs(sia, "GET", "/api/me")).json.user;
  expect(who.email === "sia.verma@globex.test" && who.name === "Sia Verma", `signed in as ${who.email} (${who.name})`);
  // Later, from the provider's app tile (it remembers her): Aatmiq starts the sign-in again and she's in.
  await sia.context().clearCookies({ domain: "localhost" }).catch(() => {});
  await sia.goto(`${SAML_IDP}/start?acs=${encodeURIComponent(samlAcs)}&audience=${encodeURIComponent(samlEntity)}&email=sia.verma%40globex.test`, { waitUntil: "commit" });
  await landOn(sia, /localhost:3200\/app\//);
  expect((await apiAs(sia, "GET", "/api/me")).json.user.email === "sia.verma@globex.test", "the app tile signs her in");
  await sia.close();
});
await step("SSO", "Requiring SSO hides passwords except for the owner", owner, async () => {
  await owner.goto(`${APP}/admin/authentication`);
  await owner.getByRole("switch", { name: "Require single sign-on" }).click();
  await toast(owner, "Single sign-on is now required");
  const { page: x } = await newUser("required");
  await x.goto(`${APP}/login`);
  await x.getByTestId("sso-oidc").waitFor();
  expect((await x.locator('input[type="password"]').count()) === 0, "password form visible");
  await x.click("text=Organization owner? Sign in with a password");
  await x.fill('input[type="email"]', "gina@globex.test");
  await x.fill('input[type="password"]', "correct-horse-battery");
  await x.click("button:has-text('Continue')");
  await x.waitForURL("**/app/**");
  await x.close();
});

/* ═════════════ Console, after all of the above ═════════════ */
await step("Console", "Console overview reflects seats and check-ins", sa, async () => {
  await sa.click("nav >> text=Overview");
  await sa.getByText("Seats in use").first().waitFor();
  await sa.screenshot({ path: `${OUT}console-overview.png` });
});

await browser.close();
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id} [${r.area}] ${r.name}${r.ok ? "" : `  ← ${r.err}`}`);
console.log(`\n${pass}/${results.length} passed`);
console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
process.exit(pass === results.length ? 0 : 1);
