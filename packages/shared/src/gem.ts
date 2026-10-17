/**
 * GEM AI modules (Learning, Calculators, Knowledge): request validation, and the schemas a
 * model's course and lesson output must pass before anything is stored (docs/15-gem-ai.md).
 */
import { z } from "zod";

export const COURSE_LEVELS = ["basic", "intermediate", "advanced"] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

/**
 * Where lesson videos come from. "auto": the YouTube Data API when a key is set, else yt-dlp (the way
 * Agent-Reach reads YouTube: a search with no key) when it's installed. "off": no videos.
 */
export const VIDEO_SOURCES = ["auto", "ytdlp", "api", "off"] as const;
export type VideoSource = (typeof VIDEO_SOURCES)[number];

export interface GemSettings {
  modules: { learning: boolean; calculators: boolean; knowledge: boolean };
  betaCalculators: boolean;
  coursesPerDay: number;
  lessonsPerDay: number;
  videoSource: VideoSource;
}

export const DEFAULT_GEM_SETTINGS: GemSettings = {
  modules: { learning: true, calculators: true, knowledge: true },
  betaCalculators: true,
  coursesPerDay: 10,
  lessonsPerDay: 60,
  videoSource: "auto",
};

export const gemSettingsSchema = z.object({
  modules: z.object({ learning: z.boolean(), calculators: z.boolean(), knowledge: z.boolean() }).partial().optional(),
  betaCalculators: z.boolean().optional(),
  coursesPerDay: z.number().int().min(0).max(1000).optional(),
  lessonsPerDay: z.number().int().min(0).max(10000).optional(),
  videoSource: z.enum(VIDEO_SOURCES).optional(),
  /** A new YouTube Data API key; "" removes it, absent leaves it. */
  youtubeApiKey: z.string().trim().max(200).optional(),
});

/* ───────────── Learning: requests ───────────── */

const tag = z.string().trim().min(1).max(40);

export const courseCreateSchema = z.object({
  workspaceId: z.string().min(1),
  topic: z.string().trim().min(3, "Describe the topic in a few words").max(400),
  level: z.enum(COURSE_LEVELS),
  tags: z.array(tag).max(12).optional(),
});

export const courseUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  tags: z.array(tag).max(12).optional(),
  archived: z.boolean().optional(),
  lastLesson: z.number().int().min(0).max(1000).optional(),
});

export const lessonStateSchema = z.object({
  completed: z.boolean().optional(),
  bookmarked: z.boolean().optional(),
  note: z.string().max(4000).nullable().optional(),
});

/* ───────────── Learning: what the model must return ───────────── */

/**
 * Web links the model wrote: never trusted, never stored (videos come from the YouTube API). Markdown
 * links keep their text; schemes (http, https, ftp, mailto), protocol-relative //host links, www. and
 * bare domains with a path (ti.com/lit/…) are removed.
 */
const URL_RE = /<?\b(?:(?:https?|ftp):\/\/|mailto:|www\.)[^\s<>]*[^\s<>.,;:!?)]>?|(?<![\w:/])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s)]*|\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\/[^\s)]*/gi;
export const stripUrls = (s: string) =>
  s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(URL_RE, "")
    .replace(/\(\s*(?:see|see also|at|on|via|from)?\s*\)/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const text = (max: number, min = 1) => z.string().transform(stripUrls).pipe(z.string().min(min).max(max));
const list = (item: z.ZodType<string>, min: number, max: number) => z.array(item).min(min).max(max);

export const outlineSchema = z.object({
  title: text(200),
  description: text(1200),
  prerequisites: list(text(300), 0, 12),
  modules: z
    .array(
      z.object({
        title: text(200),
        summary: text(800),
        lessons: z.array(z.object({ title: text(200), summary: text(600) })).min(1).max(8),
      }),
    )
    .min(1)
    .max(10)
    .refine((m) => m.reduce((n, x) => n + x.lessons.length, 0) <= 40, "At most 40 lessons in a course"),
});
export type OutlineOutput = z.infer<typeof outlineSchema>;

export const lessonSchema = z.object({
  title: text(200),
  objectives: list(text(400), 1, 12),
  prerequisites: list(text(400), 0, 12),
  theory: text(20000, 20),
  explanation: text(40000, 40),
  equations: z
    .array(
      z.object({
        name: text(200),
        expression: text(1000),
        latex: z.string().max(2000).optional(),
        symbols: z.array(z.object({ symbol: text(60), meaning: text(300), unit: z.string().max(60).transform(stripUrls) })).max(30),
        // Every formula says when it holds: "ideal buck, continuous-conduction mode", not universal.
        validity: text(600, 8),
      }),
    )
    .max(20),
  workedExample: z.object({
    problem: text(6000, 10),
    given: list(text(600), 0, 30),
    steps: list(text(4000), 1, 40),
    answer: text(3000),
  }),
  diagrams: z.array(z.object({ title: text(200), description: text(2000), reference: text(600) })).max(8),
  commonMistakes: list(text(1000), 1, 15),
  videoQueries: list(text(120), 0, 5),
  references: z
    .array(z.object({ title: text(400), author: z.string().max(300).transform(stripUrls).optional(), kind: text(60), note: z.string().max(600).transform(stripUrls).optional() }))
    .max(12),
  takeaways: list(text(600), 1, 12),
});
export type LessonOutput = z.infer<typeof lessonSchema>;

/**
 * The JSON object in a model's reply: a fenced block or the outermost braces. Returns null when
 * there's no parseable object.
 */
export function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const candidates = [fenced?.[1], reply];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      // Common slips: trailing commas.
      try {
        return JSON.parse(c.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1"));
      } catch {
        /* try the next candidate */
      }
    }
  }
  return null;
}

/** Parse and validate model output; the error says what was wrong (fed back on a retry). */
export function parseModelJson<T extends z.ZodType>(schema: T, reply: string): { ok: true; value: z.infer<T> } | { ok: false; error: string } {
  const json = extractJson(reply);
  if (json === null) return { ok: false, error: "The reply wasn't a JSON object." };
  const r = schema.safeParse(json);
  if (r.success) return { ok: true, value: r.data };
  const issues = r.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return { ok: false, error: issues.join("; ") };
}

/* ───────────── Calculators ───────────── */

const inputValue = z.object({
  value: z.union([z.number(), z.array(z.number()).max(100), z.null()]),
  unit: z.string().max(40).nullable().optional(),
});

export const calculatorRunSchema = z.object({
  calculatorId: z.string().min(1).max(80),
  inputs: z.record(z.string().max(40), inputValue),
  outputUnits: z.record(z.string().max(40), z.string().max(40)).optional(),
  workspaceId: z.string().optional(),
  /** Keep it in history (default yes). */
  save: z.boolean().optional(),
});

/** A keypad calculation or a tool result, re-checked on the server before it's kept. */
export const calculatorHistorySchema = z.object({
  calculatorId: z.string().min(1).max(80),
  workspaceId: z.string().optional(),
  expression: z.string().max(2000).optional(),
  angle: z.enum(["deg", "rad", "grad"]).optional(),
  vars: z.record(z.string().max(20), z.number()).optional(),
  /** For tools: what was entered and what came out (shown again, not recomputed). */
  inputs: z.record(z.string().max(40), z.unknown()).optional(),
  outputs: z.unknown().optional(),
});

/* ───────────── Knowledge ───────────── */

export const knowledgeAskSchema = z.object({
  projectId: z.string().min(1),
  question: z.string().trim().min(3, "Ask a question").max(2000),
  includeGeneral: z.boolean().optional(),
});
