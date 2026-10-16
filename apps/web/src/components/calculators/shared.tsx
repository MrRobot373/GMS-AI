"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatNumber, quantity, type CatalogEntry } from "@aatmiq/calculators";
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSession } from "@/components/app/session";
import { useT } from "@/i18n";
import { get, post, put } from "@/lib/api";
import { cn } from "@/lib/cn";

export interface HistoryRow {
  id: string;
  calculatorId: string;
  kind: "formula" | "expression" | "tool";
  formulaVersion: number | null;
  inputs: Record<string, unknown>;
  outputs: unknown;
  source: "calculators" | "chat";
  createdAt: string;
}

export function useCatalog() {
  const { workspaceId } = useSession();
  return useQuery({
    queryKey: ["calculators", workspaceId],
    queryFn: () => get<{ calculators: CatalogEntry[]; favorites: string[]; betaCalculators: boolean }>(`/api/calculators?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useHistory(calculatorId?: string) {
  const { workspaceId } = useSession();
  return useQuery({
    queryKey: ["calc-history", workspaceId, calculatorId ?? ""],
    queryFn: () => get<HistoryRow[]>(`/api/calculators/history?workspaceId=${workspaceId}${calculatorId ? `&calculatorId=${calculatorId}` : ""}&limit=${calculatorId ? 50 : 200}`),
    enabled: !!workspaceId,
  });
}

export function useFavorite() {
  const { workspaceId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => put(`/api/calculators/favorites/${id}`, { favorite, workspaceId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calculators", workspaceId] }),
  });
}

/** Keep a tool's result (or a keypad line) in history. Failures are quiet: the result is still on screen. */
export function useSaveHistory() {
  const { workspaceId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { calculatorId: string; expression?: string; angle?: "deg" | "rad" | "grad"; vars?: Record<string, number>; inputs?: Record<string, unknown>; outputs?: unknown }) =>
      post("/api/calculators/history", { workspaceId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calc-history", workspaceId] }),
  });
}

/** A number for engineers: up to 10 significant digits, exponent form far from 1. */
export const fmt = (v: number, digits = 10) => formatNumber(v, digits);

export function unitsOf(q: string) {
  try {
    return quantity(q).units;
  } catch {
    return [];
  }
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      aria-label={t("Copy")}
      className={cn("rounded p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg", className)}
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** A labelled panel inside a tool. */
export function Panel({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-[13px] font-medium text-fg">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/** A result line: label, value, copy. */
export function ResultRow({ label, value, unit, big }: { label: ReactNode; value: string; unit?: ReactNode; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-[13px] text-fg-muted">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className={cn("font-mono text-fg tabular-nums", big ? "text-[20px]" : "text-[14px]")}>{value}</span>
        {unit && <span className="text-[12.5px] text-fg-subtle">{unit}</span>}
        <CopyButton text={value} />
      </span>
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
      {children}
    </p>
  );
}

/** Small labelled input used across the tools. */
export function TextField({ label, value, onChange, placeholder, className, mono, type = "text", ...rest }: { label: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; mono?: boolean; type?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="block text-[12px] font-medium text-fg-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("h-9 w-full rounded-lg border border-border bg-surface px-3 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-border-strong", mono && "font-mono")}
        {...rest}
      />
    </label>
  );
}

/** Run something that may throw a readable error; returns [value, error]. */
export function attempt<T>(fn: () => T): [T | null, string | null] {
  try {
    return [fn(), null];
  } catch (e) {
    return [null, e instanceof Error ? e.message : String(e)];
  }
}
