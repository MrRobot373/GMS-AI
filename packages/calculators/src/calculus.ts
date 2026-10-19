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
  /**
   * "symbolic": exact, by substitution and L'Hôpital's rule on symbolic derivatives (checked against
   * the numbers); "numeric": estimated by approaching the point.
   */
  method: "symbolic" | "numeric";
  /** Each quotient L'Hôpital's rule went through (N′ / D′, printed), when it was used. */
  steps: string[];
}

/** A value and a bound on its rounding error. */
type Approx = [value: number, err: number];
const U = Number.EPSILON;
const numNode = (value: number): Node => ({ type: "num", value });

/** a ± b% means a·(1 ± b/100): its second operand is b itself. */
const percentOf = (n: Node): n is Extract<Node, { type: "bin" }> & { b: { type: "post"; op: "%"; arg: Node } } =>
  n.type === "bin" && (n.op === "+" || n.op === "-") && n.b.type === "post" && n.b.op === "%";

function operands(n: Node): Node[] {
  switch (n.type) {
    case "neg":
    case "post":
      return [n.arg];
    case "bin":
      return [n.a, percentOf(n) ? n.b.arg : n.b];
    case "call":
      return n.args;
    default:
      return [];
  }
}

/** One operation on known operands, by the engine's own rules (real odd roots, domains); NaN where undefined. */
function apply(n: Node, args: number[]): number {
  let node: Node;
  if (n.type === "neg") node = { type: "neg", arg: numNode(args[0]!) };
  else if (n.type === "post") node = { ...n, arg: numNode(args[0]!) };
  else if (n.type === "bin") node = { ...n, a: numNode(args[0]!), b: percentOf(n) ? { type: "post", op: "%", arg: numNode(args[1]!) } : numNode(args[1]!) };
  else if (n.type === "call") node = { ...n, args: args.map(numNode) };
  else return NaN;
  try {
    return evaluate(node, { angle: "rad" });
  } catch {
    return NaN;
  }
}

/** sin, cos, tan and cot round results under 1e-15 to 0 (sin 180° = 0), which is an error of up to 1e-15. */
const ROUNDED_TO_ZERO = new Set(["sin", "cos", "tan", "cot"]);

/** An operation's value from its operands', and how far their rounding errors can move it. */
function propagate(n: Node, ops: Approx[]): Approx {
  const v = apply(n, ops.map((o) => o[0]));
  if (!Number.isFinite(v)) return [NaN, Infinity];
  let err = 0;
  if (n.type === "neg") err = ops[0]![1];
  else if (n.type === "bin" && (n.op === "+" || n.op === "-") && !percentOf(n)) err = ops[0]![1] + ops[1]![1];
  else if (n.type === "bin" && n.op === "*") {
    const [[a, ea], [b, eb]] = ops as [Approx, Approx];
    err = Math.abs(a) * eb + Math.abs(b) * ea + ea * eb;
  } else if (n.type === "bin" && n.op === "/") {
    const [[, ea], [b, eb]] = ops as [Approx, Approx];
    err = Math.abs(b) > eb ? (ea + Math.abs(v) * eb) / (Math.abs(b) - eb) : Infinity;
  } else {
    // Anything else: move each operand by its error and see how far the result goes (scaled back
    // from a step big enough to show in floating point).
    ops.forEach(([x, e], i) => {
      if (e === 0) return;
      const step = Math.max(e, 64 * U * Math.abs(x));
      let worst = -1;
      for (const s of [1, -1]) {
        const w = apply(n, ops.map((o, j) => (j === i ? x + s * step : o[0])));
        if (Number.isFinite(w)) worst = Math.max(worst, Math.abs(w - v));
      }
      err += worst < 0 ? Infinity : worst * (e / step);
    });
    if (n.type === "call" && ROUNDED_TO_ZERO.has(n.fn) && Math.abs(v) < 1e-15) err += 1e-15;
  }
  return [v, err + U * Math.abs(v)];
}

/** f(x) with a bound on its rounding error: when the bound is near the value, cancellation has eaten the digits. */
function evalWithError(n: Node, variable: string, x: number): Approx {
  if (n.type === "num") return [n.value, Number.isInteger(n.value) ? 0 : U * Math.abs(n.value)];
  if (n.type === "var") {
    if (n.name === variable) return [x, 0];
    let v = NaN;
    try {
      v = evaluate(n, { angle: "rad" });
    } catch {
      /* not a constant */
    }
    return [v, U * Math.abs(v)];
  }
  return propagate(
    n,
    operands(n).map((c) => evalWithError(c, variable, x)),
  );
}

