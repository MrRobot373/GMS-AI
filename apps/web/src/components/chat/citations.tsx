"use client";

import { ArrowUpRight, Download, FileText, Globe, MessageSquare, TriangleAlert, Workflow } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FileIcon } from "@/components/documents/use-documents";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";
import type { Citation, MessageWeb, SourceLabel } from "@/lib/types";
import { msg, useT } from "@/i18n";

export const LABELS: Record<SourceLabel, { text: string; hint: string; cls: string }> = {
  confirmed: { text: msg("Confirmed"), hint: msg("Checked and agreed"), cls: "text-success border-success/30" },
  assumption: { text: msg("Assumption"), hint: msg("Believed true, not confirmed yet"), cls: "text-warning border-warning/30" },
  tbd: { text: msg("TBD"), hint: msg("Still to be decided"), cls: "text-fg-muted border-border-strong" },
};

export function LabelBadge({ label, className }: { label: SourceLabel | null | undefined; className?: string }) {
  const t = useT();
  if (!label) return null;
  const l = LABELS[label];
  return (
    <span title={t(l.hint)} className={cn("inline-flex h-[18px] shrink-0 items-center rounded border px-1 text-[10.5px] leading-none", l.cls, className)}>
      {t(l.text)}
    </span>
  );
}

/** A web source's link, only when it's http(s) (it came from the search provider, never from a model). */
export function webHref(url: string | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/** "docs.example.org" for a web source. */
export function domainOf(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** Turn "[2]" markers that match real sources into links the Markdown renderer shows as chips. */
export function linkCitations(text: string, citations: Citation[] | null | undefined): string {
  if (!citations?.length) return text;
  const ns = new Set(citations.map((c) => c.n));
  return text.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => (ns.has(Number(n)) ? `[${n}](#cite-${n})` : m));
}

const CHIP =
  "mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[5px] border border-border-strong bg-surface-2 px-1 align-middle font-sans text-[10.5px] font-medium text-fg-muted no-underline transition-colors hover:border-fg-subtle hover:text-fg";

export function CitationChip({ citation, onOpen }: { citation: Citation; onOpen: (c: Citation) => void }) {
  const t = useT();
  // A web source opens its page in a new tab (the ! beats the answer's own link style).
  if (citation.kind === "web") {
    return (
      <Tooltip
        content={
          <span className="block max-w-64">
            <span className="block text-fg">{citation.name}</span>
            <span className="text-fg-subtle">{domainOf(citation.url)}</span>
          </span>
        }
      >
        <a href={webHref(citation.url)} target="_blank" rel="noopener noreferrer" data-cite={citation.n} className={cn(CHIP, "!text-fg-muted !no-underline hover:!text-fg")}>
          {citation.n}
        </a>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      content={
        <span className="block max-w-64">
          <span className="block text-fg">{citation.kind === "chat" ? t("Earlier chat: {name}", { name: citation.name }) : citation.name}</span>
          {citation.page && <span className="text-fg-subtle">{t("Page {page}", { page: citation.page })}</span>}
        </span>
      }
    >
      <button type="button" data-cite={citation.n} onClick={() => onOpen(citation)} className={CHIP}>
        {citation.n}
      </button>
    </Tooltip>
  );
}

/** A web source in a sources row: its title and site, opening the page in a new tab. */
function WebSourceChip({ c }: { c: Citation }) {
  return (
    <a
      href={webHref(c.url)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${c.name}\n${c.url ?? ""}`}
      data-testid="web-source"
      className="inline-flex h-7 max-w-80 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[12.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
    >
      <span className="text-[11px] text-fg-subtle">{c.n}</span>
      <Globe className="size-3.5 shrink-0 text-fg-subtle" />
      <span className="truncate">{c.name}</span>
      <span className="shrink-0 text-[11.5px] text-fg-subtle">{domainOf(c.url)}</span>
    </a>
  );
}

export function SourcesRow({ citations, onOpen }: { citations: Citation[]; onOpen: (c: Citation) => void }) {
  const t = useT();
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[12px] text-fg-subtle">{t("Sources")}</div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c) =>
          c.kind === "web" ? (
            <WebSourceChip key={c.n} c={c} />
          ) : (
            <button
              key={c.n}
              type="button"
              onClick={() => onOpen(c)}
              className="inline-flex h-7 max-w-64 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[12.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              <span className="text-[11px] text-fg-subtle">{c.n}</span>
              {c.kind === "chat" ? (
                <MessageSquare className="size-3.5 shrink-0 text-fg-subtle" />
              ) : c.kind === "task" ? (
                <Workflow className="size-3.5 shrink-0 text-fg-subtle" />
              ) : (
                <FileIcon name={c.name} className="size-3.5" />
              )}
              <span className="truncate">{c.name}</span>
              {c.page && <span className="shrink-0 text-fg-subtle">p.{c.page}</span>}
              <LabelBadge label={c.label} />
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Above an answer that searched the web: what's being looked up, then what was searched, with the
 * sources as chips while the answer is written (after that they're in the sources row), or why
 * there are none.
 */
export function WebSearchLine({ web, citations, streaming }: { web: MessageWeb & { searching?: boolean }; citations?: Citation[] | null; streaming?: boolean }) {
  const t = useT();
  const sources = (citations ?? []).filter((c) => c.kind === "web");
  const queries = web.queries.join(" · ");
  if (web.searching && streaming) {
    return (
      <div className="mb-3 flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-subtle" data-testid="web-searching">
        <Globe className="size-3.5 shrink-0 animate-pulse" />
        <span className="shrink-0">{t("Searching the web…")}</span>
        {queries && <span className="truncate text-fg-muted" title={queries}>{queries}</span>}
      </div>
    );
  }
  if (!web.queries.length && !web.note) return null;
  return (
    <div className="mb-3 space-y-2" data-testid="web-search">
      {web.queries.length > 0 && (
        <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-subtle">
          <Globe className="size-3.5 shrink-0" />
          <span className="shrink-0">{t("Searched the web")}</span>
          <span className="truncate text-fg-muted" title={queries}>{queries}</span>
        </div>
      )}
      {streaming && sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((c) => (
            <a
              key={c.n}
              href={webHref(c.url)}
              target="_blank"
              rel="noopener noreferrer"
              title={c.name}
              className="inline-flex h-6 max-w-56 items-center gap-1 rounded-md border border-border bg-surface px-1.5 text-[11.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              <span className="text-fg-subtle">{c.n}</span>
              <span className="truncate">{domainOf(c.url)}</span>
            </a>
          ))}
        </div>
      )}
      {web.note && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-fg-muted" data-testid="web-note">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>{web.note}</span>
        </div>
      )}
    </div>
  );
}

export function useSourceDialog() {
  const t = useT();
  const [open, setOpen] = useState<Citation | null>(null);
  const dialog = (
    <Dialog
      open={!!open}
      onOpenChange={(o) => !o && setOpen(null)}
      className="max-w-xl"
      title={
        <span className="flex items-center gap-2">
          {open?.kind === "chat" ? (
            <MessageSquare className="size-4 text-fg-subtle" />
          ) : open?.kind === "task" ? (
            <Workflow className="size-4 text-fg-subtle" />
          ) : open?.kind === "web" ? (
            <Globe className="size-4 text-fg-subtle" />
          ) : (
            <FileText className="size-4 text-fg-subtle" />
          )}
          {open?.name}
          <LabelBadge label={open?.label} />
        </span>
      }
      description={
        open
          ? open.kind === "chat"
            ? t("Source {n} · earlier chat in this project", { n: open.n })
            : open.kind === "task"
              ? t("Source {n} · Work AI task in this project", { n: open.n })
              : open.kind === "web"
                ? t("Source {n} · {domain}", { n: open.n, domain: domainOf(open.url) })
                : open.page
                ? t("Source {n} · page {page}", { n: open.n, page: open.page })
                : t("Source {n}", { n: open.n })
          : undefined
      }
      footer={
        open?.kind === "chat" ? (
          <Button variant="outline" asChild>
            <Link href={`/app/chat/${open.chatId}`} onClick={() => setOpen(null)}>
              <MessageSquare className="size-3.5" /> {t("Open chat")}
            </Link>
          </Button>
        ) : open?.kind === "task" ? (
          <Button variant="outline" asChild>
            <Link href={`/app/work/${open.taskId}`} onClick={() => setOpen(null)}>
              <Workflow className="size-3.5" /> {t("Open task")}
            </Link>
          </Button>
        ) : open?.kind === "web" ? (
          <Button variant="outline" asChild>
            <a href={webHref(open.url)} target="_blank" rel="noopener noreferrer">
              <ArrowUpRight className="size-3.5" /> {t("Open page")}
            </a>
          </Button>
        ) : (
          <Button variant="outline" onClick={() => open && (window.location.href = `/api/documents/${open.documentId}/file`)}>
            <Download className="size-3.5" /> {t("Download document")}
          </Button>
        )
      }
    >
      <blockquote className="max-h-80 overflow-y-auto rounded-lg border border-border bg-bg px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">
        {open?.snippet}
        {open && open.snippet.length >= 700 ? "…" : ""}
      </blockquote>
    </Dialog>
  );
  return { openSource: setOpen, sourceDialog: dialog };
}
