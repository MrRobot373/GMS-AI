"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, CircleX, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DailyColumns, StatTile } from "@/components/admin/charts";
import { LICENSE_STATE } from "@/components/admin/license";
import { Section } from "@/components/admin/table";
import { PageHeader } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { get } from "@/lib/api";
import { formatTokens, timeAgo } from "@/lib/format";

import { useT } from "@/i18n";
interface Overview {
  version: string;
  users: { total: number; active: number };
  workspaces: number;
  pendingRequests: number;
  tokens30d: number;
  providers: { id: string; name: string; type: string; health: { ok: boolean; latencyMs?: number; error?: string; checkedAt: string } | null }[];
  license: { status: string; tier: string | null; seats: number | null; expiresAt: string | null; message: string | null };
}

export default function AdminOverview() {
  const t = useT();
  const { me } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!me.isAdmin) router.replace("/admin/workspaces");
  }, [me.isAdmin, router]);
  const o = useQuery({ queryKey: ["admin-overview"], queryFn: () => get<Overview>("/api/admin/overview"), enabled: me.isAdmin });
  const u = useQuery({ queryKey: ["admin-usage", 30, ""], queryFn: () => get<any>("/api/admin/usage?days=30"), enabled: me.isAdmin });

  return (
    <div className="space-y-8">
      <PageHeader title={t("Overview")} description={t("How {name} is using {productName}.", { name: me.org.name, productName: me.org.productName })} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {o.data ? (
          <>
            <StatTile label={t("Active users")} value={String(o.data.users.active)} hint={t("{total} total", { total: o.data.users.total })} />
            <StatTile label={t("Workspaces")} value={String(o.data.workspaces)} />
            <StatTile label={t("Tokens, last 30 days")} value={formatTokens(o.data.tokens30d)} />
            <Link href="/admin/requests" className="block rounded-xl transition-transform hover:-translate-y-0.5">
              <StatTile label={t("Pending requests")} value={String(o.data.pendingRequests)} hint={o.data.pendingRequests ? t("Needs review →") : t("All clear")} />
            </Link>
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[98px] rounded-xl" />)
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-medium">{t("Tokens per day")}</h2>
              <p className="text-xs text-fg-subtle">{t("Last 30 days, all workspaces")}</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/usage">{t("Details")} <ArrowRight className="size-3.5" /></Link>
            </Button>
          </div>
          {u.data ? <DailyColumns data={u.data.daily} /> : <Skeleton className="h-[200px]" />}
        </Card>

        <div className="space-y-6">
          <Section title={t("Model providers")} actions={<Button asChild variant="ghost" size="sm"><Link href="/admin/models">{t("Manage")}</Link></Button>}>
            <Card className="divide-y divide-border">
              {o.data?.providers.length ? (
                o.data.providers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    {p.health?.ok ? <CircleCheck className="size-4 text-success" /> : <CircleX className="size-4 text-danger" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{p.name}</div>
                      <div className="text-xs text-fg-subtle">
                        {p.health?.checkedAt ? t("{type} · checked {when}", { type: p.type, when: timeAgo(p.health.checkedAt, t) }) : p.type}
                      </div>
                    </div>
                    {p.health?.latencyMs !== undefined && p.health.ok && <span className="text-xs text-fg-subtle tabular-nums">{t("{latencyMs}ms", { latencyMs: p.health.latencyMs })}</span>}
                  </div>
                ))
              ) : (
                <p className="px-4 py-6 text-center text-sm text-fg-subtle">{t("No providers yet.")}</p>
              )}
            </Card>
          </Section>
          <JobsCard />
          <Section title={t("License")}>
            <Link href="/admin/license" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
              <KeyRound className="size-4 text-fg-subtle" />
              <div className="min-w-0 flex-1 text-sm">
                {o.data?.license.tier
                  ? o.data.license.seats === null
                    ? t("{plan} plan", { plan: o.data.license.tier[0]!.toUpperCase() + o.data.license.tier.slice(1) })
                    : t.n(o.data.license.seats, "{plan} plan · {n} seat", "{plan} plan · {n} seats", { plan: o.data.license.tier[0]!.toUpperCase() + o.data.license.tier.slice(1) })
                  : t("Development mode")}
              </div>
              {o.data && (
                <Badge tone={LICENSE_STATE[o.data.license.status]?.tone === "neutral" ? "neutral" : (LICENSE_STATE[o.data.license.status]?.tone ?? "neutral")}>
                  {t(LICENSE_STATE[o.data.license.status]?.label ?? o.data.license.status)}
                </Badge>
              )}
            </Link>
            {o.data && (
              <p className="mt-2 px-1 text-[12px] text-fg-subtle" data-testid="app-version">
                {me.org.productName} {o.data.version}
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

interface JobsStatus {
  mode: "in-process" | "redis";
  workers: { id: string; seenAt: string }[];
  counts: { waiting: number; active: number; delayed: number; failed: number };
  stalled: boolean;
  documentsProcessing: number;
}

/** Where background jobs (document processing, housekeeping) run and whether they're keeping up. */
function JobsCard() {
  const t = useT();
  const q = useQuery({ queryKey: ["admin-jobs"], queryFn: () => get<JobsStatus>("/api/admin/jobs"), refetchInterval: 15_000 });
  const d = q.data;
  if (!d) return null;
  const ok = d.mode === "in-process" || (d.workers.length > 0 && !d.stalled);
  return (
    <Section title={t("Background jobs")}>
      <Card className="p-4" data-testid="jobs-card">
        <div className="flex items-center gap-3">
          {ok ? <CircleCheck className="size-4 text-success" /> : <CircleX className="size-4 text-danger" />}
          <div className="min-w-0 flex-1 text-sm">
            {d.mode === "in-process"
              ? t("Running inside the API")
              : d.workers.length
                ? t.n(d.workers.length, "{n} worker running", "{n} workers running")
                : t("No worker is running")}
          </div>
          <Badge>{d.mode === "redis" ? t("Redis queue") : t("Single server")}</Badge>
        </div>
        <div className="mt-2 text-xs text-fg-subtle">
          {[
            t("{active} running · {waiting} waiting", { active: d.counts.active, waiting: d.counts.waiting + d.counts.delayed }),
            d.counts.failed > 0 && t("{failed} failed recently", { failed: d.counts.failed }),
            d.documentsProcessing > 0 && t.n(d.documentsProcessing, "{n} document processing", "{n} documents processing"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {d.stalled && <p className="mt-2 text-xs text-danger">{t("Jobs are waiting but no worker is running. Start the worker service (node dist/worker.js).")}</p>}
      </Card>
    </Section>
  );
}
