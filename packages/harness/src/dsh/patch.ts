/**
 * Builds the Cordis patch that turns DSH's stock `sdk` profile into an Aatmiq task runtime:
 * models come from Aatmiq's gateway, approvals and web search go through Aatmiq, and anything
 * that could reach a third-party cloud or change the runtime itself is switched off.
 */
import { stringify } from "yaml";
import type { TaskSpec } from "../types";
import { harnessFile } from "../files";

export const PROVIDER_ID = "aatmiq";

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

export function buildPatch(spec: TaskSpec): string {
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
            models: [{ id: spec.model.key, name: spec.model.name, contextWindow: spec.model.contextWindow, input: spec.model.vision ? ["text", "image"] : ["text"] }],
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
