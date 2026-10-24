# Organization brain: a shared memory of the organization and its projects

A proposal, not yet built. It describes how GEM AI could remember what an organization knows
(people, decisions, customers, standards, lessons learned, project history) and give the right part
of it to Chat, Work AI, Code, Knowledge and Learning, without anyone pasting the same context again.
It compares three ways to get there: TencentDB Agent Memory, an Obsidian-style vault, and building
on what GEM AI already has. It ends with a recommended design, the work in phases, and the open
decisions.

## 1. What "brain" means here

People want three things from it:

1. **It remembers.** Facts and decisions said once are known next time: "Customer Acme wants
   IP54 enclosures", "We stopped using supplier X in 2025 because of late deliveries", "Rahul is
   the approver for drives above 30 kW".
2. **It knows the projects.** For a project: what it is, who's on it, the requirements, the
   documents and their latest versions, the decisions and why, open issues, what was tried and
   failed, what was delivered.
3. **It gets better.** Work done in Chat, Work AI and Code leaves something behind: a fact, a
   decision, a reusable procedure, an updated project page.

And four rules that make it usable in a company:

- **Permissions.** A member only ever gets memory from projects and sources they can open. Personal
  memory stays personal. This is the same rule Knowledge already enforces in code.
- **Sources.** Every remembered fact says where it came from (a chat, a task, a document page, a
  person), and when.
- **Control.** People can see, correct and delete what's remembered about them and their work.
  Admins can review what's shared organization-wide.
- **Freshness.** Newer facts replace older ones ("the deadline moved to March"), and the old one is
  kept as history, not silently overwritten.

## 2. What GEM AI already has

A large part of the brain exists already. Anything new should build on it, not beside it.

| Already there | Where | What it gives the brain |
|---|---|---|
| Projects with members, instructions, sources and connectors | `project`, `projectMember`, `projectSource` | The container and the permission boundary for project knowledge |
| Documents with versions, OCR, chunks and embeddings | `document`, `documentChunk` (pgvector), `services/documents.ts`, `services/extract.ts` | Search over files, scanned pages, PDFs |
| Knowledge answers with checked citations, three permission checks in code | `services/knowledge.ts`, `docs/15-gem-ai.md` | The retrieval engine and the "only what you may open" rule |
| Project chats and Work AI tasks cited as sources (`kind: "chat" \| "task"`) | `Citation` in `packages/db/src/schema.ts` | Past work in a project is already searchable |
| Custom instructions (person) and project instructions | `user.customInstructions`, `project.instructions` | Always-on context, hand-written |
| Skill library (org-wide and personal) | Work AI skills, `docs/08-skills.md` | Reusable procedures for agents |
| Connectors (Notion, Google Drive, Slack, GitHub… through MCP) | `connector`, `docs/09-connectors.md` | Reach into tools where knowledge already lives |
| Web search, lesson checks, citations rules | `services/web-search.ts`, `services/learning-check.ts` | Checking memory against outside sources |
| Personal data export and deletion | `services/personal-data.ts` | Control over remembered personal data |

**What's missing** is the "remembers and learns" part: GEM AI retrieves from documents and past
chats when asked, but nothing distils them into facts, decisions or a project summary, nothing
carries a fact from one chat to the next unless a person writes it into instructions, and there is
no page a person can read to see "what GEM AI knows about project X".

## 3. Option A: TencentDB Agent Memory

<https://github.com/TencentCloud/TencentDB-Agent-Memory>, MIT licence, Node 22, version 2.0.0
(checked 24 Oct 2026).

### What it is

Three services, normally run with Docker:

| Service | Port | Does |
|---|---|---|
| Memory Core | 8420 | Stores memory and skills, authentication, retrieval (BM25 + vectors + RRF) |
| Memory Hub (panel + Knowledge) | 8125 / 8424 | Web panel for teams and assets; turns documents into a **Wiki** with a link graph and code into a **CodeGraph** |
| Proxy | 8096 | Sits between an agent and its model; injects memory into the prompt and records the conversation |

Memory is layered:

| Layer | Holds |
|---|---|
| L0 Conversation | Raw conversations |
| L1 Atom | Facts, preferences, constraints, events extracted from conversations |
| L2 Scenario | Knowledge grouped by project or situation |
| L3 Core / Persona | Long-term profile and stable patterns |