const isZero = ([v, e]: Approx) => Math.abs(v) <= e;

/** Functions with jumps or corners (or not functions of a real variable): the symbolic route doesn't go through them. */
const ROUGH = new Set(["abs", "sign", "floor", "ceil", "round", "mod", "fact", "gamma", "nPr", "nCr", "gcd", "lcm", "min", "max", "hypot", "atan2", "rand", "randint"]);
function smooth(n: Node): boolean {
  switch (n.type) {
    case "num":
    case "var":
      return true;
    case "neg":
      return smooth(n.arg);
    case "post":
      return n.op !== "!" && smooth(n.arg);
    case "bin":
      return n.op !== "mod" && n.op !== "nPr" && n.op !== "nCr" && smooth(n.a) && smooth(n.b);
    case "call":
      return !ROUGH.has(n.fn) && n.args.every(smooth);
  }
}

/**
 * The limit at a finite point of a smooth expression: substitution where the pieces are defined
 * (elementary functions are continuous on their domain), and L'Hôpital's rule for 0/0, on symbolic
 * derivatives. Null when this route can't decide (c/0, 0^0, ∞ - ∞…): the numbers decide then.
 */
function symbolicLimit(n: Node, x: string, a: number, steps: string[], budget: { left: number }): Approx | null {
  if (!dependsOn(n, x)) {
    const r = evalWithError(n, x, a);
    return Number.isFinite(r[0]) ? r : null;
  }
  if (n.type === "var") return [a, 0];
  if (n.type === "bin" && n.op === "/") {
    let [num, den] = [n.a, n.b];
    for (;;) {
      const ln = symbolicLimit(num, x, a, steps, budget);
      const ld = ln && symbolicLimit(den, x, a, steps, budget);
      if (!ln || !ld) return null;
      if (!isZero(ld)) {
        const r = propagate({ type: "bin", op: "/", a: num, b: den }, [ln, ld]);
        return Number.isFinite(r[0]) ? r : null;
      }
      if (!isZero(ln) || budget.left-- <= 0) return null;
      // 0/0: L'Hôpital's rule.
      try {
        num = differentiate(num, x);
        den = differentiate(den, x);
      } catch {
        return null;
      }
      steps.push(`(${toString(num)}) / (${toString(den)})`);
    }
  }
  const ops: Approx[] = [];
  for (const c of operands(n)) {
    const l = symbolicLimit(c, x, a, steps, budget);
    if (!l) return null;
    ops.push(l);
  }
  // 0^0 and 0^(negative) are not decided by substitution.
  if (n.type === "bin" && n.op === "^" && isZero(ops[0]!) && (isZero(ops[1]!) || ops[1]![0] < 0)) return null;
  const r = propagate(n, ops);
  return Number.isFinite(r[0]) ? r : null;
}

/**
 * Approach the point (or ±∞) in steps that halve, and stop before rounding error takes over: each
 * value carries a bound on its error, so (1 - cos x)/x² stops near x = 1e-4 instead of reading
 * 1 - cos x as 0. Then decide from the last good values: settled, converging at a steady rate
 * (Richardson extrapolation removes the leading error term), or growing without bound.
 */
