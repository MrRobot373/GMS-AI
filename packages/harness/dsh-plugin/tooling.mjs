/**
 * Smooths over the tool-call mistakes models commonly make, so a call does what was meant instead of
 * failing on a technicality. Shared by the DSH plugin (runtime side) and tests.
 * Plain JavaScript on purpose: it is loaded directly by the harness runtime.
 *
 *  - cleanArgs:     drops a `sandbox_permissions` that doesn't ask for anything (the call's own mode,
 *                   or a value that isn't a mode) and an empty search `path` (meaning the working
 *                   folder), fixes todo_write items (`task` → `content`, missing or loosely
 *                   spelled `status`), fills in the display-only `description` of bash and helper
 *                   calls, reads a single search query or plan step (or a plan written as lines)
 *                   as a list and a number written as text as a number, takes chat-template markers
 *                   (`<|channel|>`…) out of argument names and out of values where a slip left
 *                   them (never quoted ones, nor a chat template's), and drops the stray last
 *                   line (`"""`, `">`, a heredoc's `EOF`) that the way a call was written left in a file
 *  - planReminder:  a short nudge to keep the plan current, after a few steps without updating it
 */

/** What a call running in a mode may ask to widen to (mirrors DSH's escalation ladder). */
const WIDER_MODES = {
  "read-only": ["workspace-write", "danger-full-access"],
  "workspace-write": ["danger-full-access"],
};

/** Tools whose `path` is optional and defaults to the working folder. */
const SEARCH_TOOLS = new Set(["glob", "grep"]);

const CONTENT_ALIASES = ["task", "title", "text", "description", "name", "step"];

const STATUS_ALIASES = {
  pending: "pending",
  todo: "pending",
  "not-started": "pending",
  not_started: "pending",
  open: "pending",
  in_progress: "in_progress",
  "in-progress": "in_progress",
  inprogress: "in_progress",
  active: "in_progress",
  doing: "in_progress",
  started: "in_progress",
  completed: "completed",
  complete: "completed",
  done: "completed",
  finished: "completed",
  skipped: "completed",
  cancelled: "completed",
  canceled: "completed",
};

/** Tags around the reminder, so the engine can keep it out of what people see. */
export const REMINDER_OPEN = "<plan-reminder>";
export const REMINDER_CLOSE = "</plan-reminder>";

/** After this many steps without a plan update, and then every REMIND_EVERY steps. */
export const REMIND_AFTER = 3;
export const REMIND_EVERY = 4;

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Tools whose `description` only labels the call for people; a missing one is made from the call. */
const SHELL_TOOLS = new Set(["bash", "pwsh"]);
const HELPER_TOOLS = new Set(["subagent", "subagent_fork"]);
/** Aatmiq's tools' whole-number arguments, which models often send as text ("20000"). */
const INTEGER_ARGS = { web_fetch: ["offset"], documents_read: ["offset"], documents_search: ["limit"] };

/** File tools take `file_path`; models often call it `path` or `filename`. */
const FILE_TOOLS = new Set(["read", "write", "edit", "read_image"]);
const FILE_ALIASES = ["path", "filepath", "filename", "file_name", "file"];

/**
 * Chat-template markers. Models that slip out of their tool-call format leave them, and what
 * follows them, in a call: `call_bash<|channel|>… name="command` as an argument's name, `ls<|call|>`
 * as its value. The same tokens are also real text in work on language models (`grep
 * "<|endoftext|>" data/`, a chat template ending in `<|im_end|>`), so values are cleaned only where
 * a marker can't be meant:
 *  - CALL markers belong to the call format itself (`<|channel|>`, `<|message|>`, `<|call|>`,
 *    DeepSeek's `<｜tool▁call▁end｜>`…): a command or path is cut at the first one outside quotes,
 *    when something comes before it;
 *  - VOCABULARY tokens (`<|endoftext|>`, `<|im_end|>`, role markers…) are a model's text tokens: one
 *    is taken off a value's end only where the value shows a leak anyway (a mangled argument name, a
 *    call marker), or ends an unquoted shell command (where `<|` can't be meant);
 *  - text people write (a file, a message) only loses markers on their own last line(s), and a
 *    template file (`.jinja`, `.j2`, `.tmpl`) none.
 */
