"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CATEGORIES, searchCalculators, type CatalogEntry } from "@aatmiq/calculators";
import { BadgeCheck, Calculator, ChevronRight, FlaskConical, History, Search, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type ComponentType } from "react";
import { TopBar, TopBarButton } from "@/components/app/frame";
import { ModuleOff } from "@/components/app/module-off";
import { useCanUseModule, useSession } from "@/components/app/session";
import { Converter } from "@/components/calculators/converter";
import { FormulaCalculator } from "@/components/calculators/formula";
import { Keypad } from "@/components/calculators/keypad";
import * as MathTools from "@/components/calculators/math-tools";
import * as OtherTools from "@/components/calculators/other-tools";
import { fmt, useCatalog, useFavorite, useHistory, type HistoryRow } from "@/components/calculators/shared";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { del } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

const TOOLS: Record<string, ComponentType> = {
  converter: Converter,
  equation: MathTools.EquationTool,
  "linear-system": MathTools.LinearSystemTool,
  matrix: MathTools.MatrixTool,
  vector: MathTools.VectorTool,
  calculus: MathTools.CalculusTool,
  statistics: MathTools.StatisticsTool,
  distributions: MathTools.DistributionsTool,
  fractions: MathTools.FractionsTool,
  "number-theory": MathTools.NumberTheoryTool,
  complex: MathTools.ComplexTool,
  sequences: MathTools.SequencesTool,
  roman: MathTools.RomanTool,
  "base-n": OtherTools.BaseNTool,
  subnet: OtherTools.SubnetTool,
  "resistor-color": OtherTools.ResistorColorTool,
  "molar-mass": OtherTools.MolarMassTool,
  constants: OtherTools.ConstantsTool,
  amortization: OtherTools.AmortizationTool,
  "cash-flows": OtherTools.CashFlowsTool,
  dates: OtherTools.DatesTool,
  random: OtherTools.RandomTool,
};

export default function CalculatorsRoute() {
  return (
    <Suspense>
      <CalculatorsPage />
    </Suspense>
  );
}

