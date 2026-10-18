# Aatmiq: the user guide

Aatmiq is your organization's private AI assistant. It runs on your organization's own server:
what you type and upload stays there.

## Signing in

Open the address your admin gave you and sign in with your work email and password, or with the
company's single sign-on button (Google, Microsoft…) if there is one. If two-step sign-in is on, you
also type the 6-digit code from your authenticator app. You lost your phone: use a backup code, or
ask an admin. You forgot your password: **Forgot password?** on the sign-in page.

The sidebar on the left: **New chat**, **Chat**, **Projects**, **Documents**, **Work AI**, **Code**
(the sections your admin gave you), your recent chats, and at the bottom your name (Settings, sign
out) and the bell (notifications).

## Chat

Type a question and press Enter (Shift+Enter for a new line).

| To | Do |
|---|---|
| Choose the model | The model menu under the message box. **Auto** (the default) picks one for each message: quick questions get a fast answer, hard ones a stronger model that thinks first. The chip next to an answer says what Auto picked and why |
| Ask about a document | **+** to upload one, or **@** to pick from your library. Answers cite their sources with numbers: click **[1]** to see the passage |
| Look something up on the web | The globe (**Search the web**) in the message box, if your admin has set up web search. It stays on for the chat until you switch it off. Answers cite the pages they used: **[1]** and the *Sources* under the answer open them |
| Change your question | Hover it, **Edit**. The old version stays: **‹ 1/2 ›** switches between versions |
| Get another answer | **↻** under the answer |
| Stop a long answer | The square button while it writes |
| Keep a chat out of history | **Temporary** at the top of a new chat: it's deleted after a day unless you keep it |
| Save or share an answer | The buttons under it: copy, download (Word, Markdown, PDF), save to the project |
| Find an old chat | **Search** (⌘K or Ctrl+K) searches titles and messages |

**Skills** in the message box are ready-made instructions (meeting minutes, a letter in your
company's format…): pick one and add your details.

## Documents

**Documents** is your library: PDF, Word, Excel, images (the text in them is read), CSV,
text and code. Each one is **Private** (only you) or **Shared** with the workspace. A label tells
everyone how far to trust it: *Confirmed*, *Assumption* or *To be decided*. Ask about any document
from Chat with **@**, or **Ask about this** on the document.

## Projects

A project keeps a piece of work together: instructions every chat follows ("answer as a
checklist"), sources (files, notes, saved answers), and its chats and Work AI tasks. Chats in a
project remember the project's earlier chats and tasks. **Share** gives colleagues access (they can
chat, or also edit); your chats stay private unless you share each one with the project.

## Work AI

Work AI does a task for you, step by step, on the server: makes a Word report or an Excel sheet from
your files, researches on the web, fills in a form, organizes data, writes and runs code.

1. **Work AI** → describe the task ("From these two sales sheets, make a Word report with a chart"),
   add files with the paperclip, and send.
2. Watch it work: the plan, each step and the files it makes appear as it goes. **Files** opens the
   task's folder; click a file to preview or download it.
3. **Approvals**: before anything risky (deleting files, sending a form, using a connected app), it
   stops and asks. **Approve** or **Reject**; it's also in the bell and on the Work AI home page.
4. Answer it to continue ("now add a summary table"), or **Stop** it.

Also in Work AI: **Scheduled** (a task every Monday at 9, for example), **Skills** (your own
instructions it can follow) and **Connections** (your accounts in other apps, such as Gmail or
GitHub, signed in once by you; nobody else can use them).

## Code

For those who write code: **Code** → **New workspace** (empty, or from a Git repository) opens a
full editor in the browser, with terminals and Git. The Aatmiq panel on the right is a coding agent:
ask it for a change and review the diff before you keep it. The desktop app (Windows, macOS,
Linux) opens the same editor in its own window; your admin gives you the installer.

## Learning, Calculators and Knowledge (GEM AI)

If your admin has switched them on, three more items sit in the sidebar
([details](../15-gem-ai.md)):

- **Learning**: **New course**, type a topic and pick a level. The model writes an outline, then
  each lesson when you open it. Lessons are saved, so coming back costs nothing. Mark lessons
  complete, bookmark them and keep notes (only you see them). *Write a new version* keeps the old
  one. If your admin checks lessons, a badge by the title says *Checked* (and how many corrections
  a second model made) or *Not checked*; *How this lesson was checked*, at the end, lists the
  corrections, the arithmetic and the web sources. *Check this lesson* checks one written earlier.
  Each lesson has up to seven videos; rate them *Helpful*, *Okay* or *Not helpful* to help pick
  better ones for everyone in your organization (a video you mark Not helpful folds away, with
  *Undo*).
- **Calculators**: engineering formulas, keypads, a unit converter and tools. Every number comes
  from tested code, not the model. *Verified* calculators are checked against at least five
  hand-worked cases; *beta* ones against fewer, so double-check those. In chat, ask "what is the
  ideal buck output at 48 V and 0.4 duty?" or type `/calc buck-ideal Vin=48V D=0.4`, and a result
  card shows the tested calculation.
- **Knowledge**: pick a project and ask. Answers come only from that project's documents, with the
  document, version and page for each source, and say so when the documents don't have the answer.
  Add documents in **Sources**.

## Your settings

Your name → **Settings**:

| Tab | What's there |
|---|---|
| Profile | Your name, job title, and instructions every answer follows ("I work in finance; keep answers short") |
| Security | Your password, two-step sign-in, email confirmation, and the devices you're signed in on (sign out of any) |
| Appearance | Language (English or हिन्दी; your organization's default until you pick), and light, dark or your computer's setting |
| Usage | The tokens you've used this period; **Request more tokens** asks your admin |
| Archived chats | Chats you archived, to bring back or delete |
| Your data | **Download my data**: a ZIP of everything kept about you |

## Good habits

- **Check what matters.** Answers can be wrong; the numbered sources show where an answer comes
  from.
- **Mind what you paste.** Even on your own server, don't paste passwords or other people's personal
  data unless your organization says you may.
- **Read approvals before you click.** Work AI asks because the step changes something.

## Getting help

Ask your Aatmiq admin: they can reset your password, turn off two-step sign-in if you lost your
phone, give you more tokens or another section, and see what went wrong in a task.
