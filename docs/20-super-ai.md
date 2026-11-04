# Super AI: the Claude Code engine, beside Work AI

Super AI runs a Work AI task on **Claude Code's agent loop** (Anthropic's Agent SDK) instead of the
DeepSeek Harness (DSH). It is a second engine behind the same product surface, built **plain** so the two
can be tested against each other and the better one chosen. Work AI is untouched.

## What is the same, what is different

| | Work AI (DSH) | Super AI (Claude Code) |
|---|---|---|
| Agent loop, system prompt, built-in tools | DSH's, patched by us | Claude Code's own (shell, read, write, edit, subagents, plan) |
| Models, quotas, usage metering, retries, window fitting | Aatmiq's gateway | **the same gateway** (a translating endpoint, below) |
| Task storage, files, task page, approvals, history, skills library | shared | shared |
| Web search and page reading | our SearXNG-backed tools | the same, as two in-process tools |
| Browser, documents and calculators tools | yes | not in this first version |
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
* Approvals reuse `classifyRisk` (the same rules) through the SDK's `canUseTool`; a path outside the task's
  folder is refused; a reviewer-style task is refused instead of asked.
* Claude Code is told every model is called `aatmiq`; the gateway answers from the task's model whatever the
  name. Tool search is switched off (every tool is listed from the first request: weaker models lose steps
  on a "find the tool" indirection), as are telemetry, error reports, update checks and Anthropic-hosted
  search and fetch. Tools that don't fit a task product (cron, worktrees, peer messages, workflows, asking a
  question nobody can answer) are disabled.
* A context that doesn't fit makes the gateway answer "prompt is too long: …", which Claude Code reads as
  its cue to condense and retry.

## Turning it on

1. Install the SDK where the server runs: in a checkout it is a dev dependency of `packages/harness`; in the
   production image build with `--build-arg SUPER_AI=true` (adds about 330 MB; off by default).
2. **Admin → Work AI → Super AI → Offer Super AI.** Off until then; the page also says when the SDK isn't
   installed. With it on, **Work AI → Super AI** has its own composer and task list (its tasks are not listed
   under Work AI's tasks, and the other way round).

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

Judging: 
Run the same brief on both, with the same model, from the two tabs, and judge the outputs the same way
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
