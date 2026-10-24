# Page-by-page options test

Signed in as Yash Badgujar on the local app (`http://localhost:3000`, workspace **General**, organization **GMS**) on 21 October 2026. Each page below was opened and its controls were used. Dialogs that would create or delete something were opened and cancelled. Admin switches that change the live organization were not flipped.

## Result

Every main page loaded. The controls that were used did what their labels say. Four health checks on this dev server are real gaps (backups, task isolation, license, email). A few options are present but cannot be used yet.

## Marketing and sign-in

| Page | Options tried | What happened |
| --- | --- | --- |
| `/` | Product, Privacy, For admins, Plans, Sign in, Book a demo, Talk to us, Contact | Page renders the full company page while a session exists. Sign in is still the way in. |
| `/login` | Email, password, Continue, Forgot password | Form is shown even with a session. The first click on **Forgot password?** did not leave the page; opening `/forgot-password` directly did. A line on the sign-in page reads “For GMS employees only. Contact IT for access.” |
| `/forgot-password` | Email, Send reset link, Back to sign in | Form is there. The link was not submitted. Email is not set up, so a reset mail cannot go out (see Health). |

## App sidebar (on every signed-in page)

| Option | Result |
| --- | --- |
| New chat, Chat, Projects, Documents, Work AI, Code, Learning, Calculators, Knowledge | Each opens its page. |
| Search | Opens a dialog: “Search chats, messages, documents and projects.” Typing `slip` returns “Nothing matches.” The slip answer lives in a Work AI task, and this search does not look there. |
| Account menu | Settings, Admin console, Sign out. |
| Notifications | Opens. Includes model-down and model-fixed alerts, finished Work AI tasks, and “Task needs attention” for the runtime that did not start. Badge showed 4 unread. |
| Projects / New project in the sidebar | Present on chat, documents, and the other app pages. |

## Chat — `/app/chat`

| Option | Result |
| --- | --- |
| Temporary | Presses on. Clears when you leave the page. |
| Search the web | Presses on. Clears when you leave the page. |
| Auto (model menu) | Lists Auto, Beam, Gemma4 31B, Gpt Oss 120B, Gpt Oss 20B, Minimax M3.1 Flash, Nemotron 3 Nano 30B, Nemotron 3 Super, Nemotron 3 Ultra. Auto’s line says it picks fast Gpt Oss 20B, standard Gemma4 31B, advanced Beam. |
| Upload files, Attach a document | Buttons are there. A file was not chosen. |
| Skills · coming with Work AI | Disabled. |
| Voice input · coming soon | Disabled. |
| Send | Stays disabled until there is text. |
| Draft an email, Summarize text, Write code, Brainstorm ideas | Present as starter prompts. |
| Previous chats (3) | Listed. **Chat options** on each row is in the page but `opacity: 0` until hover, so rename, pin, and delete could not be opened from the keyboard path used here. |
| Connect your tools | Link to Work AI connectors. Slack, Drive, mail, and GitHub are described; none are connected. |

The greeting renders as “Good evening , Yash” with a space before the comma in some snapshots, and without that space in others.

## Projects — `/app/projects`

Empty state: “No projects yet.”

**New project** opens a dialog: name, seven colour choices, optional instructions, Cancel, and Create project (disabled until there is a name). Cancel closes it. Nothing was created, so Knowledge has no project to ask.

## Documents — `/app/documents`

| Option | Result |
| --- | --- |
| All, Uploaded by me, Shared with workspace | Each filter switches. All three are empty. |
| Search documents | Field is there. |
| Upload | Focuses the upload control. The empty state says PDF (including scans), Word, Excel, images, text, CSV, and code, up to 25 MB. No file was chosen. |

## Work AI

### Tasks — `/app/work`

Starter prompts fill the box. **Analyze a spreadsheet** put its prompt in the composer and enabled Send. The task was not sent.

**Auto** is on the composer. The task list shows 12 tasks, including the pump study, the slip answer, the two tasks the server restart marked failed, and the runtime that did not start.

