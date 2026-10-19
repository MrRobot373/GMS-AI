"use client";

import { Check, Copy } from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeMath } from "@/components/learning/math-markdown";
import type { Citation } from "@/lib/types";
import { CitationChip, linkCitations } from "./citations";
import { remarkLineBreaks } from "./line-breaks";
import { useT } from "@/i18n";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const lang = /language-(\w+)/.exec(className ?? "")?.[1];
  return (
    <div className="group/code overflow-hidden rounded-xl border border-border bg-bg-subtle">
      <div className="flex h-9 items-center justify-between border-b border-border px-3.5">
        <span className="font-mono text-[11.5px] text-fg-subtle">{lang ?? t("text")}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(textOf(children).replace(/\n$/, ""));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg print:hidden"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? t("Copied") : t("Copy")}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({
  content,
  citations,
  onCite,
  plainLinks,
  lineBreaks,
}: {
  content: string;
  citations?: Citation[] | null;
  onCite?: (c: Citation) => void;
  /**
   * Links and images the model wrote show as text (a web search answer: its links come only from the
   * sources). An image would be fetched as soon as the answer shows, with whatever a page in the
   * sources got the model to put in its address.
   */
  plainLinks?: boolean;
  /** Keep single line breaks (a Work AI answer); in chat, Markdown's own rule joins them. */
  lineBreaks?: boolean;
}) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }], ...(lineBreaks ? [remarkLineBreaks] : [])]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }], [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
            if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a: ({ children, href }) => {
            const n = href?.startsWith("#cite-") ? Number(href.slice(6)) : null;
            const c = n ? citations?.find((x) => x.n === n) : undefined;
            if (c) return <CitationChip citation={c} onOpen={(x) => onCite?.(x)} />;
            if (plainLinks) return <span>{children}</span>;
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          ...(plainLinks && { img: ({ alt }) => (alt ? <span>{alt}</span> : null) }),
        }}
      >
        {linkCitations(normalizeMath(content), citations)}
      </ReactMarkdown>
    </div>
  );
});
