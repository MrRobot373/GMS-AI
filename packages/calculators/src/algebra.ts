/**
 * Algebra and number tools: polynomial equations, linear systems, complex numbers, exact
 * fractions, primes, number bases, Roman numerals, sequences.
 */
import { calc, ExprError, gcd2 } from "./expression";

/* ───────────── Complex numbers ───────────── */

export interface Complex {
  re: number;
  im: number;
}
export const cx = (re: number, im = 0): Complex => ({ re, im });
export const cadd = (a: Complex, b: Complex): Complex => cx(a.re + b.re, a.im + b.im);
export const csub = (a: Complex, b: Complex): Complex => cx(a.re - b.re, a.im - b.im);
export const cmul = (a: Complex, b: Complex): Complex => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export function cdiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new ExprError("Division by zero");
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
export const cabs = (a: Complex) => Math.hypot(a.re, a.im);
export const carg = (a: Complex) => Math.atan2(a.im, a.re);
export const cpolar = (r: number, theta: number): Complex => cx(r * Math.cos(theta), r * Math.sin(theta));
export function cpow(a: Complex, n: number): Complex {
  if (a.re === 0 && a.im === 0) return n === 0 ? cx(1) : cx(0);
  return cpolar(cabs(a) ** n, carg(a) * n);
}
export const csqrt = (a: Complex) => cpow(a, 0.5);
export const cconj = (a: Complex): Complex => cx(a.re, -a.im);

/** "3 - 4i" style text for a complex number. */
export function formatComplex(z: Complex, digits = 10): string {
  const r = (v: number) => {
    const s = Number(v.toPrecision(digits));
    return Math.abs(s) < 1e-12 ? 0 : s;
  };
  const re = r(z.re);
  const im = r(z.im);
  if (im === 0) return String(re);
  const imPart = `${Math.abs(im) === 1 ? "" : Math.abs(im)}i`;
  if (re === 0) return `${im < 0 ? "-" : ""}${imPart}`;
  return `${re} ${im < 0 ? "-" : "+"} ${imPart}`;
}

/** Parse "3+4i", "-2i", "5", "1.5-0.5j". */
export function parseComplex(s: string): Complex {
  const t = s.replace(/\s+/g, "").replace(/j/g, "i");
  if (!t) throw new ExprError("Enter a complex number like 3+4i");
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)?(?:([+-])((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)?i)?$/i.exec(t);
  const only = /^([+-]?(?:\d+\.?\d*|\.\d+)?)i$/i.exec(t);
  if (only) {
    const v = only[1] === "" || only[1] === "+" ? 1 : only[1] === "-" ? -1 : Number(only[1]);
    return cx(0, v);
  }
  if (!m || (!m[1] && !m[2])) throw new ExprError(`"${s}" isn't a complex number (try 3+4i)`);
  const re = m[1] ? Number(m[1]) : 0;
  const im = m[2] ? (m[2] === "-" ? -1 : 1) * (m[3] ? Number(m[3]) : 1) : 0;
  return cx(re, im);
}

/* ───────────── Polynomials ───────────── */

export interface PolyRoots {
  /** Highest power first, as given. */
  coefficients: number[];
  /** Every root, a repeated one as often as its multiplicity (as many as the degree), sorted. */
  roots: Complex[];
  /** Each different root once, with its multiplicity, in the same order. */
  distinct: { root: Complex; multiplicity: number }[];
  steps: string[];
  discriminant?: number;
}

const EPS = Number.EPSILON;
/** By real part, then imaginary part; real parts equal to rounding count as equal (so -i comes before i). */
const sortRoots = (a: Complex, b: Complex) => {
  const dr = a.re - b.re;
  return Math.abs(dr) > 1e-12 * Math.max(1, cabs(a), cabs(b)) ? dr : a.im - b.im;
};

/** p(z) by Horner's rule, with a bound on its rounding error (what "zero" can mean at z). */
function horner(c: number[], z: Complex): { v: Complex; err: number } {
  let v = cx(0);
  let size = 0;
  const az = cabs(z);
  for (const a of c) {
    v = cadd(cmul(v, z), cx(a));
    size = size * az + Math.abs(a);
  }
  return { v, err: 4 * c.length * EPS * size };
}

const derivative = (c: number[]) => c.slice(0, -1).map((a, i) => a * (c.length - 1 - i));

/** Newton's method on p from z, keeping the best point; it stops at the rounding floor. */
function newton(c: number[], z: Complex, maxIt = 100): Complex {
  const dc = derivative(c);
  let best = z;
  let bestAbs = cabs(horner(c, z).v);
  for (let it = 0; it < maxIt && bestAbs > 0; it++) {
    const { v, err } = horner(c, z);
    if (cabs(v) <= err) break;
    const d = horner(dc, z).v;
    if (d.re === 0 && d.im === 0) break;
    const next = csub(z, cdiv(v, d));
    const nextAbs = cabs(horner(c, next).v);
    if (!Number.isFinite(nextAbs)) break;
    z = next;
    if (nextAbs < bestAbs) {
      best = z;
      bestAbs = nextAbs;
    } else if (it > 10) break;
  }
  return best;
}

