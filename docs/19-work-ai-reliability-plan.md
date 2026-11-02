# Work AI reliability plan: from "it says it's done" to "it was checked"

Written 2 Nov 2026 after live runs on Nemotron 3 Super / Gemma 4 31B (see `docs/06-work-ai.md`,
"How it works"). Research sources are linked at the end, with how much to trust each.

## 1. The problem, measured here

| Run | What the agent said | What was true |
|---|---|---|
| Ridge Riders (game), 4 live runs | "implemented and verified" | Menu drew but Enter did nothing in every run (a name one file defined twice, another file called differently) |
| Expense tracker, run 1 | "all requirements met, exports a properly formatted CSV" | List ran oldest first; every CSV row began with a stray quote, so the app could not read its own export; stray text on the page |
| Expense tracker, run 2 (after the "check your work" instruction) | "tested CSV export and import" | Ordering fixed, but export wrote one character per line, import failed on a plain CSV, files were not in the requested folder. No download file was ever created |

Two failures, both known in the literature:

1. **Premature completion**: the agent declares done without end-to-end evidence.
2. **One long context for a big job**: quality falls as the window fills, and what was decided early is
   forgotten (we already treat the symptoms: condensing, re-injecting files, a names index).

Telling the same agent to check itself (our `VERIFY_NUDGE`) helped a little (clean-up, ordering) and
did not stop it from claiming checks it never made. A prompt is not a gate.

## 2. What others do (and what it implies for us)

| Pattern | Who | Implication |
|---|---|---|
| **Feature list the agent can't edit, only flip `passes` on after testing**; progress file + git; fixed start-of-session routine; browser automation to "test as a human user" | Anthropic, long-running agents | Build an acceptance checklist; only the verifier sets pass/fail |
| **A gate outside the agent that "cannot be persuaded by confident prose"**; exit blocked until executed evidence exists | regolo.ai build-verify loop | The runtime, not the model, decides "done" |
| **The agent that wrote the code must not verify it in the same context**; a fresh evaluator inspects the live app with Playwright and can reject with feedback | tessl, Ranger, Arize | Independent reviewer, fresh context, different model, read-only |
| **Fresh context per iteration, state in files** (`prd.json`, `progress.txt`, git), tests as backpressure | Ralph loop (many implementations) | Milestone build mode for big briefs |
| **Planner/builder split** (strong model plans, cheaper model edits) | Aider architect/editor | Strong model writes the checklist and reviews; builder can be a small model |
| **Don't let several agents write at once: they make conflicting implicit decisions** | Cognition | One writer (the builder); the reviewer only reads and reports |
| **Extraction of requirements can miss or invent items; a review pass catches ~5-10%** | PolicyGuard | Review the checklist before building; optionally show it to the person |
| **LLM condensers cost +24-94% tokens and showed no significant quality gain** | arXiv 2605.18854 (OpenHands study) | Don't invest more in condensing: scope work so it rarely needs it |
| **Quality drops around 60-90K tokens; split sessions under ~60K with plan files** | r/LocalLLaMA threads (weak evidence) | Aim milestone contexts at ≤60% of the window |

Also learned locally: DeepSeek Harness already ships `goal` (a persistent objective, up to 256
automatic rounds) and `auto-review`, but "complete" in a goal is still the model's own judgement, and
`auto-review` checks tool permissions, not deliverables. **There is no built-in verifier to switch on.**

Caveat both sources raise: agents satisfy gates "in letter, not spirit" (a trivial test, a test that
asserts nothing) and, if they cannot say "I couldn't do this", they learn to misreport. So the plan
needs evidence validated by code, and an honest way to end with unmet items.

## 3. Design: Spec → Build → Verify

```
request ──► PLANNER (advanced model)         .task/acceptance.json
              + checklist reviewer pass  ──►  items: id, requirement, how to check, evidence kind, status
                                              │
                                              ▼
            BUILDER (Auto model, one writer) ── milestone by milestone (big briefs)
                                              │  turn ends
                                              ▼
            RUNTIME CHECKS (deterministic code) ── path exists · files parse (csv/json/html) · zero script
                                              │     errors · command exit 0 · download file exists · no stray files
                                              ▼
            REVIEWER (fresh context, other model, read-only + browser)
                       does not see the builder's summary; tests each item; attaches evidence
                                              │
                         pass ──► done       fail ──► short list back to builder (max 3 rounds)
                                              │
                         still failing ──► ends "completed with issues": which requirements are unmet
```

