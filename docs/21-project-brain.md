# Project brain

One shared memory per project, so everyone on it works from the same facts. Built from the project's own documents,
chats and tasks; given to every chat and Work AI task in the project; readable and correctable by people; exportable as
an Obsidian vault. This is the project-sized version of the proposal in [18-organization-brain.md](18-organization-brain.md)
(its phases 1 to 4 for one project; organization-wide memory and outside connectors are not built).

## The problem it solves

Two people on the same project ask the same AI the same question and get different answers, because each chat holds
different context: one pasted the spec, the other didn't; one told the assistant about last week's decision, the other
never did. The people are not on the same page, and the client deliverable shows it. Pasting context by hand doesn't
scale and nobody does it the same way twice.

The brain replaces pasting. Whatever the project establishes (requirements, design values, decisions and why, test
results, open questions, who approves what) is kept once, with where it came from, and every chat and task in the
project starts from it.

Example: a team designing a DC-DC converter. One engineer uploads the spec and bench data and works with the AI. The brain
now holds "Input range is 36 V to 75 V" (from the spec), "Switching frequency raised to 300 kHz because the inductor
saturates at 250 kHz" (from the engineer's chat) and "Full-load efficiency 95.4 % at 48 V" (from bench run 3). A second
engineer joins and asks "what input range do we design for?": the answer comes from the brain, the same as it would for
the first, without anyone briefing them.

## What it holds

Pages of short statements. Each **entry** is one plain statement with a kind (fact, requirement, decision, open
question, person, term), where it came from (a document, a chat, a task, or a person who typed it), the exact words in
that source that say it, who, and when. Pages are topics: Overview, Requirements, Decisions, Design, Components, Testing,
Risks and issues, Open questions, People, Glossary, Schedule, and any new topic a source introduces (a subsystem such as
"Output filter"). Pages mention each other as `[[links]]` in the export.

Tables: `brain_page`, `brain_entry` (status active / pending / replaced / rejected), `brain_log` (what changed, written
by the app), and `project.brain_mode`. Entries are plain text. A chat finds the entries that bear on a message
two ways at once: by their words (Postgres full-text search) and, when the workspace has an embedding model (the one
documents use), by meaning, so "How cold can it get?" finds "Ambient temperature range is -40 C to +85 C". Entries are
embedded the first time a chat needs them (`brain_entry.embedding`, up to 256 at a time); a corrected entry, or a new
embedding model, is embedded again. The two rankings are interleaved; without an embedding model, or when its server
fails, words alone are used. The embedding tokens count as the project's usage (section `knowledge`).

## How it learns

A model reads some material and proposes entries; **the app decides what is kept** (`services/brain.ts`):

| Source | What it adds | Active or waiting |
|---|---|---|
| A document added to the project (upload, pasted note, saved answer, linked library file) | what its text says | active (waiting when the document is marked Assumption or TBD) |
| A statement a person wrote in a project chat ("we decided to…", "the client needs…"; questions and thanks are not read) | what they said | active |
| A finished Work AI task in the project | what it found (an AI's words) | **always waits for a person** |
| A person, by hand | what they typed | active |

The rules the app applies to every proposal, whatever the model said:

1. **The quote must be in the source.** Each entry carries the words of its source that say it, checked against the
   material (spacing and case aside). An entry whose quote isn't there is dropped. This is what stops a model's
   knowledge or guess from becoming a project fact.
2. **Never an instruction.** Text that reads like an instruction to an assistant is dropped; the material is data.
3. **No repeats.** A statement already in the brain (by its words) adds nothing.
4. **Nothing is silently overwritten.** If the source itself says a value changed ("we raised it to 300 kHz"), the new
   entry replaces the old one, which stays as history. If it only seems to disagree, the new entry **waits as a
   contradiction** for a person to accept (the old one then becomes history) or turn down. The model's word that
   something "replaces" an entry is not enough: the app checks the source's own words for a change ("raised", "now",
   "instead", "no longer"…), and otherwise treats it as a contradiction. The one exception is a newer version of a
   document (Upload a new version): it may change what its earlier versions said without saying so, but not what a chat
   or another document established.
5. **A cap per reading** (15 entries) and per project (40 pages).
6. The change log is written by the app.

