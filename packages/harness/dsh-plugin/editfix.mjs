/**
 * Makes the `edit` tool forgiving, because most of its failures are not the model being wrong about
 * what to change: 183 of 201 failed edits in the recorded tasks were "old_string was not found",
 * the model's copy of the text off by trailing spaces, indentation, a changed line or a line it
 * remembered differently. Each failure costs a step and sends a weaker model into a retry loop.
 *
 *  - repairEdit:    when old_string isn't in the file exactly, find where it is when whitespace is
 *                   ignored (or, for a block of 3+ lines, when its first and last lines match and
 *                   the lines between are close), and give back the file's own text to replace plus
 *                   the new text indented to match. Only when there is exactly one such place.
 *  - nearestRegion: when nothing can be repaired, the lines of the file closest to old_string, with
 *                   line numbers, so the next attempt can copy them.
 *  - editHint:      the sentence to add to a failed edit's result.
 *
 * Plain JavaScript on purpose: it is loaded directly by the harness runtime. Pure: no file access.
 */

const MIN_CHARS = 8;
const BLOCK_SIMILARITY = 0.72;
const NEAREST_MIN = 0.5;

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th")}`;
const lf = (s) => String(s).replace(/\r\n?/g, "\n");
const collapse = (s) => s.trim().replace(/\s+/g, " ");
const trimEnd = (s) => s.replace(/[ \t]+$/, "");
const indentOf = (s) => s.match(/^[ \t]*/)[0];

/** Dice coefficient of character pairs: 1 for the same text, near 0 for unrelated text. */
export function similarity(a, b) {
  a = collapse(a);
  b = collapse(b);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g);
    if (n) {
      shared++;
      grams.set(g, n - 1);
    }
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

/** Start lines where `old` (as lines) matches the file's lines under the comparison `same`. */
function windows(lines, old, same) {
  const out = [];
  for (let i = 0; i + old.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < old.length && ok; j++) ok = same(lines[i + j], old[j]);
    if (ok) out.push(i);
  }
  return out;
}

/**
 * The model's new text, indented the way the file indents the block it replaces. What each indent of
 * the model's block became in the file is learned line by line; an indent the block doesn't have (a
 * deeper line in the new text) follows the same shift (two more columns) or scale (2 spaces to 4).
 */
function reindent(newLines, modelLines, fileLines) {
  const seen = new Map();
  for (let i = 0; i < modelLines.length; i++) {
    if (!modelLines[i].trim()) continue;
    const a = indentOf(modelLines[i]);
    const b = indentOf(fileLines[i]);
    if (seen.has(a) && seen.get(a) !== b) return newLines; // the block isn't indented consistently: leave it
    seen.set(a, b);
  }
  const pairs = [...seen];
  if (pairs.every(([a, b]) => a === b)) return newLines;
  const unit = pairs.map(([, b]) => b).find((b) => b.length)?.[0] ?? " ";
  const d0 = pairs[0][1].length - pairs[0][0].length;
  const shift = pairs.every(([a, b]) => b.length - a.length === d0) ? d0 : null;
  const scaled = pairs.filter(([a]) => a.length);
  const r0 = scaled.length ? scaled[0][1].length / scaled[0][0].length : null;
  const scale = r0 !== null && scaled.every(([a, b]) => b.length / a.length === r0) ? r0 : null;
  const to = (ind) => {
    if (seen.has(ind)) return seen.get(ind);
    if (shift !== null && ind.length + shift >= 0) return unit.repeat(ind.length + shift);
    if (scale !== null) return unit.repeat(Math.round(ind.length * scale));
    return ind;
  };
  return newLines.map((l) => (l.trim() ? to(indentOf(l)) + l.slice(indentOf(l).length) : l));
}

/**
 * @param {string} content  the file's text
 * @param {string} oldString  what the model wants replaced
 * @param {string} newString  what it wants instead
 * @returns {{ oldString: string, newString: string, how: string } | null}
 *   null when old_string is already in the file exactly, or no single place is close enough.
 */
