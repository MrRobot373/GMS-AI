"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, MoreHorizontal, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CopyField } from "@/components/admin/copy-field";
import { Section } from "@/components/admin/table";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, Switch } from "@/components/ui/misc";
import { Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { del, get, post, put } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { WorkspaceRow } from "@/lib/types";
import { useT } from "@/i18n";

interface LdapSettings {
  enabled: boolean;
  url: string;
  startTls: boolean;
  caCert: string | null;
  bindDn: string;
  hasPassword: boolean;
  userBase: string;
  userFilter: string;
  emailAttr: string;
  nameAttr: string;
  idAttr: string;
  groupBase: string | null;
  groupFilter: string;
  groupNameAttr: string;
  memberAttr: string;
  intervalMinutes: number;
  workspaceId: string | null;
}
type Preset = Pick<LdapSettings, "userFilter" | "emailAttr" | "nameAttr" | "idAttr" | "groupFilter" | "groupNameAttr" | "memberAttr">;
interface SyncResult {
  at: string;
  ok: boolean;
  people: number;
  created: number;
  updated: number;
  deactivated: number;
  reactivated: number;
  groups: number;
  skipped: string[];
  heldBack: number;
  error: string | null;
}
interface DirectoryInfo {
  feature: boolean;
  ssoEnabled: boolean;
  scim: { on: boolean; baseUrl: string; tokenHint: string | null; createdAt: string | null; lastUsedAt: string | null; workspaceId: string | null; people: number; groups: number };
  ldap: { settings: LdapSettings | null; last: SyncResult | null; presets: { ad: Preset; openldap: Preset } };
}

/** Admin → Authentication → Directory: SCIM provisioning and LDAP / Active Directory sync. */
export function DirectorySection({ ssoEnabled }: { ssoEnabled: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-directory"], queryFn: () => get<DirectoryInfo>("/api/admin/directory") });
  const workspaces = useQuery({ queryKey: ["admin-workspaces"], queryFn: () => get<WorkspaceRow[]>("/api/admin/workspaces") });
  const [token, setToken] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [stopping, setStopping] = useState<"scim" | "ldap" | null>(null);
  const onError = (e: Error) => toast.error(e.message);
  const saved = (d: DirectoryInfo) => qc.setQueryData(["admin-directory"], d);

  const newToken = useMutation({
    mutationFn: () => post<DirectoryInfo & { token: string }>("/api/admin/directory/scim/token"),
    onSuccess: ({ token: tk, ...d }) => {
      saved(d);
      setToken(tk);
    },
    onError,
  });
  const scimWorkspace = useMutation({
    mutationFn: (workspaceId: string | null) => put<DirectoryInfo>("/api/admin/directory/scim", { workspaceId }),
    onSuccess: (d) => {
      saved(d);
      toast.success(t("Saved"));
    },
    onError,
  });
  const stop = useMutation({
    mutationFn: (which: "scim" | "ldap") => del<DirectoryInfo>(`/api/admin/directory/${which}`),
    onSuccess: (d) => {
      saved(d);
      setStopping(null);
      toast(t("Turned off. People and groups stay as they are."));
    },
    onError,
  });
  const sync = useMutation({
    mutationFn: (allowMass: boolean) => post<DirectoryInfo & { result: SyncResult }>("/api/admin/directory/ldap/sync", { allowMass }),
    onSuccess: ({ result, ...d }) => {
      saved(d);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-groups"] });
      if (!result.ok) toast.error(result.error ?? t("The sync failed."));
      else if (result.heldBack) toast.warning(t.n(result.heldBack, "Synced, but {n} person wasn't deactivated: see below.", "Synced, but {n} people weren't deactivated: see below."));
      else toast.success(t("Synced: {created} new, {updated} updated, {deactivated} deactivated.", { created: result.created, updated: result.updated + result.reactivated, deactivated: result.deactivated }));
    },
    onError,
  });

  if (!q.data) return <Skeleton className="h-48 rounded-xl" />;
  const d = q.data;
  const { scim, ldap } = d;
  const last = ldap.last;
  const wsOptions = (
    <>
      <option value="">{t("The first workspace")}</option>
      {(workspaces.data ?? []).map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </>
  );

  return (
    <Section
      title={t("Directory")}
      description={t("Keep people and groups in step with your company's directory: new people get an account, changes follow, leavers lose access. Give the groups models and budgets in Admin → Groups.")}
    >
      {!d.feature && (
        <Card className="p-4 text-[12.5px] text-fg-muted" data-testid="directory-upgrade">
          {t("Directory sync (SCIM and LDAP) is part of the Enterprise plan.")}
        </Card>
      )}
      {d.feature && !ssoEnabled && (scim.on || ldap.settings) && (
        <p className="flex items-center gap-2 text-[12.5px] text-warning" data-testid="directory-needs-sso">
          <CircleAlert className="size-3.5 shrink-0" /> {t("People from your directory sign in with single sign-on: add a sign-in provider above.")}
        </p>
      )}
      <Card className="divide-y divide-border">
        {/* SCIM */}
        <div className="space-y-4 p-5" data-testid="scim">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13.5px] text-fg">
                {t("Provisioning (SCIM)")} {scim.on && <Badge tone="success">{t("On")}</Badge>}
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
                {t("Okta, Microsoft Entra ID, OneLogin, JumpCloud and other identity providers create people, keep them up to date, deactivate them when they leave, and send their groups.")}
              </p>
              {scim.on && (
                <p className="mt-2 text-[12.5px] text-fg-muted" data-testid="scim-status">
                  {t.n(scim.people, "{n} person", "{n} people")} · {t.n(scim.groups, "{n} group", "{n} groups")} ·{" "}
                  {scim.lastUsedAt ? t("last call {when}", { when: timeAgo(scim.lastUsedAt, t) }) : t("the provider hasn't called yet")}
                </p>
              )}
            </div>
            {scim.on ? (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t("Provisioning options")}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuItem icon={<RotateCcw />} onSelect={() => newToken.mutate()}>{t("New token")}</MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Trash2 />} danger onSelect={() => setStopping("scim")}>{t("Turn off")}</MenuItem>
                </MenuContent>
              </Menu>
            ) : (
              <Button variant="outline" size="sm" disabled={!d.feature} loading={newToken.isPending} onClick={() => newToken.mutate()} data-testid="scim-on">
                {t("Turn on")}
              </Button>
            )}
          </div>
          {scim.on && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CopyField label={t("SCIM base URL")} value={scim.baseUrl} hint={t("The token ends in …{hint}. A new one replaces it.", { hint: scim.tokenHint ?? "" })} testId="scim-url" />
              <Field label={t("New people join")}>
                <Select value={scim.workspaceId ?? ""} onChange={(e) => scimWorkspace.mutate(e.target.value || null)} data-testid="scim-workspace">
                  {wsOptions}
                </Select>
              </Field>
            </div>
          )}
        </div>

        {/* LDAP */}
        <div className="flex flex-wrap items-start gap-4 p-5" data-testid="ldap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13.5px] text-fg">
              {t("LDAP / Active Directory")}
              {ldap.settings && (ldap.settings.enabled ? <Badge tone="success">{t("On")}</Badge> : <Badge>{t("Paused")}</Badge>)}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
              {t("Reads your directory on a schedule (it never writes to it): new people get an account, renamed people are renamed, and people who are disabled or removed are deactivated.")}
            </p>
            {last && (
              <p className={last.ok ? "mt-2 text-[12.5px] text-fg-muted" : "mt-2 text-[12.5px] text-danger"} data-testid="ldap-last">
                {last.ok
                  ? t("Synced {when}: {people} people in the directory, {created} new, {deactivated} deactivated.", { when: timeAgo(last.at, t), people: last.people, created: last.created, deactivated: last.deactivated })
                  : t("The sync {when} failed: {error}", { when: timeAgo(last.at, t), error: last.error ?? "" })}
              </p>
            )}
            {last?.ok && last.skipped.length > 0 && (
              <details className="mt-1 text-[12px] text-fg-subtle">
                <summary className="cursor-pointer">{t.n(last.skipped.length, "{n} person left out", "{n} people left out")}</summary>
                <ul className="mt-1 list-disc pl-5">
                  {last.skipped.slice(0, 20).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
            {last?.ok && last.heldBack > 0 && (
              <div className="mt-2 rounded-lg border border-warning/40 p-3 text-[12.5px] text-fg-muted" data-testid="ldap-held-back">
                {t.n(
                  last.heldBack,
                  "{n} person is no longer in the directory, but they weren't deactivated: that's more than half of the people it keeps up to date. If they really left, deactivate them; otherwise check the base DN and the filter.",
                  "{n} people are no longer in the directory, but they weren't deactivated: that's more than half of the people it keeps up to date. If they really left, deactivate them; otherwise check the base DN and the filter.",
                )}
                <div className="mt-2">
                  <Button variant="outline" size="sm" loading={sync.isPending && sync.variables === true} onClick={() => sync.mutate(true)} data-testid="ldap-sync-anyway">
                    {t("Deactivate them")}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {ldap.settings && (
              <Button variant="ghost" size="sm" loading={sync.isPending && sync.variables === false} onClick={() => sync.mutate(false)} data-testid="ldap-sync">
                <RefreshCw className="size-3.5" /> {t("Sync now")}
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={!d.feature} onClick={() => setEditing(true)} data-testid="ldap-edit">
              {ldap.settings ? t("Edit") : t("Set up")}
            </Button>
          </div>
        </div>
      </Card>

      <Dialog
        open={!!token}
        onOpenChange={(o) => !o && setToken(null)}
        title={t("Provisioning is on")}
        description={t("Enter these in your identity provider's SCIM settings now: the token isn't shown again.")}
        footer={<Button onClick={() => setToken(null)}>{t("Done")}</Button>}
      >
        <div className="space-y-4">
          <CopyField label={t("SCIM base URL")} value={scim.baseUrl} />
          <CopyField label={t("Token (Bearer)")} value={token ?? ""} testId="scim-token" />
        </div>
      </Dialog>

      <Dialog
        open={!!stopping}
        onOpenChange={(o) => !o && setStopping(null)}
        title={stopping === "scim" ? t("Turn off provisioning?") : t("Stop syncing with the directory?")}
        description={t("People and groups stay as they are, and admins can change them by hand again. Nobody is deactivated.")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStopping(null)}>{t("Cancel")}</Button>
            <Button variant="danger" loading={stop.isPending} onClick={() => stopping && stop.mutate(stopping)}>
              {t("Turn off")}
            </Button>
          </>
        }
      />

      {editing && (
        <LdapDialog
          current={ldap.settings}
          presets={ldap.presets}
          workspaceOptions={wsOptions}
          onClose={() => setEditing(false)}
          onSaved={(info) => {
            saved(info);
            setEditing(false);
          }}
          onRemove={() => {
            setEditing(false);
            setStopping("ldap");
          }}
        />
      )}
    </Section>
  );
}

function LdapDialog({
  current,
  presets,
  workspaceOptions,
  onClose,
  onSaved,
  onRemove,
}: {
  current: LdapSettings | null;
  presets: { ad: Preset; openldap: Preset };
  workspaceOptions: React.ReactNode;
  onClose: () => void;
  onSaved: (d: DirectoryInfo) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    enabled: current?.enabled ?? true,
    url: current?.url ?? "",
    startTls: current?.startTls ?? false,
    caCert: current?.caCert ?? "",
    bindDn: current?.bindDn ?? "",
    bindPassword: "",
    userBase: current?.userBase ?? "",
    groupBase: current?.groupBase ?? "",
    intervalMinutes: current?.intervalMinutes ?? 60,
    workspaceId: current?.workspaceId ?? "",
    ...(current ?? presets.ad),
  });
  const [tested, setTested] = useState<{ ok: boolean; message?: string; people?: number; groups?: number; withoutEmail?: number; sample?: { email: string; name: string; disabled: boolean }[] } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const body = () => ({
    ...form,
    caCert: form.caCert.trim() || null,
    groupBase: form.groupBase.trim() || null,
    workspaceId: form.workspaceId || null,
    intervalMinutes: Number(form.intervalMinutes) || 60,
    bindPassword: form.bindPassword || undefined,
  });
  const test = useMutation({
    mutationFn: () => post<NonNullable<typeof tested>>("/api/admin/directory/ldap/test", body()),
    onSuccess: setTested,
    onError: (e: Error) => setTested({ ok: false, message: e.message }),
  });
  const save = useMutation({
    mutationFn: () => put<DirectoryInfo>("/api/admin/directory/ldap", body()),
    onSuccess: (d) => {
      onSaved(d);
      toast.success(t("Saved. The first sync runs within a few minutes, or use Sync now."));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const valid = form.url.trim() && form.bindDn.trim() && (form.bindPassword || current?.hasPassword) && form.userBase.trim() && form.userFilter.trim();

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("LDAP / Active Directory")}
      description={t("Aatmiq signs in with a read-only service account and reads people (and, optionally, groups).")}
      className="max-w-2xl"
      footer={
        <>
          {current && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={onRemove}>
              {t("Turn off")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="outline" disabled={!valid} loading={test.isPending} onClick={() => test.mutate()} data-testid="ldap-test">
            {t("Test")}
          </Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()} data-testid="ldap-save">
            {t("Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
          {t("Fill in for")}
          <Button variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, ...presets.ad }))}>
            Active Directory
          </Button>
          <Button variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, ...presets.openldap }))}>
            OpenLDAP
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label={t("Address")} hint={t("ldaps:// (port 636), or ldap:// with StartTLS.")}>
            <Input value={form.url} onChange={set("url")} placeholder="ldaps://dc.acme.local" className="font-mono text-[12px]" data-testid="ldap-url" />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
            <Switch checked={form.startTls} onCheckedChange={(v) => setForm((f) => ({ ...f, startTls: v }))} label="StartTLS" /> StartTLS
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Service account (bind DN)")}>
            <Input value={form.bindDn} onChange={set("bindDn")} placeholder="CN=aatmiq-sync,OU=Service,DC=acme,DC=local" className="font-mono text-[12px]" data-testid="ldap-bind-dn" />
          </Field>
          <Field label={t("Password")} hint={current?.hasPassword ? t("Saved. Leave empty to keep it.") : t("Stored encrypted on this server.")}>
            <Input type="password" value={form.bindPassword} onChange={set("bindPassword")} data-testid="ldap-password" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("People: base DN")}>
            <Input value={form.userBase} onChange={set("userBase")} placeholder="OU=Staff,DC=acme,DC=local" className="font-mono text-[12px]" data-testid="ldap-user-base" />
          </Field>
          <Field label={t("People: filter")}>
            <Input value={form.userFilter} onChange={set("userFilter")} className="font-mono text-[12px]" data-testid="ldap-user-filter" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("Email attribute")}>
            <Input value={form.emailAttr} onChange={set("emailAttr")} className="font-mono text-[12px]" />
          </Field>
          <Field label={t("Name attribute")}>
            <Input value={form.nameAttr} onChange={set("nameAttr")} className="font-mono text-[12px]" />
          </Field>
          <Field label={t("ID attribute")} hint={t("Never changes for a person.")}>
            <Input value={form.idAttr} onChange={set("idAttr")} className="font-mono text-[12px]" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Groups: base DN (optional)")} hint={t("Empty: groups aren't synced.")}>
            <Input value={form.groupBase} onChange={set("groupBase")} placeholder="OU=Groups,DC=acme,DC=local" className="font-mono text-[12px]" data-testid="ldap-group-base" />
          </Field>
          <Field label={t("Groups: filter")}>
            <Input value={form.groupFilter} onChange={set("groupFilter")} className="font-mono text-[12px]" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("Sync every")}>
            <Select value={String(form.intervalMinutes)} onChange={(e) => setForm((f) => ({ ...f, intervalMinutes: Number(e.target.value) }))}>
              {[15, 30, 60, 180, 720, 1440].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? t("{n} minutes", { n: m }) : t.n(m / 60, "{n} hour", "{n} hours")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("New people join")}>
            <Select value={form.workspaceId} onChange={set("workspaceId")}>
              {workspaceOptions}
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} label={t("Sync on schedule")} /> {t("Sync on schedule")}
          </label>
        </div>
        <Field label={t("CA certificate (optional)")} hint={t("When the directory's certificate isn't from a public authority, as with most domain controllers.")}>
          <Textarea value={form.caCert} onChange={set("caCert")} placeholder="-----BEGIN CERTIFICATE-----" className="h-20 font-mono text-[11px]" />
        </Field>
        {tested && (
          <div className={tested.ok ? "rounded-lg border border-success/40 p-3 text-[12.5px]" : "rounded-lg border border-danger/40 p-3 text-[12.5px] text-danger"} data-testid="ldap-test-result">
            {tested.ok ? (
              <>
                <div className="text-fg">
                  {t("Connected. {people} people and {groups} groups found.", { people: tested.people ?? 0, groups: tested.groups ?? 0 })}
                  {tested.withoutEmail ? ` ${t.n(tested.withoutEmail, "{n} has no email address and is left out.", "{n} have no email address and are left out.")}` : ""}
                </div>
                <ul className="mt-1 text-fg-subtle">
                  {tested.sample?.map((p) => (
                    <li key={p.email}>
                      {p.name} · {p.email}
                      {p.disabled ? ` · ${t("disabled")}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              tested.message
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
