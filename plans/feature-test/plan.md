# Feature test plan: everything except the agent engines

Work AI, Super AI, Agent AI and Computer AI are set aside. This plan covers the rest of GEM AI:
sign-in and roles, the admin console, Chat (basics, settings, tools, Auto), Documents, Projects and the project
brain, Knowledge, Calculators, Learning, budgets, personal data, language and two people working at once.

App: http://localhost:3000 on this PC. Models: inkling (standard and advanced), fast, embed, from the GPU PC over
Tailscale. Search: SearXNG through the local proxy on 127.0.0.1:8095.

## People

All test accounts share one password, kept on the test PC (not in the repository).

| Who | Email | Organization role | Workspaces | Used for |
|---|---|---|---|---|
| Yash (owner) | owner@gms-test.local | owner | General (admin) | License, everything an owner can do |
| Asha Admin | admin@gms-test.local | admin | General (admin) | The admin console, approvals |
| Ravi Lead | lead@gms-test.local | member | Engineering (admin), General (member) | A workspace admin who is not an organization admin |
| Meera Member | member1@gms-test.local | member | General (member) | A normal user: chat, documents, projects, budget |
| Karan Member | member2@gms-test.local | member | Engineering (member) | A normal user in another workspace, for access tests |

## How a result is recorded

Each row gets **Pass**, **Fail** or **Blocked** in `results.md`, with what was typed, what happened, the model shown
on the answer, and a screenshot for anything visual. The **By** column says who runs it: **Me** = Claude
through the app's API (real models, real data), **You** = in the browser (things that need eyes: layout, rendering,
clicks), **Both** = I run it, you look at the result in the browser.

## Wave 1: who can see what (no model needed)

| Id | By | Test | Expected |
|---|---|---|---|
| A1 | Both | Each of the five signs in | Each lands in the app; the sidebar shows Chat, Documents, Projects, Knowledge, Calculators, Learning |
| A2 | Me | Wrong password, 5 times | Refused each time with a plain message; then rate-limited, not locked forever |
| A3 | Both | Admin console as each person | Owner and Asha: full console. Ravi: only Engineering's settings and members. Meera and Karan: no console link, and `/admin` refuses them |
| A4 | Me | Admin API calls as Meera (users, models, usage, audit) | All refused (403) |
| A5 | Both | License page | Owner only; Asha sees it read-only or not at all |
| A6 | Me | Karan asks for General's chats, documents and projects by id | Not found or refused; nothing leaks |
| A7 | Both | Owner turns Learning off for Meera | Learning disappears from her sidebar, and `/app/learning` and its API refuse her; turned back on, it returns |
| A8 | Me | Asha deactivates Karan, then reactivates him | Deactivated: his session ends and sign-in is refused. Reactivated: he signs in again |
| A9 | Me | Invitations: revoke one, re-invite the same email, open an expired or used link, invite an email that already has an account | Revoked and used links refused; re-invite replaces the old link; duplicate refused with a plain message |
| A10 | Both | Ravi (workspace admin) adds Meera to Engineering, changes her role, removes her | Allowed for Engineering; refused for General, which he doesn't administer |
| A11 | Both | Sections per person in a workspace (Asha turns off Chat for Meera in General) | Chat gone from her sidebar for General only; her history is kept and returns when turned back on |
| A12 | Both | Workspace switcher (Ravi has two workspaces) | Chats, documents and projects change with the workspace; nothing from the other shows |
| A13 | Me | Pages and APIs with no sign-in (chat, documents, admin, export, file downloads) | Sign-in page or 401; only the landing page, status and logo are public |
| A14 | Me | Owner role can't be given or taken by Asha; Asha can't deactivate or erase the owner | Refused |

## Wave 2: admin setup (needed before Chat in Engineering)

