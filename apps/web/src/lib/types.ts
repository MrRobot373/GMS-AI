import type { MemberSection, ModelTier, OrgRole, QuotaResult, Routing, WorkspaceRole } from "@aatmiq/shared";

export interface Me {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    orgRole: OrgRole;
    jobTitle: string | null;
    customInstructions: string | null;
    /** null: the organization's default. */
    locale: "en" | "hi" | null;
    createdAt: string;
    emailVerified: boolean;
    /** The org requires two-step sign-in and it isn't set up yet: only the setup page works. */
    twoFactorSetupRequired: boolean;
    /** Two-step sign-in is required from this date and not set up yet. */
    twoFactorDue?: string | null;
  };
  /** Outgoing email is set up, so confirmation links can be sent. */
  emailEnabled: boolean;
  isAdmin: boolean;
  isWorkspaceAdmin: boolean;
  org: { name: string; productName: string; accentColor: string; promptLogging: boolean; logoUrl: string | null; defaultLocale: "en" | "hi"; illustrations: boolean };
  workspaces: { id: string; name: string; icon: string | null; role: WorkspaceRole; sections: MemberSection[] }[];
  /** Aatmiq Code is shown on this server (CODE_ENABLED=true). Hidden otherwise: no menu, no admin switches. */
  codeEnabled?: boolean;
  /** GEM AI modules the organization has switched on; webSearch: chat offers "Search the web". */
  /** chatSandbox: Chat AI can run Python in the chat's folder, so any file can be attached for it. */
  gem?: { modules: { learning: boolean; calculators: boolean; knowledge: boolean }; betaCalculators: boolean; webSearch?: boolean; chatSandbox?: boolean };
  unreadNotifications: number;
  license?: {
    state: string;
    canUse: boolean;
    tier: string | null;
    sections: string[];
    features: string[] | null;
    message: string | null;
  };
}

export interface PublicStatus {
  setupRequired: boolean;
  licenseRequired?: boolean;
  ssoRequired?: boolean;
  org: { name: string | null; productName: string; accentColor: string; loginMessage: string | null; logoUrl: string | null; defaultLocale: "en" | "hi"; illustrations: boolean };
}

/** A project's own budget and this period's use (GET /api/projects/:id/budget). */
export interface ProjectBudget {
  period: "day" | "week" | "month";
  periodStart: string;
  resetsAt: string;
  tokenLimit: number | null;
  memberTokenLimit: number | null;
  perPerson: number | null;
  used: { chat: number; work: number; other: number; total: number };
  canManage: boolean;
  people: { userId: string; name: string; override: number | null; allowance: number | null; used: { chat: number; work: number; other: number; total: number } }[];
  mine: QuotaStatus | null;
}

export interface QuotaStatus {
  /** Whose budget: the workspace's, or a group's (for a model only that group gives). */
  scope: { kind: "workspace" } | { kind: "group"; id: string; name: string } | { kind: "project"; id: string; name: string };
  period: "day" | "week" | "month";
  periodStart: string;
  resetsAt: string;
  user: { limit: number | null; bonus: number; used: number; isOverride: boolean };
  workspace: { limit: number | null; bonus: number; used: number };
  result: QuotaResult;
}

export interface AvailableModel {
  id: string;
  displayName: string;
  modelKey: string;
  providerName: string;
  providerType: string;
  contextLength: number | null;
  isDefault: boolean;
  /** Groups that give this model when the workspace doesn't; their budget pays for it. */
  groups: { id: string; name: string }[];
  /** Where Auto uses it. */
  tier?: ModelTier | null;
  /** On the Auto entry (id "auto"): the model each tier uses. */
  tiers?: { tier: ModelTier; modelId: string; displayName: string }[];
}

export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  modelId: string | null;
  projectId?: string | null;
  projectName?: string | null;
  sharedToProject?: boolean;
  archivedAt?: string | null;
  updatedAt: string;
}

export interface ChatDetail {
  id: string;
  userId: string;
  modelId: string | null;
  title: string;
  projectId: string | null;
  sharedToProject: boolean;
  archivedAt: string | null;
  temporary: boolean;
  /** Auto picks each answer's model. */
  auto?: boolean;
  leafMessageId: string | null;
  /** A deep research is still running in this chat: its answer arrives when it's done. */
  researching?: boolean;
  /** The last question has no answer and none is coming (the server restarted mid-answer). */
  unanswered?: boolean;
  /** The viewer started this chat (only they rename, move, share or delete it). */
  isOwner?: boolean;
  /** Shared to the project as a group chat: its members can write in it. */
  sharedCanReply?: boolean;
  messages: ChatMessageRow[];
  documents: { id: string; name: string }[];
  readOnly: boolean;
  authorName: string | null;
  project: { id: string; name: string; color: string; canEdit: boolean } | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  color: string;
  description: string | null;
  visibility: "private" | "workspace";
  ownerId: string | null;
  updatedAt: string;
  chatCount: number;
  sourceCount: number;
  memberCount: number;
}

