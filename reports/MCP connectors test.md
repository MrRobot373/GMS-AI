# MCP connectors test

Checked on 22 October 2026 against the local app (http://localhost:3000, organization GMS) and against the 45 servers in the connector catalog. The organization had no connectors saved. Four open servers were added, tested from Admin → Work AI, then removed, so the page is empty again.

## Result

The connector feature works. Admin → Work AI → Connectors loads, a connector can be added, and **Test** talks to the remote MCP server and lists its tools.

Of the 45 catalog servers, **43 answered correctly** when checked one at a time. **Gmail** and **Google Drive** did not answer from this network: the connection timed out after about 10 seconds. Nothing is signed in. OAuth connectors were only checked as far as “the sign-in server is published.” A person still has to click Connect before a task can use Gmail, Slack, GitHub, and the rest.

## What was already set up

Admin → Work AI → Connectors said “No connectors yet.” Work AI itself is running (12 tasks this week, none running now). Approvals are “Before risky actions.” No OAuth app (Google, Slack, GitHub, and so on) is stored, so those connectors cannot be used until an admin adds one and each person connects their own account.

## In-app test

The four catalog servers that need no sign-in were added, then tested with the same **Test** action the admin page uses (`POST /api/admin/connectors/:id/test`). DeepWiki was also clicked in the browser. The dialog said “DeepWiki is connected” and listed 3 tools.

| Connector | Address | Test | Tools the agent would get |
| --- | --- | --- | --- |
| DeepWiki | `https://mcp.deepwiki.com/mcp` | Connected in 3.0s, and in the browser dialog | `ask_wiki_question`, `read_wiki_contents`, `read_wiki_structure` |
| Microsoft Learn | `https://learn.microsoft.com/api/mcp` | Connected in 1.4s | `microsoft_docs_search`, `microsoft_code_sample_search`, `microsoft_docs_fetch` |
| AWS Knowledge | `https://knowledge-mcp.global.api.aws` | Connected in 0.4s | `aws___read_documentation`, `aws___search_documentation`, `aws___list_regions`, `aws___get_regional_availability`, `aws___retrieve_skill` |
| Hugging Face | `https://hf.co/mcp` | Connected in 2.2s | `hf_whoami`, `hub_repo_search`, `hub_repo_details`, `hf_fs` |

A second check called one real tool on each of those four, not only the tool list:

| Server | Tool called | Answer |
| --- | --- | --- |
| DeepWiki | `read_wiki_structure` on facebook/react | 1,348 characters |
| Microsoft Learn | `microsoft_docs_search` | 24,731 characters |
| AWS Knowledge | `aws___search_documentation` for “S3 bucket versioning” | 2,018 characters |
| Hugging Face | `hub_repo_search` for “whisper” | 2,606 characters |

All four were then removed. Admin → Work AI → Connectors is empty again. Adding them did write audit events (`work.connector.added` and `work.connector.deleted`).

## Catalog check

`tests/connectors/check.mts` asks every catalog entry what Aatmiq asks when an admin adds it:

- Open servers: connect, list tools, call one read-only tool.
- OAuth servers: find the sign-in address. Automatic ones must also offer self-registration. Admin ones must point at the expected company (Google, Slack, GitHub, and so on). No account is created and nobody is signed in.
- Token servers: the server must refuse a call that has no token.

The first run asked eight servers at once and reported 37/45. Six of the eight failures were connection timeouts from doing them together. Checked again one at a time, those six succeeded. The two that still fail are below.

### Could not be reached

| Connector | Address | What happened |
| --- | --- | --- |
| Gmail | `https://gmailmcp.googleapis.com/mcp/v1` | Connection timed out (`UND_ERR_CONNECT_TIMEOUT`, about 10s). A later try also failed DNS (`EAI_AGAIN`). |
| Google Drive | `https://drivemcp.googleapis.com/mcp/v1` | Same connection timeout, on two separate tries. |

These two cannot be added and tested from this machine until `gmailmcp.googleapis.com` and `drivemcp.googleapis.com` answer. The other Google connectors (Calendar, Docs, Sheets, Slides) did answer and point sign-in at `accounts.google.com`.

### Open servers (4) — working

DeepWiki, Microsoft Learn, AWS Knowledge, Hugging Face. No key, no OAuth app. Test lists tools, and a real tool call returned text.

### Shared token (1) — working as designed

GitHub (token) refused a call with no token (401). That is the expected result. It is not connected to a GitHub account.

### Admin OAuth app (12)

The admin pastes a client id and secret. This check only confirms the sign-in server.

| Connector | Sign-in server | This check |
| --- | --- | --- |
| Gmail | not reached | Fail |
| Google Calendar | accounts.google.com | Pass |
| Google Drive | not reached | Fail |
| Google Docs | accounts.google.com | Pass |
| Google Sheets | accounts.google.com | Pass |
| Google Slides | accounts.google.com | Pass |
| Box | account.box.com | Pass |
| Slack | slack.com | Pass |
| Zoom | zoom.us | Pass |
| Asana | app.asana.com | Pass |
| HubSpot | mcp.hubspot.com | Pass |
| GitHub | github.com | Pass |

### Automatic sign-in (28) — all working

Each one publishes a sign-in address and lets Aatmiq register itself. Nobody was signed in.

Calendly, Dropbox, Canva, Figma, Miro, Gamma, Fireflies, Linear, Atlassian, Monday, Todoist, Intercom, Attio, Close, Stripe, PayPal, Square, GitLab, Sentry, Vercel, Netlify, Cloudflare Workers, Supabase, Neon, Airtable, Zapier, Notion, ClickUp.

Notion and ClickUp failed the first parallel pass (connection timeout) and passed alone: Notion signs in at `mcp.notion.com` and ClickUp at `mcp.clickup.com`, and both register themselves.

## What this does not prove

- No person has clicked **Connect**. A Work AI task still cannot read Gmail, Slack, GitHub, or any other signed-in app.
- Gmail and Google Drive were not tested as tools, because their hosts did not answer.
- The four open servers were not left turned on. To use them, add them again from Admin → Work AI → Add connector. **Test** should list the same tools. They need no account under Work AI → Connections.

## How to turn a signed-in connector on

1. For Google, Slack, GitHub, Box, Zoom, Asana, or HubSpot, create that service’s OAuth app with redirect URI `APP_URL/api/connectors/oauth/callback`, then paste the client id and secret when adding the connector.
2. For Notion, Canva, Linear, and the other automatic entries, add the connector and click **Connect**. Nothing to register first.
3. Click **Test**. For an OAuth connector it says sign-in is ready until that admin connects their own account. After Connect, Test lists the tools.
4. Work AI → Connections is where each person connects their own account. A task uses only that person’s access.
