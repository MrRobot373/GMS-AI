#!/usr/bin/env node
// Cut a release: node scripts/release.mjs 1.0.0 [--dry-run]
// Checks the version and that CHANGELOG.md has a section for it, stamps the section with today's
// date, writes VERSION and the desktop app's version, commits "Release <version>" and tags
// v<version>. It doesn't push: `git push origin HEAD v<version>` starts .github/workflows/release.yml
// (images to the registry, the upgrade test, the GitHub release) and the desktop packages.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const version = args.find((a) => !a.startsWith("--"));
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const fail = (m) => {
  console.error(m);
  process.exit(1);
};

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) fail("Usage: node scripts/release.mjs <version like 1.0.0 or 1.1.0-rc.1> [--dry-run]");
if (!dry && git("status", "--porcelain")) fail("Commit or stash your changes first: the release commit should hold only the release.");
if (git("tag", "--list", `v${version}`)) fail(`v${version} is already tagged.`);
const current = readFileSync(join(root, "VERSION"), "utf8").trim();
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split("-")[0].split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return a !== b && (!a.includes("-") || b.includes("-"));
};
if (version !== current && !newer(version, current)) fail(`${version} isn't newer than ${current}.`);

const changelogPath = join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const header = new RegExp(`^## ${version.replace(/\./g, "\\.")} — (.+)$`, "m");
const m = header.exec(changelog);
if (!m) fail(`CHANGELOG.md has no "## ${version} — …" section: write what changed first.`);
const body = changelog.slice(m.index + m[0].length).split(/^## /m)[0].trim();
if (!body) fail(`The ${version} section of CHANGELOG.md is empty.`);
const today = new Date().toISOString().slice(0, 10);

const desktopPath = join(root, "apps/desktop/package.json");
const desktop = JSON.parse(readFileSync(desktopPath, "utf8"));
console.log(`Release ${version} (was ${current}), dated ${today}:`);
console.log(`  VERSION                    ${current} → ${version}`);
console.log(`  apps/desktop/package.json  ${desktop.version} → ${version}`);
console.log(`  CHANGELOG.md               "## ${version} — ${m[1]}" → "## ${version} — ${today}"`);
if (dry) process.exit(0);

writeFileSync(join(root, "VERSION"), `${version}\n`);
desktop.version = version;
writeFileSync(desktopPath, `${JSON.stringify(desktop, null, 2)}\n`);
writeFileSync(changelogPath, changelog.replace(header, `## ${version} — ${today}`));
git("add", "VERSION", "apps/desktop/package.json", "CHANGELOG.md");
git("commit", "-m", `Release ${version}`);
git("tag", "-a", `v${version}`, "-m", `Aatmiq ${version}`);
console.log(`\nTagged v${version}. Publish it with:\n  git push origin HEAD v${version}`);
