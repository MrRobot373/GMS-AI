/**
 * Tools with their own screens (not a fixed list of inputs): resistor colour codes, molar mass
 * from a formula, IPv4 subnets, dates and times. Plus the catalog of every tool for the UI.
 */
import { ExprError } from "./expression";

/* ───────────── Resistor colour code (IEC 60062) ───────────── */

export const COLORS = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white", "gold", "silver"] as const;
export type Color = (typeof COLORS)[number];
const DIGIT: Partial<Record<Color, number>> = { black: 0, brown: 1, red: 2, orange: 3, yellow: 4, green: 5, blue: 6, violet: 7, grey: 8, white: 9 };
const MULT: Partial<Record<Color, number>> = { black: 1, brown: 10, red: 100, orange: 1e3, yellow: 1e4, green: 1e5, blue: 1e6, violet: 1e7, grey: 1e8, white: 1e9, gold: 0.1, silver: 0.01 };
const TOL: Partial<Record<Color, number>> = { brown: 1, red: 2, green: 0.5, blue: 0.25, violet: 0.1, grey: 0.05, gold: 5, silver: 10 };
const TEMPCO: Partial<Record<Color, number>> = { black: 250, brown: 100, red: 50, orange: 15, yellow: 25, blue: 10, violet: 5 };

export function decodeResistor(bands: Color[]) {
  if (bands.length < 3 || bands.length > 6) throw new ExprError("A resistor has 3 to 6 bands");
  const digits = bands.length <= 4 ? 2 : 3;
  let v = 0;
  for (let i = 0; i < digits; i++) {
    const d = DIGIT[bands[i]!];
    if (d === undefined) throw new ExprError(`Band ${i + 1} can't be ${bands[i]}`);
    v = v * 10 + d;
  }
  const m = MULT[bands[digits]!];
  if (m === undefined) throw new ExprError(`The multiplier band can't be ${bands[digits]}`);
  const tolBand = bands[digits + 1];
  const tol = tolBand === undefined ? 20 : TOL[tolBand];
  if (tol === undefined) throw new ExprError(`The tolerance band can't be ${tolBand}`);
  const tcBand = bands[digits + 2];
  const tempco = tcBand ? TEMPCO[tcBand] : undefined;
  if (tcBand && tempco === undefined) throw new ExprError(`The temperature band can't be ${tcBand}`);
  const ohms = Number((v * m).toPrecision(12));
  return { ohms, tolerance: tol, min: ohms * (1 - tol / 100), max: ohms * (1 + tol / 100), tempco: tempco ?? null };
}

/** Bands for a value (4-band, or 5-band for three significant digits). */
export function encodeResistor(ohms: number, bands: 4 | 5 = 4, tolerance: Color = "gold"): Color[] {
  if (!(ohms >= 0.1)) throw new ExprError("From 0.1 Ω up");
  const digits = bands === 4 ? 2 : 3;
  const exp = Math.floor(Math.log10(ohms)) - (digits - 1);
  const sig = Math.round(ohms / 10 ** exp);
  const s = String(sig).padStart(digits, "0");
  if (s.length > digits) return encodeResistor(Number((sig * 10 ** exp).toPrecision(digits)), bands, tolerance);
  if (Math.abs(sig * 10 ** exp - ohms) > 1e-9 * ohms) throw new ExprError(`${ohms} Ω needs more than ${digits} significant digits`);
  const mult = (Object.entries(MULT) as [Color, number][]).find(([, f]) => Math.abs(Math.log10(f) - exp) < 1e-9)?.[0];
  if (!mult) throw new ExprError("That value is out of the colour code's range");
  const byDigit = Object.fromEntries(Object.entries(DIGIT).map(([c, d]) => [d, c])) as Record<number, Color>;
  return [...s.split("").map((d) => byDigit[Number(d)]!), mult, tolerance];
}

/* ───────────── Molar mass ───────────── */

/** IUPAC standard atomic weights (abridged, conventional values; radioactive elements: longest-lived isotope). */
export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.18,
  Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078,
  Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224,
  Nb: 92.906, Mo: 95.95, Tc: 98, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71,
  Sb: 121.76, Te: 127.6, I: 126.9, Xe: 131.29, Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24,
  Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.5, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05,
  Lu: 174.97, Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59,
  Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.04, Pa: 231.04,
  U: 238.03, Np: 237, Pu: 244, Am: 243,
};