export function repairEdit(content, oldString, newString) {
  const text = lf(content);
  const oldText = lf(oldString);
  if (!oldText.trim() || oldText.replace(/\s/g, "").length < MIN_CHARS || text.includes(oldText)) return null;
  // The blank lines at the edges of the model's block don't have to be matched, nor repeated.
  const edge = (s) => ({ lead: s.match(/^\n*/)[0].length, trail: s.match(/\n*$/)[0].length });
  const eo = edge(oldText);
  const oldLines = oldText.slice(eo.lead, oldText.length - eo.trail).split("\n");
  const en = edge(lf(newString));
  const newBody = lf(newString).slice(Math.min(en.lead, eo.lead), lf(newString).length - Math.min(en.trail, eo.trail));
  const lines = text.split("\n");

  const strategies = [
    ["trailing spaces", (a, b) => trimEnd(a) === trimEnd(b)],
    ["spaces and indentation", (a, b) => collapse(a) === collapse(b)],
  ];
  const pick = (starts, how) => {
    if (starts.length !== 1) return null;
    const at = starts[0];
    const found = lines.slice(at, at + oldLines.length);
    return { oldString: found.join("\n"), newString: reindent(newBody.split("\n"), oldLines, found).join("\n"), how };
  };
  for (const [how, same] of strategies) {
    const hit = pick(windows(lines, oldLines, same), how);
    if (hit) return hit;
  }
  // A longer block whose first and last lines are right and whose middle is close: a line the
  // model remembered a little differently.
  if (oldLines.length >= 3) {
    const first = collapse(oldLines[0]);
    const last = collapse(oldLines[oldLines.length - 1]);
    const starts = [];
    for (let i = 0; i + oldLines.length <= lines.length; i++) {
      if (collapse(lines[i]) !== first || collapse(lines[i + oldLines.length - 1]) !== last) continue;
      let sum = 0;
      for (let j = 1; j < oldLines.length - 1; j++) sum += similarity(lines[i + j], oldLines[j]);
      if (sum / (oldLines.length - 2) >= BLOCK_SIMILARITY) starts.push(i);
    }
    const hit = pick(starts, "a few lines that differ a little");
    if (hit) return hit;
  }
  return null;
}

/** The part of the file that looks most like old_string, with line numbers, or null when none does. */
export function nearestRegion(content, oldString, maxLines = 14) {
  const lines = lf(content).split("\n");
  const old = lf(oldString).split("\n");
  const sig = old.map((l, i) => [collapse(l), i]).filter(([l]) => l.length >= 6).sort((a, b) => b[0].length - a[0].length)[0];
  if (!sig) return null;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const s = similarity(lines[i], sig[0]);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  if (best < 0 || bestScore < NEAREST_MIN) return null;
  const start = Math.max(0, best - sig[1]);
  const end = Math.min(lines.length, start + Math.min(old.length, maxLines));
  return {
    from: start + 1,
    to: end,
    text: lines
      .slice(start, end)
      .map((l, i) => `${start + i + 1}: ${l.length > 220 ? `${l.slice(0, 220)}…` : l}`)
      .join("\n"),
  };
}

/**
 * What to tell the model after an edit failed: where the text really is, or that nothing needs changing.
 * `misses` is how many edits in a row on this file have not matched (this one included): the text the
 * model remembers is stale, so from the second it is told to read the file again.
 */
export function editHint(error, content, oldString, newString, file, misses = 1) {
  const text = lf(content);
  if (/old_string and new_string must differ/.test(error)) {
    return "The edit changes nothing: old_string and new_string are the same text. If the file already has what you want, move on; otherwise say what is different.";
  }
  if (!/old_string was not found/.test(error)) return null;
  if (newString && lf(newString).trim() && text.includes(lf(newString))) {
    return `The file already contains your new_string, so this change may already be made. Read the lines around it before editing again.`;
  }
  const long = lf(oldString).split("\n").length;
  const advice = [
    long > 12 ? `Your old_string is ${long} lines long: a long block almost never matches exactly. Use a few lines that are unique, or, to replace most of the file, write the whole file with the write tool.` : "",
    misses >= 2 ? `This is the ${ordinal(misses)} edit in a row on this file that did not match, so what you remember of it is out of date. Read the file now (the read tool) and base the next edit on what it shows.` : "",
  ].filter(Boolean);
  const near = nearestRegion(text, oldString);
  const head = near
    ? `Your old_string is not in "${file}" as written (spacing, a line or its order differ). The closest text is at lines ${near.from}-${near.to}:\n${near.text}\nCopy old_string from these lines exactly, or use a shorter old_string of one or two lines.`
    : `Your old_string is not in "${file}". Read the file for the current text before editing, and use a short old_string (one or two lines) that you copy from it exactly.`;
  return [head, ...advice].join("\n");
}
