"use client";

import { conversion, QUANTITIES, readNumber } from "@aatmiq/calculators";
import { ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { CopyButton, ErrorLine, fmt, Panel } from "./shared";

const CATEGORIES = QUANTITIES.filter((q) => q.converter);

export function Converter() {
  const t = useT();
  const [cat, setCat] = useState(CATEGORIES.find((q) => q.id === "length")!.id);
  const q = QUANTITIES.find((x) => x.id === cat)!;
  const [from, setFrom] = useState("m");
  const [to, setTo] = useState("ft");
  const [value, setValue] = useState("1");

  const pick = (id: string) => {
    const nq = QUANTITIES.find((x) => x.id === id)!;
    setCat(id);
    setFrom(nq.units[0]!.id);
    setTo(nq.units[Math.min(1, nq.units.length - 1)]!.id);
  };
  const fromUnit = q.units.some((u) => u.id === from) ? from : q.units[0]!.id;
  const toUnit = q.units.some((u) => u.id === to) ? to : q.units[1]?.id ?? q.units[0]!.id;
  // Read strictly: no guessing at 1,000 or 0x10.
  const read = useMemo(() => readNumber(value), [value]);
  const n = read && "value" in read ? read.value : NaN;
  const r = useMemo(() => {
    if (!read) return { error: null, conv: null };
    if ("error" in read) return { error: read.error === "comma" ? t("Use a point for decimals and no thousands separators: 2.5, 1000.") : t("Enter a number"), conv: null };
    try {
      const conv = conversion(n, cat, fromUnit, toUnit);
      if (!Number.isFinite(conv.result)) return { error: t("That value can't be converted (division by zero)."), conv: null };
      return { error: null, conv };
    } catch (e) {
      return { error: (e as Error).message, conv: null };
    }
  }, [n, read, cat, fromUnit, toUnit, t]);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="block space-y-1">
            <span className="block text-[12px] font-medium text-fg-muted">{t("Category")}</span>
            <select value={cat} onChange={(e) => pick(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-[13px]">
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="space-y-1">
              <span className="block text-[12px] font-medium text-fg-muted">{t("From")}</span>
              <div className="flex gap-1.5">
                <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label={t("Value")} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 font-mono text-[13px] outline-none focus:border-border-strong" />
                <select value={fromUnit} onChange={(e) => setFrom(e.target.value)} aria-label={t("From unit")} className="h-9 w-32 rounded-lg border border-border bg-surface px-2 text-[13px]">
                  {q.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.symbol} · {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button variant="ghost" size="icon" aria-label={t("Swap units")} onClick={() => { setFrom(toUnit); setTo(fromUnit); }}>
              <ArrowLeftRight className="size-4" />
            </Button>
            <div className="space-y-1">
              <span className="block text-[12px] font-medium text-fg-muted">{t("To")}</span>
              <div className="flex gap-1.5">
                <output className="flex h-9 min-w-0 flex-1 items-center justify-between rounded-lg border border-border bg-bg-subtle px-3 font-mono text-[13px]">
                  <span className="truncate">{r.conv ? fmt(r.conv.result) : "—"}</span>
                  {r.conv && <CopyButton text={fmt(r.conv.result)} />}
                </output>
                <select value={toUnit} onChange={(e) => setTo(e.target.value)} aria-label={t("To unit")} className="h-9 w-32 rounded-lg border border-border bg-surface px-2 text-[13px]">
                  {q.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.symbol} · {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <ErrorLine>{r.error}</ErrorLine>
          {r.conv?.factor !== null && r.conv && (
            <div className="space-y-0.5 font-mono text-[12.5px] text-fg-subtle">
              <div>
                1 {r.conv.from.symbol} = {fmt(r.conv.factor)} {r.conv.to.symbol}
              </div>
              <div>
                1 {r.conv.to.symbol} = {fmt(r.conv.inverse!)} {r.conv.from.symbol}
              </div>
            </div>
          )}
        </div>
      </Panel>
      {r.conv && (
        <Panel title={t("In every unit")}>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {q.units.map((u) => {
              let v: number | null = null;
              try {
                v = conversion(n, cat, fromUnit, u.id).result;
              } catch {
                v = null;
              }
              return (
                <div key={u.id} className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[13px]">
                  <span className="text-fg-muted">{u.name}</span>
                  <span className="font-mono text-fg">
                    {v !== null && Number.isFinite(v) ? fmt(v) : "—"} <span className="text-fg-subtle">{u.symbol}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