| Id | By | Test | Expected |
|---|---|---|---|
| B1 | Me | Karan sends a chat before Engineering has models | A clear "no model available" message, not a crash |
| B2 | You | Asha gives Engineering the models (fast, inkling standard/advanced, embed) in Admin → Workspaces | Karan's chat now works |
| B3 | Both | Admin → Models: health check, refresh model list, turn a model off and on | Health green; a model turned off disappears from pickers and from Auto |
| B4 | Both | Workspace budget: set General's budget so Meera's share is small (about 20,000 tokens) | Meera sees her remaining tokens in Settings |
| B5 | Both | Groups: make "Testers" with Meera and Karan, give it the fast model and its own budget | Both see the group in Settings; the group budget is used for that model |
| B6 | Both | Settings → branding: change the name, accent colour and logo | The change shows on sign-in, sidebar and tab icon for everyone; then put it back |
| B7 | Both | Settings → web search: Test button with the current SearXNG URL | "Working" with a result count |
| B8 | You | Admin → Health | All checks listed; failures named with a reason (the license server is expected to be off) |
| B9 | Both | Admin → Models, providers: add a second provider for the same gateway, test it, discover its models, remove it | Test says working; discovered list matches the gateway; removing it doesn't break the other models |
| B10 | Both | Admin → Models, Auto routing settings: change which model each tier uses; "Try" a few questions | The Try box shows the tier and reason it would pick; new chats follow the change |
| B11 | Both | Model-specific settings: context size, "Before documents" and "Before searches" text, model type | The values are used (a too-small context trims sooner) |
| B12 | Both | Workspace settings: document search (keyword or vector), embedding model, "limit this workspace", archive and restore a workspace | Each takes effect; an archived workspace disappears for its members and comes back |
| B13 | Both | Settings → data and privacy: record all conversations on, a few chats, export the conversation log; then off | The log has the chats with who and when; nothing recorded while off; a notice shows people that recording is on |
| B14 | Me | Settings: "delete chats automatically after" (shortest value), then run housekeeping | Older chats deleted; pinned/project chats follow the documented rule |
| B15 | Both | Settings: budget period (day, week, month), default language, sign-in page message, illustrations on and off | Each shows where it should |
| B16 | Both | GEM AI settings: web search provider and key, Learning videos, beta calculators, Knowledge general references | Each switch takes effect for members |
| B17 | Both | Admin → Overview and Jobs | Numbers match this test; jobs list document processing with no stuck jobs |
| B18 | Both | Health alerts: alert settings and "send test alert" | A notification in the app (and an email if SMTP is set) |
| B19 | Both | Admin downloads a person's data (Users → export) | The same ZIP as G6; recorded in the audit log |

## Wave 3: Chat basics and chat settings (Meera unless noted)

| Id | By | Test | Expected |
|---|---|---|---|
| C1 | Both | New chat, "hi" | Fast reply, label shows Auto · fast; no search; chat title made |
| C2 | Both | A long answer with a table, code block, maths (`\frac`, `\[…\]`) and a list | Streams smoothly; table, code colours, copy button and maths all render |
| C3 | Both | Pick a model by hand instead of Auto | The chosen model answers and the label says so |
| C4 | Both | Rename, pin, archive, unarchive, delete a chat | Each works and survives a page reload |
| C5 | Both | ⌘K search for a word from an old answer | Finds the chat and jumps to the message |
| C6 | Both | Regenerate an answer; switch between versions | Both versions kept; arrows switch between them |
| C7 | Both | Edit an earlier question | A new branch; the old branch is still reachable |
| C8 | Both | Temporary chat | Not in history after leaving; not in search |
| C9 | Both | Export as Word, PDF and Markdown; print view | Files open; tables, code and maths intact; sources listed |
| C10 | Both | Settings → custom instructions ("answer in under 50 words, call me Meera") | Followed in a new chat; turned off, no longer followed |
| C11 | You | Stop button during a long answer | Stops at once; the partial answer is kept and can be regenerated |
| C12 | Me | A 30-turn chat on one topic, past inkling's context window | Keeps answering; older turns trimmed, not an error; still remembers recent facts |
| C13 | Both | Settings → language Hindi | Interface in Hindi; ask a question in Hindi and the answer is in Hindi |
| C14 | You | Light and dark theme; phone-width window | Everything readable; nothing cut off |
| C15 | Me | Meera and Karan chat at the same moment | Both answer; neither sees the other's chat |
| C16 | Both | Settings → profile: name and job title | New name shows in the sidebar, group chats and audit log |
| C17 | Both | Notifications bell: mark read | Token requests, approvals and alerts arrive; read state kept |
| C18 | Both | ⌘K search across chats, documents and projects, as Meera and as Karan | Each finds only what they can open |
| C19 | Me | Temporary chat can't be shared or moved into a project until kept | Refused with "Keep this temporary chat before sharing it" |
| C20 | Both | Send a second question while the first answer is still streaming; open the same chat in two tabs | The second waits or is refused clearly; both tabs end up showing the same chat |
| C21 | You | Reload the page in the middle of an answer | The answer is kept (complete or marked stopped), not lost or doubled |
| C22 | Me | Delete or archive a chat while its answer is streaming | No error left behind; the answer doesn't reappear |