/**
 * Is there a root of multiplicity m near z0? Then p^(m-1) has a simple root there: find it with
 * Newton's method and check that p, p′, …, p^(m-1) all vanish there, to rounding. Two roots that are
 * close but different fail the check (p isn't zero halfway between them), so they stay apart.
 */
function multipleRootNear(c: number[], z0: Complex, m: number, radius: number): Complex | null {
  const ds = [c];
  for (let k = 1; k < m; k++) ds.push(derivative(ds[k - 1]!));
  const z = m > 1 ? newton(ds[m - 1]!, z0) : newton(c, z0);
  if (!(cabs(csub(z, z0)) <= radius)) return null;
  for (const d of ds) {
    const { v, err } = horner(d, z);
    if (cabs(v) > 4 * err) return null;
  }
  return z;
}

/**
 * The shortest decimal (within 10⁻⁹) where the polished simple root's p is no larger or zero to
 * rounding: 8, not 8.000000001, for a root that floating point can't place better than that.
 */
function simplest(c: number[], z: Complex): Complex {
  const at = cabs(horner(c, z).v);
  for (let d = 1; d <= 15; d++) {
    const t = cx(Number(z.re.toPrecision(d)), z.im === 0 ? 0 : Number(z.im.toPrecision(d)));
    if (cabs(csub(t, z)) > 1e-9 * Math.max(1, cabs(z))) continue;
    // p(t) no larger, or zero to rounding: t is as much a root as z.
    const { v, err } = horner(c, t);
    if (cabs(v) <= Math.max(at, err)) return t;
  }
  return z;
}

