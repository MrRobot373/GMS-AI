#!/usr/bin/env node
/**
 * The open-source packages Aatmiq ships, and their licenses.
 *
 *   node scripts/third-party-notices.mjs            write legal/third-party/npm-packages.md (the list)
 *   node scripts/third-party-notices.mjs --check    fail if that list is stale, or a license isn't one we accept
 *   node scripts/third-party-notices.mjs --texts F [--filter @aatmiq/web]
 *                                                   the full license texts of what a part ships, for its image
 *   node scripts/third-party-notices.mjs --node-modules DIR --texts F [--title "…"] [--prepend FILE]
 *                                                   the same for a plain node_modules tree (the agent runtime,
 *                                                   the IDE), without pnpm
 *
 * What ships: the API and web app (and what they use from packages/), and the desktop app. The
 * container images, system packages, fonts and models are in legal/THIRD-PARTY.md.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const LIST = join(ROOT, "legal", "third-party", "npm-packages.md");
const SHIPPED = ["@aatmiq/api", "@aatmiq/web", "@aatmiq/desktop"];

/** Licenses we accept in what we ship without a second look (SPDX ids and the spellings packages use). */
const ALLOWED = new Set([
  "MIT", "MIT-0", "MIT/X11", "ISC", "BSD", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Apache-2.0", "Unlicense", "CC0-1.0",
  "CC-BY-4.0", "OFL-1.1", "SIL OPEN FONT LICENSE", "Python-2.0", "BlueOak-1.0.0", "Zlib", "MPL-2.0", "(MIT AND Zlib)",
]);
/** Reviewed one by one: why each is fine. */
const REVIEWED = {
  "@img/sharp-libvips-": "LGPL-3.0-or-later: libvips, the image library Next.js uses through sharp, as a separate shared library, unmodified (source: github.com/libvips/libvips).",
};

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** A license expression is fine if any alternative of an OR is. */
function accepted(license) {
  if (ALLOWED.has(license)) return true;
  const alts = license.replace(/^\(|\)$/g, "").split(/\s+OR\s+/);
  return alts.length > 1 && alts.some((a) => ALLOWED.has(a.trim()));
}
const reviewed = (name) => Object.entries(REVIEWED).find(([prefix]) => name.startsWith(prefix))?.[1];
/** Platform builds (sharp, Next.js, esbuild…) differ by machine: listed once under their family. */
const PLATFORM = /-(linux|darwin|win32|freebsd|android)-(x64|arm64|ia32|arm|riscv64|s390x|ppc64)(-gnu|-musl|-msvc|-gnueabihf)?$/;

/** Packages from pnpm: name, versions, license, homepage, folders. */
function fromPnpm(filters) {
  const out = execFileSync("pnpm", ["licenses", "list", "--prod", "--json", ...filters.flatMap((f) => ["--filter", f])], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(out);
  const pkgs = [];
  for (const [license, list] of Object.entries(byLicense))
    for (const p of list) if (!p.name.startsWith("@aatmiq/")) pkgs.push({ name: p.name, versions: p.versions, license, homepage: p.homepage ?? "", paths: p.paths });
  return pkgs.sort((a, b) => a.name.localeCompare(b.name));
}

/** Packages in a plain node_modules tree (npm's layout, nested too). */
function fromNodeModules(dir) {
  const found = new Map();
  const visit = (nm) => {
    if (!existsSync(nm)) return;
    for (const entry of readdirSync(nm)) {
      if (entry.startsWith(".")) continue;
      const dirs = entry.startsWith("@") ? readdirSync(join(nm, entry)).map((e) => join(nm, entry, e)) : [join(nm, entry)];
      for (const d of dirs) {
        const pj = join(d, "package.json");
        if (!existsSync(pj)) continue;
        let p;
        try {
          p = JSON.parse(readFileSync(pj, "utf8"));
        } catch {
          continue;
        }
        if (!p.name) continue;
        const license = typeof p.license === "string" ? p.license : p.license?.type ?? (Array.isArray(p.licenses) ? p.licenses.map((l) => l.type ?? l).join(" OR ") : "Unknown");
        const key = `${p.name}@${p.version}`;
        if (!found.has(key)) found.set(key, { name: p.name, versions: [p.version], license, homepage: typeof p.homepage === "string" ? p.homepage : "", paths: [d] });
        visit(join(d, "node_modules"));
      }
    }
  };
  // The tree may hold several node_modules folders (the IDE: its own, and each extension's).
  const walk = (d, depth) => {
    if (depth > 4) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (!statSync(p).isDirectory()) continue;
      if (e === "node_modules") visit(p);
      else if (!e.startsWith(".")) walk(p, depth + 1);
    }
  };
  if (dir.endsWith("node_modules")) visit(dir);
  else walk(dir, 0);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.versions[0].localeCompare(b.versions[0]));
}

