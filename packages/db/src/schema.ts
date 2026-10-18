/**
 * Aatmiq database schema (P0). See docs/01-foundation.md §12.
 * One organization per install; content is scoped to workspaces.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member"]);
export const userStatusEnum = pgEnum("user_status", ["active", "deactivated"]);
export const workspaceRoleEnum = pgEnum("workspace_role", ["admin", "member"]);
export const providerTypeEnum = pgEnum("provider_type", ["ollama", "openai_compatible", "mock"]);
export const budgetPeriodEnum = pgEnum("budget_period", ["day", "week", "month"]);
export const sectionEnum = pgEnum("section", ["chat", "work", "code", "system", "api", "learning", "knowledge"]);
export const requestStatusEnum = pgEnum("token_request_status", ["pending", "approved", "denied"]);
export const messageRoleEnum = pgEnum("message_role", ["system", "user", "assistant"]);
export const modelKindEnum = pgEnum("model_kind", ["chat", "embedding"]);
export const documentScopeEnum = pgEnum("document_scope", ["private", "workspace"]);
export const documentStatusEnum = pgEnum("document_status", ["processing", "ready", "failed"]);
export const documentKindEnum = pgEnum("document_kind", ["file", "note", "answer"]);
export const projectVisibilityEnum = pgEnum("project_visibility", ["private", "workspace"]);
export const projectRoleEnum = pgEnum("project_role", ["chat", "edit"]);
/** How far a source can be trusted: the model is told, and answers say so. */
export const sourceLabelEnum = pgEnum("source_label", ["confirmed", "assumption", "tbd"]);
export const ssoTypeEnum = pgEnum("sso_type", ["google", "microsoft", "oidc", "saml"]);
export const workTaskStatusEnum = pgEnum("work_task_status", ["queued", "running", "needs_approval", "completed", "failed", "cancelled"]);
export const workApprovalStatusEnum = pgEnum("work_approval_status", ["pending", "approved", "rejected", "expired"]);
export const skillScopeEnum = pgEnum("skill_scope", ["org", "personal"]);

/** pgvector column without fixed dimensions (models differ: 384, 768, 1024…). */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector",
  toDriver: (v) => `[${v.join(",")}]`,
  fromDriver: (v) => (typeof v === "string" ? JSON.parse(v) : v),
});
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/* ───────────── Organization (singleton per install) ───────────── */

