/**
 * Which tool calls need a person's approval. Shared by the DSH plugin (runtime side) and tests.
 * Plain JavaScript on purpose: it is loaded directly by the harness runtime.
 *
 * Modes: "never" (sandbox only), "risky" (default: destructive, privileged, network, outbound
 * messages and connector tools), "always" (every action that changes something).
 */
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

const RISKY_COMMANDS = [
  [/(^|[\s;&|(])(rm|rmdir|shred|unlink)\s/, "Deletes files"],
  [/\bfind\b[^|;]*\s-delete\b/, "Deletes files"],
  [/(^|[\s;&|(])(truncate)\s/, "Empties files"],
  [/(^|[\s;&|(])mv\s/, "Moves or renames files"],
  [/(^|[\s;&|(])(chmod|chown|chgrp)\s/, "Changes file permissions"],
  [/\bgit\s+(push|reset\s+--hard|clean\s+-[a-z]*f|branch\s+-D|tag\s+-d)\b/, "Changes a git repository's history or its remote"],
  [/(^|[\s;&|(])(sudo|su|doas|kill|pkill|killall|shutdown|reboot|mkfs[.\w]*|dd|mount|umount|systemctl|crontab)\b/, "Runs a system-level command"],
  [/(^|[\s;&|(])(sendmail|mail|mailx|mutt)\b/, "Sends an email"],
  // Certificate checks switched off: a download from anywhere could pass for the real site.
  [/--trusted-host\b|--no-check-certificates?\b/, "Turns off certificate checks"],
  [/\bverify\s*=\s*False\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|GIT_SSL_NO_VERIFY\b|\bsslVerify\s*=?\s*false\b|\bstrict-ssl\s*(=\s*)?false\b|PYTHONHTTPSVERIFY\s*=\s*['"]?0/i, "Turns off certificate checks"],
  [/\bPIP_TRUSTED_HOST\s*=|\bglobal\.trusted-host\b|_create_unverified_context\b|\brejectUnauthorized\s*:\s*false\b|--no-verify-ssl\b|\bssl_verify\s*(=\s*|\s+)(false|no|0)\b/i, "Turns off certificate checks"],
  // PowerShell, which Work AI and Agent AI run on Windows: its cmdlets, their usual aliases, and cmd's.
  // The short aliases count only before something path-like (a dot, slash, wildcard, quote, $ or a switch), so Python's
  // `del x` or `move = 3` in a `python -c` doesn't.
  [/\b(Remove-Item|Remove-ItemProperty|Clear-RecycleBin)\b|(^|[\n;&|({]\s*)(ri|del|erase|rd)\s+[^\s=]*[.\\/*"'$-]|\[(System\.)?IO\.(File|Directory)\]::Delete\b/i, "Deletes files"],
  [/\.Delete\(\s*(\$true)?\s*\)/, "Deletes files"],
  [/\b(Clear-Content|Clear-Item)\b/i, "Empties files"],
  [/\b(Move-Item|Rename-Item)\b|(^|[\n;&|({]\s*)(mi|move|rni|ren|rename)\s+[^\s=]*[.\\/*"'$-]|\[(System\.)?IO\.(File|Directory)\]::Move\b/i, "Moves or renames files"],
  [/\b(Set-Acl|Grant-SmbShareAccess|icacls|takeown)\b/i, "Changes file permissions"],
  [/\b(Stop-Process|Stop-Service|Restart-Service|Set-Service|Restart-Computer|Stop-Computer|Set-ExecutionPolicy|Format-Volume|Clear-Disk|Remove-Partition)\b|(^|[\n;&|({]\s*)(spps|taskkill)\s|\breg(\.exe)?\s+(delete|add|import)\b/i, "Runs a system-level command"],
  [/\bSend-MailMessage\b/i, "Sends an email"],
  [/-SkipCertificateCheck\b|ServerCertificateValidationCallback|TrustAllCertsPolicy|CertificatePolicy\s*=/i, "Turns off certificate checks"],
];

/**
 * curl told to skip certificate checks (`-k`, `-sSLk`, `--insecure`) anywhere in the same command,
 * matched on the command with quoted text emptied, so a URL's `&` or `|` (`"…?a=1&b=2" -k`) doesn't
 * end it (and as written, for a curl inside a quoted `bash -c "…"`).
 */
const CURL_INSECURE = /\bcurl\b[^\n;&|]*\s(--insecure\b|-[a-zA-JL-Z]*k[a-zA-JL-Z]*(\s|$))/;
const unquoted = (cmd) => cmd.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');

const NETWORK_COMMANDS = [
  [/(^|[\s;&|(])(curl|wget|ssh|scp|sftp|rsync|nc|ncat|netcat|telnet|ftp|ping)\b/, "Uses the network"],
  [/\b(pip3?|npm|pnpm|yarn|gem|cargo|go)\s+(install|add|i|get|publish)\b/, "Downloads or publishes packages"],
  [/\b(apt|apt-get|apk|yum|dnf|brew)\s+(install|add|update|upgrade)\b/, "Installs system packages"],
  [/\bgit\s+(clone|fetch|pull)\b/, "Downloads from a git server"],
  // PowerShell's own ways to the network and to packages.
  [/\b(Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer|Test-NetConnection|Send-?TcpRequest)\b|(^|[\n;&|({]\s*)(iwr|irm)\s|Net\.WebClient|\.Download(File|String|Data)(Async)?\(|Net\.Http\.HttpClient|Net\.Sockets\.TcpClient/i, "Uses the network"],
  [/\b(Install-Module|Install-Package|Install-Script|Save-Module|Update-Module)\b|\b(winget|choco|scoop)\s+(install|upgrade|update)\b/i, "Downloads or publishes packages"],
];

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0)$/i;

/**
 * A curl or wget that only talks to this computer (a server the agent started to try what it built,
 * like `curl -s http://localhost:8765/`): not "the network", so it isn't held for approval. Anything
 * else in the command that reaches out (another host, ssh, a package install) still counts.
 */
function loopbackOnly(cmd) {
  const tools = [...cmd.matchAll(/(^|[\s;&|(])(curl|wget|ssh|scp|sftp|rsync|nc|ncat|netcat|telnet|ftp|ping)\b/g)].map((m) => m[2]);
  if (!tools.length || tools.some((t) => t !== "curl" && t !== "wget")) return false;
  // Options that send the request elsewhere or read more addresses from a file.
  if (/(^|\s)(--(resolve|connect-to|proxy|preproxy|socks\w*|config|input-file|execute)\b|-[xKie]\b)/.test(cmd)) return false;
  const hosts = [
    ...[...cmd.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/(\[[^\]\s]+\]|[^/\s'":?#]+)/gi)].map((m) => m[1]),
    ...[...cmd.matchAll(/(^|[\s'"=])(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?=[:/\s'"]|$)/gi)].map((m) => m[2]),
  ];
  // Every URL of the command, and a curl/wget without one isn't known to be local.
  const urls = [...cmd.matchAll(/(^|[\s;&|(])(curl|wget)\b([^\n;&|]*)/g)].every((m) => /\b[a-z][a-z0-9+.-]*:\/\/|(^|\s)['"]?(localhost|127(\.\d{1,3}){3}|0\.0\.0\.0)[:/]/i.test(m[3]));
  return urls && hosts.length > 0 && hosts.every((h) => LOOPBACK.test(h));
}

const CHANGING_TOOLS = new Set(["bash", "pwsh", "write", "edit", "str_replace_editor", "run_code", "web_fetch", "documents_save"]);

function globToRegExp(glob) {
  const esc = glob.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${esc}$`, "i");
}

/** What a reviewer is told when a command that would need approval is refused. */
export const reviewDenial = (reason) =>
  `Not allowed in a review (${reason}). A reviewer only tests: use the browser tools, run the program, and read files. Don't install, download, delete, move or change anything outside scratch/; if you can't test something without it, report it as untested.`;

/**
 * @param {{ name: string, args: any }} call
 * @param {{ approvals: "risky"|"always"|"never", askForNetwork: boolean, connectors: { name: string, approveTools: string[] }[] }} policy
 * @returns {string | null} the reason to ask, or null to let it run
 */
export function classifyRisk(call, policy) {
  if (policy.approvals === "never") return null;
  const name = call.name;
  const mcp = /^mcp__([A-Za-z0-9_-]+)__(.+)$/.exec(name);
  if (mcp) {
    const conn = policy.connectors.find((c) => c.name === mcp[1]);
    if (policy.approvals === "always") return `Uses the ${mcp[1]} connector (${mcp[2]})`;
    // "*,!get_*": ask before every tool except those matching a !pattern.
    const globs = conn?.approveTools ?? ["*"];
    const never = globs.filter((g) => g.startsWith("!")).map((g) => g.slice(1));
    const ask = globs.filter((g) => !g.startsWith("!"));
    const asks = ask.some((g) => globToRegExp(g).test(mcp[2])) && !never.some((g) => globToRegExp(g).test(mcp[2]));
    return asks ? `Uses the ${mcp[1]} connector (${mcp[2]})` : null;
  }
  if (name.startsWith("browser_")) {
    // Reading and looking never ask; under "always" anything that acts on a page does; otherwise
    // only submitting a form (which the browser holds until the agent confirms it).
    if (name === "browser_read" || name === "browser_screenshot") return null;
    if (policy.approvals === "always") return "Every action is reviewed in this organization";
    if ((name === "browser_click" || name === "browser_type") && call.args?.confirm_submit === true) return "Submits a form on a website";
    return null;
  }
  if (policy.approvals === "always") return CHANGING_TOOLS.has(name) ? "Every action is reviewed in this organization" : null;
  if (name === "bash" || name === "pwsh") {
    const cmd = String(call.args?.command ?? "");
    for (const [re, reason] of RISKY_COMMANDS) if (re.test(cmd)) return reason;
    // As written too: `bash -c "curl -k …"` is quoted whole.
    if (CURL_INSECURE.test(cmd) || CURL_INSECURE.test(unquoted(cmd))) return "Turns off certificate checks";
    if (policy.askForNetwork)
      for (const [re, reason] of NETWORK_COMMANDS) if (re.test(cmd) && !(reason === "Uses the network" && loopbackOnly(cmd))) return reason;
  }
  return null;
}

/* ───────────── Where a task may go ───────────── */

const IS_WIN = process.platform === "win32";
const SHELLS = new Set(["bash", "pwsh", "powershell", "shell"]);
/** File tools (Work AI's, Claude Code's as Work AI names them, opencode's) and the arguments that name a path. */
const FILE_TOOLS = new Set(["read", "write", "edit", "multiedit", "read_image", "glob", "grep", "list", "ls", "view", "notebook_edit", "patch"]);
const PATH_ARGS = ["file_path", "filePath", "path", "notebook_path", "filename", "directory", "dir", "cwd", "workdir"];

/**
 * A path as the disk knows it: links followed, and on Windows short names (YASHBA~1) made long. A file that isn't
 * there yet is its nearest existing folder's real path plus the rest as written.
 */
const norm = (p) => {
  let dir = resolve(p);
  const tail = [];
  let real = null;
  for (;;) {
    try {
      real = realpathSync.native(dir);
      break;
    } catch {
      const up = dirname(dir);
      if (up === dir) break;
      tail.unshift(basename(dir));
      dir = up;
    }
  }
  const r = join(real ?? dir, ...tail);
  return IS_WIN ? r.toLowerCase() : r;
};
const within = (p, root) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
const rootsCache = new WeakMap();
function prepared(confine) {
  let r = rootsCache.get(confine);
  if (!r) {
    const list = (a) => (a ?? []).filter(Boolean).map(norm);
    r = { own: list(confine.roots), protected: list(confine.protected), system: list(confine.system) };
    rootsCache.set(confine, r);
  }
  return r;
}

/** Where a path is: the task's own ("own"), Aatmiq's own data ("protected"), a system or program folder ("system"), or elsewhere. */
export function placeOf(path, confine) {
  const r = prepared(confine);
  const p = norm(isAbsolute(path) ? path : resolve(confine.roots[0] ?? ".", path));
  if (r.own.some((x) => within(p, x))) return { place: "own", path: p };
  if (r.protected.some((x) => within(p, x))) return { place: "protected", path: p };
  if (r.system.some((x) => within(p, x))) return { place: "system", path: p };
  return { place: "outside", path: p };
}

/** Paths a shell command names: quoted or bare absolute paths (C:\…, \\server\…, /…) and ones that climb out with "..". */
export function commandPaths(cmd) {
  const out = new Set();
  const add = (s) => {
    const t = s.replace(/[)\]}>,;]+$/, "");
    if (t.length > 1) out.add(t);
  };
  for (const m of cmd.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)) {
    const s = (m[1] ?? m[2] ?? "").trim();
    if (/^[A-Za-z]:[\\/]|^\\\\[^\\]/.test(s) || (!IS_WIN && /^\/[\w.-]/.test(s) && existsSync(`/${s.split("/")[1]}`)) || /(^|[\\/])\.\.([\\/]|$)/.test(s)) add(s);
  }
  const bare = cmd.replace(/"[^"\n]*"|'[^'\n]*'/g, " ");
  for (const m of bare.matchAll(/(?:^|[\s=(,;|&>])([A-Za-z]:[\\/][^\s"'`|;&<>]*|\\\\[^\\\s][^\s"'`|;&<>]*)/g)) add(m[1]);
  if (!IS_WIN)
    for (const m of bare.matchAll(/(?:^|[\s=(,;|&>])(\/[\w.-][^\s"'`|;&<>]*)/g)) {
      // Only a path whose first folder exists: "a /b" in a calculation is not a path.
      const first = m[1].split("/")[1];
      if (first && existsSync(`/${first}`)) add(m[1]);
    }
  for (const m of bare.matchAll(/(?:^|[\s=(,;|&>])((?:[\w.-]+[\\/])*\.\.(?:[\\/][^\s"'`|;&<>]*)?)(?=$|[\s"'`|;&<>)])/g)) add(m[1]);
  return [...out];
}

/** The paths a call touches, by tool. */
function pathsOf(call) {
  const name = String(call.name ?? "").toLowerCase();
  const a = call.args && typeof call.args === "object" ? call.args : {};
  if (SHELLS.has(name)) {
    const cmd = String(a.command ?? a.cmd ?? "");
    const dirs = [a.workdir, a.cwd, a.directory].filter((x) => typeof x === "string" && x);
    return [...dirs, ...commandPaths(cmd)];
  }
  if (FILE_TOOLS.has(name)) {
    const ps = PATH_ARGS.map((k) => a[k]).filter((x) => typeof x === "string" && x.trim());
    // A glob or grep pattern that is itself a path ("E:\data\**\*.csv").
    if ((name === "glob" || name === "grep") && typeof a.pattern === "string" && (isAbsolute(a.pattern) || /^\.\.[\\/]/.test(a.pattern))) ps.push(a.pattern);
    if (Array.isArray(a.edits)) for (const e of a.edits) if (typeof e?.file_path === "string") ps.push(e.file_path);
    return ps.map((p) => p.replace(/[*?[{].*$/, "") || ".");
  }
  return [];
}

/** What the agent is told about Aatmiq's own data. */
export const PROTECTED_DENIAL =
  "That is Aatmiq's own data (other tasks, chats, uploads or the server's files). A task can't read or change it, and no one can approve that. Work in your folder; if you need a file from elsewhere, ask the person to add it.";

/**
 * Whether a call stays in the task's folders. `confine`: { roots: [working folder, the task's own folder…],
 * protected: [Aatmiq's data and the server's folder], system: [program and system folders] }.
 * Returns { deny } for Aatmiq's own data (never allowed, whatever the approvals), { ask } for anywhere else
 * outside the task's folders, or null.
 */
export function checkPlace(call, confine) {
  if (!confine?.roots?.length) return null;
  let outside = null;
  for (const p of pathsOf(call)) {
    const where = placeOf(p, confine);
    if (where.place === "protected") return { deny: PROTECTED_DENIAL, path: where.path };
    if (where.place === "outside" && !outside) outside = where.path;
  }
  if (!outside) return null;
  const name = String(call.name).toLowerCase();
  const verb = ["write", "edit", "multiedit", "notebook_edit", "patch"].includes(name) ? "Changes" : SHELLS.has(name) ? "Reaches" : "Reads";
  return { ask: `${verb} outside the task's folder: ${outside.length > 120 ? `…${outside.slice(-117)}` : outside}` };
}