function numericLimit(n: Node, x: string, at: number | "inf" | "-inf", dir: 1 | -1): Approx | null {
  const pts: Approx[] = [];
  const scale = typeof at === "number" ? Math.max(1, Math.abs(at)) : 1;
  for (let j = 0; j <= 66; j++) {
    const xv = at === "inf" ? 2 ** j : at === "-inf" ? -(2 ** j) : at + dir * 1e-2 * 2 ** -j * scale;
    if (xv === at) break;
    const p = evalWithError(n, x, xv);
    if (Number.isNaN(p[0])) {
      // Past the largest number (exp(1/x) near 0): growing without bound if the values before were already huge.
      const k = pts.length;
      if (k >= 3 && overflows(n, x, xv) && [k - 3, k - 2, k - 1].every((i) => Math.abs(pts[i]![0]) > 1e12 && Math.sign(pts[i]![0]) === Math.sign(pts[k - 1]![0]))) {
        return [Math.sign(pts[k - 1]![0]) * Infinity, 0];
      }
      continue;
    }
    if (!(p[1] <= 1e-8 * Math.abs(p[0]) || p[1] <= 1e-12)) break;
    pts.push(p);
  }
  const k = pts.length;
  if (k < 4) return null;
  const v = (i: number) => pts[i]![0];
  const e = (i: number) => pts[i]![1];
  // Without bound: the last values huge, of one sign.
  if ([k - 3, k - 2, k - 1].every((i) => Math.abs(v(i)) > 1e12 && Math.sign(v(i)) === Math.sign(v(k - 1)))) return [Math.sign(v(k - 1)) * Infinity, 0];
  // Settled: the last values agree to rounding.
  const last = [k - 4, k - 3, k - 2, k - 1].map(v);
  const noise = Math.max(e(k - 4), e(k - 3), e(k - 2), e(k - 1));
  const spread = Math.max(...last) - Math.min(...last);
  if (spread <= Math.max(1e-12 * Math.max(1, Math.abs(v(k - 1))), 4 * noise)) return [v(k - 1), spread + noise];
  // The latest four values whose steps stand clear of the rounding error.
  const clear = (i: number) => Math.abs(v(i) - v(i - 1)) > 8 * (e(i) + e(i - 1));
  let w = k - 1;
  while (w >= 3 && !(clear(w) && clear(w - 1) && clear(w - 2))) w--;
  if (w < 3) return null;
  const [d1, d2, d3] = [v(w - 2) - v(w - 3), v(w - 1) - v(w - 2), v(w) - v(w - 1)];
  if (Math.sign(d1) !== Math.sign(d2) || Math.sign(d2) !== Math.sign(d3)) return null;
  const [q2, q3] = [d1 / d2, d2 / d3];
  // Shrinking at a steady (or quickening) rate: the error goes like hᵖ, and Richardson extrapolation
  // removes it. Smooth functions have whole (or half, for roots) powers p: use the exact ratio 2ᵖ then.
  if (q2 > 1.05 && q3 > 1.05 && q3 >= 0.9 * q2 && (q3 <= 1.1 * q2 || q3 > 16)) {
    const p = Math.log2(q3);
    const snapped = Math.round(p * 2) / 2;
    const q = snapped > 0 && Math.abs(p - snapped) < 0.02 ? 2 ** snapped : q3;
    const L = v(w) + d3 / (q - 1);
    // The same extrapolation one step earlier: how far apart they are is the error still left.
    const err = Math.abs(L - (v(w - 1) + d2 / (q - 1))) + noise / (q - 1);
    if (!(err <= 1e-6 * Math.max(1, Math.abs(L)))) return null;
    // Values after the window, nearer the point, must not stray from it.
    for (let i = w + 1; i < k; i++) if (Math.abs(v(i) - L) > 2 * Math.abs(v(w) - L) + 4 * e(i) + err) return null;
    return [L, err];
  }
  // Steps that don't shrink, in one direction, away from zero, up to the last value: no limit (ln x at 0 grows like this).
  if (w === k - 1 && q2 <= 1.02 && q3 <= 1.02 && Math.sign(d3) === Math.sign(v(w)) && Math.abs(v(w)) > Math.abs(v(w - 3))) return [Math.sign(d3) * Infinity, 0];
  return null;
}

/** Does evaluating at x fail only because a number got too large? */
function overflows(n: Node, variable: string, x: number): boolean {
  try {
    evaluate(n, { vars: { [variable]: x }, angle: "rad" });
    return false;
  } catch (e) {
    return e instanceof ExprError && /too large/.test(e.message);
  }
}

/** Is the expression defined at x (in exact arithmetic)? A division by zero beside a 0/0 point is rounding, not a gap in the domain. */
function definedAt(n: Node, variable: string, x: number): boolean {
  try {
    return Number.isFinite(evaluate(n, { vars: { [variable]: x }, angle: "rad" }));
  } catch (e) {
    return e instanceof ExprError && /Division by zero|undefined here/.test(e.message);
  }
}

/** Only the digits the error bound vouches for (at most `max`); a value within its error of 0 is 0. */
function trustworthy([v, err]: Approx, max = 12): number {
  if (!Number.isFinite(v)) return v;
  if (Math.abs(v) <= 2 * err) return 0;
  const digits = Math.floor(Math.log10(Math.abs(v) / Math.max(err, U * Math.abs(v))));
  return Number(v.toPrecision(Math.max(1, Math.min(max, digits))));
}

