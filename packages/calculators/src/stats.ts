/**
 * Statistics: descriptive measures, regression, and the normal, t, chi-square and binomial
 * distributions. Special functions follow Numerical Recipes (3rd ed.) §6.1–6.2.
 */
import { ExprError, nCr } from "./expression";

export function parseData(text: string): number[] {
  const parts = text.split(/[\s,;\t]+/).filter(Boolean);
  const out = parts.map(Number);
  const bad = parts.find((p, i) => !Number.isFinite(out[i]));
  if (bad !== undefined) throw new ExprError(`"${bad}" isn't a number`);
  return out;
}

function need(data: number[], n = 1) {
  if (data.length < n) throw new ExprError(n === 1 ? "Enter at least one number" : `Enter at least ${n} numbers`);
}

export const sum = (d: number[]) => d.reduce((a, b) => a + b, 0);
export function mean(d: number[]) {
  need(d);
  return sum(d) / d.length;
}

/** Linear interpolation between closest ranks (Excel QUARTILE.INC, numpy default). */
export function quantile(d: number[], p: number) {
  need(d);
  const s = [...d].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo]! + (h - lo) * ((s[lo + 1] ?? s[lo]!) - s[lo]!);
}
export const median = (d: number[]) => quantile(d, 0.5);

export function modes(d: number[]): number[] {
  need(d);
  const counts = new Map<number, number>();
  for (const v of d) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(...counts.values());
  if (max === 1 && d.length > 1) return [];
  return [...counts].filter(([, c]) => c === max).map(([v]) => v).sort((a, b) => a - b);
}

export function variance(d: number[], sample = true) {
  need(d, sample ? 2 : 1);
  const m = mean(d);
  return d.reduce((s, v) => s + (v - m) ** 2, 0) / (d.length - (sample ? 1 : 0));
}
export const stdev = (d: number[], sample = true) => Math.sqrt(variance(d, sample));

export function describe(d: number[]) {
  need(d);
  const s = [...d].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  return {
    count: d.length,
    sum: sum(d),
    mean: mean(d),
    median: median(d),
    modes: modes(d),
    min: s[0]!,
    max: s[s.length - 1]!,
    range: s[s.length - 1]! - s[0]!,
    midRange: (s[0]! + s[s.length - 1]!) / 2,
    q1,
    q3,
    iqr: q3 - q1,
    populationVariance: variance(d, false),
    populationStdDev: stdev(d, false),
    sampleVariance: d.length > 1 ? variance(d, true) : null,
    sampleStdDev: d.length > 1 ? stdev(d, true) : null,
    standardError: d.length > 1 ? stdev(d, true) / Math.sqrt(d.length) : null,
  };
}

export function zScore(x: number, mu: number, sigma: number) {
  if (!(sigma > 0)) throw new ExprError("The standard deviation must be greater than 0");
  return (x - mu) / sigma;
}

export function linearRegression(x: number[], y: number[]) {
  if (x.length !== y.length) throw new ExprError("x and y need the same number of values");
  need(x, 2);
  const mx = mean(x);
  const my = mean(y);
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
  const syy = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i]! - my), 0);
  if (sxx === 0) throw new ExprError("All x values are the same: no line fits");
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r = syy === 0 ? 1 : sxy / Math.sqrt(sxx * syy);
  return { slope, intercept, r, r2: r * r, equation: `y = ${fmt(slope)}x ${intercept < 0 ? "-" : "+"} ${fmt(Math.abs(intercept))}` };
}
const fmt = (v: number) => String(Number(v.toPrecision(8)));

export function correlation(x: number[], y: number[]) {
  return linearRegression(x, y).r;
}

/* ───────────── Special functions ───────────── */

export function erf(x: number): number {
  return 1 - erfc(x);
}

/** Normal CDF through erfc (accurate in the tails too). */
export function normalCdf(x: number, mu = 0, sigma = 1): number {
  if (!(sigma > 0)) throw new ExprError("The standard deviation must be greater than 0");
  const z = (x - mu) / sigma;
  return 0.5 * erfc(-z / Math.SQRT2);
}

