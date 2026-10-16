/** GEM AI Learning: types and queries (apps/api/src/routes/learning.ts). */
import { useQuery } from "@tanstack/react-query";
import type { CourseLevel } from "@aatmiq/shared";
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

export interface LessonVideo {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds?: number | null;
  thumbnail?: string;
}

export interface LessonDetail {
  id: string;
  ordinal: number;
  version: number;
  current: boolean;
  title: string;
  status: LessonStatus;
  error: string | null;
  content: LessonContent | null;
  videos: LessonVideo[] | null;
  videosNote: "not_configured" | "quota" | "unavailable" | null;
  versions: { version: number; status: LessonStatus; current: boolean; createdAt: string }[];
  state: { completedAt: string | null; bookmarkedAt: string | null; note: string | null } | null;
  total: number;
  courseTitle: string;
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
