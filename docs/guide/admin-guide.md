# Aatmiq: the admin guide

For the people who run Aatmiq for their organization. The **admin console** is under your name →
**Admin console** (org admins and owners). The technical details are in the team server guide
([10-team-server.md](../10-team-server.md)); this guide is the day-to-day.

## Installing

1. A server that fits your team ([sizing.md](sizing.md)), with Ubuntu, the NVIDIA driver, Docker
   and the NVIDIA Container Toolkit.
2. The release's deploy folder (or, without internet, the offline bundle):
   [13-releases.md](../13-releases.md#installing-a-release).
3. `cp deploy/.env.example deploy/.env` and fill in: `DOMAIN` and `APP_URL` (the address people
   open), `APP_SECRET` (a long random string; keep a copy, it unlocks stored keys after a restore),
   `POSTGRES_PASSWORD`, `CADDY_TLS` (your certificate, or `internal`), `BACKUP_DIR` (another disk or
   a share), `SMTP_URL` and `MAIL_FROM` (for invitations, resets and alerts), `LINEUP` (the models).
4. `deploy/team.sh pull && deploy/team.sh up -d`. The first start downloads the models (about 30 GB).
5. Open the address: the first person to sign up is the **owner**. Then **Admin → Health**: everything
   should be green except *Backups* until the first night (or run one now:
   `deploy/team.sh exec backup /scripts/backup.sh`).
6. **Admin → License**: paste the license key from your order.

## People

**Admin → Users**

| To | Do |
|---|---|
| Invite people | **Invite people** (one, or *Invite several people* with a list of emails). With email set up they get the link; otherwise copy it to them |
| Make someone an admin | ⋯ → **Make org admin** (they can manage everything except the owner) |
| Reset a password | ⋯ → **Send password reset link** |
| Someone lost their phone | ⋯ → **Turn off two-step sign-in**; they set it up again |
| Someone leaves | ⋯ → **Deactivate** (keeps their chats and documents; frees no seat), or **Erase person and data…** (deletes everything they made; their shared projects can go to a colleague; frees the seat) |
| A privacy request | ⋯ → **Download their data** (a ZIP of everything about them), and erase if asked: [12-personal-data.md](../12-personal-data.md) |

**Workspaces** are teams with their own members, models and budget; **Groups** give a set of people
models and a token budget across workspaces. In a workspace's members you choose each person's
sections: Chat, Work AI, Code.

## Tokens and budgets

Every answer costs tokens (the words read and written). **Admin → Workspaces → Budget** sets how
many a workspace gets per day, week or month, split evenly or per person. People who run out can
**Request more tokens**; requests arrive in **Admin → Token requests** (approve, adjust or decline;
they're told). **Admin → Usage** shows who used what, by model and section, with a CSV download.

## Models

**Admin → Models**

- **Providers** are the model servers (on the team server: vLLM and Ollama, registered at setup).
  The dot shows if they answer.
- **Models**: where each can be used (Chat, Work AI, Code), whether it reads images, whether it can
  switch thinking, and its **Auto tier** (Fast, Standard, Advanced or Not used).
- **Auto** picks the model for each message by how hard it is. Try it with the box: type a message
  and see which model would answer and why. Details: [02-models.md](../02-models.md#auto).
- Workspaces get models in **Admin → Workspaces → Models** (and the default one).

## Security

| Where | What to set |
|---|---|
| Admin → Authentication | Require two-step sign-in (right away, or with a few days' grace and reminders); single sign-on with Google, Microsoft, any OpenID Connect or SAML 2.0 provider (import its metadata); require it for everyone but the owner |
| Admin → Work AI | When the agent asks first (risky steps, always, never), how many tasks run at once, web search, the browser and which internal sites it may open, container limits |
| Admin → Audit log | Who did what and when: sign-ins, changes, downloads, erasures |
| Admin → Settings | The name, logo and colors; prompt logging (off by default: say so to your people if you turn it on); how long chats are kept; email |

Each Work AI task and each person's editor runs as its own user on the server and can't reach the
database, the model servers or your office network: [10-team-server.md#security](../10-team-server.md#security).

## Keeping it healthy

- **Admin → Health** checks the database, disk, models, Work AI, background jobs, backups,
  isolation, license and email every 5 minutes. Admins get an email when something breaks, a
  reminder each day it lasts, and another when it's fixed.
- **Backups** run every night to `BACKUP_DIR` and keep the last 14. Practise a restore once
  (onto a spare machine): [10-team-server.md#backups](../10-team-server.md#backups).
- **Updates**: read the release notes, back up, set the new `AATMIQ_VERSION`, then
  `deploy/team.sh pull && deploy/team.sh up -d`: [13-releases.md](../13-releases.md#updating).

## When something's wrong

| What people see | Look at | Usually |
|---|---|---|
| "No model is available" | Admin → Models, Health → Models | The model server is still loading (first start) or stopped: `deploy/team.sh ps`, `deploy/team.sh logs vllm` |
| Answers are slow at busy times | Health → Work AI (tasks waiting), Usage | Lower *Tasks working at once* (Admin → Work AI); check Auto sends quick questions to the fast model |
| "You've used your token allowance" | Admin → Token requests, the workspace budget | Approve their request or raise the budget |
| A task waits for ever | The task page, the bell | It's waiting for an approval; or for a slot (Health shows the queue) |
| A document says *Failed* | Documents, Health → Background jobs | A scanned file without text, or a damaged file: open it to check, upload again |
| No emails arrive | Admin → Settings → Email → **Send test email** | The mail server settings or a spam filter |
| Health says Disk is low | Admin → Health | Old task folders and documents: ask people to delete what they don't need; move backups off the server |

For anything else, `deploy/team.sh logs api` shows what the server did, and support (from your
order) can help.
