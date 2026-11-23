# Changelog

What changed in each release of Aatmiq. Versions follow [semantic versioning](https://semver.org):
a new major version can need steps when updating (they're listed here), minor versions add features,
patch versions fix things. How to update: [docs/13-releases.md](docs/13-releases.md).

Each release has a section `## <version> — <date>`; `scripts/release.mjs` refuses to tag a version
without one.

## Unreleased

- **Computer AI** (docs/23-computer-ai.md): tasks that use the screen, mouse and keyboard of the computer Aatmiq runs on,
  with a vision model; Windows (PowerShell, nothing to install) and Linux desktops (xdotool). Admins only, off by default,
  one task at a time; the screen shows live in the task page; risky keys and commands ask first; moving the mouse to the
  top-left corner stops it. Positions on a 0-1000 scale by default (`AATMIQ_COMPUTER_COORDS=pixels` for Qwen2.5-VL).
- The model gateway counts an image as about 1,500 tokens, not the length of its base64 text.

- **Agent AI: a third engine for tasks, on opencode** (MIT, docs/22-agent-ai.md). Its own page under Super AI, with the
  same models, quotas, approvals, tools (web search and reading, browser, documents, calculators, recall), connectors,
  skills and folders as the other two. Fast and light; like Super AI, its tasks have no checklist or reviewer. On by
  default when installed (Admin → Work AI); the Docker image includes it unless built with `AGENT_AI=false`.
- **Super AI and Agent AI keep the task's first request in their instructions**, word for word, so condensing older
  steps no longer loses details such as a code word. Super AI also reads big files and long outputs in parts (at most
  about 15% of the window each). Super AI still needs a 64K window for work with big files (docs/22-agent-ai.md).
- **The "missing files" reminder no longer recreates files a request asked to delete, move or rename.**

- **Work AI and Super AI: programs can save their settings and caches.** Commands inside a task couldn't write their home
  folder, so matplotlib warned, and `pip install --user` failed. Each task now has a private settings and cache folder.
- **A task that says it's done without the files it was asked for is reminded once.** If a request names files (for example
  `report.md`) and they aren't in the folder when the agent finishes, it is told to create them. This covers Super AI too,
  which has no checklist.

- **Long chats no longer fail.** Each chat request is kept inside the model's context window: the oldest turns are left
  out first, then large tool results (web pages, files, Python output) are shortened. Chat also asks Ollama for the model's
  full window (`num_ctx`), as Work AI already did, instead of the server's default.

- **Undo, shared project folders and a folder picker for tasks working in a folder.** Before a task changes a folder, its
  state is kept privately; the Files panel lists what changed and can undo all of it or one file. A project can have a shared
  folder that its tasks use by default (or a private copy instead), and **Browse** picks an allowed folder instead of typing
  the path. Migration `0036`. Folders aren't available with `WORK_ISOLATION=container`.

- **Work AI and Super AI can work directly in a folder.** With **Allowed folders** set (Admin → Work AI, or `WORK_FOLDERS`),
  the task box has **Work in a folder**: type a folder inside an allowed one and the task works there, with no private
  copy to upload to or download from. Links are resolved, Aatmiq's own folders can't be used, and only one task at a time
  works in a folder. Migration `0035`. See docs/06-work-ai.md.
- **Work AI and Super AI are separate again; Scheduled tab removed; Deep research always visible.** Super AI has its own
  entry under Work AI in the sidebar (when an admin has turned it on) with its own page and task list, and no longer
  appears as a tab inside Work AI. The Scheduled tab is gone (Work AI keeps Tasks, Skills, Connections). In Chat AI the
  Deep research button is always shown; without web search it is greyed with a note on how to enable it.
- **Fixed: Super AI "Read was called with input that could not be parsed as JSON" and "no user query found in messages".**
  The Claude Code gateway joined tool arguments that a server repeats in every chunk (`{…}{…}`) and now keeps the first
  complete object, also for Windows paths; and it never sends a conversation without a user message (an empty one gets
  "(continue)"), which Qwen's template on Ollama refuses. If a task still ends with that error, the model server is
  running with a smaller context than the prompt (Super AI sends about 80K tokens a step): set the model's context length
  in Admin → Models to what the server really runs with.
- **Fixed: Auto answering "OK" with the fast model after a hard task stopped halfway, and answers with steps but no text.**
  A short "ok" or "continue" after an answer that ended empty or with an error now keeps the previous answer's tier
  instead of counting as a thank-you. And when the model uses tools and then writes nothing, chat asks it once more,
  without tools, for the write-up (what it did, what worked, which files).
- **Fixed: "network error" in a long chat answer.** While a model wrote a long program, or a tool ran, the stream sent
  nothing, and Next.js's proxy dropped the quiet connection after 30 seconds. The chat stream now sends a keep-alive
  every 10 seconds and the proxy timeout is 15 minutes.
- **Fixed: Chat AI tool calls failing with "Provider returned 500 … Extra data" on Ollama behind LiteLLM.** Some servers
  repeat the tool's name and its whole arguments in every streamed chunk; they were joined (`run_pythonrun_python`,
  `{…}{…}`), so the call was unknown and the next request was rejected. The stream reader now keeps one name and the first
  complete JSON object.
