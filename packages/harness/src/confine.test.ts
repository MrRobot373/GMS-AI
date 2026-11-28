/**
 * Keeping a task where it belongs (plans/agent-test/results.md, findings 1, 2, 4, 5, 10, 12): on Windows nothing confined
 * a command, every engine read other tasks' folders, chat uploads and the server's own files, PowerShell deleted files
 * without asking, Agent AI's questions were thrown away and Super AI's approvals didn't say what they were for.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { approvalDetail, gitBashEnv, preToolUse } from "./claude/engine";
import { opencodeConfig, opencodeNames } from "./opencode/engine";
import { permissionCall } from "./opencode/map";
import { checkPlace, classifyRisk, commandPaths, PROTECTED_DENIAL } from "./policy";
import type { Confine, TaskSpec } from "./types";

const risky = { approvals: "risky" as const, askForNetwork: true, connectors: [] };

describe("PowerShell in the approval rules", () => {
  it("asks before PowerShell deletes, moves, downloads, installs or stops things", () => {
    const cases: [string, string][] = [
      ["Remove-Item -Path 'cache.tmp','run1.tmp' -Force", "Deletes files"],
      ["Get-ChildItem *.tmp | Remove-Item", "Deletes files"],
      ["del *.tmp", "Deletes files"],
      ["rd /s /q build", "Deletes files"],
      ["[IO.File]::Delete('a.txt')", "Deletes files"],
      ["$f.Delete()", "Deletes files"],
      ["Clear-Content log.txt", "Empties files"],
      ["Move-Item a.txt b.txt", "Moves or renames files"],
      ["Rename-Item old.md new.md", "Moves or renames files"],
      ["(Invoke-WebRequest -Uri 'https://x.test' -UseBasicParsing).Content", "Uses the network"],
      ["iwr https://x.test -OutFile x.html", "Uses the network"],
      ["Invoke-RestMethod https://api.x.test/v1", "Uses the network"],
      ["(New-Object Net.WebClient).DownloadFile('https://x.test/a.zip', 'a.zip')", "Uses the network"],
      ["Install-Module ImportExcel -Scope CurrentUser", "Downloads or publishes packages"],
      ["winget install Python.Python.3.12", "Downloads or publishes packages"],
      ["Stop-Process -Name python", "Runs a system-level command"],
      ["Set-ExecutionPolicy Unrestricted", "Runs a system-level command"],
      ["Invoke-RestMethod https://x.test -SkipCertificateCheck", "Turns off certificate checks"],
    ];
    for (const [command, reason] of cases) expect(classifyRisk({ name: "pwsh", args: { command } }, risky), command).toBe(reason);
  });
  it("doesn't mistake ordinary code or reading for them", () => {
    for (const command of [
      "Get-ChildItem -Force; Write-Host done",
      'python -c "d = {1: 2}\ndel d[1]\nprint(d)"',
      'node -e "const m = new Map(); m.delete(1)"',
      "python -c \"move = 3; print(move)\"",
      "Get-Content notes.md | Select-String remove",
    ])
      expect(classifyRisk({ name: "pwsh", args: { command } }, risky), command).toBeNull();
  });
});

describe("where a task may go", () => {
  let base: string;
  let confine: Confine;
  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "confine-"));
    for (const d of ["app/.data/work/t1/files", "app/.data/work/t1/runtime/skills/x", "app/.data/work/t2/files", "app/.data/chat/c1/inputs", "programs/python", "home/me"]) await mkdir(join(base, d), { recursive: true });
    await writeFile(join(base, "app", ".env"), "SECRET=1");
    confine = { roots: [join(base, "app/.data/work/t1/files"), join(base, "app/.data/work/t1")], protected: [join(base, "app")], system: [join(base, "programs")] };
  });

  it("file tools: the task's own folders freely; Aatmiq's data never; elsewhere after asking", () => {
    expect(checkPlace({ name: "read", args: { file_path: "notes.md" } }, confine)).toBeNull();
    expect(checkPlace({ name: "read", args: { file_path: join(base, "app/.data/work/t1/runtime/skills/x/SKILL.md") } }, confine)).toBeNull();
    for (const file_path of [join(base, "app", ".env"), join(base, "app/.data/work/t2/files/quote.html"), join(base, "app/.data/chat/c1/inputs/note.txt")])
      expect(checkPlace({ name: "read", args: { file_path } }, confine), file_path).toMatchObject({ deny: PROTECTED_DENIAL });
    expect(checkPlace({ name: "read", args: { file_path: join(base, "home/me/secret.txt") } }, confine)).toEqual({ ask: expect.stringMatching(/^Reads outside the task's folder: .*secret\.txt$/) });
    expect(checkPlace({ name: "write", args: { file_path: join(base, "home/me/out.txt") } }, confine)).toEqual({ ask: expect.stringMatching(/^Changes outside/) });
    expect(checkPlace({ name: "glob", args: { pattern: `${join(base, "app")}/**/*.md` } }, confine)).toMatchObject({ deny: PROTECTED_DENIAL });
    expect(checkPlace({ name: "glob", args: { pattern: "**/*.py" } }, confine)).toBeNull();
    // A relative path that climbs out of the folder.
    expect(checkPlace({ name: "read", args: { file_path: "../../t2/files/quote.html" } }, confine)).toMatchObject({ deny: PROTECTED_DENIAL });
  });

  it("commands: the paths they name are checked the same way; program folders are fine", () => {
    const q = (p: string) => `"${p}"`;
    expect(checkPlace({ name: "pwsh", args: { command: `Get-ChildItem -Force ${q(join(base, "app/.data/work/t2/files"))}` } }, confine)).toMatchObject({ deny: PROTECTED_DENIAL });
    expect(checkPlace({ name: "bash", args: { command: `cat ${q(join(base, "app", ".env"))}` } }, confine)).toMatchObject({ deny: PROTECTED_DENIAL });
    expect(checkPlace({ name: "bash", args: { command: "cat ../../../.env" } }, confine)).toMatchObject({ deny: PROTECTED_DENIAL });
    expect(checkPlace({ name: "pwsh", args: { command: `pip install x > ${q(join(base, "home/me/pip.txt"))}` } }, confine)).toEqual({ ask: expect.stringMatching(/^Reaches outside the task's folder/) });
    expect(checkPlace({ name: "pwsh", args: { command: `& ${q(join(base, "programs/python/python.exe"))} x.py` } }, confine)).toBeNull();
    for (const command of ['python -c "print(1/2)"', "curl https://example.com/a/b -o out.html", "Get-ChildItem scratch/../out", "ls -la"])
      expect(checkPlace({ name: "bash", args: { command } }, confine), command).toBeNull();
  });

  it("finds quoted, bare and climbing paths in a command", () => {
    expect(commandPaths('Get-Content "E:\\GEM AI\\.env"; type C:\\Users\\me\\a.txt')).toEqual(expect.arrayContaining(["E:\\GEM AI\\.env", "C:\\Users\\me\\a.txt"]));
    expect(commandPaths("cat ../../x/y.txt")).toEqual(["../../x/y.txt"]);
    expect(commandPaths("echo https://x.test/a/b")).toEqual([]);
  });

  it("without a confine (a container, where only its own folder exists) nothing is checked", () => {
    expect(checkPlace({ name: "read", args: { file_path: "/etc/passwd" } }, undefined)).toBeNull();
  });

  it("Super AI checks every call before Claude Code decides: refuses Aatmiq's data, sends risky ones to the person", async () => {
    const hook = preToolUse({ confine }, risky);
    expect(await hook({ tool_name: "Read", tool_input: { file_path: join(base, "app", ".env") } })).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: PROTECTED_DENIAL } });
    expect(await hook({ tool_name: "PowerShell", tool_input: { command: "Remove-Item a.tmp" } })).toMatchObject({ hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "Deletes files" } });
    expect(await hook({ tool_name: "Read", tool_input: { file_path: join(base, "home/me/a.txt") } })).toMatchObject({ hookSpecificOutput: { permissionDecision: "ask" } });
    expect(await hook({ tool_name: "Bash", tool_input: { command: "ls -la" } })).toEqual({});
  });

  it("Agent AI's request to read another folder carries the folder, so Aatmiq's data is refused outright", () => {
    const call = permissionCall({ permission: "external_directory", patterns: [`${join(base, "app")}/*`] }, confine.roots[0]!);
    expect(call.outside).toBe(true);
    expect(checkPlace({ name: call.name, args: call.args }, confine)).toMatchObject({ deny: PROTECTED_DENIAL });
  });
});

describe("what a person approves", () => {
  it("shows the command or file, not a file's whole contents", () => {
    expect(approvalDetail({ command: "pip install pandas-ta", description: "Install" })).toEqual({ command: "pip install pandas-ta", description: "Install" });
    expect(approvalDetail({ file_path: "a.md", content: "x".repeat(10_000) })).toEqual({ file_path: "a.md" });
    expect(approvalDetail({ command: "x".repeat(3000) })!.command).toHaveLength(2001);
    expect(approvalDetail(undefined)).toBeNull();
  });
});

describe("Super AI's shell on Windows", () => {
  it("uses Git Bash where it's installed (PowerShell 5.1 reports working commands as failed)", async () => {
    const d = await mkdtemp(join(tmpdir(), "gitbash-"));
    const bash = join(d, "bash.exe");
    await writeFile(bash, "");
    expect(gitBashEnv({ AATMIQ_GIT_BASH: bash })).toEqual({ CLAUDE_CODE_GIT_BASH_PATH: bash, CLAUDE_CODE_USE_POWERSHELL_TOOL: "0" });
    // Not found: Claude Code keeps its own choice.
    expect(gitBashEnv({ AATMIQ_GIT_BASH: join(d, "missing.exe") })).toEqual({});
  });
});

describe("Agent AI's tools", () => {
  const spec = { productName: "Aatmiq", controlUrl: "http://127.0.0.1:4000/api/internal/work", model: { key: "m", name: "M", contextWindow: 65_536 }, connectors: [] } as unknown as TaskSpec;
  it("has no question dialog (no one sees it in a task) and none of opencode's own web tools", () => {
    const cfg = opencodeConfig(spec, {}) as { tools: Record<string, boolean>; permission: Record<string, string> };
    expect(cfg.tools).toMatchObject({ question: false, webfetch: false, websearch: false, codesearch: false });
    expect(cfg.permission.question).toBe("deny");
  });
  it("is told Aatmiq's tools by the names opencode gives them (a model server that holds calls to a grammar fails on web_search)", () => {
    expect(opencodeNames("Use web_search, then web_fetch; browser_open and documents_search; calculators_run.")).toBe(
      "Use aatmiq_web_search, then aatmiq_web_fetch; aatmiq_browser_open and aatmiq_documents_search; aatmiq_calculators_run.",
    );
    expect(opencodeNames("aatmiq_web_search stays as it is")).toBe("aatmiq_web_search stays as it is");
  });
});