export interface ProjectSource {
  id: string;
  name: string;
  kind: "file" | "note" | "answer";
  status: "processing" | "ready" | "failed";
  error: string | null;
  sizeBytes: number;
  pageCount: number | null;
  label: SourceLabel | null;
  supersededById: string | null;
  projectOnly: boolean;
  addedAt: string;
}

export interface ProjectDetail {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  description: string | null;
  instructions: string | null;
  /** The project's shared folder on the server (tasks work in it by default). */
  workFolder?: string | null;
  visibility: "private" | "workspace";
  ownerId: string | null;
  role: "owner" | "edit" | "chat";
  canEdit: boolean;
  /** An admin who isn't in the project: they manage it but don't see its material (docs/decisions.md, D53). */
  managedOnly?: boolean;
  owner: { id: string; name: string; email: string } | null;
  sources: ProjectSource[];
  /** guest: from another team (a guest of this workspace); teams: the workspaces they belong to. */
  members: { userId: string; name: string; email: string; image: string | null; role: "chat" | "edit"; guest?: boolean; teams?: string[] }[];
  chats: { id: string; title: string; updatedAt: string; userId: string; userName: string; sharedToProject: boolean; pinned: boolean }[];
  /** Work AI tasks in the project: the reader's own and those shared to it. */
  tasks: { id: string; title: string; status: import("./work").TaskStatus; updatedAt: string; userId: string; userName: string; sharedToProject: boolean; scheduleId: string | null }[];
  /** Connectors its Work AI tasks may use; null: all. */
  connectorIds: string[] | null;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface SearchResults {
  chats: { id: string; title: string; projectId: string | null; projectName: string | null; archived: boolean; updatedAt: string; snippet: string | null }[];
  documents: { id: string; name: string; projectId: string | null }[];
  projects: { id: string; name: string; color: string }[];
}

export interface ChatMessageRow {
  id: string;
  /** Who wrote a person's message (a group chat has several people). */
  authorId?: string | null;
  authorName?: string | null;
  parentId?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  attachments?: { id: string; name: string }[] | null;
  citations?: Citation[] | null;
  routing?: Routing | null;
  /** A tested GEM AI calculator ran for this answer (apps/api/src/services/calc-tool.ts). */
  calculation?: import("@/components/chat/calculation-card").ChatCalculation | null;
  /** The answer searched the web (its sources are among the citations). */
  web?: MessageWeb | null;
  /** Tools Chat AI used for this answer, and the files Python made in the chat's folder. */
  steps?: { tool: string; detail: string; outcome?: string; why?: string }[] | null;
  /** The model's thinking before this answer. */
  reasoning?: string | null;
  files?: { path: string; size: number }[] | null;
  createdAt: string;
}

/** Web search for one chat answer (apps/api/src/services/chat-web.ts). */
export interface MessageWeb {
  queries: string[];
  provider: string | null;
  /** Why there are no web sources (a failed search, nothing found, switched off). */
  note: string | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface TokenRequestRow {
  id: string;
  workspaceId: string;
  userId: string;
  amount: number;
  duration: "period" | "permanent";
  reason: string | null;
  status: "pending" | "approved" | "denied";
  decidedAmount: number | null;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  userName: string;
  userEmail: string;
  workspaceName: string;
  quota?: QuotaStatus;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  tokenLimit: number | null;
  defaultModelId: string | null;
  memberCount: number;
  modelCount: number;
  used: number;
  pendingRequests: number;
}

export interface DocumentRow {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  scope: "private" | "workspace";
  status: "processing" | "ready" | "failed";
  error: string | null;
  pageCount: number | null;
  chunkCount: number | null;
  label?: SourceLabel | null;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
}

export interface Citation {
  n: number;
  kind?: "document" | "chat" | "task" | "web";
  documentId: string | null;
  chatId?: string;
  taskId?: string;
  /** A web source's page, as the search provider returned it. */
  url?: string;
  name: string;
  page: number | null;
  snippet: string;
  label?: SourceLabel | null;
}

export type SourceLabel = "confirmed" | "assumption" | "tbd";

/* ───────────── Project brain (docs/21-project-brain.md) ───────────── */

export type BrainMode = "auto" | "review" | "off";
export type BrainKind = "fact" | "decision" | "requirement" | "question" | "person" | "term";
export interface BrainEntryView {
  id: string;
  pageId: string;
  kind: BrainKind;
  text: string;
  status: "active" | "pending" | "replaced" | "rejected";
  conflict: boolean;
  /** The words of the entry this one replaces or contradicts. */
  replaces: string | null;
  sourceKind: "chat" | "task" | "document" | "person";
  sourceId: string | null;
  sourceLabel: string;
  quote: string;
  author: string | null;
  createdAt: string;
}
export interface BrainView {
  mode: BrainMode;
  canEdit: boolean;
  /** Sources that are ready but not read yet. */
  unread: number;
  pages: { id: string; title: string; summary: string; updatedAt: string; entries: BrainEntryView[] }[];
  history: BrainEntryView[];
  counts: { active: number; pending: number };
  log: { id: string; action: string; detail: string; createdAt: string }[];
}