/** Molar mass of a formula like H2SO4, Ca(OH)2, CuSO4·5H2O. */
export function molarMass(formula: string) {
  const src = formula.replace(/\s+/g, "");
  if (!src) throw new ExprError("Enter a formula like H2SO4");
  const counts = new Map<string, number>();
  let i = 0;
  const num = () => {
    const m = /^\d+/.exec(src.slice(i));
    if (!m) return 1;
    i += m[0].length;
    return Number(m[0]);
  };
  const group = (): Map<string, number> => {
    const c = new Map<string, number>();
    while (i < src.length) {
      const ch = src[i]!;
      if (ch === "(" || ch === "[") {
        i++;
        const inner = group();
        if (src[i] !== ")" && src[i] !== "]") throw new ExprError("Missing closing bracket");
        i++;
        const k = num();
        for (const [e, n] of inner) c.set(e, (c.get(e) ?? 0) + n * k);
      } else if (ch === ")" || ch === "]") return c;
      else if (ch === "·" || ch === "." || ch === "*") {
        i++;
        const k = num();
        const rest = group();
        for (const [e, n] of rest) c.set(e, (c.get(e) ?? 0) + n * k);
      } else {
        const m = /^[A-Z][a-z]?/.exec(src.slice(i));
        if (!m) throw new ExprError(`Unexpected "${ch}" at position ${i + 1}`);
        if (!(m[0] in ATOMIC_MASS)) throw new ExprError(`Unknown element "${m[0]}"`);
        i += m[0].length;
        c.set(m[0], (c.get(m[0]) ?? 0) + num());
      }
    }
    return c;
  };
  for (const [e, n] of group()) counts.set(e, n);
  if (i < src.length) throw new ExprError("Unexpected closing bracket");
  const elements = [...counts].map(([symbol, count]) => ({ symbol, count, mass: ATOMIC_MASS[symbol]! * count }));
  const total = elements.reduce((s, e) => s + e.mass, 0);
  return { formula: src, molarMass: total, elements: elements.map((e) => ({ ...e, fraction: e.mass / total })) };
}

/* ───────────── IPv4 subnets ───────────── */

function ipToInt(ip: string): number {
  const parts = ip.trim().split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) throw new ExprError(`"${ip}" isn't an IPv4 address`);
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}
const intToIp = (n: number) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join(".");

/** "192.168.1.10/24" or an address plus a prefix length or mask. */
export function subnet(address: string, prefixOrMask?: string | number) {
  let addr = address.trim();
  let prefix: number;
  if (addr.includes("/")) {
    const [a, p] = addr.split("/");
    addr = a!;
    prefixOrMask = p;
  }
  if (prefixOrMask === undefined || prefixOrMask === "") throw new ExprError("Add a prefix length (/24) or a mask (255.255.255.0)");
  if (typeof prefixOrMask === "string" && prefixOrMask.includes(".")) {
    const m = ipToInt(prefixOrMask);
    const bits = m.toString(2).padStart(32, "0");
    if (!/^1*0*$/.test(bits)) throw new ExprError("That mask isn't contiguous");
    prefix = bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
  } else {
    prefix = Number(prefixOrMask);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new ExprError("The prefix length goes from 0 to 32");
  }
  const ip = ipToInt(addr);
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ip / size) * size;
  const broadcast = network + size - 1;
  const mask = prefix === 0 ? 0 : (2 ** 32 - size);
  const usable = prefix >= 31 ? size : Math.max(0, size - 2);
  return {
    address: intToIp(ip),
    prefix,
    mask: intToIp(mask),
    wildcard: intToIp(2 ** 32 - 1 - mask),
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    firstHost: intToIp(prefix >= 31 ? network : network + 1),
    lastHost: intToIp(prefix >= 31 ? broadcast : broadcast - 1),
    addresses: size,
    usableHosts: usable,
    private: /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(intToIp(ip)),
    binaryMask: mask.toString(2).padStart(32, "0").replace(/(.{8})(?!$)/g, "$1."),
  };
}

/* ───────────── Dates and times ───────────── */

