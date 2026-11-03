/**
 * The independent review of a build task (docs/19-work-ai-reliability-plan.md): what the reviewer
 * is told, how its report is checked and merged with the checks code ran, what goes back to the
 * builder, and what is kept when the task ends. The reviewer is a task of its own on a copy of the
 * folder (services/work.ts runs it); it never sees the builder's account of what it did.
 */
import type { WorkVerification } from "@aatmiq/db";
import { z } from "zod";
import { msg } from "../i18n";
import { HYGIENE_ID, HYGIENE_TEXT, type CheckResult } from "./work-checks";
import { ACCEPTANCE_FILE, type Acceptance, type AcceptanceItem } from "./work-spec";

export const REVIEW_FILE = "review.json";
/** The most times a failed review goes back to the builder (the task then ends with what's unmet). */
export const MAX_REVIEW_ROUNDS = 3;
/** A pass needs at least this much written evidence. */
const MIN_EVIDENCE_CHARS = 15;
/** How long the reviewer may take before the task ends unverified. */
export const REVIEW_TIMEOUT_MS = 25 * 60_000;

const reportSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(20),
        status: z.enum(["pass", "fail", "untested"]),
        observed: z.string().trim().max(1500).default(""),
        evidence: z.string().trim().max(3000).default(""),
      }),
    )
    .max(80),
});
export type ReviewReport = z.infer<typeof reportSchema>;

/* ───────────── What the reviewer is told ───────────── */

const judged = (a: Acceptance) => a.items.filter((i) => i.check.kind === "judged");

/**
 * The reviewer's first message. It has the original request and the checklist, the results the
 * code checks already settled (so it doesn't redo them), and how to test and report.
 */
export function reviewerPrompt(request: string, a: Acceptance, det: CheckResult[], hasBrowser: boolean): string {
  const settled = new Map(det.map((r) => [r.id, r]));
  const lines = (items: AcceptanceItem[]) => items.map((i) => `- ${i.id}: ${i.requirement}${i.how ? `\n    How to check: ${i.how}` : ""}`);
  const done = a.items.filter((i) => settled.has(i.id));
  return [
    "You are an independent reviewer. Someone else built the work in this folder (it is a copy: nothing you do here changes the original). You did not build it and you do not fix it: you test it against the request and report what you find. Do not edit or delete the built files; keep any file you need for testing in scratch/.",
    "",
    "THE REQUEST, word for word:",
    "<request>",
    request.length > 12_000 ? `${request.slice(0, 12_000)}\n… (the request goes on; the rest is in ${ACCEPTANCE_FILE}'s items)` : request,
    "</request>",
    "",
    "WHAT TO TEST. Each of these must be true. Test every one yourself:",
    ...lines(judged(a)),
    ...(done.length ? ["", "Already settled by automatic checks (don't test again):", ...done.map((i) => `- ${i.id}: ${settled.get(i.id)!.status} (${settled.get(i.id)!.observed})`)] : []),
    "",
    "HOW:",
    "- Use it the way a person would. Run the program. " + (hasBrowser ? "For a web page or app, open it with browser_open by its path in this folder (like app/index.html), then use browser_type, browser_select, browser_click, browser_press and browser_screenshot; browser_eval reads the page's state. Script errors show in each page view. A hidden file input is listed as a file input: give it a file with browser_upload. Confirmation dialogs are accepted and reported." : "Open files and run what can be run."),
    "- Anything the program produces (an export, a report, a download) has to be opened and read: click the button that makes it, then read the file (downloads are saved in downloads/). Check its format and its values, and that the program can read its own output back in.",
    "- Test the cases the request names and the ones it implies: an empty field, a negative number, a bad row in an import, a reload, a narrow screen. Check order, totals, wording and every number against what the request says.",
    "- Judge by what you see, not by what the code says it does or the README says.",
    "",
    `REPORT: when you have tested every item, write the file ${REVIEW_FILE} in this folder, and then reply with one line saying it's written. It is JSON in exactly this shape:`,
    '{"items": [{"id": "R2", "status": "pass" | "fail" | "untested", "observed": "what you saw, specific enough to fix it from", "evidence": "the command and its output, the file content, or the page text that shows it"}]}',
    `One entry for each of ${judged(a).map((i) => i.id).join(", ")}. A "pass" without evidence you obtained yourself in this session doesn't count. If you could not test an item, say "untested" and why in "observed". Do not write "pass" to be kind: a person will rely on this.`,
  ].join("\n");
}

/* ───────────── Reading its report ───────────── */

/** The reviewer's report, or why it isn't one. */
export function parseReport(text: string): { ok: true; report: ReviewReport } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { ok: false, error: `${REVIEW_FILE} isn't valid JSON` };
  }
  const r = reportSchema.safeParse(raw);
  return r.success ? { ok: true, report: r.data } : { ok: false, error: `${REVIEW_FILE} doesn't have the shape asked for: ${r.error.issues[0]?.message ?? "invalid"}` };
}

export interface Outcome {
  passed: AcceptanceItem[];
  failed: AcceptanceItem[];
  untested: AcceptanceItem[];
  /** The leftovers check, which isn't one of the request's items. */
  hygiene: CheckResult | null;
}