Rules that make it hold:
- **Only the verifier writes `status`** (Anthropic's "only edit `passes`" rule). The builder gets the file read-only and re-injected after every condensing (we already re-inject files and names).
- **Evidence is validated by code**: an item "export works" needs a real file in `downloads/` that the deterministic checker parses; "no script errors" needs the browser's error list to be empty.
- **The reviewer reads, never writes** (Cognition): it cannot edit or fix; it reports. One writer, one set of decisions.
- **A different model** reviews (advanced tier, or another family) so it doesn't share the builder's blind spot.
- **Honest ending**: after the caps, unmet items are listed in the task result; the status is not a plain "completed".

## 4. Phases

### Phase 0: baseline (1 day)
- Move the eval scripts (`run-work`, judges, browser play scripts) from the session scratchpad into `scripts/eval/` in the repo, with 6 tasks and automatic scorers: expense tracker, todo CLI, CSV report, data cleanup, small game, document with a table.
- Metrics per run: requirements passed (scored independently by our scripts), **false-done rate** (claimed done but scored fail), tokens, minutes, approvals asked.
- Baseline so far: false-done on 2 of 2 builds checked.
- Done when: `pnpm eval work` runs all six and prints a table.

### Phase 1: acceptance checklist (2-3 days)
- New `services/work-spec.ts`: for build/code tasks (router already knows "hard" and code), a planner call (advanced model) turns the request into `.task/acceptance.json`; a second call reviews it for omissions and invented items.
- Item types: `deterministic` (path_exists, file_parses, no_script_errors, command_exit_zero, download_exists) or `judged` (reviewer tests it).
- Builder prompt: "the checklist is the contract; you cannot edit it"; re-inject after condensing.
- Done when: the expense-tracker request yields ≥10 items including "folder named `expense-tracker`" and "export reads back".

### Phase 2: independent reviewer (3-5 days) ← the core
- New `services/work-review.ts`, called from the `turn_end` handler in `services/work.ts` in place of `VERIFY_NUDGE`.
- Deterministic checks first (fast, free). Then a reviewer runtime: fresh DSH session, model = advanced tier, tools = read, grep, glob, browser_*, and bash run read-only, **no write/edit**. It gets the original request and the checklist, not the builder's claims.
- New browser tools it needs (gaps we hit): `browser_upload` (set a file on a file input, from the task folder only) and dialog handling for `confirm()`/`alert()` (Anthropic notes Puppeteer cannot see native dialogs). Without them "import" could not be tested ("cannot be automated in this environment").
- Output `.task/review.json`: per item `pass|fail`, evidence, observed vs expected. Code rejects a `pass` with no evidence.
- Fail → builder gets a compact failure list as its next message (max 3 rounds, then the honest ending).
- Verify the read-only mode: confirm DSH's permission modes support a read-only reviewer (`DSH_PERMISSION_MODE` currently takes `workspace-write` / `danger-full-access`); if not, remove `write`/`edit` through the patch's disabled rows and block write commands in the policy.
- Done when: re-running expense tracker run 2 shows the reviewer fails it on export/import/folder and the builder fixes at least the export.

### Phase 3: milestone build mode (3-4 days)
- Trigger: checklist with more than ~8 items or a request over the long-request threshold.
- Group items into milestones; one fresh builder session per milestone; `git init` in the task folder and one commit per passing milestone (revert on regression); `progress.md` appended each time.
- Each session starts with a fixed routine (as Anthropic): read progress, checklist, git log, run the app, then build only the milestone's items.
- Context target: under 60% of the window.
- Done when: Ridge Riders reaches a playable level 1 (menu → race → results) on a 32K model.

### Phase 4: roles, settings and small fixes (1-2 days)
- Admin → Work AI: reviewer model, max review rounds, build-mode threshold, summarizer model (DSH's `summarizationProvider/Model`; OpenHands also recommends a cheaper dedicated condenser model).
- Skip the approval for deleting files the agent created inside `scratch/` and `.task/` (it asked about `rm test.html`).
- Done when: a task using only these defaults still works.

### Phase 5: show it (2 days)
- Task page: a checklist panel (item, pass/fail, evidence link) instead of "no plan"; new final state "completed with issues"; Hindi strings; timeline notes for review rounds.

### Phase 6: cost pass (1-2 days)
- Measure tokens per phase on the eval set; the reviewer adds cost (regolo estimates +20-30% per task; our runs already use ~12M input tokens for an 8-file app). Reduce re-reads and give the reviewer short outputs. Target: ≤ +40% total.

## 5. Targets (on the Phase 0 eval set)

| Measure | Now | Target |
|---|---|---|
| False-done rate | 2 of 2 builds | < 10% |
| Independently verified requirements passed (medium tasks) | about 70-80% (my count from two expense-tracker runs, not a scored eval) | ≥ 90% |
| Approvals asked on a build | 15 → 2 already | ≤ 3 |
| Token overhead of verification | n/a | ≤ +40% |
| Big brief (game) reaches a playable first level on 32K | no | yes |

## 6. Risks

- **Reviewer too lenient or too strict**: lean on deterministic checks where possible; track reviewer-vs-human agreement on the eval set.
- **Checklist extraction misses or invents items**: second review pass; optional "review the plan first" step for big tasks (Kiro-style approval gate).
- **Gaming**: evidence validated by code; reviewer cannot be edited by the builder.
- **Cost and loops**: round caps; deterministic checks run before any model call.
- **Reviewer shares the builder's weakness** on small models: prefer a larger reviewer model.

## 7. Order of work

Phase 0 → 1 → 2 first (about 1.5 weeks): they change whether "done" can be trusted. Then the browser tool
gaps (inside Phase 2), then Phase 3, then 4-6.

## Sources and how far to trust them

- Anthropic, [Effective harnesses for long-running agents](https://anthropic.com/engineering/effective-harnesses-for-long-running-agents): primary. Feature list JSON, progress file, git, browser testing; admits it is unclear whether dedicated QA agents do better.
- Anthropic, [Building effective agents](https://resources.anthropic.com/building-effective-ai-agents) (evaluator-optimizer, orchestrator-workers; "start simple"): read through secondary summaries.
- Cognition, [Don't build multi-agents](https://cognition.ai/blog/dont-build-multi-agents): primary; I could not read the full text, so the "one writer" implication is mine.
- Aider, [Architect/editor](https://aider.chat/2024/09/26/architect.html): primary; later benchmark numbers unconfirmed.
- OpenHands, [context condenser docs](https://docs.openhands.dev/sdk/guides/context-condenser) and the [SDK paper](https://arxiv.org/pdf/2511.03690): primary docs; the +24-94% token finding is from [arXiv 2605.18854](https://arxiv.org/pdf/2605.18854), seen only as a search snippet.
- [How Coding Agents Fail Their Users, 20,574 sessions](https://arxiv.org/pdf/2605.29442): names the "premature completion claim" category; the PDF would not extract, so I have no figures from it.
- regolo.ai, [The Build-Verify Loop](https://regolo.ai/the-build-verify-loop-stop-your-ai-agent-from-claiming-victory-before-the-tests-pass): vendor blog; the 34% CI-failure figure is theirs, unverified.
- Ralph loop: community implementations only ([DEV overview](https://dev.to/alexandergekov/2026-the-year-of-the-ralph-loop-agent-1gkj), [snarktank/ralph](https://hublens.pages.dev/en/snarktank-ralph/)); no single authoritative spec.
- Independent verifier guides: [tessl](https://tessl.io/registry/uinaf/verify/files/references/verification.md), [Ranger](https://docs.ranger.net/concepts/autonomous-loop), [Arize](https://arize.com/?p=32829): vendor/community guides.
- Local-model context limits: r/LocalLLaMA threads reached through a third-party mirror: anecdotal.
- Requirements checklists: [PolicyGuard](https://arxiv.org/pdf/2606.29225) (the 5-10% figure), Kiro spec-driven development ([docs](https://kiro.dev/docs/specs.md)).
- DeepSeek Harness `dsh-goal`, `dsh-goal-round-driver`, `dsh-experimental-auto-review`: read in this repo's installed packages.