Besides memory it manages **Skills** (versioned procedures), **Wiki** pages built from documents,
and **CodeGraph** (symbols, files, call relationships, impact). Each asset has an owner, a version
and a visibility: `private`, `team`, `restricted` (ACL by user, role or agent) or `agent`. Agents
reach Wiki and CodeGraph as tools (`/v3/tools/list`, `/v3/tools/call`) instead of having
everything pasted in. It reports a PersonaMem benchmark rising from 48 % to 76 %.

It supports DeepSeek Harness (dsh), which is the runtime behind GEM AI's Work AI and Code, plus
Claude Code, Codex and others. Storage is SQLite by default (MongoDB experimental). It needs an
LLM for extraction and Wiki building (`MEMORY_LLM_BASE_URL`, OpenAI or Anthropic protocol), so it
could use the same Ollama Cloud or local models GEM AI uses.

### Three ways to connect it

**A1. Put its Proxy in front of the models.** Point GEM AI's model provider at the Proxy, as its
README suggests for single agents.
- Fastest to try.
- **Not suitable for a multi-user GEM AI as is.** The Proxy identifies the person, team and agent
  from the key and headers of each request. GEM AI calls models with one provider key for
  everyone, so all users would share one memory, and Knowledge's permission rules would be
  bypassed. The Proxy also rewrites the system prompt, which conflicts with GEM AI's own routing,
  citations and project instructions. Only as an experiment for one person's Code workspace.

**A2. Use its API from the GEM AI server (recommended if you choose this option).** GEM AI stays in
charge of who can see what, and calls Memory Core and Knowledge as a service:
- On each chat turn or task: `POST /v3/conversation/add` with the person's own Memory key and their
  team (mapped from the GEM AI workspace and project).
- Before answering: search L1/L2 for the person and project, filter the results again through
  GEM AI's permission checks, and add them to the prompt as numbered, cited context (the same
  way web sources are added in chat).
- Documents: either keep GEM AI's Knowledge as the source of truth and send only links, or let the
  Hub build Wiki pages from the same files (a second copy to keep in step).
- Code workspaces: build a CodeGraph per repository and give Code tasks its tools.
- Map GEM AI people, workspaces and projects to Memory users, teams and agents with an admin key,
  and keep the mapping in GEM AI's database.

**A3. Use only its ideas.** Take the layered design (L0 to L3), the asset model (owner, version,
visibility) and the Wiki/CodeGraph approach, and build them inside GEM AI on Postgres (Option C).

### Pros and cons

| For | Against |
|---|---|
| Ready memory extraction, layers, skills, Wiki and CodeGraph | A second system with its own users, teams and permissions to keep in step with GEM AI |
| Supports DeepSeek Harness (Work AI, Code) | A second copy of organization data outside GEM AI's database, backups and personal data export/delete |
| MIT licence | Fast-moving (2.0.0, adapter protocol changed in Sept 2026); docs partly Chinese; MongoDB experimental; CodeGraph for private repos still in progress |
| Proven benchmark gain | Default storage SQLite, single instance; scale and HA for 10k+ pages not shown |
| Visibility model close to what we need | Its Proxy approach doesn't fit a multi-user server |

## 4. Option B: an Obsidian-style vault

An Obsidian vault is a folder of Markdown files with `[[links]]`, tags and front-matter. It's not a
server, but it's a good human-readable shape for a brain.

### What it would look like

```
GMS-brain/
  Organization/
    Company.md            # who we are, products, policies
    People/Rahul Mehta.md # role, expertise, approver for…
    Customers/Acme.md     # requirements, contacts, history
    Suppliers/…
    Standards/IEC 61439.md
  Projects/
    GMS-7731 Motor drive/
      Overview.md         # goal, scope, status, team
      Decisions.md        # dated decisions with reasons and links
      Requirements.md
      Lessons learned.md
      Meetings/2026-10-20.md
  Procedures/             # how we do a FAT, a release, a design review
```

Each page has front-matter such as:

```yaml
---
type: decision
project: GMS-7731
date: 2026-10-20
owner: rahul@gms.example
source: chat:6d38… / task:0b9a… / doc:datasheet-rev-c p.2
visibility: project      # org | project | private
supersedes: Decisions.md#2026-09-02-cooling
---
```

### Three ways to connect it

**B1. Import the vault into Knowledge.** Sync the folder (git or a shared drive) and index each
page as a project or reference source. Links and tags become metadata. Read-only for GEM AI.
Easiest; GEM AI's permission rules apply as for any document.

**B2. Two-way: GEM AI writes to the vault.** After a chat or task, GEM AI proposes a change
("add decision: switch to IP54 enclosure, reason: customer request in chat …") and, once a person
approves, commits it to the vault (git). Obsidian users see and edit the same pages.

