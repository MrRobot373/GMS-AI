"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Meter } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { get, put } from "@/lib/api";
import { formatTokens } from "@/lib/format";
import type { ProjectBudget, ProjectDetail } from "@/lib/types";
import { msg, useT } from "@/i18n";

const PERIOD = { day: msg("today"), week: msg("this week"), month: msg("this month") } as const;

/** "2M", "500k", "1,000,000" → tokens; "" → null (no limit); anything else → NaN. */
export function parseTokens(v: string): number | null {
  const s = v.trim().toLowerCase().replace(/[,_\s]/g, "");
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(s);
  if (!m) return NaN;
  return Math.round(Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
}

/**
 * The project's own budget and what its people used this period, split into Chat AI and Work AI
 * (docs/03-projects.md, "Project budget"). It applies on top of the workspace's budget.
 */
export function BudgetSection({ project: p }: { project: ProjectDetail }) {
  const t = useT();
  const q = useQuery({ queryKey: ["project-budget", p.id], queryFn: () => get<ProjectBudget>(`/api/projects/${p.id}/budget`) });
  const [editing, setEditing] = useState<"project" | { userId: string; name: string; override: number | null } | null>(null);
  const b = q.data;
  if (!b) return null;
  const hasBudget = b.tokenLimit !== null || b.memberTokenLimit !== null || b.people.some((x) => x.override !== null);
  // Nothing set and nothing to manage: the section would only say "no budget".
  if (!hasBudget && !b.canManage && b.used.total === 0) return null;
  const period = t(PERIOD[b.period]);
  const split = (u: ProjectBudget["used"]) =>
    t("Chat AI {chat} · Work AI {work}", { chat: formatTokens(u.chat), work: formatTokens(u.work) }) + (u.other ? ` · ${t("other {n}", { n: formatTokens(u.other) })}` : "");

  return (
    <section className="mt-8" data-testid="project-budget">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] text-fg">
          <Gauge className="size-3.5 text-fg-subtle" aria-hidden /> {t("Budget")}
        </h2>
        {b.canManage && (
          <Button variant="outline" size="sm" onClick={() => setEditing("project")} data-testid="project-budget-edit">
            <Pencil className="size-3.5" /> {hasBudget ? t("Change") : t("Set a budget")}
          </Button>
        )}
      </div>
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
          <span className="text-fg">
            {b.tokenLimit !== null
              ? t("{used} of {limit} tokens used {period}", { used: formatTokens(b.used.total), limit: formatTokens(b.tokenLimit), period })
              : t("{used} tokens used {period}", { used: formatTokens(b.used.total), period })}
          </span>
          <span className="text-[12px] text-fg-subtle">{t("Resets {date}", { date: t.date(b.resetsAt, { month: "short", day: "numeric" }) })}</span>
        </div>
        {b.tokenLimit !== null && <Meter className="mt-2" value={b.used.total / Math.max(1, b.tokenLimit)} />}
        <p className="mt-1.5 text-[12px] text-fg-subtle">{split(b.used)}</p>
        <p className="mt-1 text-[12px] text-fg-subtle">
          {!hasBudget
            ? t("No project budget: only the workspace's budget applies.")
            : b.perPerson !== null
              ? t("Each person: {n} tokens {period}, unless set below. The workspace's budget applies as well.", { n: formatTokens(b.perPerson), period })
              : t("No limit per person. The workspace's budget applies as well.")}
        </p>

        {b.people.length > 0 && (
          <div className="mt-3 divide-y divide-border border-t border-border">
            {b.people.map((x) => (
              <div key={x.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate text-fg">{x.name}</span>
                <span className="text-fg-subtle">{split(x.used)}</span>
                <span className="w-40 text-right tabular-nums text-fg-muted">
                  {x.allowance !== null ? t("{used} / {limit}", { used: formatTokens(x.used.total), limit: formatTokens(x.allowance) }) : formatTokens(x.used.total)}
                  {x.override !== null && <span className="text-fg-subtle"> {t("(own)")}</span>}
                </span>
                {b.canManage && x.userId !== p.ownerId && (
                  <Button variant="ghost" size="icon-sm" aria-label={t("Set {name}'s share", { name: x.name })} onClick={() => setEditing({ userId: x.userId, name: x.name, override: x.override })}>
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {editing === "project" && <ProjectBudgetDialog project={p} budget={b} onClose={() => setEditing(null)} />}
      {editing && editing !== "project" && <PersonShareDialog project={p} person={editing} perPerson={b.perPerson} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ProjectBudgetDialog({ project: p, budget: b, onClose }: { project: ProjectDetail; budget: ProjectBudget; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [total, setTotal] = useState(b.tokenLimit === null ? "" : String(b.tokenLimit));
  const [each, setEach] = useState(b.memberTokenLimit === null ? "" : String(b.memberTokenLimit));
  const save = useMutation({
    mutationFn: () => put(`/api/projects/${p.id}/budget`, { tokenLimit: parseTokens(total), memberTokenLimit: parseTokens(each) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-budget", p.id] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const bad = Number.isNaN(parseTokens(total)) || Number.isNaN(parseTokens(each));
  const period = t(PERIOD[b.period]);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("Project budget")}
      description={t("Tokens this project may use {period}, on top of the workspace's budget: a call must fit both. Leave a field empty for no limit. You can write 2M or 500k.", { period })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" disabled={bad} loading={save.isPending} onClick={() => save.mutate()}>
            {t("Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("For the whole project")}>
          <Input value={total} onChange={(e) => setTotal(e.target.value)} placeholder={t("No limit")} inputMode="numeric" data-testid="project-budget-total" />
        </Field>
        <Field label={t("For each person")} hint={t("Empty: the project's total split evenly among its people.")}>
          <Input value={each} onChange={(e) => setEach(e.target.value)} placeholder={t("Even split")} inputMode="numeric" />
        </Field>
      </div>
    </Dialog>
  );
}

function PersonShareDialog({ project: p, person, perPerson, onClose }: { project: ProjectDetail; person: { userId: string; name: string; override: number | null }; perPerson: number | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [value, setValue] = useState(person.override === null ? "" : String(person.override));
  const save = useMutation({
    mutationFn: () => put(`/api/projects/${p.id}/budget/people/${person.userId}`, { tokenLimit: parseTokens(value) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-budget", p.id] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("{name}'s share", { name: person.name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" disabled={Number.isNaN(parseTokens(value))} loading={save.isPending} onClick={() => save.mutate()}>
            {t("Save")}
          </Button>
        </>
      }
    >
      <Field
        label={t("Tokens")}
        hint={perPerson !== null ? t("Empty: the project's amount for each person ({n}).", { n: formatTokens(perPerson) }) : t("Empty: no limit of their own.")}
      >
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" />
      </Field>
    </Dialog>
  );
}
