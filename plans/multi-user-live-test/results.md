# Campaign results (in progress)

App: http://localhost:3000 on this PC. Models: the Tailscale gateway. Search: SearXNG through a local proxy on 127.0.0.1:8095 because the product client does not send the gate's API key.

## Wave 0

| Check | Result | Notes |
|---|---|---|
| Gateway health | Pass | `fast`, `inkling`, `embed`, `main` listed for the key. `medgemma` is not on this key. |
| `main` disabled in the app | Pass | Not registered. Standard and Advanced are both inkling. Fast is fast. Embed is on. |
| App and database | Pass | Postgres 16.11 with pgvector 0.8.7. Migrations applied. Owner signed in. |
| SearXNG | Pass | Proxy search for IEC 61439 returned 27 results. First title mentions IEC 61439-1:2020. A direct call with no key is still 401. |
| Image probe | Not run | |
| Super AI / Agent AI offered | Not run | Home sidebar shows Work AI only. |
| Computer AI | Pass | Not offered. Switch was not turned on. |
| Five users, two workspaces, four projects | Not run | |
| Allowed folder | Not run | |

## Wave 2, first turn only

| Id | Result | Notes |
|---|---|---|
| C1 | Pass | Prompt `hi`. Chip: Auto · fast. Greeting. No web search. |
