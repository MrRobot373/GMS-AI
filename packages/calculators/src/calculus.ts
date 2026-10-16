/**
 * Calculus tools on f(x): derivatives (symbolic, with a numeric check), definite integrals
 * (adaptive Simpson), limits, Taylor series, sums, tangent lines and roots. All in radians.
 */
import { compileFn, evaluate, ExprError, parse, type Node } from "./expression";
import { dependsOn, differentiate, simplify, toString } from "./symbolic";

export interface DerivativeResult {
  expression: string;
  derivative: string;
  order: number;
  /** Each order's derivative, printed. */
  steps: string[];
  /** f^(n)(at), when a point was given. */
  valueAt: number | null;
}

export function derivative(src: string, opts: { variable?: string; order?: number; at?: number } = {}): DerivativeResult {
  const x = opts.variable ?? "x";
  const order = opts.order ?? 1;
  if (!Number.isInteger(order) || order < 1 || order > 10) throw new ExprError("The order must be a whole number from 1 to 10");
  let node: Node = parse(src);
  const steps: string[] = [];
  for (let k = 0; k < order; k++) {
    node = differentiate(node, x);
    steps.push(toString(node));
  }
  let valueAt: number | null = null;
  if (opts.at !== undefined) {
    valueAt = evaluate(node, { vars: { [x]: opts.at }, angle: "rad" });
  }
  return { expression: toString(simplify(parse(src))), derivative: toString(node), order, steps, valueAt };
}

/** Central-difference derivative, for checking the symbolic one. */
export function numericDerivative(f: (x: number) => number, x: number, h = 1e-5): number {
  return (f(x - 2 * h) - 8 * f(x - h) + 8 * f(x + h) - f(x + 2 * h)) / (12 * h);
}

function simpson(f: (x: number) => number, a: number, b: number, fa: number, fm: number, fb: number) {
  return ((b - a) / 6) * (fa + 4 * fm + fb);
}

