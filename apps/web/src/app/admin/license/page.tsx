"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, KeyRound, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LICENSE_STATE } from "@/components/admin/license";
import { Section } from "@/components/admin/table";
import { PageHeader } from "@/components/app/page-header";
import { Art } from "@/components/art/art";
import { useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Badge, Card, Meter } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { get, post, put } from "@/lib/api";
import { timeAgo } from "@/lib/format";

import { msg, type Translate, useT } from "@/i18n";
interface LicenseSummary {
  required: boolean;
  state: string;
  canUse: boolean;
  canAdmin: boolean;
  message: string | null;
  daysLeft: number | null;
  license: {
    id: string;
    customer: string;
    tier: string;
    tierLabel: string;
    seats: number;
    sections: string[];
    features: { id: string; label: string }[];
    workspaceLimit: number | null;
    modelMode: "self" | "managed";
    issuedAt: string;
    expiresAt: string;
    checkInHours: number;
  } | null;
  seatsUsed: number;
  pendingInvites: number;
  checkIn: { instanceId: string; lastCheckInAt: string | null; lastAttemptAt: string | null; lastError: string | null; enabled: boolean } | null;
  release: { version: string; notes: string | null; url: string | null } | null;
  version: string | null;
}

const SECTION_LABEL: Record<string, string> = { chat: msg("Chat"), work: msg("Work AI"), code: msg("Code") };
/** The license's features (packages/license FEATURES), in the interface language. */
const FEATURE_LABELS: Record<string, string> = {
  sso: msg("Google and Microsoft sign-in"),
  oidc: msg("Custom single sign-on and directory sync (OpenID Connect, SAML, SCIM, LDAP)"),
  audit_export: msg("Audit log export"),
  connectors: msg("Connectors for Work AI"),
  managed_models: msg("Aatmiq-managed models"),
};
const fmt = (d: string, t: Translate) => t.date(d, { day: "numeric", month: "long", year: "numeric" });

