/** GEM AI Learning: types and queries (apps/api/src/routes/learning.ts). */
import { useQuery } from "@tanstack/react-query";
import type { CourseLevel, VideoRating, VideoReason } from "@aatmiq/shared";
import { get } from "./api";
import { msg } from "@/i18n";

export type CourseStatus = "generating" | "ready" | "failed";
export type LessonStatus = "pending" | "generating" | "ready" | "failed";

export interface CourseSummary {
  id: string;
  title: string;
  topic: string;
  level: CourseLevel;
  tags: string[];
  status: CourseStatus;
  error: string | null;
  lastLesson: number | null;
  lastOpenedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  lessons: number;
  ready: number;
  completed: number;
  bookmarks: number;
}

export interface LessonRow {
  id: string;
  ordinal: number;
  title: string;
  status: LessonStatus;
  version: number;
  summary?: string;
  completedAt: string | null;
  bookmarkedAt: string | null;
}

export interface CourseDetail {
  id: string;
  workspaceId: string;
  title: string;
  topic: string;
  level: CourseLevel;
  description: string | null;
  tags: string[];
  status: CourseStatus;
  error: string | null;
  lastLesson: number | null;
  archivedAt: string | null;
  outline: { prerequisites: string[] } | null;
  modules: { title: string; summary: string; lessons: LessonRow[] }[];
  lessons: LessonRow[];
}

export interface LessonContent {
  title: string;
  objectives: string[];
  prerequisites: string[];
  theory: string;
  explanation: string;
  equations: { name: string; expression: string; latex?: string; symbols: { symbol: string; meaning: string; unit: string }[]; validity: string }[];
  workedExample: { problem: string; given: string[]; steps: string[]; answer: string };
  diagrams: { title: string; description: string; reference: string }[];
  commonMistakes: string[];
  videoQueries: string[];
  references: { title: string; author?: string; kind: string; note?: string }[];
  takeaways: string[];
}

export interface VideoCounts {
  up: number;
  ok: number;
  down: number;
}

export interface LessonVideo {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds?: number | null;
  thumbnail?: string;
  /** Why the picker chose it (absent when videos are in search order). */
  why?: string;
  /** This person's rating, and the organization's counts. */
  myRating: VideoRating | null;
  myReason: VideoReason | null;
  counts: VideoCounts;
}

/** What's happening while a lesson is written (or checked). */
export type LessonStage = "researching" | "writing" | "checking" | "videos";

export type LessonPart = "objectives" | "theory" | "explanation" | "equation" | "workedExample" | "diagram" | "mistake" | "reference" | "takeaway" | "other";

export interface LessonIssue {
  part: LessonPart;
  problem: string;
  fix: string;
  severity: "high" | "medium" | "low";
  /** Numbers of the sources that show it. */
  sources: number[];
  /** Still wrong after the check (a calculation that doesn't come out). */
  open?: boolean;
}

/** How a lesson was researched and checked (apps/api/src/services/learning-check.ts). */
export interface LessonVerification {
  status: "checked" | "corrected" | "not_checked";
  reason?: string | null;
  /** The checking model's name. */
  model: string | null;
  checkedAt: string;
  provider: "searxng" | "ollama" | "brave" | "tavily" | "serper" | null;
  queries?: string[];
  researchNote?: string | null;
  /** Links come from the search provider, never from a model. */
  sources: { n: number; title: string; url: string }[];
  issues: LessonIssue[];
  calc: { label: string; expression: string; claimed: number; computed: number | null; ok: boolean | null }[];
}

export interface LessonDetail {
  id: string;
  ordinal: number;
  version: number;
  current: boolean;
  title: string;
  status: LessonStatus;
  stage: LessonStage | null;
  error: string | null;
  content: LessonContent | null;
  videos: LessonVideo[] | null;
  videosNote: "not_configured" | "quota" | "unavailable" | "blocked" | null;
  verification: LessonVerification | null;
  versions: { version: number; status: LessonStatus; current: boolean; stage: LessonStage | null; createdAt: string }[];
  state: { completedAt: string | null; bookmarkedAt: string | null; note: string | null } | null;
  total: number;
  courseTitle: string;
  /** The organization checks lessons: "Check this lesson" is offered. */
  canCheck: boolean;
}

export function useCourses(workspaceId: string, opts: { q?: string; tag?: string; archived?: boolean } = {}) {
  const params = new URLSearchParams({ workspaceId });
  if (opts.q) params.set("q", opts.q);
  if (opts.tag) params.set("tag", opts.tag);
  if (opts.archived) params.set("archived", "1");
  return useQuery({
    queryKey: ["courses", workspaceId, opts.q ?? "", opts.tag ?? "", !!opts.archived],
    queryFn: () => get<CourseSummary[]>(`/api/learning/courses?${params}`),
    enabled: !!workspaceId,
    // Courses being written are polled until they're ready.
    refetchInterval: (q) => (q.state.data?.some((c) => c.status === "generating") ? 2000 : false),
  });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: ["course", id],
    queryFn: () => get<CourseDetail>(`/api/learning/courses/${id}`),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "generating" || q.state.data.lessons.some((l) => l.status === "generating")) ? 2000 : false),
  });
}

export function useLesson(courseId: string, ordinal: number | null, version?: number | null) {
  return useQuery({
    queryKey: ["lesson", courseId, ordinal, version ?? null],
    queryFn: () => get<LessonDetail>(`/api/learning/courses/${courseId}/lessons/${ordinal}${version ? `?version=${version}` : ""}`),
    enabled: ordinal !== null,
    refetchInterval: (q) => (q.state.data?.status === "generating" || q.state.data?.versions.some((v) => v.status === "generating") ? 2000 : false),
  });
}

export const LEVEL_NAMES = { basic: msg("Basic"), intermediate: msg("Intermediate"), advanced: msg("Advanced") } as const;

export const STAGE_TEXT: Record<LessonStage, string> = {
  researching: msg("Finding sources…"),
  writing: msg("Writing…"),
  checking: msg("Checking…"),
  videos: msg("Finding videos…"),
};

export const PART_NAMES: Record<LessonPart, string> = {
  objectives: msg("Objectives"),
  theory: msg("Theory"),
  explanation: msg("Explanation"),
  equation: msg("Equation"),
  workedExample: msg("Worked example"),
  diagram: msg("Diagram"),
  mistake: msg("Common mistake"),
  reference: msg("Reference"),
  takeaway: msg("Takeaway"),
  other: msg("Other"),
};

export const SEVERITY_NAMES = { high: msg("High"), medium: msg("Medium"), low: msg("Low") } as const;

/** The reasons offered after Not helpful (the API takes a few more). */
export const VIDEO_REASONS: { value: VideoReason; label: string }[] = [
  { value: "off_topic", label: msg("Off topic") },
  { value: "poor_quality", label: msg("Poor quality") },
  { value: "wrong_language", label: msg("Wrong language") },
  { value: "too_long", label: msg("Too long") },
  { value: "other", label: msg("Other") },
];

export const REASON_NAMES: Record<VideoReason, string> = {
  off_topic: msg("Off topic"),
  poor_quality: msg("Poor quality"),
  wrong_language: msg("Wrong language"),
  too_long: msg("Too long"),
  too_short: msg("Too short"),
  broken: msg("Doesn't play"),
  other: msg("Other"),
};

/** The search providers, named as in Admin → Settings. */
export const WEB_PROVIDER_NAMES = { searxng: msg("SearXNG (self-hosted)"), ollama: msg("Ollama web search"), brave: msg("Brave Search"), tavily: msg("Tavily"), serper: msg("Serper") } as const;