/** Roots of a·xⁿ + … + c = 0 (coefficients highest power first). */
export function polynomialRoots(coefficients: number[]): PolyRoots {
  const c = [...coefficients];
  while (c.length && c[0] === 0) c.shift();
  if (!c.every(Number.isFinite)) throw new ExprError("Coefficients must be numbers");
  if (c.length < 2) throw new ExprError(c.length === 1 && c[0] !== 0 ? "No variable left: this equation has no solution" : "Every coefficient is 0: every x is a solution");
  const deg = c.length - 1;
  const steps: string[] = [];
  if (deg === 1) {
    const [a, b] = c as [number, number];
    steps.push(`${a}x + ${b} = 0`, `x = -(${b}) / ${a}`);
    const root = cx(-b / a);
    return { coefficients, roots: [root], distinct: [{ root, multiplicity: 1 }], steps };
  }
  if (deg === 2) {
    const [a, b, k] = c as [number, number, number];
    let D = b * b - 4 * a * k;
    steps.push(`Discriminant Δ = b² - 4ac = ${b}² - 4·${a}·${k} = ${round(D)}`);
    // Δ within its own rounding error of 0 is 0: (x - 0.1)² is a repeated root, not 0.1 ± 1e-9i.
    if (D !== 0 && Math.abs(D) <= 8 * EPS * (b * b + 4 * Math.abs(a * k))) {
      D = 0;
      steps.push("Δ is 0 to rounding");
    }
    if (D === 0) {
      steps.push("Δ = 0: one repeated real root", "x = -b / 2a");
      const root = cx(-b / (2 * a));
      return { coefficients, roots: [root, root], distinct: [{ root, multiplicity: 2 }], steps, discriminant: D };
    }
    if (D > 0) {
      // Numerically stable form: avoids cancellation when b² ≫ 4ac.
      const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(D));
      const r1 = q / a;
      const r2 = q !== 0 ? k / q : -b / (2 * a);
      steps.push("Δ > 0: two real roots", `x = (-b ± √Δ) / 2a`);
      const roots = [r1, r2].sort((p, q2) => p - q2).map((v) => cx(v));
      return { coefficients, roots, distinct: roots.map((root) => ({ root, multiplicity: 1 })), steps, discriminant: D };
    }
    steps.push("Δ < 0: two complex conjugate roots", "x = (-b ± i√(-Δ)) / 2a");
    const re = -b / (2 * a);
    const im = Math.sqrt(-D) / (2 * Math.abs(a));
    const roots = [cx(re, -im), cx(re, im)];
    return { coefficients, roots, distinct: roots.map((root) => ({ root, multiplicity: 1 })), steps, discriminant: D };
  }
  // Durand–Kerner for cubic and higher (all roots at once).
  const lead = c[0]!;
  const monic = c.map((v) => v / lead);
  const evalP = (z: Complex) => monic.reduce<Complex>((acc, v) => cadd(cmul(acc, z), cx(v)), cx(0));
  // Start on a circle of the roots' size (half Fujiwara's bound), spread out so that the products of
  // differences neither vanish nor overflow, whatever the degree.
  const bound = Math.max(...monic.slice(1).map((v, k) => Math.abs(v) ** (1 / (k + 1))));
  const R = bound > 0 && Number.isFinite(bound) ? bound : 1;
  let found = Array.from({ length: deg }, (_, k) => cpolar(R, (2 * Math.PI * k) / deg + 0.4));
  for (let it = 0; it < 2000; it++) {
    let delta = 0;
    found = found.map((r, i) => {
      let den = cx(1);
      found.forEach((s, j) => {
        if (j !== i) den = cmul(den, csub(r, s));
      });
      const next = csub(r, cdiv(evalP(r), den.re === 0 && den.im === 0 ? cx(1e-12) : den));
      delta = Math.max(delta, cabs(csub(next, r)));
      return next;
    });
    if (delta < 1e-14) break;
  }
  if (!found.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im))) throw new ExprError("The roots of this polynomial couldn't be found numerically");
  steps.push(`Degree ${deg}: roots found numerically (Durand–Kerner iteration), each polished with Newton's method on p(x)`);
  // Polish each root on p itself. A step that would land on another root is not taken (that root
  // would be counted twice); near a repeated root the roots stay as they are and are grouped below.
  const polished = found.map((r, i) => {
    const z = newton(c, r);
    const nearest = Math.min(...found.filter((_, j) => j !== i).map((s) => cabs(csub(s, r))));
    return cabs(csub(z, r)) <= 0.25 * nearest ? z : r;
  });

  // Group repeated roots: a numerical root finder spreads an m-fold root into m roots about
  // (rounding)^(1/m) apart, (x - 1)³ into 0.99989 - 0.00001i, 1, 1.00012 + 0.00003i. Try the largest
  // group around each root first; one that passes the check becomes one root with its multiplicity.
  const distinct: { root: Complex; multiplicity: number }[] = [];
  let left = polished.map((z, i) => ({ z, i }));
  while (left.length) {
    const r = left[0]!.z;
    // Wide enough for a 10-fold root's spread; the check, not the distance, decides what is one root.
    const radius = 0.5 * Math.max(1, cabs(r));
    const near = left.map((x) => ({ ...x, d: cabs(csub(x.z, r)) })).sort((a, b) => a.d - b.d);
    let group = { root: r, members: [left[0]!.i] };
    for (let m = near.length; m >= 2; m--) {
      if (near[m - 1]!.d > radius) continue;
      const members = near.slice(0, m);
      const mean = cx(members.reduce((s, x) => s + x.z.re, 0) / m, members.reduce((s, x) => s + x.z.im, 0) / m);
      const z = multipleRootNear(c, mean, m, radius);
      if (z) {
        group = { root: z, members: members.map((x) => x.i) };
        break;
      }
    }
    distinct.push({ root: group.root, multiplicity: group.members.length });
    left = left.filter((x) => !group.members.includes(x.i));
  }

  // The coefficients are real, so a root with a rounding-level imaginary part is real when its real
  // part passes the same test; a genuinely complex root (1 ± 0.00001i) doesn't.
  let madeReal = false;
  const scale = Math.max(1, ...distinct.map((g) => cabs(g.root)));
  for (const g of distinct) {
    const z = g.root;
    if (z.im === 0 || (Math.abs(z.im) > 1e-6 * cabs(z) && Math.abs(z.im) > 1e-14 * scale)) continue;
    const real = multipleRootNear(c, cx(z.re), g.multiplicity, Math.max(Math.abs(z.im) * 10, 1e-12 * Math.max(1, cabs(z))));
    if (real && real.im === 0) {
      g.root = real;
      madeReal = true;
    }
  }
  distinct.sort((a, b) => sortRoots(a.root, b.root));
  const primes = ["", "′", "″", "‴"];
  for (const g of distinct.filter((x) => x.multiplicity > 1)) {
    const names = Array.from({ length: g.multiplicity }, (_, k) => `p${primes[k] ?? `⁽${k}⁾`}(x)`);
    steps.push(`x = ${formatComplex(g.root)} is a root of multiplicity ${g.multiplicity}: ${names.join(", ")} are all 0 there (to rounding)`);
  }
  if (madeReal) steps.push("Imaginary parts at rounding level dropped: those roots are real");
  for (const g of distinct) {
    // An m-fold root is a simple root of p^(m-1), where p's size says how close it is.
    let d = c;
    for (let k = 1; k < g.multiplicity; k++) d = derivative(d);
    g.root = simplest(d, g.root);
  }
  const roots = distinct.flatMap((g) => Array.from({ length: g.multiplicity }, () => g.root));
  return { coefficients, roots, distinct, steps };
}

const round = (v: number) => Number(v.toPrecision(12));