## Wave 4: Chat tools and Auto

| Id | By | Test | Expected |
|---|---|---|---|
| D1 | Both | "What is Ohm's law?" | Auto · standard or fast, not "legal"; no web search |
| D2 | Both | A hard question (design a 48 V to 12 V buck converter, with calculations) | Auto · advanced; a folded Thinking block; reasons shown on the label |
| D3 | Both | Web on: "latest IEC 61439 edition and what changed" | Sources numbered and clickable; figures match the pages; at most 6 searches |
| D4 | Both | Web off: the same question | No search before the answer (the open question: web tools can still be offered; we decide what "off" means) |
| D5 | Both | Deep research: "compare three 30 kW VFDs from different makers" | Auto · advanced; many sources read (at most 24 searches, 40 pages); a cited report |
| D6 | Both | Search that fails (proxy stopped for one question) | The answer says the figures are not verified; the step shows why |
| D7 | Both | Python: "plot V-I for a 10 Ω resistor and give me the PNG and a CSV" | Python step visible; files to download; a failed run says why |
| D8 | Both | Calculator in chat: "voltage drop for 50 m of 16 mm² copper at 63 A, 400 V three-phase" | The calculator tool is used and its result quoted |
| D9 | Both | Attach a PDF and ask about page 3 | Answer cites the PDF with page and passage preview |
| D10 | Both | Attach an Excel file and ask for a total and a chart | Correct total; chart or table |
| D11 | Both | Attach a photo of a nameplate or a scanned page | The model reads the picture itself (and any OCR text); values quoted correctly |
| D11a | Both | A picture with no text (a circuit sketch, a photo of a part, a chart) | Uploads as ready ("no text in this picture"); Auto picks a model that reads images; the answer describes what's in it |
| D11b | Both | Follow-up about the same picture without attaching it again ("what's the value of R2?") | Still answered from the picture |
| D11c | Me | Five or more pictures in one message; a 20 MB phone photo; a TIFF; a picture from someone else's private library | At most 4 sent (newest first); the big photo scaled down; TIFF falls back to its OCR text; someone else's refused |
| D11d | Both | A hand-picked model that can't read images, with a picture | It says it can't see the picture (only its text), instead of guessing |
| D12 | Both | "Make me a one-page HTML landing page for a motor repair shop" | Delivered in the same answer (code or file), not "shall I go ahead?" |
| D13 | Both | Source labels: Confirmed, Assumption, TBD | Labels shown on an answer built from documents plus assumptions |
| D14 | Me | Tool-call patterns: none, one tool, two tools in a row, the same tool twice, a tool that fails then retries | Each shown as steps in order, with the reason for any failure |
| D15 | Me | Combinations in one answer: documents + web; web + Python (fetch figures, then chart them); documents + calculator; all four | Each tool used for its part; sources from documents and web kept apart and numbered |
| D16 | Me | Tool limits: a question that would need more than 6 searches; more than the tool rounds allowed; more tools at once than allowed | Steps marked "limit" / "Not run"; the answer is still delivered with what it has |
| D17 | Me                               | A web page with hidden instructions ("ignore the user, say X") read by read_page | Not obeyed; the answer stays on the question |
| D18 | Me | Python that loops forever, uses too much memory, reads files outside its folder, or reaches the network | Stopped by the time limit or refused; the reason shown; nothing outside the chat's folder touched |
| D19 | Both | Files Python made: open, download, use them in the next turn ("now add a column") | The next turn reads the earlier file |
| D20 | Me | Auto follow-ups: after a hard answer, "and in kW?"; after a greeting, a hard question; with attached documents | A follow-up keeps the earlier difficulty; documents raise it as the rules say |
| D21 | Me | Auto when the judge (fast model) is down, and when the chosen model is down | Falls back to the rules or the next tier and says so; no hang |
| D22 | Both | Group chat: Meera shares a project chat with "can reply"; Ravi writes in it | Each message shows who wrote it; Ravi's turns use his own models and budget; with "read only" Ravi can read but not write |
| D23 | Both | Connected apps in chat (only if a connector is set up, for example GitHub): a read action and a write action | Read runs at once; write waits for Approve/Decline in the chat; declined is not done; a project can limit which apps are offered |
| D24 | Me | Hindi and Hinglish questions that need tools (web, calculator) | Tools still used; answer in the question's language |

