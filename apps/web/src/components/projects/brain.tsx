"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Check, ChevronRight, Download, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { del, get, patch, post, put } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import type { BrainEntryView, BrainKind, BrainMode, BrainView, ProjectDetail } from "@/lib/types";
import { useT } from "@/i18n";

const KINDS: BrainKind[] = ["fact", "requirement", "decision", "question", "person", "term"];
const USUAL = ["Overview", "Requirements", "Decisions", "Design", "Components", "Testing", "Risks and issues", "Open questions", "People", "Glossary", "Schedule"];

export function useBrain(projectId: string) {
  return useQuery({ queryKey: ["brain", projectId], queryFn: () => get<BrainView>(`/api/projects/${projectId}/brain`), refetchInterval: 8000 });
}

/**
 * What the project holds true, built up from its documents, chats and tasks and given to everyone's chats and tasks in
 * the project, so everyone is working from the same facts (docs/21-project-brain.md).
 */
export function BrainSection({ project: p }: { project: ProjectDetail }) {
  const t = useT();
  const qc = useQueryClient();
  const brain = useBrain(p.id);
  const [editing, setEditing] = useState<{ entry: BrainEntryView | null; page?: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["brain", p.id] });
  const b = brain.data;

  const setMode = useMutation({
    mutationFn: (mode: BrainMode) => put(`/api/projects/${p.id}/brain/settings`, { mode }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; what: "accept" | "reject" }) => post(`/api/projects/${p.id}/brain/entries/${v.id}/${v.what}`),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/projects/${p.id}/brain/entries/${id}`),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const readNow = useMutation({
    mutationFn: () => post<{ queued: number }>(`/api/projects/${p.id}/brain/learn`),
    onSuccess: (r) => {
      toast(r.queued ? t.n(r.queued, "Reading {n} source. New entries appear here in a minute.", "Reading {n} sources. New entries appear here in a minute.") : t("Everything has been read."));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kindName: Record<BrainKind, string> = { fact: t("Fact"), requirement: t("Requirement"), decision: t("Decision"), question: t("Open question"), person: t("Person"), term: t("Term") };
  const actionName: Record<string, string> = {
    added: t("Added"),
    pending: t("Waiting for review"),
    conflict: t("Contradiction"),
    replaced: t("Replaced"),
    accepted: t("Accepted"),
    rejected: t("Turned down"),
    retired: t("Source removed"),
    edited: t("Edited"),
    deleted: t("Deleted"),
    learned: t("Read"),
  };

  const waiting = (b?.pages ?? []).flatMap((pg) => pg.entries.filter((e) => e.status === "pending").map((e) => ({ ...e, page: pg.title })));
  const empty = b && b.counts.active === 0 && waiting.length === 0;

  const entryRow = (e: BrainEntryView) => (
    <li key={e.id} className="group flex items-start gap-2 py-1.5" data-testid="brain-entry">
      <span className="mt-[3px] w-[78px] shrink-0 text-[11px] text-fg-subtle">{kindName[e.kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed text-fg">{e.text}</p>
        <p className="mt-0.5 text-[11.5px] text-fg-subtle" title={e.quote ? `“${e.quote}”` : undefined}>
          {e.sourceKind === "person" ? t("Written by {name}", { name: e.author ?? e.sourceLabel }) : t("From {source}", { source: e.sourceLabel })}
          {" · "}
          {timeAgo(e.createdAt, t)}
        </p>
      </div>
      {b?.canEdit && (
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button variant="ghost" size="icon-sm" aria-label={t("Edit")} onClick={() => setEditing({ entry: e })}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("Delete")} onClick={() => remove.mutate(e.id)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </li>
  );

  return (
    <section className="mt-8" data-testid="brain">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] text-fg">
          <Brain className="size-3.5 text-fg-subtle" aria-hidden /> {t("Project brain")}
          {b && <span className="text-fg-subtle">({b.counts.active})</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {b?.canEdit && b.mode !== "off" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing({ entry: null })} data-testid="brain-add">
                <Plus className="size-3.5" /> {t("Add")}
              </Button>
              {b.unread > 0 && (
                <Button variant="outline" size="sm" loading={readNow.isPending} onClick={() => readNow.mutate()}>
                  <RefreshCw className="size-3.5" /> {t.n(b.unread, "Read {n} new source", "Read {n} new sources")}
                </Button>
              )}
            </>
          )}
          {b && b.counts.active + waiting.length > 0 && (
            <a href={`/api/projects/${p.id}/brain/export`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] text-fg transition-colors hover:bg-surface-2">
              <Download className="size-3.5" /> {t("Export for Obsidian")}
            </a>
          )}
          {b?.canEdit && (
            <Select value={b.mode} onChange={(e) => setMode.mutate(e.target.value as BrainMode)} aria-label={t("How the brain learns")} className="h-8 w-52 text-[12.5px]" data-testid="brain-mode">
              <option value="auto">{t("Learns from the project's work")}</option>
              <option value="review">{t("Asks before adding")}</option>
              <option value="off">{t("Off")}</option>
            </Select>
          )}
        </div>
      </div>

      {!b ? (
        <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
      ) : b.mode === "off" ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-fg-subtle">
          {t("The brain is off for this project. Turn it on to keep what the project establishes in one place, the same for everyone on it.")}
        </div>
      ) : (
        <div className="space-y-3">
          {waiting.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/5 p-3.5" data-testid="brain-waiting">
              <h3 className="mb-1 text-[13px] text-fg">
                {t("Waiting for review")} <span className="text-fg-subtle">({waiting.length})</span>
              </h3>
              <p className="mb-2 text-[12px] text-fg-subtle">{t("These are not used yet. Accept what is right; turn down the rest. Anything an AI wrote in a task waits here until a person accepts it.")}</p>
              <ul className="divide-y divide-border">
                {waiting.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-relaxed text-fg">
                        <span className="mr-1.5 text-[11px] text-fg-subtle">{e.page} · {kindName[e.kind]}</span>
                        {e.text}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-fg-subtle" title={e.quote ? `“${e.quote}”` : undefined}>
                        {t("From {source}", { source: e.sourceLabel })}
                        {e.replaces && <span className="text-warning"> · {e.conflict ? t("Contradicts: {text}", { text: e.replaces }) : t("Replaces: {text}", { text: e.replaces })}</span>}
                      </p>
                    </div>
                    {b.canEdit && (
                      <div className="flex shrink-0 gap-1">
                        <Button variant="outline" size="sm" onClick={() => decide.mutate({ id: e.id, what: "accept" })} data-testid="brain-accept">
                          <Check className="size-3.5" /> {t("Accept")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => decide.mutate({ id: e.id, what: "reject" })}>
                          <X className="size-3.5" /> {t("Turn down")}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {empty ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-fg-subtle">
              {t("Nothing here yet. Add a document, chat about the project or finish a task, and what the project establishes is kept here, with where it came from. Everyone's chats and tasks in the project start from it.")}
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface" data-testid="brain-pages">
              {b.pages
                .filter((pg) => pg.entries.some((e) => e.status === "active") || pg.summary.trim())
                .map((pg) => (
                  <div key={pg.id} className="px-4 py-3">
                    <h3 className="text-[13px] font-medium text-fg">{pg.title}</h3>
                    {pg.summary.trim() && <p className="mt-0.5 text-[12.5px] text-fg-muted">{pg.summary}</p>}
                    <ul className="mt-1 divide-y divide-border/60">{pg.entries.filter((e) => e.status === "active").map(entryRow)}</ul>
                  </div>
                ))}
            </div>
          )}

          {b.history.length > 0 && (
            <details className="rounded-xl border border-border bg-surface px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-fg-muted">
                <ChevronRight className="size-3.5" aria-hidden /> {t("Replaced or turned down")} <span className="text-fg-subtle">({b.history.length})</span>
              </summary>
              <ul className="mt-2 space-y-1">
                {b.history.map((e) => (
                  <li key={e.id} className="text-[12.5px] text-fg-subtle">
                    <span className={cn("mr-1.5 rounded px-1 text-[11px]", e.status === "replaced" ? "bg-surface-2" : "bg-danger/10 text-danger")}>{e.status === "replaced" ? t("Replaced") : t("Turned down")}</span>
                    {e.text}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {b.log.length > 0 && (
            <details className="rounded-xl border border-border bg-surface px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-fg-muted">
                <ChevronRight className="size-3.5" aria-hidden /> {t("What changed")}
              </summary>
              <ul className="mt-2 space-y-1">
                {b.log.map((l) => (
                  <li key={l.id} className="text-[12.5px] text-fg-subtle">
                    <span className="mr-1.5 text-fg-muted">{actionName[l.action] ?? l.action}</span>
                    {l.detail} · {timeAgo(l.createdAt, t)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {editing && <EntryDialog project={p} entry={editing.entry} pages={[...new Set([...(b?.pages.map((x) => x.title) ?? []), ...USUAL])]} kindName={kindName} onClose={() => { setEditing(null); refresh(); }} />}
    </section>
  );
}

function EntryDialog({ project: p, entry, pages, kindName, onClose }: { project: ProjectDetail; entry: BrainEntryView | null; pages: string[]; kindName: Record<BrainKind, string>; onClose: () => void }) {
  const t = useT();
  const [page, setPage] = useState(entry ? (pages.find((x) => x === entry.pageId) ?? "") : "Requirements");
  const [kind, setKind] = useState<BrainKind>(entry?.kind ?? "fact");
  const [text, setText] = useState(entry?.text ?? "");
  const save = useMutation({
    mutationFn: () =>
      entry
        ? patch(`/api/projects/${p.id}/brain/entries/${entry.id}`, { text, kind, ...(page.trim() ? { page: page.trim() } : {}) })
        : post(`/api/projects/${p.id}/brain/entries`, { page: page.trim(), text, kind }),
    onSuccess: () => {
      toast(t("Saved"));
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={entry ? t("Edit entry") : t("Add to the brain")}
      description={t("One plain statement the whole project should hold the same way, with its number and unit.")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={text.trim().length < 8 || (!entry && !page.trim())} loading={save.isPending} onClick={() => save.mutate()}>{t("Save")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("Page")} hint={entry ? t("Leave empty to keep it where it is.") : undefined}>
          <Input value={page} onChange={(e) => setPage(e.target.value)} list="brain-pages" placeholder={t("e.g. Requirements")} />
          <datalist id="brain-pages">{pages.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label={t("Kind")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as BrainKind)}>
            {KINDS.map((k) => <option key={k} value={k}>{kindName[k]}</option>)}
          </Select>
        </Field>
        <Field label={t("Statement")}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t("e.g. Input voltage range is 36 V to 75 V.")} data-testid="brain-text" />
        </Field>
      </div>
    </Dialog>
  );
}