- **Tools for the data-dependent release blockers (P0 #1–#6).** `scripts/knowledge-ingest.mjs` loads a folder of documents
  in bulk (resumable, retries, pages per minute); `scripts/knowledge-eval.mjs` now checks the right document is in the
  top 5, a given page, a `--min-pass` threshold (24 of 30), a token-free `--retrieval-only` mode and p50/p95 latency;
  `scripts/check-lesson-videos.mjs` samples 20 lesson videos against oEmbed; `tests/e2e/run-backup.sh` also restores a
  calculator row, a course with progress and Knowledge chunks. Measured: exact vector search takes about 19 ms for 1,000
  pages and about 140 ms for 10,000, so no index is needed ([evidence](docs/evidence/2026-11-18-vector-scan/README.md)).
- **Release blockers fixed (docs/16, P0 #7, #8, #9).**
  - **Project material is for the project's people.** An admin who isn't in a project manages it (people, settings,
    deleting) but no longer reads its files, chats, brain or Knowledge answers, or anyone's private library files by id.
    They can add themselves under Share. (D53)
  - **Beta calculators are off by default.** Only the 20 verified calculators show until an admin switches the 182 beta
    ones on; the README and docs say so. (D54)
  - **The model no longer maps chat questions to calculator inputs** when the rules can't (it could swap two inputs of one
    kind and show a wrong result as tested). `CHAT_CALCULATOR_VIA_MODEL=true` brings it back. (D54)
- **The project brain is found by meaning too.** With the workspace's embedding model, a chat now finds brain entries by
  what they mean as well as by their words ("How cold can it get?" finds the ambient temperature range). Entries are
  embedded when first needed and again after a correction; without an embedding model it works as before. Migration
  `0034`.
- **Group chats in projects.** A chat shared to a project is now a group chat: project members can write in it, each
  message shows who wrote it, and open pages pick up new messages. Each person uses their own models, budget and
  connected apps. The author can make it read-only for members again. Migration `0033` (existing messages are
  attributed to their chat's owner).
- **Deep research in chat.** A Deep research button makes the next message a research job: many searches from several
  angles, primary sources read in full, then a structured report with every fact cited (up to 30 tool rounds). It keeps
  going if the page is closed, and the chat shows it's still running until the report arrives. Needs web search.
- **Connected apps in chat.** Chat AI can now use the connectors set up for Work AI (Gmail, Drive, Calendar, GitHub…)
  with each person's own sign-in. Reading tools run at once; anything the connector's ask-first list covers (by default
  everything that changes something) shows an Approve / Decline card in the chat before it runs. A project's connector
  choice applies to its chats; each use is audited; admins can turn it off (Admin → Settings → GEM AI).
- **Python in chat.** Chat AI can now run Python in each chat's own folder to calculate, analyse files (CSV, Excel, PDF,
  ZIP), draw charts and make Excel, Word, PowerPoint, PDF and image files to download, shown under the answer. Any file
  can be attached for it. Programs are confined like Work AI's commands (Landlock: writes only in the chat's folder; the
  person's own Unix user and the user firewall when running as root; time, memory and size limits). Admins can turn it
  off (Admin → Settings → GEM AI). Tool steps and made files are now saved with each answer. Migration `0032`; new
  `CHAT_DIR` setting.
- **Chat AI uses tools on its own.** Like ChatGPT, the model now decides when to search the web, read a page, search the
  person's documents or run a calculator, step by step, for up to 10 rounds (was 4, calculators only). Each step shows
  in the chat while it runs and its sources are numbered with the answer's. Where the organization allows web search in
  chat, the model may search without the **Search the web** switch; turn web search in chat off to prevent that.
- **Project budgets and usage per project.** A project's owner or an admin can give the project its own token budget per
  period: a total, a per-person amount (or an even split), and a share for any one person. It applies on top of the
  workspace's budget, so a call in the project must fit both. Every chat, Work AI task, brain and Knowledge call made in
  a project is now recorded with it; the project page's new **Budget** section shows this period's use split into Chat
  AI and Work AI per person, chat shows which budget ran out, and **Admin → Usage** has a **By project** table.
  Migration `0031` adds the columns.
- **Projects across teams.** A project's people no longer have to be in its workspace. **Share** now searches the whole
  organization and can add a whole group at once (e.g. "ADAS core" with people from Software, Hardware and Firmware).
  People from other teams join as **guests** of the project's workspace: they reach only the projects they were added to
  there (not projects open to the whole workspace, not its library), chat and run tasks only inside them, and stop being
  guests when they leave their last project there. The projects page lists **In your other workspaces**, and opening a
  project switches to its workspace. Also fixed: projects open to "everyone in the workspace" could be opened by people
  from other workspaces who knew the link. Migration `0030` adds the guest role.
- **Chat AI and Work AI say what each is for.** The sidebar calls chat **Chat AI** and both entries explain themselves on
  hover; the chat home adds "for asking, discussing and deciding; for a job that ends in finished files, use Work AI"
  (with a link), and the Work AI home opens with "Hand over a job and get finished files back".
- **Aatmiq Code is hidden by default.** Coding tasks go to Work AI, so the IDE section no longer shows in the sidebar,
  the landing page, or the admin switches for workspaces, models and the license, and its API refuses as if no license
  included it. Nothing is deleted: set `CODE_ENABLED=true` on the server to bring it back. Someone with an old link to
  Code sees a short page pointing to Work AI. The test suites run with Code switched on so it keeps working.
- **Project brain: one shared memory per project.** Two people asking the same AI about the same project got different
  answers because each chat held different context. Now a project keeps what it has established (requirements, design
  values, decisions and why, test results, open questions) as short entries with where each came from and the exact words
  in the source that say it, and every chat and Work AI task in the project starts from the same entries. It learns from
  documents added to the project and from what people say in project chats; an AI's task results always wait for a person.
  Every entry's quote is checked against its source, instructions and repeats are dropped, a stated change replaces an entry
  (kept as history) and a contradiction waits for a person. People can add, correct, accept and delete entries on a new
  **Project brain** section of the project page, set it to learn automatically, ask first, or off, and export it as an
  Obsidian vault. Tested with a scripted model; needs a pilot on a real project. See
  [docs/21-project-brain.md](docs/21-project-brain.md). Migration 0029.
- **`task_recall`: after condensing, the agent searches its own record instead of guessing.** A summary loses the exact
  line (a command's output, a path, a number, an error). The whole task record is still stored, so a new tool searches it
  word for word by words and time (newest matches, oldest first, with when each happened), or reads one entry whole. After
  every condensing the agent also gets "where you were" (its last eight steps) and the pointer. Both engines. Idea from
  Kortix and lossless-memory, which reached it independently.
- **A design skill and three shared rules.** `ui-polish` (adapted from unslop, CC BY 4.0, credit kept) audits a screen for
  AI-looking "slop", writes a short direction and fixes in nine ordered passes. Both engines also state three rules: look in
  the person's own documents before the web; read anything that can change from its latest source and say where and when;
  don't invent names, owners, dates or numbers: mark them as gaps.

- **An eval set: the behaviors our agents must keep, scored per criterion.** `evals/` has 14 tasks (a one-number reply,
  CSV totals, a script that must be run before it is trusted, no invented owners or dates, "I can't send email" instead of a
  false "sent", a page that works when opened straight from the folder, an Excel budget, a Word memo, a six-slide deck…),
  each with an instruction, a grader, a reference solution and known-bad samples. `node scripts/eval-run.mjs` runs them on
  Work AI and Super AI with the same model and prints a table of which criterion failed. A grader that can't run (no
  browser, no judge model, a provider outage) reports an error and stays out of the score, never a 0; one judge model is
  pinned per run; `pnpm eval:selftest` checks the graders themselves (the folder-page grader fails the "JavaScript modules"
  page that the expense tracker and the game shipped). Format borrowed from Kortix's evals (their code stays theirs: Elastic
  License 2.0). See [evals/README.md](evals/README.md).