export default function LicensePage() {
  const t = useT();
  const { me } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-license"], queryFn: () => get<LicenseSummary>("/api/admin/license") });
  const [entering, setEntering] = useState(false);
  const [key, setKey] = useState("");
  const isOwner = me.user.orgRole === "owner";

  const refresh = (data: LicenseSummary) => {
    qc.setQueryData(["admin-license"], data);
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  const install = useMutation({
    mutationFn: () => put<LicenseSummary>("/api/admin/license", { key }),
    onSuccess: (d) => {
      refresh(d);
      setEntering(false);
      setKey("");
      toast.success(t("License installed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const checkIn = useMutation({
    mutationFn: () => post<LicenseSummary & { result: { ok: boolean; error?: string } }>("/api/admin/license/check-in"),
    onSuccess: (d) => {
      refresh(d);
      if (d.result.ok) toast.success(t("Checked in with the license server"));
      else toast.error(d.result.error ?? t("Check-in failed"));
    },
  });

  if (!q.data) return <Skeleton className="h-96 rounded-xl" />;
  const d = q.data;
  const st = LICENSE_STATE[d.state] ?? { label: d.state, tone: "neutral" as const };
  const l = d.license;

  return (
    <div className="space-y-10">
      <PageHeader
        title={t("License")}
        description={t("Your plan, seats and the connection to the Aatmiq license server. Only counts are ever sent: never chats, files or names.")}
        actions={
          isOwner &&
          d.required && (
            <Button variant="primary" size="sm" onClick={() => setEntering(true)}>
              <KeyRound className="size-3.5" /> {t("Enter new key")}
            </Button>
          )
        }
      />

      {!d.required ? (
        <Card className="p-5 text-[13px] text-fg-muted">
          {t("This server runs in {mode}: no license public key is configured, so every feature is available and nothing is checked. Production installs set {variable}.", {
            mode: <span className="text-fg">{t("development mode")}</span>,
            variable: <code className="font-mono text-[12px]">LICENSE_PUBLIC_KEY</code>,
          })}
        </Card>
      ) : (
        <>
          <Card className="grid gap-6 p-5 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-serif text-[24px] leading-tight" data-testid="license-tier">
                  {l ? t("{tierLabel} plan", { tierLabel: l.tierLabel }) : t("No license")}
                </span>
                <Badge tone={st.tone === "neutral" ? "neutral" : st.tone}>{t(st.label)}</Badge>
              </div>
              {l && (
                <div className="mt-1 text-[13px] text-fg-subtle">
                  {d.daysLeft !== null && d.daysLeft <= 60 && d.daysLeft > 0
                    ? t.n(d.daysLeft, "Licensed to {customer} · valid until {date} ({n} day left)", "Licensed to {customer} · valid until {date} ({n} days left)", { customer: l.customer, date: fmt(l.expiresAt, t) })
                    : t("Licensed to {customer} · valid until {date}", { customer: l.customer, date: fmt(l.expiresAt, t) })}
                </div>
              )}
              {d.message && <p className="mt-3 text-[13px] text-warning">{d.message}</p>}
            </div>
            {!l && <Art name="license-none" className="-my-4 size-28 justify-self-center" sizes="112px" fade="radial" />}
            {l && (
              <div className="w-full min-w-56 md:w-64">
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-fg-muted">{t("Seats")}</span>
                  <span className="tabular-nums" data-testid="license-seats">
                    {d.seatsUsed} / {l.seats}
                  </span>
                </div>
                <Meter className="mt-2" value={d.seatsUsed / Math.max(1, l.seats)} />
                <div className="mt-1.5 text-[11.5px] text-fg-subtle">
                  {d.pendingInvites ? t.n(d.pendingInvites, "{n} pending invitation also reserves a seat.", "{n} pending invitations also reserve seats.") : t("Active people use a seat. Deactivated people don't.")}
                </div>
              </div>
            )}
          </Card>

          {l && (
            <Section title={t("What's included")}>
              <Card className="grid gap-0 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-4">
                  <div className="text-[12px] text-fg-subtle">{t("Sections")}</div>
                  <div className="mt-2 space-y-1.5">
                    {["chat", "work", "code"].map((s) => (
                      <div key={s} className={l.sections.includes(s) ? "flex items-center gap-2 text-[13px] text-fg" : "flex items-center gap-2 text-[13px] text-fg-subtle line-through"}>
                        <Check className={l.sections.includes(s) ? "size-3.5 text-success" : "size-3.5 opacity-0"} /> {t(SECTION_LABEL[s])}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-[12px] text-fg-subtle">{t("Features")}</div>
                  <div className="mt-2 space-y-1.5">
                    {l.features.length ? (
                      l.features.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 text-[13px] text-fg">
                          <Check className="size-3.5 text-success" /> {t(FEATURE_LABELS[f.id] ?? f.label)}
                        </div>
                      ))
                    ) : (
                      <span className="text-[13px] text-fg-subtle">{t("None")}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2 p-4 text-[13px]">
                  <div className="text-[12px] text-fg-subtle">{t("Limits")}</div>
                  <div>{l.workspaceLimit ? t.n(l.workspaceLimit, "{n} workspace", "{n} workspaces") : t("Unlimited workspaces")}</div>
                  <div>{l.modelMode === "managed" ? t("Models managed by Aatmiq") : t("Models managed by your admins")}</div>
                  <div className="text-fg-subtle">{t("Issued {issuedAt}", { issuedAt: fmt(l.issuedAt, t) })}</div>
                </div>
              </Card>
            </Section>
          )}

          <Section
            title={t("License server")}
            description={t("This server checks in about once a day. Without check-ins Aatmiq keeps working for 14 days, then shows a warning; after 30 days admin changes pause until it reconnects.")}
            actions={
              <Button variant="outline" size="sm" loading={checkIn.isPending} disabled={!d.checkIn?.enabled || !l} onClick={() => checkIn.mutate()}>
                <RefreshCw className="size-3.5" /> {t("Check in now")}
              </Button>
            }
          >
            <Card className="divide-y divide-border text-[13px]">
              <Row label={t("Last check-in")} value={d.checkIn?.lastCheckInAt ? timeAgo(d.checkIn.lastCheckInAt, t) : "Never"} testid="last-check-in" />
              {d.checkIn?.lastError && <Row label={t("Last error")} value={<span className="text-danger">{d.checkIn.lastError}</span>} />}
              <Row label={t("Check-ins")} value={d.checkIn?.enabled ? `Every ${l?.checkInHours ?? 24} hours` : "Off (air-gapped)"} />
              <Row label={t("Installation id")} value={<code className="font-mono text-[12px]">{d.checkIn?.instanceId}</code>} />
              <Row label={t("Version")} value={d.version ?? "—"} />
              {d.release && d.release.version !== d.version && (
                <Row
                  label={t("Update available")}
                  value={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{d.release.version}</Badge>
                      {d.release.notes && <span className="text-fg-muted">{d.release.notes}</span>}
                      {d.release.url && (
                        <a href={d.release.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg underline-offset-2 hover:underline">
                          {t("Release notes")} <ArrowUpRight className="size-3" />
                        </a>
                      )}
                    </span>
                  }
                />
              )}
            </Card>
          </Section>
        </>
      )}

      <Dialog
        open={entering}
        onOpenChange={setEntering}
        title={t("Enter a new license key")}
        description={t("Paste the key you received from Aatmiq. It's verified on this server.")}
        className="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEntering(false)}>{t("Cancel")}</Button>
            <Button variant="primary" disabled={key.trim().length < 20} loading={install.isPending} onClick={() => install.mutate()}>
              {t("Install key")}
            </Button>
          </>
        }
      >
        <Field label={t("License key")}>
          <Textarea value={key} onChange={(e) => setKey(e.target.value)} className="min-h-32 font-mono text-[11.5px] break-all" data-testid="license-key-input" />
        </Field>
      </Dialog>
    </div>
  );
}

function Row({ label, value, testid }: { label: string; value: React.ReactNode; testid?: string }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="w-40 shrink-0 text-fg-subtle">{label}</span>
      <span className="min-w-0 flex-1" data-testid={testid}>
        {value}
      </span>
    </div>
  );
}