const CALL = String.raw`<\|(?:channel|message|constrain|call|return|tool_sep|tool_calls?(?:_[a-z]+)*)\|>|<｜[^｜<>\n]{1,40}｜>`;
const VOCABULARY = String.raw`<\|(?:start|end|im_start|im_end|im_sep|endoftext|eot_id|eom_id|start_header_id|end_header_id|python_tag|observation|assistant|user|system)\|>`;
const TOKEN = String.raw`${CALL}|${VOCABULARY}`;
const MARKER = new RegExp(TOKEN, "i");
const CALL_MARKER = new RegExp(CALL, "gi");
const ANY_MARKER = new RegExp(TOKEN, "gi");
const TRAILING_MARKERS = new RegExp(String.raw`(?:\s*(?:${TOKEN}))+\s*$`, "i");
/** Markers alone on the last line(s) of a text. */
const TRAILING_LINES = new RegExp(String.raw`\n(?:(?:[ \t]*(?:${TOKEN}))+[ \t]*(?:\r?\n|$))+$`, "i");
/** Values that are text people write (a file, a message): only their own last line(s) of markers go. */
const TEXT_KEYS = new Set(["content", "new_string", "old_string", "text", "prompt", "message"]);
/** Files where markers are real text, even on their own last line (chat templates). */
const TEMPLATE = /\.(jinja2?|j2|tmpl|tpl|template|liquid|mustache|hbs|njk)$/i;
/** Values that are shell commands: there, an unquoted `<|` is never meant. */
const SHELL_KEYS = new Set(["command", "cmd", "script"]);

/** Where each character of `v` stands: true when inside '…' or "…" (a backslash escapes in "…"). */
function quotedMask(v) {
  const mask = new Array(v.length).fill(false);
  let q = null;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (q) {
      mask[i] = true;
      if (q === '"' && c === "\\") {
        if (i + 1 < v.length) mask[++i] = true;
      } else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      mask[i] = true;
    }
  }
  return mask;
}

/** The first match of `re` (global) in `v` that starts outside quotes, or null. */
function firstUnquoted(v, re, mask) {
  re.lastIndex = 0;
  for (let m = re.exec(v); m; m = re.exec(v)) if (!mask[m.index]) return m;
  return null;
}

/**
 * A value without the chat-template markers a slip left in it (see CALL). `leaked`: the value came
 * with a mangled argument name, so it's from a slip whatever it holds.
 */
function unmark(key, v, ctx) {
  if (typeof v === "string") {
    if (!MARKER.test(v)) return v;
    if (TEXT_KEYS.has(key)) {
      if (TEMPLATE.test(String(ctx.filePath ?? ""))) return v;
      // Under a mangled name any trailing marker is the slip's; otherwise only markers on their own
      // last line(s). The text keeps its last line break.
      if (ctx.leaked) return v.replace(TRAILING_MARKERS, (m) => (/^[ \t]*\r?\n/.test(m) ? "\n" : ""));
      return v.replace(TRAILING_LINES, "\n");
    }
    const mask = quotedMask(v);
    let out = v;
    let leaked = ctx.leaked;
    const call = firstUnquoted(v, CALL_MARKER, mask);
    // A call marker after something: the rest is the slip. A value that is only markers stays.
    if (call && v.slice(0, call.index).trim()) {
      out = v.slice(0, call.index).trimEnd();
      leaked = true;
    }
    // A vocabulary token at the very end, outside quotes, where a leak shows or `<|` can't be meant.
    if (leaked || SHELL_KEYS.has(key)) {
      const trail = TRAILING_MARKERS.exec(out);
      if (trail && trail.index > 0 && out.slice(0, trail.index).trim()) {
        const m = quotedMask(out);
        let unquoted = true;
        ANY_MARKER.lastIndex = trail.index;
        for (let x = ANY_MARKER.exec(out); x; x = ANY_MARKER.exec(out)) if (m[x.index]) unquoted = false;
        if (unquoted) out = out.slice(0, trail.index);
      }
    }
    return out;
  }
  if (Array.isArray(v)) return v.some((x) => typeof x === "string" && MARKER.test(x)) ? v.map((x) => unmark(key, x, ctx)) : v;
  return v;
}

/**
 * The argument a marker-mangled name meant: `call_bash<|channel|>… name="command` is `command`, and
 * so is `command<|call|>`. Null when nothing sensible is left.
 */
