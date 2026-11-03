/**
 * The acceptance checklist of a build task (docs/19-work-ai-reliability-plan.md): what the request
 * asked for, as items that can each be shown true or false. A model writes it from the request
 * (the Advanced tier) and a second call looks for items it missed or invented; code validates it,
 * numbers the items and keeps it in the task folder as `.task/acceptance.json`. The builder reads
 * it and can't change it: only the checks (work-checks.ts) and the reviewer (work-review.ts) set
 * an item's status.
 */
import { usageEvent, workTask, sql, eq } from "@aatmiq/db";
import { completeChat, type ChatMessage } from "@aatmiq/model-gateway";
import { estimateTokens, parseModelJson } from "@aatmiq/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AppContext } from "../context";
import { chooseModel } from "./router";
import { quotaFor } from "./quota";

export const ACCEPTANCE_FILE = ".task/acceptance.json";
/** A task with more items than this is built milestone by milestone (a fresh builder for each). */
export const MILESTONE_MIN_ITEMS = 9;
const MAX_ITEMS = 40;
const MAX_MILESTONES = 8;
const PLANNER_TIMEOUT_MS = 3 * 60_000;

/** A check code can run itself; anything else is judged by the reviewer. */
export const checkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("judged") }),
  z.object({ kind: z.literal("path_exists"), path: z.string().trim().min(1).max(200) }),
  z.object({ kind: z.literal("file_parses"), path: z.string().trim().min(1).max(200), format: z.enum(["json", "csv", "html", "js"]) }),
  z.object({ kind: z.literal("page_loads_clean"), page: z.string().trim().min(1).max(200) }),
  /** An Excel, PowerPoint, Word or PDF file the request names: audited by the document-checks skill's script. */
  z.object({ kind: z.literal("office_audit"), path: z.string().trim().min(1).max(200), require: z.array(z.string().trim().max(30)).max(12).optional() }),
]);
export type Check = z.infer<typeof checkSchema>;

const draftItemSchema = z.object({
  requirement: z.string().trim().min(3).max(300),
  how: z.string().trim().max(300).optional(),
  milestone: z.number().int().min(1).max(12).optional(),
  check: checkSchema.optional(),
});

const draftSchema = z.object({
  build: z.boolean(),
  milestones: z.array(z.object({ name: z.string().trim().min(1).max(80) })).max(12).default([]),
  items: z.array(draftItemSchema).max(60).default([]),
});
type Draft = z.infer<typeof draftSchema>;

const reviewSchema = z.object({
  /** Requirements the request makes that the draft doesn't have. */
  add: z.array(draftItemSchema).max(20).default([]),
  /** Numbers (1-based) of draft items the request never asked for, or duplicates. */
  remove: z.array(z.number().int().min(1)).max(40).default([]),
});

export type ItemStatus = "unchecked" | "pass" | "fail";
export interface AcceptanceItem {
  id: string;
  requirement: string;
  how?: string;
  milestone: number;
  check: Check;
  status: ItemStatus;
  /** What the check or the reviewer saw (a fail: what was wrong; a pass: what showed it). */
  observed?: string;
}
export interface Acceptance {
  version: 1;
  createdAt: string;
  milestones: { n: number; name: string }[];
  items: AcceptanceItem[];
}

/* ───────────── Is this a build? ───────────── */

const BUILD_VERB = /\b(build|create|make|write|develop|implement|generate|code|design|prototype|set up|put together)\b/i;
/** Office files and PDFs a person asks to be made: a deliverable, checked like a build. */
const FILE_NOUN = /\b(excel|workbook|spreadsheet|xlsx|powerpoint|pptx|slide ?deck|slides|deck|word (?:report|document|doc|file)|docx|pdf (?:report|document|file))\b|\.(?:xlsx|pptx|docx)\b/i;
const FILE_VERB = /\b(build|create|make|write|develop|generate|prepare|produce|put together|draft|compile|need|give me|design)\b/i;
const BUILD_NOUN = /\b(app|application|web ?site|web ?page|page|game|tool|script|program|dashboard|api|cli|extension|bot|calculator|tracker|system|site|plugin|module|library|frontend|backend|server|service|widget|form|portal)\b/i;
/** A long brief is a build whatever it's called, when it asks for one. */
const LONG_BRIEF_CHARS = 1500;

