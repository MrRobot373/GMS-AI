/**
 * The Hindi interface: a person picks Hindi, the pages (and the sign-in page after signing out)
 * are in Hindi with lang="hi", the admin console too, the organization's default
 * applies to people who haven't picked, dates and counts follow, and axe finds nothing serious.
 * Screenshots of the main pages in Hindi go to results-hindi/ for a native speaker to review.
 * Usage: E2E_SCRIPT=$PWD/tests/e2e/hindi.mjs tests/e2e/run-work.sh
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";

const APP = process.env.BASE_URL ?? "http://localhost:3300";
const OUT = new URL("./results-hindi/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

let pass = 0;
let fail = 0;
const results = [];
async function step(name, page, fn) {
  try {
    await fn();
    pass++;
    results.push(`PASS ${name}`);
  } catch (e) {
    fail++;
    results.push(`FAIL ${name}  ← ${String(e?.message ?? e).split("\n")[0]}`);
    await page?.screenshot({ path: `${OUT}FAIL-${pass + fail}.png` }).catch(() => {});
  }
  console.log(results.at(-1));
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
async function person() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const api = async (method, path, data) => {
    const r = await page.request.fetch(`${APP}${path}`, { method, data, headers: { origin: APP } });
    return { status: r.status(), json: await r.json().catch(() => null) };
  };
  return { ctx, page, api, errors };
}
const lang = (page) => page.evaluate(() => document.documentElement.lang);

const owner = await person();
await owner.page.goto(`${APP}/login`);
await owner.api("POST", "/api/setup", { orgName: "Acme Labs", name: "Asha Rao", email: "asha@acme.test", password: "correct-horse-battery" });
const me = (await owner.api("GET", "/api/me")).json;
const workspaceId = me.workspaces[0].id;
const chat = (await owner.api("POST", "/api/chats", { workspaceId })).json;
await owner.api("POST", `/api/chats/${chat.id}/messages`, { content: "Draft a short welcome note for new staff" });
await owner.api("POST", "/api/projects", { workspaceId, name: "दफ़्तर का स्थानांतरण", instructions: "Answer as a checklist." });

await step("English to start with; the API refuses a language it doesn't have", owner.page, async () => {
  await owner.page.goto(`${APP}/app/settings`);
  await owner.page.getByRole("button", { name: "Appearance", exact: true }).click();
  expect((await lang(owner.page)) === "en", "lang should be en");
  expect((await owner.api("PATCH", "/api/me", { locale: "fr" })).status === 400, "fr accepted");
});

await step("Picking हिन्दी turns the page into Hindi, lang=hi", owner.page, async () => {
  await owner.page.getByTestId("language-hi").click();
  await owner.page.getByRole("heading", { name: "सेटिंग" }).waitFor();
  expect((await lang(owner.page)) === "hi", `lang is ${await lang(owner.page)}`);
  await owner.page.getByRole("button", { name: "दिखावट", exact: true }).waitFor();
  expect((await owner.api("GET", "/api/me")).json.user.locale === "hi", "not saved");
});

await step("It stays Hindi after a reload, from the first paint (server-rendered)", owner.page, async () => {
  const html = await (await owner.page.request.get(`${APP}/app/settings`)).text();
  expect(/<html[^>]*lang="hi"/.test(html), "the server rendered another lang");
  await owner.page.reload();
  await owner.page.getByRole("heading", { name: "सेटिंग" }).waitFor();
});

const pages = [
  ["chat-home", "/app", "नई चैट"],
  ["chat", `/app/chat/${chat.id}`, "AI से गलतियाँ हो सकती हैं"],
  ["documents", "/app/documents", "दस्तावेज़"],
  ["projects", "/app/projects", "नया प्रोजेक्ट"],
  ["work", "/app/work", "टास्क"],
  ["schedules", "/app/work/schedules", "शेड्यूल किए गए टास्क"],
  ["skills", "/app/work/skills", "स्किल"],
  ["connections", "/app/work/connections", "कनेक्शन"],
  ["code", "/app/code", "नया वर्कस्पेस"],
];
for (const [name, path, text] of pages) {
  await step(`${name} is in Hindi`, owner.page, async () => {
    await owner.page.goto(`${APP}${path}`);
    await owner.page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
    await owner.page.waitForLoadState("networkidle").catch(() => {});
    await owner.page.screenshot({ path: `${OUT}${name}.png` });
  });
}

await step("A chat's composer and the search dialog are in Hindi", owner.page, async () => {
  await owner.page.goto(`${APP}/app/chat/${chat.id}`);
  await owner.page.getByPlaceholder("Aatmiq को जवाब दें…").waitFor();
  await owner.page.keyboard.press("Control+k");
  await owner.page.getByPlaceholder("चैट, संदेश, दस्तावेज़ और प्रोजेक्ट खोजें").waitFor();
  await owner.page.screenshot({ path: `${OUT}search.png` });
  await owner.page.keyboard.press("Escape");
});

await step("Dates and plurals follow the language", owner.page, async () => {
  await owner.page.goto(`${APP}/app/settings`);
  await owner.page.getByRole("button", { name: "उपयोग", exact: true }).click();
  // "Resets 1 Nov" in Hindi: a Devanagari month name.
  await owner.page.getByText(/रीसेट होगा/).first().waitFor();
  const text = await owner.page.getByText(/रीसेट होगा/).first().innerText();
  expect(/[ऀ-ॿ]{3,}/.test(text.replace("रीसेट होगा", "")), `date not in Hindi: ${text}`);
});

await step("No serious accessibility problems in Hindi", owner.page, async () => {
  for (const path of ["/app", "/app/settings", "/app/work"]) {
    await owner.page.goto(`${APP}${path}`);
    await owner.page.waitForLoadState("networkidle").catch(() => {});
    await owner.page.addScriptTag({ content: AXE });
    const bad = await owner.page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id),
    );
    expect(!bad.length, `${path}: ${bad.join(", ")}`);
  }
});

const adminPages = [
  ["admin-overview", "/admin", "सारांश"],
  ["admin-users", "/admin/users", "लंबित आमंत्रण"],
  ["admin-models", "/admin/models", "प्रोवाइडर जोड़ें"],
  ["admin-settings", "/admin/settings", "संगठन और ब्रांडिंग"],
  ["admin-authentication", "/admin/authentication", "साइन-इन प्रोवाइडर"],
  ["admin-work", "/admin/work", "मंज़ूरियाँ"],
  ["admin-health", "/admin/health", "सिस्टम की स्थिति"],
];
for (const [name, path, text] of adminPages) {
  await step(`${name} is in Hindi`, owner.page, async () => {
    await owner.page.goto(`${APP}${path}`);
    await owner.page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
    expect((await lang(owner.page)) === "hi", `lang is ${await lang(owner.page)}`);
    await owner.page.waitForLoadState("networkidle").catch(() => {});
    await owner.page.screenshot({ path: `${OUT}${name}.png` });
  });
}

await step("No serious accessibility problems in the admin console in Hindi", owner.page, async () => {
  for (const path of ["/admin", "/admin/users", "/admin/settings"]) {
    await owner.page.goto(`${APP}${path}`);
    await owner.page.waitForLoadState("networkidle").catch(() => {});
    await owner.page.addScriptTag({ content: AXE });
    const bad = await owner.page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id),
    );
    expect(!bad.length, `${path}: ${bad.join(", ")}`);
  }
});

await step("Signed out, the sign-in page is in Hindi too (the language stays in the browser)", owner.page, async () => {
  await owner.api("POST", "/api/auth/sign-out", {});
  await owner.page.goto(`${APP}/login`);
  await owner.page.getByRole("button", { name: "जारी रखें" }).waitFor();
  expect((await lang(owner.page)) === "hi", "lang on the sign-in page");
  await owner.page.screenshot({ path: `${OUT}login.png` });
  await owner.page.fill('input[type="email"]', "asha@acme.test");
  await owner.page.fill('input[type="password"]', "correct-horse-battery");
  await owner.page.click("button:has-text('जारी रखें')");
  await owner.page.waitForURL("**/app/**");
});

await step("The organization's default: Hindi for people who haven't picked, until they do", owner.page, async () => {
  await owner.page.goto(`${APP}/admin/settings`);
  await owner.page.getByTestId("default-locale").selectOption("hi");
  await owner.page.getByTestId("save-default-locale").click();
  await owner.page.locator("[data-sonner-toast]", { hasText: "सेटिंग सहेजी गई" }).first().waitFor();
  const inv = (await owner.api("POST", "/api/admin/invites", { email: "ravi@acme.test", workspaces: [{ workspaceId, role: "member" }] })).json;
  const ravi = await person();
  await ravi.page.goto(inv.link.replace(/^https?:\/\/[^/]+/, APP));
  await ravi.api("POST", `/api/invites/${inv.link.split("/invite/")[1]}/accept`, { name: "Ravi Kumar", password: "another-good-password" });
  await ravi.page.goto(`${APP}/app`);
  await ravi.page.getByText("नई चैट").first().waitFor();
  expect((await lang(ravi.page)) === "hi", "the default didn't apply");
  // His own choice wins.
  await ravi.page.goto(`${APP}/app/settings`);
  await ravi.page.getByRole("button", { name: "दिखावट", exact: true }).click();
  await ravi.page.getByTestId("language-en").click();
  await ravi.page.getByRole("heading", { name: "Settings" }).waitFor();
  expect((await lang(ravi.page)) === "en", "his English didn't apply");
  expect(!ravi.errors.length, `page errors: ${ravi.errors.join(" | ")}`);
  await ravi.ctx.close();
});

await step("No page errors in Hindi", owner.page, async () => {
  expect(!owner.errors.length, owner.errors.join(" | "));
});

await browser.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