const DAY = 86_400_000;
const utc = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) throw new ExprError(`"${d}" isn't a date (YYYY-MM-DD)`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(t);
  if (back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) throw new ExprError(`"${d}" isn't a real date`);
  return t;
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Days, weeks and the calendar difference between two dates (and working days). */
export function dateDifference(from: string, to: string) {
  const a = utc(from);
  const b = utc(to);
  const sign = b >= a ? 1 : -1;
  const [lo, hi] = sign > 0 ? [a, b] : [b, a];
  const days = Math.round((hi - lo) / DAY);
  const d1 = new Date(lo);
  const d2 = new Date(hi);
  let years = d2.getUTCFullYear() - d1.getUTCFullYear();
  let months = d2.getUTCMonth() - d1.getUTCMonth();
  let dd = d2.getUTCDate() - d1.getUTCDate();
  if (dd < 0) {
    months--;
    dd += new Date(Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  let weekdays = 0;
  const full = Math.floor(days / 7);
  weekdays = full * 5;
  for (let k = full * 7; k < days; k++) {
    const wd = new Date(lo + k * DAY).getUTCDay();
    if (wd !== 0 && wd !== 6) weekdays++;
  }
  return { days: sign * days, weeks: (sign * days) / 7, years, months, remainingDays: dd, weekdays: sign * weekdays };
}

export function addToDate(date: string, amount: { years?: number; months?: number; days?: number }) {
  const t = new Date(utc(date));
  if (amount.years) t.setUTCFullYear(t.getUTCFullYear() + amount.years);
  if (amount.months) {
    const day = t.getUTCDate();
    t.setUTCDate(1);
    t.setUTCMonth(t.getUTCMonth() + amount.months);
    // 31 January + 1 month → 28/29 February, not 3 March.
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, last));
  }
  if (amount.days) t.setUTCDate(t.getUTCDate() + amount.days);
  return { date: iso(t.getTime()), weekday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][t.getUTCDay()]! };
}

/** Age on a date, in years, months and days. */
export function age(birth: string, on: string) {
  const d = dateDifference(birth, on);
  if (d.days < 0) throw new ExprError("The birth date is after the other date");
  return { years: d.years, months: d.months, days: d.remainingDays, totalDays: d.days };
}

/** Parse "1:30", "1h 30m", "90m", "02:15:30" into seconds. */
export function parseDuration(s: string): number {
  const t = s.trim().toLowerCase();
  let m = /^(-?)(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(t);
  if (m) {
    const v = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
    return m[1] ? -v : v;
  }
  m = /^(?:(\d+(?:\.\d+)?)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/.exec(t);
  if (m && t) return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  throw new ExprError(`"${s}" isn't a duration (try 1:30, 2h 15m or 90m)`);
}

export function formatDuration(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  let s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "14:30" ↔ "2:30 PM". */
export function convertClock(s: string): { h24: string; h12: string } {
  const t = s.trim().toUpperCase();
  let m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/.exec(t);
  let h: number;
  let min: number;
  if (m) {
    h = Number(m[1]);
    min = Number(m[2]);
    if (h < 1 || h > 12 || min > 59) throw new ExprError(`"${s}" isn't a time`);
    if (m[3] === "AM") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else {
    m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) throw new ExprError(`"${s}" isn't a time (try 14:30 or 2:30 PM)`);
    h = Number(m[1]);
    min = Number(m[2]);
    if (h > 23 || min > 59) throw new ExprError(`"${s}" isn't a time`);
  }
  const mm = String(min).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h24: `${String(h).padStart(2, "0")}:${mm}`, h12: `${h12}:${mm} ${h < 12 ? "AM" : "PM"}` };
}

/** Dice: n rolls of a d-sided die. */
export function rollDice(n: number, sides: number, random = Math.random) {
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new ExprError("1 to 100 dice");
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) throw new ExprError("2 to 1000 sides");
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(random() * sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) };
}

/* ───────────── Catalog of tools with their own screens ───────────── */

export interface ToolInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  keywords: string[];
}

