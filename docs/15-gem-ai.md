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
  the optional key (below), and how people rated them: totals, the most disliked (each with
  *Block*), the most liked, and the blocked videos (each with *Unblock*). See
  [Rated videos](#rated-videos).
- **Web search**: the provider chat and lessons search with, its server or key, a *Test* button,
  and two switches: *Let people search the web in chat* and *Check lessons before they're saved*
  (both on by default). See [Web search](#web-search).

## Web search

Chat and lessons can search the web through one provider, chosen in Admin → Settings → *Web
search* (`services/web-search.ts`):

| Provider | Needs | Where the search words go |
|---|---|---|
| **SearXNG** (self-hosted) | Its address. Empty: the one in Admin → Work AI | Your own server, which asks the search engines it's set up with |
| **Ollama web search** | An API key from ollama.com | Ollama; results come with each page's text |
| **Brave Search** | An API key (Brave Search API) | Brave |
| **Tavily** | An API key | Tavily; results come with an extract of each page |
| **Serper** | An API key | Serper (Google results) |

- **Off** is the default. Each part comes from Admin → Settings when it's set there, otherwise from
  `WEB_SEARCH_PROVIDER`, `WEB_SEARCH_URL` and `WEB_SEARCH_KEY`; choosing *Off* in Admin → Settings
  switches it off even when the environment sets a provider. A SearXNG address set nowhere falls
  back to Work AI's.
- **Keys** are stored encrypted, never sent back to the browser and never written in the audit log
  or in error messages. A key belongs to the provider it was saved for: after switching to another
  provider it isn't sent there, and switching back uses it again. `WEB_SEARCH_KEY` is used only
  with the provider in `WEB_SEARCH_PROVIDER`.
- **Test** runs one search ("Ohm's law") with what's typed or what's saved and shows how many
  results came back, how long it took and the first few, or what went wrong: the key refused, the
  plan's limit used up, or the provider unreachable.
- **Results**: only `http` and `https` links, each once, titles up to 300 characters and snippets up
  to 600. Searches are cached in memory for 10 minutes per provider and query. A link always comes
  from a search result, never from what a model wrote.
- **Reading pages**: when a result has no page text (SearXNG, Brave, Serper), the server reads the
  page itself: HTML and plain text only, up to 1.5 MB, 8 seconds, scripts, styles, navigation and
  footers dropped. Only public addresses: every address a name resolves to must be public, the
  connection is made to the address that was checked, and each of at most 3 redirects is checked
  again, so a result can't point the server at `localhost`, the cloud metadata service or the
  organization's network. A SearXNG server on this machine or the local network is fine for the
  search itself (the admin set it up), never for reading pages.

The search words go to the chosen provider. With SearXNG they stay on your own server, which
forwards them to the engines in its `settings.yml`; the paid providers see them, and with Ollama
and Tavily they also send back page text.

### Web search in chat

When a provider is set up and *Let people search the web in chat* is on, the chat box has a
**Search the web** button (the globe). It's per message: once switched on it stays on for that
chat's messages until it's switched off, and a chat whose last answer searched the web opens with
it on. People without the Chat section never see it, and Work AI keeps its own web search
(Admin → Work AI). The server checks the organization's switch and the provider on every message;
what the browser sends can't turn it on (`services/chat-web.ts`):

1. **Queries**: one small model call (the person's fast-tier model when they have one with budget
   left, else the model answering) reads the last few turns and writes 1 to 3 search queries as
   JSON. If it fails or writes no JSON, the message itself is searched. Its tokens are metered
   under Chat. Greetings and thank-yous search nothing.
2. **Search**: each query gets up to 5 results; one per link, the best 6 are kept (each query's
   first result, then each one's second…), and up to 4 pages without text are read (3,000
   characters each, public addresses only, as above).
3. **Answer**: the model gets the pages as numbered extracts, after any document sources (with two
   document passages, the web sources are [3] to [8]). It's told to cite them by number, to say
   plainly when they don't answer the question, to prefer them over what it remembers for current
   facts, never to write URLs, and to treat the pages as data, not instructions. Auto treats a
   message with web sources like one with documents: at least a standard model.
4. **Citations**: a number that matches no source is taken out of the saved answer (code is left
   alone). The sources are saved with the answer as citations of kind `web` with the title, the
   link from the provider and a snippet; `message.web` (migration `0024_chat_web.sql`) keeps the
   queries, the provider and, when there are no sources, why.

While it works, the answer shows *Searching the web…* with the queries, then *Searched the web*
with the sources as chips while the answer is written. Under the answer, *Sources* lists each page
(title and site) and opens it in a new tab; the inline [n] markers open the same page. Links in
the answer itself that the model wrote show as plain text: links come only from search results.
Downloads (Word, Markdown, PDF) list each web source with its link.

A provider that fails doesn't fail the message: the answer is written without web sources, the
model says it couldn't check the web, and a note under *Searched the web* says why ("Web search
failed: The search provider refused the key."). The note is also shown when the organization has
switched web search off for chat or no provider is set up. Web sources and queries are part of the
person's chats in their data export, and go with their chats.

## Learning

A course is written in two steps, both by the model Auto picks for the person (their model access
and token allowance, like a chat):

1. **The outline**: modules and lessons with objectives. Written when the course is created.
2. **Each lesson**: prerequisites and theory, explanation, equations with every symbol's meaning and
   unit *and when the formula applies*, a worked example with given values and the answer, diagrams
   to look up (named published figures and where to find them, never drawings made up by the
   model), common mistakes, references and takeaways. Written when the lesson is first opened, or
   all at once with *Write the remaining lessons*. With lesson checks on, each one is written from
   web sources and checked before it's saved: see [Checked lessons](#checked-lessons).

What the model returns must be JSON in the expected shape (`outlineSchema` and `lessonSchema` in
`packages/shared/src/gem.ts`). If it isn't, the model is asked once to fix it; if that fails too,
nothing is stored and the person is told plainly. URLs the model writes are removed: video links
are built only from IDs that a YouTube search returned.

Lessons are kept. Opening a course reads them; *Write a new version* adds a version and keeps the
old one, which can be shown again. Progress, bookmarks and notes are each person's own. A course
is private to the person who made it. Lessons still being written when the server restarts are
picked up again.

### Checked lessons

With *Check lessons before they're saved* on (the default), each lesson is written from web
sources and checked by a second, stronger model before it's saved (`services/learning-check.ts`):

1. **Sources** (when web search is set up): 2 or 3 searches built from the course topic, the
   lesson's title and its summary in the outline, without a model call (the title with the topic,
   the topic with the summary, the title with "worked example"). Each gets up to 4 results; one per
   link, the best 6 are kept, and pages without text are read (2,500 characters each, public
   addresses only, as in [Web search](#web-search)). A search that fails doesn't stop the lesson:
   it's written and checked without sources, and the check says why.
2. **Writing**: as before, by the model Auto picks, with the sources as numbered extracts. The
   writer is told to use them to get facts, formulas, constants and references right, not to copy
   their text, and to name only books and standards it's sure exist, preferably ones the sources
   mention.
3. **The check**: one call on the person's Advanced-tier model. The router is asked for a hard
   pick directly, without its rules or the judge; the person's model access and token allowance
   apply, and without an Advanced model the usual order follows (standard, then fast, then their
   default model). First, each reference the lesson cites (up to 5) is searched for by its title
   and author (3 results), so the checker can see whether it exists. The checker gets the lesson
   as JSON, the numbered sources and those lookups, and returns JSON (`lessonCheckSchema` in
   `packages/shared/src/gem.ts`): what it corrected (the part, the problem, the fix, how much it
   matters and the sources that show it), the whole corrected lesson, and each calculation in the
   lesson as a plain-number expression with the value the lesson gives. References it can't
   confirm are removed or replaced with real ones. A reply in the wrong shape gets one retry.
4. **Arithmetic**: each expression is worked out by the calculators' engine
   (`packages/calculators`), never by a model. A result more than 0.5 % away from the lesson's
   (or 1e-9 near zero) goes back to the checker once, with the list, for a final lesson; what's
   still wrong is kept as an open issue (*Not corrected: check this value before you rely on it*).

The corrected lesson is what's saved, with `course_lesson.verification` (migration
`0025_lesson_checks.sql`): the outcome (`checked`, `corrected`, or `not_checked` and why), the
checker's model and the date, the provider, the sources (title and the provider's link), the
corrections and the arithmetic. While a lesson is being made, `course_lesson.stage` says what's
happening, and the lesson shows it: *Finding sources…*, *Writing…*, *Checking…*, *Finding videos…*.

A check that fails (the model errors, its reply misses the shape twice, the token allowance is used
up) never fails the lesson: it's saved as written, marked *Not checked*, with the reason. URLs are
removed from the checker's lesson as from the writer's; the only links are the provider's search
results. The checker's tokens are metered under Learning, like the writer's.

In the lesson, a badge by the title says *Checked*, *Checked · 3 corrections* or *Not checked*, and
*How this lesson was checked*, at the end, lists the model and date, each correction (part,
problem → fix, severity and its sources), the arithmetic checks (the expression, what the lesson
says, what it comes to, ✓ or ✗) and the sources with their sites. *Check this lesson*, next to
*Write a new version*, researches and checks the current lesson again and saves the result as a
new version, keeping its videos; it counts against the day's lessons like a new version. With the
switch off, lessons are written as before: no searches, no check, and *Check this lesson* isn't
offered.

### Lesson videos

Each lesson gets up to seven real YouTube videos. The lesson names one to three search phrases;
each search asks for 10 results, every result is confirmed (below), and each video is kept once.
Admin → Settings → *Lesson videos* chooses where they come from:

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

### Rated videos

Which seven a lesson shows (`services/lesson-videos.ts`):

1. **Left out first**: videos an admin blocked, videos the lesson's owner marked *Not helpful*,
   and videos the organization found unhelpful: at least two *Not helpful* ratings and more of
   them than *Helpful*.
2. **The pick**: one small model call (the person's fast-tier model first, then standard; their
   model access and token allowance apply, metered under Learning) gets the lesson's title, level
   and objectives and the numbered candidates, each with its channel, length and the
   organization's ratings so far. It returns `{ "picks": [{ "index": n, "why": "…" }] }`
   (`videoPicksSchema` in `packages/shared/src/gem.ts`), best first, up to seven, leaving out
   off-topic videos, other languages, adverts, trailers and course promotions, clips under two
   minutes that only define a term, and near-duplicates, and preferring full explanations and
   lectures from universities, NPTEL, manufacturers and established educators. Only numbers of
   real candidates count, each once. The `why` is kept with the video and shown on its card.
3. **When the pick fails** (the model errors, the reply isn't the JSON asked for, no number matches a
   candidate, the token allowance is used up), the candidates stay in search order. There's no
   retry: search order is the fallback.

Under each video, the lesson's owner can say *Helpful*, *Okay* or *Not helpful*; each button shows
how many people in the organization chose it. After *Not helpful* the card folds away to *You marked
this not helpful · Undo*, with optional reasons (off topic, poor quality, wrong language, too long,
other). A person has one rating per video, whichever lesson they rated it in, and can change it or
take it back. Ratings are stored in `video_feedback` (migration `0026_video_feedback.sql`); a
lesson keeps the videos it already has, so a video the owner marked stays there, folded, for *Undo*.
The ratings are in the person's data export (`learning/video-ratings.json`) and are deleted with
them.

Admin → Settings → *Lesson videos* lists the totals, the ten most disliked (their counts, top
reasons, and whether new lessons already leave them out) and the ten most liked. *Block* adds a
video to `video_block`: it's never offered to a lesson again, it's hidden from lessons that have it
at once, and those lessons drop it from what's saved the next time they're opened (their videos are
checked again then). *Unblock* lets new lessons offer it again; lessons that dropped it don't get it
back. Blocking and unblocking are in the activity log (`video.blocked`, `video.unblocked`).

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
| Web search reads pages only at public addresses, and its keys never leave the server | `apps/api/src/web-search.test.ts` (private addresses by IP, by name, mixed answers and after redirects; the key not in errors, responses or the audit log; a key never sent to another provider) |
| Chat's web sources are real search results and every citation matches one | `apps/api/src/chat-web.test.ts` (sources saved and cited after the documents', invented numbers removed, nothing searched with the switch off, a failing provider leaves an answer and a note, private pages never read) |
| Lesson videos are picked only from real results, and ratings and blocks keep bad ones out | `apps/api/src/learning-videos.test.ts` (seven picked from three searches of ten, invented numbers ignored, search order when the pick fails, ratings owner-only and only for the lesson's videos, the organization's dislikes and an admin's block keeping a video out of new lessons, ratings in the export and gone with the person) |
| A checked lesson keeps only real sources, and a failed check never loses a lesson | `apps/api/src/learning-check.test.ts` (corrections saved with their issues and sources on the Advanced tier, a wrong calculation sent back once, a failing checker or search leaves the lesson ready, links only from the provider, *Check this lesson* as a new version and owner-only, the switch off) |

## Configuration

| Variable | Default | |
|---|---|---|
| `YOUTUBE_API_KEY` | none | Lesson videos; Admin → Settings can hold one instead |
| `YOUTUBE_API_URL` | `https://www.googleapis.com/youtube/v3` | For tests and proxies |
| `YT_DLP_PATH` | `yt-dlp` | The yt-dlp program lessons search with |
| `YT_DLP_COOKIES` | none | A cookies file (Netscape format) for yt-dlp, when YouTube asks the server to sign in |
| `YT_DLP_PROXY` | none | A proxy for yt-dlp, e.g. `http://proxy:3128` or `socks5://…` |
| `WEB_SEARCH_PROVIDER` | none (off) | `searxng`, `ollama`, `brave`, `tavily`, `serper` or `off`, used until a provider is chosen in Admin → Settings |
| `WEB_SEARCH_URL` | none | The SearXNG server for chat and lessons, when Admin → Settings doesn't set one (then Work AI's) |
| `WEB_SEARCH_KEY` | none | The API key for `WEB_SEARCH_PROVIDER` (not SearXNG); Admin → Settings can hold one instead |
| `KNOWLEDGE_MAX_DISTANCE` | `0.5` | Cosine distance beyond which a vector match isn't evidence |

