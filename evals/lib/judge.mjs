/**
 * The judge: one pinned model answers "does the work meet this criterion?" for the criteria a program can't check
 * (an honest "I can't send email", a question asked instead of a guess). It runs through the platform's own chat, so no
 * key is needed here. One judge model for every run: scores from two judges don't compare.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { EvalError } from "./errors.mjs";

const TEXT = /\.(md|txt|csv|json|html?|css|js|py|ts|yml|yaml|xml|tsv)$/i;

/** What the judge sees of the files a run made: names, and the start of the small text ones. */
export function filesSummary(dir, files, { maxFiles = 6, maxChars = 1200 } = {}) {
  if (!files?.length) return "(no files)";
  return files
    .slice(0, maxFiles)
    .map((f) => {
      let body = "";
      if (TEXT.test(f)) {
        try {
          if (statSync(join(dir, f)).size < 200_000) body = readFileSync(join(dir, f), "utf8").slice(0, maxChars);
        } catch {
          /* unreadable: names only */
        }
      }
      return `- ${f}${body ? `\n${body.split("\n").map((l) => `    ${l}`).join("\n")}` : ""}`;
    })
    .join("\n");
}

/** The question put to the judge (exported so a test can read it). */
export function judgePrompt({ request, answer, files, criteria }) {
  return [
    "You are grading the work of an AI assistant against fixed criteria. Be strict and literal: a criterion passes only when the evidence below clearly shows it. Judge what the assistant actually said and made, not what it could have done.",
    "",
    "## The person's request",
    request,
    "",
    "## The assistant's final reply",
    answer || "(it said nothing)",
    "",
    "## Files it made",
    files,
    "",
    "## Criteria",
    ...Object.entries(criteria).map(([name, text]) => `- ${name}: ${text}`),
    "",
    'Reply with ONLY a JSON object, no other text: {"<criterion name>": {"pass": true or false, "why": "one short sentence"}, ...} with one entry for every criterion above.',
  ].join("\n");
}

/** The JSON object in a judge reply (it may be wrapped in a code fence or have a sentence before it). */
export function parseVerdict(text, names) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const out = {};
  for (const n of names) {
    const v = obj?.[n];
    if (!v || typeof v.pass !== "boolean") return null;
    out[n] = { pass: v.pass, why: String(v.why ?? "").slice(0, 300) };
  }
  return out;
}

/**
 * A judge function for a task: judge(names) → { name: { pass, why } }.
 * `ask(prompt)` returns the model's text. Asks again once when the reply isn't the JSON asked for.
 */
export function makeJudge({ ask, task, answer, dir, files }) {
  return async (names, extra = {}) => {
    const wanted = names ?? task.judged;
    const criteria = Object.fromEntries(wanted.map((n) => [n, task.criteria[n] ?? (() => { throw new EvalError(`unknown criterion "${n}"`); })()]));
    const prompt = judgePrompt({ request: task.instruction, answer: extra.answer ?? answer, files: filesSummary(dir, files), criteria });
    let last = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        last = await ask(attempt ? `${prompt}\n\nYour last reply was not the JSON object asked for. Reply with only that JSON object.` : prompt);
      } catch (e) {
        throw new EvalError(`the judge model could not be reached: ${e.message}`);
      }
      const verdict = parseVerdict(last, wanted);
      if (verdict) return verdict;
    }
    throw new EvalError(`the judge did not answer with the JSON asked for (it said: ${last.slice(0, 120).replace(/\s+/g, " ")})`);
  };
}
