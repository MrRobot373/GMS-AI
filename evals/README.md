# Evals: the behaviors our agents must keep

One folder per behavior, each with a test that says pass or fail **per criterion**. Run the same tasks on Work AI and
Super AI, with the same model, and compare. The format is borrowed from Kortix's `evals/` (Elastic License 2.0: the
idea only; every task here is our own), and the lesson from Harness² (Apache 2.0): to improve a harness you need
something that says whether a change helped.

```bash
# What the tasks are
node scripts/eval-run.mjs --list

# Grade the graders (no server, no model): the reference solutions must pass, the known-bad samples must fail
pnpm eval:selftest        # and: pnpm eval:test

# A real run
export AATMIQ_EMAIL=you@example.com AATMIQ_PASSWORD='…'          # never saved or printed
node scripts/eval-run.mjs --engine both --model main --judge-model main --attempts 3
node scripts/eval-run.mjs --task office,folder-page-works --engine dsh      # ids, categories or tags
```

Output goes to `eval-out/<time>/`: `summary.md` (a table), `results.json`, and for each attempt its `events.json`,
`files/` and `grade.json`.

## A task

```
evals/tasks/<id>/
  task.json        id, category, tags, timeoutSec, requires, criteria {name: one sentence}, judged [names]
  instruction.md   exactly what the person asks (this is the whole prompt)
  grade.mjs        export default async (ctx) => ({ criterion: true | false | { pass, note } })
  solution/        a reference answer: answer.md, files/ (or make.py for .xlsx/.docx/.pptx), events.json
  broken/<name>/   known-bad work with expect.json {"fail": ["criterion", ...]}
```

A grader gets `ctx`: `answer` (the final reply), `files()` / `read()` / `exists()`, `toolCalls(/regex/)`, `run(cmd, args)`,
`page(file, async ({ page, errors }) => …)` (a real browser opening the file **from the folder**), `audit(files, require)`
(the document audit), and `judge()` for criteria a program can't check.

## Rules that keep the scores honest

* **A grader that cannot run is an error, never a 0.** No browser, no judge model, an outage at the provider: the row
  says `error` and stays out of the pass rate, so a broken environment can't lower a score. Throw `EvalError` for that.
  A task that doesn't apply here (no web search) throws `Skip`.
* **Every task has a solution and, where it matters, known-bad samples.** `pnpm eval:selftest` runs them. A grader nobody
  has seen pass (or fail) is a lie in every score after it. `folder-page-works/broken/modules` is the bug the expense
  tracker and the game shipped: a page whose scripts are JavaScript modules does nothing when opened from the folder.
* **One judge model for every run** (`--judge-model`): scores from two judges don't compare. The judge runs through the
  platform's own chat, so no key is needed here. It judges only what a program can't: an honest "I can't send email", a
  question asked instead of a guess. Everything else is checked by code.
* **Score each criterion, pass a task only when all pass.** The table shows which criterion failed, so a fix can be aimed.
* **Say what is not measured.** Errors and skipped tasks are listed, not hidden.

## Adding a task

Add one for every behavior an agent must keep, and for every bug fixed in it. Write the instruction as a person would.
Check with code wherever you can; judge only the rest. Write `solution/` and one `broken/` sample first, run
`pnpm eval:selftest`, and only then run it on an agent.

## What the first tasks cover

| Category | Tasks |
|---|---|
| answer, data | `quick-answer`, `order-totals` |
| coding | `median-script`, `fix-the-bug` (run it before saying it works) |
| extraction, honesty | `meeting-actions`, `grounded-gaps`, `missing-attachment` (no invented owners, dates, facts or files) |
| judgment | `ask-when-ambiguous`, `no-fake-send` (never claims an email it can't send) |
| ui | `folder-page-works` (opens from the folder, tried in a browser) |
| office | `xlsx-budget`, `memo-docx`, `deck-six-slides` (checked with `office_audit.py`) |
| research | `cite-sources` (needs web search) |

## Not here yet

* The public benchmarks that Harness² runs (JobBench, LAB, WorkBuddy-Bench). Their data keeps its own licenses: read them
  before adding any.
* A harness-tuning loop (propose a prompt edit, run these tasks, keep what wins). It needs these tasks first.
