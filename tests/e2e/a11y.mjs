/**
 * Accessibility: axe-core (WCAG 2.1 A and AA) on every main page, in the dark and the light theme,
 * plus keyboard checks (a skip link, focus you can see, menus and dialogs by keyboard).
 * Serious and critical problems fail the run; minor and moderate ones are listed.
 * Usage: E2E_SCRIPT=$PWD/tests/e2e/a11y.mjs tests/e2e/run-work.sh
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const APP = process.env.BASE_URL ?? "http://localhost:3300";
const OUT = new URL("./results-a11y/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const api = async (method, path, data) => {
  const r = await page.request.fetch(`${APP}${path}`, { method, data, headers: { origin: APP } });
  return r.headers()["content-type"]?.includes("json") ? r.json() : r.text();
};

/* ───────────── Something to look at ───────────── */
await page.goto(`${APP}/login`);
await api("POST", "/api/setup", { orgName: "Acme Labs", name: "Asha Rao", email: "asha@acme.test", password: "correct-horse-battery" });
const me = await api("GET", "/api/me");
const workspaceId = me.workspaces[0].id;
const chat = await api("POST", "/api/chats", { workspaceId });
await api("POST", `/api/chats/${chat.id}/messages`, { content: "Draft a short welcome note for new staff" });
const project = await api("POST", "/api/projects", { workspaceId, name: "Office move", instructions: "Answer as a checklist." });
await api("POST", `/api/projects/${project.id}/sources/note`, { title: "Movers", content: "The movers come on 12 March." });
const task = await api("POST", "/api/work/tasks", { workspaceId, prompt: "Plan the move", start: false });

const pages = [
  ["Chat home", "/app"],
  ["A chat", `/app/chat/${chat.id}`],
  ["Documents", "/app/documents"],
  ["Projects", "/app/projects"],
  ["A project", `/app/projects/${project.id}`],
  ["Work AI", "/app/work"],
  ["A task", `/app/work/${task.id}`],
  ["Scheduled", "/app/work/schedules"],
  ["Skills", "/app/work/skills"],
  ["Connections", "/app/work/connections"],
  ["Code", "/app/code"],
  ["Settings", "/app/settings"],
  ["Admin overview", "/admin"],
  ["Admin users", "/admin/users"],
  ["Admin groups", "/admin/groups"],
  ["Admin workspaces", "/admin/workspaces"],
  ["Admin models", "/admin/models"],
  ["Admin requests", "/admin/requests"],
  ["Admin usage", "/admin/usage"],
  ["Admin audit", "/admin/audit"],
  ["Admin health", "/admin/health"],
  ["Admin settings", "/admin/settings"],
  ["Admin authentication", "/admin/authentication"],
  ["Admin Work AI", "/admin/work"],
  ["Admin license", "/admin/license"],
];

/* ───────────── axe on each page ───────────── */
const results = [];
async function audit(name, theme) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    // Animations still running would be measured halfway.
    await new Promise((res) => setTimeout(res, 600));
    // eslint-disable-next-line no-undef
    const out = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return out.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\n").slice(0, 3).join(" ") })), count: v.nodes.length }));
  });
  for (const v of r) results.push({ page: name, theme, ...v });
}
const setTheme = (t) => page.evaluate((v) => localStorage.setItem("aatmiq.theme", v), t);