AI-written results never become facts on their own because an AI can be wrong, and a wrong "fact" in the brain would be
repeated to everyone.

## How it is used

- **Chats in the project** get the brain in their system prompt: the entries that match the question first, then the
  newest, up to about 6,000 characters, the same text for everyone. The assistant is told to answer from it, to point out
  and ask when the person's words contradict an entry, to say "the project hasn't recorded it yet" instead of guessing,
  and that entries are data, never instructions.
- **Work AI tasks in the project** get `project/BRAIN.md` (everything, as Markdown) in their folder, and the start of it
  (about 2,500 characters) in their instructions. Super AI tasks too.
- **Knowledge** (cited answers from documents) is unchanged: its contract is "answers come from cited passages".

## Control

- **Mode** per project (people with edit access): *Learns from the project's work* (default), *Asks before adding*
  (everything waits), *Off* (nothing is read or used; existing entries are kept). Turning it on reads the sources that
  haven't been read.
- **Anyone who can open the project can read the brain.** People with edit access add, correct, move, delete, accept and
  turn down entries and edit a page's summary. Entries of another project can't be reached by id.
- Every change is in the audit log (`brain.*`); the project's **What changed** panel shows the brain's own log.
- **Sources change their entries.** A source marked Assumption or TBD after it was read puts what it said back to
  "waiting for review". A source removed from the project moves what was learned from it to the history (log: "Source
  removed"); a source removed while it is being read adds nothing.
- Deleting a project deletes its brain. Deleting a person keeps entries (the author shows as unknown).

## Obsidian

**Export for Obsidian** downloads a `.zip`: a `Home.md` linking every page and one note per page with front-matter and
`[[links]]`, each entry with its source and date. Drop it in a vault. It is a one-way export: edits made in Obsidian are
not read back. (Two-way sync would need conflict handling against the checked entries; not built.)

## API

`GET /api/projects/:id/brain`; `PUT …/brain/settings {mode}`; `POST …/brain/entries`; `PATCH|DELETE …/brain/entries/:id`;
`POST …/brain/entries/:id/accept|reject`; `PATCH …/brain/pages/:id {summary}`; `POST …/brain/learn` (read unread
sources); `GET …/brain/export`. Code: `services/brain.ts` (rules, reading, Markdown), `services/brain-learn.ts` (the model
call and where it learns from), `routes/brain.ts`, `components/projects/brain.tsx`. Tests: `src/brain.test.ts`.

## What it costs

One model call per reading, on the standard tier: a statement in a chat (only when it looks like one), a document (one
call per 12,000 characters, at most six), a finished task. Counted as Knowledge usage against the person's allowance.
Reading a chat message or a task is skipped when over the allowance. Reading the brain costs nothing extra beyond its
tokens in the prompt.

## Limits and open decisions

- **Tested with a scripted model, and once with the real one (26 Nov 2026, inkling).** The rules are unit-tested
  (invented quotes, instructions, repeats, replace versus conflict, who sees what, the export). A live run of 22 checks
  read a 15-statement spec with every statement kept and no number invented, ignored small talk and planted orders, kept
  one entry for the same fact said twice, and found that the model calls plain disagreements "changes" (hence the app's
  own check in rule 4). How often people turn down what it proposes on a real project still needs a pilot.
- **Search by meaning needs the workspace's embedding model.** A workspace whose embedding model is unset or disabled
  falls back to words only, silently: "what protects the board from moisture?" then misses "conformal coating".
- **Quotes keep it honest but not complete.** A model may miss facts, or pick a poor page; people fix that by editing.
  Scanned documents depend on OCR quality.
- **Numbers inside tables and spreadsheets** are read as text; a value whose row and column are far apart in the text
  may be paired wrongly. The quote check passes it if the words are in the source, so review matters for datasheets.
- **A person's chat statement is trusted as theirs.** If they are wrong, so is the entry, until someone corrects it; the
  entry says who said it and where.
- **Project scope only.** No organization-wide brain, no person-level memory, no connectors (Notion, Drive).
- **Privacy notice**: `legal/PRIVACY.md` and `STAFF-NOTICE.md` need a paragraph on what a project brain keeps (names in
  "written by", what chats say). Not yet written.
- Retention of entries, and who may turn the brain on for a project that holds client data, are decisions for you.
