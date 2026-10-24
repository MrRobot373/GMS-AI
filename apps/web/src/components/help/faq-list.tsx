"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/field";
import { useT } from "@/i18n";

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqSection {
  title: string;
  items: FaqItem[];
}

/** A searchable list of questions. `title`, `q` and `a` are English keys marked with msg(). */
export function FaqList({ sections }: { sections: FaqSection[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            if (!needle) return true;
            const hay = `${item.q}\n${item.a}\n${t(item.q)}\n${t(item.a)}`.toLowerCase();
            return hay.includes(needle);
          }),
        }))
        .filter((section) => section.items.length > 0),
    [sections, needle, t],
  );

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("Search questions")}
        aria-label={t("Search questions")}
        className="max-w-md"
      />
      {shown.length === 0 ? (
        <p className="mt-6 text-[13px] text-fg-muted">{t("No questions match.")}</p>
      ) : (
        <div className="mt-6 space-y-8">
          {shown.map((section) => (
            <section key={section.title}>
              <h2 className="text-[13px] font-medium text-fg">{t(section.title)}</h2>
              <div className="mt-1 divide-y divide-border">
                {section.items.map((item) => (
                  <details key={item.q} className="group py-3">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[14px] text-fg [&::-webkit-details-marker]:hidden">
                      <span>{t(item.q)}</span>
                      <ChevronDown className="mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg-muted">{t(item.a)}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