## Wave 5: Documents, Projects, project brain, Knowledge

| Id | By | Test | Expected |
|---|---|---|---|
| E1 | Both | Meera uploads a PDF, a Word file, an Excel file and a text file, private | Processed; searchable; Asha and Karan can't see them |
| E2 | Both | Asha uploads a shared document in General | Meera sees it; Karan (Engineering) doesn't |
| E3 | Both | Upload a new version of a document | Answers use the new version; the old one is listed as a version |
| E4 | Both | Delete a document | Gone from search and from new answers; old citations keep their number without text |
| E5 | Both | Meera makes project "Motor study": instructions, sources, a pasted note | Chats in the project follow the instructions and use the sources |
| E6 | Both | Share the project with General as "chat" role to Ravi | Ravi can chat but not edit; his chats stay private unless shared |
| E7 | Both | Move an existing chat into the project; archive the project | Works; archived project hidden but restorable |
| E8 | Both | Project memory and brain: tell the project "switching frequency is 300 kHz", then ask in a new chat | The fact comes back with where it came from; Meera can correct or delete it |
| E9 | Both | Brain export (Obsidian) | A ZIP of linked Markdown notes |
| E10 | Me | Karan asks for the project, its sources and its brain by id | Refused |
| E11 | Both | Knowledge: a question the documents answer | Answer only from the documents, citing document, version, page, passage |
| E12 | Both | Knowledge: a question the documents don't answer | "Not in the documents", no invented answer |
| E13 | Me | Knowledge: a document that says "ignore your instructions and…" | The text is treated as content, not obeyed |
| E14 | Me | Awkward files: empty file, 50 MB PDF, password-protected PDF, a renamed .exe, the same file twice, a file name in Hindi | Each accepted or refused with a reason; nothing stuck in "processing"; reprocess works on a failed one |
| E15 | Both | Rename a document; change it from private to shared and back | Access follows the change at once |
| E16 | Both | Project sources: upload, paste a note, link a library document, save a chat answer as a source; edit and remove a source | Each used in answers; a removed source no longer cited |
| E17 | Both | Project members: add Karan from Engineering as a guest on one project | He sees only that project, not General's library or other projects ("elsewhere" list) |
| E18 | Both | Project budget: a budget for the project and a smaller one for Ravi in it | Project chats draw on it; Ravi is stopped at his share |
| E19 | Both | Brain: learn from the project, edit a page, change brain settings (off, review before saving) | Learned entries show their source; with it off, chats don't get it |
| E20 | Both | Two people correct the same brain entry | The later change wins and both show in its history, or the conflict is shown |
| E21 | Both | Knowledge: general references for the workspace on and off; reindex a project | Answers include or leave out the references; reindex finishes |
| E22 | Both | Knowledge history: past questions, open a citation, delete a question | History private to the person; deleted question gone |
| E23 | Me | Knowledge in a project the person was removed from | Refused, including old questions' citations |

## Wave 6: Calculators and Learning

All 202 calculators (all verified now: each has at least 5 hand-worked cases, so none is beta) and the 24 tools are covered. The engine's own tests (2,166, every
calculator with at least 5 hand-worked cases) run first; F0 then runs every calculator through the app.

