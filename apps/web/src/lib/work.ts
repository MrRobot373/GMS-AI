"use client";

import type { Routing } from "@aatmiq/shared";
import { useQuery } from "@tanstack/react-query";
import { msg } from "@/i18n";
import { get } from "./api";

export type TaskStatus = "queued" | "running" | "needs_approval" | "completed" | "failed" | "cancelled";

export interface WorkTaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  result: string | null;
  error: string | null;
  pinned: boolean;
  modelId: string | null;
  /** How Auto picked the task's model. */
  routing?: Routing | null;
  scheduleId: string | null;
  projectId?: string | null;
  projectName?: string | null;
  sharedToProject?: boolean;
  /** A Code task: the Code workspace it works in. */
  codeWorkspaceId?: string | null;
  codeWorkspaceName?: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface WorkEvent {
  seq: number;
  kind: "user" | "assistant" | "tool_call" | "tool_result" | "approval" | "plan" | "status" | string;
  data: Record<string, any>;
  at?: string;
}

export interface WorkTaskDetail {
  task: WorkTaskSummary & { workspaceId: string; sessionId: string | null; projectId: string | null; sharedToProject: boolean };
  events: WorkEvent[];
  live: boolean;
  /** False for a colleague's task shared to a project (read-only). */
  own: boolean;
  ownerName: string | null;
  /** Its project, when the reader can open it. */
  project: { id: string; name: string; color: string; canEdit: boolean } | null;
  /** A Code task's workspace: its files are the Files panel's, read only here. */
  code: { id: string; name: string } | null;
}

export interface PendingApproval {
  id: string;
  taskId: string;
  taskTitle: string;
  toolName: string;
  reason: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkFile {
  path: string;
  size: number;
  modifiedAt: string;
}

export interface WorkInfo {
  webSearch: boolean;
  approvals: "risky" | "always" | "never";
  allowNetwork: boolean;
  maxConcurrentPerUser: number;
}

export interface Skill {
  id: string;
  scope: "org" | "personal";
  ownerId: string | null;
  slug: string;
  name: string;
  description: string;
  body: string;
  enabled: boolean;
  editable: boolean;
  updatedAt: string;
}

export interface Schedule {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  modelId: string | null;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastTaskId: string | null;
  lastStatus: TaskStatus | null;
  projectId: string | null;
  projectName: string | null;
}

export const ACTIVE: TaskStatus[] = ["queued", "running", "needs_approval"];

export function useWorkTasks(workspaceId: string) {
  return useQuery({
    queryKey: ["work-tasks", workspaceId],
    queryFn: () => get<WorkTaskSummary[]>(`/api/work/tasks?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    // Keep statuses fresh while something is running.
    refetchInterval: (q) => (q.state.data?.some((t) => ACTIVE.includes(t.status)) ? 4000 : false),
  });
}

export function usePendingApprovals(workspaceId: string) {
  return useQuery({
    queryKey: ["work-approvals", workspaceId],
    queryFn: () => get<PendingApproval[]>(`/api/work/approvals?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    refetchInterval: 10_000,
  });
}

export function useWorkInfo(workspaceId: string) {
  return useQuery({
    queryKey: ["work-info", workspaceId],
    queryFn: () => get<WorkInfo>(`/api/work/info?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

/** A task-folder path as the person thinks of it: relative to the task (or Code workspace) folder. */
export function shortPath(p: unknown): string | undefined {
  if (typeof p !== "string" || !p) return undefined;
  const m = /\/(?:files|workspaces\/[^/]+)\/(.+)$/.exec(p);
  return m ? m[1] : p;
}

/** One-line description of a tool call, for the timeline. */
/** What a step did: `verb` is an English text to show with t(verb, params). */
export function describeCall(name: string, args: any): { verb: string; target?: string; params?: Record<string, string> } {
  const raw = (args ?? {}) as Record<string, any>;
  const a: Record<string, any> = { ...raw, path: shortPath(raw.path), file_path: shortPath(raw.file_path) };
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  if (mcp) return { verb: msg("Used {tool}"), params: { tool: mcp[1]! }, target: mcp[2]!.replaceAll("_", " ") };
  switch (name) {
    case "bash":
    case "pwsh":
      return { verb: msg("Ran"), target: String(a.command ?? "").split("\n")[0] };
    case "write":
      return { verb: msg("Wrote"), target: a.path ?? a.file_path };
    case "edit":
    case "str_replace_editor":
      return { verb: msg("Edited"), target: a.path ?? a.file_path };
    case "read":
    case "read_image":
      return { verb: msg("Read"), target: a.path ?? a.file_path };
    case "glob":
      return { verb: msg("Looked for files"), target: a.pattern };
    case "grep":
      return { verb: msg("Searched files for"), target: a.pattern };
    case "web_search":
      return { verb: msg("Searched the web"), target: Array.isArray(a.queries) ? a.queries.join(" · ") : a.query };
    case "web_fetch":
      return { verb: msg("Opened"), target: a.url };
    case "browser_open":
      return { verb: msg("Opened in the browser"), target: a.url };
    case "browser_click":
      return { verb: a.confirm_submit ? msg("Submitted a form") : msg("Clicked"), target: `element ${a.element}` };
    case "browser_type":
      return { verb: a.confirm_submit ? msg("Typed and submitted") : msg("Typed"), target: String(a.text ?? "").slice(0, 60) };
    case "browser_select":
      return { verb: msg("Chose"), target: a.option };
    case "browser_back":
      return { verb: msg("Went back a page") };
    case "browser_read":
      return { verb: msg("Read more of the page") };
    case "browser_screenshot":
      return { verb: msg("Took a screenshot") };
    case "skill":
      return { verb: msg("Used skill"), target: a.name ?? a.skill };
    case "todo_write": {
      const todos = (Array.isArray(a.todos) ? a.todos : []) as { content: string; status: string }[];
      if (todos.length && todos.every((t) => t.status === "completed")) return { verb: msg("Finished the plan") };
      const now = todos.find((t) => t.status === "in_progress");
      return { verb: now ? `Plan: ${now.content}` : `Planned ${todos.length} steps` };
    }
    case "subagent":
    case "subagent_fork":
      return { verb: msg("Asked a helper agent"), target: a.description ?? a.task };
    default:
      return { verb: msg("Used {tool}"), params: { tool: name.replaceAll("_", " ") } };
  }
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: msg("Queued"),
  running: msg("Working"),
  needs_approval: msg("Needs approval"),
  completed: msg("Done"),
  failed: msg("Failed"),
  cancelled: msg("Stopped"),
};