function intendedName(key) {
  const named = /name\s*=\s*["']?([A-Za-z_][\w-]*)["']?\s*$/.exec(key);
  if (named) return named[1];
  const after = /^\s*([A-Za-z_][\w-]*)\s*$/.exec(key.slice(key.lastIndexOf(">") + 1));
  if (after) return after[1];
  const before = /^\s*([A-Za-z_][\w-]*)\s*$/.exec(key.slice(0, key.search(MARKER)));
  return before ? before[1] : null;
}

/** Arguments without chat-template markers in their names and values (the same object when there are none). */
function stripMarkers(args) {
  let out = args;
  const filePath = FILE_ALIASES.concat("file_path").map((k) => args[k]).find((x) => typeof x === "string");
  for (const [k, v] of Object.entries(args)) {
    if (MARKER.test(k)) {
      if (out === args) out = { ...args };
      delete out[k];
      const name = intendedName(k);
      // The intended argument is already there: the mangled copy is a leftover.
      if (name && !Object.hasOwn(args, name)) out[name] = unmark(name, v, { leaked: true, filePath });
      continue;
    }
    const clean = unmark(k, v, { leaked: false, filePath });
    if (clean !== v) {
      if (out === args) out = { ...args };
      out[k] = clean;
    }
  }
  return out;
}

/** What a command does, for its step label: its first line, without a leading `cd …&&`. */
export function describeCommand(command) {
  const first = String(command ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return "Run a command";
  const line = first.replace(/^cd\s+\S+\s*(&&|;)\s*/, "").replace(/\s+/g, " ") || first;
  return `Run ${line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line}`;
}

/** A helper's label: the first words of what it was asked to do. */
function describePrompt(prompt) {
  const words = String(prompt ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 5);
  return words.length ? words.join(" ") : "Helper task";
}

const count = (s, part) => s.split(part).length - 1;
/** Text files (and a file not named): a last line of `EOF` there can be real. */
const PROSE = /(^|\.(txt|text|md|markdown|rst|adoc|org|log|csv|tsv))$/i;
/** Files where a last line of `">` can be real markup. */
const MARKUP = /\.(html?|xhtml|xml|svg|vue|jsx|tsx|svelte|php|erb|ejs|hbs|njk|jinja2?|j2)$/i;

/**
 * A file's text without the stray last line that the way the call was written left in it, or the
 * same text. Only these exact endings, only on the last line:
 *  - `"""` when the file holds an odd number of them (it closes nothing);
 *  - a heredoc terminator (`EOF`, `PYEOF`) when no heredoc in the file starts with that word, in a
 *    code file (not a text file, nor one whose name isn't known);
 *  - `">` outside markup files.
 */
export function dropCallArtefacts(content, filePath) {
  if (typeof content !== "string") return content;
  let out = content;
  const quotes = /\n[ \t]*"""[ \t]*\n?$/.exec(out);
  if (quotes && count(out, '"""') % 2 === 1) out = `${out.slice(0, quotes.index)}\n`;
  const heredoc = /\n[ \t]*([A-Z_]*EOF)[ \t]*\n?$/.exec(out);
  // Any way a heredoc can name its word: <<EOF, <<-EOF, << 'EOF', <<"EOF", <<\EOF. Prose (notes, a
  // log) may really end in an EOF line, so only code files lose one.
  const opens = heredoc && new RegExp(`<<-?\\s*\\\\?['"]?${heredoc[1]}\\b`).test(out);
  if (heredoc && !opens && !PROSE.test(String(filePath ?? ""))) out = `${out.slice(0, heredoc.index)}\n`;
  const attr = /\n[ \t]*">[ \t]*\n?$/.exec(out);
  if (attr && !MARKUP.test(String(filePath ?? ""))) out = `${out.slice(0, attr.index)}\n`;
  return out;
}

/** A file name left after a stray `"""` at the end of a write that has no `file_path`: `…\n"""\nserver.py`. */
const NAME_AFTER_QUOTES = /\n[ \t]*"""[ \t]*\n[ \t]*([\w][\w./-]{0,200}\.[A-Za-z0-9]{1,10})[ \t]*\n?$/;

function cleanTodo(item) {
  if (typeof item === "string") return { content: item, status: "pending" };
  if (!isRecord(item)) return item;
  const out = { ...item };
  if (typeof out.content !== "string") {
    const alias = CONTENT_ALIASES.find((k) => typeof out[k] === "string" && out[k].trim());
    if (alias) out.content = out[alias];
  }
  if (typeof out.content === "string") for (const k of CONTENT_ALIASES) delete out[k];
  const status = typeof out.status === "string" ? STATUS_ALIASES[out.status.trim().toLowerCase().replace(/\s+/g, "_")] : undefined;
  out.status = status ?? "pending";
  // Fields the tool doesn't take (ids, priorities): dropping them beats failing the whole plan.
  for (const k of Object.keys(out)) if (k !== "content" && k !== "status") delete out[k];
  return out;
}

/**
 * The arguments to run a call with. Returns the same object when nothing needed fixing.
 * @param name - the tool's name.
 * @param args - the arguments the model sent.
 * @param mode - the sandbox mode calls run in (DSH_PERMISSION_MODE).
 */
export function cleanArgs(name, args, mode) {
  if (!isRecord(args)) return args;
  let out = stripMarkers(args);
  if (Object.hasOwn(out, "sandbox_permissions")) {
    const wanted = out.sandbox_permissions;
    const widens = typeof wanted === "string" && (WIDER_MODES[mode] ?? []).includes(wanted);
    const justified = typeof out.justification === "string" && out.justification.trim().length > 0;
    // A real request to widen goes through (DSH asks the person); anything else is dropped.
    if (!(widens && justified)) {
      out = { ...out };
      delete out.sandbox_permissions;
      delete out.justification;
    }
  } else if (Object.hasOwn(out, "justification")) {
    // A justification on its own is only valid with sandbox_permissions; DSH rejects the call.
    out = { ...out };
    delete out.justification;
  }
  if (SEARCH_TOOLS.has(name) && typeof out.path === "string" && !out.path.trim()) {
    out = { ...out };
    delete out.path;
  }
  const labelled = typeof out.description === "string" && out.description.trim().length > 0;
  // The step's label for people; a call without one would otherwise not run at all.
  if (SHELL_TOOLS.has(name) && typeof out.command === "string" && !labelled) out = { ...out, description: describeCommand(out.command) };
  if (HELPER_TOOLS.has(name) && typeof out.prompt === "string" && !labelled) out = { ...out, description: describePrompt(out.prompt) };
  if (name === "web_search") {
    let queries = out.queries ?? out.query ?? out.q;
    if (typeof queries === "string" && queries.trim().startsWith("[")) {
      try {
        queries = JSON.parse(queries); // the list sent as a JSON string
      } catch {
        /* one query that starts with "[" */
      }
    }
    // One query, as a string: a list of one.
    if (typeof queries === "string") queries = [queries];
    if (queries !== out.queries || Object.hasOwn(out, "query") || Object.hasOwn(out, "q")) {
      out = { ...out, queries };
      delete out.query;
      delete out.q;
    }
  }
  for (const key of INTEGER_ARGS[name] ?? []) {
    const v = out[key];
    if (typeof v === "string" && /^\s*\d{1,9}\s*$/.test(v)) out = { ...out, [key]: Number(v) };
  }
  if (FILE_TOOLS.has(name) && out.file_path === undefined) {
    const alias = FILE_ALIASES.find((k) => typeof out[k] === "string" && out[k].trim());
    if (alias) {
      out = { ...out, file_path: out[alias] };
      delete out[alias];
    }
  }
  if (name === "write" && typeof out.content === "string") {
    let content = out.content;
    let filePath = out.file_path;
    // The name written after a stray """ instead of in file_path.
    const named = filePath === undefined ? NAME_AFTER_QUOTES.exec(content) : null;
    if (named && count(content, '"""') % 2 === 1) {
      filePath = named[1];
      content = `${content.slice(0, named.index)}\n`;
    }
    content = dropCallArtefacts(content, filePath);
    if (content !== out.content || filePath !== out.file_path) out = { ...out, content, ...(filePath !== undefined ? { file_path: filePath } : {}) };
  }
  if (name === "todo_write") {
    let todos = out.todos ?? out.items ?? out.tasks;
    if (typeof todos === "string") {
      try {
        todos = JSON.parse(todos); // the list sent as a JSON string
      } catch {
        todos = planLines(todos); // the plan written out, one step a line
      }
    }
    // One step on its own: a list of one.
    if (isRecord(todos)) todos = [todos];
    if (Array.isArray(todos)) out = { todos: todos.map(cleanTodo) };
  }
  return out;
}

