# Super AI: the Claude Code engine, beside Work AI

Super AI runs a Work AI task on **Claude Code's agent loop** (Anthropic's Agent SDK) instead of the
DeepSeek Harness (DSH). It is a second engine behind the same product surface, built **plain** so the two
can be tested against each other and the better one chosen. Work AI is untouched.

## What is the same, what is different

| | Work AI (DSH) | Super AI (Claude Code) |
|---|---|---|
| Agent loop, system prompt, built-in tools, task list, skills, memory, compaction | DSH's, patched by us | Claude Code's own, unmodified |
| Models, quotas, usage metering, retries, window fitting | Aatmiq's gateway | **the same gateway** (a translating endpoint, below) |
| Task storage, files, task page, approvals, history, skills library | shared | shared |
| Web search and page reading | our SearXNG-backed tools | the same, as two in-process tools |
| Browser, documents, calculators and connectors | yes | **the same** (Work AI's own tool definitions, as an in-process MCP server; connectors as Claude Code's own MCP servers) |
| Acceptance checklist, independent reviewer, stages, office audit, edit repair, "check your work" nudges, plan-completion enforcement, context re-injection | yes (docs/19) | **no**: that is the point of "plain" |
| Context condensing | DSH's, with budgets from the model's window | Claude Code's own, set to the model's window (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`) |
| Where it runs | process or container | process only for now |

## How it is wired

```
Claude Code (a subprocess, as the task's own Unix user, HOME = the task's folder)
   │  ANTHROPIC_BASE_URL = <control url>/llm,  ANTHROPIC_AUTH_TOKEN = the task token
   ▼
POST /api/internal/work/llm/v1/messages          apps/api/src/routes/work-anthropic.ts
   │  Messages request → chat-completions request   apps/api/src/services/anthropic-compat.ts
   ▼  (loopback, with the task's own token)
POST /api/internal/work/llm/v1/chat/completions  the existing gateway route: model, quota, metering…
   │  OpenAI stream
   ▼  chat-completions stream → Messages stream (text, tool_use, usage, errors)
```

* The engine is `packages/harness/src/claude/engine.ts` (`createClaudeEngine`), the second implementation
  of `HarnessEngine`. `claude/map.ts` turns SDK messages into the neutral events and gives tools Work AI's
  names (Bash → `bash`, Edit → `edit`…), so the task page treats both alike.
* A task has `engine = "dsh" | "claude"` (migration 0028). The task service starts the right engine and, for
  `claude`, sets `plain`, which switches off the Work-AI-only behaviors in `services/work.ts`.
* **Claude Code is left as it ships.** Its own tools (shell, read, write, edit, subagents, questions, plan mode,
  worktrees, its task list, its tool search), its own skills, memory (`CLAUDE.md`, `.claude/` in the task's folder),
  settings and context compaction all run unchanged. The task's skill library is added beside Claude Code's own
  (`skills: "all"`), and the task's folder is its working directory.
* **What we add is only what connects it here:** the gateway and the task token; the model name (`aatmiq`, the
  gateway answers from the task's model whatever the name); the model's window, compaction point (75%) and output
  cap; a per-task Unix user and home; a Windows profile; telemetry, error reports and update checks off; our two
  private web tools (`web_search`, `web_fetch`), because Anthropic's hosted `WebSearch`/`WebFetch` can't work here;
  Work AI's browser, documents and calculator tools (`claude/tools.ts` adapts the definitions in `dsh-plugin/`, so
  there is one copy) and the task's connectors; and a short brief for this platform (whose product it is, check the
  work by running it and say plainly what was and wasn't checked, how to try a page in the browser, the limits).
* **Our tools are always listed** (`alwaysLoad`): Claude Code would otherwise put MCP tools behind its tool search, and a
  model can't use a browser it doesn't know it has.
* **Tools switched off** are only those that can't work in a task: `WebSearch`, `WebFetch`, `ScheduleWakeup`,
  `CronCreate/Delete/List` and `ReportFindings`.
* **Permissions** use `classifyRisk` (the same rules as Work AI) through the SDK's `canUseTool`. What Claude Code
  would ask in its terminal goes to the person's approvals list instead: risky commands, a change to a file outside
  the task's folder, and a plan from plan mode (`ExitPlanMode`, shown as "Plan ready for review"). `AskUserQuestion`
  has no dialog here, so the model is told to ask in its reply; the answer arrives as the next message.
* **Tuning without a code change:** `AATMIQ_CLAUDE_ENV='{"ENABLE_TOOL_SEARCH":"false"}'` on the server passes any
  Claude Code setting through to the task's process (not the gateway, token, home or PATH). Useful if a weaker model
  loses steps on tool search, which Claude Code uses by default to list its rarer tools only on request.
* A context that doesn't fit makes the gateway answer "prompt is too long: …", which Claude Code reads as
  its cue to condense and retry.

## Turning it on

1. Install the SDK where the server runs: in a checkout it is a dev dependency of `packages/harness`; in the
   production image build with `--build-arg SUPER_AI=true` (adds about 330 MB; off by default).
2. **Admin → Work AI → Super AI → Offer Super AI.** Off until then; the page also says when the SDK isn't
   installed. With it on, **Work AI → Super AI** has its own composer and task list (its tasks are not listed
   under Work AI's tasks, and the other way round).

## Requirements found by real use

* **A model window of at least 32,768 tokens.** Claude Code's own prompt and tool list take 10-18K tokens of every
  request, and it condenses at 75% of the window. On a 16K window (a model server's default) it condenses every few
  steps and gets nowhere: one task did so 16 times in an hour and wrote a single file. Super AI now refuses a model
  whose window is below this, with a message that says so (the create route and the task start both check). Set the
  model's context length in Admin → Models and make sure the model server really loads it (`ollama ps` at 100% GPU).
  64K or more is comfortable.
* **A real Windows environment.** On Windows the Claude Code process needs the system's variables and a profile
  (`APPDATA`, `LOCALAPPDATA`, `TEMP`, `USERPROFILE`); without `APPDATA` npm builds a corrupt install path and every
  `npm install` dies. The engine now passes the system's variables through and gives each task a profile of its own
  under its folder (`claude/engine.ts`, `windowsEnv`).
* **Tool calls that are valid JSON.** Open models often write a Windows path with single backslashes inside a tool
  call (`E:\GEM AI\...\files`): `\G` is not a JSON escape and `\f` is a form feed, so Claude Code refuses the call
  ("could not be parsed as JSON") or runs the wrong path. The gateway endpoint now repairs such arguments (a string
  holding a drive path is read with literal backslashes) and sends each call's arguments whole when its block closes.
* **Replies that fit the output limit.** One reply holds a quarter of the window (8,192 tokens at 32K). A big file
  written in one tool call is cut off and the call is lost; Claude Code reports "exceeded the output token maximum"
  and stops. Super AI's brief now says how much a reply holds and to write long files in parts, and a task that hits
  the limit is told once more (up to the usual continuation limit) before it fails with a plain message.
* **A provider without a small per-minute token cap.** A plan limited to 8,000 tokens per minute (a free tier) refuses
  Claude Code's first request outright (HTTP 413). The gateway reports the provider's own words for it.

## What live runs taught (2026-11-05)

The expense-tracker brief ("open it straight from a folder, no server") on Nemotron 3 Super and Ultra:

* Both shipped a page that does nothing when opened from the folder: the scripts were JavaScript modules, which
  browsers block on `file://`. Neither model opened the page; both said everything was verified. Ultra did write and
  run 24 real unit tests (Super ran none).
* Causes in the harness, now fixed: Super AI had **no browser** (Work AI's browser, documents, calculators and
  connectors were never wired in); the browser serves the folder over `http://task.local`, where modules and
  `fetch` work, so even a browser check **couldn't see the bug** (it now warns about both, for Work AI too); and
  `curl http://localhost:…` to try its own test server counted as **network**, so one run asked for 11 approvals
  (a request that only reaches this computer no longer asks; anything that could reach elsewhere still does).
* With the browser, Ultra opened the page 7 times, followed the module warning (plain scripts now) and clicked through
  every feature. The page still crashed when opened from the folder: it wrote a fallback for `crypto.randomUUID` that
  calls itself. The browser's `http://task.local` was not a secure page, so `crypto.randomUUID` was missing there and
  only the fallback ran; from `file://` it exists and the broken branch runs. The browser now treats the folder's pages
  as secure, like a file opened from the folder. `browser_upload` also accepts a full path inside the folder.

## Expense tracker, both engines on the fixed browser (2026-11-05)

Same brief, Nemotron 3 Ultra, run one after the other on the same server, then each app opened from the folder
(`file://`) and used by a script: add three expenses, a negative amount, totals and bars, reload, a category filter,
CSV export, a CSV import with two bad rows, delete, a 375 px window.

| | Work AI (DSH, checklist + reviewer) | Super AI (Claude Code) |
|---|---|---|
| Time | 13 min 13 s | 5 min 30 s |
| Input / output tokens | 8.88 M / 47 K | 2.15 M / 16 K |
| Approvals asked | 2 | 1 |
| Browser actions | about 90 | about 40 |
| Works opened from the folder | yes, no script errors | yes, no script errors |
| Add, reject negative, totals, bars, reload, filter, export, import (skipped 2), delete | all pass | all pass |
| Phone width (375 px) | **fails**: the table runs out of its card, the page scrolls sideways, category and delete are cut off | passes (the table scrolls inside its box) |

The first round on the old browser: Work AI's app worked (one wrong skipped-row count); Super AI's crashed from the
folder. With the browser fixed (secure folder pages, module and fetch warnings, uploads by full path), Super AI built
a working app in less than half the time and a quarter of the tokens, and Work AI's extra checking did not catch the
phone layout. One run each: read it as a direction, not a verdict.

## Three briefs, both engines, Nemotron 3 Ultra (2026-11-05)

Each output was opened and used the way a person would (apps and games from the folder, `file://`; office files
through `office_audit.py`), not judged from the engines' own reports.

| Brief | Work AI (DSH, checklist + reviewer) | Super AI (Claude Code) |
|---|---|---|
| Expense tracker | works; phone layout broken (table overflows). 13 min, 8.9 M tokens in | **works, phone layout fine**. 5.5 min, 2.1 M |
| Northwind office pack | **0 audit failures** (8-page report, 12 slides with notes, 1,147 formulas); reviewer 25/25. 49 min, 14.0 M | 1 failure (report 13 pages, 5-9 asked) and stopped mid-fix ("Let me try a different approach…"). 15 min, 1.45 M |
| Ridge Riders game | **playable**: menu, level select, driving with HUD, results; but the car tips over on the first hill at ~41 m every time and the camera doesn't keep it in view. 71 min, 50.5 M | **not playable**: Play by mouse throws `camera is not defined`; by keyboard the level ends "CRASHED · 0 m" at once. Never opened the game in the browser (it had the tool). Honest TESTING.md (14 items NOT CHECKED). 18.5 min, 2.1 M |

* Small apps: Super AI is as good or better, at a fraction of the time and tokens.
* Long, many-part deliverables (a 3-file office pack, a 19-file game): Work AI's checklist, stages, reviewer and
  "not finished" nudges are what get the job over the line. Super AI ends early: it stops after a sentence that
  announces the next step, and on the game it never tried what it built.
* Cost: Work AI used 4x to 24x more input tokens than Super AI on the same brief.
* Gap found in Super AI (plain): an answer that ends on "let me …" ends the task; Work AI resumes it. Not added,
  to keep Super AI as Claude Code ships.

## License: read before shipping

Claude Code and the Agent SDK are **not open source**. Their license is "All rights reserved. Use is subject
to Anthropic's Commercial Terms of Service"
([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)). Running Claude Code in a
product requires agreeing to those terms and, among other conditions, keeping the binary unmodified, not
removing or restricting its built-in authentication methods, and not intermediating Claude usage; the
product keeps its own branding. The public text does not say whether the SDK or its native program may be
redistributed in an on-prem or offline bundle, or whether pointing it at your own gateway and non-Claude
models is allowed in a product. Until Anthropic answers those in writing, treat Super AI as an
**evaluation feature**: off by default, not in the default image, loaded only when a task starts. Open
questions to put to Anthropic are in the answer to "Instead of dsh I can use claude code harness?"
(session notes) and summarized in `docs/decisions.md` (D52).

## How to compare the two

`scripts/engine-compare.mjs` runs one brief on Work AI and then on Super AI with the same model, approves what the
task asks for, saves each run's timeline and files, and writes a side-by-side `summary.md` (Node 22, nothing to
install). The briefs used so far are in `scripts/briefs/` (a small primes task, the expense tracker, the Northwind
Q3 pack, Ridge Riders).

```bash
export AATMIQ_EMAIL=you@example.com AATMIQ_PASSWORD='…'      # never saved or printed
export AATMIQ_URL=http://localhost:4000 AATMIQ_ORIGIN=http://localhost:3000
node scripts/engine-compare.mjs --prompt-file scripts/briefs/primes-smoke.md --model main
node scripts/engine-compare.mjs --prompt-file scripts/briefs/northwind-q3-pack.md --model main \
     --audit notes,toc,page_numbers,header_title,pages:5-9,slides:10-12,charts:2,formulas:10
```

`--audit` runs the document audit on any Excel, PowerPoint and Word files each engine made. Super AI has to be
on (Admin → Work AI → Super AI) and installed. `--engine dsh` or `--engine claude` runs just one.

Judging: run the same brief on both, with the same model, from the two tabs, and judge the outputs the same way
(open the files, read the pages; for documents `packages/skills/library/document-checks/scripts/office_audit.py`
is the shared yardstick). Briefs used so far: the Northwind Q3 pack (Excel + PowerPoint + Word that must
agree) and the Ridge Riders game. Things to record per run: time, tokens, tool calls and tool errors,
whether it finished or stopped early, what a person finds wrong, and what it claimed that was not true.

## First measurements (2026-11-04)

One brief (the Northwind pack), one model (Nemotron 3 Super, Auto's pick), one run each, judged with the same
`office_audit.py` and the same requirements (notes, contents field, page numbers, header title, 5-9 pages,
10-12 slides, 2 charts, formulas). Small samples: read them as a first look, not a verdict.

| | Work AI as first built (plain DSH) | Super AI (plain Claude Code) | Work AI with all its additions |
|---|---|---|---|
| Time | 6.3 min | 6.6 min | 71 min (4 review rounds) |
| Input / output tokens | 3.63 M / 57 K | 3.87 M / 74 K | not comparable |
| Audit failures | 10 | 6 | a few (and a reviewer found formula bugs the audit then learned to catch) |
| Speaker notes | 0 of 11 | 4 of 11 | 11 of 11 |
| Native charts in the deck | 2 | 4 | 3 |
| Report | 12 pages, typed contents | 5 pages, typed contents, no page numbers | 6 pages, real contents field |
| What its final answer said | "all verified" (not true in places) | listed what was not met, candidly | "30 of 36 requirements met", rest named |

* Plain Claude Code did somewhat better than plain DSH on this brief and was more candid about what it had not done. It
  did not use the skill library (no `document-checks`, no `outline_to_pptx.py` charts), which is the main reason it
  still fails the audit. Work AI's additions (checklist, reviewer, audit loop) are what closed most of the gap,
  at a large cost in time.
* Claude Code's own prompt and tool definitions are large: about 17,800 input tokens per request here (53K for a
  three-step task). On a 32K window that leaves little room; Work AI's DSH setup is much smaller.
* A real, correct small task (a primes script, run and explained) took 15.6 s on Super AI.

What to try next: the same two engines with the same additions (give Super AI the checklist and reviewer through
the engine-neutral task service), on a bigger model, and on the Ridge Riders brief.