- **Super AI: Work AI on the Claude Code engine, to compare.** A second, plain engine beside Work AI: Anthropic's
  Agent SDK runs the Claude Code loop on the same models, quotas and approvals (through a new
  Anthropic-format endpoint on the gateway that translates to our model servers). It has its own tab and task
  list under Work AI and none of Work AI's checklist, reviewer, stages, audit or edit repair, so the two can be
  run on the same briefs and judged alike. Off until an admin turns it on (Admin → Work AI), an optional
  install (the production image adds it only with `--build-arg SUPER_AI=true`). Claude Code is proprietary
  (Anthropic's Commercial Terms): read [docs/20-super-ai.md](docs/20-super-ai.md) before shipping it. Migration
  0028 adds `work_task.engine`. Super AI runs Claude Code as it ships (its own tools, task list, plan mode, skills,
  memory and compaction); only what connects it here is ours, and `AATMIQ_CLAUDE_ENV` passes any Claude Code
  setting through.
  Super AI has Work AI's browser, documents, calculator and connector tools (always listed, not behind tool
  search) and a brief that says to try a built page the way a person opens it. The browser now warns when a page
  from the task folder uses JavaScript modules or reads folder files, which work in its served view but not when a
  person opens the file straight from the folder (both engines). A `curl`/`wget` that only reaches this computer
  (a test server the agent started) no longer counts as network use and isn't held for approval.
  Super AI is sent back to finish when a reply stops before the work is done (cut off, or announcing a next step
  like "Let me try a different approach…" and ending), and once to try a web page, app or game it built but never
  opened in the browser. Work AI also treats a reply that announces its next step as unfinished.

