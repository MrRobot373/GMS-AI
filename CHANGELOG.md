# Changelog

What changed in each release of Aatmiq. Versions follow [semantic versioning](https://semver.org):
a new major version can need steps when updating (they're listed here), minor versions add features,
patch versions fix things. How to update: [docs/13-releases.md](docs/13-releases.md).

Each release has a section `## <version> — <date>`; `scripts/release.mjs` refuses to tag a version
without one.

## Unreleased

- Single sign-on with any SAML 2.0 identity provider (Okta, Entra ID, Google Workspace, ADFS…):
  import its metadata in Admin → Authentication; the provider's app tile works too.
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
