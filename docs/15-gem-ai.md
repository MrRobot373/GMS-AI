# GEM AI: Learning, Calculators and Knowledge

GEM AI is the Aatmiq engine (Chat, Work AI and Code, unchanged) with three engineering modules on
top. They share one sidebar, one sign-in, one admin console and the same models and token budgets.

| Module | What it does | Where |
|---|---|---|
| **Learning** | A topic and a level become a course written by your own model, lesson by lesson, saved so opening it later costs nothing | `/app/learning` |
| **Calculators** | 202 engineering formula calculators (20 verified), keypads, a unit converter and math, science, programmer, finance and date tools; the same code is a tool in chat | `/app/calculators` |
| **Knowledge** | Questions answered only from one project's documents, citing document, version, page and passage, and saying so when the documents don't have the answer | `/app/knowledge` |

## Switching modules on and off

Two switches decide whether someone sees a module, both checked by the API on every request (the
sidebar only follows them):

1. **The organization**: Admin → Settings → *GEM AI modules*. A module switched off disappears for
   everyone, without touching Chat, Work AI or Code. Stored in `organization.gem_settings`.
2. **The person, per workspace**: Admin → Workspaces → *a workspace* → a member's sections
   (`learning`, `calculators`, `knowledge`, next to `chat`, `work`, `code`). New members get all
   three; migration `0022_gem_ai.sql` gave them to every existing member who has Chat.

Org admins always have every module that's switched on. The same settings page holds:

- **Beta calculators**: off shows only the verified ones (in the page, in the API and in chat).
- **New courses per person per day** (default 10) and **lessons written per person per day**
  (default 60). Token budgets apply on top: Learning and Knowledge are metered under their own
  sections in Admin → Usage.
- **Lesson videos**: where they come from (yt-dlp with no key, a YouTube Data API key, or off),
  and the optional key (below).

## Learning

A course is written in two steps, both by the model Auto picks for the person (their model access
and token allowance, like a chat):

1. **The outline**: modules and lessons with objectives. Written when the course is created.
2. **Each lesson**: prerequisites and theory, explanation, equations with every symbol's meaning and
   unit *and when the formula applies*, a worked example with given values and the answer, diagrams
   to look up (named published figures and where to find them, never drawings made up by the
   model), common mistakes, references and takeaways. Written when the lesson is first opened, or
   all at once with *Write the remaining lessons*.

What the model returns must be JSON in the expected shape (`outlineSchema` and `lessonSchema` in
`packages/shared/src/gem.ts`). If it isn't, the model is asked once to fix it; if that fails too,
nothing is stored and the person is told plainly. URLs the model writes are removed: video links
are built only from IDs that a YouTube search returned.

Lessons are kept. Opening a course reads them; *Write a new version* adds a version and keeps the
old one, which can be shown again. Progress, bookmarks and notes are each person's own. A course
is private to the person who made it. Lessons still being written when the server restarts are
picked up again.

**Videos.** Each lesson gets up to four real YouTube videos, found by searching for the lesson's
topics. Admin → Settings → *Lesson videos* chooses where they come from:

- **yt-dlp** (no key): the way [Agent-Reach](https://github.com/Panniantong/Agent-Reach) reads
  YouTube. [yt-dlp](https://github.com/yt-dlp/yt-dlp) runs a flat search (one results page, no video
  page is opened), and every result is then confirmed through YouTube's oEmbed endpoint, which
  answers only for public, embeddable videos and gives the title and channel. Live streams, Shorts
  (under a minute) and videos over 4 hours are left out. The API image includes yt-dlp; elsewhere,
  install it (`pip install yt-dlp`) or set `YT_DLP_PATH`. The search words are one argument after
  `ytsearchN:`, run without a shell, so a topic can never become an option.
- **YouTube Data API key** (stored encrypted, or `YOUTUBE_API_KEY`): `search.list` with safe search,
  then `videos.list` keeps only public, embeddable, processed videos. A search costs 100 of the
  default 10,000 daily quota units; when the quota is used up, lessons say so and videos are added
  the next day.
- **Automatic** (the default): the key when there is one, otherwise yt-dlp when it's installed.
- **Off**: no videos.

Searches are cached for 7 days, whichever source answered. Saved videos are checked again (oEmbed
or `videos.list`) so removed or private ones drop out; one YouTube didn't answer for stays until
the next check. A lesson without videos says why: switched off, quota used up, YouTube
unreachable, or YouTube asking the server to sign in.

YouTube sometimes asks servers to sign in ("confirm you're not a bot"), more often from cloud IP
addresses. Lessons then say so instead of showing no videos. To fix it, give yt-dlp a cookies file
from a browser signed in to a spare Google account (`YT_DLP_COOKIES`, Netscape format, e.g. on the
files volume at `/data/yt-cookies.txt`; each search uses a private copy, so the file can be
read-only), or a proxy (`YT_DLP_PROXY`), or use an API key. yt-dlp follows changes on YouTube's
side, so keep it current: bump `YT_DLP_VERSION` in `deploy/Dockerfile.api` when searches stop
working. The yt-dlp path has no safe-search filter, and using it is subject to YouTube's terms;
the API key is the supported route when that matters.

The search words go to YouTube (Google) either way, and with yt-dlp the server's IP address does
too.

## Calculators

Every number comes from `packages/calculators`, plain TypeScript with tests, never from a model.

- **Formula calculators**: 202 in 20 categories (basic electrical, power electronics, mechanical,
  civil, thermal, instrumentation, chemistry, finance…), across 55 quantities and their units.
  Each states its formula, its assumptions and a formula version that's kept with every saved
  result.
- **Verified vs beta.** A calculator is *verified* when it's checked against at least five
  hand-worked reference cases (`checkDefinition` enforces this). The 20 verified ones
  (`defs/core.ts`) have 101 reference cases between them; the others are *beta*, with at least one,
  and are labelled so. Admins can hide beta calculators.
- **Inputs are validated**: a missing, non-numeric or out-of-range input is an error naming the
  field. A result that isn't a finite number is an error, never a number.
- **Keypads and tools**: basic and scientific calculators (Casio-style precedence: `1/2πf` means
  `1/(2πf)`; DEG/RAD/GRAD, memories, variables, constants), unit converter, equation and linear
  system solvers, matrices, vectors, calculus (symbolic derivatives, integrals, limits, Taylor
  series), statistics and distributions, fractions, primes, complex numbers, sequences, number
  bases and bitwise, IEEE 754, subnets, resistor colour codes, molar mass, physical constants,
  loan/EMI, NPV/IRR, dates and times, random numbers.
- **History and favorites** are each person's own. The server recomputes every result it stores:
  what the browser sends is never trusted.

### In chat

When a chat message asks for a calculation, the tested function runs and the model is told the
exact results, to explain and not to change. The answer shows a result card (calculator, inputs,
outputs, formula version, verified or beta), saved with the message and in the person's history.

The calculation is found, in order:

1. `/calc <id> key=value unit …`, e.g. `/calc buck-ideal Vin=48V D=0.4`: exactly that calculator.
   A unit that can't be read stops it. `/calc` followed by words (`/calc ohm's law 12 V and 0.25 A`)
   goes to the rules below.
2. **Rules**: numbers with units are read from the message and matched to a calculator's inputs by
   quantity and the words next to each number. Every number with a unit must find a place.
3. **With a real model** (not the demo one): the model may pick one of a short list of calculators
   and its inputs, as JSON. Only numbers that appear in the message are accepted, each once and in
   the unit that was written (48 V never runs as 48 kV), and the code runs it.

Numbers are read as written: thousands groups are one number (1,440 rpm, 1,00,000 W) and − is a
minus. A comma between digits that isn't a thousands group (7,5 kW, 3,3 V) could be a decimal
comma, so the tool doesn't run rather than guess. On the calculator screens, a comma in a number is
refused with a message (write 2.5 and 1000).

Ordinary messages are left alone, and people without the Calculators module don't get the tool.

## Knowledge

A question is asked in one project. Answers draw only on that project's sources the person can
open, and, when they switch on *Include general engineering references*, the workspace's reference
library (documents a workspace admin marks as references: textbooks, standards, application notes;
project documents never appear there).

Permission is checked in code, three times, never left to the prompt:

1. **On upload**: the project's edit role.
2. **On retrieval**: the SQL that finds passages reaches only that project's sources the person can
   open, plus the workspace's references when asked, current versions only, finished processing.
3. **On opening a citation**: the person must still be able to open the project and the document,
   and the passage must be one that was retrieved for their question.

Retrieval combines keyword search (Postgres full text) and vector search (pgvector, with the
workspace's embedding model). Vector matches farther than `KNOWLEDGE_MAX_DISTANCE` (cosine distance,
default 0.5) don't count on their own. When nothing relevant is found, the answer is
*"The documents in this project don't contain an answer to this"*, and no model is asked.

Answers cite passages as [1], [2]…; a citation number that doesn't match a retrieved passage is
removed from the answer.
The sources panel shows the document, its version, the page and the excerpt, and warns when a
newer version has been uploaded since. Questions and their sources are kept per person in the
project's history.

**Documents.** Upload in Knowledge → Sources (or the project's sources). Uploading with *New
version* replaces a document: the version goes up and older versions are left out of answers.
Identical content is flagged as a duplicate. *Reindex all* and *Retry failed* process documents
again. Clean, selectable text works best; scanned pages go through OCR.

### Evaluating and tuning retrieval

Embedding models differ in scale, so check `KNOWLEDGE_MAX_DISTANCE` against your own documents.
Write a set of questions with known answers (and some the documents can't answer) and run:

```bash
KNOWLEDGE_EVAL_URL=https://gem.example.com KNOWLEDGE_EVAL_EMAIL=you@company.com \
KNOWLEDGE_EVAL_PASSWORD=… node scripts/knowledge-eval.mjs my-questions.json
```

The format is in `scripts/knowledge-eval.example.json`. The script reports, for each question,
whether the expected documents were retrieved and cited, whether "not in the documents" was said
when it should be, and that every citation is a retrieved passage. Unanswerable questions that
retrieve passages suggest a lower distance; expected documents that are missed suggest a higher
one. It exits with 1 when a case fails.

## Release checks

These block a release, and each has tests that run on every push:

| Check | Tests |
|---|---|
| No leak across projects or people | `apps/api/src/knowledge.test.ts`: 30 denial probes (other projects, private documents, other people's questions and citations, the reference library, instructions hidden in a document, chat attachments, ⌘K search, access or a source removed after an answer, the module switched off…), plus current-version-only retrieval |
| No wrong calculator numbers | `packages/calculators/test/`: every reference case of every calculator, the 20 verified ones with 101 hand-worked cases, plus the expression, symbolic, matrix, statistics and finance engines; `apps/api/src/calculators.test.ts` for the API and chat |
| Citations only point at sources the person can open and passages that were retrieved | `knowledge.test.ts` (citation opening, dropped invented citations) |
| Learning output is validated before it's stored | `apps/api/src/learning.test.ts` (malformed output, URLs, limits, versions, owner-only access) |

## Configuration

| Variable | Default | |
|---|---|---|
| `YOUTUBE_API_KEY` | none | Lesson videos; Admin → Settings can hold one instead |
| `YOUTUBE_API_URL` | `https://www.googleapis.com/youtube/v3` | For tests and proxies |
| `YT_DLP_PATH` | `yt-dlp` | The yt-dlp program lessons search with |
| `YT_DLP_COOKIES` | none | A cookies file (Netscape format) for yt-dlp, when YouTube asks the server to sign in |
| `YT_DLP_PROXY` | none | A proxy for yt-dlp, e.g. `http://proxy:3128` or `socks5://…` |
| `KNOWLEDGE_MAX_DISTANCE` | `0.5` | Cosine distance beyond which a vector match isn't evidence |

## API

| | |
|---|---|
| `GET/PUT /api/admin/gem` | Module switches, beta calculators, limits, video source and YouTube key (org admins) |
| `GET/POST /api/learning/courses`, `GET/PATCH/DELETE /api/learning/courses/:id` | Courses |
| `POST /api/learning/courses/:id/retry`, `…/generate-all` | Write the outline again; write every lesson |
| `GET /api/learning/courses/:id/lessons/:n`, `POST …/generate`, `…/regenerate`, `…/restore`, `PUT …/state` | Lessons, versions, progress, bookmarks and notes |
| `GET /api/learning/tags`, `GET /api/learning/bookmarks` | |
| `GET /api/calculators`, `POST /api/calculators/run` | The catalog; run a formula calculator |
| `GET/POST/DELETE /api/calculators/history`, `PUT /api/calculators/favorites/:id` | History and favorites |
| `POST /api/knowledge/ask` | Ask (server-sent events: `start` with retrieved passages, `delta`, `done`) |
| `GET /api/knowledge/queries`, `GET/DELETE /api/knowledge/queries/:id`, `GET …/citations/:n` | History and citations |
| `GET /api/knowledge/projects/:id`, `POST …/reindex` | A project's documents and their state |
| `GET /api/knowledge/references`, `PUT /api/knowledge/references/:id` | The workspace's general references |

Personal data export (Settings → Your data) includes courses, lessons and their state, calculator
history and favorites, and Knowledge questions.