- **Work AI's `edit` tool stops failing on near-misses.** Across the recorded Work AI tasks 41% of
  `edit` calls failed (201 of 485; the next worst tool was 1%), 183 of them "old_string was not
  found": the model's copy of the text off by indentation, trailing spaces, a line it remembered
  differently, or lines that were never in the file. Each one cost a step and sent weaker models into
  retry loops. Now an `old_string` that is off by spacing, indentation or one drifted line is aimed
  at the file's own text (only when there is exactly one such place, and the new text is indented to
  match the file); one that can't be found comes back with the closest lines of the file and their
  numbers, a warning when the block is very long, and, from the second miss in a row on a file, an
  instruction to read it again. `read` no longer fails on an `offset` of 0.

- **Work AI checks Excel, PowerPoint, Word and PDF files, not only software.** A live run of "an Excel
  workbook, a deck and a report" came back looking done with: no speaker notes (it said there were),
  a chart sitting on top of a table, discounts that display as 937%, a typed "table of contents" with
  wrong page numbers, a 12-page report when 6–8 were asked for, a Chinese sentence and a raw
  `{datetime.now()}` in the text, "0.0%" in the summary, and claims written by hand that were false
  ("North leads", "Fertilizer is the top product everywhere"). Nothing reviewed it, because documents
  were excluded from the checklist. Now: such a request gets a checklist; each file is audited by the
  new `document-checks` skill's `office_audit.py` (formulas calculated, percent formats, overlapping
  or off-slide shapes, notes, a real contents field, page count and blank pages, stray scripts,
  leftover template text, figures that aren't in the workbook); the reviewer recomputes the claims
  from the data; and the agent is told to run the same audit while it builds. The slide builder now
  makes real titles, native charts that can't overlap a table, and notes; the Word converter makes a
  real contents field with page numbers, a cover, header and footer, captioned figures and numbered
  lists that restart. The production image installs LibreOffice and poppler for this (about 400 MB;
  `--build-arg OFFICE_TOOLS=false` leaves them out).
  A live re-run of the same brief (4 review rounds, 71 minutes) now delivers a deck with native charts and
  notes on every slide, a report with a real contents field and 6 pages, and ends honestly "30 of 36
  requirements met" with the rest named, instead of looking done. The audit also fails a table of
  SUMIFS that all calculate to 0 (a criterion that reads an empty cell), `[date]`-style placeholders and
  a leaked `--cover`; the planner can't turn "built from the same numbers" into "linked"; a round that
  breaks what passed before is told so; and work files left beside office deliverables are flagged.