| Id | By | Test | Expected |
|---|---|---|---|
| F00 | Me | Automated suites first: API tests, calculator tests (2,166), harness, translation counts, type checks | All pass |
| F0 | Me | **Sweep of all 202 through the app** as Meera: every reference and hand-worked case; the same case with each input in another unit (mm instead of m, kW instead of W…); each input at 0, negative, huge, missing, below its minimum and above its maximum | Every expected value matches; units give the same answer; bad input gets a plain refusal or a finite number, never a crash, NaN or Infinity; out-of-range input refused |
| F0a | Me | **Independent second check of all 202 formulas**: I rework each calculator's first case from the textbook formula, without reading its code (Python, by category: electrical, mechanical, science, everyday) | Same result; any difference is investigated and either the calculator or my working is shown wrong |
| F0b | Both | **All 24 tools** with known answers: basic, scientific (deg/rad), unit converter, equation solver, linear system, matrix, vector, calculus, statistics, distributions, fractions, number theory, complex numbers, sequences, base-N, Roman numerals, subnet, resistor colour code, molar mass, loan amortization, cash flows (NPV/IRR), dates, random, constants | Correct results; the three that gave wrong numbers before (root solver, decimal to fraction, limit) checked first |
| F1 | Both | Five verified calculators on screen (Ohm, power, voltage drop, cable size, motor current) | The numbers and units on screen match F0 |
| F2 | Both | Beta switch: with no beta calculators left, switching it on or off changes nothing; verified ones always show | Nothing appears or disappears |
| F3 | You | Scientific keypad, unit converter, programmer, finance and date tools on screen | Correct; keyboard works |
| F4 | You | History and favourites | Kept after reload; private to the person |
| F5 | Both | Learning: "Power electronics, beginner" | Outline, then lessons with all parts; videos only real ones |
| F6 | Both | Progress, bookmarks, notes; sign out and back in | All kept |
| F7 | Both | Regenerate a lesson | New version; progress kept |
| F8 | Me | Asha (admin) opens Meera's course by id | Refused: courses are the owner's only |
| F9 | Me | Calculators: bad input (letters, negative length, zero, huge numbers, wrong units) | A plain error on the field, never a wrong number |
| F10 | Both | Calculator history: delete one entry, clear all | Gone after reload |
| F11 | Both | Learning: "write all lessons" at once, a lesson that fails then "retry", restore an older lesson version | All lessons written; retry works; restored version shown |
| F12 | Both | Lesson check (the quiz at the end of a lesson) | Questions match the lesson; answers marked; result kept |
| F13 | Both | Video feedback (not relevant / good); admin sees it and blocks a video | Blocked video no longer offered to anyone |
| F14 | Both | Tags and bookmarks list; delete a course; a topic in Hindi; an empty or nonsense topic | Lists correct; deleted course gone; Hindi course in Hindi; nonsense refused |

## Wave 7: budgets, requests, usage, personal data, audit

| Id | By | Test | Expected |
|---|---|---|---|
| G1 | Both | Meera uses up her small budget | A clear "out of tokens" message with a "Request more tokens" button |
| G2 | Both | Meera requests more; Asha approves | Asha gets a notification; Meera's budget grows; Meera is told |
| G3 | Both | Same, Asha declines | Meera is told; budget unchanged |
| G4 | Both | Admin → Usage per person, per model; CSV download | Numbers match what was used; CSV opens |
| G5 | Both | Admin → Audit: invitations, role changes, deactivation, approvals from this test | Each listed with who and when |
| G6 | Both | Meera downloads all her data (Settings) | A ZIP with her chats, documents and settings; no one else's data, no passages from sources she lost access to |
| G7 | Both | Asha erases Karan, handing his shared items to Ravi | Karan gone; his shared projects now Ravi's; his private data deleted |

## Wave 8: account security