Tabs: Tasks, Scheduled, Skills, Connections.

### Scheduled — `/app/work/schedules`

Empty: “Nothing scheduled.”

**New schedule** opens: name, task, repeat (Weekdays, Every day, Every week, Every month, Every hour, Custom cron), time, time zone (default **Asia/Colombo**), model (Default/Auto plus the same models as chat). Custom cron shows `0 9 * * 1-5`. Schedule stays disabled until name and task are filled. Cancel closes it. Nothing was scheduled.

### Skills — `/app/work/skills`

Search box and categories: All, Software development, Data, Documents & writing, Business, Apps, Platform.

**Data** lists Charts and visualization, Data analysis, Data cleaning, Excel spreadsheets, Financial analysis, and KPI report and dashboard. Each has a **Use** switch, and each switch was on. Opening **Excel spreadsheets** shows the skill text and Close. **New skill** is present. No personal skills yet. Switches were not turned off.

### Connections — `/app/work/connections`

“No apps yet.” The page says to add Gmail, Canva, GitHub, and the rest under Admin → Work AI → Connectors.

## Code — `/app/code`

Empty: “No workspaces yet.”

**New workspace** opens: optional Git URL, name, Cancel, Create (disabled until there is a name). The copy says private https clones can take a token in the address. Cancel closes it. Nothing was created, so the editor, terminal, Git, and extensions were not opened.

## Learning — `/app/learning`

Two courses are listed, both at 0 lessons finished, both offering **Resume lesson 2**:

- Three-phase inverters (advanced), 6 lessons.
- AI Harness Engineering (basic), 14 lessons, tags AI, LLM, AGENTS.

| Option | Result |
| --- | --- |
| Courses, Bookmarks, Archived | Bookmarks: “No bookmarks yet.” Archived: “Nothing archived.” |
| Tag filters | `#AGENTS`, `#AI`, `#LLM`, each with a count of 1. |
| Search courses and tags | Field is there. |
| New course | Topic, three suggestion chips, Basic / Intermediate (selected) / Advanced, optional tags, Cancel, Write the course (disabled until there is a topic). Cancel closes it. A course was not started, so a model was not called. |

## Calculators — `/app/calculators`

The index states numbers come from tested code, not a model. It lists **202** verified engineering calculators, then keypads and tools, then categories.

Categories and counts: Basic electrical 4, Electrical power 14, Electronics 25, Power electronics 14, Mechanical 13, Civil & structural 16, Thermal & fluids 13, Instrumentation & control 12, Computer engineering 7, Chemical 4, Aerospace 6, Environmental 4, Materials 3, Physics 22, Chemistry 6, Geometry 12, Math 20, Finance 19, Health & life 6, Everyday 6.

Keypads and tools on the index include Basic, Scientific, Unit converter, Equation solver, Systems of equations, Matrix, Vector, Calculus, Statistics, Probability, Fractions, Primes, Complex numbers, Sequences, Number bases, Roman numerals, IPv4 subnet, Resistor colour code, Molar mass, Loan schedule, NPV and IRR, Date and time, Random numbers, Physical constants.

**Ohm's law** (`/app/calculators?c=ohms-law`) was run with voltage 12 V and resistance 4 Ω. Result: current **3 A**, power **36 W**, with the formulas and the resistive-load assumption. **Add to favorites**, **History**, **Explain in chat**, and unit menus (µV through MV, nA through kA, mΩ through GΩ, mW through hp) are on that page. Recent calculators shown beside it: Ohm's law, Circle, Matrix calculator. The other 201 calculators were not each opened.

## Knowledge — `/app/knowledge`

The page explains answers come only from one project’s documents, with document, version, and page. There are no projects, so the only action is **Go to Projects**. Asking a question is not available until a project has sources.

## Settings — `/app/settings`