- **Work AI builds to a checklist and is reviewed by someone who didn't build it**
  ([docs/19-work-ai-reliability-plan.md](docs/19-work-ai-reliability-plan.md)). A build request gets an
  acceptance checklist before work starts. When the builder says it's done, checks that code decides
  run first (files, formats, a page loading with no script errors, leftover files), then a separate
  reviewer on another model tests each requirement by using the work and must give evidence;
  failures go back to the builder (up to 3 rounds), and a task that still falls short ends saying
  which requirements were not met, never plainly "done". Big briefs are built in stages, each in a
  fresh session with a progress file, with a snapshot commit per stage. The agent's browser can now
  upload a file to a page's file input (even a hidden one) and reports confirmation dialogs. Reviewer
  tasks are not listed. Migration 0027 adds `work_task.parent_id` and `work_task.verification`.
  A live run showed the reviewer "passing" a phone-width requirement from a call that cannot resize a
  window (the page really scrolled sideways), so the browser now has `browser_resize`, which reports
  whether the page scrolls sideways; the reviewer is refused (not asked) risky commands such as
  installs; and leftover `test.csv`-style files are flagged.

- **Work AI checks what it built against the request.** A task that wrote code is sent back once
  before it ends to prove each requirement (use each feature, open and read the files the program
  produces, check order and totals), clean up files that only signal "done", and report how it
  checked. Forms on the task's own pages that save in the page no longer ask the person to approve
  every click.