/** Multiply two polynomials (highest power first). */
export function polyMul(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => (out[i + j] += x * y)));
  return out;
}

/** Long division: quotient and remainder (highest power first). */
export function polyDivide(num: number[], den: number[]): { quotient: number[]; remainder: number[] } {
  const d = [...den];
  while (d.length && d[0] === 0) d.shift();
  if (!d.length) throw new ExprError("Division by the zero polynomial");
  const r = [...num];
  while (r.length && r[0] === 0) r.shift();
  if (r.length < d.length) return { quotient: [0], remainder: r.length ? r : [0] };
  const q: number[] = [];
  while (r.length >= d.length) {
    const f = r[0]! / d[0]!;
    q.push(f);
    for (let i = 0; i < d.length; i++) r[i]! -= f * d[i]!;
    r.shift();
  }
  const rem = r.map(round);
  while (rem.length > 1 && rem[0] === 0) rem.shift();
  return { quotient: q.map(round), remainder: rem.length ? rem : [0] };
}

/** "3x² - 2x + 1" from coefficients (highest power first). */
export function formatPolynomial(c: number[], x = "x"): string {
  const deg = c.length - 1;
  const sup = (n: number) => String(n).split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]).join("");
  const parts: string[] = [];
  c.forEach((v, i) => {
    if (v === 0) return;
    const p = deg - i;
    const a = Math.abs(v);
    const coef = a === 1 && p > 0 ? "" : String(round(a));
    const term = p === 0 ? coef : p === 1 ? `${coef}${x}` : `${coef}${x}${sup(p)}`;
    parts.push(parts.length === 0 ? (v < 0 ? `-${term}` : term) : `${v < 0 ? " - " : " + "}${term}`);
  });
  return parts.join("") || "0";
}

/* ───────────── Linear systems ───────────── */

/** Solve A·x = b by Gaussian elimination with partial pivoting. */
export function solveLinear(A: number[][], b: number[]): { solution: number[] | null; status: "unique" | "none" | "infinite" } {
  const n = A.length;
  if (!n || A.some((r) => r.length !== n) || b.length !== n) throw new ExprError("The system must be square: as many equations as unknowns");
  const M = A.map((r, i) => [...r, b[i]!]);
  const scale = Math.max(1, ...M.flat().map(Math.abs));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-12 * scale) {
      // Singular: no solution or infinitely many.
      const rank = matrixRank(A);
      const rankAug = matrixRank(A.map((r, i) => [...r, b[i]!]));
      return { solution: null, status: rank < rankAug ? "none" : "infinite" };
    }
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      for (let k = col; k <= n; k++) M[r]![k]! -= f * M[col]![k]!;
    }
  }
  return { solution: M.map((r, i) => round(r[n]! / r[i]!)), status: "unique" };
}

export function matrixRank(A: number[][]): number {
  const M = A.map((r) => [...r]);
  const rows = M.length;
  const cols = M[0]?.length ?? 0;
  const scale = Math.max(1, ...M.flat().map(Math.abs));
  let rank = 0;
  for (let c = 0; c < cols && rank < rows; c++) {
    let piv = rank;
    for (let r = rank + 1; r < rows; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-10 * scale) continue;
    [M[rank], M[piv]] = [M[piv]!, M[rank]!];
    for (let r = rank + 1; r < rows; r++) {
      const f = M[r]![c]! / M[rank]![c]!;
      for (let k = c; k < cols; k++) M[r]![k]! -= f * M[rank]![k]!;
    }
    rank++;
  }
  return rank;
}

/* ───────────── Exact fractions ───────────── */

