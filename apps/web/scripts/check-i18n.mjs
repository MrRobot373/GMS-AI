/**
 * Every text the interface translates has its Hindi, and the catalog has nothing stale.
 * Keys are collected from the source: t("…"), t.n(count, "…", "…") and msg("…").
 *
 *   node scripts/check-i18n.mjs            check (exit 1 on a missing or unused key)
 *   node scripts/check-i18n.mjs --missing  print the missing keys as JSON
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const SRC = new URL("../src/", import.meta.url).pathname;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

/** Keys used in the source, with where. */
const used = new Map();
const problems = [];
for (const file of files(SRC)) {
  const text = readFileSync(file, "utf8");
  if (!/\bt\(|\bt\.n\(|\bmsg\(/.test(text)) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const at = (n) => `${file.replace(SRC, "src/")}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const str = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(sf);
      if (callee === "t" || callee === "msg") {
        // A string, or strings chosen by a condition; a variable must hold a key marked with msg().
        const keys = (e) =>
          !e ? [] : str(e) !== null ? [str(e)] : ts.isParenthesizedExpression(e) ? keys(e.expression) : ts.isConditionalExpression(e) ? [...keys(e.whenTrue), ...keys(e.whenFalse)] : [null];
        const a = n.arguments[0];
        const ks = keys(a);
        for (const k of ks) if (k !== null) used.set(k, at(n));
        if (callee === "t" && a && ks.includes(null) && !ts.isIdentifier(a) && !ts.isPropertyAccessExpression(a) && !ts.isElementAccessExpression(a) && !ts.isCallExpression(a))
          problems.push(`${at(n)}: t() needs a plain string (got ${a.getText(sf).slice(0, 50)})`);
      } else if (callee === "t.n") {
        const one = str(n.arguments[1]);
        const other = str(n.arguments[2]);
        if (one !== null && other !== null) used.set(`${one}|${other}`, at(n));
        else problems.push(`${at(n)}: t.n() needs plain strings`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// The catalog: an object literal of string keys and values.
const catFile = join(SRC, "i18n", "hi.ts");
const cat = ts.createSourceFile(catFile, readFileSync(catFile, "utf8"), ts.ScriptTarget.Latest, true);
const hi = new Map();
cat.forEachChild(function find(n) {
  if (ts.isObjectLiteralExpression(n)) {
    for (const p of n.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const k = ts.isStringLiteral(p.name) || ts.isIdentifier(p.name) ? p.name.text : null;
      const v = ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer) ? p.initializer.text : null;
      if (k === null || v === null) continue;
      if (hi.has(k)) problems.push(`hi.ts: "${k}" twice`);
      hi.set(k, v);
    }
  } else ts.forEachChild(n, find);
});

const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const missing = [...used.keys()].filter((k) => !hi.has(k));
const unused = [...hi.keys()].filter((k) => !used.has(k));
for (const [k, v] of hi) {
  if (used.has(k) && params(k) !== params(v)) problems.push(`hi.ts: "${k}" and its translation have different {placeholders}`);
  if (k.includes("|") !== v.includes("|")) problems.push(`hi.ts: "${k}" is a plural; give both forms`);
}

if (process.argv.includes("--missing")) {
  console.log(JSON.stringify(Object.fromEntries(missing.map((k) => [k, used.get(k)])), null, 2));
  process.exit(0);
}
for (const k of missing) problems.push(`missing Hindi for "${k}" (${used.get(k)})`);
for (const k of unused) problems.push(`hi.ts: "${k}" isn't used any more`);
console.log(`${used.size} texts, ${hi.size} in Hindi`);
if (problems.length) {
  const order = (p) => (p.startsWith("missing") ? 1 : 0);
  problems.sort((a, b) => order(a) - order(b));
  console.log(problems.slice(0, 200).join("\n"));
  if (problems.length > 200) console.log(`… and ${problems.length - 200} more`);
  process.exit(1);
}
