"use client";

import "katex/dist/katex.min.css";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/**
 * Models write maths as \(…\) and \[…\] as often as $…$ and $$…$$; remark-math reads only the
 * dollar forms, so the others are rewritten, outside code. In a table row, a | inside a formula
 * (|G(jω)|) would end the cell, so it becomes \vert.
 */
export function normalizeMath(content: string): string {
  return content
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `\n$$\n${m.trim()}\n$$\n`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m.trim()}$`)
            .replace(/^[ \t]*\|.*$/gm, (row) => row.replace(/\$[^$\n]+\$/g, (f) => f.replace(/\\\|/g, "\\Vert{}").replace(/\|/g, "\\vert{}"))),
    )
    .join("");
}

/** Markdown with $…$ and $$…$$ maths (KaTeX, fonts served by this app). Links show as plain text. */
export const MathMarkdown = memo(function MathMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className ?? "prose-chat"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        components={{
          // Lessons are model-written: a link that got past the schema is shown as text, never followed.
          a: ({ children }) => <span>{children}</span>,
        }}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
});

/** One equation: LaTeX when the lesson gave it, else the plain expression. */
export function Equation({ latex, expression }: { latex?: string; expression: string }) {
  if (latex?.trim()) return <MathMarkdown content={`$$${latex.trim()}$$`} className="overflow-x-auto text-[15px]" />;
  return <div className="overflow-x-auto font-mono text-[15px] text-fg">{expression}</div>;
}