| Tab | What is on it |
| --- | --- |
| Profile | Name Yash Badgujar, email, owner, org GMS, full name, job title, custom instructions, Save changes. Nothing was saved. |
| Security | Email **not confirmed**. The page says confirmation waits until an admin sets up email. Change password. Two-step sign-in **off**, with Set up. Signed-in devices are listed. Password and two-step were not changed. |
| Appearance | Language: organization default (English), English, हिन्दी. Theme: Dark, Light, System. Not changed. |
| Usage | General workspace, resets 1 Nov, **9.5M used**, no limit. Request more. “You haven't requested extra tokens.” |
| Archived chats | “No archived chats in General.” |
| Your data | Download my data (ZIP, passwords and app tokens excluded). Erase account is an instruction to ask an admin. Download was not started. |

## Admin console

Sidebar groups: Organization (Overview, Users, Groups, Workspaces, Models), Activity (Token requests, Usage, Audit log, Health), Configure (Settings, Authentication, Work AI, License). **Back to workspace** is on each page.

| Page | Options and what they showed |
| --- | --- |
| Overview | Active users 1, workspaces 1, tokens last 30 days 9.5M, pending requests 0. Chart has a day table (19 Oct 3.36M in, 21 Oct 5.90M in). Provider Ollama, last check about 1.3 s. Background jobs run inside the API, 0 running. License: development mode. Aatmiq 1.0.0. |
| Users | Invite people, search by name or email. One row: Yash Badgujar, owner, General, 9.5M, active 1 minute ago. No pending invitations. Invite was not sent. |
| Groups | “No groups yet.” New group. Not created. |
| Workspaces | New workspace. One row: General, 1 member, 8 models, 9.5M used, no budget. The workspace editor was not opened, so member, model, and budget screens inside it were not clicked. |
| Models | Add provider, Try, and per-model controls: Chat, Work AI, Code, Images, Thinking, tier (Fast / Standard / Advanced), Enable, Delete. Delete was not used. |
| Token requests | Waiting for you: none. History table is empty. |
| Usage | 7 days, 30 days, 90 days. Workspace filter: All workspaces, General. Export CSV. 7 days still shows total **9.5M** (9.3M in, 240.5K out), which matches this week’s Work AI runs. CSV was not downloaded. |
| Audit log | Filter: All events, Users, Workspaces, Models, Providers, Budgets, Token requests, Settings. **Models** shows `model.added` for `minimax-m3.1-flash` on 21 Oct and an earlier add on 19 Oct. The unfiltered log also shows `settings.changed` (locale en and hi) and logo updated then removed at 02:19–02:20 PM today. |
| Health | **Check now** refreshes. Models, database (344 ms, 13 MB), disk (420 GB free of 465 GB), Work AI (0 of 8 running), and background jobs are **Working**. **Needs a look:** no backup recorded; tasks and IDEs run as the API user; development mode with no license; email not set up. Also email admins, and Send a test alert (disabled in practice because email is not set up; alerts stay in the app). |
| Settings | Sections load: Organization & branding (logo, accent swatches, illustrations), Budgets (daily / weekly / monthly), Language (English, हिन्दी), Email (test and save), Data & privacy (record conversations), GEM AI modules (Learning, Calculators, Knowledge, beta calculators, blocked videos, web search, lesson check). Nothing was saved. |
| Authentication | Require single sign-on, Require two-step sign-in, Turn on, Set up. Not turned on. |
| Work AI | Approvals, Web search (Test), Browser (Allow the browser), Limits, Allow network, Connectors (Add connector), Save changes. Not saved, so the running policy was left as it was. |
| License | Development mode. No license public key, so every feature is available and nothing is checked. No key field was filled. |

## What did not get a click

- Sending a chat or a Work AI task (those were tested in the earlier model report).
- Choosing a file in Upload, Attach, or logo upload.
- Creating a project, schedule, skill, group, workspace, course, or code workspace.
- Turning skill switches, model switches, or admin settings off or on.
- Delete, sign out, change password, erase account, download the personal ZIP, export the usage CSV.
- Opening each of the 202 calculators. One verified formula was run.
- Opening a course lesson, the IDE, or a project’s Knowledge question box (there is no project).
- Rename, pin, and delete on a chat, because those menu buttons stay invisible until hover.
