"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Download, Monitor, Moon, Settings, Sun, Trash2 } from "lucide-react";
import Link from "next/link";
import { TopBar } from "@/components/app/frame";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { RequestTokensDialog } from "@/components/chat/request-tokens";
import { SecuritySettings } from "@/components/settings/security";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Avatar, Badge, Card, Meter } from "@/components/ui/misc";
import { del, get, patch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { chatTitle, formatTokens, timeAgo } from "@/lib/format";
import { applyTheme, readTheme, type ThemePref } from "@/lib/theme";
import type { ChatSummary, QuotaStatus, TokenRequestRow } from "@/lib/types";
import { USER_FAQ } from "@/components/help/user-faq";
import { FaqList } from "@/components/help/faq-list";
import { LOCALE_NAMES, LOCALES, msg, useSetLocale, useT, type Locale } from "@/i18n";

const ROLE_NAMES = { owner: msg("owner"), admin: msg("admin"), member: msg("member") } as const;
const REQUEST_STATUS = { pending: msg("pending"), approved: msg("approved"), denied: msg("denied") } as const;

const TABS = [msg("Profile"), msg("Security"), msg("Appearance"), msg("Usage"), msg("Archived chats"), msg("Your data"), msg("FAQ")] as const;

export default function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Profile");
  useEffect(() => {
    if (window.location.hash === "#usage") setTab("Usage");
    if (window.location.hash === "#archived") setTab("Archived chats");
    if (window.location.hash === "#security") setTab("Security");
    if (window.location.hash === "#faq") setTab("FAQ");
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar icon={<Settings />} title={t("Settings")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pt-10 pb-16 sm:px-6">
        <PageHeader title={t("Settings")} description={t("Manage your profile, sign-in security, appearance, usage, archived chats and common questions.")} />
        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((x) => (
            <button
              key={x}
              onClick={() => setTab(x)}
              className={cn(
                "relative shrink-0 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors",
                tab === x ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {t(x)}
              {tab === x && <span className="absolute inset-x-2 -bottom-px h-px bg-fg" />}
            </button>
          ))}
        </div>
        <div key={tab} className="animate-rise pt-6">
          {tab === "Profile" && <Profile />}
          {tab === "Security" && <SecuritySettings />}
          {tab === "Appearance" && <Appearance />}
          {tab === "Usage" && <Usage />}
          {tab === "Archived chats" && <ArchivedChats />}
          {tab === "Your data" && <YourData />}
          {tab === "FAQ" && <FaqList sections={USER_FAQ} />}
        </div>
      </div>
      </div>
    </div>
  );
}

function Profile() {
  const t = useT();
  const { me } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState(me.user.name);
  const [jobTitle, setJobTitle] = useState(me.user.jobTitle ?? "");
  const [ci, setCi] = useState(me.user.customInstructions ?? "");
  const save = useMutation({
    mutationFn: () => patch("/api/me", { name, jobTitle, customInstructions: ci }),
    onSuccess: () => {
      toast.success(t("Profile saved"));
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={me.user.name} image={me.user.image} className="size-14 text-base" />
        <div>
          <div className="font-medium">{me.user.email}</div>
          <div className="mt-1 flex gap-1.5">
            <Badge tone={me.user.orgRole === "member" ? "neutral" : "accent"}>{t(ROLE_NAMES[me.user.orgRole])}</Badge>
            <span className="text-xs text-fg-subtle">{me.org.name}</span>
          </div>
        </div>
      </div>
      <Field label={t("Full name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("Job title")}>
        <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder={t("e.g. Finance lead")} />
      </Field>
      <Field label={t("Custom instructions")} hint={t("{productName} considers these in every chat, e.g. your role, preferred tone or formatting.", { productName: me.org.productName })}>
        <Textarea rows={4} value={ci} onChange={(e) => setCi(e.target.value)} maxLength={4000} placeholder={t("I'm a backend engineer. Prefer concise answers with TypeScript examples.")} />
      </Field>
      <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
        {t("Save changes")}
      </Button>
    </div>
  );
}

function Appearance() {
  const t = useT();
  const [pref, setPref] = useState<ThemePref>("dark");
  useEffect(() => setPref(readTheme()), []);
  const opts: { v: ThemePref; label: string; icon: typeof Moon }[] = [
    { v: "dark", label: t("Dark"), icon: Moon },
    { v: "light", label: t("Light"), icon: Sun },
    { v: "system", label: t("System"), icon: Monitor },
  ];
  return (
    <div className="space-y-8">
    <Language />
    <Field label={t("Theme")}>
      <div className="grid grid-cols-3 gap-3 pt-1">
        {opts.map((o) => (
          <button
            key={o.v}
            onClick={() => {
              setPref(o.v);
              applyTheme(o.v);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-colors",
              pref === o.v ? "border-fg-subtle bg-surface-2 text-fg" : "border-border text-fg-muted hover:border-border-strong",
            )}
          >
            <o.icon className="size-5" />
            {o.label}
          </button>
        ))}
      </div>
    </Field>
    </div>
  );
}

/** The interface language: the person's own, or the organization's default. */
function Language() {
  const t = useT();
  const { me } = useSession();
  const qc = useQueryClient();
  const setLocale = useSetLocale();
  const save = useMutation({
    mutationFn: (locale: Locale | null) => patch("/api/me", { locale }),
    onSuccess: (_r, locale) => {
      setLocale(locale ?? me.org.defaultLocale);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const value = me.user.locale ?? "";
  return (
    <Field label={t("Language")} hint={t("Chat answers come in the language you write in.")}>
      <div className="grid grid-cols-3 gap-3 pt-1" role="radiogroup" aria-label={t("Language")}>
        {[{ v: "", label: t("Organization default ({name})", { name: LOCALE_NAMES[me.org.defaultLocale] }) }, ...LOCALES.map((l) => ({ v: l, label: LOCALE_NAMES[l] }))].map((o) => (
          <button
            key={o.v || "default"}
            role="radio"
            aria-checked={value === o.v}
            lang={o.v || undefined}
            disabled={save.isPending}
            onClick={() => save.mutate(o.v ? (o.v as Locale) : null)}
            className={cn(
              "rounded-xl border p-4 text-sm transition-colors",
              value === o.v ? "border-fg-subtle bg-surface-2 text-fg" : "border-border text-fg-muted hover:border-border-strong",
            )}
            data-testid={`language-${o.v || "default"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

function Usage() {
  const t = useT();
  const { me } = useSession();
  const [requestFor, setRequestFor] = useState<string | null>(null);
  const requests = useQuery({
    queryKey: ["my-requests"],
    queryFn: () => get<TokenRequestRow[]>("/api/token-requests?scope=mine"),
  });
  return (
    <div className="space-y-4">
      {me.workspaces.map((w) => (
        <WorkspaceUsage key={w.id} id={w.id} name={w.name} onRequest={() => setRequestFor(w.id)} />
      ))}
      <GroupUsage />
      <div className="pt-4">
        <h3 className="mb-3 text-sm font-medium">{t("Your requests")}</h3>
        {requests.data?.length ? (
          <Card className="divide-y divide-border">
            {requests.data.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div>{t("+{amount} in {workspace}", { amount: formatTokens(r.amount), workspace: <span className="text-fg-muted">{r.workspaceName}</span> })}</div>
                  <div className="text-xs text-fg-subtle">
                    {timeAgo(r.createdAt, t)}
                    {r.note ? ` · “${r.note}”` : ""}
                  </div>
                </div>
                <Badge tone={r.status === "approved" ? "success" : r.status === "denied" ? "danger" : "warning"}>
                  {r.status === "approved" && r.decidedAmount !== r.amount ? t("approved {amount}", { amount: formatTokens(r.decidedAmount) }) : t(REQUEST_STATUS[r.status])}
                </Badge>
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-fg-subtle">{t("You haven't requested extra tokens.")}</p>
        )}
      </div>
      {requestFor && <RequestTokensDialog open onOpenChange={(o) => !o && setRequestFor(null)} workspaceId={requestFor} />}
    </div>
  );
}

/** Your share of each group's budget (groups pay for the models only they give). */
function GroupUsage() {
  const t = useT();
  const q = useQuery({ queryKey: ["my-groups"], queryFn: () => get<{ id: string; name: string; description: string | null; models: { id: string; displayName: string }[]; quota: QuotaStatus }[]>("/api/me/groups") });
  if (!q.data?.length) return null;
  return (
    <>
      {q.data.map((g) => {
        const d = g.quota;
        const limit = d.user.limit;
        return (
          <Card key={g.id} className="p-4" data-testid="group-usage">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {g.name} <span className="text-xs font-normal text-fg-subtle">{t("group")}</span>
                </div>
                <div className="truncate text-xs text-fg-subtle">
                  {g.models.length ? t("Pays for {models} in any of your workspaces", { models: g.models.map((m) => m.displayName).join(", ") }) : t("No models of its own")} ·{" "}
                  {t("Resets {date}", { date: t.date(d.resetsAt, { month: "short", day: "numeric" }) })}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between text-sm">
              <span>
                <span className="font-mono text-base font-medium">{formatTokens(d.user.used)}</span>
                <span className="text-fg-muted"> {t("used")}</span>
              </span>
              <span className="text-fg-muted">{limit === null ? t("No limit") : t("of {limit}", { limit: formatTokens(limit) })}</span>
            </div>
            <Meter className="mt-2" value={limit === null ? 0 : d.user.used / Math.max(1, limit)} />
          </Card>
        );
      })}
    </>
  );
}

function WorkspaceUsage({ id, name, onRequest }: { id: string; name: string; onRequest: () => void }) {
  const t = useT();
  const q = useQuery({ queryKey: ["quota", id], queryFn: () => get<QuotaStatus>(`/api/workspaces/${id}/quota`) });
  const d = q.data;
  const limit = d?.user.limit === null || d?.user.limit === undefined ? null : d.user.limit + d.user.bonus;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-xs text-fg-subtle">
            {d ? t("Resets {date}", { date: t.date(d.resetsAt, { month: "short", day: "numeric" }) }) : " "}
          </div>
        </div>
        <Button size="sm" onClick={onRequest}>{t("Request more")}</Button>
      </div>
      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span>
          <span className="font-mono text-base font-medium">{formatTokens(d?.user.used ?? 0)}</span>
          <span className="text-fg-muted"> {t("used")}</span>
        </span>
        <span className="text-fg-muted">{limit === null ? t("No limit") : t("of {limit}", { limit: formatTokens(limit) })}</span>
      </div>
      <Meter className="mt-2" value={limit === null ? 0 : (d?.user.used ?? 0) / Math.max(1, limit)} />
      {d && d.user.bonus > 0 && <div className="mt-2 text-xs text-fg-subtle">{t("Includes +{amount} approved this period.", { amount: formatTokens(d.user.bonus) })}</div>}
    </Card>
  );
}

function ArchivedChats() {
  const t = useT();
  const { workspaceId, workspace } = useSession();
  const qc = useQueryClient();
  const archived = useQuery({
    queryKey: ["archived", workspaceId],
    queryFn: () => get<ChatSummary[]>(`/api/chats?workspaceId=${workspaceId}&archived=1`),
    enabled: !!workspaceId,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["archived", workspaceId] });
    qc.invalidateQueries({ queryKey: ["chats", workspaceId] });
    qc.invalidateQueries({ queryKey: ["project"] });
  };
  const restore = useMutation({
    mutationFn: (id: string) => patch(`/api/chats/${id}`, { archived: false }),
    onSuccess: () => {
      refresh();
      toast(t("Chat restored"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/chats/${id}`),
    onSuccess: () => {
      refresh();
      toast(t("Chat deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (archived.isLoading) return null;
  if (!archived.data?.length)
    return (
      <p className="text-sm text-fg-subtle">
        {t("No archived chats in {workspace}. Archive a chat from its menu to tidy your sidebar without deleting it.", { workspace: workspace?.name ?? t("this workspace") })}
      </p>
    );
  return (
    <Card className="divide-y divide-border">
      {archived.data.map((c) => (
        <div key={c.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link href={c.projectId ? `/app/projects/${c.projectId}/${c.id}` : `/app/chat/${c.id}`} className="block truncate text-[13.5px] text-fg hover:underline">
              {chatTitle(c.title, t)}
            </Link>
            <div className="text-xs text-fg-subtle">
              {c.projectName ? `${c.projectName} · ` : ""}
              {t("archived {when}", { when: timeAgo(c.archivedAt ?? c.updatedAt, t) })}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => restore.mutate(c.id)}>
            <ArchiveRestore className="size-3.5" /> {t("Restore")}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("Delete {title}", { title: c.title })} onClick={() => remove.mutate(c.id)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </Card>
  );
}

/** Download everything about you; erasing is for an admin (the owner can't be erased). */
function YourData() {
  const t = useT();
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="text-[13.5px] text-fg">{t("Download your data")}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
          {t(
            "A ZIP with everything kept about you: your profile and sign-ins, every chat (all versions), the documents you uploaded, your projects, Work AI tasks and the files they made, skills, schedules, connected apps, usage and the activity log about you. Passwords and app tokens are never included.",
          )}
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <a href="/api/me/export" data-testid="download-my-data">
            <Download /> {t("Download my data")}
          </a>
        </Button>
      </Card>
      <Card className="p-5">
        <div className="text-[13.5px] text-fg">{t("Erase your account")}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
          {t("Ask an admin of your organization: they can erase your account and everything you made, and give shared projects to a colleague.")}
        </p>
      </Card>
    </div>
  );
}
