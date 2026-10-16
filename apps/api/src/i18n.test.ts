/**
 * Every text the server sends people has its Hindi (src/i18n/hi.ts), and the catalog has nothing
 * stale. The texts are collected from the source: error messages (HttpError, badRequest… and the
 * services' own errors), msg("…"), the parts of emails and notifications, the health checks'
 * summaries and hints, and the license's status messages. A template literal's `${value}` is a
 * `{slot}` named after the value.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { fill, tr } from "./i18n";
import { HI } from "./i18n/hi";

const ROOT = join(__dirname, "../../..");
const SOURCES = ["apps/api/src", "packages/license/src/index.ts", "packages/model-gateway/src/index.ts"];
// The agent's own endpoints answer the model, not a person.
const SKIP = [/\.test\.ts$/, /\/i18n\//, /routes\/work-internal\.ts$/];

const ERROR_CALLS = new Set(["badRequest", "forbidden", "notFound", "conflict", "msg"]);
const ERROR_CLASSES = new Set(["SsoError", "ConnectorError", "UnsupportedFileError", "OcrError", "NoTextError", "LicenseError", "GatewayError", "LdapError"]);
/** Properties of emails (.send / .sendWith) and notifications (notify) that people read. */
const MAIL_PARTS = new Set(["subject", "note", "label", "title", "body", "lines"]);

function files(p: string): string[] {
  const abs = join(ROOT, p);
  if (abs.endsWith(".ts")) return [abs];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(p, e.name)) : e.name.endsWith(".ts") ? [join(abs, e.name)] : []));
}

function collect() {
  const keys = new Map<string, string>();
  const problems: string[] = [];
  for (const file of SOURCES.flatMap(files).filter((f) => !SKIP.some((r) => r.test(f)))) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const at = (n: ts.Node) => `${file.replace(`${ROOT}/`, "")}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const hasWords = (s: string) => /[A-Za-z]{2,}/.test(s);
    /** The English texts an expression can be, with {slots} for the values filled in. */
    const texts = (e: ts.Expression | undefined): string[] => {
      if (!e) return [];
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return hasWords(e.text) ? [e.text] : [];
      if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) return texts(e.expression);
      if (ts.isConditionalExpression(e)) return [...texts(e.whenTrue), ...texts(e.whenFalse)];
      if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) return [...texts(e.left), ...texts(e.right)];
      if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap((x) => texts(x as ts.Expression));
      if (ts.isCallExpression(e) && e.expression.getText(sf) === "fill") return texts(e.arguments[0]);
      if (ts.isTemplateExpression(e)) {
        const used = new Map<string, number>();
        let key = e.head.text;
        for (const span of e.templateSpans) {
          let x = span.expression;
          while (ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x) || ts.isAsExpression(x)) x = x.expression;
          // A value that picks between English words would put English inside the translation.
          let words = false;
          const look = (n: ts.Node) => {
            if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n)) && hasWords(n.text)) words = true;
            if (ts.isCallExpression(n) && /\b(split|replace|join|slice)\b/.test(n.expression.getText(sf))) return;
            ts.forEachChild(n, look);
          };
          look(x);
          if (words) problems.push(`${at(span.expression)}: \${${x.getText(sf).slice(0, 60)}} puts English words inside a message: write each sentence whole`);
          const base = ts.isIdentifier(x) ? x.text : ts.isPropertyAccessExpression(x) ? x.name.text : "x";
          const n = (used.get(base) ?? 0) + 1;
          used.set(base, n);
          key += `{${n > 1 ? `${base}${n}` : base}}${span.literal.text}`;
        }
        return hasWords(key.replace(/\{\w+\}/g, "")) ? [key] : [];
      }
      return [];
    };
    const add = (n: ts.Node, e: ts.Expression | undefined) => {
      for (const k of texts(e)) if (!keys.has(k)) keys.set(k, at(n));
    };
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression.getText(sf);
        if (ERROR_CALLS.has(callee)) add(n, n.arguments[0]);
        // Emails and notifications: the object literal's readable parts.
        if (/(\.send|\.sendWith|^notify)$/.test(callee))
          for (const a of n.arguments)
            if (ts.isObjectLiteralExpression(a))
              a.properties.forEach(function part(p) {
                if (!ts.isPropertyAssignment(p)) return;
                const name = p.name.getText(sf);
                if (MAIL_PARTS.has(name)) add(p, p.initializer);
                if (name === "button" && ts.isObjectLiteralExpression(p.initializer)) p.initializer.properties.forEach(part);
              });
      }
      if (ts.isNewExpression(n)) {
        const cls = n.expression.getText(sf);
        if (cls === "HttpError") add(n, n.arguments?.[1]);
        if (ERROR_CLASSES.has(cls)) add(n, n.arguments?.[0]);
      }
      // Health checks (shown in Admin → Health) and the license's status messages.
      if (ts.isPropertyAssignment(n)) {
        const name = n.name.getText(sf);
        if (file.endsWith("services/health.ts") && ["summary", "hint", "area"].includes(name)) add(n, n.initializer);
        if (file.includes("packages/license/") && name === "message") add(n, n.initializer);
      }
      if (ts.isVariableDeclaration(n) && file.endsWith("services/health.ts") && n.name.getText(sf) === "summary") add(n, n.initializer);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { keys, problems };
}

const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("server texts in Hindi", () => {
  const { keys, problems } = collect();

  it("collects the server's texts", () => {
    expect(keys.size).toBeGreaterThan(200);
    expect(problems).toEqual([]);
  });

  it("every text has its Hindi, with the same {slots}", () => {
    const missing = [...keys].filter(([k]) => !(k in HI)).map(([k, where]) => `${where}: ${k}`);
    expect(missing).toEqual([]);
    const different = Object.entries(HI)
      .filter(([k, v]) => slots(k) !== slots(v))
      .map(([k]) => k);
    expect(different).toEqual([]);
  });

  it("the catalog has nothing stale", () => {
    expect(Object.keys(HI).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("translates finished messages, with their values", () => {
    expect(tr("hi", "Not found")).toBe(HI["Not found"]);
    expect(tr("en", "Not found")).toBe("Not found");
    expect(tr("hi", "Something nobody wrote")).toBe("Something nobody wrote");
    const key = "Your plan includes {workspaceLimit} workspaces. Archive one or upgrade to add more.";
    expect(tr("hi", fill(key, { workspaceLimit: 3 }))).toBe(fill(HI[key]!, { workspaceLimit: 3 }));
  });

  it("translates the parts of composed messages: values, lines, lists and dates", () => {
    // A health alert: its summary inside the line, and the area.
    expect(tr("hi", "Problem · Backups: The last backup is 3 days old.")).toBe(
      fill(HI["Problem · {area}: {summary}"]!, { area: HI["Backups"]!, summary: fill(HI["The last backup is {x} old."]!, { x: fill(HI["{n} days"]!, { n: 3 }) }) }),
    );
    expect(tr("hi", "Fixed: Models, Disk")).toBe(fill(HI["Fixed: {areas}"]!, { areas: `${HI["Models"]}, ${HI["Disk"]}` }));
    expect(tr("hi", "Valid.\nThe license needs attention.")).toBe(`${HI["Valid."]}\n${HI["The license needs attention."]}`);
    expect(tr("hi", "Set up two-step sign-in by 16 October 2026")).toBe(fill(HI["Set up two-step sign-in by {when}"]!, { when: "16 अक्टूबर 2026" }));
    // People's own words stay as they are.
    expect(tr("hi", "Task finished: Quarterly report")).toBe(fill(HI["Task finished: {title}"]!, { title: "Quarterly report" }));
  });
});
