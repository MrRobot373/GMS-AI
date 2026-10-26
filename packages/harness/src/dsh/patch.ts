/**
 * Builds the Cordis patch that turns DSH's stock `sdk` profile into an Aatmiq task runtime:
 * models come from Aatmiq's gateway, approvals and web search go through Aatmiq, and anything
 * that could reach a third-party cloud or change the runtime itself is switched off.
 */
import { stringify } from "yaml";
import type { TaskSpec } from "../types";
import { harnessFile } from "../files";

export const PROVIDER_ID = "aatmiq";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.floor(n)));

/**
 * How a model's context window is shared out. DSH's stock compaction keeps 65,536 tokens of
 * headroom and lets one reply take 32,768, so on a 32K window it never compacts: the history grows
 * until the model server cuts it off. Here every budget is a share of the real window.
 *
 * - `maxOutput`: the most one reply may write (reserved in every request).
 * - `summaryTokens`: the longest summary when older steps are condensed; `headroom` leaves room for
 *   that summary call's own instructions and answer.
 * - Compaction starts when a request would pass `thresholdRatio` of the window (or the window minus
 *   the reply and the headroom, if smaller) and keeps the newest `retainRatio` of it word for word.
 */
export function contextBudget(window: number) {
  const maxOutput = clamp(window / 4, 1024, 32_768);
  const summaryTokens = clamp(window / 10, 512, 8192);
  const headroom = summaryTokens + 1024;
  const threshold = Math.min(Math.floor(window * 0.8), window - maxOutput - headroom);
  return { window, maxOutput, summaryTokens, headroom, thresholdRatio: 0.8, retainRatio: 0.2, threshold };
}

/** Rows from the stock profile that must not run inside a private, multi-user deployment. */
export const DISABLED_ROWS = [
  // Third-party clouds: DeepSeek accounts, models and web search.
  "deepseek-account",
  "llm-deepseek",
  "llm-deepseek-account",
  "web-search-deepseek",
  // The agent must not install or reconfigure plugins at runtime.
  "tool-plugin-manager",
  "plugin-manager",
  "config-editor",
  "settings",
  "hmr",
  // No telemetry export.
  "otel",
  "session-telemetry-otel",
  // In-process code runtimes (not covered by the shell sandbox).
  "ptc-runtime",
  "workflow-ptc",
  "tool-workflow",
  "tool-ralph",
  // Interactive modes Aatmiq doesn't use (models call exit_plan_mode / create_goal and then stop).
  // Plans go through todo_write, which Aatmiq shows in the task's progress panel.
  "plan-mode",
  "goal",
  "goal-round-driver",
  "command-goal",
  "tool-goal",
];

/** Names the connected apps, so the agent knows which tools reach which service (and whose account). */
function connectedApps(spec: TaskSpec): string {
  if (spec.connectors.length === 0) return "";
  const apps = spec.connectors.map((c) => `${c.displayName ?? c.name}${c.account ? ` (${c.account})` : ""}: tools named mcp__${c.name}__…`);
  return `Connected apps you can use through their tools: ${apps.join("; ")}. Use them when the person refers to that service.`;
}

/** What the agent is told about its own memory, so a long job is built in a way that survives it. */
function contextRules(window: number, browser: boolean): string[] {
  return [
    `Your context window is about ${window.toLocaleString("en-US")} tokens. When it fills up, older steps are condensed into a summary automatically; what lasts is the files in your working folder and your todo_write plan.`,
    "So for anything bigger than a few steps: write the plan with todo_write first, then build one part at a time and save each file as soon as it is written. For a product or app, get a small version working end to end first (for a web page: an index.html that opens and runs), then add the features one by one.",
    "Write a long file in several parts (create it, then append or edit section by section, a few hundred lines at a time) instead of one huge write.",
    "Keep what you read small: limit command output (head, tail, grep -c, wc), read big files in ranges, never print or search minified or vendor files (like phaser.min.js), and don't read back a file you just wrote.",
    "Don't install tools, browsers or test frameworks the person didn't ask for and the task doesn't need.",
    "A self-contained piece of work (research, exploring many files, one independent module) can go to the subagent tool, so your own context stays small.",
    "If the person's request is saved in a file under .task/, read it fully before planning and read the relevant section again before you build each part.",
    "When one file uses what another defines (a function, an object's property, an element id), check the other file really defines it under that name (grep for it) before relying on it: after older steps are condensed you can't trust your memory of it.",
    browser
      ? "Before you call a program done, try it. Run what can be run; for a web page, app or game, open it with browser_open by its path in your folder (like game/index.html), fix every script error it reports, and use browser_press, browser_click_at and browser_screenshot to check it really responds. A page drawn on a canvas has no readable text: the page view lists the text drawn on the canvas with where it is, browser_eval reads the page's state (the current scene, a position, a score), and read_image shows a screenshot if you can see images. Play it the way a person would and check that what should happen does."
      : "Before you call a program done, try it: run what can be run, and at least check every script parses (for example node --check on each JavaScript file).",
    "Before your final answer, check your plan: every step done, or say plainly which ones are not and why. Never call something working that you haven't tried.",
  ];
}