export interface Fraction {
  n: bigint;
  d: bigint;
}
const babs = (v: bigint) => (v < 0n ? -v : v);
function bgcd(a: bigint, b: bigint): bigint {
  a = babs(a);
  b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export function frac(n: bigint | number, d: bigint | number = 1n): Fraction {
  let N = BigInt(n);
  let D = BigInt(d);
  if (D === 0n) throw new ExprError("A fraction can't have 0 as its denominator");
  if (D < 0n) {
    N = -N;
    D = -D;
  }
  const g = bgcd(N, D) || 1n;
  return { n: N / g, d: D / g };
}
export const fadd = (a: Fraction, b: Fraction) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const fsub = (a: Fraction, b: Fraction) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const fmul = (a: Fraction, b: Fraction) => frac(a.n * b.n, a.d * b.d);
export const fdiv = (a: Fraction, b: Fraction) => {
  if (b.n === 0n) throw new ExprError("Division by zero");
  return frac(a.n * b.d, a.d * b.n);
};

/** Parse "3/4", "-1 1/2" (mixed), "0.75" or "5". */
export function parseFraction(s: string): Fraction {
  const t = s.trim();
  let m = /^([+-]?\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m) {
    const whole = BigInt(m[1]!);
    const f = frac(BigInt(m[2]!), BigInt(m[3]!));
    const neg = m[1]!.startsWith("-");
    return neg ? fsub(frac(whole), f) : fadd(frac(whole), f);
  }
  m = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(t);
  if (m) return frac(BigInt(m[1]!), BigInt(m[2]!));
  m = /^([+-]?)(\d*)\.(\d+)$/.exec(t);
  if (m) {
    const digits = m[3]!;
    const n = BigInt(`${m[2] || "0"}${digits}`);
    return frac(m[1] === "-" ? -n : n, 10n ** BigInt(digits.length));
  }
  if (/^[+-]?\d+$/.test(t)) return frac(BigInt(t));
  throw new ExprError(`"${s}" isn't a fraction (try 3/4 or 1 1/2)`);
}

export function formatFraction(f: Fraction): { fraction: string; mixed: string; decimal: number } {
  const fraction = f.d === 1n ? `${f.n}` : `${f.n}/${f.d}`;
  const whole = f.n / f.d;
  const rest = babs(f.n % f.d);
  const mixed = f.d === 1n || whole === 0n ? fraction : `${whole} ${rest}/${f.d}`;
  return { fraction, mixed, decimal: fractionToNumber(f) };
}

/** n/d as the nearest number, also when n and d are too long for a number each (Number(n) / Number(d) is ∞/∞ then). */
export function fractionToNumber(f: Fraction): number {
  const digits = (v: bigint) => babs(v).toString().length;
  // Scale the quotient to about 20 digits, divide exactly, then shift back.
  const shift = digits(f.d) - digits(f.n) + 20;
  const q = shift >= 0 ? (f.n * 10n ** BigInt(shift)) / f.d : f.n / (f.d * 10n ** BigInt(-shift));
  return Number(`${q}e${-shift}`);
}

/** Closest fraction with a denominator up to maxDen (continued fractions). */
export function toFraction(x: number, maxDen = 1_000_000): Fraction {
  if (!Number.isFinite(x)) throw new ExprError("Not a finite number");
  let [h1, h0, k1, k0] = [1, 0, 0, 1];
  let b = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    if (Math.abs(x - h1 / k1) < 1e-15 * Math.max(1, Math.abs(x))) break;
    b = 1 / (b - a);
    if (!Number.isFinite(b)) break;
  }
  return frac(h1, k1);
}

/* ───────────── Decimal to fraction ───────────── */

export interface DecimalFraction {
  /** The value, for showing it as a decimal. */
  value: number;
  /**
   * Exactly what was typed: a terminating decimal (0.12345678 = 6172839/50000000) or a repeating one
   * with the repeating digits in brackets (0.1(6) = 1/6). Null when the text doesn't fix one fraction:
   * digits that trail off (0.333...) or a computed value (pi, sqrt(2)).
   */
  exact: Fraction | null;
  /**
   * A simpler fraction near the value. Always shown as an approximation, with its error: `error` as a
   * number and `errorText` for showing it (also below 1e-308, where the number is 0).
   */
  approximation: { fraction: Fraction; error: number; errorText: string } | null;
}

/** Longer decimals than this are refused rather than slowly turned into huge fractions. */
export const MAX_FRACTION_DIGITS = 1000;

/**
 * Decimal text to a fraction, exactly where the text allows it. Approximations come only from
 * continued fractions on what can't be exact, or when asked for with `maxDen`; a terminating decimal
 * also offers one when a much simpler fraction agrees with every digit typed (0.333333 ≈ 1/3).
 */