/**
 * Whether a request is worth a checklist: it asks for something to be built (an app, a page, a
 * script, a game…) or for Excel, PowerPoint, Word or PDF files to be made, not a question or a note
 * written in the chat. A cheap check before any model call; the planner says `build: false` for
 * what slips through.
 */
export function isBuildRequest(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  // "How do I make a pivot table in Excel" asks about Excel; "Could you prepare a deck" asks for one.
  const question = /^\s*(how (?:do|does|can|to|should)|what|why|which|when|where|who|is|are|does|do|did)\b/i.test(t);
  if (!question && FILE_VERB.test(t) && FILE_NOUN.test(t)) return true;
  return BUILD_VERB.test(t) && (BUILD_NOUN.test(t) || t.length >= LONG_BRIEF_CHARS);
}

/* ───────────── Validation ───────────── */

/** A path inside the task folder: relative, no `..`. */
export function safeRelPath(p: string): string | null {
  const clean = p.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!clean || clean.startsWith("/") || /^[a-z]:/i.test(clean) || clean.split("/").some((s) => s === ".." || s === "")) return null;
  return clean;
}

/** What a request can ask of a document, as the audit script takes it (notes, toc, pages:6-8, charts:2…). */
const REQUIRE_TOKEN = /^(notes|toc|page_numbers|header_title|(?:pages|slides):\d{1,3}(?:-\d{1,3})?|(?:charts|formulas):\d{1,4})$/;
export const OFFICE_FILE = /\.(xlsx|xlsm|pptx|docx|pdf)$/i;

const checkOf = (c: Check | undefined): Check => {
  if (!c || c.kind === "judged") return { kind: "judged" };
  if (c.kind === "office_audit") {
    const path = safeRelPath(c.path);
    if (!path || !OFFICE_FILE.test(path)) return { kind: "judged" };
    const require = [...new Set((c.require ?? []).map((r) => r.toLowerCase().replace(/\s+/g, "")).filter((r) => REQUIRE_TOKEN.test(r)))];
    return { kind: "office_audit", path, ...(require.length ? { require } : {}) };
  }
  if (c.kind === "page_loads_clean") {
    const page = safeRelPath(c.page);
    return page && /\.html?$/i.test(page) ? { kind: "page_loads_clean", page } : { kind: "judged" };
  }
  const path = safeRelPath(c.path);
  if (!path) return { kind: "judged" };
  return c.kind === "path_exists" ? { kind: "path_exists", path } : { kind: "file_parses", path, format: c.format };
};

/**
 * A checklist from a model's draft: items numbered R1…, checks reduced to what code can run (a path
 * outside the folder or a page that isn't HTML becomes a judged item), milestones kept only for
 * big briefs (a small one is one milestone), each milestone with at least one item.
 */
export function buildAcceptance(draft: Draft, now = new Date()): Acceptance | null {
  const items = mergeFileChecks(draft.items.slice(0, MAX_ITEMS));
  if (!draft.build || items.length < 3) return null;
  const milestoneNames = draft.milestones.slice(0, MAX_MILESTONES).map((m) => m.name);
  const split = items.length >= MILESTONE_MIN_ITEMS && milestoneNames.length >= 2;
  // The model's milestone numbers, kept in range; items without one go with the last stage.
  const raw = items.map((it) => (split ? Math.min(Math.max(it.milestone ?? milestoneNames.length, 1), milestoneNames.length) : 1));
  const used = [...new Set(raw)].sort((a, b) => a - b);
  const renumber = new Map(used.map((n, i) => [n, i + 1]));
  const milestones = split
    ? used.map((n, i) => ({ n: i + 1, name: milestoneNames[n - 1]! }))
    : [{ n: 1, name: "Build" }];
  const built = items.map((it, i) => ({
    id: `R${i + 1}`,
    requirement: it.requirement,
    ...(it.how ? { how: it.how } : {}),
    milestone: split ? renumber.get(raw[i]!)! : 1,
    check: checkOf(it.check),
    status: "unchecked" as const,
  }));
  upgradeOfficeChecks(built);
  return { version: 1, createdAt: now.toISOString(), milestones, items: built };
}

/* ───────────── Excel, PowerPoint, Word and PDF files ───────────── */

/**
 * One item per file: a model often writes the check of a file twice ("the file exists", "the file
 * passes the audit"). The later item only restates the file, so it is dropped and its requirements
 * are kept on the first.
 */
