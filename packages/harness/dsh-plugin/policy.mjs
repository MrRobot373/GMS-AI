/**
 * Which tool calls need a person's approval. Shared by the DSH plugin (runtime side) and tests.
 * Plain JavaScript on purpose: it is loaded directly by the harness runtime.
 *
 * Modes: "never" (sandbox only), "risky" (default: destructive, privileged, network, outbound
 * messages and connector tools), "always" (every action that changes something).
 */

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