export function decimalToFraction(text: string, opts: { maxDen?: number } = {}): DecimalFraction {
  const t = text.trim().replace(/\u2212/g, "-");
  if (!t) throw new ExprError("Enter a number");
  // 1,5 or 1,000: a decimal comma or a thousands separator? Refused rather than guessed.
  if (/^[+-]?[\d,]*\.?[\d,]*$/.test(t) && t.includes(",")) throw new ExprError("Use a point for decimals and no thousands separators: 2.5, 1000");
  if (opts.maxDen !== undefined && !(Number.isSafeInteger(opts.maxDen) && opts.maxDen >= 1)) throw new ExprError("The largest denominator must be a whole number of 1 or more");
  const maxDen = opts.maxDen === undefined ? null : BigInt(opts.maxDen);
  const tooLong = (digits: number) => {
    if (digits > MAX_FRACTION_DIGITS) throw new ExprError(`That number is too long to convert exactly (at most ${MAX_FRACTION_DIGITS} digits)`);
  };
  const approx = (fraction: Fraction, of: Fraction) => {
    const e = fsub(fraction, of);
    const error = frac(babs(e.n), e.d);
    return { fraction, error: fractionToNumber(error), errorText: formatFractionSci(error) };
  };
  const approxOf = (exact: Fraction, f: Fraction | null) => (f && (f.n !== exact.n || f.d !== exact.d) ? approx(f, exact) : null);

  // Terminating: 0.125, -2.5, 1.5e-3, 12.
  let m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(t);
  if (m && (m[2] || m[3])) {
    const digits = `${m[2] ?? ""}${m[3] ?? ""}`;
    tooLong(digits.length);
    const e = Number(m[4] ?? 0);
    tooLong(Math.abs(e));
    const places = (m[3] ?? "").length - e;
    const n = BigInt(digits || "0") * (m[1] === "-" ? -1n : 1n);
    const exact = places >= 0 ? frac(n, 10n ** BigInt(places)) : frac(n * 10n ** BigInt(-places));
    let near: Fraction | null = null;
    if (maxDen !== null) near = bestApproximation(exact, maxDen);
    else if (places > 0) {
      // Offered only when the typed digits are it rounded or cut off (0.333333 and 0.666666 for 1/3
      // and 2/3; not 0.12345678 for 10/81 = 0.1234567901…) and it is far simpler than chance allows:
      // any decimal has fractions with a denominator near √(10ⁿ) that close, so those don't count.
      const unit = frac(1n, 10n ** BigInt(places));
      const half = frac(1n, 2n * 10n ** BigInt(places));
      const f = exact.n < 0n ? simplestBetween(fsub(exact, unit), fadd(exact, half)) : simplestBetween(fsub(exact, half), fadd(exact, unit));
      if (f.d > 1n && f.d < exact.d && f.d * f.d * 100n <= 10n ** BigInt(places)) near = f;
    }
    return { value: fractionToNumber(exact), exact, approximation: approxOf(exact, near) };
  }

  // Repeating, the repeating digits in brackets: 0.(3) = 1/3, 0.1(6) = 1/6, 2.(142857).
  m = /^([+-]?)(\d*)\.(\d*)\((\d+)\)$/.exec(t);
  if (m) {
    const [whole, fixed, rep] = [m[2] || "0", m[3]!, m[4]!];
    tooLong(whole.length + fixed.length + rep.length);
    // x = whole + (fixed rep - fixed) / (10^|fixed| · (10^|rep| - 1))
    const body = frac(BigInt(fixed + rep) - BigInt(fixed || "0"), 10n ** BigInt(fixed.length) * (10n ** BigInt(rep.length) - 1n));
    const pos = fadd(frac(BigInt(whole)), body);
    const exact = m[1] === "-" ? frac(-pos.n, pos.d) : pos;
    return { value: fractionToNumber(exact), exact, approximation: maxDen !== null ? approxOf(exact, bestApproximation(exact, maxDen)) : null };
  }

  // Digits that trail off: 0.333... or 3.14159…: the simplest fraction that starts with these digits.
  m = /^([+-]?)(\d*)\.(\d+)(?:\.\.\.|…)$/.exec(t);
  if (m) {
    const [whole, digits] = [m[2] || "0", m[3]!];
    tooLong(whole.length + digits.length);
    const lo = frac(BigInt(whole + digits), 10n ** BigInt(digits.length));
    const f = maxDen !== null ? bestApproximation(lo, maxDen) : simplestBetween(lo, fadd(lo, frac(1n, 10n ** BigInt(digits.length))));
    const sign = m[1] === "-" ? -1n : 1n;
    const typed = frac(sign * lo.n, lo.d);
    return { value: fractionToNumber(typed), exact: null, approximation: approx(frac(sign * f.n, f.d), typed) };
  }

  // A fraction or a mixed number, already exact: 3/4, -1 1/2.
  try {
    const exact = parseFraction(t);
    return { value: fractionToNumber(exact), exact, approximation: maxDen !== null ? approxOf(exact, bestApproximation(exact, maxDen)) : null };
  } catch {
    /* an expression, below */
  }

  // A computed value (pi, sqrt(2), e^2): only ever an approximation.
  const value = calc(t);
  const fraction = toFraction(value, opts.maxDen ?? 1_000_000);
  const error = Math.abs(value - fractionToNumber(fraction));
  return { value, exact: null, approximation: { fraction, error, errorText: error === 0 ? "0" : String(Number(error.toPrecision(3))) } };
}

/** A fraction in scientific notation (3 significant digits, cut off), for any size: 1/(9·10⁵⁰⁰) is "1.11e-501". */
export function formatFractionSci(f: Fraction, digits = 3): string {
  const n = babs(f.n);
  if (n === 0n) return "0";
  const lead = (k: number) => (k >= 0 ? (n * 10n ** BigInt(k)) / f.d : n / (f.d * 10n ** BigInt(-k)));
  // The exponent from the lengths, off by at most one: corrected until the mantissa has `digits` digits.
  let e = n.toString().length - f.d.toString().length;
  let m = lead(digits - 1 - e);
  while (m.toString().length > digits) m = lead(digits - 1 - ++e);
  while (m.toString().length < digits) m = lead(digits - 1 - --e);
  const s = m.toString();
  const mantissa = `${s[0]}${s.length > 1 ? `.${s.slice(1)}` : ""}`.replace(/\.?0+$/, "");
  const text = e >= -4 && e < 12 ? String(Number(`${mantissa}e${e}`)) : `${mantissa}e${e}`;
  return `${f.n < 0n ? "-" : ""}${text}`;
}