export function buildPatch(spec: TaskSpec): string {
  const budget = contextBudget(spec.model.contextWindow);
  const rows: Record<string, unknown>[] = [
    {
      id: "llm-pi-ai",
      name: "@deepseek-ai/dsh-llm-pi-ai",
      config: {
        providers: {
          [PROVIDER_ID]: {
            displayName: spec.productName,
            api: "openai-completions",
            baseURL: `${spec.controlUrl}/llm/v1`,
            apiKeyEnv: "AATMIQ_TOKEN",
            retryPolicy: { mode: "normal", maxRetries: 2 },
            // Image input lets read_image (and pasted screenshots) reach models that can see.
            models: [{ id: spec.model.key, name: spec.model.name, contextWindow: spec.model.contextWindow, maxTokens: budget.maxOutput, input: spec.model.vision ? ["text", "image"] : ["text"] }],
          },
        },
      },
    },
    { id: "agent-default-model", name: "@deepseek-ai/dsh-agent-default-model", config: { provider: PROVIDER_ID, model: spec.model.key } },
    {
      id: "system-prompt",
      name: "@deepseek-ai/dsh-system-prompt",
      config: {
        personaPrefix: [
          `You are ${spec.productName}, a private AI assistant that carries out tasks for people in their organization.`,
          "You work inside a private folder on the organization's own servers: you can run commands, read and write files there, and use the tools you are given.",
          "Explain what you are doing in plain language. When you produce a document, report or data file, save it in the working folder so the person can download it.",
          "When you mention files to the person, use their names or relative paths (like `summary.md`), never the full folder path: they open and download them from Aatmiq.",
          "For work with several steps, record your plan with the todo_write tool and call it again to mark each step completed as soon as it's done, then carry the whole task out in the same turn: don't stop after planning or ask for confirmation unless something is unclear or risky.",
          // Research states only what was read: models otherwise cite pages they never opened and dress estimates as facts.
          "When you research on the web, every figure, date, price or specification you give must come from page text you read with web_fetch in this task; search results are leads, not sources.",
          "Cite a page only if you fetched it and it says what you cite it for. When a page couldn't be read or doesn't give the figure, say so plainly instead of writing an estimate as if it were the published value (no \"~91.9 %\").",
          "Put work you only need along the way (debugging and checking scripts, temporary data) in a scratch/ folder, so the working folder holds what the person asked for; files they asked for go where they asked.",
          "Save to the person's Documents in Aatmiq (documents_save) only when they ask for that; otherwise the results stay in the working folder.",
          "Check a deliverable once. When that check passes, stop: do not rewrite the file or rerun the same command to confirm it again.",
          spec.calculators
            ? "For an engineering or scientific number, use calculators_search and then calculators_run. Those results come from tested formulas. Do not replace them with your own arithmetic or a script, unless no calculator covers the question. If a calculator refuses the inputs, say why and do not invent a number."
            : "",
          process.platform === "win32"
            ? "On Windows, run a program by a quoted path with the call operator, not in a pipeline: `& 'C:\\path\\to\\python.exe' script.py`. A pipeline (`| Out-String`, `2>&1 |`) makes PowerShell refuse a program whose path contains a space. If `python` or `cmd` is not found, use `$env:SystemRoot\\System32\\cmd.exe` and look for Python only under `$env:LOCALAPPDATA\\Programs\\Python`. Do not search the whole disk."
            : "",
          ...contextRules(spec.model.contextWindow, !!spec.browser),
          "When you finish, close with a short summary: the key results, the files you made, and anything unresolved (pages you couldn't read, approximations you used, parts of the request you didn't do).",
          spec.instructions ? `\nInstructions for this task:\n${spec.instructions}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        // Long absolute task paths get mistyped by models; relative paths don't.
        personaSuffix: [
          "Your working folder is {{cwd}}. Refer to files with paths relative to it (for example `report.md` or `data/sales.csv`), not absolute paths.",
          connectedApps(spec),
        ]
          .filter(Boolean)
          .join("\n"),
      },
    },
    // Condense older steps before the window fills, with budgets sized to this model (see contextBudget).
    {
      id: "compaction-basic",
      name: "@deepseek-ai/dsh-compaction-basic",
      config: {
        thresholdRatio: budget.thresholdRatio,
        headroomTokens: budget.headroom,
        retainRatio: budget.retainRatio,
        maxTokens: budget.summaryTokens,
        compactionRetries: 2,
        maxOverflowRetries: 2,
      },
    },
    { id: "web", name: "@deepseek-ai/dsh-web", config: { searchProvider: PROVIDER_ID, fetchProvider: "http" } },
    // web_search stays DSH's; web_fetch is Aatmiq's (dsh-plugin/web.mjs): a page's main text, in parts, PDFs too.
    { id: "tool-web", name: "@deepseek-ai/dsh-tool-web", config: { fetch: false, searchTimeoutMs: 60_000 } },
    // Every approval goes to Aatmiq, whatever the sandbox mode (the stock profile skips asking when unconfined).
    { id: "approval", name: "@deepseek-ai/dsh-user-approval", config: { policy: "ask" } },
    {
      id: "skill-filesystem",
      name: "@deepseek-ai/dsh-skill-filesystem",
      config: { includeDefaultRoots: false, customSkillDirs: spec.skillsDir ? [spec.skillsDir] : [], watch: false },
    },
    ...DISABLED_ROWS.map((id) => ({ id, disabled: true })),
  ];

  const inserts: Record<string, unknown>[] = [
    {
      id: "aatmiq",
      name: harnessFile("dsh-plugin/aatmiq.mjs"),
      config: {
        controlUrl: spec.controlUrl,
        taskId: spec.taskId,
        approvals: spec.approvals,
        askForNetwork: spec.askForNetwork,
        webSearch: spec.webSearch,
        browser: !!spec.browser,
        calculators: !!spec.calculators,
        connectors: spec.connectors.map((c) => ({ name: c.name, approveTools: c.approveTools })),
      },
    },
    ...spec.connectors.map((c) => ({
      id: `mcp-${c.name}`,
      name: "@deepseek-ai/dsh-mcp-client",
      config: { serverName: c.name, transport: "streamable-http", url: c.url, ...(c.headers && Object.keys(c.headers).length ? { headers: c.headers } : {}) },
    })),
  ];
  rows.push({ insert: inserts });
  return stringify(rows, { lineWidth: 0 });
}
