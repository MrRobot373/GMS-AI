/**
 * Aatmiq Code's theme: it follows the browser's light or dark mode unless the person chose a theme.
 * Run with `pnpm --filter @aatmiq/code test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { keepChosenTheme } = require("../extensions/aatmiq/theme.js");
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));

test("the defaults follow the browser: Aatmiq Light in light mode, Aatmiq Dark in dark mode", () => {
  const defaults = read("../settings.json");
  assert.equal(defaults["window.autoDetectColorScheme"], true);
  const themes = Object.fromEntries(read("../extensions/aatmiq-theme/package.json").contributes.themes.map((t) => [t.label, t.uiTheme]));
  assert.equal(themes[defaults["workbench.preferredLightColorTheme"]], "vs");
  assert.equal(themes[defaults["workbench.preferredDarkColorTheme"]], "vs-dark");
});

/** Settings as the extension sees them: the person's own values, and what was written. */
function settings(own) {
  const written = [];
  return {
    written,
    inspect: (key) => ({ defaultValue: undefined, globalValue: own[key] }),
    update: async (key, value, global) => void written.push([key, value, global]),
  };
}

test("a theme the person chose before detection was the default stays theirs", async () => {
  const s = settings({ "workbench.colorTheme": "Aatmiq Light" });
  assert.equal(await keepChosenTheme(s), true);
  assert.deepEqual(s.written, [["window.autoDetectColorScheme", false, true]]);
});

test("nothing chosen, or detection set by the person: left as it is", async () => {
  for (const own of [{}, { "window.autoDetectColorScheme": true, "workbench.colorTheme": "Aatmiq Light" }, { "window.autoDetectColorScheme": false }, { "workbench.preferredDarkColorTheme": "Aatmiq Dark" }]) {
    const s = settings(own);
    assert.equal(await keepChosenTheme(s), false, JSON.stringify(own));
    assert.deepEqual(s.written, []);
  }
});
