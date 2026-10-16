/**
 * Algebra and number tools: polynomial equations, linear systems, complex numbers, exact
 * fractions, primes, number bases, Roman numerals, sequences.
 */
import { ExprError, gcd2 } from "./expression";

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
  roots: Complex[];
  steps: string[];
  discriminant?: number;
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
    return { coefficients, roots: [cx(-b / a)], steps };
  }
  if (deg === 2) {
    const [a, b, k] = c as [number, number, number];
    const D = b * b - 4 * a * k;
    steps.push(`Discriminant Δ = b² - 4ac = ${b}² - 4·${a}·${k} = ${round(D)}`);
    if (D >= 0) {
      // Numerically stable form: avoids cancellation when b² ≫ 4ac.
      const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(D));
      const r1 = q / a;
      const r2 = q !== 0 ? k / q : -b / (2 * a);
      steps.push(D === 0 ? "Δ = 0: one repeated real root" : "Δ > 0: two real roots", `x = (-b ± √Δ) / 2a`);
      const roots = [r1, r2].sort((p, q2) => p - q2).map((v) => cx(v));
      return { coefficients, roots, steps, discriminant: D };
    }
    steps.push("Δ < 0: two complex conjugate roots", "x = (-b ± i√(-Δ)) / 2a");
    const re = -b / (2 * a);
    const im = Math.sqrt(-D) / (2 * Math.abs(a));
    return { coefficients, roots: [cx(re, -im), cx(re, im)], steps, discriminant: D };
  }
  // Durand–Kerner for cubic and higher (all roots at once), then polished with Newton's method.
  const lead = c[0]!;
  const monic = c.map((v) => v / lead);
  const evalP = (z: Complex) => monic.reduce<Complex>((acc, v) => cadd(cmul(acc, z), cx(v)), cx(0));
  let roots = Array.from({ length: deg }, (_, k) => cpow(cx(0.4, 0.9), k));
  for (let it = 0; it < 2000; it++) {
    let delta = 0;
    roots = roots.map((r, i) => {
      let den = cx(1);
      roots.forEach((s, j) => {
        if (j !== i) den = cmul(den, csub(r, s));
      });
      const next = csub(r, cdiv(evalP(r), den.re === 0 && den.im === 0 ? cx(1e-12) : den));
      delta = Math.max(delta, cabs(csub(next, r)));
      return next;
    });
    if (delta < 1e-14) break;
  }
  const scale = Math.max(1, ...roots.map(cabs));
  roots = roots
    .map((r) => cx(Math.abs(r.im) < 1e-9 * scale ? r.re : r.re, Math.abs(r.im) < 1e-9 * scale ? 0 : r.im))
    .sort((a, b) => a.re - b.re || a.im - b.im);
  steps.push(`Degree ${deg}: roots found numerically (Durand–Kerner iteration)`);
  return { coefficients, roots, steps };
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
  return { fraction, mixed, decimal: Number(f.n) / Number(f.d) };
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
