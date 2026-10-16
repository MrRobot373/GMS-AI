"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConnectorsSection } from "@/components/admin/connectors";
import { Section } from "@/components/admin/table";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, Switch } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { StatTile } from "@/components/admin/charts";
import { get, post, put } from "@/lib/api";
import { cn } from "@/lib/cn";

import { msg, useT } from "@/i18n";
interface WorkSettings {
  approvals: "risky" | "always" | "never";
  searxngUrl: string | null;
  allowNetwork: boolean;
  maxConcurrentPerUser: number;
  maxRunning: number;
  idleMinutes: number;
  browser: boolean;
  browserAllowedHosts: string[];
  containerCpus: number;
  containerMemoryMb: number;
  containerNetwork: "proxy" | "none";
}
interface AdminWork {
  settings: WorkSettings;
  licensed: boolean;
  browserInstalled: boolean;
  /** "container" when the server runs each task in its own Docker container. */
  isolation: "container" | "process";
  stats: { running: number; queued: number; week: number };
}

const APPROVALS: { value: WorkSettings["approvals"]; title: string; desc: string }[] = [
  { value: "risky", title: msg("Before risky actions"), desc: msg("Deleting files, system commands, network use, and connector tools you mark below. Recommended.") },
  { value: "always", title: msg("Before every change"), desc: msg("Every command, file edit and web request waits for the person who started the task.") },
  { value: "never", title: msg("Never"), desc: msg("The agent runs freely inside its folder. Only for trusted, sandboxed setups.") },
];