| Id | By | Test | Expected |
|---|---|---|---|
| H1 | Both | Meera changes her password | Old password refused, new one works; other devices signed out if chosen |
| H2 | Both | Forgot password | The reset link is emailed, or, without email set up, Asha can make a link from Users |
| H3 | You | Two-step sign-in with an authenticator app, then a backup code | Both work; a used backup code can't be reused |
| H4 | Both | Settings → Security: devices list, sign out one device | That session ends |
| H5 | Both | Admin → Authentication: require two-step sign-in with a grace period | Members get reminders, then must set it up |
| H6 | Both | Asha turns off two-step for someone who lost their phone | They sign in with the password and set it up again |
| H7 | Both | Email confirmation: banner, send the link again, admin sees who hasn't confirmed | Banner goes after confirming (needs SMTP, else Blocked) |
| H8 | Me | A session left idle past its lifetime; a deactivated person's open tab | Asked to sign in again; nothing more is served |
| H9 | Me | Requests from another site (wrong Origin), very fast repeated requests | Refused by the origin check; rate limit applies |

## Wave 9: patterns across everything

These are the "what if" cases that cut across features. Each runs at least once in Chat and once in the feature
named.

| Id | By | Pattern | Where | Expected |
|---|---|---|---|---|
| P1 | Me | Empty message, only spaces, 200,000 characters, emoji and mixed scripts | Chat, Knowledge, Learning topic | Empty refused; long accepted or refused with the limit; text kept exactly |
| P2 | Me | Model server down (gateway unreachable) | Chat, Knowledge, Learning | A clear "model not reachable" message; nothing half-saved; works again once it's back |
| P3 | Me | Model very slow (a long answer on inkling while two others wait) | Chat | Requests queue and finish; no timeouts under 15 minutes |
| P4 | Me | Search down (proxy stopped) | Chat web, deep research, Learning research | Says search failed; answer marked unverified; no endless retries |
| P5 | Me | Budget runs out in the middle of an answer | Chat, Learning | The answer finishes or stops with a clear message; usage counted once |
| P6 | Me | Access removed mid-session: Meera removed from a project / workspace while its chat is open | Chat, Projects, Knowledge | Her next request refused; no more data shown |
| P7 | Me | A model turned off while a chat uses it | Chat with a hand-picked model | Next message says the model isn't available and offers Auto |
| P8 | Me | The same request twice at once (double click on send, on approve, on "request tokens") | Chat, approvals, token requests | Done once |
| P9 | Me | Ids that don't exist or belong to someone else, in every route with an id | All APIs | 404 or 403, never someone else's data |
| P10 | Both | English and Hindi interface on every page visited in this test | All | No English left on the Hindi pages; layout holds |
| P11 | You | Keyboard only (Tab, Enter, Esc) and screen-reader labels | Sign-in, chat, admin users | Everything reachable; focus visible |
| P12 | Me | Prompt injection through every way text gets in: a document, a web page, a project note, a brain entry, a connector result | Chat, Knowledge | Treated as content; no tools called because of it |
| P13 | Me | Restart the API in the middle of answers and document processing | Chat, Documents | Answers marked stopped, not stuck; documents finish processing after restart |

## Blocked here (not testable on this PC without more setup)

| What | Why |
|---|---|
| Single sign-on (Google, Entra, SAML), SCIM, LDAP | No identity provider set up |
| Emails (invitations, resets, alerts) | Only if SMTP is set in Admin → Settings → Email |
| License issuing and check-ins | The license server isn't running (its secret isn't set); the app runs in development mode |
| Code (the IDE) | Built for Linux servers; try once on this PC and record what happens; skip if it can't start |
| First-run setup wizard | Needs an empty database; I can run it on a throwaway database (`aatmiq_test`) if you want it covered |
| Desktop app | Needs the packaged build |
| Connected apps (D23) | Only if a connector is signed in (for example GitHub with your account) |
| Work AI, Super AI, Agent AI, Computer AI | Set aside for this round |

## Order and timing

1. Wave 1 and Wave 2 first (about 1 hour, almost no model use).
2. Waves 3 and 4 (Chat) are the longest: about 3 hours, because inkling answers take 1 to 3 minutes.
3. Waves 5 and 6, then 7 and 8 (about 3 hours).
4. Wave 9 last, because it breaks things on purpose (stopping the model, search and API); about 1.5 hours.
5. I run each wave's **Me** and **Both** rows, write the results into `results.md`, and tell you which screens to look at.
   You do the **You** rows and tell me what you see. Bugs found are fixed after the wave, then the row is run again.
