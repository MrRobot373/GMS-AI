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

/*
 * Double-double arithmetic (a value as hi + lo, about 32 significant digits). Near a repeated root
 * p's value is all cancellation: in double precision a triple root and three roots 10⁻⁴ apart look the
 * same, so the root finder's last steps and the multiplicity checks evaluate p this way.
 */
type DD = [number, number];
const SPLIT = 134217729; // 2^27 + 1
function twoSum(a: number, b: number): DD {
  const s = a + b;
  const bb = s - a;
  return [s, a - (s - bb) + (b - bb)];
}
const fastTwoSum = (a: number, b: number): DD => {
  const s = a + b;
  return [s, b - (s - a)];
};
function twoProd(a: number, b: number): DD {
  const p = a * b;
  let t = SPLIT * a;
  const ah = t - (t - a);
  const al = a - ah;
  t = SPLIT * b;
  const bh = t - (t - b);
  const bl = b - bh;
  return [p, ah * bh - p + ah * bl + al * bh + al * bl];
}
function ddAdd(a: DD, b: DD): DD {
  const [s, e] = twoSum(a[0], b[0]);
  const [t, f] = twoSum(a[1], b[1]);
  const [s2, e2] = fastTwoSum(s, e + t);
  return fastTwoSum(s2, e2 + f);
}
function ddMul(a: DD, d: number): DD {
  const [p, e] = twoProd(a[0], d);
  return fastTwoSum(p, e + a[1] * d);
}

/** p's Taylor coefficients at z, p⁽ᵏ⁾(z)/k! for k = 0…upto (repeated synthetic division in double-double). */
function taylor(c: number[], z: Complex, upto: number): Complex[] {
  let re: DD[] = c.map((a) => [a, 0]);
  let im: DD[] = c.map(() => [0, 0]);
  const out: Complex[] = [];
  for (let k = 0; k <= upto && re.length; k++) {
    const qr: DD[] = [re[0]!];
    const qi: DD[] = [im[0]!];
    for (let j = 1; j < re.length; j++) {
      const vr = qr[j - 1]!;
      const vi = qi[j - 1]!;
      qr.push(ddAdd(ddAdd(ddMul(vr, z.re), ddMul(vi, -z.im)), re[j]!));
      qi.push(ddAdd(ddAdd(ddMul(vr, z.im), ddMul(vi, z.re)), im[j]!));
    }
    const last = qr.length - 1;
    out.push(cx(qr[last]![0] + qr[last]![1], qi[last]![0] + qi[last]![1]));
    re = qr.slice(0, last);
    im = qi.slice(0, last);
  }
  while (out.length <= upto) out.push(cx(0));
  return out;
}

/**
 * How much the Taylor coefficients at a point r away from 0 can move when every coefficient of p moves
 * by its own size: Σ |cⱼ|·C(j, k)·rʲ⁻ᵏ for k = 0…upto. A coefficient below τ times this is 0 to rounding.
 */
function taylorSize(c: number[], r: number, upto: number): number[] {
  let b = c.map(Math.abs);
  const out: number[] = [];
  for (let k = 0; k <= upto && b.length; k++) {
    const q = [b[0]!];
    for (let j = 1; j < b.length; j++) q.push(q[j - 1]! * r + b[j]!);
    out.push(q[q.length - 1]!);
    b = q.slice(0, -1);
  }
  while (out.length <= upto) out.push(0);
  return out;
}

/** A root of p⁽ᵏ⁾ near z (k = 0: of p) by Newton's method on double-double values, keeping the best point. */
function newtonAt(c: number[], z: Complex, k: number, maxIt = 100): Complex {
  let best = z;
  let bestAbs = Infinity;
  for (let it = 0; it < maxIt; it++) {
    const t = taylor(c, z, k + 1);
    const v = t[k]!;
    const a = cabs(v);
    if (!Number.isFinite(a)) break;
    if (a < bestAbs) {
      best = z;
      bestAbs = a;
    } else if (it > 10) break;
    // d/dz of p⁽ᵏ⁾(z)/k! is (k + 1)·p⁽ᵏ⁺¹⁾(z)/(k + 1)!.
    const d = cmul(cx(k + 1), t[k + 1]!);
    if (a === 0 || (d.re === 0 && d.im === 0)) break;
    const next = csub(z, cdiv(v, d));
    if (!Number.isFinite(next.re) || !Number.isFinite(next.im) || (next.re === z.re && next.im === z.im)) break;
    z = next;
  }
  return best;
}