**B3. Through a connector.** Use an MCP server for the vault (or Notion, Google Drive, Confluence,
which GEM AI already connects to) so Work AI can read and update pages as a tool.

### Pros and cons

| For | Against |
|---|---|
| People can read and edit everything, in plain Markdown, offline | No permissions inside a vault; per-project access needs separate vaults or folders and careful sync |
| Git history = full audit trail and easy rollback | Not automatic: someone (or GEM AI) has to write the pages |
| Links make relationships visible (people, customers, projects) | Search and retrieval still need GEM AI's Knowledge (Obsidian's own search isn't reachable by agents) |
| No new server | Desktop app; many teams won't install Obsidian |

## 5. Option C: build it into GEM AI (recommended)

Use Option B's shape (readable pages with sources and history) and Option A's ideas (layered
memory, asset visibility, distilling work into facts), on GEM AI's own Postgres, permissions and
UI. Keep TencentDB Agent Memory as an optional connector for teams that already run it.

### 5.1 What gets stored

| Kind | Example | Scope |
|---|---|---|
| **Fact** | "Acme requires IP54 for outdoor panels." | person, project or organization |
| **Decision** | "2026-10-20: use 25 mm² cable for M-104 because of 3 % drop limit; approved by Rahul." | project |
| **Preference** | "Rahul wants reports in Hindi and English." | person |
| **Procedure** | "How we run a factory acceptance test" (steps, checks) | organization (becomes a Work AI skill) |
| **Project page** | A living summary: goal, status, team, open issues, latest documents, key decisions | project |
| **Entity page** | Customer, supplier, product, standard, person: what we know and where it came from | organization or project |

Every item has: text, kind, scope (person / project / workspace / organization), sources (chat
message, task, document page, person), author (person or "GEM AI, approved by …"), status
(proposed / active / replaced / deleted), dates (said, valid from, replaced), confidence, and links
to related items. Embedded with the workspace's embedding model, so it's searchable like document
chunks.

### 5.2 How memory is made

1. **Said explicitly.** "Remember that…" in chat, or "Save to brain" on a message: a fact or
   decision is proposed, the person picks the scope, it's saved with the message as its source.
2. **Distilled after work.** After a chat or a Work AI task in a project, a small model call (fast
   tier) reads the turn and proposes candidate facts and decisions. They appear as suggestions
   ("3 things to remember from this chat"); a person accepts, edits or dismisses them. Nothing
   goes into shared memory without a person accepting it; personal memory can be automatic if the
   person turns that on.
3. **From documents.** When a project document is uploaded or a new version arrives, GEM AI updates
   the project page's "Documents" and "What changed" sections, citing pages.
4. **Project page upkeep.** Nightly (or on demand), the Advanced tier rewrites each active project
   page from its accepted facts, decisions, documents and recent tasks, with citations. Older
   versions are kept.
5. **Conflicts.** A new fact that contradicts an active one is shown side by side ("the deadline
   was 1 Feb, this chat says 1 March"): the person picks which stands; the old one becomes
   "replaced" with a link.
6. **Checking.** For facts about the outside world (standards, prices, specs), the same web-search
   check used for lessons can confirm or flag them.

### 5.3 How memory is used

- **Chat:** before answering, search memory in the person's scope (their personal items plus the
  current project's and the organization's, filtered by the same permission checks as Knowledge).
  Add the best few as numbered context with citations, like web sources. A small "Remembered" line
  under the answer shows which items were used, each linking to its source.
- **Projects:** the project page is always in the context of chats and tasks in that project (short
  version), with the full page and search available as a tool.
- **Work AI and Code:** a `brain_search` and `brain_propose` tool for the agent; project
  procedures loaded as skills; Code gets the project's decisions about the codebase.
- **Knowledge:** answers can include memory items as sources next to documents, marked as such.
- **Learning:** a course can be "for project X" and use its page and documents.

### 5.4 Control and privacy

- A **Brain** page: per project and per person, lists what's remembered, by kind, with sources;
  edit, replace, delete. Search over it.
- Personal memory is visible only to its owner. Project memory to the project's members.
  Organization memory to everyone, and only org admins (or people they assign) can accept items
  into it.
- Turning memory off: per person, per project, per organization.
- Personal data export includes all of a person's memory items; deleting a person deletes their
  personal items and anonymizes their authorship elsewhere (as other data does today).
- Audit log for every accept, edit and delete in shared memory.
- The privacy notice and staff notice (`legal/`) need a paragraph on what is remembered.

