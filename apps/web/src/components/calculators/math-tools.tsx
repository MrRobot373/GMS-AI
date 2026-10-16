"use client";

import { algebra, calculus, compileFn, matrix as M, stats } from "@aatmiq/calculators";
import { Play, Plus, Minus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { attempt, ErrorLine, fmt, Panel, ResultRow, TextField, useSaveHistory } from "./shared";

const nums = (s: string) =>
  s
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((x) => {
      const n = Number(x);
      if (!Number.isFinite(n)) throw new Error(`"${x}" isn't a number`);
      return n;
    });

function Run({ onClick, children }: { onClick: () => void; children?: ReactNode }) {
  const t = useT();
  return (
    <Button variant="primary" onClick={onClick}>
      <Play className="size-3.5" /> {children ?? t("Calculate")}
    </Button>
  );
}

function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.v}
          role="tab"
          aria-selected={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn("h-7 rounded-md px-2.5 text-[12.5px] transition-colors", value === o.v ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Equation solver ───────────── */

export function EquationTool() {
  const t = useT();
  const save = useSaveHistory();
  const [coef, setCoef] = useState("1, -6, 11, -6");
  const [out, setOut] = useState<ReturnType<typeof algebra.polynomialRoots> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = () => {
    const [r, e] = attempt(() => algebra.polynomialRoots(nums(coef)));
    setOut(r);
    setErr(e);
    if (r) save.mutate({ calculatorId: "equation", inputs: { coefficients: coef }, outputs: { roots: r.roots.map((z) => algebra.formatComplex(z)) } });
  };
  return (
    <div className="space-y-4">
      <Panel title={t("Polynomial equation")}>
        <p className="mb-3 text-[12.5px] text-fg-subtle">{t("Coefficients from the highest power down: 1, -6, 11, -6 is x³ − 6x² + 11x − 6 = 0.")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <TextField className="min-w-64 flex-1" label={t("Coefficients")} value={coef} onChange={setCoef} mono />
          <Run onClick={run}>{t("Solve")}</Run>
        </div>
        {(() => {
          const [c] = attempt(() => nums(coef));
          return c && c.length ? <p className="mt-2 font-mono text-[13px] text-fg-muted">{algebra.formatPolynomial(c)} = 0</p> : null;
        })()}
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {out && (
        <Panel title={t("Roots")}>
          {out.roots.map((z, i) => (
            <ResultRow key={i} label={`x${out.roots.length > 1 ? `${"₁₂₃₄₅₆₇₈₉"[i] ?? i + 1}` : ""}`} value={algebra.formatComplex(z)} />
          ))}
          <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-[12.5px] text-fg-muted">
            {out.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}

/* ───────────── Linear systems ───────────── */

export function LinearSystemTool() {
  const t = useT();
  const save = useSaveHistory();
  const [n, setN] = useState(3);
  const [cells, setCells] = useState<string[][]>([
    ["1", "1", "1", "6"],
    ["0", "2", "5", "-4"],
    ["2", "5", "-1", "27"],
  ]);
  const [out, setOut] = useState<ReturnType<typeof algebra.solveLinear> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const resize = (k: number) => {
    setN(k);
    setCells((c) => Array.from({ length: k }, (_, i) => Array.from({ length: k + 1 }, (_, j) => c[i]?.[j === k ? (c[i]?.length ?? 1) - 1 : j] ?? "0")));
  };
  const run = () => {
    const [r, e] = attempt(() => {
      const A = cells.map((row) => row.slice(0, n).map((x) => nums(x)[0] ?? 0));
      const b = cells.map((row) => nums(row[n] ?? "0")[0] ?? 0);
      return algebra.solveLinear(A, b);
    });
    setOut(r);
    setErr(e);
    if (r) save.mutate({ calculatorId: "linear-system", inputs: { matrix: cells }, outputs: r });
  };
  const vars = "xyzuvw";
  return (
    <div className="space-y-4">
      <Panel
        title={t("Equations")}
        actions={
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" disabled={n <= 2} onClick={() => resize(n - 1)} aria-label={t("Fewer unknowns")}>
              <Minus className="size-3.5" />
            </Button>
            <span className="text-[12.5px] text-fg-muted">{n}</span>
            <Button size="icon-sm" variant="ghost" disabled={n >= 6} onClick={() => resize(n + 1)} aria-label={t("More unknowns")}>
              <Plus className="size-3.5" />
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5 overflow-x-auto">
          {cells.map((row, i) => (
            <div key={i} className="flex items-center gap-1 font-mono text-[13px]">
              {row.map((v, j) => (
                <span key={j} className="flex items-center gap-1">
                  {j === n && <span className="px-1 text-fg-subtle">=</span>}
                  <input
                    value={v}
                    aria-label={j === n ? t("Right-hand side of equation {i}", { i: i + 1 }) : `${vars[j]} (${i + 1})`}
                    onChange={(e) => setCells((c) => c.map((r, a) => (a === i ? r.map((x, b) => (b === j ? e.target.value : x)) : r)))}
                    className="h-8 w-16 rounded-md border border-border bg-surface px-2 text-right outline-none focus:border-border-strong"
                  />
                  {j < n && <span className="text-fg-subtle">{vars[j]}{j < n - 1 ? " +" : ""}</span>}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Run onClick={run}>{t("Solve")}</Run>
        </div>
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {out && (
        <Panel title={t("Solution")}>
          {out.status === "unique" ? (
            out.solution!.map((v, i) => <ResultRow key={i} label={vars[i]} value={fmt(v)} />)
          ) : (
            <p className="text-[13px] text-fg-muted">{out.status === "none" ? t("No solution: the equations contradict each other.") : t("Infinitely many solutions: the equations aren't independent.")}</p>
          )}
        </Panel>
      )}
    </div>
  );
}

/* ───────────── Matrices ───────────── */

const parseMatrix = (s: string) =>
  s
    .trim()
    .split(/\n|;/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map(nums);

function MatrixView({ m }: { m: number[][] }) {
  return (
    <div className="inline-block overflow-x-auto rounded-lg border-x-2 border-fg-subtle/60 px-2 py-1">
      <table className="font-mono text-[13px]">
        <tbody>
          {m.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className="px-2 py-0.5 text-right tabular-nums">
                  {fmt(v, 8)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatrixTool() {
  const t = useT();
  const save = useSaveHistory();
  const [a, setA] = useState("4 7\n2 6");
  const [b, setB] = useState("1 0\n0 1");
  const [k, setK] = useState("2");
  const [out, setOut] = useState<{ label: string; m?: number[][]; v?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const op = (label: string, f: () => number[][] | number | string) => {
    const [r, e] = attempt(f);
    setErr(e);
    if (r === null) return setOut(null);
    const o = typeof r === "object" ? { label, m: r } : { label, v: typeof r === "number" ? fmt(r) : r };
    setOut(o);
    save.mutate({ calculatorId: "matrix", inputs: { A: a, B: b, op: label }, outputs: o });
  };
  const A = () => parseMatrix(a);
  const B = () => parseMatrix(b);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="A">
          <textarea value={a} onChange={(e) => setA(e.target.value)} rows={4} aria-label="A" className="w-full rounded-lg border border-border bg-surface p-2 font-mono text-[13px] outline-none focus:border-border-strong" />
        </Panel>
        <Panel title="B">
          <textarea value={b} onChange={(e) => setB(e.target.value)} rows={4} aria-label="B" className="w-full rounded-lg border border-border bg-surface p-2 font-mono text-[13px] outline-none focus:border-border-strong" />
        </Panel>
      </div>
      <p className="text-[12px] text-fg-subtle">{t("One row per line, values separated by spaces or commas.")}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => op("A + B", () => M.add(A(), B()))}>A + B</Button>
        <Button size="sm" onClick={() => op("A − B", () => M.subtract(A(), B()))}>A − B</Button>
        <Button size="sm" onClick={() => op("A × B", () => M.multiply(A(), B()))}>A × B</Button>
        <Button size="sm" onClick={() => op("det A", () => M.determinant(A()))}>det A</Button>
        <Button size="sm" onClick={() => op("A⁻¹", () => M.inverse(A()))}>A⁻¹</Button>
        <Button size="sm" onClick={() => op("Aᵀ", () => M.transpose(A()))}>Aᵀ</Button>
        <Button size="sm" onClick={() => op("tr A", () => M.trace(A()))}>tr A</Button>
        <Button size="sm" onClick={() => op("rank A", () => algebra.matrixRank(A()))}>rank A</Button>
        <Button size="sm" onClick={() => op("eig A", () => M.eigenvalues2(A()).map((z) => algebra.formatComplex(z, 8)).join(", "))}>{t("Eigenvalues (2×2)")}</Button>
        <span className="flex items-center gap-1">
          <Button size="sm" onClick={() => op(`A^${k}`, () => M.power(A(), Number(k)))}>Aⁿ</Button>
          <input value={k} onChange={(e) => setK(e.target.value)} aria-label="n" className="h-7 w-12 rounded-md border border-border bg-surface px-2 font-mono text-[12.5px]" />
        </span>
        <span className="flex items-center gap-1">
          <Button size="sm" onClick={() => op(`${k}·A`, () => M.scale(A(), Number(k)))}>k·A</Button>
        </span>
      </div>
      <ErrorLine>{err}</ErrorLine>
      {out && (
        <Panel title={out.label}>
          {out.m ? <MatrixView m={out.m} /> : <div className="font-mono text-[18px]">{out.v}</div>}
        </Panel>
      )}
    </div>
  );
}

export function VectorTool() {
  const t = useT();
  const [a, setA] = useState("1, 2, 3");
  const [b, setB] = useState("4, 5, 6");
  const [res] = [
    attempt(() => {
      const u = nums(a);
      const v = nums(b);
      return {
        dot: M.dot(u, v),
        cross: u.length === 3 && v.length === 3 ? M.cross(u, v) : null,
        magA: M.magnitude(u),
        magB: M.magnitude(v),
        angle: (M.angleBetween(u, v) * 180) / Math.PI,
      };
    }),
  ];
  const [r, err] = res;
  return (
    <div className="space-y-4">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="a" value={a} onChange={setA} mono />
          <TextField label="b" value={b} onChange={setB} mono />
        </div>
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {r && (
        <Panel title={t("Results")}>
          <ResultRow label="a · b" value={fmt(r.dot)} />
          {r.cross && <ResultRow label="a × b" value={`(${r.cross.map((x) => fmt(x, 8)).join(", ")})`} />}
          <ResultRow label="|a|" value={fmt(r.magA)} />
          <ResultRow label="|b|" value={fmt(r.magB)} />
          <ResultRow label={t("Angle between")} value={fmt(r.angle)} unit="°" />
        </Panel>
      )}
    </div>
  );
}

/* ───────────── Calculus ───────────── */

function Plot({ src, a, b }: { src: string; a: number; b: number }) {
  const t = useT();
  const pts = useMemo(() => {
    const [p] = attempt(() => calculus.sample(src, a, b, 300));
    return p ?? [];
  }, [src, a, b]);
  const ys = pts.map((p) => p.y).filter(Number.isFinite);
  if (ys.length < 2) return null;
  // Clip extreme values (near poles) so the rest stays readable.
  const sorted = [...ys].sort((x, y) => x - y);
  let lo = sorted[Math.floor(sorted.length * 0.02)]!;
  let hi = sorted[Math.ceil(sorted.length * 0.98) - 1]!;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const W = 600;
  const H = 240;
  const X = (x: number) => ((x - a) / (b - a)) * W;
  const Y = (y: number) => H - ((y - lo) / (hi - lo)) * H;
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (!Number.isFinite(p.y) || p.y < lo - (hi - lo) * 2 || p.y > hi + (hi - lo) * 2) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`;
    pen = true;
  }
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-60 w-full rounded-lg border border-border bg-bg-subtle" role="img" aria-label={t("Plot of {f}", { f: src })}>
        {lo < 0 && hi > 0 && <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} className="stroke-border-strong" strokeWidth={1} />}
        {a < 0 && b > 0 && <line y1={0} y2={H} x1={X(0)} x2={X(0)} className="stroke-border-strong" strokeWidth={1} />}
        <path d={d} fill="none" strokeWidth={2} style={{ stroke: "var(--accent)" }} />
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-[11px] text-fg-subtle">
        <span>x = {fmt(a, 4)}</span>
        <span>
          y ∈ [{fmt(lo, 4)}, {fmt(hi, 4)}]
        </span>
        <span>x = {fmt(b, 4)}</span>
      </figcaption>
    </figure>
  );
}

type CalcMode = "derivative" | "integral" | "limit" | "taylor" | "sum" | "tangent" | "roots";

export function CalculusTool() {
  const t = useT();
  const save = useSaveHistory();
  const [mode, setMode] = useState<CalcMode>("derivative");
  const [f, setF] = useState("x^3 - 2x");
  const [a, setA] = useState("0");
  const [b, setB] = useState("2");
  const [order, setOrder] = useState("1");
  const [out, setOut] = useState<{ rows: [string, string][]; steps?: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const num = (s: string) => {
    const v = Number(s);
    if (!Number.isFinite(v)) throw new Error(t("Limits and points must be numbers"));
    return v;
  };
  const run = () => {
    const [r, e] = attempt((): { rows: [string, string][]; steps?: string[] } => {
      switch (mode) {
        case "derivative": {
          const d = calculus.derivative(f, { order: Number(order) || 1, at: a.trim() ? num(a) : undefined });
          return { rows: [[`d${d.order > 1 ? `^${d.order}` : ""}/dx${d.order > 1 ? `^${d.order}` : ""}`, d.derivative], ...(d.valueAt !== null ? ([[t("at x = {x}", { x: a }), fmt(d.valueAt)]] as [string, string][]) : [])], steps: d.steps };
        }
        case "integral": {
          const r = calculus.integrate(f, num(a), num(b));
          return { rows: [[`∫ ${t("from {a} to {b}", { a, b })}`, fmt(r.value)]], steps: [t("Numerical: {method}", { method: r.method })] };
        }
        case "limit": {
          const at = a.trim() === "inf" || a.trim() === "∞" ? "inf" : a.trim() === "-inf" ? "-inf" : num(a);
          const r = calculus.limit(f, at);
          const show = (v: number | null) => (v === null ? "?" : v === Infinity ? "∞" : v === -Infinity ? "−∞" : fmt(v));
          return {
            rows: [
              [t("Limit"), r.verdict === "different sides" ? t("doesn't exist (the sides differ)") : r.verdict === "unknown" ? t("couldn't be estimated") : show(r.value)],
              ...(typeof at === "number" ? ([[t("From the left"), show(r.left)], [t("From the right"), show(r.right)]] as [string, string][]) : []),
            ],
            steps: [t("Estimated numerically by approaching the point.")],
          };
        }
        case "taylor": {
          const r = calculus.taylor(f, num(a), Number(order) || 4);
          return { rows: [[t("Taylor polynomial"), r.polynomial]] };
        }
        case "sum": {
          return { rows: [[`Σ ${t("for k from {a} to {b}", { a, b })}`, fmt(calculus.summation(f, num(a), num(b), "k"))]], steps: [t("Use k as the variable.")] };
        }
        case "tangent": {
          const r = calculus.tangentLine(f, num(a));
          return { rows: [[t("Tangent line"), r.equation], [t("Slope"), fmt(r.slope)], [`f(${a})`, fmt(r.y0)]] };
        }
        case "roots": {
          const r = calculus.findRoots(f, num(a), num(b));
          const h = calculus.horizontalTangents(f, num(a), num(b));
          return { rows: [[t("Roots"), r.length ? r.map((x) => fmt(x, 8)).join(", ") : t("none in this range")], [t("Horizontal tangents"), h.length ? h.map((x) => fmt(x, 8)).join(", ") : t("none")]] };
        }
      }
    });
    setOut(r);
    setErr(e);
    if (r) save.mutate({ calculatorId: "calculus", inputs: { mode, f, a, b, order }, outputs: r.rows });
  };
  const [validFn] = attempt(() => compileFn(f, mode === "sum" ? "k" : "x"));
  const range = mode === "integral" || mode === "roots";
  return (
    <div className="space-y-4">
      <Tabs
        value={mode}
        onChange={(m) => {
          setMode(m);
          setOut(null);
          if (m === "sum") {
            setF("1/k^2");
            setA("1");
            setB("100");
          }
        }}
        options={[
          { v: "derivative", l: t("Derivative") },
          { v: "integral", l: t("Integral") },
          { v: "limit", l: t("Limit") },
          { v: "taylor", l: t("Taylor series") },
          { v: "sum", l: t("Sum") },
          { v: "tangent", l: t("Tangent line") },
          { v: "roots", l: t("Roots") },
        ]}
      />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
          <TextField label={mode === "sum" ? "f(k)" : "f(x)"} value={f} onChange={setF} mono />
          <TextField label={range || mode === "sum" ? t("From") : mode === "limit" ? t("x approaches (or inf)") : mode === "taylor" ? t("About x =") : t("At x = (optional)")} value={a} onChange={setA} mono />
          {range || mode === "sum" ? (
            <TextField label={t("To")} value={b} onChange={setB} mono />
          ) : mode === "derivative" || mode === "taylor" ? (
            <TextField label={mode === "taylor" ? t("Degree") : t("Order")} value={order} onChange={setOrder} mono type="number" min={1} max={12} />
          ) : (
            <span />
          )}
        </div>
        <p className="mt-2 text-[12px] text-fg-subtle">{t("Angles in radians. Functions: sin, cos, tan, exp, ln, log, sqrt, abs, sinh… Write 2x for 2·x.")}</p>
        <div className="mt-3">
          <Run onClick={run} />
        </div>
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {out && (
        <Panel title={t("Result")}>
          {out.rows.map(([l, v], i) => (
            <ResultRow key={i} label={l} value={v} />
          ))}
          {out.steps && out.steps.length > 0 && (
            <ol className="mt-3 list-decimal space-y-0.5 pl-5 font-mono text-[12.5px] text-fg-muted">
              {out.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </Panel>
      )}
      {validFn && mode !== "sum" && (
        <Panel title={t("Plot")}>
          <Plot src={f} a={range ? Number(a) || -5 : -5} b={range ? Number(b) || 5 : 5} />
        </Panel>
      )}
    </div>
  );
}

/* ───────────── Statistics ───────────── */

export function StatisticsTool() {
  const t = useT();
  const save = useSaveHistory();
  const [data, setData] = useState("2, 4, 4, 4, 5, 5, 7, 9");
  const [ys, setYs] = useState("");
  const [r, err] = attempt(() => stats.describe(stats.parseData(data)));
  const [reg, regErr] = ys.trim() ? attempt(() => stats.linearRegression(stats.parseData(data), stats.parseData(ys))) : [null, null];
  return (
    <div className="space-y-4">
      <Panel title={t("Data")}>
        <textarea value={data} onChange={(e) => setData(e.target.value)} rows={3} aria-label={t("Data")} className="w-full rounded-lg border border-border bg-surface p-2 font-mono text-[13px] outline-none focus:border-border-strong" />
        <p className="mt-1 text-[12px] text-fg-subtle">{t("Numbers separated by commas, spaces or new lines. Paste a column from a spreadsheet.")}</p>
        <label className="mt-3 block">
          <span className="text-[12px] font-medium text-fg-muted">{t("y values (optional, for regression and correlation against the data as x)")}</span>
          <textarea value={ys} onChange={(e) => setYs(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border bg-surface p-2 font-mono text-[13px] outline-none focus:border-border-strong" />
        </label>
        <div className="mt-2">
          <Button size="sm" onClick={() => r && save.mutate({ calculatorId: "statistics", inputs: { data, ys }, outputs: { ...r, regression: reg } })} disabled={!r}>
            {t("Save to history")}
          </Button>
        </div>
      </Panel>
      <ErrorLine>{err ?? regErr}</ErrorLine>
      {r && (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title={t("Summary")}>
            <ResultRow label={t("Count")} value={String(r.count)} />
            <ResultRow label={t("Sum")} value={fmt(r.sum)} />
            <ResultRow label={t("Mean")} value={fmt(r.mean)} />
            <ResultRow label={t("Median")} value={fmt(r.median)} />
            <ResultRow label={t("Mode")} value={r.modes.length ? r.modes.map((m) => fmt(m)).join(", ") : t("none")} />
            <ResultRow label={t("Min / max")} value={`${fmt(r.min)} / ${fmt(r.max)}`} />
            <ResultRow label={t("Range")} value={fmt(r.range)} />
            <ResultRow label={t("Mid-range")} value={fmt(r.midRange)} />
          </Panel>
          <Panel title={t("Spread")}>
            <ResultRow label={t("Std. deviation (sample)")} value={r.sampleStdDev === null ? "—" : fmt(r.sampleStdDev)} />
            <ResultRow label={t("Std. deviation (population)")} value={fmt(r.populationStdDev)} />
            <ResultRow label={t("Variance (sample)")} value={r.sampleVariance === null ? "—" : fmt(r.sampleVariance)} />
            <ResultRow label={t("Variance (population)")} value={fmt(r.populationVariance)} />
            <ResultRow label="Q1 / Q3" value={`${fmt(r.q1)} / ${fmt(r.q3)}`} />
            <ResultRow label={t("Interquartile range")} value={fmt(r.iqr)} />
            <ResultRow label={t("Standard error")} value={r.standardError === null ? "—" : fmt(r.standardError)} />
          </Panel>
          {reg && (
            <Panel title={t("Linear regression")} className="md:col-span-2">
              <ResultRow label={t("Line")} value={reg.equation} />
              <ResultRow label={t("Correlation r")} value={fmt(reg.r, 6)} />
              <ResultRow label="R²" value={fmt(reg.r2, 6)} />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

type Dist = "normal" | "t" | "chi2" | "binomial" | "poisson" | "z";

export function DistributionsTool() {
  const t = useT();
  const [d, setD] = useState<Dist>("normal");
  const [p, setP] = useState<Record<string, string>>({ x: "1.96", mu: "0", sigma: "1", df: "10", n: "10", k: "3", prob: "0.5", lambda: "2", obs: "10, 20, 30", exp: "20, 20, 20" });
  const g = (k: string) => {
    const v = Number(p[k]);
    if (!Number.isFinite(v)) throw new Error(t("{k} must be a number", { k }));
    return v;
  };
  const field = (k: string, label: string) => <TextField key={k} label={label} value={p[k] ?? ""} onChange={(v) => setP((x) => ({ ...x, [k]: v }))} mono />;
  const [rows, err] = attempt((): [string, string][] => {
    switch (d) {
      case "normal":
        return [
          ["P(X ≤ x)", fmt(stats.normalCdf(g("x"), g("mu"), g("sigma")), 8)],
          ["P(X > x)", fmt(1 - stats.normalCdf(g("x"), g("mu"), g("sigma")), 8)],
          [t("Density f(x)"), fmt(stats.normalPdf(g("x"), g("mu"), g("sigma")), 8)],
          ["z", fmt(stats.zScore(g("x"), g("mu"), g("sigma")), 8)],
        ];
      case "z":
        return [
          [t("p-value (two-tailed)"), fmt(stats.pValue(g("x"), 2), 8)],
          [t("p-value (one-tailed)"), fmt(stats.pValue(g("x"), 1), 8)],
          [t("z for P = x (inverse)"), g("x") > 0 && g("x") < 1 ? fmt(stats.normalInv(g("x")), 10) : "—"],
        ];
      case "t":
        return [
          ["P(T ≤ t)", fmt(stats.tCdf(g("x"), g("df")), 8)],
          [t("p-value (two-tailed)"), fmt(stats.pValue(g("x"), 2, "t", g("df")), 8)],
          [t("p-value (one-tailed)"), fmt(stats.pValue(g("x"), 1, "t", g("df")), 8)],
        ];
      case "chi2": {
        const r = stats.chiSquareTest(stats.parseData(p.obs ?? ""), stats.parseData(p.exp ?? ""));
        return [["χ²", fmt(r.chi2, 8)], [t("Degrees of freedom"), String(r.df)], ["p", fmt(r.p, 8)]];
      }
      case "binomial": {
        const r = stats.binomial(g("n"), g("k"), g("prob"));
        return [["P(X = k)", fmt(r.pmf, 8)], ["P(X ≤ k)", fmt(r.cdf, 8)], [t("Mean"), fmt(r.mean)], [t("Variance"), fmt(r.variance)]];
      }
      case "poisson": {
        const r = stats.poisson(g("lambda"), g("k"));
        return [["P(X = k)", fmt(r.pmf, 8)], ["P(X ≤ k)", fmt(r.cdf, 8)]];
      }
    }
  });
  return (
    <div className="space-y-4">
      <Tabs
        value={d}
        onChange={setD}
        options={[
          { v: "normal", l: t("Normal") },
          { v: "z", l: t("z-test p-value") },
          { v: "t", l: t("Student's t") },
          { v: "chi2", l: t("Chi-square test") },
          { v: "binomial", l: t("Binomial") },
          { v: "poisson", l: t("Poisson") },
        ]}
      />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-3">
          {d === "normal" && [field("x", "x"), field("mu", "μ"), field("sigma", "σ")]}
          {d === "z" && field("x", t("z (or a probability for the inverse)"))}
          {d === "t" && [field("x", "t"), field("df", t("Degrees of freedom"))]}
          {d === "chi2" && [field("obs", t("Observed counts")), field("exp", t("Expected counts"))]}
          {d === "binomial" && [field("n", "n"), field("k", "k"), field("prob", "p")]}
          {d === "poisson" && [field("lambda", "λ"), field("k", "k")]}
        </div>
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {rows && (
        <Panel title={t("Results")}>
          {rows.map(([l, v]) => (
            <ResultRow key={l} label={l} value={v} />
          ))}
        </Panel>
      )}
    </div>
  );
}

/* ───────────── Fractions, primes, complex, sequences, Roman ───────────── */

export function FractionsTool() {
  const t = useT();
  const [a, setA] = useState("1/3");
  const [b, setB] = useState("1/6");
  const [op, setOp] = useState<"+" | "−" | "×" | "÷">("+");
  const [dec, setDec] = useState("0.375");
  const [r, err] = attempt(() => {
    const x = algebra.parseFraction(a);
    const y = algebra.parseFraction(b);
    const f = op === "+" ? algebra.fadd(x, y) : op === "−" ? algebra.fsub(x, y) : op === "×" ? algebra.fmul(x, y) : algebra.fdiv(x, y);
    return algebra.formatFraction(f);
  });
  const [d2f, d2fErr] = attempt(() => {
    const v = Number(dec);
    if (!Number.isFinite(v)) throw new Error(t("Enter a number"));
    return algebra.formatFraction(algebra.toFraction(v));
  });
  return (
    <div className="space-y-4">
      <Panel title={t("Fraction arithmetic")}>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="a" value={a} onChange={setA} mono className="w-32" />
          <select value={op} onChange={(e) => setOp(e.target.value as typeof op)} aria-label={t("Operation")} className="h-9 rounded-lg border border-border bg-surface px-2 text-[14px]">
            {(["+", "−", "×", "÷"] as const).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <TextField label="b" value={b} onChange={setB} mono className="w-32" />
        </div>
        <p className="mt-2 text-[12px] text-fg-subtle">{t("Write 3/4, a mixed number like 1 1/2, or a decimal.")}</p>
        <ErrorLine>{err}</ErrorLine>
        {r && (
          <div className="mt-2">
            <ResultRow label={t("Fraction")} value={r.fraction} big />
            <ResultRow label={t("Mixed number")} value={r.mixed} />
            <ResultRow label={t("Decimal")} value={fmt(r.decimal)} />
          </div>
        )}
      </Panel>
      <Panel title={t("Decimal to fraction")}>
        <TextField label={t("Decimal")} value={dec} onChange={setDec} mono className="w-48" />
        <ErrorLine>{d2fErr}</ErrorLine>
        {d2f && <ResultRow label={t("Fraction")} value={d2f.fraction} />}
      </Panel>
    </div>
  );
}

export function NumberTheoryTool() {
  const t = useT();
  const [n, setN] = useState("360");
  const [list, setList] = useState("48, 180, 64");
  const [upto, setUpto] = useState("100");
  const [f, fErr] = attempt(() => {
    const v = Number(n);
    return { prime: algebra.isPrime(v), factors: algebra.primeFactors(v) };
  });
  const [g, gErr] = attempt(() => {
    const v = nums(list);
    return { gcd: algebra.gcd(v), lcm: algebra.lcm(v) };
  });
  const [p, pErr] = attempt(() => algebra.primesUpTo(Math.min(Number(upto), 100000)));
  const sup = (k: number) => String(k).split("").map((x) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(x)]).join("");
  return (
    <div className="space-y-4">
      <Panel title={t("Prime factorization")}>
        <TextField label="n" value={n} onChange={setN} mono className="w-56" />
        <ErrorLine>{fErr}</ErrorLine>
        {f && (
          <div className="mt-2">
            <ResultRow label={t("Factors")} value={f.factors.map((x) => `${x.prime}${x.power > 1 ? sup(x.power) : ""}`).join(" × ")} />
            <ResultRow label={t("Prime?")} value={f.prime ? t("Yes") : t("No")} />
          </div>
        )}
      </Panel>
      <Panel title={t("GCD and LCM")}>
        <TextField label={t("Whole numbers")} value={list} onChange={setList} mono />
        <ErrorLine>{gErr}</ErrorLine>
        {g && (
          <div className="mt-2">
            <ResultRow label="GCD" value={String(g.gcd)} />
            <ResultRow label="LCM" value={String(g.lcm)} />
          </div>
        )}
      </Panel>
      <Panel title={t("Primes up to n")}>
        <TextField label="n" value={upto} onChange={setUpto} mono className="w-40" />
        <ErrorLine>{pErr}</ErrorLine>
        {p && (
          <p className="mt-2 max-h-40 overflow-y-auto font-mono text-[12.5px] text-fg-muted">
            {t.n(p.length, "{n} prime", "{n} primes")}: {p.slice(0, 2000).join(", ")}
          </p>
        )}
      </Panel>
    </div>
  );
}

export function ComplexTool() {
  const t = useT();
  const [a, setA] = useState("3+4i");
  const [b, setB] = useState("1-2i");
  const [r, err] = attempt(() => {
    const x = algebra.parseComplex(a);
    const y = algebra.parseComplex(b);
    const f = (z: algebra.Complex) => algebra.formatComplex(z, 10);
    return {
      sum: f(algebra.cadd(x, y)),
      diff: f(algebra.csub(x, y)),
      prod: f(algebra.cmul(x, y)),
      quot: attempt(() => f(algebra.cdiv(x, y)))[0] ?? t("undefined (b = 0)"),
      mod: algebra.cabs(x),
      arg: (algebra.carg(x) * 180) / Math.PI,
      conj: f(algebra.cconj(x)),
      sqrt: f(algebra.csqrt(x)),
    };
  });
  return (
    <div className="space-y-4">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="a" value={a} onChange={setA} mono />
          <TextField label="b" value={b} onChange={setB} mono />
        </div>
        <p className="mt-2 text-[12px] text-fg-subtle">{t("Rectangular form: 3+4i or 3+4j.")}</p>
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {r && (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title={t("a and b")}>
            <ResultRow label="a + b" value={r.sum} />
            <ResultRow label="a − b" value={r.diff} />
            <ResultRow label="a × b" value={r.prod} />
            <ResultRow label="a ÷ b" value={r.quot} />
          </Panel>
          <Panel title={t("a alone")}>
            <ResultRow label="|a|" value={fmt(r.mod)} />
            <ResultRow label="arg a" value={fmt(r.arg)} unit="°" />
            <ResultRow label={t("Polar form")} value={`${fmt(r.mod, 6)} ∠ ${fmt(r.arg, 6)}°`} />
            <ResultRow label={t("Conjugate")} value={r.conj} />
            <ResultRow label="√a" value={r.sqrt} />
          </Panel>
        </div>
      )}
    </div>
  );
}

export function SequencesTool() {
  const t = useT();
  const [kind, setKind] = useState<"arith" | "geo">("arith");
  const [a1, setA1] = useState("2");
  const [d, setD] = useState("3");
  const [n, setN] = useState("10");
  const [r, err] = attempt(() => (kind === "arith" ? algebra.arithmeticSequence(Number(a1), Number(d), Number(n)) : algebra.geometricSequence(Number(a1), Number(d), Number(n))));
  return (
    <div className="space-y-4">
      <Tabs value={kind} onChange={setKind} options={[{ v: "arith", l: t("Arithmetic") }, { v: "geo", l: t("Geometric") }]} />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label={t("First term")} value={a1} onChange={setA1} mono />
          <TextField label={kind === "arith" ? t("Common difference") : t("Common ratio")} value={d} onChange={setD} mono />
          <TextField label="n" value={n} onChange={setN} mono />
        </div>
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {r && (
        <Panel title={t("Results")}>
          <ResultRow label={t("nth term")} value={fmt(r.nth)} />
          <ResultRow label={t("Sum of n terms")} value={fmt(r.sum)} />
          {"infiniteSum" in r && typeof r.infiniteSum === "number" && <ResultRow label={t("Sum to infinity")} value={fmt(r.infiniteSum)} />}
          <p className="mt-2 font-mono text-[12.5px] text-fg-muted">{r.terms.map((x) => fmt(x, 6)).join(", ")}{Number(n) > 20 ? ", …" : ""}</p>
        </Panel>
      )}
    </div>
  );
}

export function RomanTool() {
  const t = useT();
  const [n, setN] = useState("2026");
  const [s, setS] = useState("MCMXCIV");
  const [a, aErr] = attempt(() => algebra.toRoman(Number(n)));
  const [b, bErr] = attempt(() => algebra.fromRoman(s));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title={t("Number to Roman")}>
        <TextField label={t("Number (1–3999)")} value={n} onChange={setN} mono />
        <ErrorLine>{aErr}</ErrorLine>
        {a && <ResultRow label={t("Roman")} value={a} big />}
      </Panel>
      <Panel title={t("Roman to number")}>
        <TextField label={t("Roman numeral")} value={s} onChange={setS} mono />
        <ErrorLine>{bErr}</ErrorLine>
        {b !== null && <ResultRow label={t("Number")} value={String(b)} big />}
      </Panel>
    </div>
  );
}