const fcmp = (a: Fraction, b: Fraction) => {
  const d = a.n * b.d - b.n * a.d;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};

/** The fraction with the smallest denominator in [lo, hi] (Stern–Brocot, by continued fractions). */
export function simplestBetween(lo: Fraction, hi: Fraction): Fraction {
  if (fcmp(lo, hi) > 0) [lo, hi] = [hi, lo];
  if (lo.n <= 0n && hi.n >= 0n) return frac(0n);
  if (hi.n < 0n) {
    const f = simplestBetween(frac(-hi.n, hi.d), frac(-lo.n, lo.d));
    return frac(-f.n, f.d);
  }
  const fl = lo.n / lo.d;
  if (fl * lo.d === lo.n) return frac(fl);
  // A whole number in (lo, hi] is the simplest.
  if (fcmp(frac(fl + 1n), hi) <= 0) return frac(fl + 1n);
  // Both in (fl, fl + 1): the simplest of the reciprocals of the fractional parts, flipped back.
  const inner = simplestBetween(fdiv(frac(1n), fsub(hi, frac(fl))), fdiv(frac(1n), fsub(lo, frac(fl))));
  return fadd(frac(fl), fdiv(frac(1n), inner));
}

/** The closest fraction to x with a denominator up to maxDen (best rational approximation). */
export function bestApproximation(x: Fraction, maxDen: bigint): Fraction {
  if (x.d <= maxDen) return x;
  const neg = x.n < 0n;
  let [n, d] = [babs(x.n), x.d];
  // Convergents p/q of the continued fraction, then the best semiconvergent at the limit.
  let [p0, q0, p1, q1] = [0n, 1n, 1n, 0n];
  for (;;) {
    const a = n / d;
    const q2 = q0 + a * q1;
    if (q2 > maxDen) {
      const k = (maxDen - q0) / q1;
      const semi = frac(p0 + k * p1, q0 + k * q1);
      const conv = frac(p1, q1);
      const ax = frac(babs(x.n), x.d);
      const better = fcmp(babs2(fsub(semi, ax)), babs2(fsub(conv, ax))) < 0 ? semi : conv;
      return neg ? frac(-better.n, better.d) : better;
    }
    [p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2];
    const r = n - a * d;
    if (r === 0n) return neg ? frac(-p1, q1) : frac(p1, q1);
    [n, d] = [d, r];
  }
}
const babs2 = (f: Fraction): Fraction => frac(babs(f.n), f.d);

/* ───────────── Primes and divisibility ───────────── */

export function isPrime(n: number): boolean {
  if (!Number.isSafeInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let k = 5; k * k <= n; k += 6) if (n % k === 0 || n % (k + 2) === 0) return false;
  return true;
}

export function primeFactors(n: number): { prime: number; power: number }[] {
  if (!Number.isSafeInteger(n) || n < 2) throw new ExprError("Enter a whole number of 2 or more (up to 9,007,199,254,740,991)");
  const out: { prime: number; power: number }[] = [];
  let m = n;
  for (const p of [2, 3]) {
    let e = 0;
    while (m % p === 0) {
      m /= p;
      e++;
    }
    if (e) out.push({ prime: p, power: e });
  }
  for (let k = 5; k * k <= m; k += 6) {
    for (const p of [k, k + 2]) {
      let e = 0;
      while (m % p === 0) {
        m /= p;
        e++;
      }
      if (e) out.push({ prime: p, power: e });
    }
  }
  if (m > 1) out.push({ prime: m, power: 1 });
  return out;
}

export function primesUpTo(n: number): number[] {
  if (!Number.isInteger(n) || n < 2) return [];
  if (n > 10_000_000) throw new ExprError("Up to 10,000,000");
  const sieve = new Uint8Array(n + 1);
  const out: number[] = [];
  for (let i = 2; i <= n; i++) {
    if (sieve[i]) continue;
    out.push(i);
    for (let j = i * i; j <= n; j += i) sieve[j] = 1;
  }
  return out;
}

export function gcd(values: number[]): number {
  if (!values.length || !values.every(Number.isInteger)) throw new ExprError("Enter whole numbers");
  return values.reduce(gcd2);
}
export function lcm(values: number[]): number {
  if (!values.length || !values.every(Number.isInteger)) throw new ExprError("Enter whole numbers");
  return values.reduce((a, b) => (a === 0 || b === 0 ? 0 : Math.abs((a / gcd2(a, b)) * b)));
}