## API

| | |
|---|---|
| `GET/PUT /api/admin/gem` | Module switches, beta calculators, limits, video source and YouTube key, web search provider, server, key and switches (org admins; the keys are never returned) |
| `POST /api/admin/gem/test-web` | One test search with the given or saved provider, server and key: `{ ok, results, ms, sample, error }` (org admins) |
| `POST /api/chats/:id/messages` with `webSearch: true` | Search the web for this answer. Extra server-sent events: `searching {queries}`, then `search {queries, provider, sources: [{n, title, domain}], citations, note}` before the answer; `done` carries `content` when a citation number was taken out. `GET /api/me` says whether chat offers it (`gem.webSearch`) |
| `GET/POST /api/learning/courses`, `GET/PATCH/DELETE /api/learning/courses/:id` | Courses |
| `POST /api/learning/courses/:id/retry`, `…/generate-all` | Write the outline again; write every lesson |
| `GET /api/learning/courses/:id/lessons/:n`, `POST …/generate`, `…/regenerate`, `…/restore`, `PUT …/state` | Lessons, versions, progress, bookmarks and notes. A lesson has `stage` while it's made, `verification` (how it was checked, or null) and `canCheck` (the organization checks lessons) |
| `PUT /api/learning/courses/:id/lessons/:n/videos/:videoId/feedback` | Rate a video of that lesson: `{ rating: "up" \| "ok" \| "down" \| null, reason? }` (null takes it back; a reason only with `down`: `off_topic`, `poor_quality`, `wrong_language`, `too_long`, `too_short`, `broken`, `other`). The course's owner; 404 for a video the lesson doesn't have. Answers `{ myRating, myReason, counts }`. The lesson's `videos` carry `why`, `myRating`, `myReason` and `counts: { up, ok, down }` |
| `GET /api/admin/gem/videos/feedback` | Video ratings: `totals`, `mostDisliked` (with `reasons` and `leftOut`), `mostLiked`, `blocked` (org admins) |
| `PUT /api/admin/gem/videos/:videoId/block` | `{ blocked, reason? }`: block a video for everyone, or unblock it (org admins) |
| `POST /api/learning/courses/:id/lessons/:n/check` | Research and check the current lesson, saved as a new version with its videos (the course's owner; counts against the day's lessons; 403 when lesson checks are off) |
| `GET /api/learning/tags`, `GET /api/learning/bookmarks` | |
| `GET /api/calculators`, `POST /api/calculators/run` | The catalog; run a formula calculator |
| `GET/POST/DELETE /api/calculators/history`, `PUT /api/calculators/favorites/:id` | History and favorites |
| `POST /api/knowledge/ask` | Ask (server-sent events: `start` with retrieved passages, `delta`, `done`) |
| `GET /api/knowledge/queries`, `GET/DELETE /api/knowledge/queries/:id`, `GET …/citations/:n` | History and citations |
| `GET /api/knowledge/projects/:id`, `POST …/reindex` | A project's documents and their state |
| `GET /api/knowledge/references`, `PUT /api/knowledge/references/:id` | The workspace's general references |

Personal data export (Settings → Your data) includes courses, lessons (with how each version was
checked) and their state, calculator history and favorites, and Knowledge questions.
