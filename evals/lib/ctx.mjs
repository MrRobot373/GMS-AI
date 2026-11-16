/** What a grader gets: the answer, the files, the events, and ways to run and look at things. */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EvalError, Skip } from "./errors.mjs";
import { withPage } from "./page.mjs";

const AUDIT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "packages", "skills", "library", "document-checks", "scripts", "office_audit.py");

/** Files under `dir` (relative, forward slashes), without the agent's scratch and tooling folders. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const rel = relative(dir, p).split(sep).join("/");
      if (/(^|\/)(scratch|tmp|\.task|node_modules|__pycache__|\.git)(\/|$)/.test(rel) || /(^|\/)~\$/.test(rel)) continue;
      if (statSync(p).isDirectory()) walk(p);
      else out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * @param {object} o
 * @param {string} o.answer the agent's final reply
 * @param {string} o.dir the folder the agent's files were saved in
 * @param {object[]} [o.events] the task's timeline
 * @param {Function} [o.judge] judge(names) → { name: { pass, why } }
 * @param {object} [o.info] what the server offers ({ webSearch, browser, … })
 */
export function makeCtx({ answer, dir, events = [], judge, info = {} }) {
  const abs = (rel) => {
    const p = resolve(dir, rel);
    if (p !== resolve(dir) && !p.startsWith(resolve(dir) + sep)) throw new EvalError(`"${rel}" is outside the task folder`);
    return p;
  };
  return {
    answer: String(answer ?? ""),
    dir,
    events,
    info,
    files: () => listFiles(dir),
    exists: (rel) => existsSync(abs(rel)),
    read: (rel) => readFileSync(abs(rel), "utf8"),
    path: abs,
    /** Tool calls (name, args) whose name matches. */
    toolCalls: (re) => events.filter((e) => e.kind === "tool_call" && re.test(String(e.data?.name ?? ""))).map((e) => ({ name: e.data.name, args: e.data.args })),
    /** Run a program; { code, stdout, stderr, timedOut }. A program that can't start is an EvalError, not a fail. */
    run(cmd, args = [], { cwd = dir, input, timeoutMs = 30_000 } = {}) {
      const r = spawnSync(cmd, args, { cwd, input, encoding: "utf8", timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
      if (r.error && r.error.code === "ENOENT") throw new EvalError(`${cmd} isn't installed here`);
      return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", timedOut: r.error?.code === "ETIMEDOUT" };
    },
    /** The page opened from the folder, in a real browser. */
    page: (rel, body, opts) => withPage(abs(rel), body, opts),
    /** The document audit (python3 + openpyxl, python-pptx, python-docx; LibreOffice for page counts). */
    audit(rels, require = "") {
      if (!existsSync(AUDIT)) throw new EvalError("document-checks/scripts/office_audit.py is missing");
      const r = spawnSync("python3", ["-I", AUDIT, ...rels.map(abs), ...(require ? ["--require", require] : [])], { encoding: "utf8", timeout: 600_000 });
      if (r.error) throw new EvalError(`the document audit could not run (${r.error.message})`);
      const out = `${r.stdout ?? ""}`;
      if (!out.trim()) throw new EvalError(`the document audit printed nothing (${String(r.stderr).slice(0, 200)})`);
      const fails = out.split("\n").filter((l) => /^\s+FAIL\b/.test(l)).map((l) => l.replace(/^\s+FAIL\s+/, "").trim());
      const warns = out.split("\n").filter((l) => /^\s+WARN\b/.test(l)).map((l) => l.replace(/^\s+WARN\s+/, "").trim());
      const where = (l) => l.split(":")[0].trim().toLowerCase();
      return {
        output: out,
        fails,
        warns,
        /** Did the audit FAIL on this check ("pages", "charts", "formulas", "slides", "notes", "footer", "header", "contents")? */
        failed: (check) => fails.some((l) => where(l) === check),
        /** FAILs other than the checks named: what is wrong with the file whatever was asked for. */
        otherFails: (checks) => fails.filter((l) => !checks.includes(where(l))),
      };
    },
    judge: judge ?? (async () => {
      throw new EvalError("no judge model was given (use --judge-model)");
    }),
    skip(reason) {
      throw new Skip(reason);
    },
  };
}