/** Rounding allowed in each of p's coefficients when deciding that a Taylor coefficient is 0. */
const ROOT_TOL = 8 * EPS;

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
  const dkStep = (p: (z: Complex) => Complex) => {
    let delta = 0;
    found = found.map((r, i) => {
      let den = cx(1);
      found.forEach((s, j) => {
        if (j !== i) den = cmul(den, csub(r, s));
      });
      const next = csub(r, cdiv(p(r), den.re === 0 && den.im === 0 ? cx(1e-12) : den));
      if (!Number.isFinite(next.re) || !Number.isFinite(next.im)) return r;
      delta = Math.max(delta, cabs(csub(next, r)) / Math.max(cabs(next), Number.MIN_VALUE));
      return next;
    });
    return delta;
  };
  for (let it = 0; it < 2000; it++) if (dkStep(evalP) < 1e-14) break;
  if (!found.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im))) throw new ExprError("The roots of this polynomial couldn't be found numerically");
  // Finish with p evaluated in double-double: the roots then are those of the polynomial as given, to
  // double precision, even inside a cluster (a repeated root's copies, or close roots).
  const pdd = (z: Complex) => cdiv(taylor(c, z, 0)[0]!, cx(lead));
  for (let it = 0; it < 100; it++) if (dkStep(pdd) <= 2 * EPS) break;
  steps.push(`Degree ${deg}: roots found numerically (Durand–Kerner iteration), with p(x) evaluated in double-double precision`);

  // The coefficients are real, so the roots are real or come in conjugate pairs. Pair each complex root
  // with the one nearest its mirror image and make the two exact mirror images; one with no partner is
  // real and its imaginary part rounding.
  const mirror = found.map((_, i) => i);
  let madeReal = false;
  const pairs: [number, number, number][] = [];
  found.forEach((a, i) =>
    found.forEach((b, j) => {
      if (a.im > 0 && b.im < 0) {
        const off = cabs(csub(b, cconj(a)));
        if (off < 0.5 * (a.im - b.im)) pairs.push([off, i, j]);
      }
    }),
  );
  pairs.sort((x, y) => x[0] - y[0]);
  for (const [, i, j] of pairs) {
    if (mirror[i] !== i || mirror[j] !== j) continue;
    mirror[i] = j;
    mirror[j] = i;
    const a = found[i]!;
    const b = found[j]!;
    found[i] = cx((a.re + b.re) / 2, (a.im - b.im) / 2);
    found[j] = cconj(found[i]!);
  }
  found = found.map((z, i) => {
    if (mirror[i] !== i || z.im === 0) return z;
    if (Math.abs(z.im) > 1e-15 * cabs(z)) madeReal = true;
    return cx(z.re);
  });

  // Group repeated roots. A root of multiplicity m of the polynomial as given (its coefficients rounded)
  // is m roots up to about (rounding/|p⁽ᵐ⁾/m!|)^(1/m) apart: (x - 1)³ with rounded coefficients is three
  // roots about 10⁻⁵ apart. Groups grow two at a time. A group of m becomes one root z only if p, p′, …,
  // p⁽ᵐ⁻¹⁾ all vanish at z to the coefficients' rounding (evaluated in double-double, so that 1 and 1.001
  // never pass as a double root) and every member lies within the spread rounding can cause at z. Of the
  // merges that pass, the one at the point where the most derivatives vanish wins, then the closest: in
  // (x - 2)³(x - 2.0001) the copies of 2 join at 2, not at a double point between 2 and 2.0001. A complex
  // group and its mirror image grow together; a real group's members' conjugates are in it or become
  // real roots themselves. So no complex root is ever left without its conjugate.
  const sorted = (a: Iterable<number>) => [...new Set(a)].sort((x, y) => x - y);
  const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x, k) => x === b[k]);
  const mirrorOf = (g: number[]) => sorted(g.map((i) => mirror[i]!));
  // How far each root may be from a root of p: what rounding in the coefficients allows, plus what the
  // root finder hasn't converged yet (copies of an exact repeated root close in on it slowly). With
  // e = rounding + |p(r)|, p has a root within about min over k of (e/|p⁽ᵏ⁾(r)/k!|)^(1/k) of r.
  const sens = found.map((r) => {
    const T = taylor(c, r, deg);
    const e = ROOT_TOL * taylorSize(c, cabs(r), 0)[0]! + cabs(T[0]!);
    let s = Infinity;
    for (let k = 1; k <= deg; k++) if (cabs(T[k]!) > 0) s = Math.min(s, (e / cabs(T[k]!)) ** (1 / k));
    return s;
  });
  const tested = new Map<string, { z: Complex; order: number; fit: number } | null>();
  /**
   * Is there a root of multiplicity at least members.length (real if asked) that these roots are copies
   * of? It is where p⁽ᵏ⁾ has a root for some k ≥ m - 1: two copies of a triple root sit around a root of
   * p″, not of p′. The point where the most derivatives vanish wins.
   */
  const multipleRoot = (members: number[], real: boolean): { z: Complex; order: number; fit: number } | null => {
    const m = members.length;
    const pts = members.map((i) => found[i]!);
    const mean = cx(pts.reduce((s, z) => s + z.re, 0) / m, real ? 0 : pts.reduce((s, z) => s + z.im, 0) / m);
    let best: { z: Complex; order: number; fit: number } | null = null;
    for (let k = m - 1; k < Math.min(deg, m + 3); k++) {
      const z = newtonAt(c, mean, k);
      if (!Number.isFinite(z.re) || !Number.isFinite(z.im) || (!real && z.im === 0)) continue;
      const T = taylor(c, z, deg);
      const S = taylorSize(c, cabs(z), deg);
      let order = 0;
      while (order < deg && cabs(T[order]!) <= ROOT_TOL * S[order]!) order++;
      if (order < m || (best && order < best.order)) continue;
      // How well the derivatives vanish (1 = at the rounding limit): of two candidate points with as
      // many vanishing, the better fit wins.
      let fit = 0;
      for (let j = 0; j < order; j++) fit = Math.max(fit, cabs(T[j]!) / (ROOT_TOL * S[j]!));
      if (best && order === best.order && fit >= best.fit) continue;
      // y^q·T_q + Σ δₖ·yᵏ = 0 (δₖ the rounding in each Taylor coefficient below the first that isn't
      // 0) has its roots within |y| ≤ 2·max (|δₖ|/|T_q|)^(1/(q - k)): the members must be that close to z.
      const tq = cabs(T[order]!);
      let rho = 0;
      for (let j = 0; j < order; j++) rho = Math.max(rho, ((ROOT_TOL * S[j]!) / tq) ** (1 / (order - j)));
      // (Plus what the root finder may not have converged yet: copies of an exact repeated root close
      // in on it slowly.)
      if (members.some((i) => cabs(csub(found[i]!, z)) > 3 * rho + 2 * order * sens[i]!)) continue;
      best = { z: real ? cx(z.re) : z, order, fit };
    }
    return best;
  };
  /** The point near these roots where the most derivatives of p vanish, and how many. */
  const peaks = new Map<string, { z: Complex; order: number }>();
  const peakOf = (members: number[]) => {
    const key = members.join(",");
    if (!peaks.has(key)) {
      const pts = members.map((i) => found[i]!);
      const mean = cx(pts.reduce((s, z) => s + z.re, 0) / pts.length);
      let best = { z: mean, order: 0 };
      for (let k = 1; k < Math.min(deg, members.length + 3); k++) {
        const z = cx(newtonAt(c, mean, k).re);
        const T = taylor(c, z, deg);
        const S = taylorSize(c, cabs(z), deg);
        let order = 0;
        while (order < deg && cabs(T[order]!) <= ROOT_TOL * S[order]!) order++;
        if (order > best.order) best = { z, order };
      }
      peaks.set(key, best);
    }
    return peaks.get(key)!;
  };
  const test = (members: number[], real: boolean) => {
    const key = `${members.join(",")}${real ? "r" : "c"}`;
    if (!tested.has(key)) tested.set(key, multipleRoot(members, real));
    return tested.get(key)!;
  };
  let groups = found.map((_, i) => [i]);
  const groupRoot = new Map<string, Complex>();
  for (let round = 0; round < 4 * deg; round++) {
    let best: { members: number[]; mirrored: number[] | null; split?: number[]; z: Complex; d: number; order: number; fit: number } | null = null;
    const groupOf = new Map<number, number[]>();
    for (const g of groups) for (const i of g) groupOf.set(i, g);
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        let d = 0;
        let size = 1;
        for (const i of groups[a]!) {
          for (const j of groups[b]!) {
            d = Math.max(d, cabs(csub(found[i]!, found[j]!)));
            size = Math.max(size, cabs(found[i]!), cabs(found[j]!));
          }
        }
        // Copies of a q-fold root sit about q times their own sensitivity (how far rounding can move a
        // root) apart; well separated simple roots are much farther apart than that.
        if (d > 0.5 * size || d > 20 * deg * Math.max(...groups[a]!.map((i) => sens[i]!), ...groups[b]!.map((i) => sens[i]!))) continue;
        const better = (t: { order: number; fit: number }) => !best || t.order > best.order || (t.order === best.order && (t.fit < best.fit || (t.fit === best.fit && d < best.d)));
        const members = sorted([...groups[a]!, ...groups[b]!]);
        const mir = mirrorOf(members);
        // A real multiple root, from these roots or with their conjugates too. Conjugates it leaves out
        // are real roots of their own; a whole group can't be left without its mirror image.
        let anyReal = false;
        for (const g of mir.some((i) => members.includes(i)) ? [members, sorted([...members, ...mir])] : [members]) {
          const orphans = mirrorOf(g).filter((i) => !g.includes(i));
          if (!orphans.every((i) => groupOf.get(i)!.length === 1)) continue;
          const real = test(g, true);
          if (!real && g === members && g.length >= 3) {
            // The two groups hold copies of an m-fold root and a root next to it, mixed up: m roots of
            // the union are the copies (those nearest the point where m derivatives vanish), the rest
            // are on their own again.
            const peak = peakOf(g);
            if (peak.order >= 2 && peak.order < g.length && peak.order > Math.max(groups[a]!.length, groups[b]!.length)) {
              const near = sorted([...g].sort((x, y) => cabs(csub(found[x]!, peak.z)) - cabs(csub(found[y]!, peak.z))).slice(0, peak.order));
              const out = mirrorOf(near).filter((i) => !near.includes(i));
              if (out.every((i) => g.includes(i) || groupOf.get(i)!.length === 1)) {
                const t = test(near, true);
                if (t && better(t)) best = { members: near, mirrored: null, split: g, z: t.z, d, order: t.order, fit: t.fit };
              }
            }
          }
          if (!real) continue;
          anyReal = true;
          if (better(real)) best = { members: g, mirrored: null, z: real.z, d, order: real.order, fit: real.fit };
        }
        // A complex one, its conjugate made of the mirror images.
        if (anyReal || mir.some((i) => members.includes(i))) continue;
        if (!mir.every((i) => groupOf.get(i)!.every((j) => mir.includes(j)))) continue;
        const t = test(members, false);
        if (t && better(t)) best = { members, mirrored: mir, z: t.z, d, order: t.order, fit: t.fit };
      }
    }
    if (!best) break;
    const { members, mirrored, split, z } = best;
    const taken = new Set([...members, ...(mirrored ?? []), ...(split ?? [])]);
    groups = groups.filter((g) => !g.some((i) => taken.has(i)));
    groups.push(members);
    for (const i of split ?? []) if (!members.includes(i)) groups.push([i]);
    groupRoot.set(members.join(","), z);
    if (mirrored) {
      groups.push(mirrored);
      groupRoot.set(mirrored.join(","), cconj(z));
    } else {
      // Conjugates left out of a real group are real.
      for (const i of members) if (!members.includes(mirror[i]!)) mirror[mirror[i]!] = mirror[i]!;
      for (const i of members) mirror[i] = i;
    }
  }

  // Each group's root: the multiple root found above, or a simple root polished by Newton's method (a
  // step that would land on another root is not taken: that root would be counted twice).
  const roots0 = groups.map((g) => {
    const t = groupRoot.get(g.join(","));
    if (t) return t;
    const r = mirror[g[0]!] === g[0] ? cx(found[g[0]!]!.re) : found[g[0]!]!;
    const z = newtonAt(c, r, 0);
    const nearest = Math.min(...found.filter((_, j) => j !== g[0]).map((s) => cabs(csub(s, r))));
    return cabs(csub(z, r)) <= 0.25 * nearest ? z : r;
  });
  const mults = groups.map((g) => g.length);
  // Which group is which one's mirror image (itself for a real root).
  const mirrorGroup = groups.map((g) => {
    const mg = mirrorOf(g);
    return groups.findIndex((h) => sameSet([...h].sort((a, b) => a - b), mg));
  });
  for (const g of groups) if (g.length > 1 && g.some((i) => found[i]!.im !== 0)) madeReal = true;
  const fitted = mults.some((m) => m > 1) ? fitRoots(c, roots0, mults, mirrorGroup) : roots0;
  const distinct = fitted.map((root, k) => ({ root, multiplicity: mults[k]! }));
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