/**
 * The limit of f at a point (from both sides, or one) or at ±∞. A smooth expression at a finite
 * point is solved exactly first (substitution, L'Hôpital's rule), and that answer is kept only where
 * f is defined on that side and the numbers don't contradict it; otherwise it is estimated numerically.
 */
export function limit(src: string, at: number | "inf" | "-inf", opts: { variable?: string; side?: "both" | "left" | "right" } = {}): LimitResult {
  const x = opts.variable ?? "x";
  compileFn(src, x); // refuses names other than the variable
  const node = parse(src);
  const side = opts.side ?? "both";
  const kind = (v: number | null): LimitResult["verdict"] => (v === null ? "unknown" : Math.abs(v) === Infinity ? "infinite" : "exists");
  if (at === "inf" || at === "-inf") {
    const r = numericLimit(node, x, at, 1);
    const value = r && trustworthy(r);
    return { value, left: null, right: null, verdict: kind(value), method: "numeric", steps: [] };
  }
  if (!Number.isFinite(at)) throw new ExprError("The point must be a number, inf or -inf");

  const steps: string[] = [];
  const sym = smooth(node) ? symbolicLimit(node, x, at, steps, { left: 8 }) : null;
  const scale = Math.max(1, Math.abs(at));
  const sideLimit = (dir: 1 | -1): { value: number | null; how: "symbolic" | "numeric" } => {
    const num = numericLimit(node, x, at, dir);
    const numeric = { value: num && trustworthy(num), how: "numeric" as const };
    if (!sym) return numeric;
    const symbolic = { value: trustworthy(sym, 15), how: "symbolic" as const };
    // Defined just beside the point on this side? (√x has no limit from the left at 0.) Only a
    // domain error counts: a division by zero there is the 0/0 itself, cancelled in floating point.
    const defined = [1e-4, 1e-6, 1e-8, 1e-10].filter((t) => definedAt(node, x, at + dir * t * scale)).length >= 3;
    if (!defined) return { value: null, how: "symbolic" };
    if (num && Number.isFinite(num[0])) {
      // Both carry an error bound: they agree when they overlap. Substituting where f's pieces cancel
      // ((sin x - x)/x³ at x = 10⁻⁵) leaves the symbolic value few digits, or none; the numeric
      // estimate is then the more precise of the two.
      const agrees = Math.abs(num[0] - sym[0]) <= sym[1] + 10 * num[1] + 1e-6 * Math.max(1, Math.abs(sym[0]));
      if (agrees) return num[1] < sym[1] ? numeric : symbolic;
      // A confident numeric estimate that disagrees with a precise symbolic one means a premise failed:
      // no answer rather than a wrong one. One far more precise than the symbolic value wins.
      return 10 * num[1] < sym[1] ? numeric : { value: null, how: "symbolic" };
    }
    if (num) return { value: null, how: "symbolic" }; // numbers run off to ±∞, the substitution says finite
    // Nothing numeric to check against: the symbolic value, unless rounding left it no digit at all.
    return Math.abs(sym[0]) <= 2 * sym[1] ? { value: null, how: "symbolic" } : symbolic;
  };
  const leftR = side === "right" ? null : sideLimit(-1);
  const rightR = side === "left" ? null : sideLimit(1);
  const method = [leftR, rightR].some((r) => r && r.value !== null && r.how === "symbolic") ? "symbolic" : "numeric";
  const shownSteps = method === "symbolic" ? steps : [];
  const left = leftR?.value ?? null;
  const right = rightR?.value ?? null;
  if (side !== "both") {
    const v = side === "left" ? left : right;
    return { value: v, left, right, verdict: v === null ? "unknown" : Math.abs(v) === Infinity ? "infinite" : "one-sided", method, steps: shownSteps };
  }
  if (left === null || right === null) return { value: null, left, right, verdict: "unknown", method, steps: shownSteps };
  const infinite = Math.abs(left) === Infinity || Math.abs(right) === Infinity;
  const close = left === right || (!infinite && Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left)));
  if (!close) return { value: null, left, right, verdict: "different sides", method, steps: shownSteps };
  return { value: left, left, right, verdict: Math.abs(left) === Infinity ? "infinite" : "exists", method, steps: shownSteps };
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
