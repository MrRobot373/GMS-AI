"use client";

import { ArrowUpRight, Brain, Calculator, ChevronDown, ChevronRight, Download, FileText, FolderSearch, Globe, MessageSquare, Plug, ShieldAlert, Terminal, TriangleAlert, Workflow, Wrench } from "lucide-react";
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
/** A tool the model used while preparing an answer (see the "step" events of POST /api/chats/:id/messages). */
export interface ToolStep {
  tool: string;
  detail: string;
  /** A number of results, "0", "failed", "off", "empty" or "limit". */
  outcome?: string;
  /** Why it didn't work. */
  why?: string;
  running?: boolean;
}

/** The model's thinking: open while it thinks, folded once the answer starts (click to read it). */
export function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? live;
  return (
    <div className="mb-3" data-testid="thinking-block">
      <button type="button" onClick={() => setOpen(!shown)} className="flex items-center gap-1.5 text-[12.5px] text-fg-subtle hover:text-fg-muted" aria-expanded={shown}>
        <Brain className={cn("size-3.5", live && "animate-pulse")} />
        {live ? t("Thinking") : t("Thought process")}
        {shown ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
      {shown && (
        <div className="mt-1.5 max-h-72 overflow-y-auto border-l-2 border-border pl-3 text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-subtle italic">
          {live ? text.slice(-4000) : text}
        </div>
      )}
    </div>
  );
}

/**
 * Whether an answer that used the web was checked against a page: no page read (or none worked) means its figures
 * come from search snippets or the model's memory, and the person is told so.
 */
export function webCheck(steps: ToolStep[] | undefined): "unchecked" | "search-failed" | null {
  const web = (steps ?? []).filter((x) => x.tool === "web_search" || x.tool === "read_page");
  if (!web.length) return null;
  const searched = web.filter((x) => x.tool === "web_search");
  if (searched.length && searched.every((x) => x.outcome === "failed" || x.outcome === "off" || x.outcome === "limit")) return "search-failed";
  const read = web.some((x) => x.tool === "read_page" && !x.running && !["failed", "off", "empty", "limit"].includes(x.outcome ?? ""));
  return read ? null : "unchecked";
}

export function UncheckedNote({ kind }: { kind: "unchecked" | "search-failed" }) {
  const t = useT();
  return (
    <p className="mt-3 flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-[12.5px] text-warning" data-testid="unchecked-note">
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
      {kind === "search-failed"
        ? t("Web search didn't work for this answer, so it comes from the model's own knowledge. Check figures before you rely on them.")
        : t("No web page was read for this answer: figures come from search snippets or the model's memory and aren't verified.")}
    </p>
  );
}

/** The steps an answer took: searches, pages read, documents searched, calculators run. */
export function ToolSteps({ steps }: { steps: ToolStep[] }) {
  const t = useT();
  const line = (x: ToolStep) => {
    const n = x.outcome && /^\d+$/.test(x.outcome) ? Number(x.outcome) : null;
    const failed = x.outcome === "failed" || x.outcome === "off" || x.outcome === "empty";
    switch (x.tool) {
      case "web_search":
        return {
          icon: Globe,
          label: x.running
            ? t("Searching the web")
            : x.outcome === "limit"
              ? t("Search limit reached, not searched")
              : n !== null
                ? t.n(n, "Searched the web · {n} result", "Searched the web · {n} results")
                : failed
                  ? t("Web search didn't work")
                  : t("Searched the web"),
        };
      case "read_page":
        return { icon: FileText, label: x.running ? t("Reading") : x.outcome === "limit" ? t("Page limit reached, not read") : failed ? t("Couldn't read") : t("Read") };
      case "search_documents":
        return {
          icon: FolderSearch,
          label: x.running ? t("Searching your documents") : n !== null ? t.n(n, "Searched your documents · {n} passage", "Searched your documents · {n} passages") : t("Searched your documents"),
        };
      case "run_python":
        return {
          icon: Terminal,
          label: x.running
            ? t("Running Python")
            : x.outcome === "timeout"
              ? t("Python ran out of time")
              : x.outcome === "failed"
                ? t("Python stopped with an error")
                : x.outcome === "off"
                  ? t("Python isn't available")
                  : t("Ran Python"),
        };
      case "connector":
        return {
          icon: Plug,
          label: x.running
            ? t("Using")
            : x.outcome === "declined"
              ? t("Not approved")
              : x.outcome === "expired"
                ? t("Not approved in time")
                : x.outcome === "failed"
                  ? t("Didn't work")
                  : t("Used"),
        };
      case "calculators_search":
        return { icon: Calculator, label: x.running ? t("Finding a calculator") : t("Looked for a calculator") };
      case "calculators_run":
        return { icon: Calculator, label: x.running ? t("Calculating") : failed ? t("The calculation didn't work") : t("Calculated") };
      default:
        return { icon: Wrench, label: x.tool };
    }
  };
  return (
    <ol className="mb-3 space-y-1" data-testid="tool-steps">
      {steps.map((x, i) => {
        const { icon: Icon, label } = line(x);
        const bad = !x.running && ["failed", "off", "empty", "limit", "0", "timeout"].includes(x.outcome ?? "");
        return (
          <li key={i} className="text-[12.5px] text-fg-subtle" data-tool={x.tool}>
            <div className="flex min-w-0 items-center gap-1.5">
              <Icon className={cn("size-3.5 shrink-0", x.running && "animate-pulse", bad && "text-warning")} />
              <span className={cn("shrink-0", bad && "text-warning")}>{label}</span>
              {x.detail && (
                <span className="truncate text-fg-muted" title={x.detail}>
                  {x.detail}
                </span>
              )}
            </div>
            {x.why && <div className="pl-5 text-[11.5px] text-fg-subtle">{x.why}</div>}
          </li>
        );
      })}
    </ol>
  );
}

