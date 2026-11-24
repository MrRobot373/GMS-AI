"use client";

/**
 * The task's files, open side by side with the conversation: tabs for open files, a path bar, the file shown as what it
 * is (code with line numbers and colours, Markdown read or raw, a web page running in a sealed frame, a CSV as a table,
 * images and PDFs), and the folder tree with a filter.
 */
import { useQuery } from "@tanstack/react-query";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { common, createLowlight } from "lowlight";
import { ChevronDown, ChevronRight, Code2, Copy, Download, Eye, Folder, FolderOpen, ListTree, Maximize2, Minimize2, Search, X } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toast } from "sonner";
import { Markdown } from "@/components/chat/markdown";
import { FileIcon } from "@/components/documents/use-documents";
import { Tooltip } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import type { WorkFile } from "@/lib/work";
import { useT } from "@/i18n";

const lowlight = createLowlight(common);

/** Languages by file extension (highlight.js names; the "common" set). */
const LANG: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", c: "c", h: "c", cpp: "cpp", hpp: "cpp",
  cs: "csharp", php: "php", swift: "swift", sh: "bash", bash: "bash", ps1: "powershell", sql: "sql", json: "json",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", xml: "xml", html: "xml", htm: "xml", svg: "xml", vue: "xml",
  css: "css", scss: "scss", md: "markdown", diff: "diff", r: "r", lua: "lua", pl: "perl", makefile: "makefile",
};
const ext = (path: string) => (path.split("/").pop() ?? "").toLowerCase().split(".").pop() ?? "";
const TEXT = /\.(txt|md|markdown|csv|tsv|json|log|py|js|mjs|cjs|ts|tsx|jsx|html?|css|scss|svg|ya?ml|sh|bash|ps1|sql|xml|toml|ini|env|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|swift|r|lua|pl|vue|diff|gitignore)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
/** Over this, a text file is offered as a download instead (the page would crawl). */
const MAX_TEXT = 2_000_000;
/** Lines coloured at most (beyond, plain text: colouring a huge file blocks the page). */
const MAX_HIGHLIGHT = 4_000;

export type ViewMode = "preview" | "code";
/** Files that have a read view as well as their source. */
const hasPreview = (path: string) => /\.(md|markdown|html?|csv|tsv|svg)$/i.test(path);

const contentUrl = (taskId: string, path: string) => `/api/work/tasks/${taskId}/files/content?path=${encodeURIComponent(path)}`;