/** Coefficients of lead·∏(x - zⱼ)^mⱼ, highest power first. */
function fromRootsC(lead: number, zs: Complex[], ms: number[]): Complex[] {
  let q: Complex[] = [cx(lead)];
  zs.forEach((z, j) => {
    for (let t = 0; t < ms[j]!; t++) q = [...q, cx(0)].map((a, i) => (i === 0 ? a : csub(a, cmul(q[i - 1]!, z))));
  });
  return q;
}

/** Solve the square complex system A·x = b by Gaussian elimination with partial pivoting; null if singular. */
function solveComplex(A: Complex[][], b: Complex[]): Complex[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (cabs(M[r]![col]!) > cabs(M[piv]![col]!)) piv = r;
    if (!(cabs(M[piv]![col]!) > 0)) return null;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    for (let r = col + 1; r < n; r++) {
      const f = cdiv(M[r]![col]!, M[col]![col]!);
      for (let k = col; k <= n; k++) M[r]![k] = csub(M[r]![k]!, cmul(f, M[col]![k]!));
    }
  }
  const x: Complex[] = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let k = r + 1; k < n; k++) s = csub(s, cmul(M[r]![k]!, x[k]!));
    x[r] = cdiv(s, M[r]![r]!);
  }
  return x.every((v) => Number.isFinite(v.re) && Number.isFinite(v.im)) ? x : null;
}

