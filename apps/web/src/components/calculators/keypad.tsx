"use client";

import { calc, CONSTANTS, formatNumber, type AngleMode } from "@aatmiq/calculators";
import { Delete } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { CopyButton, useSaveHistory } from "./shared";

type Format = "norm" | "fix" | "sci" | "eng";
const VAR_KEYS = ["A", "B", "C", "D", "E", "F", "X", "Y", "M"] as const;
const STORE = "gem.calculator.memory";

interface Memory {
  vars: Record<string, number>;
  ans: number;
}

function loadMemory(): Memory {
  try {
    const m = JSON.parse(localStorage.getItem(STORE) ?? "null") as Memory | null;
    if (m && typeof m.ans === "number") return m;
  } catch {
    /* private window or cleared storage */
  }
  return { vars: {}, ans: 0 };
}
function saveMemory(m: Memory) {
  try {
    localStorage.setItem(STORE, JSON.stringify(m));
  } catch {
    /* not kept */
  }
}

function show(v: number, f: Format, fixed: number) {
  if (f === "fix") return v.toFixed(fixed);
  if (f === "sci") return formatNumber(v, fixed + 1, "sci");
  if (f === "eng") return formatNumber(v, 10, "eng");
  return formatNumber(v, 12);
}

interface Line {
  expr: string;
  result: string;
}

