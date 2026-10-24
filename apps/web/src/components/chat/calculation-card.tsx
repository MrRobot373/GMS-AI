"use client";

import { formatNumber } from "@aatmiq/calculators";
import { BadgeCheck, Ban, Calculator, FlaskConical } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/misc";
import { useT } from "@/i18n";

export interface ChatCalculation {
  calculatorId: string;
  name: string;
  status: "verified" | "beta";
  version: number;
  via: "command" | "rules" | "model" | "tool";
  inputs: { key: string; label: string; symbol?: string; value: number | number[]; unit: string; assumed?: boolean }[];
  outputs: { key: string; label: string; symbol?: string; value: number; unit: string }[];
  warnings: string[];
  assumptions: string[];
  formula: string[];
  /** The calculator refused the inputs (no outputs): why, and the input it's about. */
  refused?: { message: string; field?: string };
}

/** The tested calculator's result, above the model's explanation of it. */
export function CalculationCard({ c }: { c: ChatCalculation }) {
  const t = useT();
  const n = (v: number | number[]) => (Array.isArray(v) ? v.map((x) => formatNumber(x, 8)).join(", ") : formatNumber(v, 10));
  return (
    <div className="mb-3 rounded-xl border border-border bg-surface p-3" data-testid="calculation-card">
      <div className="flex flex-wrap items-center gap-2">
        <Calculator className="size-4 text-fg-subtle" />
        <Link href={`/app/calculators?c=${c.calculatorId}`} className="text-[13px] font-medium text-fg hover:underline">
          {c.name}
        </Link>
        {c.status === "verified" ? (
          <Badge tone="success">
            <BadgeCheck className="size-3" /> {t("Verified")}
          </Badge>
        ) : (
          <Badge tone="warning">
            <FlaskConical className="size-3" /> {t("Beta")}
          </Badge>
        )}
        <span className="text-[11.5px] text-fg-subtle">
          {c.refused ? t("Checked by tested code, not the model · formula v{v}", { v: c.version }) : t("Computed by tested code, not the model · formula v{v}", { v: c.version })}
        </span>
      </div>
      {c.refused && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-danger" role="note">
          <Ban className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t("Not calculated: these inputs are outside what the formula covers.")} {c.refused.message}
          </span>
        </p>
      )}
      <div className="mt-2 grid gap-x-6 gap-y-1 font-mono text-[12.5px] sm:grid-cols-2">
        <div className="space-y-0.5 text-fg-muted">
          {c.inputs.map((i) => (
            <div key={i.key} className={c.refused?.field === i.key ? "text-danger" : undefined}>
              {i.symbol ?? i.label} = {n(i.value)} {i.unit}
              {i.assumed && <span className="font-sans text-[11px] text-fg-subtle"> ({t("default")})</span>}
            </div>
          ))}
        </div>
        <div className="space-y-0.5 text-fg">
          {c.outputs.map((o) => (
            <div key={o.key}>
              {o.symbol ?? o.label} = <span className="font-semibold">{n(o.value)}</span> {o.unit}
            </div>
          ))}
        </div>
      </div>
      {c.warnings.length > 0 && <p className="mt-2 text-[12px] text-warning">{c.warnings.join(" ")}</p>}
      <details className="mt-2">
        <summary className="cursor-pointer text-[12px] text-fg-subtle">{t("Formula and assumptions")}</summary>
        <div className="mt-1 space-y-1 text-[12px] text-fg-muted">
          <div className="font-mono">{c.formula.join("; ")}</div>
          <ul className="list-disc pl-4">
            {c.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