function adaptive(f: (x: number) => number, a: number, b: number, eps: number, whole: number, fa: number, fm: number, fb: number, depth: number): number {
  const m = (a + b) / 2;
  const lm = (a + m) / 2;
  const rm = (m + b) / 2;
  const flm = f(lm);
  const frm = f(rm);
  const left = simpson(f, a, m, fa, flm, fm);
  const right = simpson(f, m, b, fm, frm, fb);
  if (!Number.isFinite(left + right)) throw new ExprError("The function isn't defined everywhere on this interval");
  if (depth <= 0 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15;
  return adaptive(f, a, m, eps / 2, left, fa, flm, fm, depth - 1) + adaptive(f, m, b, eps / 2, right, fm, frm, fb, depth - 1);
}

export interface IntegralResult {
  value: number;
  /** Symbolic antiderivative is not attempted; the value is numeric. */
  method: string;
}

export function integrate(src: string, a: number, b: number, opts: { variable?: string; tolerance?: number } = {}): IntegralResult {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new ExprError("The limits must be finite numbers");
  const f = compileFn(src, opts.variable ?? "x");
  if (a === b) return { value: 0, method: "equal limits" };
  const sign = a < b ? 1 : -1;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  // Split into pieces so narrow features aren't missed.
  const pieces = 16;
  const w = (hi - lo) / pieces;
  let total = 0;
  for (let k = 0; k < pieces; k++) {
    const p = lo + k * w;
    const q = k === pieces - 1 ? hi : p + w;
    const fa = f(p);
    const fb = f(q);
    const fm = f((p + q) / 2);
    if (![fa, fb, fm].every(Number.isFinite)) throw new ExprError("The function isn't defined everywhere on this interval");
    total += adaptive(f, p, q, (opts.tolerance ?? 1e-10) / pieces, simpson(f, p, q, fa, fm, fb), fa, fm, fb, 40);
  }
  return { value: sign * total, method: "adaptive Simpson's rule" };
}

export interface LimitResult {
  value: number | null;
  left: number | null;
  right: number | null;
  /** "exists", "different sides" (no two-sided limit), "infinite" or "unknown". */
  verdict: "exists" | "one-sided" | "different sides" | "infinite" | "unknown";
}

/** Estimate a limit by approaching the point from both sides (or ±∞). */
export function limit(src: string, at: number | "inf" | "-inf", opts: { variable?: string; side?: "both" | "left" | "right" } = {}): LimitResult {
  const f = compileFn(src, opts.variable ?? "x");
  const approach = (dir: 1 | -1): number | null => {
    const vals: number[] = [];
    // Toward ±∞ stop at 10⁷: beyond it, rounding error in expressions like (1 + 1/x)^x takes over.
    for (let k = 2; k <= (at === "inf" || at === "-inf" ? 7 : 9); k++) {
      const h = 10 ** -k;
      const x = at === "inf" ? 10 ** k : at === "-inf" ? -(10 ** k) : at + dir * h * Math.max(1, Math.abs(at));
      const v = f(x);
      if (Number.isFinite(v)) vals.push(v);
      else if (Math.abs(v) === Infinity) return v;
    }
    if (vals.length < 3) return null;
    const last = vals.slice(-3);
    if (last.every((v) => Math.abs(v) > 1e12)) return last[2]! > 0 ? Infinity : -Infinity;
    const [p, q, r] = last as [number, number, number];
    // Converging: the last differences shrink.
    if (Math.abs(r - q) <= Math.max(1e-6, Math.abs(q - p)) * 1.01 || Math.abs(r - q) < 1e-7 * Math.max(1, Math.abs(r))) {
      return Math.abs(r) < 1e-9 ? 0 : Number(r.toPrecision(10));
    }
    // Growing without bound.
    if (Math.abs(r) > Math.abs(q) && Math.abs(q) > Math.abs(p) && Math.abs(r) > 1e6) return r > 0 ? Infinity : -Infinity;
    return null;
  };
  if (at === "inf" || at === "-inf") {
    const v = approach(1);
    return { value: v, left: null, right: null, verdict: v === null ? "unknown" : Math.abs(v) === Infinity ? "infinite" : "exists" };
  }
  const side = opts.side ?? "both";
  const left = side === "right" ? null : approach(-1);
  const right = side === "left" ? null : approach(1);
  if (side !== "both") {
    const v = side === "left" ? left : right;
    return { value: v, left, right, verdict: v === null ? "unknown" : Math.abs(v) === Infinity ? "infinite" : "one-sided" };
  }
  if (left === null || right === null) return { value: null, left, right, verdict: "unknown" };
  const infinite = Math.abs(left) === Infinity || Math.abs(right) === Infinity;
  const close = left === right || (!infinite && Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left)));
  if (!close) return { value: null, left, right, verdict: "different sides" };
  return { value: left, left, right, verdict: Math.abs(left) === Infinity ? "infinite" : "exists" };
}

export interface TaylorResult {
  /** Coefficients c_k of (x - a)^k. */
  coefficients: number[];
  polynomial: string;
}

/** Taylor polynomial of degree n about a, from symbolic derivatives. */
export function taylor(src: string, a: number, n: number, variable = "x"): TaylorResult {
  if (!Number.isInteger(n) || n < 0 || n > 12) throw new ExprError("The degree must be a whole number from 0 to 12");
  let node = parse(src);
  const coefficients: number[] = [];
  let fact = 1;
  for (let k = 0; k <= n; k++) {
    if (k > 0) {
      node = differentiate(node, variable);
      fact *= k;
    }
    const v = evaluate(node, { vars: { [variable]: a }, angle: "rad" });
    coefficients.push(clean(v / fact));
  }
  const term = (c: number, k: number) => {
    const base = a === 0 ? variable : `(${variable} ${a > 0 ? "-" : "+"} ${Math.abs(a)})`;
    const pow = k === 0 ? "" : k === 1 ? base : `${base}^${k}`;
    const coef = fmt(Math.abs(c));
    return k === 0 ? coef : coef === "1" ? pow : `${coef}${pow}`;
  };
  const parts = coefficients.map((c, k) => ({ c, k })).filter((p) => p.c !== 0);
  const polynomial = parts.length
    ? parts.map((p, i) => `${i === 0 ? (p.c < 0 ? "-" : "") : p.c < 0 ? " - " : " + "}${term(p.c, p.k)}`).join("")
    : "0";
  return { coefficients, polynomial };
}

