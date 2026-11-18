#!/usr/bin/env node
/**
 * Acceptance check (P0 #3, LRN-30): sample saved lesson videos and confirm each is a real, public YouTube video, checked
 * outside the app with YouTube's oEmbed endpoint (no key needed). Reads courses through the API as a person who owns them.
 *
 *   KNOWLEDGE_EVAL_URL=http://localhost:3000 KNOWLEDGE_EVAL_EMAIL=you@company.com KNOWLEDGE_EVAL_PASSWORD=… \
 *     node scripts/check-lesson-videos.mjs [--sample 20] [--report videos.json]
 *
 * Prints, per sampled video: its ID, title and channel from oEmbed, and whether the lesson's own title shares words with
 * it (a rough relevance hint for a person to confirm, not a verdict). Exit code 1 when any sampled ID isn't a real video,
 * or when fewer than the sample size exist. From a server where YouTube asks for sign-in, lessons say "blocked": set
 * YT_DLP_COOKIES or YT_DLP_PROXY (docs/15-gem-ai.md) and generate the courses again first.
 */
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opts[argv[i].slice(2)] = argv[++i];
const sample = Math.max(1, Number(opts.sample ?? 20));
const base = (process.env.KNOWLEDGE_EVAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = process.env.KNOWLEDGE_EVAL_EMAIL;
const password = process.env.KNOWLEDGE_EVAL_PASSWORD;
if (!email || !password) {
  console.error("Usage: KNOWLEDGE_EVAL_EMAIL=… KNOWLEDGE_EVAL_PASSWORD=… [KNOWLEDGE_EVAL_URL=…] node scripts/check-lesson-videos.mjs [--sample 20] [--report FILE]");
  process.exit(2);
}
const origin = process.env.KNOWLEDGE_EVAL_ORIGIN ?? base;
let cookie = "";
async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { origin, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = [...new Map([...cookie.split("; ").filter(Boolean), ...set.map((c) => c.split(";")[0])].map((c) => [c.split("=")[0], c]))].map(([, c]) => c).join("; ");
  return res;
}
if (!(await call("POST", "/api/auth/sign-in/email", { email, password })).ok) {
  console.error("Sign-in failed. Two-step sign-in isn't supported here: use an account without it.");
  process.exit(2);
}
const me = await (await call("GET", "/api/me")).json();
const found = [];
for (const w of me.workspaces) {
  const courses = await (await call("GET", `/api/learning/courses?workspaceId=${w.id}`)).json().catch(() => []);
  for (const c of Array.isArray(courses) ? courses : []) {
    const detail = await (await call("GET", `/api/learning/courses/${c.id}`)).json();
    for (const l of detail.lessons ?? []) {
      const lesson = await (await call("GET", `/api/learning/courses/${c.id}/lessons/${l.ordinal}`)).json().catch(() => null);
      for (const v of lesson?.videos ?? []) found.push({ course: c.title, lesson: l.title, videoId: v.videoId, title: v.title });
    }
  }
}
// The same video can be in several lessons: sample distinct IDs, spread across the courses.
const distinct = [...new Map(found.map((f) => [f.videoId, f])).values()];
const byCourse = new Map();
for (const f of distinct) byCourse.set(f.course, [...(byCourse.get(f.course) ?? []), f]);
const picked = [];
for (let i = 0; picked.length < Math.min(sample, distinct.length); i++) {
  let any = false;
  for (const list of byCourse.values()) if (list[i] && picked.length < sample) (picked.push(list[i]), (any = true));
  if (!any) break;
}
const words = (s) => new Set(String(s).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
const results = [];
for (const f of picked) {
  let real = false;
  let oembed = null;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${f.videoId}`)}`, { signal: AbortSignal.timeout(15000) });
    real = r.ok;
    if (r.ok) oembed = await r.json();
  } catch (e) {
    oembed = { error: String(e.message ?? e) };
  }
  const shared = oembed?.title ? [...words(f.lesson)].filter((w) => words(oembed.title).has(w) || words(f.course).has(w) && words(oembed.title).has(w)) : [];
  results.push({ ...f, real, oembedTitle: oembed?.title ?? null, channel: oembed?.author_name ?? null, sharedWords: shared });
  console.log(`${real ? "✓" : "✗"} ${f.videoId}  ${oembed?.title ?? oembed?.error ?? "not found"}${oembed?.author_name ? ` — ${oembed.author_name}` : ""}\n    lesson: ${f.course} › ${f.lesson}${shared.length ? `  [shares: ${shared.join(", ")}]` : ""}`);
}
const real = results.filter((r) => r.real).length;
console.log(`\n${found.length} saved videos (${distinct.length} different) in ${byCourse.size} course(s); sampled ${results.length}: ${real} real, ${results.length - real} not.`);
if (results.length < sample) console.log(`Fewer than ${sample} videos exist: generate more courses (a key spreads over 2 days because of quota) and run this again.`);
console.log("Relevance needs a person: read the titles above against their lessons.");
if (opts.report) writeFileSync(opts.report, JSON.stringify({ date: new Date().toISOString(), server: base, saved: found.length, distinct: distinct.length, sampled: results.length, real, results }, null, 2));
process.exit(real === results.length && results.length >= sample ? 0 : 1);
