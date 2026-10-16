# Personal data

What Aatmiq keeps about a person, how they get a copy, and how an admin erases them, for
requests under India's Digital Personal Data Protection Act (DPDP), the GDPR and customer
contracts.

| Right | In Aatmiq |
|---|---|
| Access, portability | **Settings → Your data → Download my data** (the person), or **Admin → Users → ⋯ → Download their data** (an admin, for them) |
| Correction | Settings → Profile (name, job title, instructions); an admin for the email address |
| Erasure | **Admin → Users → ⋯ → Erase person and data…** |
| Withdrawing consent, leaving | Deactivate (keeps their things, frees nothing) or erase (frees the seat) |
| Storage limitation | **Admin → Settings → Data & privacy → Delete chats automatically after** N days: chats nobody has touched for that long are deleted within the hour (temporary chats always after a day) |

Your people need a notice saying what Aatmiq stores about them and who can see it: there's a
template in [legal/STAFF-NOTICE.md](../legal/STAFF-NOTICE.md).

## The download

A ZIP, made as it downloads (large exports don't fill the server's memory):

| File | What |
|---|---|
| `profile.json` | Name, email, role, status, job title, custom instructions, two-step sign-in on or off, the directory that keeps them up to date (SCIM or LDAP, with its id for them), sign-in methods, sessions (devices, addresses, times), workspaces and groups |
| `chats/` | Every chat, every message and version: JSON with the full branch structure, and readable Markdown |
| `documents/`, `documents.json` | The files they uploaded (originals), notes and saved answers, and their details |
| `projects.json` | Projects they own (with instructions) and the ones they're a member of |
| `work/` | Each Work AI task: its timeline (`task.json`) and the files it made, up to 500 MB in all (anything over is listed in `README.txt`) |
| `skills.json`, `schedules.json`, `connected-apps.json`, `code-workspaces.json` | Their skills (organization ones they wrote too), schedules, the apps they connected (names only), code workspaces |
| `token-requests.json`, `notifications.json` | Requests for more tokens and their answers; notifications |
| `usage.csv` | Each model call: time, section, tokens, outcome |
| `activity-log.json` | What the activity log recorded about them or by them |
| `README.txt` | What each file is, and anything left out |

Never in it: password hashes, two-step sign-in secrets, session tokens, app tokens, provider keys.
The code in their code workspaces isn't either (it's the person's own folders; they download it
from the editor). Each download is recorded in the activity log (`user.data_exported`).

## Erasing a person

Only org admins, and never the owner or themselves. The admin types the person's email to confirm
and chooses who receives the shared things:

| | With someone to receive them | Nobody |
|---|---|---|
| Account, sessions, sign-in methods, two-step sign-in | deleted | deleted |
| Chats (all messages), notifications, schedules, personal skills, connected apps, token requests | deleted | deleted |
| Work AI tasks, their timelines and folders (running ones are stopped) | deleted | deleted |
| Code workspaces, their folders and the editor's home | deleted | deleted |
| Private documents and their files | deleted | deleted |
| Projects they own (with their files and notes) | moved to that person | deleted |
| Documents shared with a workspace | moved to that person | deleted |
| Organization skills they wrote | moved to that person | moved to the admin |
| Usage events | kept without their name (the totals stay right) | same |
| Activity log | kept; their id and email replaced by a pseudonym (`erased-…`), in entry details too | same |
| Pending invitations to their email | deleted | deleted |

The seat is free at once. Someone kept by directory sync (SCIM or LDAP) comes back as a new, empty account at the next sync, unless you first remove them from the directory or from what it syncs (the app's assignments at the provider, or the LDAP filter). The erase is recorded as `user.erased` with the pseudonym, who received
the shared items and how many of each kind went.

Two things erasing can't reach right away, worth telling the person:

- **Backups** made before the erase still contain them until they expire (`BACKUP_KEEP`,
  the last 14 by default; see [10-team-server.md](10-team-server.md#backups)). Restoring an older
  backup brings them back: erase them again after a restore.
- **Other people's copies**: answers someone else saved, messages they forwarded, files they
  downloaded.

## A request, step by step

1. Check the request comes from the person (from their work email, or in person).
2. If they want a copy: Admin → Users → ⋯ → **Download their data**, and send it to them safely.
3. If they want to be erased: decide with their manager who receives their shared projects, then
   **Erase person and data…**.
4. Keep a note of the request and what you did (the activity log has the time and the admin).

## API

| Method | Path | |
|---|---|---|
| GET | `/api/me/export` | Your data, as a ZIP |
| GET | `/api/admin/users/:id/export` | A person's data (org admins) |
| POST | `/api/admin/users/:id/erase` | `{confirmEmail, transferTo?}`; answers with how many chats, documents, projects and tasks went or moved |

Tests: `apps/api/src/personal-data.test.ts` (contents of the ZIP, no secrets in it, who may,
what's deleted, moved and kept) and `tests/e2e/account.mjs` (the download and the erase dialog).