/**
 * Set each item's status from the checks code ran (they win) and the reviewer's report (for the
 * items to be judged), in place. A "pass" with no evidence, or no entry at all, is "not tested",
 * never a pass; a fail from code can't be overturned by the reviewer.
 */
export function mergeResults(a: Acceptance, det: CheckResult[], report: ReviewReport | null): Outcome {
  const byDet = new Map(det.map((r) => [r.id, r]));
  const byReview = new Map((report?.items ?? []).map((r) => [r.id, r]));
  for (const item of a.items) {
    const d = byDet.get(item.id);
    if (d) {
      item.status = d.status;
      item.observed = d.observed;
      continue;
    }
    if (item.check.kind !== "judged") {
      // A check code couldn't run (no browser): left to the reviewer, else not tested.
      const r = byReview.get(item.id);
      item.status = r?.status === "pass" && r.evidence.length >= MIN_EVIDENCE_CHARS ? "pass" : r?.status === "fail" ? "fail" : "unchecked";
      item.observed = r?.observed || "not tested";
      continue;
    }
    const r = byReview.get(item.id);
    if (!r || r.status === "untested") {
      item.status = "unchecked";
      item.observed = r?.observed || "the reviewer didn't test it";
    } else if (r.status === "pass" && r.evidence.length < MIN_EVIDENCE_CHARS) {
      item.status = "unchecked";
      item.observed = "the reviewer said it passed but gave no evidence";
    } else {
      item.status = r.status;
      item.observed = r.status === "pass" ? r.evidence.slice(0, 300) || r.observed : r.observed || r.evidence;
    }
  }
  return {
    passed: a.items.filter((i) => i.status === "pass"),
    failed: a.items.filter((i) => i.status === "fail"),
    untested: a.items.filter((i) => i.status === "unchecked"),
    hygiene: byDet.get(HYGIENE_ID) ?? null,
  };
}

/** Everything is verified: every item passed and nothing is left over. */
export const allGood = (o: Outcome) => o.failed.length === 0 && o.untested.length === 0 && o.hygiene?.status !== "fail";

/* ───────────── What goes back to the builder ───────────── */

/**
 * The message that sends the builder back to what isn't right: each failed item with what was
 * found, what could not be tested, and the leftovers; short, so it fits any window.
 */
export function feedbackText(o: Outcome, round: number, opts: { source?: string; rounds?: number } = {}): string {
  const cut = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").slice(0, n);
  const source = opts.source ?? "The independent review";
  return [
    `${source} (round ${round} of ${opts.rounds ?? MAX_REVIEW_ROUNDS}) found that the work does not yet meet the checklist. Fix each of these, then try it yourself and finish again with a short summary.`,
    ...(o.failed.length ? ["", "Not right:", ...o.failed.map((i) => `- ${i.id} ${i.requirement}\n    found: ${cut(i.observed, 400)}`)] : []),
    ...(o.untested.length ? ["", "Could not be tested (make sure it can be used and shows its result):", ...o.untested.map((i) => `- ${i.id} ${i.requirement}\n    ${cut(i.observed, 200)}`)] : []),
    ...(o.hygiene?.status === "fail" ? ["", `Leftovers to delete: ${cut(o.hygiene.observed, 300).replace(/^leftover files: /, "")}`] : []),
    "",
    `The checklist is in ${ACCEPTANCE_FILE} with each item's state. You cannot edit it.`,
  ].join("\n");
}

/* ───────────── What's kept ───────────── */

/** The result stored on the task, shown beside its answer. */
export function verificationOf(a: Acceptance, o: Outcome, opts: { rounds: number; reviewTaskId: string | null; skipped?: string }): WorkVerification {
  const items: WorkVerification["items"] = a.items.map((i) => ({
    id: i.id,
    requirement: i.requirement,
    status: i.status === "pass" ? "pass" : i.status === "fail" ? "fail" : "untested",
    ...(i.observed ? { observed: i.observed.slice(0, 400) } : {}),
  }));
  if (o.hygiene) items.push({ id: HYGIENE_ID, requirement: HYGIENE_TEXT, status: o.hygiene.status, observed: o.hygiene.observed.slice(0, 300) });
  return {
    rounds: opts.rounds,
    passed: items.filter((i) => i.status === "pass").length,
    total: items.length,
    items,
    reviewTaskId: opts.reviewTaskId,
    ...(opts.skipped ? { skipped: opts.skipped } : {}),
    at: new Date().toISOString(),
  };
}

/** One line for a notification or a list: what was verified and what wasn't. */
export function verificationLine(v: WorkVerification): string {
  const total = v.total;
  const passed = v.passed;
  const skipped = v.skipped ?? "";
  if (v.skipped) return msg(`Not reviewed: ${skipped}`);
  const unmet = v.items.filter((i) => i.status !== "pass").map((i) => i.id).join(", ");
  return unmet === "" ? msg(`All ${total} requirements checked and met`) : msg(`${passed} of ${total} requirements met; not met or not tested: ${unmet}`);
}
