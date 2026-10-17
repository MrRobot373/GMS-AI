# GEM AI: status and plan (17 October 2026)

**Summary.** The engine, Chat, Work AI and Code are built and tested. So are the three GEM AI modules: Learning, Calculators and Knowledge. That is about ten weeks ahead of the spec's build plan, which starts on 19 October. On HEAD `9c61ae2`, CI run 39035614408 passes: 305 API tests, 118/118 product checks, 32/32 Work AI checks and 26/26 Hindi checks. The live smoke test passed 22/22 against real models. The weeks freed up should go to the work that is still open. Some of it is proof: scale tests, an evaluation set, a restore drill and a review of the lessons. The rest is a short list of fixes. A few calculator tools still give wrong numbers (the root solver, decimal to fraction, the limit tool), some beta calculators show invalid results, and admins can read project material they are not members of. Two §15 gates have nothing behind them yet: 10,000 searchable pages, and 24 of 30 questions with the right evidence in the top 5. There is no corpus, no embedding model has ever been used and no evaluation set exists. **The 25 December release looks on track if** the calculator and access fixes land in October and the Knowledge scale work starts on 16 November as planned. The plan below uses about 40 of the 45 working days, so most P2 items will not fit.

How to read priorities: **P0** blocks the release (§14 or §15). **P1** is needed for December. **P2** should be done if there is time. **P3** is for later. Effort uses the audits' sizes. For planning I read them as: S = about a day or less, M = two to four days, L = one to two weeks, XL = longer. These are rough.

## Where each part stands

Counts are per audit item. Items fixed on 17 October count as done. Some items appear in more than one audit; restore, for example, appears in five. "Other" means a deviation from the spec, an unverified item, or an item out of scope for December.

| Area | Done | Partial | Missing | Other | State in one line |
|---|---|---|---|---|---|
| Engine: sign-in, models, Auto, budgets, chat (§1–§5) | 26 | 10 | 1 | 4 | Built and tested. Gaps are small: branding strings, prompt logging, Word export with maths, Work AI pausing at the token limit. |
| Engine: documents, Work AI, Code, admin, ops, licence, build (§6–§11) | 28 | 13 | 1 | 4 | CI and Nightly are green. Open: admin read access to projects, no vector index, no retry for in-process jobs, version and upgrade path. |
| Learning (§12) | 16 | 18 | 3 | 2 | Works end to end. Missing evidence: 5 reviewed topics, 20 real video IDs, a course restore. |
| Calculators against the spec (§12, §14) | 20 | 7 | 0 | 1 | All 20 verified, 101 golden cases pass. Open: list fields, 182 beta calculators on by default. |
| Calculator plan (the big .NET plan) | 7 | 29 | 1 | 5 | Wide coverage. Most gaps are breadth (P3). Three tools still give known wrong numbers (P0). |
| Knowledge (§12, §15) | 10 | 17 | 4 | 3 | Correct on small data. Nothing at scale: no corpus, no embedding run, no evaluation set. |
| Integration, blockers, schedule (§13–§17) | 15 | 14 | 3 | 6 | Sidebar, session and chat tool are done. Open: no shared project switcher, no browser tests for the GEM pages, export leaks citation text. |
| **Total** | **122** | **108** | **13** | **25** | |

Unverified, with no evidence either way:
- Real identity providers. SSO and SAML were tested only against mock providers (ENG-13).
- In Code, installing an extension from Open VSX, and the debugger (COD-01).
- The connector check against real services, which was not run (WRK-09).

## Done

### Engine: product, people, models, chat (§1–§5)
- One sign-in and one sidebar for all eight sections (ENG-01): `sidebar.tsx:313-330`.
- First-run setup, email and password, email confirmation, reset links (ENG-04, ENG-09): `api.test.ts:96`, `account.test.ts:164`.
- Organization, workspace, project and group, with a workspace switcher (ENG-05): `groups.test.ts:96`.
- Roles enforced in the API; only the owner manages the licence (ENG-06): `shared.test.ts:14`, `authz.test.ts:229`.
- Sections per person, including the three modules; no Learner role (ENG-08): `permissions.ts:16-25`, `0022_gem_ai.sql:130`.
- Two-step sign-in with backup codes, "required" with a grace period, a device list with sign-out (ENG-10, ENG-11): `account.test.ts:225-391`.
- SSO with Google, Entra, OIDC and SAML, including the provider's app tile and auto-join by domain (ENG-12): `sso.test.ts`, `saml.test.ts:259`. Mock providers only.
- Invitations one by one or in bulk; SMTP settings (ENG-15): `account.test.ts:124`.
- English and Hindi, 1977 of 1977 strings translated (ENG-17): `check-i18n.mjs`, `i18n.test.ts:118`.
- Themes, logo, accent colour, illustrations switch (ENG-18): `branding.test.ts`.
- Read-only when the licence is inactive; development mode without a key (ENG-19): `license.test.ts:134-160`.
- One gateway checks and meters every call, including Learning and Knowledge (ENG-20): `chat.ts:297-313`, `learning.ts:123-145`.
- Providers with keys encrypted at rest, discovery, demo model only when allowed (ENG-21): `api.test.ts:288`.
- Auto routing with rules, the judge model, tiers, and thinking only for hard questions (ENG-22): `router.test.ts`. Live: a greeting went to the fast tier and a hard question to the advanced tier.
- GPU lineup documented (ENG-23): `deploy/docker-compose.gpu.yml:10-18`.
- Budget split evenly, per-person overrides, group budgets, token requests, no auto-approval (ENG-24, ENG-25): `api.test.ts:171-215`.
- Chat maths rendering with KaTeX, including `\(…\)`, `\[…\]` and `|` inside table formulas (ENG-29). **Fixed 17 Oct** in `984c2f3`.
- Chat composer and custom-instructions hint use the organization's product name (part of ENG-03). **Fixed 17 Oct.**
- History, rename, pin, archive, delete, ⌘K search (ENG-30); edit and branch, regenerate, temporary chats (ENG-31): `api.test.ts:591-744`.
- Numbered citations with Confirmed, Assumption and TBD labels (ENG-33): `api.test.ts:751`.
- Moving a chat into a project, project instructions win, retention purge (ENG-35, ENG-36): `api.test.ts:493`, `:729`.
- Work AI asks the model again after an empty or thinking-only reply, then fails with a clear message (ENG-38). **Fixed 17 Oct**: `work-internal.ts`, `work.test.ts:365`.