export const organization = pgTable("organization", {
  id: id(),
  name: text("name").notNull(),
  productName: text("product_name"),
  accentColor: text("accent_color"),
  loginMessage: text("login_message"),
  budgetPeriod: budgetPeriodEnum("budget_period").notNull().default("month"),
  promptLogging: boolean("prompt_logging").notNull().default(false),
  /** Interface language for people who haven't picked one. */
  defaultLocale: text("default_locale").notNull().default("en"),
  retentionDays: integer("retention_days"),
  /** Pictures on the sign-in pages, empty states and error pages; off for a plainer look. */
  illustrations: boolean("illustrations").notNull().default(true),
  licenseKey: text("license_key"),
  /** When on, only the owner may still sign in with a password (break-glass); everyone else uses SSO. */
  ssoRequired: boolean("sso_required").notNull().default(false),
  /** When on, everyone who signs in with a password must set up two-step sign-in before using the app. */
  twoFactorRequired: boolean("two_factor_required").notNull().default(false),
  /** With twoFactorRequired: from when (until then people without it get reminders, not the lock). */
  twoFactorDeadline: timestamp("two_factor_deadline", { withTimezone: true }),
  /** Work AI policy set by org admins (see WorkSettings). */
  workSettings: jsonb("work_settings").$type<Partial<WorkSettings>>(),
  /** Uploaded logo (storage key, media type, version for cache busting); null shows the product mark. */
  logo: jsonb("logo").$type<{ key: string; type: string; version: string }>(),
  /** Outgoing email (SMTP) for invitations and password resets; the password is encrypted. */
  emailSettings: jsonb("email_settings").$type<EmailSettingsStored>(),
  /** Auto model choice (see RoutingSettings). */
  routingSettings: jsonb("routing_settings").$type<Partial<RoutingSettings>>(),
  /** SCIM provisioning from the identity provider (the token is stored hashed). */
  scimSettings: jsonb("scim_settings").$type<ScimSettingsStored>(),
  /** LDAP / Active Directory sync (the bind password is encrypted). */
  ldapSettings: jsonb("ldap_settings").$type<LdapSettingsStored>(),
  /** Aatmiq's own SAML signing key and certificate, for single logout (made when first needed). */
  samlSigning: jsonb("saml_signing").$type<{ keyEnc: string; cert: string }>(),
  /** GEM AI modules (Learning, Calculators, Knowledge): which are on, and their settings. */
  gemSettings: jsonb("gem_settings").$type<Partial<GemSettingsStored>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────── Auth (Better Auth core tables) ───────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  orgRole: orgRoleEnum("org_role").notNull().default("member"),
  status: userStatusEnum("status").notNull().default("active"),
  jobTitle: text("job_title"),
  customInstructions: text("custom_instructions"),
  /** Interface language ("en", "hi"); null: the organization's default. */
  locale: text("locale"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  /** Two-step sign-in with an authenticator app (Better Auth two-factor plugin). */
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  /** Who keeps this account up to date: "scim" or "ldap" (null: Aatmiq). */
  directory: text("directory"),
  /** The directory's id for this person (SCIM externalId or id; LDAP entryUUID / objectGUID). */
  externalId: text("external_id"),
  /** Deactivated because the directory said so (the directory may reactivate; an admin's choice it won't). */
  directoryDisabled: boolean("directory_disabled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("user_directory_external_idx").on(t.directory, t.externalId)]);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

/** Authenticator-app secrets and backup codes, both encrypted by Better Auth. */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────── Invitations ───────────── */

export const invitation = pgTable("invitation", {
  id: id(),
  email: text("email").notNull(),
  orgRole: orgRoleEnum("org_role").notNull().default("member"),
  workspaces: jsonb("workspaces").$type<{ workspaceId: string; role: "admin" | "member" }[]>().notNull().default([]),
  tokenHash: text("token_hash").notNull().unique(),
  /** The link was emailed to this address, so accepting it confirms the address. */
  emailed: boolean("emailed").notNull().default(false),
  invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/* ───────────── Workspaces ───────────── */

export const workspace = pgTable("workspace", {
  id: id(),
  name: text("name").notNull(),
  icon: text("icon"),
  description: text("description"),
  tokenLimit: bigint("token_limit", { mode: "number" }),
  defaultModelId: text("default_model_id"),
  /** Model used to embed documents for meaning-based search; null = keyword search only. */
  embeddingModelId: text("embedding_model_id"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull().default("member"),
    sections: text("sections").array().notNull().default(sql`ARRAY['chat']::text[]`),
    /** Manual per-user override. null = default split of workspace budget (D19). */
    tokenLimit: bigint("token_limit", { mode: "number" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("wm_user_idx").on(t.userId)],
);

/* ───────────── Models ───────────── */

export const modelProvider = pgTable("model_provider", {
  id: id(),
  name: text("name").notNull(),
  type: providerTypeEnum("type").notNull(),
  baseUrl: text("base_url"),
  apiKeyEnc: text("api_key_enc"),
  health: jsonb("health").$type<{ ok: boolean; latencyMs?: number; error?: string; checkedAt: string }>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const model = pgTable(
  "model",
  {
    id: id(),
    providerId: text("provider_id")
      .notNull()
      .references(() => modelProvider.id, { onDelete: "cascade" }),
    modelKey: text("model_key").notNull(),
    displayName: text("display_name").notNull(),
    kind: modelKindEnum("kind").notNull().default("chat"),
    contextLength: integer("context_length"),
    /** Accepts images as input (the agent can look at pictures and screenshots). */
    vision: boolean("vision").notNull().default(false),
    sections: text("sections").array().notNull().default(sql`ARRAY['chat','work','code']::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    costInPerM: real("cost_in_per_m"),
    costOutPerM: real("cost_out_per_m"),
    /**
     * Embedding models trained with task prefixes (EmbeddingGemma): put before search queries, and
     * before document passages ({title} is the document's name, or "none").
     */
    queryPrefix: text("query_prefix"),
    documentPrefix: text("document_prefix"),
    /** Where Auto uses this model: "fast", "standard" or "advanced" (null: Auto leaves it out). */
    tier: text("tier"),
    /**
     * The model can turn thinking on and off per request (Qwen3, Nemotron 3, Gemma 4 on vLLM or
     * Ollama). Off for everyday answers; Auto turns it on for hard ones.
     */
    thinkingSwitch: boolean("thinking_switch").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("model_provider_key_idx").on(t.providerId, t.modelKey)],
);

export const workspaceModel = pgTable(
  "workspace_model",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => model.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.modelId] })],
);

/* ───────────── Groups (across workspaces) ───────────── */

/**
 * A group gives its members models and a token budget in every workspace they belong to. Calls to
 * a model the workspace already offers are paid by the workspace; calls to a model only a group
 * gives are paid from that group's budget (usage_event.group_id).
 */
export const userGroup = pgTable("user_group", {
  id: id(),
  name: text("name").notNull().unique(),
  description: text("description"),
  /** Tokens per budget period for the whole group; null = no limit. */
  tokenLimit: bigint("token_limit", { mode: "number" }),
  /** Tokens per person per period; null = the group budget split evenly among members. */
  memberTokenLimit: bigint("member_token_limit", { mode: "number" }),
  /** Kept in step with a directory group ("scim" or "ldap"): its members come from there. */
  directory: text("directory"),
  externalId: text("external_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("user_group_directory_external_idx").on(t.directory, t.externalId)]);

export const userGroupMember = pgTable(
  "user_group_member",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => userGroup.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("ugm_user_idx").on(t.userId)],
);

export const userGroupModel = pgTable(
  "user_group_model",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => userGroup.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => model.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.modelId] })],
);

/* ───────────── Usage, budgets, requests ───────────── */

export const usageEvent = pgTable(
  "usage_event",
  {
    id: id(),
    workspaceId: text("workspace_id").references(() => workspace.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    modelId: text("model_id").references(() => model.id, { onDelete: "set null" }),
    /**
     * Set when a group paid for the call (a model only the group gives); the workspace's budget is
     * untouched. No foreign key: after a group is deleted its past usage still isn't the workspace's.
     */
    groupId: text("group_id"),
    section: sectionEnum("section").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimated: boolean("estimated").notNull().default(false),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull().default("ok"),
    createdAt: createdAt(),
  },
  (t) => [
    index("usage_ws_time_idx").on(t.workspaceId, t.createdAt),
    index("usage_user_time_idx").on(t.userId, t.createdAt),
    index("usage_group_time_idx").on(t.groupId, t.createdAt),
  ],
);

export const tokenRequest = pgTable(
  "token_request",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    duration: text("duration").$type<"period" | "permanent">().notNull().default("period"),
    reason: text("reason"),
    status: requestStatusEnum("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAmount: bigint("decided_amount", { mode: "number" }),
    note: text("note"),
    /** For "period" approvals: the bonus only counts inside this period. */
    periodStart: timestamp("period_start", { withTimezone: true }),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("tr_ws_status_idx").on(t.workspaceId, t.status)],
);

/* ───────────── Chat ───────────── */

export const chat = pgTable(
  "chat",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    modelId: text("model_id").references(() => model.id, { onDelete: "set null" }),
    /** The person chose Auto: each answer's model is picked for its message (modelId: the last one). */
    auto: boolean("auto").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    /** Chats inside a project inherit its instructions, sources and project-only memory. */
    projectId: text("project_id").references((): AnyPgColumn => project.id, { onDelete: "cascade" }),
    /** Visible (read-only) to other project members when true. Private to its owner otherwise. */
    sharedToProject: boolean("shared_to_project").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Temporary chats never appear in lists, search or memory, and are deleted after a day. */
    temporary: boolean("temporary").notNull().default(false),
    /** Last message of the branch being shown. Editing a message starts a new branch. */
    leafMessageId: text("leaf_message_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("chat_ws_user_idx").on(t.workspaceId, t.userId, t.updatedAt),
    index("chat_project_idx").on(t.projectId, t.updatedAt),
    index("chat_title_fts_idx").using("gin", sql`to_tsvector('simple', ${t.title})`),
  ],
);

export const message = pgTable(
  "message",
  {
    id: id(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    /** Previous message in this branch (null for the first). Siblings share a parent. */
    parentId: text("parent_id").references((): AnyPgColumn => message.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    modelId: text("model_id").references(() => model.id, { onDelete: "set null" }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    error: text("error"),
    /** Documents attached with this user message. */
    attachments: jsonb("attachments").$type<{ id: string; name: string }[]>(),
    /** Sources used for this assistant reply, numbered as cited in the text. */
    citations: jsonb("citations").$type<Citation[]>(),
    /** How Auto picked this answer's model, when it did. */
    routing: jsonb("routing").$type<Routing>(),
    /** A tested GEM AI calculator ran for this answer: its inputs and results (the model only explained them). */
    calculation: jsonb("calculation").$type<Record<string, unknown>>(),
    /** The person switched on web search for this answer: what was searched, and why it failed if it did. */
    web: jsonb("web").$type<MessageWeb>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("message_chat_idx").on(t.chatId, t.createdAt),
    index("message_parent_idx").on(t.parentId),
    index("message_fts_idx").using("gin", sql`to_tsvector('simple', ${t.content})`),
  ],
);

/* ───────────── Single sign-on ───────────── */

export const ssoConnection = pgTable("sso_connection", {
  id: id(),
  type: ssoTypeEnum("type").notNull(),
  /** Button label, e.g. "Google" or "Okta". */
  name: text("name").notNull(),
  /** OpenID issuer URL (derived for Google and Microsoft); for SAML, the identity provider's entity ID. */
  issuer: text("issuer").notNull(),
  /** Microsoft Entra directory (tenant) id. */
  tenantId: text("tenant_id"),
  /** OpenID only. */
  clientId: text("client_id"),
  clientSecretEnc: text("client_secret_enc"),
  /** SAML only: where people are sent to sign in (HTTP-Redirect binding). */
  samlSsoUrl: text("saml_sso_url"),
  /** SAML only: the identity provider's signing certificates (PEM; several while it rotates them). */
  samlCerts: text("saml_certs").array(),
  /** SAML only: where signing out is passed on to the identity provider (single logout, HTTP-Redirect). */
  samlSloUrl: text("saml_slo_url"),
  /** Allowed email domains. Empty: any address the provider vouches for. */
  domains: text("domains").array().notNull().default(sql`'{}'::text[]`),
  /** Let people from these domains create an account on first sign-in (otherwise invitation only). */
  autoJoin: boolean("auto_join").notNull().default(false),
  defaultWorkspaceId: text("default_workspace_id").references(() => workspace.id, { onDelete: "set null" }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A session that started with SAML: who the identity provider signed in, so signing out of Aatmiq
 * can sign them out there too, and the provider's logout can end this session (single logout).
 */
export const ssoSession = pgTable(
  "sso_session",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => ssoConnection.id, { onDelete: "cascade" }),
    nameId: text("name_id").notNull(),
    nameIdFormat: text("name_id_format"),
    sessionIndex: text("session_index"),
    createdAt: createdAt(),
  },
  (t) => [index("sso_session_name_idx").on(t.connectionId, t.nameId)],
);

/* ───────────── License (client side) ───────────── */

/** One row: what this deployment knows about its license check-ins. The key itself is `organization.license_key`. */
export const licenseState = pgTable("license_state", {
  id: text("id").primaryKey().default("current"),
  /** Random id for this installation, sent with check-ins (no hardware fingerprinting). */
  instanceId: text("instance_id").notNull(),
  lastCheckInAt: timestamp("last_check_in_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  revoked: boolean("revoked").notNull().default(false),
  /** Newer release announced by the license server, if any. */
  release: jsonb("release").$type<{ version: string; notes: string | null; url: string | null } | null>(),
  updatedAt: updatedAt(),
});

/* ───────────── Notifications & audit ───────────── */

export const notification = pgTable(
  "notification",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    workspaceId: text("workspace_id"),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_time_idx").on(t.createdAt)],
);

/* ───────────── Documents ───────────── */

export interface Citation {
  n: number;
  /**
   * "document" sources come from files/notes; "chat" and "task" ones are earlier chats and Work AI
   * tasks in the same project; "web" ones are web search results (their link came from the provider).
   */
  kind?: "document" | "chat" | "task" | "web";
  documentId: string | null;
  chatId?: string;
  taskId?: string;
  /** A web source's page, as the search provider returned it. */
  url?: string;
  name: string;
  page: number | null;
  snippet: string;
  label?: "confirmed" | "assumption" | "tbd" | null;
}

/** Web search for one chat answer (the sources themselves are its citations). */
export interface MessageWeb {
  /** What was searched for. */
  queries: string[];
  /** The provider that searched; null when none was set up. */
  provider: "searxng" | "ollama" | "brave" | "tavily" | "serper" | null;
  /** Why there are no web sources (a failed search, nothing found), in English; translated when shown. */
  note: string | null;
}

export const document = pgTable(
  "document",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: documentKindEnum("kind").notNull().default("file"),
    /** Set for sources that belong to one project (deleted with it). Library documents have none. */
    projectId: text("project_id").references((): AnyPgColumn => project.id, { onDelete: "cascade" }),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    scope: documentScopeEnum("scope").notNull().default("private"),
    status: documentStatusEnum("status").notNull().default("processing"),
    error: text("error"),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count"),
    charCount: integer("char_count"),
    embeddingModelId: text("embedding_model_id"),
    label: sourceLabelEnum("label"),
    /** The newer version that replaces this one. Superseded documents are left out of answers. */
    supersededById: text("superseded_by_id").references((): AnyPgColumn => document.id, { onDelete: "set null" }),
    /** sha256 of the extracted text (the same content uploaded twice is noticed). */
    contentHash: text("content_hash"),
    /** 1 for a first upload; each newer version that supersedes it counts up. */
    version: integer("version").notNull().default(1),
    /** In the workspace's general engineering reference library (shared with every member). */
    reference: boolean("reference").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("document_ws_idx").on(t.workspaceId, t.createdAt), index("document_hash_idx").on(t.workspaceId, t.contentHash)],
);

export const documentChunk = pgTable(
  "document_chunk",
  {
    id: id(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    page: integer("page"),
    content: text("content").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('simple', content)`),
    embedding: vector("embedding"),
  },
  (t) => [
    index("chunk_doc_idx").on(t.documentId, t.ordinal),
    index("chunk_tsv_idx").using("gin", t.tsv),
  ],
);

export const chatDocument = pgTable(
  "chat_document",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.documentId] })],
);

/* ───────────── Projects ───────────── */

export const project = pgTable(
  "project",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("190"),
    description: text("description"),
    /** Rules every chat in the project follows; they win over personal custom instructions. */
    instructions: text("instructions"),
    visibility: projectVisibilityEnum("visibility").notNull().default("private"),
    /** Connectors Work AI tasks in the project may use (ids); null: all the organization's. */
    connectorIds: text("connector_ids").array(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_ws_idx").on(t.workspaceId)],
);

export const projectMember = pgTable(
  "project_member",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: projectRoleEnum("role").notNull().default("chat"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

/** Documents available to every chat in a project (project uploads, notes, saved answers, library links). */
export const projectSource = pgTable(
  "project_source",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.documentId] }), index("psource_doc_idx").on(t.documentId)],
);

/** Outgoing mail server as stored (the password is encrypted with the app secret). */
export interface ScimSettingsStored {
  /** sha256 of the bearer token the identity provider sends. */
  tokenHash: string;
  /** Its last four characters, so admins can tell tokens apart. */
  tokenHint: string;
  createdAt: string;
  lastUsedAt?: string | null;
  /** Where new people join (null: the first workspace). */
  workspaceId: string | null;
}

export interface LdapSettingsStored {
  enabled: boolean;
  /** ldaps://dc.acme.local:636 or ldap://…:389 (with startTls). */
  url: string;
  startTls: boolean;
  /** The server's CA certificate (PEM), when it isn't publicly trusted. */
  caCert: string | null;
  bindDn: string;
  bindPasswordEnc: string | null;
  userBase: string;
  userFilter: string;
  emailAttr: string;
  nameAttr: string;
  /** The attribute that never changes for a person (objectGUID, entryUUID…). */
  idAttr: string;
  /** Empty: groups aren't synced. */
  groupBase: string | null;
  groupFilter: string;
  groupNameAttr: string;
  memberAttr: string;
  intervalMinutes: number;
  /** Where new people join (null: the first workspace). */
  workspaceId: string | null;
}

export interface EmailSettingsStored {
  host: string;
  port: number;
  /** "tls": implicit TLS (465); "starttls": upgrade after connecting (587); "none": plain (local relays only). */
  security: "tls" | "starttls" | "none";
  username: string | null;
  passwordEnc: string | null;
  /** Sender address, e.g. "Aatmiq <ai@acme.com>". */
  from: string;
}

/* ───────────── Work AI ───────────── */

/** Org-wide Work AI policy. Missing fields fall back to DEFAULT_WORK_SETTINGS in @aatmiq/shared. */
export interface WorkSettings {
  /** When to stop and ask the person before a tool runs. */
  approvals: "risky" | "always" | "never";
  /** Self-hosted SearXNG for private web search (empty: web search off). */
  searxngUrl: string | null;
  /** Let commands reach the network (package installs, curl). Web search/fetch tools are separate. */
  allowNetwork: boolean;
  /** Tasks one person can run at the same time. */
  maxConcurrentPerUser: number;
  /** Tasks working at once across the organization. */
  maxRunning: number;
  /** Minutes a finished task keeps its runtime warm for follow-ups. */
  idleMinutes: number;
  /** Built-in library skills turned off for the organization. */
  disabledLibrarySkills: string[];
  /** The agent may use a browser (open pages, click, fill in forms). */
  browser: boolean;
  /** Internal hosts the browser may open anyway (private addresses are refused otherwise). */
  browserAllowedHosts: string[];
  /** Container mode: CPUs, memory and internet access per task. */
  containerCpus: number;
  containerMemoryMb: number;
  containerNetwork: "proxy" | "none";
}

/** Auto model choice, set by org admins. */
export interface RoutingSettings {
  enabled: boolean;
  default: boolean;
  judge: "rules" | "model";
  judgeModelId: string | null;
  thinkOnHard: boolean;
}

/** How Auto picked a model for one answer or task. */
export interface Routing {
  difficulty: "easy" | "medium" | "hard";
  tier: "fast" | "standard" | "advanced";
  thinking: boolean;
  by: "rules" | "judge";
  reason: string;
}

/** Unix user ids for task runtimes (each task runs as its own user when the API runs as root). */
export const workUidSeq = pgSequence("work_uid_seq", { startWith: 100000, minValue: 100000, maxValue: 2000000000 });

/**
 * An agent task: one goal, worked on by the harness in its own workspace folder.
 * Follow-up messages continue the same task.
 */
export const workTask = pgTable(
  "work_task",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New task"),
    status: workTaskStatusEnum("status").notNull().default("queued"),
    modelId: text("model_id").references(() => model.id, { onDelete: "set null" }),
    /** How Auto picked the task's model, when it did (thinking stays as decided for the whole task). */
    routing: jsonb("routing").$type<Routing>(),
    /** Harness session id (the engine's own conversation log). */
    sessionId: text("session_id"),
    /** Last answer, for lists and notifications. */
    result: text("result"),
    error: text("error"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    scheduleId: text("schedule_id"),
    projectId: text("project_id").references((): AnyPgColumn => project.id, { onDelete: "set null" }),
    /** Readable (not changeable) by everyone with access to its project. */
    sharedToProject: boolean("shared_to_project").notNull().default(false),
    /** Set when the agent works in a Code workspace (Aatmiq panel) instead of its own task folder. */
    codeWorkspaceId: text("code_workspace_id").references((): AnyPgColumn => codeWorkspace.id, { onDelete: "cascade" }),
    pinned: boolean("pinned").notNull().default(false),
    /** The Unix user its runtime runs as (see workUidSeq). */
    runUid: integer("run_uid").notNull().default(sql`nextval('work_uid_seq')`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("work_task_user_idx").on(t.userId, t.updatedAt), index("work_task_status_idx").on(t.status), index("work_task_project_idx").on(t.projectId)],
);

/** The task timeline, normalized from harness events. `seq` orders events within a task. */
export const workEvent = pgTable(
  "work_event",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => workTask.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    /** user | assistant | tool_call | tool_result | approval | plan | status | error */
    kind: text("kind").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("work_event_task_seq_idx").on(t.taskId, t.seq)],
);

export const workApproval = pgTable(
  "work_approval",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => workTask.id, { onDelete: "cascade" }),
    callId: text("call_id"),
    toolName: text("tool_name").notNull(),
    reason: text("reason"),
    /** What the tool would do (command, file, connector call), shown to the approver. */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    status: workApprovalStatusEnum("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("work_approval_task_idx").on(t.taskId, t.status)],
);

/** Reusable instructions the agent can load: org-wide (admins) or personal. */
export const skill = pgTable(
  "skill",
  {
    id: id(),
    scope: skillScopeEnum("scope").notNull().default("personal"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    /** Folder-safe identifier, unique per scope/owner. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** When to use it (the agent reads this to decide). */
    description: text("description").notNull(),
    body: text("body").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("skill_owner_idx").on(t.scope, t.ownerId)],
);

/** Recurring tasks: a prompt run on a cron schedule. */
export const workSchedule = pgTable(
  "work_schedule",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    /** Five-field cron expression, evaluated in `timezone`. */
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    modelId: text("model_id").references(() => model.id, { onDelete: "set null" }),
    /** Runs become tasks in this project (its instructions, files and connectors). */
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastTaskId: text("last_task_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("work_schedule_due_idx").on(t.enabled, t.nextRunAt)],
);

/**
 * How a connector signs in: `none` (open server), `token` (shared headers the admin enters) or
 * `oauth` (each person connects their own account).
 */
export const connectorAuthEnum = pgEnum("connector_auth", ["none", "token", "oauth"]);

/** Org-level MCP servers the agent can use as tools (Slack, GitHub, Jira…). */
export const connector = pgTable("connector", {
  id: id(),
  /** Tool namespace, e.g. "github" → github__create_issue. */
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  url: text("url").notNull(),
  /** Catalog entry it was added from (packages/shared connectors catalog), if any. */
  catalogId: text("catalog_id"),
  auth: connectorAuthEnum("auth").notNull().default("none"),
  /** Request headers (e.g. Authorization), encrypted JSON. */
  headersEnc: text("headers_enc"),
  /** OAuth client: entered by the admin, or registered automatically (dynamic client registration). */
  oauthClientId: text("oauth_client_id"),
  oauthClientSecretEnc: text("oauth_client_secret_enc"),
  /** Space-separated scopes to request; empty means the catalog's or the server's defaults. */
  oauthScopes: text("oauth_scopes"),
  /** Discovered authorization server details and how the client was registered. */
  oauthMeta: jsonb("oauth_meta").$type<ConnectorOAuthMeta>(),
  /** Tools whose names match are always approved by a person first (comma-separated globs). */
  approveTools: text("approve_tools").notNull().default("*"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type ConnectorOAuthMeta = {
  resource: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
  scopesSupported?: string[];
  tokenAuthMethods?: string[];
  /** How the client id was obtained: entered by an admin, dynamic registration, or a metadata document URL. */
  client: "admin" | "dynamic" | "metadata";
  /** The redirect URI the client was registered with (re-register if the app URL changes). */
  redirectUri?: string;
};

/** A person's own sign-in to an OAuth connector (Gmail, Canva…). Tokens are encrypted. */
export const connectorAccount = pgTable(
  "connector_account",
  {
    id: id(),
    connectorId: text("connector_id")
      .notNull()
      .references(() => connector.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope"),
    /** Who signed in, when the server says (an email or account name). */
    label: text("label"),
    /** `expired` when a refresh failed: the person has to connect again. */
    status: text("status").notNull().default("ok"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connector_account_user_idx").on(t.connectorId, t.userId)],
);

/* ───────────── Code (Aatmiq IDE) ───────────── */

export const codeWorkspaceStatusEnum = pgEnum("code_workspace_status", ["ready", "cloning", "failed"]);

/** A person's Unix user for their IDE, terminals and in-IDE agent (same id space as task users). */
export const codeUser = pgTable("code_user", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  uid: integer("uid").notNull().default(sql`nextval('work_uid_seq')`),
  createdAt: createdAt(),
});

/** A folder of code a person works on in Aatmiq Code (empty or cloned from Git). Private to its owner. */
export const codeWorkspace = pgTable(
  "code_workspace",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Folder name under the person's code home; unique per person. */
    slug: text("slug").notNull(),
    gitUrl: text("git_url"),
    status: codeWorkspaceStatusEnum("status").notNull().default("ready"),
    error: text("error"),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("code_workspace_user_slug_idx").on(t.userId, t.slug), index("code_workspace_ws_idx").on(t.workspaceId, t.userId)],
);

/* ───────────── System status ───────────── */

/**
 * Small facts about the installation, by key: "backup" (written by deploy/backup/backup.sh after
 * each run), "health_alerts" (which problems admins were told about) and "health_settings".
 */
export const systemStatus = pgTable("system_status", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: updatedAt(),
});

/* ───────────── GEM AI: Learning ───────────── */

export const courseLevelEnum = pgEnum("course_level", ["basic", "intermediate", "advanced"]);
export const courseStatusEnum = pgEnum("course_status", ["generating", "ready", "failed"]);
export const lessonStatusEnum = pgEnum("lesson_status", ["pending", "generating", "ready", "failed"]);

/** A generated course: its outline, owned by one person (docs/15-gem-ai.md). */
export const course = pgTable(
  "course",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    level: courseLevelEnum("level").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    status: courseStatusEnum("status").notNull().default("generating"),
    error: text("error"),
    /** The validated outline: modules and their lessons (see CourseOutline). */
    outline: jsonb("outline").$type<CourseOutline>(),
    /** Bumped when the outline is regenerated; older outlines stay in outlineHistory. */
    version: integer("version").notNull().default(1),
    outlineHistory: jsonb("outline_history").$type<{ version: number; outline: CourseOutline; replacedAt: string }[]>(),
    modelId: text("model_id").references(() => model.id, { onDelete: "set null" }),
    /** Where the person left off (lesson ordinal), for "resume". */
    lastLesson: integer("last_lesson"),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("course_user_idx").on(t.userId, t.workspaceId, t.updatedAt),
    index("course_fts_idx").using("gin", sql`to_tsvector('simple', ${t.title} || ' ' || ${t.topic})`),
  ],
);

/**
 * One version of one lesson. Regenerating adds a new version and keeps the old one, so a person's
 * progress and bookmarks (kept by ordinal) aren't lost. Exactly one version per ordinal is current.
 */
export const courseLesson = pgTable(
  "course_lesson",
  {
    id: id(),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    /** Position in the course, counting across modules from 0. */
    ordinal: integer("ordinal").notNull(),
    version: integer("version").notNull().default(1),
    current: boolean("current").notNull().default(true),
    title: text("title").notNull(),
    status: lessonStatusEnum("status").notNull().default("pending"),
    content: jsonb("content").$type<LessonContent>(),
    /** Videos found through the YouTube Data API (IDs the API returned, never model-written URLs). */
    videos: jsonb("videos").$type<LessonVideo[]>(),
    videosCheckedAt: timestamp("videos_checked_at", { withTimezone: true }),
    /** Why videos are missing, when they are ("not configured", "quota"...). */
    videosNote: text("videos_note"),
    /** How the lesson was researched and checked before it was saved (null: written without a check). */
    verification: jsonb("verification").$type<LessonVerification>(),
    /** What's happening while it's written: researching → writing → checking → videos; null when done. */
    stage: text("stage").$type<LessonStage>(),
    error: text("error"),
    modelId: text("model_id").references(() => model.id, { onDelete: "set null" }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("course_lesson_version_idx").on(t.courseId, t.ordinal, t.version), index("course_lesson_current_idx").on(t.courseId, t.current, t.ordinal)],
);

/** A person's progress on a lesson (by ordinal, so it survives regeneration). */
export const courseLessonState = pgTable(
  "course_lesson_state",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    bookmarkedAt: timestamp("bookmarked_at", { withTimezone: true }),
    note: text("note"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.ordinal, t.userId] }), index("lesson_state_user_idx").on(t.userId, t.bookmarkedAt)],
);

/** YouTube search results, so repeated searches don't spend API quota. */
export const youtubeCache = pgTable("youtube_cache", {
  queryHash: text("query_hash").primaryKey(),
  query: text("query").notNull(),
  results: jsonb("results").$type<LessonVideo[]>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A person's rating of a lesson video, one per person and video (it holds across lessons). The
 * organization's ratings steer later picks: a video with at least two Not helpful and more Not
 * helpful than Helpful isn't offered again (docs/15-gem-ai.md#rated-videos).
 */
export const videoFeedback = pgTable(
  "video_feedback",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The lesson version it was rated in (the video's title is read from there). */
    lessonId: text("lesson_id").references(() => courseLesson.id, { onDelete: "set null" }),
    videoId: text("video_id").notNull(),
    rating: text("rating").$type<"up" | "ok" | "down">().notNull(),
    /** Why it wasn't helpful (only with "down"). */
    reason: text("reason").$type<"off_topic" | "poor_quality" | "wrong_language" | "too_long" | "too_short" | "broken" | "other">(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("video_feedback_user_video_idx").on(t.userId, t.videoId), index("video_feedback_video_idx").on(t.videoId)],
);

/** Videos an admin blocked: never offered to a lesson again, and dropped from lessons at their next check. */
export const videoBlock = pgTable("video_block", {
  videoId: text("video_id").primaryKey(),
  blockedBy: text("blocked_by").references(() => user.id, { onDelete: "set null" }),
  reason: text("reason"),
  /** As shown when it was blocked, so the list can name it after lessons have dropped it. */
  title: text("title"),
  channel: text("channel"),
  createdAt: createdAt(),
});

/* ───────────── GEM AI: Calculators ───────────── */

/** One calculation a person ran: inputs, results, units and the formula version. */
export const calculatorHistory = pgTable(
  "calculator_history",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspace.id, { onDelete: "set null" }),
    calculatorId: text("calculator_id").notNull(),
    /** "formula" (a registry calculator), "expression" (the keypads) or "tool". */
    kind: text("kind").notNull().default("formula"),
    formulaVersion: integer("formula_version"),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
    outputs: jsonb("outputs").$type<unknown>().notNull(),
    /** Where it ran: "calculators" (the screen) or "chat" (the chat tool). */
    source: text("source").notNull().default("calculators"),
    createdAt: createdAt(),
  },
  (t) => [index("calc_history_user_idx").on(t.userId, t.createdAt)],
);

export const calculatorFavorite = pgTable(
  "calculator_favorite",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    calculatorId: text("calculator_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.calculatorId] })],
);

/* ───────────── GEM AI: Knowledge ───────────── */

/** A question asked of one project's documents, with the passages the answer could cite. */
export const knowledgeQuery = pgTable(
  "knowledge_query",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull().default(""),
    /** "answered", "not_found" (the documents don't say), "error". */
    status: text("status").notNull().default("answered"),
    error: text("error"),
    /** Every passage that was retrieved and shown to the model, numbered as cited. */
    citations: jsonb("citations").$type<KnowledgeCitation[]>().notNull().default(sql`'[]'::jsonb`),
    /** The general engineering library was searched too. */
    includeGeneral: boolean("include_general").notNull().default(false),
    modelId: text("model_id").references(() => model.id, { onDelete: "set null" }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: createdAt(),
  },
  (t) => [index("knowledge_query_idx").on(t.projectId, t.userId, t.createdAt)],
);

/* ───────────── GEM AI types ───────────── */

export interface GemSettingsStored {
  /** Modules that are switched on (a broken one can be hidden without touching chat, work or code). */
  modules: { learning: boolean; calculators: boolean; knowledge: boolean };
  /** Show calculators that aren't yet verified against five reference cases. */
  betaCalculators: boolean;
  /** YouTube Data API key, encrypted (YOUTUBE_API_KEY in the environment also works). */
  youtubeKeyEnc?: string | null;
  /** Courses one person may generate per day. */
  coursesPerDay: number;
  /** Lesson generations (including regenerations) per person per day. */
  lessonsPerDay: number;
  /** Where lesson videos come from: the Data API, yt-dlp, either ("auto") or none. */
  videoSource?: "auto" | "ytdlp" | "api" | "off";
  /** Web search for chat and lessons. Unset: WEB_SEARCH_PROVIDER; "off" is the admin's choice and wins. */
  webProvider?: "off" | "searxng" | "ollama" | "brave" | "tavily" | "serper";
  /** The SearXNG server (null: WEB_SEARCH_URL, then Work AI's SearXNG). */
  webUrl?: string | null;
  /** The paid provider's API key, encrypted (WEB_SEARCH_KEY in the environment also works). */
  webKeyEnc?: string | null;
  /** Which provider that key is for, so it's never sent to another one after a switch. */
  webKeyProvider?: "ollama" | "brave" | "tavily" | "serper" | null;
  /** People may switch web search on in chat (default on). */
  chatWebSearch?: boolean;
  /** Lessons are researched and checked before they're saved (default on). */
  lessonCheck?: boolean;
}

export interface CourseOutline {
  title: string;
  description: string;
  level: "basic" | "intermediate" | "advanced";
  prerequisites: string[];
  modules: { title: string; summary: string; lessons: { title: string; summary: string }[] }[];
}

export interface LessonEquation {
  name: string;
  /** The equation as plain text or LaTeX. */
  expression: string;
  latex?: string;
  symbols: { symbol: string; meaning: string; unit: string }[];
  /** When it applies: "ideal buck converter in continuous-conduction mode", never universal. */
  validity: string;
}

export interface LessonContent {
  title: string;
  objectives: string[];
  prerequisites: string[];
  theory: string;
  explanation: string;
  equations: LessonEquation[];
  workedExample: { problem: string; given: string[]; steps: string[]; answer: string };
  /** Figures: what to look at and where a real one is published; never a made-up figure. */
  diagrams: { title: string; description: string; reference: string }[];
  commonMistakes: string[];
  /** Search phrases for videos (the model may not write URLs). */
  videoQueries: string[];
  references: { title: string; author?: string; kind: string; note?: string }[];
  takeaways: string[];
}

export type LessonStage = "researching" | "writing" | "checking" | "videos";

/** One thing the checker corrected (or, with `open`, an arithmetic error still in the lesson). */
export interface LessonIssue {
  part: "objectives" | "theory" | "explanation" | "equation" | "workedExample" | "diagram" | "mistake" | "reference" | "takeaway" | "other";
  problem: string;
  fix: string;
  severity: "high" | "medium" | "low";
  /** Numbers of the sources (verification.sources) that show it. */
  sources: number[];
  /** Still wrong after the check (a calculation that doesn't come out as the lesson says). */
  open?: boolean;
}

/** How a lesson was researched and checked (docs/15-gem-ai.md#checked-lessons). */
export interface LessonVerification {
  /** "checked": nothing to correct; "corrected": the checker changed it; "not_checked": the check failed. */
  status: "checked" | "corrected" | "not_checked";
  /** Why it wasn't checked (English; translated when shown). */
  reason?: string | null;
  /** The checker's model (display name, kept if the model goes) and its id. */
  model: string | null;
  modelId?: string | null;
  checkedAt: string;
  /** The web search provider the sources came from; null when none was used. */
  provider: "searxng" | "ollama" | "brave" | "tavily" | "serper" | null;
  /** What was searched for. */
  queries?: string[];
  /** Why there are no sources (the search failed), in English; translated when shown. */
  researchNote?: string | null;
  /** The pages the writer and the checker read, numbered as the issues cite them. Links come only from the provider. */
  sources: { n: number; title: string; url: string }[];
  issues: LessonIssue[];
  /** The lesson's calculations, worked out by the calculators' engine (computed null: it couldn't be read). */
  calc: { label: string; expression: string; claimed: number; computed: number | null; ok: boolean | null }[];
}

export interface LessonVideo {
  videoId: string;
  title: string;
  channel: string;
  publishedAt?: string;
  durationSeconds?: number | null;
  thumbnail?: string;
  query?: string;
  /** Why the picker chose it, in a line (absent when videos were kept in search order). */
  why?: string;
}

export interface KnowledgeCitation {
  n: number;
  chunkId: string;
  documentId: string;
  name: string;
  version: number;
  page: number | null;
  excerpt: string;
  /** "project" or "general" (the reference library). */
  scope: "project" | "general";
  label?: "confirmed" | "assumption" | "tbd" | null;
}