function clean(v: number) {
  const r = Number(v.toPrecision(12));
  return Math.abs(r) < 1e-13 ? 0 : r;
}
function fmt(v: number) {
  return String(Number(v.toPrecision(10)));
}

/** Σ f(k) for k = from..to (whole numbers, at most a million terms). */
export function summation(src: string, from: number, to: number, variable = "k"): number {
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new ExprError("The limits of a sum must be whole numbers");
  if (to < from) return 0;
  if (to - from > 1_000_000) throw new ExprError("At most a million terms");
  const node = parse(src);
  let s = 0;
  let comp = 0;
  for (let k = from; k <= to; k++) {
    // Kahan summation keeps long sums accurate.
    const y = evaluate(node, { vars: { [variable]: k }, angle: "rad" }) - comp;
    const t = s + y;
    comp = t - s - y;
    s = t;
  }
  if (!Number.isFinite(s)) throw new ExprError("The sum is too large (overflow)");
  return s;
}

export interface TangentResult {
  x0: number;
  y0: number;
  slope: number;
  /** y = m·x + b */
  intercept: number;
  equation: string;
}

export function tangentLine(src: string, x0: number, variable = "x"): TangentResult {
  const node = parse(src);
  const y0 = evaluate(node, { vars: { [variable]: x0 }, angle: "rad" });
  const slope = clean(evaluate(differentiate(node, variable), { vars: { [variable]: x0 }, angle: "rad" }));
  const intercept = clean(y0 - slope * x0);
  const equation = `y = ${fmt(slope)}${variable}${intercept < 0 ? " - " : " + "}${fmt(Math.abs(intercept))}`;
  return { x0, y0, slope, intercept, equation };
}

/** Points where f'(x) = 0 on [a, b]: the horizontal tangents. */
export function horizontalTangents(src: string, a: number, b: number, variable = "x"): number[] {
  const node = parse(src);
  const dsrc = toString(differentiate(node, variable));
  return findRoots(dsrc, a, b, variable);
}

/** Real roots of f on [a, b]: sign changes on a fine grid, refined by bisection. */
export function findRoots(src: string, a: number, b: number, variable = "x", steps = 2000): number[] {
  if (!(b > a)) throw new ExprError("The interval's end must be larger than its start");
  const f = compileFn(src, variable);
  const roots: number[] = [];
  const h = (b - a) / steps;
  let x0 = a;
  let f0 = f(x0);
  for (let k = 1; k <= steps; k++) {
    const x1 = a + k * h;
    const f1 = f(x1);
    if (Number.isFinite(f0) && Number.isFinite(f1)) {
      if (f0 === 0) roots.push(x0);
      else if (f0 * f1 < 0) {
        let lo = x0;
        let hi = x1;
        let flo = f0;
        for (let i = 0; i < 100; i++) {
          const m = (lo + hi) / 2;
          const fm = f(m);
          if (fm === 0 || hi - lo < 1e-14 * Math.max(1, Math.abs(m))) {
            lo = hi = m;
            break;
          }
          if (flo * fm < 0) hi = m;
          else {
            lo = m;
            flo = fm;
          }
        }
        const r = (lo + hi) / 2;
        // A sign change across a pole isn't a root.
        if (Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(f0), Math.abs(f1))) roots.push(r);
      }
    }
    x0 = x1;
    f0 = f1;
  }
  if (Number.isFinite(f0) && f0 === 0) roots.push(x0);
  const out: number[] = [];
  for (const r of roots.map(clean)) if (!out.some((o) => Math.abs(o - r) < 1e-9 * Math.max(1, Math.abs(r)))) out.push(r);
  return out;
}

/** Points for a plot of f on [a, b]; gaps (NaN) where it isn't defined. */
export function sample(src: string, a: number, b: number, n = 400, variable = "x"): { x: number; y: number }[] {
  const f = compileFn(src, variable);
  return Array.from({ length: n + 1 }, (_, k) => {
    const x = a + ((b - a) * k) / n;
    return { x, y: f(x) };
  });
}

export { dependsOn };