/* ───────────── Number bases ───────────── */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Convert an integer (BigInt, any size) between bases 2–36. */
export function convertBase(value: string, from: number, to: number): string {
  if (![from, to].every((b) => Number.isInteger(b) && b >= 2 && b <= 36)) throw new ExprError("Bases go from 2 to 36");
  let s = value.trim().toLowerCase().replace(/_/g, "");
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (from === 16) s = s.replace(/^0x/, "");
  if (from === 2) s = s.replace(/^0b/, "");
  if (from === 8) s = s.replace(/^0o/, "");
  if (!s) throw new ExprError("Enter a number");
  let n = 0n;
  const B = BigInt(from);
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= from) throw new ExprError(`"${ch}" isn't a digit in base ${from}`);
    n = n * B + BigInt(d);
  }
  return (neg && n !== 0n ? "-" : "") + n.toString(to);
}

/** Two's complement of a signed integer in a given width, as bits. */
export function twosComplement(value: number, bits: number): string {
  if (!Number.isInteger(bits) || bits < 2 || bits > 64) throw new ExprError("Width from 2 to 64 bits");
  const v = BigInt(value);
  const min = -(1n << BigInt(bits - 1));
  const max = (1n << BigInt(bits - 1)) - 1n;
  if (v < min || v > max) throw new ExprError(`${value} doesn't fit in ${bits} signed bits (${min} to ${max})`);
  const u = v < 0n ? (1n << BigInt(bits)) + v : v;
  return u.toString(2).padStart(bits, "0");
}

/** Bitwise operations on unsigned integers of a width (up to 64 bits). */
export function bitwise(op: "and" | "or" | "xor" | "nand" | "nor" | "not" | "shl" | "shr", a: bigint, b: bigint, bits = 32): bigint {
  const mask = (1n << BigInt(bits)) - 1n;
  a &= mask;
  b &= mask;
  switch (op) {
    case "and":
      return a & b;
    case "or":
      return a | b;
    case "xor":
      return a ^ b;
    case "nand":
      return ~(a & b) & mask;
    case "nor":
      return ~(a | b) & mask;
    case "not":
      return ~a & mask;
    case "shl":
      return (a << b) & mask;
    case "shr":
      return a >> b;
  }
}

/** IEEE 754 fields of a number (single or double precision). */
export function ieee754(value: number, precision: 32 | 64) {
  const buf = new DataView(new ArrayBuffer(8));
  let bits: string;
  let stored: number;
  if (precision === 32) {
    buf.setFloat32(0, value);
    bits = buf.getUint32(0).toString(2).padStart(32, "0");
    stored = buf.getFloat32(0);
  } else {
    buf.setFloat64(0, value);
    bits = buf.getBigUint64(0).toString(2).padStart(64, "0");
    stored = buf.getFloat64(0);
  }
  const e = precision === 32 ? 8 : 11;
  const hex = BigInt(`0b${bits}`).toString(16).padStart(precision / 4, "0");
  return { bits, sign: bits[0]!, exponent: bits.slice(1, 1 + e), mantissa: bits.slice(1 + e), hex, stored, error: stored - value };
}

/* ───────────── Roman numerals ───────────── */

const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new ExprError("Roman numerals go from 1 to 3999");
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) {
    out += s;
    n -= v;
  }
  return out;
}

export function fromRoman(s: string): number {
  const t = s.trim().toUpperCase();
  if (!/^[MDCLXVI]+$/.test(t)) throw new ExprError(`"${s}" isn't a Roman numeral`);
  const val: Record<string, number> = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 };
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const v = val[t[i]!]!;
    const next = val[t[i + 1] ?? ""] ?? 0;
    n += v < next ? -v : v;
  }
  // Only the standard form counts (IIII or VX are rejected).
  if (n < 1 || n > 3999 || toRoman(n) !== t) throw new ExprError(`"${s}" isn't a standard Roman numeral`);
  return n;
}

/* ───────────── Sequences ───────────── */

export function arithmeticSequence(a1: number, d: number, n: number) {
  if (!Number.isInteger(n) || n < 1) throw new ExprError("n must be a whole number of 1 or more");
  const an = a1 + (n - 1) * d;
  return { nth: an, sum: (n * (a1 + an)) / 2, terms: Array.from({ length: Math.min(n, 20) }, (_, k) => a1 + k * d) };
}

export function geometricSequence(a1: number, r: number, n: number) {
  if (!Number.isInteger(n) || n < 1) throw new ExprError("n must be a whole number of 1 or more");
  const an = a1 * r ** (n - 1);
  const sum = r === 1 ? a1 * n : (a1 * (1 - r ** n)) / (1 - r);
  return { nth: an, sum, infiniteSum: Math.abs(r) < 1 ? a1 / (1 - r) : null, terms: Array.from({ length: Math.min(n, 20) }, (_, k) => a1 * r ** k) };
}