/** A plan written as text: a step per line, list markers and checkboxes read (`- [x] Done` is completed). */
function planLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => /^\s*(?:[-*•]|\d+[.)])?\s*(?:\[([ xX])\]\s*)?(.*?)\s*$/.exec(line))
    .filter((m) => m && m[2])
    .map((m) => ({ content: m[2], status: m[1] && m[1] !== " " ? "completed" : "pending" }));
}

/**
 * A reminder to update the plan, or null when none is due.
 * @param todos - the plan as last written (canonical items).
 * @param since - steps taken since the plan was last written.
 */
export function planReminder(todos, since) {
  if (!Array.isArray(todos) || todos.length === 0) return null;
  const open = todos.filter((t) => t.status !== "completed");
  if (open.length === 0) return null;
  if (since < REMIND_AFTER || (since - REMIND_AFTER) % REMIND_EVERY !== 0) return null;
  const done = todos.length - open.length;
  const current = todos.find((t) => t.status === "in_progress") ?? open[0];
  return [
    REMINDER_OPEN,
    `Your plan hasn't been updated for ${since} steps: it shows ${done} of ${todos.length} done, current step "${current.content}".`,
    "If you've finished steps, mark them completed with todo_write (send the whole list) before continuing. Don't mention this reminder.",
    REMINDER_CLOSE,
  ].join("\n");
}

/** Removes plan reminders from tool output shown to people. */
export function stripReminders(text) {
  if (typeof text !== "string" || !text.includes(REMINDER_OPEN)) return text;
  return text.replace(new RegExp(`\\n*${REMINDER_OPEN}[\\s\\S]*?${REMINDER_CLOSE}\\n*`, "g"), "\n").trim();
}