export default function AdminWorkPage() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-work"], queryFn: () => get<AdminWork>("/api/admin/work") });
  const [form, setForm] = useState<WorkSettings | null>(null);
  // What's typed in the hosts box, kept as typed (the form holds the parsed list).
  const [hostsText, setHostsText] = useState<string | null>(null);
  useEffect(() => {
    if (q.data && !form) setForm(q.data.settings);
  }, [q.data, form]);

  const save = useMutation({
    mutationFn: (body: Partial<WorkSettings>) => put<WorkSettings>("/api/admin/work", body),
    onSuccess: (s) => {
      setForm(s);
      void qc.invalidateQueries({ queryKey: ["admin-work"] });
      void qc.invalidateQueries({ queryKey: ["work-info"] });
      toast.success(t("Work AI settings saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const testSearch = useMutation({
    mutationFn: (url: string) => post<{ ok: boolean; results?: number; error?: string }>("/api/admin/work/test-search", { url }),
    onSuccess: (r) => (r.ok ? toast.success(t("SearXNG works: {results} results for a test search", { results: r.results })) : toast.error(r.error ?? t("Search failed"))),
    onError: (e: Error) => toast.error(e.message),
  });
  if (!q.data || !form) return <Skeleton className="h-96 rounded-xl" />;
  const d = q.data;
  const dirty = JSON.stringify(form) !== JSON.stringify(d.settings);

  return (
    <div className="space-y-10">
      <PageHeader
        title={t("Work AI")}
        description={t("The agent that carries out tasks: it runs commands and edits files in a private folder per task, on your servers.")}
        actions={
          <Button variant="primary" size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(form)} data-testid="save-work-settings">
            {t("Save changes")}
          </Button>
        }
      />
      {!d.licensed && (
        <Card className="border-warning/40 p-4 text-[13px] text-warning">{t("Work AI isn't included in your license. Settings are kept, but nobody can start tasks until it is.")}</Card>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={t("Running now")} value={String(d.stats.running)} />
        <StatTile label={t("Queued")} value={String(d.stats.queued)} />
        <StatTile label={t("Tasks this week")} value={String(d.stats.week)} />
      </div>

      <Section title={t("Approvals")} description={t("When the agent stops and asks the person who started the task.")}>
        <div className="grid gap-3 md:grid-cols-3">
          {APPROVALS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setForm({ ...form, approvals: a.value })}
              className={cn(
                "rounded-xl border bg-surface p-4 text-left transition-colors",
                form.approvals === a.value ? "border-fg" : "border-border hover:border-border-strong",
              )}
              data-testid={`approvals-${a.value}`}
            >
              <div className="text-[13.5px] text-fg">{t(a.title)}</div>
              <p className="mt-1 text-[12.5px] leading-snug text-fg-subtle">{t(a.desc)}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("Web search")} description={t("Private search through your own SearXNG server. Queries never go to a third-party AI service.")}>
        <Card className="space-y-3 p-5">
          <Field label={t("SearXNG URL")} hint={t("For example http://searxng:8080 in the Docker stack (profile “search”). Leave empty to turn web search off.")}>
            <div className="flex gap-2">
              <Input
                value={form.searxngUrl ?? ""}
                onChange={(e) => setForm({ ...form, searxngUrl: e.target.value || null })}
                placeholder="http://searxng:8080"
                data-testid="searxng-url"
              />
              <Button variant="outline" disabled={!form.searxngUrl} loading={testSearch.isPending} onClick={() => form.searxngUrl && testSearch.mutate(form.searxngUrl)}>
                {t("Test")}
              </Button>
            </div>
          </Field>
        </Card>
      </Section>

      <Section title={t("Browser")} description={t("A real browser the agent can use for pages that need clicks, forms or JavaScript. It runs on this server, one per task.")}>
        <Card className="divide-y divide-border">
          <div className="flex items-start gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] text-fg">{t("Let the agent use a browser")}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
                {d.browserInstalled
                  ? t("It opens pages, clicks and fills in forms. Submitting a form asks the person first (with approvals before risky actions). Screenshots and downloads land in the task's files.")
                  : t("Chromium isn't installed on this server (it is in the Aatmiq Docker image; elsewhere set BROWSER_PATH).")}
              </p>
            </div>
            <Switch checked={form.browser && d.browserInstalled} disabled={!d.browserInstalled} onCheckedChange={(v) => setForm({ ...form, browser: v })} label={t("Allow the browser")} />
          </div>
          <div className="p-5">
            <Field
              label={t("Internal sites it may open")}
              hint={t("The browser can't reach your private network (intranet, databases, cloud metadata) unless a host is listed here. One per line; *.example.internal covers its subdomains.")}
            >
              <Textarea
                rows={3}
                value={hostsText ?? form.browserAllowedHosts.join("\n")}
                onChange={(e) => {
                  setHostsText(e.target.value);
                  setForm({ ...form, browserAllowedHosts: e.target.value.split(/[\s,]+/).map((h) => h.trim().toLowerCase()).filter(Boolean) });
                }}
                placeholder="intranet.acme.com\n*.wiki.acme.internal"
                className="font-mono text-[12.5px]"
                data-testid="browser-allowed-hosts"
              />
            </Field>
          </div>
        </Card>
      </Section>

      {d.isolation === "container" && (
        <Section title={t("Containers")} description={t("Each task runs in its own container with only its folder, a read-only system and these limits.")}>
          <Card className="grid gap-4 p-5 sm:grid-cols-3" data-testid="container-settings">
            <Field label={t("CPUs per task")}>
              <Input type="number" min={0.25} max={64} step={0.25} value={form.containerCpus} onChange={(e) => setForm({ ...form, containerCpus: Math.max(0.25, Math.min(64, Number(e.target.value) || 1)) })} />
            </Field>
            <Field label={t("Memory per task (MB)")}>
              <Input type="number" min={256} max={262144} step={256} value={form.containerMemoryMb} onChange={(e) => setForm({ ...form, containerMemoryMb: Math.max(256, Math.min(262144, Math.round(Number(e.target.value) || 1024))) })} />
            </Field>
            <Field label={t("Internet")} hint={t("Private addresses are refused, except the internal sites listed under Browser.")}>
              <Select value={form.containerNetwork} onChange={(e) => setForm({ ...form, containerNetwork: e.target.value as WorkSettings["containerNetwork"] })} data-testid="container-network">
                <option value="proxy">{t("Public internet, through Aatmiq")}</option>
                <option value="none">{t("None (only Aatmiq itself)")}</option>
              </Select>
            </Field>
          </Card>
        </Section>
      )}

      <Section title={t("Limits")}>
        <Card className="divide-y divide-border">
          <div className="flex items-start gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] text-fg">{t("Let commands use the network")}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
                {t("Off: commands that download, upload or connect elsewhere (pip install, curl, git clone) need approval. Web search and connectors are separate.")}
              </p>
            </div>
            <Switch checked={form.allowNetwork} onCheckedChange={(v) => setForm({ ...form, allowNetwork: v })} label={t("Allow network")} />
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label={t("Tasks working at once (organization)")} hint={t("What your model server can handle; more wait in line, oldest first.")}>
              <Input type="number" min={1} max={500} value={form.maxRunning} onChange={(e) => setForm({ ...form, maxRunning: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} data-testid="max-running" />
            </Field>
            <Field label={t("Tasks per person at once")} hint={t("More wait in a queue.")}>
              <Input type="number" min={1} max={20} value={form.maxConcurrentPerUser} onChange={(e) => setForm({ ...form, maxConcurrentPerUser: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
            </Field>
            <Field label={t("Keep a finished task ready (minutes)")} hint={t("Follow-ups within this time are instant.")}>
              <Input type="number" min={1} max={240} value={form.idleMinutes} onChange={(e) => setForm({ ...form, idleMinutes: Math.max(1, Math.min(240, Number(e.target.value) || 1)) })} />
            </Field>
          </div>
        </Card>
      </Section>

      <ConnectorsSection />
    </div>
  );
}