/** A connected app's action waiting for the person in the chat. */
export interface PendingApproval {
  id: string;
  connector: string;
  tool: string;
  description: string;
  args: Record<string, unknown>;
}

/** What the action will send, as plain lines (long values shortened). */
function argLines(args: Record<string, unknown>): [string, string][] {
  return Object.entries(args)
    .slice(0, 12)
    .map(([k, v]) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return [k, s.length > 400 ? `${s.slice(0, 400)}…` : s];
    });
}

/** Approve or decline a connected app's action (sending an email, creating an event…) before it runs. */
export function ApprovalCard({ chatId, approval }: { chatId: string; approval: PendingApproval }) {
  const t = useT();
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const decide = async (approve: boolean) => {
    setBusy(approve ? "approve" : "decline");
    const r = await fetch(`/api/chats/${chatId}/approvals/${approval.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve }),
    }).catch(() => null);
    if (!r?.ok) setBusy(null);
  };
  return (
    <div className="mb-3 rounded-xl border border-warning/40 bg-surface p-3" data-testid="chat-approval">
      <div className="flex items-center gap-2 text-[13px] text-fg">
        <Plug className="size-3.5 text-warning" />
        {t("{app} wants to: {action}", { app: approval.connector, action: approval.tool })}
      </div>
      {approval.description && <p className="mt-1 text-[12px] text-fg-subtle">{approval.description}</p>}
      {argLines(approval.args).length > 0 && (
        <dl className="mt-2 space-y-1 rounded-lg bg-surface-2 p-2 text-[12px]">
          {argLines(approval.args).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-24 shrink-0 text-fg-subtle">{k}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="primary" loading={busy === "approve"} disabled={!!busy} onClick={() => decide(true)} data-testid="chat-approve">
          {t("Approve")}
        </Button>
        <Button size="sm" variant="outline" loading={busy === "decline"} disabled={!!busy} onClick={() => decide(false)}>
          {t("Decline")}
        </Button>
      </div>
    </div>
  );
}

const formatSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Files Python made for an answer, in the chat's folder: pictures shown, everything downloadable. */
export function ChatFiles({ chatId, files }: { chatId: string; files: { path: string; size: number }[] }) {
  const t = useT();
  const href = (path: string, download = false) => `/api/chats/${chatId}/files/content?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
  const images = files.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.path));
  return (
    <div className="mb-3 space-y-2" data-testid="chat-files">
      {images.slice(0, 4).map((f) => (
        // eslint-disable-next-line @next/next/no-img-element -- a file in the chat's folder, served by the API
        <img key={f.path} src={href(f.path)} alt={f.path} className="max-h-80 rounded-lg border border-border bg-white" loading="lazy" />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <a
            key={f.path}
            href={href(f.path, true)}
            download={f.path.split("/").pop()}
            title={t("Download {name}", { name: f.path })}
            className="inline-flex h-8 max-w-72 items-center gap-1.5 rounded-lg border border-border bg-surface px-2 text-[12.5px] text-fg transition-colors hover:border-border-strong"
          >
            <FileIcon name={f.path} className="size-3.5 shrink-0 text-fg-subtle" />
            <span className="truncate">{f.path.split("/").pop()}</span>
            <span className="shrink-0 text-[11px] text-fg-subtle">{formatSize(f.size)}</span>
            <Download className="size-3 shrink-0 text-fg-subtle" />
          </a>
        ))}
      </div>
    </div>
  );
}

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