### Engine: documents, projects, Work AI, Code, admin, ops, licence, build (§6–§11)
- Document scopes and read rules (DOC-01): `documents.ts:149-158`, `api.test.ts:380`.
- A new version replaces the old one in answers (DOC-06): `api.test.ts:751`.
- Project sources, memory, sharing, and tasks inside projects (PRJ-01 to PRJ-03): `api.test.ts:493-580`, `work.test.ts:567`.
- The agent engine sits behind `packages/harness` (WRK-01). It is pinned to `@deepseek-ai/dsh 0.2.0-rc.2`, a release candidate.
- Task timeline, approvals and badge (WRK-02); approval modes and risk rules (WRK-03): `policy.mjs:9-68`.
- Tools: files, shell, SearXNG search, browser, documents, skills, connected apps (WRK-04): `tools.test.ts`, `browser.test.ts`.
- Per-task isolation. Container mode passed 6/6 in Nightly 38978985684 (WRK-05).
- Schedules (WRK-07), 59 built-in skills (WRK-08), 45 connectors (WRK-09), privacy and metering (WRK-12).
- Real-model Work AI run passes (WRK-11): `smoke-run.log` shows "PASS [work] … D 0.4 -> 19.20".
- Code IDE: Nightly Code suites 13/13 and 14/14. The panel agent ran with a real model and wrote `rc.py` (COD-01 to COD-03).
- Admin screens, health monitor, background jobs (ADM-01, ADM-02, OPS-01): `health.test.ts:136`, `jobs.test.ts`.
- Origin check and rate limits (SEC-01): `app.ts:178-190`.
- Signed licence keys, check-ins with counts only, licence server and console. Nightly licensing suite 21/21 (LIC-01 to LIC-03).
- Monorepo with 47 tables and 24 migrations (BLD-02); CI green on every push (BLD-03); Nightly has run (BLD-04).

### Learning
- Topic and level are validated; an empty topic is refused (LRN-01): `learning.test.ts:54-59`.
- The outline and then each lesson are written and stored. Opening a course never regenerates it (LRN-02): `learning.test.ts:99-110`.
- Regenerating keeps the previous version, and progress survives (LRN-03): `learning.test.ts:147-163`.
- Every lesson has parts 1, 2, 3, 5, 7 and 9, checked by a schema with one repair retry (LRN-05, LRN-22): `gem.ts:94-125`.
- Videos come only from IDs the API returns; removed videos drop out; searches are cached (LRN-09, LRN-14, LRN-15). Tested against a fake API only.
- Save, bookmark, mark complete, resume, and courses survive sign-out (LRN-11, LRN-19, LRN-29): `learning.test.ts:181-189`.
- Owner-only access, even for admins (LRN-20): `learning.test.ts:191-203`.
- Goes through the gateway and the person's budget, and can be switched off (LRN-23, LRN-25).
- More link forms are stripped, and lesson Markdown never renders links (LRN-12). **Fixed 17 Oct**: `gem.ts:59-71`, `math-markdown.tsx:36-39`, `shared.test.ts`.
- Lesson maths rendering (LRN-27). **Fixed 17 Oct** in `984c2f3`.