/**
 * Once the multiplicities are known, the distinct roots are the zⱼ for which lead·∏(x - zⱼ)^mⱼ is
 * closest to p, coefficient by coefficient (Gauss–Newton). With the multiplicities fixed this is well
 * conditioned, unlike p's own roots there: in (x - 1)³(x - 1.001) as rounded, p's simple root is
 * 1.0009996 but the closest triple-and-simple polynomial has 1 and 1.001. Real roots stay real and
 * conjugates stay conjugate (mirror[j] is the index of zⱼ's conjugate).
 */
function fitRoots(c: number[], zs: Complex[], ms: number[], mirror: number[]): Complex[] {
  const lead = c[0]!;
  const big = Math.max(...c.map(Math.abs));
  const w = c.map((a) => 1 / Math.max(Math.abs(a), 1e-8 * big));
  const residual = (z: Complex[]) => fromRootsC(lead, z, ms).map((q, i) => cx((c[i]! - q.re) * w[i]!, -q.im * w[i]!));
  const norm = (r: Complex[]) => Math.hypot(...r.map(cabs));
  const symmetric = (z: Complex[]) => z.map((v, j) => (mirror[j] === j ? cx(v.re) : mirror[j]! < j ? cconj(z[mirror[j]!]!) : v));
  let cur = zs;
  let r = residual(cur);
  let size = norm(r);
  for (let it = 0; it < 20 && size > 0; it++) {
    // Column j: ∂/∂zⱼ of lead·∏(x - zᵢ)^mᵢ = -mⱼ·lead·(x - zⱼ)^(mⱼ - 1)·∏ᵢ≠ⱼ(x - zᵢ)^mᵢ, one power lower.
    const J = cur.map((_, j) => {
      const col = fromRootsC(-ms[j]! * lead, cur, ms.map((m, i) => (i === j ? m - 1 : m)));
      return [cx(0), ...col].map((v, i) => cx(v.re * w[i]!, v.im * w[i]!));
    });
    const A = J.map((a) => J.map((b) => a.reduce((s, x, i) => cadd(s, cmul(cconj(x), b[i]!)), cx(0))));
    const rhs = J.map((a) => a.reduce((s, x, i) => cadd(s, cmul(cconj(x), r[i]!)), cx(0)));
    const step = solveComplex(A, rhs);
    if (!step) break;
    const next = symmetric(cur.map((z, j) => cadd(z, step[j]!)));
    const rn = residual(next);
    const sn = norm(rn);
    if (!(sn < size)) break;
    const moved = Math.max(...next.map((z, j) => cabs(csub(z, cur[j]!)) / Math.max(1, cabs(z))));
    cur = next;
    r = rn;
    size = sn;
    if (moved < EPS) break;
  }
  return cur;
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
  if (/^[+-]?[\d,]*\.?[\d,]*$/.test(t) && t.includes(",")) throw new ExprError("Use a point for decimals and no thousands separators: 2.5, 1000.");
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
