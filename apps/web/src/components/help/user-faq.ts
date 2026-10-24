import { msg } from "@/i18n";
import type { FaqSection } from "./faq-list";

/** Questions for someone using the workspace. Shown in Settings. */
export const USER_FAQ: FaqSection[] = [
  {
    title: msg("Getting around"),
    items: [
      {
        q: msg("What is a workspace?"),
        a: msg("A workspace is one team's space inside your organization. It has its own people, models and token allowance. Chat, documents, projects and Work AI tasks belong to the workspace selected at the top of the sidebar. Another team would be a separate workspace, and switching to it shows that team's work."),
      },
      {
        q: msg("What is the difference between Chat, Work AI and Code?"),
        a: msg("Chat answers in the conversation. Work AI is given a goal: it plans, runs tools in a private folder and leaves files you can download. Code is the editor, with a terminal and Git, and an agent that edits the files in that workspace. Learning writes courses, Calculators run tested formulas, and Knowledge answers only from one project's documents."),
      },
      {
        q: msg("What does Search find?"),
        a: msg("Search in the sidebar looks through your chats, their messages, your documents and your projects. It does not look through Work AI tasks. Open Work AI to find those. A temporary chat is left out, because it is not kept."),
      },
    ],
  },
  {
    title: msg("Chat"),
    items: [
      {
        q: msg("How do I choose a model?"),
        a: msg("The model menu sits under the message box. Auto picks a model for each message. The other names are specific models your admin has enabled for this workspace. A chat remembers the model you pick. Auto may use a different one for the next message."),
      },
      {
        q: msg("What does Auto do?"),
        a: msg("Auto judges how hard the message is and sends it to a fast, standard or advanced model. Your admin chooses which model sits in each of those tiers. Everyday questions stay on the fast model. Harder ones can use a larger model, and thinking is turned on only for those."),
      },
      {
        q: msg("What is a temporary chat?"),
        a: msg("Turn on Temporary before you send the first message. That chat is not kept in your history, in search, or in project memory. You can keep it later from the chat itself if you change your mind while it is still open."),
      },
      {
        q: msg("When should I turn on Search the web?"),
        a: msg("Turn it on when the answer depends on public pages: a current price, a news item, or a document that is not already in your workspace. Leave it off for questions about your own files. Web search has to be set up by an admin. If it is off for the organization, the switch does nothing useful."),
      },
      {
        q: msg("How do documents work in a chat?"),
        a: msg("Upload a file in Documents, or attach one from the message box. The answer can cite the file with numbered sources, and you can open the passage it used. Files stay on your organization's servers. A shared document is visible to the workspace. A private one is only yours."),
      },
    ],
  },
  {
    title: msg("Work AI"),
    items: [
      {
        q: msg("What happens when I give Work AI a task?"),
        a: msg("You describe the goal and pick a model, or leave it on Auto. The agent plans, then reads and writes files and runs commands in a private folder for that task. The timeline shows each step. The task keeps running if you close the browser. Send another message on the same task to continue it."),
      },
      {
        q: msg("Where are the files, and when does it ask me first?"),
        a: msg("Finished files stay in the task's Files panel until you download them. Work it only needed along the way goes in a scratch folder. It asks before a risky step, such as deleting files, sending mail, or using the network, unless your admin has set approvals differently. Approving or rejecting is on the task page and under Waiting for you."),
      },
      {
        q: msg("What are skills, schedules and connections?"),
        a: msg("A skill is written instructions the agent follows when the task fits, such as how your team writes a report. A schedule runs a prompt on a clock and each run is a new task. A connection is your own account in an app your admin has added, such as mail or GitHub. The agent then acts only with your access."),
      },
    ],
  },
  {
    title: msg("Learning, calculators and knowledge"),
    items: [
      {
        q: msg("How does a course get written?"),
        a: msg("In Learning you name a topic and a level. The model writes an outline, then each lesson. Lessons are saved, so opening one later does not spend tokens again. A lesson can include a formula and a public YouTube video when that is set up. Your token allowance pays for the writing."),
      },
      {
        q: msg("Why should I trust a calculator number?"),
        a: msg("Calculators do not ask a model for the number. Each one runs tested code, shows the formula, and states the assumptions. Verified ones have been checked against hand-worked cases. Beta ones have been checked against fewer. Chat and Work AI can call the same calculators as tools, and the number still comes from that code. You can also send a result to chat if you want it explained."),
      },
      {
        q: msg("Why can't I ask Knowledge a question yet?"),
        a: msg("Knowledge answers from one project's documents only, and it cites the document, version and page. If you have no project, or the project has no sources, there is nothing to ask. Create a project, add its files, and open Knowledge again. If the documents do not contain the answer, it says so instead of guessing."),
      },
    ],
  },
  {
    title: msg("Your account"),
    items: [
      {
        q: msg("What happens when I reach my token allowance?"),
        a: msg("Chat, Work AI and course writing all draw from the same allowance for this workspace. Usage, in Settings, shows how much you have used and when it resets. Request more from that page. An admin approves or declines it. Until more is approved, new work waits."),
      },
      {
        q: msg("How do I change language, theme or password?"),
        a: msg("Appearance sets the language of the interface and the theme. Chat still answers in the language you write in. Security is where you change your password and turn on two-step sign-in with an authenticator app. Changing the password signs you out on your other devices. Confirming your email waits until an admin has set up email."),
      },
      {
        q: msg("How do I download everything kept about me?"),
        a: msg("Your data, in Settings, builds a ZIP of your profile, chats, documents, projects, Work AI tasks and their files, skills, schedules, connections, usage and the activity log about you. Passwords and app tokens are never included. Erasing the account is done by an admin, and it cannot be undone."),
      },
    ],
  },
];
