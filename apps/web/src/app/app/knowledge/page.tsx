"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  Copy,
  FileText,
  FileUp,
  History,
  Library,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { TopBar } from "@/components/app/frame";
import { ModuleOff } from "@/components/app/module-off";
import { useCanUseModule, useSession } from "@/components/app/session";
import { ACCEPT } from "@/components/documents/use-documents";
import { useProjects } from "@/components/projects/projects";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Switch, Tooltip } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { msg, useT } from "@/i18n";
import { ApiError, formatBytes, get, post, put, readSse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

interface KCitation {
  n: number;
  chunkId: string;
  documentId: string;
  name: string;
  version: number;
  page: number | null;
  excerpt: string;
  scope: "project" | "general";
  label?: string | null;
  cited?: boolean;
}

interface Answer {
  queryId: string | null;
  question: string;
  text: string;
  status: "streaming" | "answered" | "not_found" | "error";
  citations: KCitation[];
  error?: string;
}

interface SourceRow {
  id: string;
  name: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  sizeBytes: number;
  pageCount: number | null;
  chunkCount: number | null;
  version: number;
  contentHash: string | null;
  supersededById: string | null;
  embedded: boolean;
  duplicateOf: string | null;
  addedAt: string;
}

interface KnowledgeProject {
  project: { id: string; name: string; color: string; workspaceId: string };
  canEdit: boolean;
  sources: SourceRow[];
  stats: { documents: number; ready: number; processing: number; failed: number; pages: number; chunks: number; superseded: number };
}

const LAST = "gem.knowledge.project";
const TABS = [
  { v: "ask", l: msg("Ask") },
  { v: "sources", l: msg("Sources") },
  { v: "history", l: msg("History") },
  { v: "references", l: msg("General references") },
] as const;
type Tab = (typeof TABS)[number]["v"];

export default function KnowledgeRoute() {
  return (
    <Suspense>
      <KnowledgePage />
    </Suspense>
  );
}

function KnowledgePage() {
  const t = useT();
  const allowed = useCanUseModule("knowledge");
  const { workspaceId } = useSession();
  const projects = useProjects(allowed ? workspaceId : "");
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ask");
  const [answer, setAnswer] = useState<Answer | null>(null);

  // The project: from the link, else the last one used here, else the first.
  const fromUrl = search.get("project");
  const list = projects.data ?? [];
  let saved: string | null = null;
  try {
    saved = typeof window !== "undefined" ? localStorage.getItem(LAST) : null;
  } catch {
    saved = null;
  }
  const projectId = (fromUrl && list.some((p) => p.id === fromUrl) ? fromUrl : null) ?? (saved && list.some((p) => p.id === saved) ? saved : null) ?? list[0]?.id ?? null;
  useEffect(() => {
    if (!projectId) return;
    try {
      localStorage.setItem(LAST, projectId);
    } catch {
      /* not kept */
    }
  }, [projectId]);
  useEffect(() => setAnswer(null), [projectId]);
  const choose = (id: string) => router.replace(`/app/knowledge?project=${id}`, { scroll: false });

  if (!allowed) return <ModuleOff />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar icon={<Library />} title={t("Knowledge")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
          <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em]">{t("Knowledge")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-fg-subtle">
            {t("Ask one project's documents. Answers use only passages you're allowed to open, cite the document, version and page, and say so when the documents don't contain the answer.")}
          </p>
          {projects.isLoading ? (
            <Skeleton className="mt-6 h-10" />
          ) : list.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<Library className="size-5" />}
              title={t("No projects yet")}
              description={t("Knowledge answers from a project's sources. Create a project and add its documents first.")}
              action={<Button asChild><Link href="/app/projects">{t("Go to Projects")}</Link></Button>}
            />
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-[12.5px] text-fg-muted">{t("Project")}</span>
                  <select value={projectId ?? ""} onChange={(e) => choose(e.target.value)} className="h-8 rounded-lg border border-border bg-surface px-2 text-[13px]">
                    {list.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist">
                  {TABS.map((x) => (
                    <button key={x.v} role="tab" aria-selected={tab === x.v} onClick={() => setTab(x.v)} className={cn("h-7 rounded-md px-3 text-[13px] transition-colors", tab === x.v ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}>
                      {t(x.l)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5">
                {projectId && tab === "ask" && <Ask projectId={projectId} answer={answer} setAnswer={setAnswer} />}
                {projectId && tab === "sources" && <Sources projectId={projectId} />}
                {projectId && tab === "history" && (
                  <HistoryList
                    projectId={projectId}
                    onOpen={(a) => {
                      setAnswer(a);
                      setTab("ask");
                    }}
                  />
                )}
                {tab === "references" && <References />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** "[2]" in the answer becomes a chip that opens the passage. */
function AnswerText({ text, citations, onCite }: { text: string; citations: KCitation[]; onCite: (n: number) => void }) {
  const ns = new Set(citations.map((c) => c.n));
  const linked = text.replace(/\[(\d{1,3})\](?!\()/g, (m, n) => (ns.has(Number(n)) ? `[${n}](#kcite-${n})` : m));
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => {
            const n = href?.startsWith("#kcite-") ? Number(href.slice(7)) : null;
            const c = n ? citations.find((x) => x.n === n) : undefined;
            if (c)
              return (
                <Tooltip content={`${c.name} · v${c.version}${c.page ? ` · p. ${c.page}` : ""}`}>
                  <button type="button" onClick={() => onCite(c.n)} className="mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[5px] border border-border-strong bg-surface-2 px-1 align-middle text-[10.5px] font-medium text-fg-muted no-underline hover:text-fg">
                    {c.n}
                  </button>
                </Tooltip>
              );
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}

function Ask({ projectId, answer, setAnswer }: { projectId: string; answer: Answer | null; setAnswer: (a: Answer | null | ((a: Answer | null) => Answer | null)) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const [general, setGeneral] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const ask = async () => {
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setAnswer({ queryId: null, question: q, text: "", status: "streaming", citations: [] });
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/knowledge/ask", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, question: q, includeGeneral: general }), signal: abort.current.signal });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new ApiError(res.status, d.error ?? t("The question couldn't be answered."), d.code);
      }
      for await (const ev of readSse(res)) {
        if (ev.event === "start") setAnswer((a) => a && { ...a, queryId: ev.data.queryId, citations: ev.data.citations });
        else if (ev.event === "delta") setAnswer((a) => a && { ...a, text: a.text + ev.data.text });
        else if (ev.event === "done") setAnswer((a) => a && { ...a, text: ev.data.answer, status: ev.data.status, citations: ev.data.citations });
        else if (ev.event === "error") setAnswer((a) => a && { ...a, status: "error", error: ev.data.message });
      }
      qc.invalidateQueries({ queryKey: ["knowledge-queries", projectId] });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAnswer((a) => a && { ...a, status: "error", error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const used = answer?.citations.filter((c) => c.cited) ?? [];
  const others = answer?.citations.filter((c) => !c.cited) ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder={t("e.g. What overtemperature problems did the 5 kW inverter have?")}
          aria-label={t("Question")}
          className="w-full resize-none bg-transparent px-1 text-[14px] outline-none placeholder:text-fg-subtle"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            <Switch checked={general} onCheckedChange={setGeneral} label={t("Include general engineering references")} />
            {t("Include general engineering references")}
          </label>
          <Button variant="primary" onClick={() => void ask()} loading={busy} disabled={question.trim().length < 3}>
            <Send className="size-3.5" /> {t("Ask")}
          </Button>
        </div>
      </div>

      {answer && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-start gap-2">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
            <p className="text-[13.5px] font-medium text-fg">{answer.question}</p>
          </div>
          {answer.status === "error" ? (
            <p className="flex items-center gap-2 text-[13px] text-danger">
              <CircleAlert className="size-4" /> {answer.error}
            </p>
          ) : answer.status === "not_found" ? (
            <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13.5px] text-fg-muted">{answer.text}</div>
          ) : answer.text ? (
            <AnswerText text={answer.text} citations={answer.citations} onCite={setOpen} />
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
              <Loader2 className="size-3.5 animate-spin" /> {t("Searching the project's documents…")}
            </p>
          )}
          {answer.status !== "streaming" && answer.status !== "not_found" && (
            <div className="mt-4 border-t border-border pt-3">
              {used.length > 0 && (
                <>
                  <div className="mb-1.5 text-[12px] font-medium text-fg-subtle uppercase">{t("Sources cited")}</div>
                  <CitationList items={used} onOpen={setOpen} />
                </>
              )}
              {others.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[12px] text-fg-subtle">{t.n(others.length, "{n} more passage was searched but not cited", "{n} more passages were searched but not cited")}</summary>
                  <div className="mt-1.5">
                    <CitationList items={others} onOpen={setOpen} />
                  </div>
                </details>
              )}
              {answer.status === "answered" && used.length === 0 && <p className="text-[12px] text-warning">{t("The answer doesn't cite a passage: check it against the sources below.")}</p>}
            </div>
          )}
        </div>
      )}
      {answer?.queryId && open !== null && <CitationDialog queryId={answer.queryId} n={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CitationList({ items, onOpen }: { items: KCitation[]; onOpen: (n: number) => void }) {
  const t = useT();
  return (
    <ul className="space-y-1">
      {items.map((c) => (
        <li key={c.n}>
          <button onClick={() => onOpen(c.n)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
            <span className="mt-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border-strong text-[10.5px] text-fg-muted">{c.n}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg">
                {c.name}
                <Badge>v{c.version}</Badge>
                {c.page && <Badge>{t("p. {page}", { page: c.page })}</Badge>}
                {c.scope === "general" && <Badge tone="accent">{t("General reference")}</Badge>}
              </span>
              <span className="line-clamp-2 text-[12px] text-fg-subtle">{c.excerpt}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CitationDialog({ queryId, n, onClose }: { queryId: string; n: number; onClose: () => void }) {
  const t = useT();
  const q = useQuery({ queryKey: ["kcite", queryId, n], queryFn: () => get<KCitation & { content: string; superseded: boolean }>(`/api/knowledge/queries/${queryId}/citations/${n}`), retry: false });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={q.data ? q.data.name : t("Source")} description={q.data ? `${t("Version {v}", { v: q.data.version })}${q.data.page ? ` · ${t("Page {page}", { page: q.data.page })}` : ""}` : undefined} className="max-w-2xl">
      {q.isLoading ? (
        <Skeleton className="h-32" />
      ) : q.isError ? (
        <p className="text-[13px] text-danger">{(q.error as Error).message}</p>
      ) : q.data ? (
        <div>
          {q.data.superseded && <p className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">{t("A newer version of this document has been uploaded since.")}</p>}
          <pre className="max-h-[60vh] overflow-y-auto rounded-lg bg-bg-subtle p-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-fg">{q.data.content}</pre>
          <button onClick={() => void navigator.clipboard?.writeText(q.data!.content)} className="mt-2 flex items-center gap-1 text-[12px] text-fg-subtle hover:text-fg">
            <Copy className="size-3.5" /> {t("Copy passage")}
          </button>
        </div>
      ) : null}
    </Dialog>
  );
}

function HistoryList({ projectId, onOpen }: { projectId: string; onOpen: (a: Answer) => void }) {
  const t = useT();
  const q = useQuery({ queryKey: ["knowledge-queries", projectId], queryFn: () => get<{ id: string; question: string; status: string; createdAt: string }[]>(`/api/knowledge/queries?projectId=${projectId}`) });
  const load = useMutation({
    mutationFn: (id: string) => get<{ id: string; question: string; answer: string; status: Answer["status"]; citations: KCitation[]; error: string | null }>(`/api/knowledge/queries/${id}`),
    onSuccess: (r) => onOpen({ queryId: r.id, question: r.question, text: r.answer, status: r.status, citations: r.citations, error: r.error ?? undefined }),
  });
  if (q.isLoading) return <Skeleton className="h-24" />;
  if (!q.data?.length) return <EmptyState icon={<History className="size-5" />} title={t("No questions yet")} description={t("Your questions in this project are kept here, with their sources.")} />;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {q.data.map((x) => (
        <button key={x.id} onClick={() => load.mutate(x.id)} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-surface-2/40">
          <Search className="size-4 shrink-0 text-fg-subtle" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{x.question}</span>
          {x.status === "not_found" && <Badge>{t("not in the documents")}</Badge>}
          {x.status === "error" && <Badge tone="danger">{t("failed")}</Badge>}
          <span className="text-[12px] text-fg-subtle">{timeAgo(x.createdAt, t)}</span>
        </button>
      ))}
    </div>
  );
}

function Sources({ projectId }: { projectId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const replace = useRef<string | null>(null);
  const [queue, setQueue] = useState<{ name: string; state: "waiting" | "uploading" | "done" | "failed"; error?: string }[]>([]);
  const k = useQuery({
    queryKey: ["knowledge-project", projectId],
    queryFn: () => get<KnowledgeProject>(`/api/knowledge/projects/${projectId}`),
    refetchInterval: (q) => (q.state.data?.stats.processing ? 2000 : false),
  });
  const reindex = useMutation({
    mutationFn: (only: "all" | "failed") => post<{ queued: number }>(`/api/knowledge/projects/${projectId}/reindex`, { only }),
    onSuccess: (r) => {
      toast(t.n(r.queued, "{n} document is being processed again", "{n} documents are being processed again"));
      qc.invalidateQueries({ queryKey: ["knowledge-project", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Many files: one after another, so a large batch doesn't overwhelm the server; failures are listed.
  const upload = async (files: File[]) => {
    const replaces = replace.current;
    replace.current = null;
    setQueue((q) => [...q, ...files.map((f) => ({ name: f.name, state: "waiting" as const }))]);
    for (const f of files) {
      setQueue((q) => q.map((x) => (x.name === f.name && x.state === "waiting" ? { ...x, state: "uploading" } : x)));
      const form = new FormData();
      if (replaces) form.append("replaces", replaces);
      form.append("file", f);
      const res = await fetch(`/api/projects/${projectId}/sources/upload`, { method: "POST", credentials: "include", body: form });
      const d = await res.json().catch(() => ({}));
      setQueue((q) => q.map((x) => (x.name === f.name && x.state === "uploading" ? { ...x, state: res.ok ? "done" : "failed", error: res.ok ? undefined : d.error } : x)));
      qc.invalidateQueries({ queryKey: ["knowledge-project", projectId] });
    }
    setTimeout(() => setQueue((q) => q.filter((x) => x.state === "failed")), 3000);
  };

  if (k.isLoading) return <Skeleton className="h-40" />;
  if (!k.data) return null;
  const { stats, sources, canEdit } = k.data;
  const current = sources.filter((s) => !s.supersededById);
  const old = sources.filter((s) => s.supersededById);
  const stat = (label: string, v: number | string, tone?: string) => (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="text-[11.5px] text-fg-subtle">{label}</div>
      <div className={cn("font-mono text-[18px] text-fg tabular-nums", tone)}>{v}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stat(t("Documents"), stats.documents)}
        {stat(t("Ready"), stats.ready)}
        {stat(t("Processing"), stats.processing)}
        {stat(t("Failed"), stats.failed, stats.failed ? "text-danger" : undefined)}
        {stat(t("Pages"), stats.pages.toLocaleString())}
        {stat(t("Passages"), stats.chunks.toLocaleString())}
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => input.current?.click()}>
            <Upload className="size-3.5" /> {t("Upload documents")}
          </Button>
          <Button onClick={() => reindex.mutate("all")} loading={reindex.isPending}>
            <RefreshCw className="size-3.5" /> {t("Reindex all")}
          </Button>
          {stats.failed > 0 && (
            <Button variant="ghost" onClick={() => reindex.mutate("failed")}>
              {t("Retry failed")}
            </Button>
          )}
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void upload(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
      )}
      {queue.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          {queue.map((x, i) => (
            <div key={`${x.name}-${i}`} className="flex items-center gap-2 border-b border-border px-4 py-2 text-[12.5px] last:border-0">
              {x.state === "uploading" ? <Loader2 className="size-3.5 animate-spin" /> : x.state === "failed" ? <CircleAlert className="size-3.5 text-danger" /> : <FileUp className="size-3.5 text-fg-subtle" />}
              <span className="flex-1 truncate">{x.name}</span>
              <span className={cn("text-fg-subtle", x.state === "failed" && "text-danger")}>{x.state === "failed" ? x.error : x.state === "done" ? t("Uploaded") : x.state === "uploading" ? t("Uploading…") : t("Waiting")}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] text-fg-subtle">{t("Clean, selectable text works best. Scanned pages go through OCR but can extract badly; keep drawings and dense tables out of the first corpus.")}</p>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {current.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title={t("No documents in this project yet")} description={canEdit ? t("Upload reports, specs, test logs and notes. Only members of this project can search them.") : undefined} />
        ) : (
          current.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <FileText className="size-4 shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13.5px] text-fg">{s.name}</span>
                  <Badge>v{s.version}</Badge>
                  {s.duplicateOf && <Badge tone="warning">{t("Duplicate of another source")}</Badge>}
                  {s.status === "ready" && !s.embedded && (
                    <Tooltip content={t("Found by keywords only: the workspace has no embedding model, or it was down.")}>
                      <span>
                        <Badge>{t("keywords only")}</Badge>
                      </span>
                    </Tooltip>
                  )}
                </div>
                <div className="text-[12px] text-fg-subtle">
                  {s.status === "processing" ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> {t("Processing…")}
                    </span>
                  ) : s.status === "failed" ? (
                    <span className="text-danger">{s.error}</span>
                  ) : (
                    <>
                      {formatBytes(s.sizeBytes)}
                      {s.pageCount ? ` · ${t.n(s.pageCount, "{n} page", "{n} pages")}` : ""}
                      {s.chunkCount ? ` · ${t.n(s.chunkCount, "{n} passage", "{n} passages")}` : ""}
                    </>
                  )}
                </div>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    replace.current = s.id;
                    input.current?.click();
                  }}
                >
                  {t("New version")}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
      {old.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[12.5px] text-fg-subtle">{t.n(old.length, "{n} older version, left out of answers", "{n} older versions, left out of answers")}</summary>
          <ul className="mt-2 space-y-1 text-[12.5px] text-fg-muted">
            {old.map((s) => (
              <li key={s.id}>
                {s.name} · v{s.version}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function References() {
  const t = useT();
  const { me, workspace, workspaceId } = useSession();
  const qc = useQueryClient();
  const canCurate = me.isAdmin || workspace?.role === "admin";
  const refs = useQuery({ queryKey: ["knowledge-refs", workspaceId], queryFn: () => get<{ id: string; name: string; status: string; pageCount: number | null; version: number }[]>(`/api/knowledge/references?workspaceId=${workspaceId}`) });
  const library = useQuery({
    queryKey: ["documents", workspaceId],
    queryFn: () => get<{ id: string; name: string; scope: string; status: string; ownerId: string | null }[]>(`/api/documents?workspaceId=${workspaceId}`),
    enabled: canCurate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: boolean }) => put(`/api/knowledge/references/${id}`, { reference }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-refs", workspaceId] });
      qc.invalidateQueries({ queryKey: ["documents", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ids = useMemo(() => new Set((refs.data ?? []).map((r) => r.id)), [refs.data]);
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-subtle">
        {t("Shared engineering references (textbooks, standards, application notes) that every member can search, when they ask with “Include general engineering references”. Project documents never appear here.")}
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {refs.isLoading ? (
          <Skeleton className="m-4 h-10" />
        ) : !refs.data?.length ? (
          <EmptyState icon={<Library className="size-5" />} title={t("No general references yet")} description={canCurate ? t("Add documents from the workspace library below.") : t("Workspace admins add them from the document library.")} />
        ) : (
          refs.data.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
              <FileText className="size-4 text-fg-subtle" />
              <span className="flex-1 truncate text-[13.5px]">{r.name}</span>
              {r.pageCount ? <span className="text-[12px] text-fg-subtle">{t.n(r.pageCount, "{n} page", "{n} pages")}</span> : null}
              {canCurate && (
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: r.id, reference: false })}>
                  {t("Remove")}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
      {canCurate && (library.data?.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-fg">{t("Add from the document library")}</h3>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-surface">
            {library.data!.filter((d) => !ids.has(d.id) && d.status === "ready").map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-0">
                <span className="flex-1 truncate text-[13px]">{d.name}</span>
                {d.scope !== "workspace" && <Badge>{t("becomes shared")}</Badge>}
                <Button size="sm" onClick={() => toggle.mutate({ id: d.id, reference: true })}>
                  {t("Add")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


