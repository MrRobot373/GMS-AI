"use client";

import "katex/dist/katex.min.css";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/** Markdown with $…$ and $$…$$ maths (KaTeX, fonts served by this app). Links open outside. */
export const MathMarkdown = memo(function MathMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className ?? "prose-chat"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

/** One equation: LaTeX when the lesson gave it, else the plain expression. */
export function Equation({ latex, expression }: { latex?: string; expression: string }) {
  if (latex?.trim()) return <MathMarkdown content={`$$${latex.trim()}$$`} className="overflow-x-auto text-[15px]" />;
  return <div className="overflow-x-auto font-mono text-[15px] text-fg">{expression}</div>;
}