const LICENSE_FILE = /^(licen[sc]e|copying|notice)([.-].*)?$/i;
function licenseTexts(path) {
  if (!path || !existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => LICENSE_FILE.test(f) && statSync(join(path, f)).isFile())
    .sort()
    .map((f) => readFileSync(join(path, f), "utf8").replace(/\r\n/g, "\n").trim());
}

const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const ISC_BODY = `Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
is hereby granted, provided that the above copyright notice and this permission notice appear in all
copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING
OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

function author(path) {
  try {
    const a = JSON.parse(readFileSync(join(path, "package.json"), "utf8")).author;
    return typeof a === "string" ? a : a?.name;
  } catch {
    return undefined;
  }
}

/** Full texts, packages with the same text grouped. A package without a license file gets its license's standard text. */
function writeTexts(pkgs, file, title, prepend) {
  const groups = new Map();
  const found = pkgs.map((p) => licenseTexts(p.paths[0]));
  const apache = found.flat().find((t) => /^\s*Apache License\s+Version 2\.0/.test(t));
  // LGPL libraries (libvips): the package's notes on what it bundles, then the LGPL and the GPL it builds on.
  const gnu = (f) => {
    const path = join(ROOT, "legal", "third-party", "licenses", f);
    return existsSync(path) ? readFileSync(path, "utf8").trim() : `(${f}: https://www.gnu.org/licenses/)`;
  };
  for (const [i, p] of pkgs.entries()) {
    if (!/^LGPL-3\.0/.test(p.license) || found[i].length) continue;
    const readme = join(p.paths[0] ?? "", "README.md");
    found[i] = [...(existsSync(readme) ? [readFileSync(readme, "utf8").trim()] : []), gnu("LGPL-3.0.txt"), gnu("GPL-3.0.txt")];
  }
  for (const [i, p] of pkgs.entries()) {
    const texts = found[i];
    const note = `(${p.name} declares ${p.license} without a license file; this is that license's standard text.)`;
    const text = texts.length
      ? texts.join("\n\n")
      : /^MIT$/.test(p.license)
        ? `MIT License\n\nCopyright (c) ${author(p.paths[0]) ?? `the authors of ${p.name}`}\n\n${MIT_BODY}\n\n${note}`
        : p.license === "ISC"
          ? `ISC License\n\nCopyright (c) ${author(p.paths[0]) ?? `the authors of ${p.name}`}\n\n${ISC_BODY}\n\n${note}`
          : p.license === "Apache-2.0" && apache
            ? `${apache}\n\n${note}`
            : p.license === "MPL-2.0"
              ? `${gnu("MPL-2.0.txt")}\n\n${note} Its source: ${p.homepage || `https://www.npmjs.com/package/${p.name}`}.`
              : p.license === "Unlicense"
              ? `Released into the public domain (The Unlicense, https://unlicense.org). ${note}`
              : `${p.license}. The package has no license file; see ${p.homepage || `https://www.npmjs.com/package/${p.name}`}.`;
    const h = createHash("sha256").update(text).digest("hex");
    const g = groups.get(h) ?? { text, used: [] };
    g.used.push(`${p.name} ${p.versions.join(", ")} (${p.license})`);
    groups.set(h, g);
  }
  const parts = [
    title,
    "=".repeat(title.length),
    "",
    `This lists the open-source software in this part of Aatmiq, ${pkgs.length} packages, with their license texts.`,
    "Container images, system packages, fonts and AI models: legal/THIRD-PARTY.md in Aatmiq's release.",
    "",
  ];
  if (prepend) parts.push(readFileSync(prepend, "utf8").trim(), "");
  for (const g of [...groups.values()].sort((a, b) => a.used[0].localeCompare(b.used[0]))) {
    parts.push("-".repeat(78), ...g.used, "-".repeat(78), "", g.text, "");
  }
  writeFileSync(file, `${parts.join("\n")}\n`);
  console.log(`${file}: ${pkgs.length} packages, ${groups.size} license texts`);
}

