"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readNumber, unitOf, type CatalogEntry, type RunResult } from "@aatmiq/calculators";
import { AlertTriangle, BadgeCheck, FlaskConical, MessageSquare, Play, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Badge, Tooltip } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { ApiError, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CopyButton, ErrorLine, fmt, Panel, unitsOf } from "./shared";

/** A typed value that can't be read, caught before anything is sent. */
class FieldError extends Error {
  constructor(
    message: string,
    public field: string,
  ) {
    super(message);
  }
}

type Value = { text: string; unit: string };

const initialValues = (c: CatalogEntry): Record<string, Value> =>
  Object.fromEntries(
    (c.inputs ?? []).map((i) => [i.key, { text: i.default !== undefined ? String(i.default) : "", unit: i.unit ?? unitsOf(i.quantity)[0]?.id ?? "" }]),
  );

/** A registry calculator: its inputs, the server's checked result, formula, assumptions and warnings. */
export function FormulaCalculator({ c, prefill }: { c: CatalogEntry; prefill?: Record<string, { value: unknown; unit?: string }> | null }) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { workspaceId } = useSession();
  const [values, setValues] = useState<Record<string, Value>>(() => initialValues(c));
  const [outUnits, setOutUnits] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<{ message: string; field?: string | null } | null>(null);

  // Opening an entry from history fills the form with what was entered.
  useEffect(() => {
    setResult(null);
    setError(null);
    const base = initialValues(c);
    if (prefill) for (const [k, v] of Object.entries(prefill)) if (base[k]) base[k] = { text: Array.isArray(v.value) ? v.value.join(", ") : String(v.value ?? ""), unit: v.unit ?? base[k]!.unit };
    setValues(base);
    setOutUnits({});
  }, [c, prefill]);

  const run = useMutation({
    mutationFn: (units: Record<string, string>) => {
      const inputs: Record<string, { value: number | number[] | null; unit?: string }> = {};
      for (const i of c.inputs ?? []) {
        const v = values[i.key]!;
        const raw = v.text.trim();
        if (!raw) {
          inputs[i.key] = { value: null };
          continue;
        }
        // What's typed is read strictly (no guessing at 1,000 or 0x10); anything else stops here, at its field.
        const read = (text: string) => {
          const r = readNumber(text);
          if (r && "value" in r) return r.value;
          throw new FieldError(r?.error === "comma" ? t("Use a point for decimals and no thousands separators: 2.5, 1000.") : t("Enter a number"), i.key);
        };
        if (i.list) inputs[i.key] = { value: raw.split(/[,;\s]+/).filter(Boolean).map(read), unit: v.unit || undefined };
        else inputs[i.key] = { value: read(raw), unit: i.options ? undefined : v.unit || undefined };
      }
      return post<RunResult & { historyId: string }>("/api/calculators/run", { workspaceId, calculatorId: c.id, inputs, outputUnits: units });
    },
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      qc.invalidateQueries({ queryKey: ["calc-history", workspaceId] });
    },
    onError: (e: Error) => {
      setResult(null);
      setError({ message: e.message, field: e instanceof FieldError ? e.field : e instanceof ApiError ? ((e.details as { field?: string } | undefined)?.field ?? null) : null });
    },
  });

  const set = (k: string, patchV: Partial<Value>) => setValues((v) => ({ ...v, [k]: { ...v[k]!, ...patchV } }));
  const pickHint = c.pick ? t("Enter any {count} of: {names}", { count: c.pick.count, names: c.pick.keys.map((k) => c.inputs!.find((i) => i.key === k)?.symbol ?? k).join(", ") }) : null;
  const shown = useMemo(() => result?.outputs ?? [], [result]);

  const explain = () => {
    if (!result) return;
    const ins = Object.entries(result.inputs)
      .map(([k, v]) => {
        const i = c.inputs!.find((x) => x.key === k)!;
        const u = i.options ? "" : unitOf(i.quantity, v.unit).symbol;
        return `${i.symbol ?? i.label} = ${Array.isArray(v.value) ? v.value.join(", ") : v.value}${u ? ` ${u}` : ""}`;
      })
      .join(", ");
    router.push(`/app/chat?ask=${encodeURIComponent(`/calc ${c.id} ${Object.entries(result.inputs).filter(([, v]) => !Array.isArray(v.value)).map(([k, v]) => `${k}=${v.value}${v.unit && !["fraction", "1", "count", "money"].includes(v.unit) ? (v.unit === "percent" ? "%" : v.unit) : ""}`).join(" ")}\n${t("Explain this {name} result step by step ({inputs}), and what its assumptions mean in practice.", { name: c.name, inputs: ins })}`)}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {c.status === "verified" ? (
          <Tooltip content={t("Checked against {n} hand-worked reference cases", { n: c.refCount ?? 0 })}>
            <span>
              <Badge tone="success">
                <BadgeCheck className="size-3" /> {t("Verified")}
              </Badge>
            </span>
          </Tooltip>
        ) : (
          <Tooltip content={t("Checked against {n} reference cases, fewer than the five a verified calculator needs", { n: c.refCount ?? 0 })}>
            <span>
              <Badge tone="warning">
                <FlaskConical className="size-3" /> {t("Beta")}
              </Badge>
            </span>
          </Tooltip>
        )}
        <span className="text-[12px] text-fg-subtle">{t("Formula version {v}", { v: c.version ?? 1 })}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={t("Inputs")}>
          {pickHint && <p className="mb-3 text-[12.5px] text-fg-subtle">{pickHint}</p>}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run.mutate(outUnits);
            }}
          >
            {(c.inputs ?? []).map((i) => {
              const units = unitsOf(i.quantity);
              const v = values[i.key] ?? { text: "", unit: i.unit ?? units[0]?.id ?? "" };
              const bad = error?.field === i.key;
              return (
                <div key={i.key}>
                  <label htmlFor={`in-${i.key}`} className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-fg-muted">
                    {i.label}
                    {i.symbol && <span className="font-mono text-fg-subtle">{i.symbol}</span>}
                    {i.optional && !c.pick?.keys.includes(i.key) && <span className="text-[11px] font-normal text-fg-subtle">({t("optional")})</span>}
                  </label>
                  <div className="flex gap-1.5">
                    {i.options ? (
                      <select id={`in-${i.key}`} value={v.text} onChange={(e) => set(i.key, { text: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-[13px]">
                        {i.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`in-${i.key}`}
                        inputMode={i.list ? "text" : "decimal"}
                        value={v.text}
                        onChange={(e) => set(i.key, { text: e.target.value })}
                        placeholder={i.list ? t("e.g. 100, 220, 470") : i.help}
                        aria-invalid={bad}
                        className={cn(
                          "h-9 min-w-0 flex-1 rounded-lg border bg-surface px-3 font-mono text-[13px] text-fg outline-none placeholder:font-sans placeholder:text-fg-subtle focus:border-border-strong",
                          bad ? "border-danger" : "border-border",
                        )}
                      />
                    )}
                    {!i.options && units.length > 1 && (
                      <select value={v.unit} onChange={(e) => set(i.key, { unit: e.target.value })} aria-label={t("Unit for {label}", { label: i.label })} className="h-9 w-28 shrink-0 rounded-lg border border-border bg-surface px-2 text-[13px]">
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.symbol || u.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {!i.options && units.length === 1 && units[0]!.symbol && <span className="flex h-9 w-12 shrink-0 items-center text-[13px] text-fg-subtle">{units[0]!.symbol}</span>}
                  </div>
                </div>
              );
            })}
            <ErrorLine>{error?.message}</ErrorLine>
            <div className="flex gap-2 pt-1">
              <Button type="submit" variant="primary" loading={run.isPending}>
                <Play className="size-3.5" /> {t("Calculate")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setValues(initialValues(c));
                  setResult(null);
                  setError(null);
                }}
              >
                <RotateCcw className="size-3.5" /> {t("Clear")}
              </Button>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title={t("Result")} actions={result ? <Button size="sm" variant="ghost" onClick={explain}><MessageSquare className="size-3.5" /> {t("Explain in chat")}</Button> : null}>
            {!result ? (
              <p className="text-[13px] text-fg-subtle">{t("Fill in the inputs and calculate. The numbers come from tested code, not a model.")}</p>
            ) : (
              <div>
                {shown.map((o) => {
                  const units = unitsOf(o.quantity);
                  return (
                    <div key={o.key} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                      <span className="text-[13px] text-fg-muted">
                        {o.label} {o.symbol && <span className="font-mono text-fg-subtle">{o.symbol}</span>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[16px] text-fg tabular-nums">{fmt(o.value)}</span>
                        {units.length > 1 ? (
                          <select
                            value={o.unit}
                            onChange={(e) => {
                              const next = { ...outUnits, [o.key]: e.target.value };
                              setOutUnits(next);
                              // Shown in another unit straight away; the stored result keeps its units.
                              setResult((r) => r && { ...r, outputs: r.outputs.map((x) => (x.key === o.key ? { ...x, unit: e.target.value, unitSymbol: unitOf(x.quantity, e.target.value).symbol, value: unitOf(x.quantity, e.target.value).fromBase(x.base) } : x)) });
                            }}
                            aria-label={t("Unit for {label}", { label: o.label })}
                            className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12.5px]"
                          >
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.symbol || u.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[12.5px] text-fg-subtle">{o.unitSymbol}</span>
                        )}
                        <CopyButton text={fmt(o.value)} />
                      </span>
                    </div>
                  );
                })}
                {result.warnings.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                      </p>
                    ))}
                  </div>
                )}
                {result.steps.length > 0 && (
                  <ol className="mt-3 list-decimal space-y-0.5 pl-5 font-mono text-[12.5px] text-fg-muted">
                    {result.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </Panel>
          <Panel title={t("Formula")}>
            <div className="space-y-1 font-mono text-[13px] text-fg">
              {(c.formula ?? []).map((f, i) => (
                <div key={i}>{f}</div>
              ))}
            </div>
          </Panel>
          <Panel title={t("Assumptions")}>
            <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-fg-muted">
              {(c.assumptions ?? []).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