export function FileViewer({
  taskId,
  files,
  open,
  active,
  onActivate,
  onClose,
  onCloseAll,
  expanded,
  onToggleExpand,
  onSave,
}: {
  taskId: string;
  files?: WorkFile[];
  /** Paths of the open tabs, and the one shown. */
  open: string[];
  active: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onCloseAll: () => void;
  /** Over the conversation (wide), or beside it. */
  expanded: boolean;
  onToggleExpand: () => void;
  onSave?: (f: WorkFile) => void;
}) {
  const t = useT();
  const [tree, setTree] = useState(true);
  const [modes, setModes] = useState<Record<string, ViewMode>>({});
  const file = files?.find((f) => f.path === active) ?? (active ? { path: active, size: 0, modifiedAt: new Date().toISOString() } : null);
  const mode: ViewMode = active && hasPreview(active) ? (modes[active] ?? "preview") : "code";

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="file-viewer">
      {/* Tabs */}
      <div className="flex h-10 shrink-0 items-stretch border-b border-border">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist">
          {open.map((p) => (
            <div
              key={p}
              role="tab"
              aria-selected={p === active}
              className={cn(
                "group flex max-w-52 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border pr-1 pl-3 text-[12.5px]",
                p === active ? "bg-surface text-fg" : "text-fg-subtle hover:bg-surface-2/60 hover:text-fg-muted",
              )}
              onClick={() => onActivate(p)}
              title={p}
            >
              <FileIcon name={p} className="size-3.5 shrink-0" />
              <span className="truncate">{p.split("/").pop()}</span>
              <button
                type="button"
                aria-label={t("Close {path}", { path: p })}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(p);
                }}
                className={cn("rounded p-0.5 hover:bg-surface-2 hover:text-fg", p === active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 px-1.5">
          <IconButton label={tree ? t("Hide the file tree") : t("Show the file tree")} onClick={() => setTree((v) => !v)} active={tree}>
            <ListTree className="size-3.5" />
          </IconButton>
          <IconButton label={expanded ? t("Show beside the conversation") : t("Widen over the conversation")} onClick={onToggleExpand}>
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </IconButton>
          <IconButton label={t("Close the files")} onClick={onCloseAll}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {file ? (
            <>
              {/* Path and actions */}
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
                <div className="flex min-w-0 flex-1 items-center gap-1 truncate text-[12px] text-fg-subtle" title={file.path}>
                  {file.path.split("/").map((part, i, all) => (
                    <Fragment key={i}>
                      {i > 0 && <span className="text-fg-subtle/60">/</span>}
                      <span className={cn("truncate", i === all.length - 1 && "text-fg")}>{part}</span>
                    </Fragment>
                  ))}
                  {file.size > 0 && <span className="ml-2 shrink-0 tabular-nums">{formatBytes(file.size)} · {timeAgo(file.modifiedAt, t)}</span>}
                </div>
                {hasPreview(file.path) && (
                  <div className="flex shrink-0 rounded-md border border-border p-px" role="group" aria-label={t("View")}>
                    {(["preview", "code"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModes((x) => ({ ...x, [file.path]: m }))}
                        className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px]", mode === m ? "bg-surface-2 text-fg" : "text-fg-subtle hover:text-fg")}
                        aria-pressed={mode === m}
                        data-testid={`view-${m}`}
                      >
                        {m === "preview" ? <Eye className="size-3" /> : <Code2 className="size-3" />} {m === "preview" ? t("Preview") : t("Code")}
                      </button>
                    ))}
                  </div>
                )}
                {TEXT.test(file.path) && <CopyButton taskId={taskId} path={file.path} />}
                {onSave && !file.path.startsWith("project/") && (
                  <button type="button" onClick={() => onSave(file)} className="shrink-0 rounded px-1.5 py-0.5 text-[11.5px] text-fg-subtle hover:bg-surface-2 hover:text-fg">
                    {t("Save to the project")}
                  </button>
                )}
                <Tooltip content={t("Download")}>
                  <a href={`${contentUrl(taskId, file.path)}&download=1`} aria-label={t("Download {path}", { path: file.path })} className="shrink-0 rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg">
                    <Download className="size-3.5" />
                  </a>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <FileBody taskId={taskId} file={file} mode={mode} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-fg-subtle">{t("Pick a file in the tree to open it.")}</div>
          )}
        </div>
        {tree && (
          <div className="hidden w-60 shrink-0 flex-col border-l border-border sm:flex">
            <FileTree files={files} active={active} onOpen={onActivate} />
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <Tooltip content={label}>
      <button type="button" aria-label={label} onClick={onClick} className={cn("rounded p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg", active && "text-fg")}>
        {children}
      </button>
    </Tooltip>
  );
}

function CopyButton({ taskId, path }: { taskId: string; path: string }) {
  const t = useT();
  const text = useFileText(taskId, path, true);
  return (
    <Tooltip content={t("Copy")}>
      <button
        type="button"
        aria-label={t("Copy {path}", { path })}
        disabled={text.data === undefined}
        onClick={() => void navigator.clipboard.writeText(text.data ?? "").then(() => toast(t("Copied")))}
        className="shrink-0 rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40"
      >
        <Copy className="size-3.5" />
      </button>
    </Tooltip>
  );
}

function useFileText(taskId: string, path: string, enabled: boolean, modifiedAt?: string) {
  return useQuery({
    queryKey: ["work-file", taskId, path, modifiedAt],
    queryFn: async () => {
      const res = await fetch(contentUrl(taskId, path), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.text();
    },
    enabled,
    staleTime: 10_000,
  });
}

/** The file, shown as what it is. */
function FileBody({ taskId, file, mode }: { taskId: string; file: WorkFile; mode: ViewMode }) {
  const t = useT();
  const url = contentUrl(taskId, file.path);
  const isText = TEXT.test(file.path) && file.size <= MAX_TEXT;
  const text = useFileText(taskId, file.path, isText, file.modifiedAt);
  const e = ext(file.path);

  if (IMAGE.test(file.path))
    return (
      <div className="flex min-h-full items-center justify-center bg-[repeating-conic-gradient(var(--surface-2)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.path} className="max-h-full max-w-full object-contain" />
      </div>
    );
  if (e === "pdf") return <iframe src={url} title={file.path} className="h-full w-full border-0" />;
  if (!isText)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-fg-subtle">
        <FileIcon name={file.path} className="size-8" />
        {TEXT.test(file.path) ? t("This file is too large to show here. Download it to open it.") : t("No preview for this file type. Download it to open it.")}
      </div>
    );
  if (text.isLoading) return <Skeleton className="m-4 h-40 rounded-lg" />;
  if (text.isError) return <p className="p-4 text-[13px] text-danger">{t("The file couldn't be read.")}</p>;
  const body = text.data ?? "";

  if (mode === "preview") {
    if (e === "md" || e === "markdown")
      return (
        <div className="mx-auto max-w-3xl px-6 py-5 text-[14px]" data-testid="file-markdown">
          <Markdown content={body} />
        </div>
      );
    // A page the agent made runs in a sealed frame: its scripts work, but it can't reach this app or your sign-in.
    if (e === "html" || e === "htm") return <iframe sandbox="allow-scripts allow-forms allow-modals" srcDoc={body} title={file.path} className="h-full w-full border-0 bg-white" data-testid="file-page" />;
    if (e === "svg")
      return (
        <div className="flex min-h-full items-center justify-center p-4">
          {/* An SVG as an image runs no scripts. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`} alt={file.path} className="max-h-full max-w-full" />
        </div>
      );
    if (e === "csv" || e === "tsv") return <Table text={body} tab={e === "tsv"} />;
  }
  return <Code text={body} lang={LANG[e] ?? (file.path.toLowerCase().endsWith("makefile") ? "makefile" : null)} />;
}

/** Source with line numbers, coloured when the language is known and the file isn't huge. */
function Code({ text, lang }: { text: string; lang: string | null }) {
  const lines = useMemo(() => text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n"), [text]);
  const coloured = useMemo(() => {
    if (!lang || lines.length > MAX_HIGHLIGHT || !lowlight.registered(lang)) return null;
    try {
      return toJsxRuntime(lowlight.highlight(lang, lines.join("\n")), { Fragment, jsx, jsxs });
    } catch {
      return null;
    }
  }, [lang, lines]);
  return (
    <div className="flex min-w-max font-mono text-[12.5px] leading-[1.6]" data-testid="file-code">
      <div className="sticky left-0 shrink-0 bg-bg py-3 pr-3 pl-4 text-right text-fg-subtle/70 select-none" aria-hidden>
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <pre className="hljs flex-1 py-3 pr-6 whitespace-pre text-fg">
        <code>{coloured ?? lines.join("\n")}</code>
      </pre>
    </div>
  );
}

/** A CSV as a table (the first 1,000 rows). */
function Table({ text, tab }: { text: string; tab: boolean }) {
  const t = useT();
  const rows = useMemo(() => parseCsv(text, tab ? "\t" : ","), [text, tab]);
  const shown = rows.slice(0, 1001);
  if (!shown.length) return <p className="p-4 text-[13px] text-fg-subtle">{t("The file is empty.")}</p>;
  const [head, ...body] = shown;
  return (
    <div className="p-3" data-testid="file-table">
      <table className="border-collapse text-[12.5px]">
        <thead>
          <tr>
            {head!.map((c, i) => (
              <th key={i} className="sticky top-0 border border-border bg-surface-2 px-2 py-1 text-left font-medium whitespace-nowrap text-fg">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="even:bg-surface/50">
              {r.map((c, j) => (
                <td key={j} className="border border-border px-2 py-1 whitespace-nowrap text-fg-muted">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 1001 && <p className="mt-2 text-[12px] text-fg-subtle">{t("Showing the first {n} rows of {total}.", { n: "1,000", total: (rows.length - 1).toLocaleString() })}</p>}
    </div>
  );
}

/** CSV rows: quoted fields with commas, quotes and line breaks inside. */
export function parseCsv(text: string, sep = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      (row = []), (cell = "");
    } else cell += c;
  }
  if (cell !== "" || row.length) row.push(cell), rows.push(row);
  return rows;
}

interface Node {
  name: string;
  path: string;
  dirs: Map<string, Node>;
  files: WorkFile[];
}

/** The folder tree, with a filter; scratch and hidden folders start closed. */
function FileTree({ files, active, onOpen }: { files?: WorkFile[]; active: string | null; onOpen: (path: string) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(() => new Set(["scratch", ".task"]));
  const root = useMemo(() => {
    const top: Node = { name: "", path: "", dirs: new Map(), files: [] };
    const needle = q.trim().toLowerCase();
    for (const f of files ?? []) {
      if (needle && !f.path.toLowerCase().includes(needle)) continue;
      const parts = f.path.split("/");
      let n = top;
      for (const [i, part] of parts.slice(0, -1).entries()) {
        const path = parts.slice(0, i + 1).join("/");
        if (!n.dirs.has(part)) n.dirs.set(part, { name: part, path, dirs: new Map(), files: [] });
        n = n.dirs.get(part)!;
      }
      n.files.push(f);
    }
    return top;
  }, [files, q]);

  const render = (n: Node, depth: number): ReactNode => (
    <>
      {[...n.dirs.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => {
          const isOpen = !!q.trim() || !closed.has(d.path);
          return (
            <Fragment key={d.path}>
              <button
                type="button"
                onClick={() => setClosed((s) => (s.has(d.path) ? new Set([...s].filter((x) => x !== d.path)) : new Set([...s, d.path])))}
                className="flex w-full items-center gap-1 rounded py-0.5 pr-2 text-left text-[12.5px] text-fg-muted hover:bg-surface-2"
                style={{ paddingLeft: 6 + depth * 12 }}
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
                {isOpen ? <FolderOpen className="size-3.5 shrink-0 text-fg-subtle" /> : <Folder className="size-3.5 shrink-0 text-fg-subtle" />}
                <span className="truncate">{d.name}</span>
              </button>
              {isOpen && render(d, depth + 1)}
            </Fragment>
          );
        })}
      {[...n.files]
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((f) => (
          <button
            key={f.path}
            type="button"
            onClick={() => onOpen(f.path)}
            className={cn("flex w-full items-center gap-1.5 rounded py-0.5 pr-2 text-left text-[12.5px]", f.path === active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2/70 hover:text-fg")}
            style={{ paddingLeft: 22 + depth * 12 }}
            title={f.path}
            data-testid="tree-file"
          >
            <FileIcon name={f.path} className="size-3.5 shrink-0" />
            <span className="truncate">{f.path.split("/").pop()}</span>
          </button>
        ))}
    </>
  );

  return (
    <>
      <div className="shrink-0 border-b border-border p-2">
        <label className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 focus-within:border-border-strong">
          <Search className="size-3.5 shrink-0 text-fg-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Filter files…")} aria-label={t("Filter files")} className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-subtle" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {!files ? <Skeleton className="h-24 rounded-lg" /> : files.length === 0 ? <p className="p-2 text-[12px] text-fg-subtle">{t("No files yet.")}</p> : render(root, 0)}
      </div>
    </>
  );
}