/** The committed list: one row per package (platform builds folded), and a count per license. */
function listMarkdown(pkgs) {
  const rows = new Map();
  for (const p of pkgs) {
    const name = PLATFORM.test(p.name) ? p.name.replace(PLATFORM, "-*") : p.name;
    const r = rows.get(name) ?? { name, versions: new Set(), license: p.license };
    for (const v of p.versions) if (!PLATFORM.test(p.name)) r.versions.add(v);
    rows.set(name, r);
  }
  const counts = {};
  for (const r of rows.values()) counts[r.license] = (counts[r.license] ?? 0) + 1;
  return [
    "# npm packages in Aatmiq",
    "",
    "Generated by `node scripts/third-party-notices.mjs` from what the API, the web app and the desktop app",
    "ship (production dependencies). CI fails when it's out of date or a license needs review. The full",
    "license texts go into each image as `THIRD_PARTY_NOTICES.txt`; container images, system packages,",
    "fonts and models are in [../THIRD-PARTY.md](../THIRD-PARTY.md).",
    "",
    `${rows.size} packages: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(", ")}.`,
    "",
    "| Package | Version | License |",
    "|---|---|---|",
    ...[...rows.values()].map((r) => `| ${r.name} | ${[...r.versions].join(", ") || "(per platform)"} | ${r.license} |`),
    "",
  ].join("\n");
}

function problems(pkgs) {
  return pkgs.flatMap((p) => (accepted(p.license) || reviewed(p.name) ? [] : [`${p.name} ${p.versions.join(", ")}: ${p.license} needs a review (add it to REVIEWED with the reason, or replace the package)`]));
}

const nm = opt("--node-modules");
const texts = opt("--texts");
if (nm) {
  const pkgs = fromNodeModules(nm);
  writeTexts(pkgs, texts ?? join(nm, "THIRD_PARTY_NOTICES.txt"), opt("--title") ?? "Third-party notices", opt("--prepend"));
  process.exit(0);
}
const filter = opt("--filter");
const pkgs = fromPnpm(filter ? [filter] : SHIPPED);
if (texts) {
  writeTexts(pkgs, texts, `Aatmiq ${filter ? filter.replace("@aatmiq/", "") : ""} third-party notices`.replace("  ", " "), opt("--prepend"));
  process.exit(0);
}
const md = listMarkdown(pkgs);
const issues = problems(pkgs);
if (args.includes("--check")) {
  if (!existsSync(LIST) || readFileSync(LIST, "utf8") !== md) issues.push(`${relative(ROOT, LIST)} is out of date: run node scripts/third-party-notices.mjs`);
  for (const i of issues) console.log(i);
  console.log(issues.length ? `${issues.length} problem(s)` : `${pkgs.length} packages, licenses fine, list up to date`);
  process.exit(issues.length ? 1 : 0);
}
writeFileSync(LIST, md);
console.log(`${relative(ROOT, LIST)}: ${pkgs.length} packages`);
for (const i of issues) console.log(i);
process.exit(issues.length ? 1 : 0);
