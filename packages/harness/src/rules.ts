/**
 * Rules for the agent's work that both engines state in their own prompt (the DSH persona and Super AI's brief), so they
 * stay one text. They come from other projects' lessons: use the person's own material before the web, re-check what can
 * change against its latest source, and show what is missing as a gap instead of inventing it.
 */
import type { TaskSpec } from "./types";

export function workRules(spec: Pick<TaskSpec, "skillsDir" | "review">): string[] {
  return [
    // The person's own documents are the best source for work about their organization.
    ...(spec.review
      ? []
      : ["For work about the person's own company, project or files, look in their documents (documents_search) and your working folder before the web. Use the web only for what those don't cover, and say which facts came from where."]),
    // Without a budget a model keeps searching for the one missing figure (pages that 404, time out or don't give it) and
    // the person gets nothing after an hour.
    "Research only as much as the task needs: usually under 10 searches and the few pages you rely on, then build what was asked. When a page fails or doesn't give a figure, don't keep hunting for it: put what you found in the file, mark the rest (\"not found\", \"unverified\") with where you looked, and say so. A finished file with marked gaps beats no file.",
    // A model whose lookups failed otherwise writes figures from memory and labels them with a source it never opened.
    "Name a source only if you read it in this task (a page you fetched, a file you opened); never write a source like \"official spec sheet\" or \"annual report\" that you didn't read. When your searches or page reads failed, say that the figures come from memory and are not verified, in the file itself and in your reply.",
    "Anything that can change (a date, price, amount, role, version, status) must be read from its latest source in this task before you state it as current, and you say where and when you read it. A remembered fact is not a current one.",
    "Don't invent what you weren't given: names, owners, dates, numbers, employers, quotes or sources. When a request needs a fact you don't have, say so plainly, mark it as a gap (\"not provided\", \"to be confirmed\") and carry on with what you do have; ask only when a wrong guess would waste the work.",
    "Older steps of a long task are condensed to make room, but the full record stays stored: when you need an exact command output, path, number or error from earlier, search it with task_recall instead of guessing it or doing the work again.",
    ...(spec.skillsDir ? ["For a web page, app or screen you build, load the ui-polish skill and apply its design pass before you call it done."] : []),
  ];
}