for (const theme of ["dark", "light"]) {
  await page.goto(`${APP}/app`);
  await setTheme(theme);
  for (const [name, path] of pages) {
    await page.goto(`${APP}${path}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await audit(name, theme);
  }
  // Settings tabs and the sign-in page.
  await page.goto(`${APP}/app/settings`);
  for (const tab of ["Security", "Appearance", "Usage", "Archived chats", "Your data"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await audit(`Settings → ${tab}`, theme);
  }
}
const signedOut = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const login = await signedOut.newPage();
await login.goto(`${APP}/login`);
await login.addScriptTag({ content: AXE });
for (const v of await login.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\n").slice(0, 3).join(" ") })) }))))
  results.push({ page: "Sign in", theme: "dark", ...v });

/* ───────────── The keyboard ───────────── */
const keyboard = [];
const check = async (name, fn) => {
  try {
    await fn();
    keyboard.push({ name, ok: true });
  } catch (e) {
    keyboard.push({ name, ok: false, err: String(e?.message ?? e).split("\n")[0] });
  }
};
// Before the first Tab, the page has to be drawn (the app shell comes after the session loads).
const ready = async (path) => {
  await page.goto(`${APP}${path}`);
  await page.getByTestId("open-search").waitFor();
};
await ready("/app");
await check("The first Tab reaches a skip link to the main content", async () => {
  await page.keyboard.press("Tab");
  const label = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (!/skip to (main )?content/i.test(label ?? "")) throw new Error(`first focus: "${label?.slice(0, 40)}"`);
  await page.keyboard.press("Enter");
  const inMain = await page.evaluate(() => !!document.activeElement?.closest("main") || document.activeElement?.id === "main");
  if (!inMain) throw new Error("Enter didn't move to the main content");
});
await check("Focus is visible on buttons and links", async () => {
  await ready("/app");
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "nothing focused";
    const s = getComputedStyle(el);
    return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 ? "outline" : s.boxShadow !== "none" ? "ring" : `none on ${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.slice(0, 30)}`;
  });
  if (!["outline", "ring"].includes(outline)) throw new Error(outline);
});
await check("The skip link works in the admin console too", async () => {
  await page.goto(`${APP}/admin/users`);
  await page.getByRole("link", { name: "Users" }).first().waitFor();
  await page.keyboard.press("Tab");
  const label = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (!/skip to content/i.test(label ?? "")) throw new Error(`first focus: "${label?.slice(0, 40)}"`);
});
await check("The model menu opens and closes by keyboard", async () => {
  await ready("/app");
  const trigger = page.locator("form button", { hasText: /Aatmiq Demo|Auto/ }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu").waitFor({ timeout: 3000 });
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "detached", timeout: 3000 });
});
await check("The search dialog opens with Ctrl+K and traps focus", async () => {
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").waitFor({ timeout: 3000 });
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  await page.keyboard.press("Escape");
  if (!inside) throw new Error("focus left the dialog");
});

/* ───────────── Report ───────────── */
await browser.close();
const serious = results.filter((r) => r.impact === "serious" || r.impact === "critical");
const byRule = new Map();
for (const r of results) {
  const k = `${r.impact} ${r.id}`;
  const e = byRule.get(k) ?? { ...r, pages: new Set(), total: 0 };
  e.pages.add(`${r.page} (${r.theme})`);
  e.total += r.count;
  byRule.set(k, e);
}
const lines = ["# Accessibility", "", `${results.length} findings on ${pages.length + 6} pages × 2 themes; ${serious.length} serious or critical.`, ""];
for (const [k, e] of [...byRule.entries()].sort()) {
  lines.push(`- **${k}**: ${e.help} (${e.total} elements) on ${[...e.pages].slice(0, 6).join(", ")}${e.pages.size > 6 ? ` and ${e.pages.size - 6} more` : ""}`);
  for (const n of e.nodes.slice(0, 2)) lines.push(`  - \`${n.target}\`: ${n.summary}`);
}
lines.push("", "## Keyboard", ...keyboard.map((k) => `- ${k.ok ? "PASS" : "FAIL"} ${k.name}${k.ok ? "" : `: ${k.err}`}`));
writeFileSync(`${OUT}report.md`, `${lines.join("\n")}\n`);
writeFileSync(`${OUT}report.json`, JSON.stringify(results, null, 2));
console.log(lines.join("\n"));
const keyboardFailed = keyboard.filter((k) => !k.ok).length;
console.log(`\n${serious.length} serious/critical, ${keyboardFailed} keyboard check(s) failed`);
process.exit(serious.length || keyboardFailed ? 1 : 0);