function CalculatorsPage() {
  const t = useT();
  const allowed = useCanUseModule("calculators");
  const search = useSearchParams();
  const router = useRouter();
  const catalog = useCatalog();
  const fav = useFavorite();
  const [q, setQ] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ id: string; inputs: Record<string, { value: unknown; unit?: string }> } | null>(null);
  const id = search.get("c");
  const list = catalog.data?.calculators ?? [];
  const current = id ? list.find((c) => c.id === id) : undefined;
  const favorites = new Set(catalog.data?.favorites ?? []);
  const recent = useHistory();
  const open = (cid: string) => router.push(`/app/calculators?c=${cid}`, { scroll: false });

  const results = useMemo(() => (q.trim() ? searchCalculators(q, list).slice(0, 40) : null), [q, list]);
  const recentIds = useMemo(() => [...new Set((recent.data ?? []).map((r) => r.calculatorId))].slice(0, 6), [recent.data]);

  if (!allowed) return <ModuleOff />;

  const entry = (c: CatalogEntry) => (
    <button
      key={c.id}
      onClick={() => {
        open(c.id);
        setQ("");
      }}
      aria-current={c.id === id ? "page" : undefined}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors", c.id === id ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg")}
    >
      <span className="min-w-0 flex-1 truncate">{c.name}</span>
      {c.status === "verified" && <BadgeCheck className="size-3.5 shrink-0 text-success" aria-label={t("Verified")} />}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        icon={<Calculator />}
        title={
          current ? (
            <span className="flex items-center gap-1.5">
              <Link href="/app/calculators" className="text-fg-muted hover:text-fg">
                {t("Calculators")}
              </Link>
              <ChevronRight className="size-3.5 text-fg-subtle" />
              {current.name}
            </span>
          ) : (
            t("Calculators")
          )
        }
        actions={
          <>
            {current && (
              <TopBarButton onClick={() => fav.mutate({ id: current.id, favorite: !favorites.has(current.id) })} aria-pressed={favorites.has(current.id)}>
                <Star className={cn(favorites.has(current.id) && "fill-current text-warning")} /> {favorites.has(current.id) ? t("Favorite") : t("Add to favorites")}
              </TopBarButton>
            )}
            <TopBarButton onClick={() => setHistoryOpen(true)}>
              <History /> {t("History")}
            </TopBarButton>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-bg-subtle/40 p-3 md:block">
          <label className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 focus-within:border-border-strong">
            <Search className="size-3.5 text-fg-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search calculators")} aria-label={t("Search calculators")} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle" />
          </label>
          {catalog.isLoading ? (
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          ) : results ? (
            <div className="mt-3 space-y-px">
              {results.length ? results.map(entry) : <p className="px-2 py-2 text-[12.5px] text-fg-subtle">{t("Nothing matches")}</p>}
            </div>
          ) : (
            <nav className="mt-3 space-y-4" aria-label={t("Calculators")}>
              {favorites.size > 0 && (
                <div>
                  <div className="mb-1 px-2 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{t("Favorites")}</div>
                  {list.filter((c) => favorites.has(c.id)).map(entry)}
                </div>
              )}
              {recentIds.length > 0 && (
                <div>
                  <div className="mb-1 px-2 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{t("Recent")}</div>
                  {recentIds.map((r) => list.find((c) => c.id === r)).filter((c): c is CatalogEntry => !!c).map(entry)}
                </div>
              )}
              <CategoryList list={list} entry={entry} activeId={id} />
            </nav>
          )}
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
            {/* Narrow screens: a picker instead of the side list. */}
            <div className="mb-4 md:hidden">
              <select value={id ?? ""} onChange={(e) => (e.target.value ? open(e.target.value) : router.push("/app/calculators"))} aria-label={t("Calculator")} className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-[13px]">
                <option value="">{t("All calculators")}</option>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {!current ? (
              id && !catalog.isLoading ? (
                <EmptyState title={t("Calculator not found")} />
              ) : (
                <Home list={list} open={open} />
              )
            ) : (
              <>
                <h1 className="font-serif text-[28px] leading-tight tracking-[-0.02em]">{current.name}</h1>
                <p className="mt-1 mb-5 text-[13px] text-fg-subtle">{current.description}</p>
                {current.id === "basic" || current.id === "scientific" ? (
                  <Keypad key={current.id} mode={current.id} />
                ) : current.kind === "formula" ? (
                  <FormulaCalculator key={current.id} c={current} prefill={prefill?.id === current.id ? prefill.inputs : null} />
                ) : TOOLS[current.id] ? (
                  (() => {
                    const Tool = TOOLS[current.id]!;
                    return <Tool />;
                  })()
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        list={list}
        onOpen={(row) => {
          setHistoryOpen(false);
          if (row.kind === "formula") setPrefill({ id: row.calculatorId, inputs: row.inputs as Record<string, { value: unknown; unit?: string }> });
          open(row.calculatorId);
        }}
      />
    </div>
  );
}

function CategoryList({ list, entry, activeId }: { list: CatalogEntry[]; entry: (c: CatalogEntry) => React.ReactNode; activeId: string | null }) {
  const t = useT();
  const activeCat = list.find((c) => c.id === activeId)?.category;
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(activeCat ? [activeCat] : ["basic"]));
  return (
    <div>
      <div className="mb-1 px-2 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{t("Categories")}</div>
      {CATEGORIES.map((cat) => {
        const items = list.filter((c) => c.category === cat.id);
        if (!items.length) return null;
        const isOpen = openCats.has(cat.id) || cat.id === activeCat;
        return (
          <div key={cat.id}>
            <button
              onClick={() => setOpenCats((s) => (s.has(cat.id) ? new Set([...s].filter((x) => x !== cat.id)) : new Set([...s, cat.id])))}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2/60"
            >
              <ChevronRight className={cn("size-3.5 text-fg-subtle transition-transform", isOpen && "rotate-90")} />
              <span className="flex-1">{cat.name}</span>
              <span className="text-[11.5px] text-fg-subtle">{items.length}</span>
            </button>
            {isOpen && <div className="ml-3 space-y-px border-l border-border pl-1">{items.map(entry)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Home({ list, open }: { list: CatalogEntry[]; open: (id: string) => void }) {
  const t = useT();
  const verified = list.filter((c) => c.status === "verified");
  const tools = list.filter((c) => c.kind === "tool");
  const card = (c: CatalogEntry) => (
    <button key={c.id} onClick={() => open(c.id)} className="flex flex-col items-start rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong">
      <span className="flex w-full items-center gap-1.5">
        <span className="flex-1 text-[13.5px] text-fg">{c.name}</span>
        {c.status === "verified" ? <BadgeCheck className="size-3.5 text-success" /> : c.status === "beta" ? <FlaskConical className="size-3.5 text-fg-subtle" /> : null}
      </span>
      <span className="mt-1 line-clamp-2 text-[12px] text-fg-subtle">{c.description}</span>
    </button>
  );
  return (
    <div>
      <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em]">{t("Calculators")}</h1>
      <p className="mt-1 max-w-2xl text-[13px] text-fg-subtle">
        {t("Every number here comes from tested code, never from a model. Verified calculators are checked against at least five hand-worked cases; beta ones against fewer. Each states its formula and assumptions.")}
      </p>
      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-[14px] text-fg">
          <BadgeCheck className="size-4 text-success" /> {t("Verified engineering calculators")} <Badge>{verified.length}</Badge>
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{verified.map(card)}</div>
      </section>
      <section className="mt-8">
        <h2 className="mb-2 text-[14px] text-fg">{t("Keypads and tools")}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{tools.map(card)}</div>
      </section>
      <section className="mt-8">
        <h2 className="mb-2 text-[14px] text-fg">{t("All categories")}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((cat) => {
            const n = list.filter((c) => c.category === cat.id).length;
            const first = list.find((c) => c.category === cat.id);
            return n && first ? (
              <button key={cat.id} onClick={() => open(first.id)} className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-[13px] transition-colors hover:border-border-strong">
                <span className="text-fg">{cat.name}</span>
                <span className="text-fg-subtle">{n}</span>
              </button>
            ) : null;
          })}
        </div>
      </section>
    </div>
  );
}

function HistoryDialog({ open, onOpenChange, list, onOpen }: { open: boolean; onOpenChange: (o: boolean) => void; list: CatalogEntry[]; onOpen: (r: HistoryRow) => void }) {
  const t = useT();
  const { workspaceId } = useSession();
  const qc = useQueryClient();
  const h = useHistory();
  const remove = useMutation({ mutationFn: (id: string) => del(`/api/calculators/history/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["calc-history", workspaceId] }) });
  const clear = useMutation({ mutationFn: () => del("/api/calculators/history"), onSuccess: () => qc.invalidateQueries({ queryKey: ["calc-history", workspaceId] }) });
  const name = (id: string) => list.find((c) => c.id === id)?.name ?? id;
  const summary = (r: HistoryRow) => {
    if (r.kind === "expression") return `${(r.inputs as { expression: string }).expression} = ${fmt((r.outputs as { value: number }).value)}`;
    if (r.kind === "formula" && Array.isArray(r.outputs))
      return (r.outputs as { label: string; value: number; unitSymbol?: string; unit?: string; symbol?: string }[])
        .slice(0, 3)
        .map((o) => `${o.symbol ?? o.label} = ${fmt(o.value, 6)} ${o.unitSymbol ?? o.unit ?? ""}`.trim())
        .join(" · ");
    return t("Saved result");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Calculation history")}
      description={t("Inputs, results, units and the formula version, kept for you. Calculations chat ran are here too.")}
      className="max-w-2xl"
      footer={
        (h.data?.length ?? 0) > 0 ? (
          <button onClick={() => clear.mutate()} className="mr-auto text-[12.5px] text-danger hover:underline">
            {t("Clear history")}
          </button>
        ) : undefined
      }
    >
      {h.isLoading ? (
        <Skeleton className="h-20" />
      ) : !h.data?.length ? (
        <p className="py-6 text-center text-[13px] text-fg-subtle">{t("No calculations yet.")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {h.data.map((r) => (
            <li key={r.id} className="group flex items-start gap-3 py-2">
              <button onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2 text-[13px] text-fg">
                  {name(r.calculatorId)}
                  {r.source === "chat" && <Badge>{t("from chat")}</Badge>}
                  {r.formulaVersion !== null && <span className="text-[11px] text-fg-subtle">v{r.formulaVersion}</span>}
                </div>
                <div className="truncate font-mono text-[12px] text-fg-muted">{summary(r)}</div>
              </button>
              <span className="shrink-0 text-[11.5px] text-fg-subtle">{timeAgo(r.createdAt, t)}</span>
              <button onClick={() => remove.mutate(r.id)} aria-label={t("Delete")} className="rounded p-1 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