function mergeFileChecks<T extends { check?: Check }>(items: T[]): T[] {
  const first = new Map<string, number>();
  const out: T[] = [];
  for (const it of items) {
    const c = it.check;
    if (c && (c.kind === "office_audit" || c.kind === "path_exists") && OFFICE_FILE.test(c.path)) {
      const key = c.path.toLowerCase();
      const at = first.get(key);
      if (at !== undefined) {
        const keep = out[at]!.check;
        if (keep && keep.kind !== "judged" && c.kind === "office_audit" && c.require?.length) {
          const have = new Set(keep.kind === "office_audit" ? (keep.require ?? []) : []);
          out[at] = { ...out[at]!, check: { kind: "office_audit", path: (keep as { path: string }).path, require: [...have, ...c.require.filter((r) => !have.has(r))] } };
        }
        continue;
      }
      first.set(key, out.length);
    }
    out.push(it);
  }
  return out;
}

type OfficeKind = "xlsx" | "pptx" | "docx" | "pdf";
const officeKind = (p: string): OfficeKind | null => {
  const ext = p.toLowerCase().match(/\.(xlsx|xlsm|pptx|docx|pdf)$/)?.[1];
  return ext === "xlsm" ? "xlsx" : ((ext as OfficeKind | undefined) ?? null);
};
/** What in a requirement says it is about this kind of file. */
const MENTIONS: Record<OfficeKind, RegExp> = {
  xlsx: /\b(excel|workbook|spreadsheet|xlsx|sheets?)\b/i,
  pptx: /\b(powerpoint|pptx|deck|slides?|presentation)\b/i,
  docx: /\b(word|docx|report|document)\b/i,
  pdf: /\bpdf\b/i,
};
const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const asNumber = (s: string) => (/^\d+$/.test(s) ? Number(s) : (WORD_NUMBERS[s.toLowerCase()] ?? null));

/**
 * What the requirements ask of a kind of file, as the audit script takes it: speaker notes, a
 * table of contents, page numbers, a title in the header, a length in slides or pages, a number of
 * charts, formulas. Read from the checklist's own words, so it doesn't depend on the planner having
 * remembered to say so; "about 6-8 pages" allows a page either side.
 */
export function inferRequire(kind: OfficeKind, texts: string[]): string[] {
  const text = texts.join("\n").replace(/[\u2010-\u2015\u2212]/g, "-");
  const out: string[] = [];
  const range = (unit: string) => {
    const m = text.match(new RegExp(`(\\d+)\\s*(?:-|to)\\s*(\\d+)\\s*${unit}`, "i"));
    if (!m) return null;
    const about = /\b(about|around|approximately|roughly|some)\s+$/i.test(text.slice(Math.max(0, m.index! - 14), m.index));
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    return about ? `${Math.max(1, lo - 1)}-${hi + 1}` : `${lo}-${hi}`;
  };
  const charts = () => {
    let best = 0;
    for (const m of text.matchAll(/(?:at least |minimum (?:of )?)?\b(\d+|one|two|three|four|five)\s+(?:real |native |actual |excel |separate )*charts?\b/gi)) best = Math.max(best, asNumber(m[1]!) ?? 0);
    if (!best && /\b(real|native|actual)\b[^.\n]{0,40}\bcharts?\b/i.test(text)) best = 1;
    return best;
  };
  if (kind === "pptx") {
    if (/\b(speaker|presenter) notes?\b/i.test(text)) out.push("notes");
    const s = range("slides");
    if (s) out.push(`slides:${s}`);
    if (charts()) out.push(`charts:${charts()}`);
  } else if (kind === "docx") {
    if (/table of contents|contents page|\btoc\b/i.test(text)) out.push("toc");
    if (/page numbers?/i.test(text)) out.push("page_numbers");
    if (/title in (?:the )?header|header (?:with|showing|shows|containing|has) (?:the )?(?:document |report )?title/i.test(text)) out.push("header_title");
    const p = range("pages");
    if (p) out.push(`pages:${p}`);
  } else if (kind === "xlsx") {
    if (charts()) out.push(`charts:${charts()}`);
    if (/\bformulas?\b/i.test(text) && !/\bno formulas?\b/i.test(text)) out.push("formulas:10");
  } else {
    const p = range("pages");
    if (p) out.push(`pages:${p}`);
  }
  return out;
}