/**
 * Complementary error function: the Maclaurin series of erf for |x| < 3, the continued fraction
 * of erfc beyond (Abramowitz & Stegun 7.1.5 and 7.1.14). Relative error below 1e-13.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  let r: number;
  if (z < 3) {
    let term = z;
    let s = z;
    for (let n = 1; n < 200; n++) {
      term *= (-z * z) / n;
      const add = term / (2 * n + 1);
      s += add;
      if (Math.abs(add) < 1e-17 * Math.abs(s)) break;
    }
    r = 1 - (2 / Math.sqrt(Math.PI)) * s;
  } else {
    // Lentz's method for erfc(z) = exp(-z²)/√π · 1/(z + 1/2/(z + 1/(z + 3/2/(z + …)))).
    let f = z;
    let C = z;
    let D = 0;
    for (let n = 1; n < 300; n++) {
      const an = n / 2;
      D = z + an * D;
      D = D === 0 ? 1e-300 : 1 / D;
      C = z + an / C;
      if (C === 0) C = 1e-300;
      const delta = C * D;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    r = Math.exp(-z * z) / Math.sqrt(Math.PI) / f;
  }
  return x >= 0 ? r : 2 - r;
}

export function normalPdf(x: number, mu = 0, sigma = 1) {
  if (!(sigma > 0)) throw new ExprError("The standard deviation must be greater than 0");
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** Inverse standard normal CDF (Acklam's algorithm, refined with one Newton step). */
export function normalInv(p: number): number {
  if (!(p > 0 && p < 1)) throw new ExprError("The probability must be between 0 and 1");
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

export function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 500; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // Continued fraction for Q, then P = 1 − Q.
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Regularized incomplete beta I_x(a, b). */
export function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (aa: number, bb: number, xx: number) => {
    const qab = aa + bb;
    const qap = aa + 1;
    const qam = aa - 1;
    let c = 1;
    let d = 1 - (qab * xx) / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa2 = (m * (bb - m) * xx) / ((qam + m2) * (aa + m2));
      d = 1 + aa2 * d;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa2 / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      h *= d * c;
      aa2 = (-(aa + m) * (qab + m) * xx) / ((aa + m2) * (qap + m2));
      d = 1 + aa2 * d;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa2 / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? (bt * cf(a, b, x)) / a : 1 - (bt * cf(b, a, 1 - x)) / b;
}

/** Student's t CDF with ν degrees of freedom. */
export function tCdf(t: number, nu: number): number {
  if (!(nu > 0)) throw new ExprError("Degrees of freedom must be greater than 0");
  const x = nu / (nu + t * t);
  const tail = 0.5 * betaI(nu / 2, 0.5, x);
  return t >= 0 ? 1 - tail : tail;
}

export function chiSquareCdf(x: number, k: number): number {
  if (!(k > 0)) throw new ExprError("Degrees of freedom must be greater than 0");
  return gammaP(k / 2, x / 2);
}

/** p-value of a z or t statistic. */
export function pValue(stat: number, tails: 1 | 2, dist: "z" | "t" = "z", df?: number): number {
  const cdf = dist === "z" ? normalCdf(Math.abs(stat)) : tCdf(Math.abs(stat), df ?? NaN);
  const one = 1 - cdf;
  return tails === 2 ? Math.min(1, 2 * one) : one;
}

/** Pearson's chi-square test from observed and expected counts. */
export function chiSquareTest(observed: number[], expected: number[]) {
  if (observed.length !== expected.length || observed.length < 2) throw new ExprError("Observed and expected need the same number of categories (2 or more)");
  if (expected.some((e) => !(e > 0))) throw new ExprError("Expected counts must be greater than 0");
  const chi2 = observed.reduce((s, o, i) => s + (o - expected[i]!) ** 2 / expected[i]!, 0);
  const df = observed.length - 1;
  return { chi2, df, p: 1 - chiSquareCdf(chi2, df) };
}

export function binomial(n: number, k: number, p: number) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) throw new ExprError("n and k must be whole numbers with 0 ≤ k ≤ n");
  if (!(p >= 0 && p <= 1)) throw new ExprError("p must be between 0 and 1");
  const pmf = (j: number) => nCr(n, j) * p ** j * (1 - p) ** (n - j);
  let cdf = 0;
  for (let j = 0; j <= k; j++) cdf += pmf(j);
  return { pmf: pmf(k), cdf: Math.min(1, cdf), mean: n * p, variance: n * p * (1 - p) };
}

export function poisson(lambda: number, k: number) {
  if (!(lambda > 0) || !Number.isInteger(k) || k < 0) throw new ExprError("λ must be > 0 and k a whole number ≥ 0");
  const pmf = (j: number) => Math.exp(-lambda + j * Math.log(lambda) - lnGamma(j + 1));
  let cdf = 0;
  for (let j = 0; j <= k; j++) cdf += pmf(j);
  return { pmf: pmf(k), cdf: Math.min(1, cdf) };
}