### Calculators (spec)
- The 20 release calculators exist with the spec's names: 4 basic, 5 electrical, 4 electronics, 4 power electronics, 3 mechanical (CALC-01): `core.ts:643-664`.
- Each definition has inputs, formula, units, validation and assumptions (CALC-02): `registry.ts:121-143`.
- 101 golden cases. All 212 expected outputs were recomputed independently with 0 mismatches. 805 package tests pass (CALC-04, CALC-05).
- NaN is an error, not skipped (CALC-07). **Fixed 17 Oct**: `run.ts:44`, `core.test.ts:83-87`.
- RMS V and I (single- and three-phase) and transformer Vp and Ip must be ≥ 0 (CALC-08). **Fixed 17 Oct**: `core.test.ts:140-146`.
- Strict number reading on the formula screen and the unit converter (CALC-09). **Fixed 17 Oct**: `readNumber` in `run.ts:156-163`.
- A unit of the wrong quantity, extreme numbers, division by zero and non-finite results are all errors (CALC-10 to CALC-13).
- The numbers are computed in code, never by a model (CALC-14).
- The screen has categories, search, units, results, assumptions and favourites (CALC-15). History keeps the formula version (CALC-17).
- Chat runs the tested function (CALC-20): `calculators.test.ts:108-120`. Live: buck 19.2 V, LED 150 Ω, torque 49.74 N·m.
- In chat, thousands groups and the Unicode minus are now read correctly (CALC-SPEC-X1). **Fixed 17 Oct** in `9c61ae2`: `calc-tool.test.ts`.
- Thermal expansion refuses a length that ends at zero or below, and warns on an α outside common materials (CALC-08, remaining). **Fixed 17 Oct** in `4228790`.
- Module switch, verified and beta badges, data export and delete (CALC-22, CALC-24, CALC-25).

### Calculator plan
- Basic calculator with memory, %, history and copy (CPLAN-02): `keypad.tsx:329-361`.
- Scientific functions, constants, angle modes, display formats (CPLAN-03).
- Unit converter with all 17 plan categories and every listed unit (CPLAN-25): `units.ts:76-536`.
- Expression parser with clear, positioned errors (CPLAN-38).
- Formula input forms and result display (CALC-PLAN-X2).
- The EXP key writes ᴇ (×10ⁿ), (−) after EXP is the sign, and "1.2.3" is an error (CPLAN-06). **Fixed 17 Oct**: `engine.test.ts:16-33`.
- The e key or a variable right after a digit multiplies: 2 e − 3 is 2×e−3 = 2.437, not 0.002 (CPLAN-06, remaining). **Fixed 17 Oct** in `4228790`, checked in the browser.

### Knowledge
- Project material, general references and library documents are kept apart (KNW-01): `knowledge.ts:41-52`.
- Permission is checked on upload, on retrieval and when a citation is opened (KNW-02, KNW-13, KNW-14).
- Extraction with OCR for scanned pages (KNW-03): `extract.test.ts`, 12 passed.
- Answers come only from passages, and invented citation numbers are removed (KNW-09): `knowledge.test.ts:127-133`.
- Citations show document, version, page and excerpt (KNW-10).
- History blanks citations the person can no longer open; probe 28 was extended (KNW-15). **Fixed 17 Oct**: `routes/knowledge.ts:141-154`.
- Module switch (KNW-28); reference library (KNW-30).

### Integration (§13–§17)
- One sidebar and the same session (INT-01, INT-02).
- The calculator tool in chat (INT-04); chat and Knowledge use the same project filter (INT-05).
- §14 met: no cross-project retrieval in 30 probes (SEC-01); smoke tests pass (SEC-05); engine controls kept (SEC-06); rollout notes keep sensitive data out (SEC-07).
- §15 met: courses survive sign-out (ACC-02), 100 of 100 calculator tests (ACC-04), 30 probes (ACC-07), smoke tests (ACC-08).
- The work scheduled for 19 Oct to 6 Nov is already built (SCH-01). The registry exists (RSK-01). Changes stayed in new files (RSK-06).

## Decisions that need you