/**
 * A named Excel, PowerPoint, Word or PDF file is audited, not just looked for: the item that says it
 * exists becomes an `office_audit`, with what the checklist asks of that kind of file as its
 * requirements. (The planner is asked to do this itself and often writes a bare path check.)
 */
function upgradeOfficeChecks(items: AcceptanceItem[]): void {
  // A stage that builds exactly one office file is about that file: its items need not name it.
  const filesIn = new Map<number, Set<string>>();
  for (const it of items) {
    if ((it.check.kind === "path_exists" || it.check.kind === "office_audit") && officeKind(it.check.path)) {
      const set = filesIn.get(it.milestone) ?? new Set<string>();
      set.add(it.check.path.toLowerCase());
      filesIn.set(it.milestone, set);
    }
  }
  const done = new Set<string>();
  for (const it of items) {
    const c = it.check;
    if (c.kind !== "path_exists" && c.kind !== "office_audit") continue;
    const kind = officeKind(c.path);
    if (!kind || done.has(c.path.toLowerCase())) continue;
    done.add(c.path.toLowerCase());
    const alone = items.some((x) => x.milestone !== 1) && filesIn.get(it.milestone)?.size === 1;
    const texts = items.filter((x) => x === it || MENTIONS[kind].test(x.requirement) || (alone && x.milestone === it.milestone)).map((x) => `${x.requirement} ${x.how ?? ""}`);
    // The checklist's own wording decides a length ("about 6-8 pages"); other requirements the model named stand.
    const inferred = inferRequire(kind, texts);
    const ranges = new Set(inferred.filter((r) => /^(pages|slides):/.test(r)).map((r) => r.split(":")[0]));
    const given = (c.kind === "office_audit" ? (c.require ?? []) : []).filter((r) => !ranges.has(r.split(":")[0]!));
    const have = new Set(given.map((r) => r.split(":")[0]));
    const require = [...given, ...inferred.filter((r) => !have.has(r.split(":")[0]!))];
    it.check = { kind: "office_audit", path: c.path, ...(require.length ? { require } : {}) };
  }
}

/** The draft with the second call's additions and removals applied. */
export function applyReview(draft: Draft, r: z.infer<typeof reviewSchema>): Draft {
  const drop = new Set(r.remove.map((n) => n - 1));
  return { ...draft, items: [...draft.items.filter((_, i) => !drop.has(i)), ...r.add] };
}

/* ───────────── Files ───────────── */

export async function loadAcceptance(workdir: string): Promise<Acceptance | null> {
  try {
    const a = JSON.parse(await readFile(join(workdir, ACCEPTANCE_FILE), "utf8")) as Acceptance;
    return a?.version === 1 && Array.isArray(a.items) && Array.isArray(a.milestones) ? a : null;
  } catch {
    return null;
  }
}

export async function saveAcceptance(workdir: string, a: Acceptance): Promise<void> {
  await mkdir(join(workdir, ".task"), { recursive: true });
  await writeFile(join(workdir, ACCEPTANCE_FILE), `${JSON.stringify(a, null, 2)}\n`);
}

/* ───────────── What the builder is told ───────────── */

const mark = (s: ItemStatus) => (s === "pass" ? "✓" : s === "fail" ? "✗" : "·");

/**
 * The checklist as the builder reads it: the contract, with each item's state. With milestones, the
 * current stage's items first and in full; the others one line each.
 */
export function checklistText(a: Acceptance, milestone?: number): string[] {
  const lines = (items: AcceptanceItem[]) => items.map((i) => `- ${i.id} ${mark(i.status)} ${i.requirement}${i.status === "fail" && i.observed ? ` (found: ${i.observed.slice(0, 160)})` : ""}`);
  if (milestone === undefined || a.milestones.length < 2) return lines(a.items);
  const now = a.items.filter((i) => i.milestone === milestone);
  const rest = a.items.filter((i) => i.milestone !== milestone);
  return [`This stage, ${milestone} of ${a.milestones.length} (${a.milestones[milestone - 1]?.name ?? ""}):`, ...lines(now), "All the other stages:", ...lines(rest)];
}

/** The standing instruction that goes with the checklist. */
export const CHECKLIST_RULES =
  "This checklist is what the request asked for. Every item must be true when you finish, and an independent reviewer will test each one. You cannot edit it. Build to it; where an item names a file, folder, format or behaviour, do exactly that.";