export const TOOLS: ToolInfo[] = [
  { id: "basic", name: "Basic calculator", category: "math", description: "Arithmetic, percentages and memory, with history.", keywords: ["calculator", "add", "percent", "memory"] },
  { id: "scientific", name: "Scientific calculator", category: "math", description: "Casio-style keypad: trig, logs, powers, nCr, constants, DEG/RAD/GRAD, variables.", keywords: ["scientific", "sin", "cos", "log", "casio", "trig"] },
  { id: "converter", name: "Unit converter", category: "everyday", description: "Length, mass, temperature, pressure, energy, data and more.", keywords: ["convert", "units", "conversion"] },
  { id: "equation", name: "Equation solver", category: "math", description: "Linear, quadratic, cubic and higher polynomial equations, with steps.", keywords: ["quadratic", "cubic", "polynomial", "roots", "solve for x"] },
  { id: "linear-system", name: "System of linear equations", category: "math", description: "Solve 2 to 6 simultaneous linear equations.", keywords: ["simultaneous", "linear system", "substitution", "elimination"] },
  { id: "matrix", name: "Matrix calculator", category: "math", description: "Add, multiply, transpose, determinant, inverse, power, eigenvalues (2×2).", keywords: ["matrix", "determinant", "inverse", "transpose"] },
  { id: "vector", name: "Vector calculator", category: "math", description: "Dot and cross products, magnitude and the angle between vectors.", keywords: ["vector", "dot product", "cross product"] },
  { id: "calculus", name: "Calculus", category: "math", description: "Derivatives, integrals, limits, Taylor series, sums, tangent lines, roots and a plot.", keywords: ["derivative", "integral", "limit", "taylor", "summation", "tangent", "graph"] },
  { id: "statistics", name: "Statistics", category: "math", description: "Mean, median, mode, deviation, quartiles, regression and correlation.", keywords: ["mean", "median", "standard deviation", "variance", "regression", "correlation"] },
  { id: "distributions", name: "Probability distributions", category: "math", description: "Normal, Student's t, chi-square, binomial and Poisson; z-scores and p-values.", keywords: ["normal distribution", "p value", "z score", "binomial", "chi square", "t test"] },
  { id: "fractions", name: "Fraction calculator", category: "math", description: "Exact fraction arithmetic, mixed numbers and decimal to fraction.", keywords: ["fraction", "mixed number", "simplify"] },
  { id: "number-theory", name: "Primes, GCD and LCM", category: "math", description: "Prime test and factorization, GCD, LCM, primes up to n.", keywords: ["prime", "factorization", "gcd", "lcm"] },
  { id: "complex", name: "Complex numbers", category: "math", description: "Complex arithmetic, polar and rectangular forms, powers and roots.", keywords: ["complex", "imaginary", "polar", "phasor"] },
  { id: "sequences", name: "Sequences", category: "math", description: "Arithmetic and geometric sequences: nth term and sums.", keywords: ["sequence", "series", "arithmetic", "geometric"] },
  { id: "base-n", name: "Number bases and bitwise", category: "computer", description: "Binary, octal, decimal, hex and any base to 36; AND/OR/XOR/shifts; two's complement; IEEE 754.", keywords: ["binary", "hex", "octal", "bitwise", "two's complement", "ieee 754", "float"] },
  { id: "roman", name: "Roman numerals", category: "math", description: "Convert to and from Roman numerals (1–3999).", keywords: ["roman numerals"] },
  { id: "subnet", name: "IPv4 subnet calculator", category: "computer", description: "Network, broadcast, host range and mask for an address and prefix.", keywords: ["subnet", "cidr", "ip address", "netmask"] },
  { id: "resistor-color", name: "Resistor colour code", category: "electronics", description: "Decode 3- to 6-band resistors, or find the bands for a value.", keywords: ["resistor color code", "colour bands"] },
  { id: "molar-mass", name: "Molar mass", category: "chemistry", description: "Molar mass and composition from a chemical formula.", keywords: ["molar mass", "molecular weight", "formula mass"] },
  { id: "amortization", name: "Loan amortization schedule", category: "finance", description: "Month-by-month schedule with extra payments.", keywords: ["amortization", "mortgage", "emi schedule", "loan"] },
  { id: "cash-flows", name: "NPV and IRR", category: "finance", description: "Net present value and internal rate of return of cash flows.", keywords: ["npv", "irr", "cash flow", "discounted"] },
  { id: "dates", name: "Date and time", category: "everyday", description: "Days between dates, add to a date, age, durations, 12/24-hour clock.", keywords: ["date", "days between", "age", "hours", "time", "24 hour"] },
  { id: "random", name: "Random numbers and dice", category: "everyday", description: "Random numbers in a range and dice rolls.", keywords: ["random", "dice", "roll"] },
  { id: "constants", name: "Physical constants", category: "physics", description: "CODATA constants to insert into calculations.", keywords: ["constants", "planck", "avogadro", "boltzmann"] },
];