These are product calls, not code work. Each one changes what the release blockers below mean.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Beta calculators in December (P0 #8) | Keep the 182 beta calculators on by default (what you asked for: "as much of the big doc as possible"), or ship them off and let admins turn them on | Off by default for the release, on for your own testing. Spec §14 treats any wrong number as a blocker, and beta calculators have 1–2 reference cases each. |
| D2 | Admins and project material (P0 #7) | Admins who aren't members can read project sources and members' private files (the engine's current rule), or project material is for project members only (the spec's wording) | Members only for Knowledge and project sources; admins keep managing members and settings. Record it in `docs/decisions.md`. |
| D3 | The model-assisted chat calculator path (P0 #9) | Keep it (it can swap two inputs of the same kind), fix it with a cross-check, or turn it off for December and keep the rules path | Off for December. The rules path handled every live question. |
| D4 | SCIM, LDAP and SAML single logout (§16 says not in this release) | Keep them as Enterprise-only, or hide them | Keep; they're built and tested. Say so in the release notes. |
| D5 | Release version | Fold GEM AI into 1.0.0, or ship 1.0.0 and then 1.1.0 | One 1.0.0 that includes GEM AI. |
| D6 | Name on screen | Keep "Aatmiq" as the default product name with GEM AI set per installation, or make "GEM AI" the default and replace the ~17 remaining hard-coded strings | GEM AI as the default in GMS-AI. |
| D7 | Knowledge scope (KNW-26) | Single questions per project (built), or follow-up questions with context | Single questions for December. |

## Release blockers (P0)

| # | IDs | What | Gap | Next task | Effort |
|---|---|---|---|---|---|
| 1 | OPS-03, LRN-31, SEC-04, ACC-09 (+CALC-19, KNW-25) | Restore a course, a calculator history row and a document | `run-backup.sh` checks only a project document (Nightly 12/12). It checks no course, lesson progress, calculator row or Knowledge chunks. Files in an S3 bucket are not in the backup. | Extend `tests/e2e/run-backup.sh`: create a course with progress, a calculator run and a Knowledge source; back up, delete, restore, then check all of them, including chunk count and opening a citation. Do one manual restore on staging with the saved `APP_SECRET`. Document that S3 needs its own backup. | M |
| 2 | LRN-28, ACC-01 | 5 engineering topics give usable lessons | 5 topics run and reviewed on 17 Oct ([evidence](evidence/2026-10-17-learning-5-topics/README.md)): all 15 lessons generated, worked-example arithmetic right, but every course has technical errors (9 concept errors, 6 mis-cited references), average 3.2/5, none ready as is. All written by Beam (Standard tier), 200–500 words each. | Decide: lessons on the Advanced tier, and/or a check pass before saving (see the evidence file). Rerun the five topics, have an engineer confirm the review, and re-check worked examples with Calculators. | M |
| 3 | LRN-30, ACC-03 | 20 sampled videos are real IDs | Met on the test server (17 Oct): 60 of 60 videos from 15 lessons are real, public IDs (oEmbed checked outside the app); 41 relevant, 15 loosely, 4 off-topic. Not yet on the release server, where YouTube may ask for sign-in. | Do LRN-13 first. Generate the acceptance courses on the release server (a key, if used, spreads over 2 days because of quota). Write a script that samples 20 saved IDs and checks each with oEmbed (or `videos.list`). If lessons say "blocked", set `YT_DLP_COOKIES` or `YT_DLP_PROXY`. | S |
| 4 | KNW-20 | 1,000 pages by about 20 Nov | No corpus and no ingest run. | Collect 1,000 PDF pages of selectable text across 3 or more projects, plus references. Ingest with 0 failures. Spot-check 20 citations for the right page. | M |
| 5 | KNW-21, ACC-05 | 5,000, then 10,000 searchable pages | No scale run, no throughput or latency figures. The vector column is untyped and has no index. | Ingest 5k, then 10k pages. Record pages per minute, p50/p95 time to first answer, and `EXPLAIN ANALYZE`. Rerun the 30 probes. Type the column and add HNSW if vector search is slow. | L |
| 6 | KNW-22, ACC-06 | At least 24 of 30 questions have the right evidence in the top 5 | There are 3 example cases. The script checks any of 8 passages, not rank, has no 24/30 threshold, and has never run. | Write 30 questions, including unanswerable and injection cases. Add a rank ≤ 5 check, `--min-pass 24` and a retrieval-only mode. Run with an embedding model. | M |
| 7 | DOC-02 (+KNW-16, KNOWLEDGE-X1) | Project material only for project members | Org and workspace admins who are not members read every project's sources, so Knowledge answers them. They can also open, rename, share or delete members' private library files by id. None of this is tested. | Decide the rule and record it in `docs/decisions.md`. If the spec stands, remove admin read access in `getProjectAccess`, `docInAccessibleProject` and `loadReadable`. Add probes for an admin who is not a member. | S |
| 8 | CPLAN-40, CALC-23, OOS-02 | No calculator shows invalid input as a result | 182 beta calculators (121 with one reference case) are visible by default and chat uses them. Some give invalid results: ground-rod resistance R = −133.2 Ω; heat radiation at −300 °C. §16 defers them. | Set `betaCalculators` to false in `packages/shared/src/gem.ts:19`. Keep beta out of chat unless an admin turns it on. Fix the "202 calculators" claims in the docs, README and CHANGELOG. Adjust `calculators.test.ts:89-98`. | S |
| 9 | SEC-02 | Chat's model-assisted calculator path | `acceptModelInputs` (`9c61ae2`) checks numbers and units but accepts swapped inputs of the same quantity. Voltage divider with R1 and R2 swapped gives 8.163 V instead of 3.837 V, shown as a tested result. `viaModel` has no end-to-end test. | Cross-check the model's assignment against the rule cues, or turn the model path off for December. Add stub-model tests: wrong unit, swapped inputs, a number not in the message. | S |
| 10 | CPLAN-09 | Equation solver and fractions | Repeated roots of degree 3 or more come out with stray imaginary parts: (x−1)³ gives 0.99989… − 0.0000097i. "Decimal to fraction" shows approximations as exact: 0.12345678 → 10/81. | Polish and cluster the roots, or deflate by gcd(p, p′). Give exact fractions for terminating decimals and mark others with ≈. Add tests. | S–M |
| 11 | CPLAN-12 | Limit tool | (1−cos x)/x² at 0 is reported as an existing limit of 0; the true value is 0.5. It shows 10 digits when only 7 or 8 are right. | Use Richardson extrapolation, or compare step sizes and reject a collapse to 0. Round to the digits that agree. Add tests. | S–M |

Blockers already met: no cross-project chunks in 30 probes; history citations blanked (fixed 17 Oct); thermal expansion and the keypad e/E keys (fixed 17 Oct, `4228790`); Chat, Work AI and Code pass the smoke test (CI on HEAD and the 22/22 live smoke). Re-check all three at the freeze.

## Remaining work for December (P1, P2)

### Engine: chat, people, models
| ID | Task | Effort | Priority |
|---|---|---|---|
| ENG-38, WRK-11 | Confirm the Nightly Code suite passes on HEAD. The last run was before the `984c2f3` proxy change. Rerun `live-smoke.mjs` at the freeze. An empty model reply still makes a task fail, so a flaky model can fail the smoke test. | S | P1 |
| ENG-03, ENGINE-B-2 | Use the product name in the tab title (`layout.tsx:15`) and about 17 other strings, the docx creator and the Code agent prompt. | S | P2 |
| ENG-07 | Workspace admins can view model grants but not change them or the budget. Allow it, or change the spec wording. | S | P2 |
| ENG-13 | Unverified: sign in through one real OIDC tenant and one real SAML tenant during staging, and record it. | M | P2 |
| ENG-14, ENGINE-B-4 | SCIM, LDAP and SAML single logout are built, but the spec excludes them. Decide and record. | S | P2 |
| ENG-16 | Test that GEM data is in the personal-data ZIP and gone after erase. Add it to the ZIP README. | S | P2 |
| ENG-26 | A Work AI task fails at the token limit instead of pausing. Add pause and resume, or correct `docs/01-foundation.md` and D13. | M | P2 |
| ENG-29, LRN-27 (remaining) | Dollar amounts ("$5 … $10") render as maths in chat, print and lessons. There is no rendering test. | S | P2 |
| ENG-34 | Word export shows raw LaTeX. `?format=pdf` returns a .docx. Label PDF as "print". | M | P2 |
| ENG-37 | Prompt logging only shows a notice, and the notice says things are recorded when they are not. Build the log or reword the notice. | M | P2 |
| ENGINE-A-1 | Calculator runs in a temporary chat stay in history for good. Skip saving them. | S | P2 |

### Engine: documents, Work AI, ops, build
| ID | Task | Effort | Priority |
|---|---|---|---|
| DOC-04, KNW-07 | Run `embeddings.test.ts` against a real embedding model. Time vector queries. Plan a typed column and an HNSW index. | M | P1 |
| DOC-05, KNOWLEDGE-X2, RSK-03 | In-process jobs (the team default) never retry, so an embedding outage fails or stalls documents. Store chunks keyword-searchable first and fill in vectors later. | M | P1 |
| BLD-01, ENGINE-B-3 | Choose the December version. Cut a pre-release tag. Test a real upgrade with GEM rows present. Dry-run `release.mjs` and the Release workflow. | S | P1 |
| DOC-03 | Fix the "OCR coming soon" message in English and Hindi. Say .docx/.xlsx only. | S | P2 |
| WRK-10 | Detect WORK_DIR or CODE_DIR parent folders that task users cannot reach, and show a clear error. | S | P2 |
| OPS-02 | The S3 path and the copy script have never run in CI. Run them once against MinIO. | S (est.) | P2 |
| BLD-05 | Run staging on the target GPU server with the team lineup, which differs from the models tested live. | M | P2 |
| ENGINE-B-5 | Health warning when Knowledge is on with no embedding model, or when documents have no vectors. | S | P2 |

### Learning
| ID | Task | Effort | Priority |
|---|---|---|---|
| LRN-13 | Lessons saved during a quota error or with no key never get videos. Search again on open, without a model call. Use one search per lesson. | S | P1 |
| LRN-17, RSK-04 | Daily caps can be dodged by deleting courses or with generate-all. Failed attempts are not counted. There is no global job limit. | M | P1 |
| LRN-06 | Require at least one symbol per equation and a non-empty unit. Keep Part 4 visible. | S (est.) | P2 |
| LRN-07 | Refuse validity text that is only a universal claim ("always applies"). | S | P2 |
| LRN-08, LRN-10 | Mark diagrams as model suggestions. Check references during the 5-topic review. | S | P2 |
| LRN-12 (remaining) | Run `stripUrls` on equation LaTeX too: `\href{…}` is stored as written. | S | P2 |
| LRN-16 | Outline cache. | S | P2 |
| LRN-18 | Screen to edit a course's tags and title. | S | P2 |
| LRN-21 | Add the course routes to the authz sweep. Add a malformed-lesson test. | S | P2 |
| LRN-24 | Give Learning a fixed difficulty in Auto; "law" in a topic now picks advanced. Meter the judge call as Learning. | S | P2 |
| LRN-34 | Add Learning gates to `docs/11-rollout.md`. Fix two claims in the docs that overstate the code. | S | P2 |
| LEARNING-X1 | Restoring a version during a regeneration leaves two current versions. Fix it and add a unique index. | S | P2 |

### Calculators (spec and plan)
| ID | Task | Effort | Priority |
|---|---|---|---|
| CALC-PLAN-X1 | Tool screens in `math-tools.tsx` and `other-tools.tsx` still use `Number()`. A blank field becomes 0, "2,5" becomes 2 in the linear system, an "8,5" rate gives a NaN payment, and hex is accepted. Add one shared strict reader, and make the engine refuse non-finite input. | M | P1 |
| CALC-09 (remaining) | List fields split on commas, so "1,500, 2,200" becomes four values. Show the parsed inputs in the Result panel. | S | P1 |
| CALC-03 | 13 calculators have no warnings. The PFC, LED and buck-boost warnings have no tests. | S | P2 |
| CALC-06 | Zero-input tests for all 20 calculators. | S | P2 |
| CALC-18 | Hash test so a formula change without a version bump fails CI. | S | P2 |
| CALC-21 | Chat reach: filter before taking the top 6 (`calc-tool.ts:236`). List calculators cannot be reached from chat. Add 20 phrasing tests. | M | P2 |
| CALC-27 | Record the CI run id at the freeze in the release checklist. | S | P2 |
| CPLAN-37, CALC-26 | Tool history rows are stored as the browser sent them, though the docs say they are recomputed. rand() is drawn again on save. Fix the test path in the docs. | S | P2 |

### Knowledge
| ID | Task | Effort | Priority |
|---|---|---|---|
| KNW-19 | Bulk, resumable ingest script: skip by hash, retries, state file, pages per minute. | M | P1 |
| KNW-04 | Start a new chunk at each page break. Give .docx/.txt page equivalents. Use PDFs only in the first corpus. Test the cited page. | S | P1 |
| KNW-05 | Check file signatures. Cap decompressed size and PDF page count. Add hostile-file tests. | M | P1 |
| KNW-06 | Mark the old version superseded only once the new one is ready. Only project-owned documents can be superseded. | S | P1 |
| KNW-08 | Repeat the live 3-document test with an embedding model and check that `field-failures-2026.txt` is cited. | S | P1 |
| KNW-11 | Unanswerable questions with a real model on the large corpus. Use one not-found sentence. | S | P1 |
| KNW-12 | Ranking work after the baseline: dedupe, cap passages per document, phrase boost. | M | P1 |
| KNW-16 | Covered in P0 #7. Also covers projects visible to the whole workspace and the wrong empty-state text. | S | P1 |
| KNW-17 | New probes: admin who is not a member, superseding a library document, upload with the chat role, re-linking, export. | S | P1 |
| KNW-18 | Instructions hidden in documents, tested with a real model. Escape `</sources>` in passages. | S | P1 |
| KNW-23 | Remove button in Knowledge Sources. Scrub stored excerpts. Time a large delete. | S | P1 |
| KNW-24 | Reindexing takes a project's documents offline and breaks old citations. Keep documents ready and citations stable. | M | P1 |
| KNOWLEDGE-X1 | Only the owner or an admin can link a library document into a project. Add a probe. | S | P1 |
| KNW-26 | Decide whether single questions (no follow-up context) are the December scope. | M | P2 |
| KNOWLEDGE-X3 | New versions for library and reference documents. | S | P2 |

### Integration
| ID | Task | Effort | Priority |
|---|---|---|---|
| INT-03, KNW-27 | Shared project switcher. Links from a project to Knowledge and back. | M | P1 |
| ENGINE-B-1, LRN-32, CALC-16, CPLAN-39, KNOWLEDGE-X4, BLD-06, SCH-03 | Browser journeys for Learning, Calculators and Knowledge in `full.mjs`. Add their pages to `a11y.mjs` and `hindi.mjs`. | M | P1 |
| INT-06 | Test with all three modules off: chat, project chat, Work AI and Code must still work. A failed flags read must not break `/api/me` or chat. | S | P1 |
| INTEGRATION-X1, SEC-03, RSK-05 | The personal-data export (own and admin) returns stored citation excerpts without an access check. | S | P1 |
| SCH-04 | GEM AI release checklist in `docs/11-rollout.md` that names the proof for each §14 and §15 line. Book the staging restore. | M | P1 |
| INTEGRATION-X2 | One rule for citation snippets in chat and Knowledge after someone loses access. | S | P2 |
| INTEGRATION-X3 | A known-issues list in the repo (branding strings, OCR stops after 60 pages, keyword-only fallback). | S | P2 |
| RSK-02 | Corpus manifest and a characters-per-page check in the scale script. | S | P2 |

## Suggested schedule

The Learning and Calculator code from the spec's first three weeks already exists. Use that time for the wrong-number and access fixes, the Learning evidence and the restore test. The Knowledge weeks stay as planned, but they become measuring weeks rather than building weeks. Run the large ingests overnight on their own and code during the day. At about 6 hours a day this fills about 40 of the 45 days.

| Week | Focus | Tasks | Gate at end of week |
|---|---|---|---|
| 19–23 Oct | Calculator blockers | P0 #8 beta off (your decision), #10 roots and fractions, #11 limits, #9 chat model path | No known wrong number in the shipped calculators. CI green. |
| 26–30 Oct | Access rules and input reading | P0 #7 admin access (with KNW-16, KNOWLEDGE-X1), INTEGRATION-X1 export, CALC-PLAN-X1 and CALC-09 list fields, LRN-13. Check lesson videos on the release server (yt-dlp or a key) and start generating the acceptance courses. | Access rule decided and probed. Strict input on every tool screen. |
| 2–6 Nov | Learning evidence and restore test | P0 #2 five topics reviewed, P0 #3 sample of 20 videos, P0 #1 extend `run-backup.sh`. Before the break, list the corpus sources. | Two of the §15 lines met. Restore test covers GEM data. |
| 7–15 Nov | Shutdown | Nothing scheduled. | |
| 16–20 Nov | Ingest and 1,000 pages | Embedding model running locally plus the real embeddings test (DOC-04), retries and keyword-first ingest (DOC-05), KNW-19 ingest script, KNW-04 page fix, P0 #4 1,000 pages | 1,000 pages, 0 failures, 20 citations spot-checked. |
| 23–27 Nov | Evaluation set | P0 #6: 30 questions and the improved script; baseline run with KNW-11 and KNW-18; KNW-06; KNW-05 | Baseline top-5 score on 1,000 pages. |
| 30 Nov–4 Dec | Page gate | P0 #5: 5k, then 10k pages with measurements, index if needed; rerun probes plus KNW-17; KNW-12 if below 24/30; KNW-24 if time | 10,000 pages searchable, 24 of 30 or more, 30 probes clean. |
| 7–11 Dec | One application | INT-03 shared project, GEM browser, a11y and Hindi tests, INT-06 modules-off test, KNW-23 | GEM pages covered by CI. |
| 14–18 Dec | Staging and release candidate | Staging on the target server if possible (BLD-05); BLD-01 and ENGINE-B-3 version, tag and upgrade test; manual restore drill; SCH-04 checklist and known issues; LRN-17 or buffer; ENG-13 if time | Release candidate. Restore shown on staging. |
| 21–25 Dec | Freeze and release | Rerun the calculator, Learning and permission tests, `live-smoke.mjs`, Nightly and the evaluation. Record CI run ids (CALC-27). Fix blockers only. | Release on 25 Dec. |

If something slips, drop P2 items first, then KNW-24 and the extra ranking work. Never drop a P0. P2 items are fill-in work for gaps, for example while a long ingest runs.

## Acceptance evidence checklist

| §15 line | Status | What proves it, or would prove it |
|---|---|---|
| 5 engineering topics produce usable lessons | Not yet | 5 topics, 15 lessons generated and reviewed (17 Oct, [evidence](evidence/2026-10-17-learning-5-topics/README.md)): generation works, content has errors in every course (average 3.2/5). Needed: a better-lesson decision and a rerun (P0 #2). |
| Courses survive logout and login | Met | `learning.test.ts:181-189` "courses survive signing out and in again", passing in CI. |
| 20 sampled video links are real video IDs | Met (test server) | 60 of 60 real and public, checked outside the app (17 Oct, [evidence](evidence/2026-10-17-learning-5-topics/README.md)). Repeat on the release server (P0 #3). |
| 100 of 100 calculator tests pass | Met | 101 golden cases in `core.test.ts`. 805 package tests pass locally and in CI on HEAD. |
| 10,000 permitted text pages are searchable | Not yet | No corpus or scale run. Needed: ingest report and latency figures (P0 #4, #5). |
| At least 24 of 30 curated questions have the right evidence in the top 5 | Not yet | 3 example cases, and the script does not measure top 5. Needed: 30 questions and a report with the threshold (P0 #6). |
| 30 cross-project probes return nothing they should not | Met (small data) | `knowledge.test.ts:152-242`, in CI. About 25 of the 30 are truly cross-project. Rerun on the 10k corpus and add the KNW-17 probes. |
| Existing chat, work and code smoke tests pass | Met | CI 39035614408 on `9c61ae2`: 118/118 product, 32/32 Work AI. Nightly Code 13/13 and 14/14 (on `9386371`). Live smoke 22/22. Confirm Code at HEAD. |
| One restore of a course, a calculator history row and a document is demonstrated | Partly | Document restore passed in Nightly 38978985684 (12/12). Course and calculator row not yet tested (P0 #1). |

## Later phase (P3 and out of scope)

- **Engine:**
  - Say in the YouTube key hint that lesson search terms go to Google (ENG-02; the docs say so since 17 Oct).
  - CSV usage export for workspace admins (ENG-27).
  - Reword spec §5 to mention the chat calculator tool (ENG-28).
  - Typing "@" opens the document picker (ENG-32).
  - Retention for Knowledge question history (ENGINE-A-2).
  - Check the budget before the judge model call (ENGINE-A-3).
  - Per-person task cap counts tasks waiting for approval (WRK-06).
  - Open VSX installs and the debugger (COD-01).
  - Desktop installers and signing (COD-04).
- **Learning:**
  - Outline regeneration, or drop the unused version columns (LRN-04).
  - Resuming after a restart (LRN-26).
  - YouTube cache purge and a "test key" button (LRN-33).
  - Personal-data test for courses (LEARNING-X3).
  - Stop queued jobs when the licence is inactive (LEARNING-X4).
- **Calculators:**
  - Search on narrow screens (CALC-15).
  - Same output shape for chat history rows (CALC-17).
- **Calculator plan items not built:**
  - Symbolic algebra: factoring, simplify, solve for x from text, domain, asymptotes, radicals, inequalities.
  - Precalculus; indefinite and improper integrals; a variable choice for partial derivatives.
  - ASA, AAS and SSA triangles; unit circle.
  - Polar complex input; vector add and scale; n×n eigenvalues.
  - Casio MODE, SETUP, ALPHA, OPTN, VARS and DMS keys; textbook display.
  - Step-by-step working for formula calculators (only 2 of 202 have it).
  - Scientific-notation converter, probability calculator, more geometry shapes, Bernoulli.
  - Wider electrical, mechanical, civil, chemical, instrumentation, environmental and materials sets. Civil, chemical and instrumentation are the thinnest.
  - Financial gaps; GPA; time zones; cooking ingredients and pans.
  - Formula reference page; history search; settings for precision.
  - Presets and enterprise mode; editor integration; lazy loading.
- **Knowledge:** 25,000 pages and more, the 1.5M-chunk benchmark (KNW-29). Subject tags for references (optional).
- **Spec §16, not in this release:** quizzes, suggestions, course PDF, lessons from company documents; the remaining calculators; phone app, voice, images; Kubernetes and Prometheus; Viewer and custom roles; token auto-approval; usage emails and audit download; billing, key rotation, air-gap licence files; signed installers; a measured GPU capacity; legal pack; native Hindi review and a screen-reader walk-through.
- **Built anyway, against §16:** SCIM, LDAP and SAML single logout (Enterprise only). See ENG-14 for the decision.

## Notes from today's live test

- **Models.** Seven Ollama Cloud models with 14 rotating keys: gpt-oss 20b and 120b, nemotron-3 nano, super and ultra, gemma4:31b and beam. The demo model was off. These differ from the default team GPU lineup (Qwen3.6 with Nemotron 3 Nano 4B).
- **Chat.** 18 of 21 checks passed. The other 3 were test regex misses on correct answers. Auto sent a greeting to the fast tier and a hard question to the advanced tier with thinking on. Attached documents, vision, project instructions, regenerate, edit-and-branch, and Markdown and Word export all worked. PDF goes through the browser print page.
- **Calculator tool in chat.** Buck 19.2 V, LED 150 Ω and torque 49.74 N·m, all through the rules path. The model-assisted path was never used, and it is still untested (P0 #9).
- **Chat maths bug.** Chat did not render LaTeX; only Learning did. It was fixed during the session and committed on 17 Oct (`984c2f3`). A re-check found a side effect: dollar amounts can render as maths (P2).
- **Learning.** One real course (buck converter, 6 modules, 20 lessons, all ready and schema-valid). Every equation states when it applies. No YouTube key was set, so lessons had no videos ("not_configured"). After lessons switched to yt-dlp with no key (17 Oct), regenerating lessons 1 and 8 added 4 videos each in about 9 s, all relevant (buck steady state; output ripple and ESR). All 8 IDs answered oEmbed 200 when checked separately. YouTube did not ask this server to sign in.
- **Knowledge.** 4 of 4 checks passed, but **keyword-only**, because Ollama Cloud has no embedding model. The overtemperature question cited only one document. The second relevant file did not share the question's words. The unanswerable and injection-style questions returned "not found" without calling a model.
- **Work AI.** The first run failed because WORK_DIR sat under 0700 parent folders that the per-task Unix user could not enter. Moving it to `/srv/gem-live/work` (0755) fixed it, and nothing in the product detects this yet (WRK-10). One run "completed" with an empty answer. That bug was fixed on 17 Oct: the model is asked again, then the task fails clearly. Later runs wrote correct files, including a task inside a project.
- **Code.** The IDE builds and opens. The panel agent wrote and ran `rc.py` (τ = 1 ms, f_c ≈ 159.15 Hz).
- **Branding.** The chat composer and settings hint were fixed. The tab title and about 17 strings still say Aatmiq.
- **Since the test.** `tests/e2e/live-smoke.mjs` ran 22/22 against the real models and is committed. The full API suite passed 294, and CI passed on the fix commits (run 39035614408 on `9c61ae2`). Screenshots of 85 pages in light and dark are in `docs/screenshots/2026-10-16`. They are all 1440 px wide, so the phone layout is still unchecked.
