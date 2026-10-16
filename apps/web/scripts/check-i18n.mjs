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
        // A string, or strings chosen by a condition (?:, ??, ||); a variable must hold a key marked with msg().
        const leaves = (e) =>
          !e
            ? []
            : ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)
              ? leaves(e.expression)
              : ts.isConditionalExpression(e)
                ? [...leaves(e.whenTrue), ...leaves(e.whenFalse)]
                : ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)
                  ? [...leaves(e.left), ...leaves(e.right)]
                  : [e];
        const a = n.arguments[0];
        for (const leaf of leaves(a)) {
          if (str(leaf) !== null) used.set(str(leaf), at(n));
          else if (callee === "t" && !ts.isIdentifier(leaf) && !ts.isPropertyAccessExpression(leaf) && !ts.isElementAccessExpression(leaf) && !ts.isCallExpression(leaf))
            problems.push(`${at(n)}: t() needs a plain string (got ${a.getText(sf).slice(0, 50)})`);
        }
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

// The connector catalog's texts (packages/shared/src/connectors.ts), shown with t(): its categories,
// descriptions, setup steps and token labels.
const shared = new URL("../../../packages/shared/src/connectors.ts", import.meta.url).pathname;
const csf = ts.createSourceFile(shared, readFileSync(shared, "utf8"), ts.ScriptTarget.Latest, true);
csf.forEachChild(function visit(n) {
  const where = () => `packages/shared/src/connectors.ts:${csf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  if (ts.isPropertyAssignment(n) && ["description", "setup", "label"].includes(n.name.getText(csf)) && ts.isStringLiteral(n.initializer)) used.set(n.initializer.text, where());
  else if (ts.isVariableDeclaration(n) && /_SETUP$/.test(n.name.getText(csf)) && n.initializer && ts.isStringLiteral(n.initializer)) used.set(n.initializer.text, where());
  else if (ts.isVariableDeclaration(n) && n.name.getText(csf) === "CATALOG_CATEGORIES" && n.initializer && ts.isArrayLiteralExpression(n.initializer))
    for (const e of n.initializer.elements) if (ts.isStringLiteral(e)) used.set(e.text, where());
  ts.forEachChild(n, visit);
});

// Auto's reasons (apps/api/src/services/router.ts), shown with routingReason(): the `reason:` texts
// and the second part of each [pattern, reason] pair.
const router = new URL("../../api/src/services/router.ts", import.meta.url).pathname;
const rsf = ts.createSourceFile(router, readFileSync(router, "utf8"), ts.ScriptTarget.Latest, true);
rsf.forEachChild(function visit(n) {
  const where = () => `apps/api/src/services/router.ts:${rsf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const reasons = (e) =>
    !e ? [] : ts.isStringLiteral(e) ? [e.text] : ts.isConditionalExpression(e) ? [...reasons(e.whenTrue), ...reasons(e.whenFalse)] : [];
  if (ts.isPropertyAssignment(n) && n.name.getText(rsf) === "reason") for (const r of reasons(n.initializer)) if (r) used.set(r, where());
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && n.left.getText(rsf) === "reason") for (const r of reasons(n.right)) used.set(r, where());
  if (ts.isArrayLiteralExpression(n) && n.elements.length === 2 && ts.isRegularExpressionLiteral(n.elements[0]) && ts.isStringLiteral(n.elements[1])) used.set(n.elements[1].text, where());
  ts.forEachChild(n, visit);
});

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