/** Keypad calculators: "basic" (arithmetic, %, memory) and "scientific" (Casio fx-991EX-style). */
export function Keypad({ mode }: { mode: "basic" | "scientific" }) {
  const t = useT();
  const save = useSaveHistory();
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string>("0");
  const [error, setError] = useState<string | null>(null);
  const [angle, setAngle] = useState<AngleMode>("deg");
  const [format, setFormat] = useState<Format>("norm");
  const [shift, setShift] = useState(false);
  const [hyp, setHyp] = useState(false);
  const [storing, setStoring] = useState<"sto" | "rcl" | null>(null);
  const [mem, setMem] = useState<Memory>({ vars: {}, ans: 0 });
  const [lines, setLines] = useState<Line[]>([]);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sci = mode === "scientific";

  useEffect(() => setMem(loadMemory()), []);
  const updateMem = (m: Memory) => {
    setMem(m);
    saveMemory(m);
  };
  const vars = { ...mem.vars, Ans: mem.ans };

  const insert = useCallback(
    (s: string) => {
      setError(null);
      setShift(false);
      setExpr((e) => {
        // After "=", an operator continues from the answer; a number starts again.
        if (justEvaluated) {
          setJustEvaluated(false);
          return /^[+\-*/^×÷−%!)]/.test(s) ? `Ans${s}` : s;
        }
        const el = inputRef.current;
        if (el && document.activeElement === el && el.selectionStart !== null) {
          const a = el.selectionStart;
          const b = el.selectionEnd ?? a;
          const next = e.slice(0, a) + s + e.slice(b);
          requestAnimationFrame(() => el.setSelectionRange(a + s.length, a + s.length));
          return next;
        }
        return e + s;
      });
    },
    [justEvaluated],
  );

  const evaluate = useCallback(() => {
    const src = expr.trim();
    if (!src) return;
    try {
      // Pol(x, y) and Rec(r, θ): two results, kept in X and Y as on a Casio.
      const pol = /^(Pol|Rec)\((.+),(.+)\)$/i.exec(src.replace(/\s+/g, ""));
      if (pol) {
        const a = calc(pol[2]!, { angle, vars });
        const b = calc(pol[3]!, { angle, vars });
        const toAng = (r: number) => (angle === "deg" ? (r * 180) / Math.PI : angle === "grad" ? (r * 200) / Math.PI : r);
        const fromAng = (x: number) => (angle === "deg" ? (x * Math.PI) / 180 : angle === "grad" ? (x * Math.PI) / 200 : x);
        const [x, y] = pol[1]!.toLowerCase() === "pol" ? [Math.hypot(a, b), toAng(Math.atan2(b, a))] : [a * Math.cos(fromAng(b)), a * Math.sin(fromAng(b))];
        const text = pol[1]!.toLowerCase() === "pol" ? `r = ${show(x, format, 4)},  θ = ${show(y, format, 4)}` : `x = ${show(x, format, 4)},  y = ${show(y, format, 4)}`;
        updateMem({ vars: { ...mem.vars, X: x, Y: y }, ans: x });
        setResult(text);
        setLines((l) => [{ expr: src, result: text }, ...l].slice(0, 50));
        setJustEvaluated(true);
        return;
      }
      const v = calc(src, { angle, vars });
      const text = show(v, format, 4);
      updateMem({ ...mem, ans: v });
      setResult(text);
      setError(null);
      setLines((l) => [{ expr: src, result: text }, ...l].slice(0, 50));
      setJustEvaluated(true);
      save.mutate({ calculatorId: mode, expression: src, angle, vars });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [expr, angle, vars, format, mem, mode, save]);

  const backspace = () => {
    setJustEvaluated(false);
    setExpr((e) => e.replace(/(sinh|cosh|tanh|asin|acos|atan|asinh|acosh|atanh|sin|cos|tan|log|ln|sqrt|cbrt|root|abs|exp|nPr|nCr|mod|Ans|Pol|Rec|randint|rand)\($|.$/, ""));
  };
  const clearAll = () => {
    setExpr("");
    setResult("0");
    setError(null);
    setJustEvaluated(false);
  };
  const memoryOp = (op: "M+" | "M-" | "MR" | "MC" | "MS") => {
    let current = mem.ans;
    try {
      if (expr.trim() && !justEvaluated) current = calc(expr, { angle, vars });
    } catch {
      /* use the last answer */
    }
    const m = mem.vars.M ?? 0;
    if (op === "MR") return insert("M");
    const next = op === "M+" ? m + current : op === "M-" ? m - current : op === "MS" ? current : 0;
    updateMem({ ...mem, vars: { ...mem.vars, M: next } });
  };
  const variable = (k: string) => {
    if (storing === "sto") {
      updateMem({ ...mem, vars: { ...mem.vars, [k]: mem.ans } });
      setStoring(null);
      return;
    }
    setStoring(null);
    insert(k);
  };

  // Keyboard: digits, letters (sqrt, sin, variables) and operators type, Enter evaluates, Escape clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && target !== inputRef.current) return;
      if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key === "c" && !window.getSelection()?.toString()) void navigator.clipboard?.writeText(result);
        return;
      }
      if (target === inputRef.current) {
        if (e.key === "Enter") {
          e.preventDefault();
          evaluate();
        }
        return;
      }
      if (/^[0-9A-Za-zπ.+\-*/^()%!, ]$/.test(e.key)) {
        e.preventDefault();
        insert(e.key);
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        evaluate();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === "Escape") clearAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fn = (name: string) => () => insert(`${name}(`);
  const trig = (base: "sin" | "cos" | "tan") => {
    const name = `${shift ? "a" : ""}${base}${hyp ? "h" : ""}`;
    return { label: `${base}${hyp ? "h" : ""}${shift ? "⁻¹" : ""}`, on: () => { insert(`${name}(`); setHyp(false); } };
  };

  const K = ({ children, onClick, tone = "fn", className, label }: { children: React.ReactNode; onClick: () => void; tone?: "num" | "op" | "fn" | "eq" | "warn" | "toggle"; className?: string; label?: string }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-11 items-center justify-center rounded-lg text-[14px] transition-[background-color,transform] select-none active:scale-[0.97]",
        tone === "num" && "bg-surface-2 font-medium text-fg hover:bg-surface-3",
        tone === "op" && "bg-surface-3 text-fg hover:brightness-110",
        tone === "fn" && "border border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
        tone === "eq" && "bg-primary font-medium text-primary-fg hover:opacity-90",
        tone === "warn" && "bg-danger-soft text-danger hover:brightness-110",
        tone === "toggle" && "border border-border bg-surface text-fg-muted hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-soft">
        {/* Display */}
        <div className="rounded-xl bg-bg-subtle p-3">
          <div className="flex h-4 items-center gap-2 font-mono text-[10.5px] text-fg-subtle">
            {sci && <span className={cn(shift && "text-warning")}>{shift ? "SHIFT" : ""}</span>}
            {sci && <span>{hyp ? "HYP" : ""}</span>}
            {sci && <span>{angle.toUpperCase()}</span>}
            {format !== "norm" && <span>{format.toUpperCase()}</span>}
            {storing && <span className="text-warning">{storing.toUpperCase()}</span>}
            {(mem.vars.M ?? 0) !== 0 && <span>M</span>}
          </div>
          <input
            ref={inputRef}
            value={expr}
            onChange={(e) => {
              setExpr(e.target.value);
              setJustEvaluated(false);
              setError(null);
            }}
            spellCheck={false}
            aria-label={t("Expression")}
            placeholder="0"
            className="mt-1 w-full bg-transparent font-mono text-[15px] text-fg-muted outline-none placeholder:text-fg-subtle"
          />
          <div className="mt-1 flex items-center justify-end gap-1">
            <output aria-live="polite" className={cn("min-w-0 truncate text-right font-mono tabular-nums", error ? "text-[13px] text-danger" : "text-[28px] text-fg")}>
              {error ?? result}
            </output>
            {!error && <CopyButton text={result} />}
          </div>
        </div>

        {sci && (
          <>
            <div className="mt-3 grid grid-cols-6 gap-1.5">
              <K tone="toggle" onClick={() => setShift((s) => !s)} className={cn(shift && "border-warning text-warning")}>SHIFT</K>
              <K tone="toggle" onClick={() => setHyp((h) => !h)} className={cn(hyp && "border-fg text-fg")}>hyp</K>
              <K tone="toggle" onClick={() => setAngle((a) => (a === "deg" ? "rad" : a === "rad" ? "grad" : "deg"))} label={t("Angle mode")}>{angle.toUpperCase()}</K>
              <K tone="toggle" onClick={() => setFormat((f) => (f === "norm" ? "fix" : f === "fix" ? "sci" : f === "sci" ? "eng" : "norm"))} label={t("Number format")}>{format === "norm" ? "NORM" : format.toUpperCase()}</K>
              <K tone="toggle" onClick={() => setStoring((s) => (s === "sto" ? null : "sto"))} className={cn(storing === "sto" && "border-warning text-warning")}>STO</K>
              <K onClick={() => insert("Ans")}>Ans</K>

              <K onClick={() => insert("^2")}>x²</K>
              <K onClick={() => insert("^3")}>x³</K>
              <K onClick={() => insert("^")}>xʸ</K>
              <K onClick={() => insert(shift ? "cbrt(" : "√(")}>{shift ? "∛" : "√"}</K>
              <K onClick={fn("root")}>ⁿ√</K>
              <K onClick={() => insert("^(-1)")}>x⁻¹</K>

              <K onClick={() => insert(shift ? "10^" : "log(")}>{shift ? "10ˣ" : "log"}</K>
              <K onClick={() => insert(shift ? "e^" : "ln(")}>{shift ? "eˣ" : "ln"}</K>
              <K onClick={() => insert("log(")} label={t("Logarithm with a base: log(x, base)")}>logₐ</K>
              {(["sin", "cos", "tan"] as const).map((b) => {
                const k = trig(b);
                return (
                  <K key={b} onClick={k.on}>
                    {k.label}
                  </K>
                );
              })}

              <K onClick={() => insert("(")}>(</K>
              <K onClick={() => insert(")")}>)</K>
              <K onClick={() => insert(",")}>,</K>
              <K onClick={() => insert(" nPr ")}>nPr</K>
              <K onClick={() => insert(" nCr ")}>nCr</K>
              <K onClick={() => insert("!")}>x!</K>

              <K onClick={() => insert("π")}>π</K>
              <K onClick={() => insert("e")}>e</K>
              <K onClick={() => insert("abs(")}>|x|</K>
              <K onClick={() => insert(" mod ")}>mod</K>
              <K onClick={() => insert(shift ? "randint(" : "rand()")}>{shift ? "RanInt" : "Ran#"}</K>
              <K onClick={() => insert("°")}>°</K>

              <K onClick={() => insert(shift ? "Rec(" : "Pol(")}>{shift ? "Rec" : "Pol"}</K>
              <K onClick={() => insert("E")} label={t("Times ten to the power")}>EXP</K>
              <K onClick={() => insert("(-")}>(−)</K>
              <K onClick={() => setStoring((s) => (s === "rcl" ? null : "rcl"))} className={cn(storing === "rcl" && "border-warning text-warning")}>RCL</K>
              <K onClick={() => insert("%")}>%</K>
              <select
                aria-label={t("Insert a physical constant")}
                value=""
                onChange={(e) => e.target.value && insert(e.target.value)}
                className="h-11 rounded-lg border border-border bg-surface px-1 text-[12px] text-fg-muted"
              >
                <option value="">{t("Const")}</option>
                {Object.entries(CONSTANTS)
                  .filter(([k]) => !["π", "φ", "pi"].includes(k))
                  .map(([k, c]) => (
                    <option key={k} value={k}>
                      {k}: {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="mt-1.5 grid grid-cols-9 gap-1">
              {VAR_KEYS.map((k) => (
                <K key={k} onClick={() => variable(k)} className="h-8 text-[12px]" label={t("Variable {k}", { k })}>
                  {k}
                </K>
              ))}
            </div>
          </>
        )}

        {/* Memory */}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {(["MC", "MR", "M+", "M-", "MS"] as const).map((m) => (
            <K key={m} onClick={() => memoryOp(m)} className="h-8 text-[12.5px]">
              {m}
            </K>
          ))}
        </div>

        {/* Number pad */}
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          <K tone="warn" onClick={clearAll}>{sci ? "AC" : "C"}</K>
          <K tone="op" onClick={() => setExpr("")}>CE</K>
          <K tone="op" onClick={backspace} label={t("Delete")}>
            <Delete className="size-4" />
          </K>
          <K tone="op" onClick={() => insert("÷")}>÷</K>
          {["7", "8", "9"].map((d) => (
            <K key={d} tone="num" onClick={() => insert(d)}>{d}</K>
          ))}
          <K tone="op" onClick={() => insert("×")}>×</K>
          {["4", "5", "6"].map((d) => (
            <K key={d} tone="num" onClick={() => insert(d)}>{d}</K>
          ))}
          <K tone="op" onClick={() => insert("−")}>−</K>
          {["1", "2", "3"].map((d) => (
            <K key={d} tone="num" onClick={() => insert(d)}>{d}</K>
          ))}
          <K tone="op" onClick={() => insert("+")}>+</K>
          {sci ? <K tone="num" onClick={() => insert("(-")}>±</K> : <K tone="op" onClick={() => insert("%")}>%</K>}
          <K tone="num" onClick={() => insert("0")}>0</K>
          <K tone="num" onClick={() => insert(".")}>.</K>
          <K tone="eq" onClick={evaluate}>=</K>
        </div>
      </div>

      {/* This session's lines; saved history is in the History tab. */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-[13px] font-medium text-fg">{t("This session")}</h3>
        {sci && (
          <p className="mb-3 text-[12px] text-fg-subtle">
            {t("Multiplication without a sign binds first, as on a Casio: 1/2πf means 1/(2πf). STO stores the last answer in a letter; letters written together multiply.")}
          </p>
        )}
        {lines.length === 0 ? (
          <p className="text-[12.5px] text-fg-subtle">{t("Your calculations appear here. Type on the keyboard too: Enter for =, Esc to clear.")}</p>
        ) : (
          <ul className="space-y-1">
            {lines.map((l, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    setExpr(l.expr);
                    setJustEvaluated(false);
                  }}
                  className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left font-mono text-[13px] hover:bg-surface-2"
                >
                  <span className="truncate text-fg-muted">{l.expr}</span>
                  <span className="shrink-0 text-fg">= {l.result}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {sci && Object.keys(mem.vars).length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-1 text-[12px] text-fg-subtle">{t("Stored")}</div>
            <div className="flex flex-wrap gap-2 font-mono text-[12.5px]">
              {Object.entries(mem.vars).map(([k, v]) => (
                <span key={k} className="rounded bg-surface-2 px-1.5 py-0.5 text-fg-muted">
                  {k} = {formatNumber(v, 8)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
