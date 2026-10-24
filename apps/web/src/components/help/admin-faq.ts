import { msg } from "@/i18n";
import type { FaqSection } from "./faq-list";

/** Questions for someone running the organization. Shown in the admin console. */
export const ADMIN_FAQ: FaqSection[] = [
  {
    title: msg("People and workspaces"),
    items: [
      {
        q: msg("What is the difference between the organization and a workspace?"),
        a: msg("The organization is the whole company: its name, sign-in rules, license and the people in it. A workspace is one team inside it, with its own members, models, budget and tools. General is the workspace created with the organization. Add another when a team should not share models or a token allowance."),
      },
      {
        q: msg("How do I invite someone, and what do the roles mean?"),
        a: msg("Users → Invite people sends a link to their work email. The link expires after 7 days, and email has to be set up or you give them the link yourself. An owner can do everything, including billing-level settings. An admin runs the organization. A member uses the workspaces they are added to. Inside a workspace you can also make someone a workspace admin, which does not make them an organization admin."),
      },
      {
        q: msg("How do I give a person Chat but not Code?"),
        a: msg("Open the workspace, then its members. Each person has a set of sections: Chat, Work AI, Code, Learning, Calculators and Knowledge. Turn a section off and it disappears for that person in that workspace. Turning a module off for the whole organization is under Admin → Settings, and that hides it for everyone."),
      },
    ],
  },
  {
    title: msg("Models and tokens"),
    items: [
      {
        q: msg("How do I add a model and choose who can use it?"),
        a: msg("Models → Add provider points at Ollama or any OpenAI-compatible server. After the check succeeds, add the models it lists and enable each one. On the model you choose Chat, Work AI, Code, whether it can read images, and whether it can turn thinking on and off. A workspace only sees the models you assign to it, under that workspace's Models tab."),
      },
      {
        q: msg("What are fast, standard, advanced and Auto?"),
        a: msg("Auto does not call one fixed model. It sorts each message and sends it to the model you placed in the fast, standard or advanced tier. Thinking stays off for everyday messages and turns on for hard ones, and only for models that can switch it. Mark one model as the default if you want it first when someone is not using Auto."),
      },
      {
        q: msg("How does a token budget work?"),
        a: msg("A workspace budget is split across its members for the period. You can give one person a different limit. Usage shows tokens by person, model and section, and exports a CSV. When someone hits their limit they can request more. Token requests lists what is waiting. Approve it and their paused work can continue. There is no separate wallet for Work AI: it draws from the same allowance as Chat."),
      },
    ],
  },
  {
    title: msg("Work AI"),
    items: [
      {
        q: msg("What do the Work AI approval settings change?"),
        a: msg("Admin → Work AI → Approvals has three levels. Before risky actions stops deletes, sending mail, and commands that use the network when network use is not allowed. Before every change stops on any edit. Never runs without asking. People still see each step in the task timeline. A connector can have its own rule on top of this."),
      },
      {
        q: msg("How do I turn on web search, the browser and the network?"),
        a: msg("Web search uses the same provider as Chat. Set it under Admin → Settings, or point Work AI at your own SearXNG server and press Test. The browser lets the agent open public pages that need JavaScript. Allow the network lets ordinary commands reach the internet without an extra approval. Leave it off if you want those commands to ask first. The browser still refuses private addresses except hosts you list."),
      },
      {
        q: msg("How do connectors work?"),
        a: msg("Add a connector under Admin → Work AI → Connectors. Each person then connects their own account in Work AI → Connections. Tasks act only with that person's access. Read-style tools can run freely. Changes ask first, unless you set the connector to ask every time or never. A shared token is for a service account you control. Test lists the tools with your own sign-in."),
      },
      {
        q: msg("Why did a task fail before it did any work?"),
        a: msg("If the message says the runtime was still starting, the agent process did not become ready in time. Sending the task again usually starts it. If the message says the server restarted, files already saved are still in the task folder and a follow-up message continues the work. Health shows whether the queue is accepting tasks."),
      },
    ],
  },
  {
    title: msg("The server"),
    items: [
      {
        q: msg("What should I do when Health says something needs a look?"),
        a: msg("Health checks the database, disk, model servers, Work AI's queue, jobs, backups, isolation, the license and email. Working means that check passed. Needs a look names the fix: a backup has never been recorded, tasks are running as the API user, email is not set up, or no license key is configured. Check now runs the checks again. Admins are notified in the app, and by email if email is on."),
      },
      {
        q: msg("How do I set up email?"),
        a: msg("Admin → Settings → Email takes the SMTP server, or you set SMTP_URL and MAIL_FROM in the server environment. Send a test message to yourself before you rely on it. Invitations, password resets, email confirmation and health alerts all use this. Until it is set, those messages only exist inside the app, or not at all."),
      },
      {
        q: msg("What does the audit log keep?"),
        a: msg("The audit log records sign-ins, invitations, role changes, model changes, budget changes, approvals and setting changes. Filter it by users, workspaces, models, providers, budgets, token requests or settings. It does not store the text of chats. Someone's download of their own data includes the activity log about them, not other people's."),
      },
      {
        q: msg("What does development mode on the license page mean?"),
        a: msg("Development mode means this server has no license public key, so every feature is available and nothing is checked. A production install sets LICENSE_PUBLIC_KEY and you paste the license under Admin → License. The license server only ever receives counts, such as how many seats are in use, never chats, files or names."),
      },
      {
        q: msg("How do I turn Learning, Calculators or Knowledge off?"),
        a: msg("Admin → Settings → GEM AI modules. Switching one off hides it for everyone and does not affect Chat, Work AI or Code. A person's own access is still set per workspace. Beta calculators can be hidden on their own. Web search for chat is on the same page, separate from Work AI's search setting."),
      },
    ],
  },
];