/** What to add to the first message of a build task. */
export function acceptanceBrief(a: Acceptance, milestone?: number): string {
  return [`Acceptance checklist (also in ${ACCEPTANCE_FILE}):`, CHECKLIST_RULES, ...checklistText(a, milestone)].join("\n");
}

/* ───────────── The model calls ───────────── */

const PLANNER_SYSTEM = [
  "You turn a request to build something into an acceptance checklist: the list a tester will use to decide whether the work is done. Reply with one JSON object only, no other text.",
  "",
  'Shape: {"build": true|false, "milestones": [{"name": "…"}], "items": [{"requirement": "…", "how": "…", "milestone": 1, "check": {"kind": "judged"}}]}',
  "",
  "Rules:",
  '- "build" is false when the request is not asking for something to be built or files to be made (a question, a summary in the chat, research, a short letter). Then "items" is []. It is true for software and for Excel, PowerPoint, Word or PDF files the request asks for.',
  "- One item per requirement, each a single thing that is true or false: a feature, a rule (\"rejects a negative amount with a message on the page\"), a file or folder the request names, a format, a limit it states (\"no libraries\", \"works offline\", \"works on a phone-sized screen\"). Quote the request's own words and numbers. 6 to 30 items; don't invent features the request doesn't ask for.",
  '- "how": how a tester would check it, in one sentence (what to do and what to look at). For anything the program produces (an export, a report), the check is to open that output and read it, and for an import, to read an exported file back in.',
  '- "check": {"kind": "judged"} unless code can decide it for certain from the request alone: {"kind": "path_exists", "path": "expense-tracker/index.html"} when the request names a folder or file; {"kind": "file_parses", "path": "…", "format": "json"|"csv"|"html"|"js"} for a named data or script file; {"kind": "page_loads_clean", "page": "expense-tracker/index.html"} for the main HTML page of something to open in a browser (it loads with no script errors). Paths are relative to the working folder. When unsure of a path, use judged.',
  '- For each Excel, PowerPoint, Word or PDF file the request names or clearly asks for, use {"kind": "office_audit", "path": "Sales.xlsx", "require": ["notes", "toc", "page_numbers", "header_title", "pages:6-8", "slides:10-12", "charts:2", "formulas:10"]} on the item that says the file exists and has what the request asks for: "require" holds only the things the request asks for (notes = speaker notes on every slide; toc = a table of contents; pages:A-B and slides:A-B the length asked; charts:N the number of charts; formulas:N formulas rather than typed values). The audit also opens the file and finds formulas that fail, charts over tables, empty pages and leftovers, so do NOT add a separate "the file exists" item for it. Then one judged item per thing the request wants IN each file (the sheets and what they hold, each slide topic, each report section), and one judged item that the numbers agree across the files when there are several.',
  "- Every item is a property of the finished work. Never write an item about checking, testing, verifying or summarizing the work (\"after building, open each file\", \"list what was verified\"): the system verifies. And no build stage for verification, consistency checks or a final summary: stages are for building.",
  "- With several files, one stage per file, in the order they depend on each other (the workbook that holds the data before the deck and the report that quote it).",
  "- If the request names a folder, put an item for it. If it asks for a README or notes file, put an item for it.",
  `- "milestones": when there are ${MILESTONE_MIN_ITEMS} or more items, group them into 3 to ${MAX_MILESTONES} build stages in the order they should be built (data and core first, then features, then screens, then documentation), each with at least one item, and give each item its stage number in "milestone". With fewer items, "milestones" is [] and no item has "milestone".`,
].join("\n");

const REVIEW_SYSTEM = [
  "You check an acceptance checklist against the request it came from. Reply with one JSON object only, no other text.",
  "",
  'Shape: {"add": [{"requirement": "…", "how": "…", "milestone": 1, "check": {"kind": "judged"}}], "remove": [3, 7]}',
  "",
  '- "add": things the request clearly requires that no item covers (check every sentence of the request, every named file, folder, format, limit and behaviour).',
  '- "remove": numbers of items the request never asked for, or that repeat another item.',
  "- Change nothing that is right. If the checklist is complete and correct, reply {\"add\": [], \"remove\": []}.",
].join("\n");

