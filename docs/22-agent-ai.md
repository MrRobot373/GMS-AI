# Agent AI (the opencode engine)

Agent AI is a third engine for tasks, next to **Work AI** (DeepSeek Harness, with Aatmiq's checklist, reviewer and
extra checks) and **Super AI** (the Claude Code agent loop, docs/20-super-ai.md). It runs
[opencode](https://github.com/anomalyco/opencode) (MIT license), an open-source agent, on the same models.

It has its own page and task list (**Agent AI** in the sidebar, under Super AI), so the three can be compared on the
same job.

## What it is like

- **Fast and light.** opencode's own prompt is short and it doesn't plan, review or re-check unless told to. On the
  same task and model it finished in 15–30 seconds where Work AI took about 2 minutes.
- **Plain tasks.** Like Super AI, none of Work AI's checklist, stages or independent reviewer. Aatmiq still sends it back
  once when it says it's done without a file the request named (`report.md`, `sales.xlsx`…), or when it stopped mid-way.
- **Best for** quick jobs and coding; **Work AI** remains the better choice for reports and documents that must be right.

## How it is connected

| | |
|---|---|
| Program | `opencode serve --pure` per task, on 127.0.0.1 with a random password, as the task's own Unix user |
| Model | the task's model through Aatmiq's gateway (`/llm/v1`), with the model's context size: admins' models, quotas and usage apply |
| Its own tools | bash, read, write, edit, glob, grep, list, todo list, sub-agents (task), skills |
| Aatmiq's tools | web_search, web_fetch, browser_*, documents_*, calculators_*, task_recall, from `packages/harness/opencode/mcp.mjs` (an MCP server over stdio) |
| Connectors | the task's connectors as opencode's remote MCP servers |
| Approvals | every action asks; Work AI's rules answer at once for safe ones and send risky ones to the person (deleting, installing, network, connector tools marked for approval, anything outside the task's folder) |
| Off | opencode's own web search and fetch (they would bypass the organization's search), plugins from npm (`--pure`), update checks, sharing, language servers |
| Skills | the person's skill library, where opencode looks for skills |
| Folders | works in a folder like the other engines (with snapshot and undo) |

Nothing leaves the server on its own: the model and tools are Aatmiq's, and opencode is started without plugins and
without proxy settings.

## For admins

- **Admin → Work AI → Agent AI → Offer Agent AI** (on by default when installed).
- The Docker image includes opencode unless built with `--build-arg AGENT_AI=false`. Elsewhere it comes with the harness
  package (`opencode-ai`); `AATMIQ_OPENCODE_BIN` points to another copy of the program.
- Not available with `WORK_ISOLATION=container` yet (like Super AI).

## Comparison (November 2026, same model on all three)

Model: `nvidia/nemotron-3.5-lightning-30b-a3b` (similar to a 30B Qwen), 128K window unless noted; the real app, with a
test search engine, web page, "Notes" connector, an uploaded document, the calculators and a real Chromium.

| Scenario | Work AI | Super AI | Agent AI |
|---|---|---|---|
| Files: Excel + chart + report, then edit the report | ✅ 211 s + 18 s, most thorough | ✅ 51 s + 9 s | ✅ 51 s + 12 s |
| Web search + read page → motors.md (90.4 / 92.6 %) | ✅ 9 s | ✅ 12 s | ✅ 12 s (an earlier run used numbers from memory) |
| Organization documents + calculators | ✅ 9 s | ✅ 12 s | ✅ 9 s |
| Browser: build a counter page, click 3×, check | ✅ 84 s (re-checked) | ✅ 9 s | ✅ 12 s |
| Connector (list, create with approval) + `rm -rf` with approval | ✅ | ✅ | ✅ |
| Long context, 32K window: 4,000-line file, 3 turns, recall | ✅ all 3 | ⚠️ fails on big files at 32K; ✅ all 3 at 64K | ✅ all 3 |

Notes:
- Token use per task is similar for Super AI and Agent AI and lowest for Work AI on short tasks; Work AI spends more on
  long ones (its checklist and reviewer).
- **Super AI needs a 64K window** for work with big files: Claude Code's own prompt and tool list fill much of a 32K one.
- Agent AI: after condensing, opencode asks the model to "continue"; a bare reply to that ("what next?") is not shown, and
  the task's first request stays in its instructions (Super AI too).