- **Work AI manages its context window** ([docs/06-work-ai.md](docs/06-work-ai.md#how-it-works)).
  Big jobs on small windows (a 32K model) no longer fill up and stop: older steps are condensed
  into a summary before the window fills (DSH's stock settings never did that below 64K), the
  reply limit is a share of the window, and the model gateway turns a prompt that wouldn't fit into
  an overflow the runtime recovers from instead of letting the server cut it silently. Long
  requests are saved in the task folder and read from there. The agent is told how to build within
  its window. A task whose plan still has open steps is sent back to them, and if it stops anyway
  it is reported as unfinished with the steps named, never ticked off as completed. A restarted
  task hears its plan and the files in its folder. An empty reply from the model in the middle of
  the work no longer fails the task. The agent's browser opens pages from the task folder
  (`game/index.html`), reports their script errors, and can press keys and click on a canvas, so
  the agent tries what it built before calling it done.

- **Skill platform, phase 0.** Twelve governance skills (routing, authoring, registry changes,
  templates, artifact checks, permissions, evidence, workflows, audit, evaluation, injection
  defense, and tool contracts) join the library at maturity `draft`. A catalog of 195 capabilities
  records which names are installed, which are still handled by a current router, and which are
  not skills yet. Code tasks load the Platform category with the other code skills.
  [docs/08-skills.md](docs/08-skills.md), [docs/GMS_AI_ORGANIZATIONAL_SKILLS_BLUEPRINT.md](docs/GMS_AI_ORGANIZATIONAL_SKILLS_BLUEPRINT.md).

- **GEM AI modules** ([docs/15-gem-ai.md](docs/15-gem-ai.md)), each switched on or off for the
  organization in Admin → Settings and per person in each workspace's member sections:
  - **Learning**: courses written by your model from a topic and a level, lesson by lesson, saved
    and versioned, with equations that say when they apply, worked examples, progress, bookmarks,
    notes and real YouTube videos: found with yt-dlp and no key (the way Agent-Reach reads
    YouTube), or with a YouTube Data API key, chosen in Admin → Settings → Lesson videos.
  - **Calculators**: 202 engineering formula calculators (20 verified against 101 hand-worked
    reference cases, the rest marked beta), a scientific keypad, unit converter, equation, matrix,
    calculus and statistics tools, programmer, science, finance and date tools, with history and
    favorites. In chat, `/calc` or a question with numbers runs the tested calculator and the model
    explains its result.
  - **Knowledge**: questions answered only from one project's documents, citing the document,
    version, page and passage, and saying so when the documents don't contain the answer.
    Document versions, a general engineering reference library, and `scripts/knowledge-eval.mjs`
    to check retrieval against your own questions.
  - `tests/e2e/live-smoke.mjs` checks every AI feature against a running server with its real models.
  - **Web search** for chat and lessons, in Admin → Settings → Web search: your own SearXNG (the
    same one as Work AI by default) or Ollama web search, Brave Search, Tavily or Serper with a key
    stored encrypted (each provider keeps its own), a Test button that says what's missing and
    doesn't call an empty answer working, and switches for web search in chat and for checking
    lessons. Pages from the results (HTML, text, and the text of PDFs) are read only at public
    addresses, redirects included, within 8 seconds name lookups included, and a hostile page can't
    tie the server up. Also
    `WEB_SEARCH_PROVIDER`, `WEB_SEARCH_URL` and `WEB_SEARCH_KEY`.
  - **Search the web in chat**: a globe button in the message box, on for the chat until switched
    off. A small model writes the queries, the best pages are read, and the answer cites them by
    number after any document sources, with a *Sources* list that opens each page. Numbers that
    match no source are taken out, and images the model writes show as their alt text; a page can't
    close its block of the prompt. A search that fails leaves the answer and a note saying why.
    Migration `0024_chat_web.sql` adds `message.web`.
  - **Checked lessons**: each lesson is written from web sources (when web search is set up), then
    checked by your Advanced model, which corrects facts, formulas and references and drops books
    it can't confirm; the lesson's calculations are worked out by the calculators' engine and a
    wrong one goes back to the checker once. A badge by the title says *Checked*, how many
    corrections there were, or *Not checked* and why, and *How this lesson was checked* lists the
    corrections, the arithmetic and the sources. *Check this lesson* checks one written earlier, as
    a new version; one that doesn't finish leaves the lesson and its check as they were and says
    why. A failed check never loses the lesson, nothing is searched once the token allowance is
    used up, and each new version counts once against the day's lessons. Migration
    `0025_lesson_checks.sql` adds `course_lesson.verification` and `stage`.
  - **Rated lesson videos**: up to seven per lesson (was four), from three searches of ten results,
    picked and ordered by a small model call that says in a line why each one helps, and kept in
    search order when the pick fails. People rate each video *Helpful*, *Okay* or *Not helpful*
    (with an optional reason); new lessons leave out videos someone marked Not helpful for
    themselves and videos the organization found unhelpful. Admin → Settings → Lesson videos shows
    the ratings, the most disliked and most liked, and blocks or unblocks a video for everyone.
    Ratings are in the data export. Migration `0026_video_feedback.sql` adds `video_feedback` and
    `video_block`.
- **Work AI and Code, from a 14-task test:**
  - Web research states only what it read: `web_fetch` (now Aatmiq's) gives a page's main text
    without menus, headers and footers, tables as rows, long pages in parts with the offset to
    continue, and the text of PDFs, at public addresses only. The agent is told that figures, dates,
    prices and specifications come only from pages it read in the task, to cite only pages that say
    what it cites them for, and to say so when a page couldn't be read instead of writing an
    estimate as a fact. It closes with the key results, the files it made and what's unresolved.
  - Calls that slipped on a technicality run: a missing `description` on a command, one search
    query or plan step as text, `path` for `file_path`, chat-template markers in an argument, a
    stray `"""`, `EOF` or `">` left at the end of a written file.
  - Honest steps: a command that exits non-zero is a failed step with its exit code; a call that
    never ran says "Not run" and why.
  - Tasks no longer get certificate variables pointing at files they can't read (a readable copy, or
    the system's certificates); turning certificate checks off (`pip --trusted-host`, `curl -k`,
    `verify=False`…) asks first. The image adds numpy and scipy.
  - Auto: agent tasks say why they start at the standard tier; web research and long many-part jobs
    get the advanced model with thinking on.
  - Results stay in the task folder (`documents_save` only when asked); scratch work goes in
    `scratch/`, listed last.
  - Code tasks are in Work AI's task list, marked Code, with the workspace's files in their Files
    panel; their page no longer says they run in a private folder. Answers keep single line breaks.
    The IDE follows the browser's light or dark mode unless you picked a theme.
- Chat renders maths (KaTeX), whichever way the model writes it ($…$, \(…\), \[…\]).
- **Fixed:** `nPr` and `nCr` of huge numbers (`1e15 nPr 1e15`) answer *too large* at once instead
  of counting for hours.
- **Fixed:** calculator answers that were wrong or shouldn't have been given:
  - Limits of 0/0 forms are worked out with L'Hôpital's rule on symbolic derivatives and checked
    against the numbers: (1 − cos x)/x² at 0 is 0.5, not 0. A numerical estimate shows only the
    digits it can vouch for.
  - The equation solver shows a repeated root once with its multiplicity: (x − 1)³ has the triple
    root 1, not 0.999894 − 0.00000977i and two more. Close but different roots stay apart.
  - *Decimal to fraction* converts what was typed exactly (0.12345678 is 6172839/50000000, not
    10/81); a simpler fraction is offered only as an approximation, with its error.
  - Ground-rod resistance uses Dwight's formula with the rod's radius, as published: results were
    about 10 % low (formula version 2). A rod that isn't slender (L under 10 × d) is refused
    instead of giving a negative resistance.
  - A temperature below absolute zero is refused for every calculator input and result and in the
    unit converter, in any unit (heat radiation at −300 °C gave a number).
  - In chat, a calculation the calculator refuses shows why, and the model is told not to work out
    a number of its own.
- **Fixed:** a Work AI task whose model sent back nothing (or only its thinking) showed as done; the
  model is now asked again, and a task that still gets nothing says so and fails.
- **Fixed:** the chat composer and the custom-instructions hint use your organization's product name.
- Single sign-on with any SAML 2.0 identity provider (Okta, Entra ID, Google Workspace, ADFS…):
  import its metadata in Admin → Authentication; the provider's app tile works too.
- Directory sync (Enterprise), in Admin → Authentication → Directory:
  - **SCIM provisioning** for Okta, Entra ID, OneLogin and JumpCloud: they create people, keep
    their names and emails up to date, deactivate leavers and send groups with their members.
  - **LDAP / Active Directory sync**: a read-only service account, on a schedule. It holds back
    when a sync would deactivate more than half the people.
- SAML single logout: signing out of Aatmiq signs you out at the identity provider, and signing out
  there signs you out of Aatmiq.
- The interface in Hindi (हिन्दी): each person picks it in Settings → Appearance, or admins make it
  the organization's default. The admin console is in Hindi too, and so is what the server says:
  error messages, notifications, emails (in each recipient's language), health checks and alerts,
  license notices and Auto's reason for its choice.
- Accessibility: every page meets WCAG 2.1 AA in both themes (contrast, names for controls), a
  "Skip to content" link, and long dialogs scroll with their buttons in view.
- Pictures: a set of flat, geometric illustrations on the sign-in pages, the empty pages (documents,
  projects, tasks, skills, connections, schedules, code, admin), Health, the public site and the
  desktop app, in dark and light. Their accent takes your organization's accent colour. Admin →
  Settings → Illustrations turns them off. The "page not found" and error pages are now in the
  product's style, in English and Hindi.
- Connector pages show each app's own logo (Gmail, GitHub, Notion, Figma…) instead
  of a generic icon, in both themes.
- The public site: Work AI and Code no longer say "Coming soon", the model list names the models
  the GPU server ships, and the plans list only what's included.
- Open-source notices: the full license texts of every package ship in the images (and at
  `/third-party-notices.txt` on your installation), and each release and the offline bundle carry
  `legal/` with the list of open-source components and AI models and their licenses.
- **Fixed:** Admin → Settings → *Delete chats automatically after* N days now deletes chats nobody
  has touched for that long (it was saved but not applied). If you set it earlier, older chats are
  deleted within an hour of updating.

## 1.0.0 — not yet released

The first release.

**Chat and documents**
- Chat with streaming answers, edit and branch, temporary chats, export to Word, PDF and Markdown.
- Auto picks the model for each message by how hard it is (fast, standard, advanced tiers; thinking
  on only for hard requests), or people pick one.
- Documents (PDF, Word, Excel, images with OCR, text and code in UTF-8 or UTF-16) with answers that
  cite numbered sources; keyword and meaning search with EmbeddingGemma 2.
- Projects with instructions, sources, memory across chats and Work AI tasks, and sharing.

**Work AI and Code**
- Agent tasks with a plan, live timeline, files, approvals for risky steps, web search, a browser,
  29 tools, 59 built-in skills, schedules and 45 app connectors; each task as its own user or in
  its own container.
- Aatmiq Code: the editor in the browser and as a desktop app (Windows, macOS, Linux), with a coding
  agent.

**Administration**
- Users, invitations, groups, workspaces, token budgets and requests, usage, the activity log.
- Passwords, two-step sign-in (required with a grace period if you like), single sign-on (Google,
  Microsoft, OpenID Connect), email.
- Health checks every 5 minutes with email alerts, nightly backups, licensing.
- Personal data: anyone downloads everything kept about them; admins erase a person.

**The team server**
- One-command install on a GPU server with vLLM and Ollama (Qwen3.6 and Nemotron 3 lineups),
  HTTPS, backups and a firewall for task users.