### 5.5 Connecting outside brains

- **Obsidian or Markdown folder:** import (B1) as project or organization sources; optional export
  of the brain as a vault (project pages, decisions, entities as Markdown with front-matter and
  links), so people who like Obsidian can read it there.
- **Notion, Confluence, Google Drive, SharePoint:** sync selected spaces into Knowledge sources
  through the existing connectors.
- **TencentDB Agent Memory:** an optional "external memory" provider using its API (A2), for teams
  already running it; GEM AI still filters everything by its own permissions.

### 5.6 Data model sketch

```
brain_item       id, workspace_id, project_id?, owner_id?, scope (personal|project|workspace|org),
                 kind (fact|decision|preference|procedure|entity|page), title, body,
                 status (proposed|active|replaced|deleted), confidence, valid_from, replaced_by,
                 created_by, accepted_by, embedding (vector), created_at, updated_at
brain_source     item_id, kind (message|task|document_chunk|person|web), ref_id, quote, url
brain_link       from_item, to_item, relation (about|supersedes|depends_on|mentions)
brain_page_version  item_id, version, body, created_at, model_id
brain_setting    per org/project/person: on/off, auto-accept personal, who can accept org items
```

Retrieval reuses Knowledge's hybrid search (Postgres full text + pgvector) and its permission SQL,
extended to `brain_item`.

## 6. Work in phases

| Phase | Scope | Size |
|---|---|---|
| 1. Explicit memory | `brain_item` + sources; "Remember this" in chat; Brain page (view, edit, delete); used in chat with citations; personal and project scopes; export/delete; tests | 1–2 weeks |
| 2. Project pages | Generated project page with citations and versions; included in project chats and tasks; document changes update it | 1–2 weeks |
| 3. Suggestions from work | Candidate facts and decisions after chats and tasks; accept/edit/dismiss; conflicts shown | 1–2 weeks |
| 4. Agents | `brain_search` / `brain_propose` tools for Work AI and Code; procedures as skills; Knowledge shows memory sources | 1 week |
| 5. Outside brains | Markdown/Obsidian import and export; Notion/Drive sync into sources; optional TencentDB Agent Memory provider | 1–2 weeks |
| 6. Organization memory | Org scope with reviewers; entity pages (customers, suppliers, standards, people) | 1 week |

Each phase is useful alone. Phase 1 already removes most repeated explaining.

### How to tell it works

- A set of 30 questions per pilot project whose answers were said once in earlier chats or tasks
  ("Which enclosure rating did Acme ask for?"): share answered correctly with a source, before and
  after. Target: from about 0 % (today, unless the chat is in the same thread) to 80 %+.
- No leaks: rerun Knowledge's denial probes with memory items (another project's decision, another
  person's preference) and add 10 new ones. Target: 0 leaks.
- Wrong memories: share of suggestions people dismiss or correct; share of answers that used a
  replaced fact. Target: replaced facts never used.
- Cost: extra tokens per chat turn and per task.

## 7. Decisions to make

1. **Build in GEM AI (Option C), adopt TencentDB Agent Memory (A2), or both?** Recommendation: C,
   with A2 as an optional connector later. GEM AI keeps one set of permissions, one database, one
   export.
2. **Automatic or approved?** Recommendation: personal memory automatic if the person turns it on;
   project and organization memory only after a person accepts.
3. **Who can accept organization-wide items?** Org admins, or named "knowledge owners".
4. **Obsidian:** import only, or also export the brain as a vault?
5. **Which tools hold your knowledge today** (Notion, Google Drive, SharePoint, Confluence, an
   Obsidian vault, Excel registers)? That decides which connectors come first in phase 5.
6. **Pilot:** one or two real projects with their documents and 30 test questions.
7. **Retention:** how long chat-derived memory is kept, and whether it expires if unused.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Wrong facts remembered and repeated | People accept shared items; sources always shown; replaced facts never used; outside facts checked on the web |
| Leaks across projects or people | One permission check in SQL, shared with Knowledge; denial probes in CI |
| Prompt injection from documents or web pages stored as memory | Memory text treated as data like web sources; suggestions from documents need acceptance |
| Personal data concerns | Personal scope private, off by default for automatic capture; export and delete; notices updated |
| Context bloat and cost | Caps on items per turn; project page in a short form; search on demand |
| A second system drifting (if using TencentDB Agent Memory) | GEM AI stays the source of truth; Memory gets only what GEM AI sends, filtered on the way back |
