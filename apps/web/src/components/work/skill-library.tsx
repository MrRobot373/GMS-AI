"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileCode2, Library, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/chat/markdown";
import { Input } from "@/components/ui/field";
import { Badge, Switch } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { get, patch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n";

interface LibrarySkill {
  slug: string;
  name: string;
  description: string;
  category: string;
  version: string | null;
  ownerTeam: string | null;
  riskLevel: string | null;
  maturity: string | null;
  files: string[];
  enabled: boolean;
}

const CATEGORIES = ["Software development", "Data", "Documents & writing", "Business", "Apps", "Platform"];

/** Aatmiq's built-in skills: everyone can browse and read them; admins switch them on or off. */
export function SkillLibrary({ canManage }: { canManage: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["skill-library"], queryFn: () => get<LibrarySkill[]>("/api/work/skills/library") });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<LibrarySkill | null>(null);
  const toggle = useMutation({
    mutationFn: (s: LibrarySkill) => patch(`/api/work/skills/library/${s.slug}`, { enabled: !s.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skill-library"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const all = list.data ?? [];
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((s) => (cat === "All" || s.category === cat) && (!term || `${s.name} ${s.description} ${s.slug}`.toLowerCase().includes(term)));
  }, [all, q, cat]);
  const on = all.filter((s) => s.enabled).length;

  return (
    <section data-testid="skill-library">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-fg">
        <Library className="size-3.5 text-fg-subtle" /> {t("Library")}
        <span className="text-[12px] text-fg-subtle">
          · {t("Built into Aatmiq.")} {canManage ? t("{on} of {total} on for everyone.", { on, total: all.length }) : t("The agent picks the right one for each task.")}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search skills")} className="pl-8" data-testid="library-search" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                cat === c ? "border-fg text-fg" : "border-border text-fg-subtle hover:border-border-strong hover:text-fg-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {shown.map((s) => (
            <div key={s.slug} className="flex items-center gap-3 px-4 py-3" data-testid="library-row" data-slug={s.slug}>
              <BookOpen className="size-3.5 shrink-0 text-fg-subtle" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(s)}>
                <div className="flex items-center gap-2 text-[13.5px] text-fg">
                  {s.name}
                  {s.maturity && <Badge>{s.maturity}</Badge>}
                  {!s.enabled && <Badge>{t("Off")}</Badge>}
                  {s.files.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-subtle">
                      <FileCode2 className="size-3" /> {t.n(s.files.length, "{n} helper", "{n} helpers")}
                    </span>
                  )}
                </div>
                <div className="truncate text-[12px] text-fg-subtle">{s.description}</div>
              </button>
              <span className="hidden text-[11.5px] text-fg-subtle sm:block">{s.category}</span>
              {canManage && <Switch checked={s.enabled} onCheckedChange={() => toggle.mutate(s)} label={t("Use {name}", { name: s.name })} />}
            </div>
          ))}
          {shown.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-fg-subtle">{t("No skills match.")}</div>}
        </div>
      )}
      {open && <LibrarySkillDialog skill={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function LibrarySkillDialog({ skill, onClose }: { skill: LibrarySkill; onClose: () => void }) {
  const t = useT();
  const q = useQuery({ queryKey: ["skill-library", skill.slug], queryFn: () => get<{ body: string; files: string[] }>(`/api/work/skills/library/${skill.slug}`) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={skill.name} description={skill.description} className="max-w-3xl">
      {(skill.version || skill.maturity || skill.ownerTeam || skill.riskLevel) && (
        <p className="mb-3 text-[12px] text-fg-subtle">
          {[skill.version && `v${skill.version}`, skill.ownerTeam, skill.riskLevel && `${skill.riskLevel} risk`, skill.maturity].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="max-h-[65vh] overflow-y-auto pr-1" data-testid="library-skill-body">
        {q.data ? <Markdown content={q.data.body.replace(/^\s*# .*\n+/, "")} /> : <Skeleton className="h-60 rounded-lg" />}
        {!!q.data?.files.length && (
          <p className="mt-4 text-[12px] text-fg-subtle">
            {t("Ships with:")} {q.data.files.map((f) => <code key={f} className="mr-2">{f}</code>)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
