"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleX, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { ArtOr } from "@/components/art/art";
import { useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Badge, Card, Switch } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { get, post, put } from "@/lib/api";
import { timeAgo } from "@/lib/format";

import { msg, useT } from "@/i18n";
type Level = "ok" | "warn" | "error";
interface Check {
  id: string;
  area: string;
  level: Level;
  summary: string;
  hint?: string;
}
interface Health {
  checkedAt: string;
  level: Level;
  checks: Check[];
  alerts: Record<string, { since: number; notifiedAt: number }>;
  settings: { email: boolean; mailConfigured: boolean; intervalMinutes: number };
}

const AREAS = [msg("Models"), msg("Database"), msg("Disk"), msg("Backups"), msg("Work AI"), msg("Background jobs"), msg("Security"), msg("License"), msg("Email"), msg("Directory")];

const LEVEL = {
  ok: { icon: CircleCheck, className: "text-success", tone: "success", label: msg("Working") },
  warn: { icon: CircleAlert, className: "text-warning", tone: "warning", label: msg("Needs a look") },
  error: { icon: CircleX, className: "text-danger", tone: "danger", label: msg("Not working") },
} as const;

export default function HealthPage() {
  const t = useT();
  const { me } = useSession();
  const qc = useQueryClient();
  const h = useQuery({ queryKey: ["admin-health"], queryFn: () => get<Health>("/api/admin/health"), enabled: me.isAdmin, refetchInterval: 60_000 });
  const setEmail = useMutation({
    mutationFn: (email: boolean) => put<{ email: boolean }>("/api/admin/health/settings", { email }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-health"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: () => post<{ ok: boolean; emailed: boolean }>("/api/admin/health/test-alert"),
    onSuccess: (r) => toast.success(r.emailed ? t("Test alert sent: check your notifications and your inbox") : t("Test alert sent to your notifications (email is off)")),
    onError: (e: Error) => toast.error(e.message),
  });

  const d = h.data;
  const problems = d?.checks.filter((c) => c.level !== "ok") ?? [];
  const byArea = AREAS.map((area) => ({ area, checks: d?.checks.filter((c) => c.area === area) ?? [] })).filter((a) => a.checks.length);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("Health")}
        description={t("What's working on the {productName} server, and what needs a look. Admins are told when something breaks.", { productName: me.org.productName })}
        actions={
          <Button variant="secondary" size="sm" onClick={() => h.refetch()} disabled={h.isFetching} data-testid="health-refresh">
            <RefreshCw className={h.isFetching ? "size-3.5 animate-spin" : "size-3.5"} /> {t("Check now")}
          </Button>
        }
      />

      {d ? (
        <Card className="flex items-center gap-4 p-5" data-testid="health-summary">
          {(() => {
            const L = LEVEL[d.level];
            const icon = <L.icon className={`size-8 shrink-0 ${L.className}`} />;
            return d.level === "ok" ? <ArtOr name="health-ok" className="-my-3 size-16 shrink-0" sizes="64px" fade="radial" fallback={icon} /> : icon;
          })()}
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">
              {d.level === "ok" ? t("Everything is working") : t.n(problems.length, "{n} thing needs a look", "{n} things need a look")}
            </div>
            <div className="text-xs text-fg-subtle">{d.settings.intervalMinutes
                ? t("Checked {when} · checked every {minutes} minutes", { when: timeAgo(d.checkedAt, t), minutes: d.settings.intervalMinutes })
                : t("Checked {when}", { when: timeAgo(d.checkedAt, t) })}</div>
          </div>
        </Card>
      ) : (
        <Skeleton className="h-[78px] rounded-xl" />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {d
          ? byArea.map(({ area, checks }) => (
              <Card key={area} className="p-4" data-testid={`health-${area.toLowerCase().replaceAll(" ", "-")}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium">{t(area)}</h2>
                  {(() => {
                    const worst: Level = checks.some((c) => c.level === "error") ? "error" : checks.some((c) => c.level === "warn") ? "warn" : "ok";
                    return <Badge tone={LEVEL[worst].tone}>{t(LEVEL[worst].label)}</Badge>;
                  })()}
                </div>
                <ul className="space-y-2">
                  {checks.map((c) => {
                    const L = LEVEL[c.level];
                    const open = d.alerts[c.id];
                    return (
                      <li key={c.id} className="flex gap-2 text-sm">
                        <L.icon className={`mt-0.5 size-4 shrink-0 ${L.className}`} />
                        <div className="min-w-0">
                          <div>{c.summary}</div>
                          {c.hint && c.level !== "ok" ? <div className="mt-0.5 text-xs text-fg-muted">{c.hint}</div> : null}
                          {open ? <div className="mt-0.5 text-xs text-fg-subtle">{t("Since {timeAgo} · admins told {timeAgo2}", { timeAgo: timeAgo(new Date(open.since), t), timeAgo2: timeAgo(new Date(open.notifiedAt), t) })}</div> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))
          : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)}
      </div>

      {d ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-[15px] font-medium">{t("Alerts")}</h2>
          <p className="text-sm text-fg-muted">
            {t("When something breaks (a model server stops answering, the disk fills up, a backup fails), every admin gets a notification here, then a reminder each day while it lasts, and a note when it's fixed.")}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm" data-testid="health-email-alerts">
              <Switch
                checked={d.settings.email && d.settings.mailConfigured}
                disabled={!d.settings.mailConfigured || setEmail.isPending}
                onCheckedChange={(v) => setEmail.mutate(v)}
                label={t("Also email admins")}
              />
              {t("Also email admins")}
            </label>
            <Button variant="ghost" size="sm" onClick={() => test.mutate()} disabled={test.isPending} data-testid="health-test-alert">
              <Send className="size-3.5" /> {t("Send a test alert")}
            </Button>
          </div>
          {!d.settings.mailConfigured ? (
            <p className="text-xs text-fg-subtle">
              {t("Email isn't set up, so alerts only appear in {productName}.", { productName: me.org.productName })} <Link className="underline underline-offset-2" href="/admin/settings">{t("Set up email")}</Link>
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