/**
 * One validated JSON call on the Advanced tier for a task, metered under "work" against the person
 * and added to the task's tokens. One chance to fix a reply in the wrong shape. Null when no model
 * is available, the allowance is used up, or the replies don't fit (the task goes on unchecked).
 */
async function planCall<T extends z.ZodType>(
  ctx: AppContext,
  o: { taskId: string; workspaceId: string; userId: string; system: string; user: string; schema: T; maxTokens: number; log?: (msg: string, e?: unknown) => void },
): Promise<{ value: z.infer<T>; modelId: string } | null> {
  const { db } = ctx;
  let chosen: Awaited<ReturnType<typeof chooseModel>>;
  try {
    chosen = await chooseModel(db, ctx.box, { workspaceId: o.workspaceId, section: "work", userId: o.userId, requested: null, text: o.user, contextTokens: 1500, difficulty: "hard" });
  } catch (e) {
    o.log?.("work: the checklist planner found no model", e);
    return null;
  }
  const { status: quota, groupId } = await quotaFor(db, o.workspaceId, o.userId, chosen.model);
  if (!quota.result.allowed) {
    o.log?.("work: the checklist planner is over the allowance");
    return null;
  }
  const messages: ChatMessage[] = [
    { role: "system", content: o.system },
    { role: "user", content: o.user },
  ];
  // Two chances for a reply in the right shape, and one more for a provider that hiccuped (a task
  // that went on unchecked because of one dropped request would be a quiet loss of the whole review).
  let hiccups = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = Date.now();
    let r: Awaited<ReturnType<typeof completeChat>>;
    try {
      r = await completeChat(chosen.provider, chosen.model.modelKey, messages, { maxTokens: o.maxTokens, temperature: 0.2, thinking: chosen.thinking, signal: AbortSignal.timeout(PLANNER_TIMEOUT_MS) });
    } catch (e) {
      o.log?.(`work: the checklist planner's model call failed (${hiccups === 0 ? "trying again" : "giving up"})`, e);
      if (hiccups++ === 0) {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        continue;
      }
      return null;
    }
    const parsed = parseModelJson(o.schema, r.text);
    await db.insert(usageEvent).values({
      workspaceId: o.workspaceId,
      userId: o.userId,
      modelId: chosen.model.id,
      groupId,
      section: "work",
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      estimated: r.usage.estimated,
      latencyMs: Date.now() - started,
      status: parsed.ok ? "ok" : "error",
    });
    await db
      .update(workTask)
      .set({ inputTokens: sql`${workTask.inputTokens} + ${r.usage.inputTokens}`, outputTokens: sql`${workTask.outputTokens} + ${r.usage.outputTokens}` })
      .where(eq(workTask.id, o.taskId));
    if (parsed.ok) return { value: parsed.value as z.infer<T>, modelId: chosen.model.id };
    messages.push({ role: "assistant", content: r.text.slice(0, 20_000) }, { role: "user", content: `That reply didn't match the required JSON shape: ${parsed.error}. Reply again with only the corrected JSON object.` });
  }
  return null;
}

/**
 * The checklist for a request, or null when it isn't a build (or no model could write one): a
 * planner call, then a call that looks for what it missed or invented. Both on the Advanced tier.
 */
export async function planAcceptance(ctx: AppContext, o: { taskId: string; workspaceId: string; userId: string; request: string; log?: (msg: string, e?: unknown) => void }): Promise<Acceptance | null> {
  const request = o.request.length > 24_000 ? `${o.request.slice(0, 24_000)}\n… (the request goes on)` : o.request;
  const first = await planCall(ctx, { ...o, system: PLANNER_SYSTEM, user: `The request:\n\n${request}`, schema: draftSchema, maxTokens: 4000 });
  if (!first || !first.value.build || first.value.items.length < 3) return null;
  let draft = first.value;
  const numbered = draft.items.map((it, i) => `${i + 1}. ${it.requirement}`).join("\n");
  const second = await planCall(ctx, { ...o, system: REVIEW_SYSTEM, user: `The request:\n\n${request}\n\nThe checklist:\n\n${numbered}`, schema: reviewSchema, maxTokens: 2500 });
  if (second) draft = applyReview(draft, second.value);
  return buildAcceptance(draft);
}

/** Tokens a checklist adds to a prompt, for sizing. */
export const checklistTokens = (a: Acceptance) => estimateTokens(checklistText(a).join("\n"));
