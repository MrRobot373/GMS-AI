/** Hand-worked cases for the mechanical, science and everyday calculators. See handworked.ts. */
import type { HandCase } from "./handworked";

const PI = Math.PI;
const G0 = 9.80665;
const Rgas = 8.314462618;
const KE = 8.9875517923e9;
const HP = 6.62607015e-34;
const QE = 1.602176634e-19;
const NA = 6.02214076e23;
const GN = 6.6743e-11;
const SIGMA = 5.670374419e-8;
const C0 = 299792458;
const deg = (rad: number) => (rad * 180) / PI;
const k = (note: string, inputs: Record<string, number | number[]>, expect: Record<string, number>): HandCase => ({ note, inputs, expect });

const beamPoint = (F: number, L: number, E: number, I: number) => ({
  delta: (F * L ** 3 * 1e5) / (48 * E * I),
  M: (F * L) / 4,
});
const beamUdl = (w: number, L: number, E: number, I: number) => ({
  delta: (5 * w * L ** 4 * 1e5) / (384 * E * I),
  M: (w * L ** 2) / 8,
});
const cantPoint = (F: number, L: number, E: number, I: number) => ({
  delta: (F * L ** 3 * 100) / (3 * E * I),
  M: F * L,
});
const cantUdl = (w: number, L: number, E: number, I: number) => ({
  delta: (w * L ** 4 * 100) / (8 * E * I),
  M: (w * L ** 2) / 2,
});
const euler = (E: number, I: number, L: number, K: number) => ({ Pcr: (PI ** 2 * E * I * 0.01) / (K * L) ** 2 });
const vessel = (p: number, r: number, t: number) => {
  const hoop = (p * r) / (10 * t);
  return { hoop, long: hoop / 2 };
};
const shaft = (T: number, dMm: number, L: number, G: number) => {
  const d = dMm / 1000;
  const J = (PI * d ** 4) / 32;
  return { tau: (T * (d / 2)) / J / 1e6, theta: deg((T * L) / (G * 1e9 * J)) };
};
const darcy = (rho: number, mu: number, V: number, Dmm: number, L: number, epsMm: number) => {
  const D = Dmm / 1000;
  const Re = (rho * V * Dmm) / mu;
  const f = Re < 2300 ? 64 / Re : 0.25 / Math.log10(epsMm / 1000 / (3.7 * D) + 5.74 / Re ** 0.9) ** 2;
  const dp = (f * (L / D) * ((rho * V * V) / 2)) / 1000;
  return { Re, f, dp, head: (dp * 1000) / (rho * G0) };
};
const gas = {
  n: (p: number, V: number, Tc: number) => ({ n: (p * V) / (Rgas * (Tc + 273.15)) }),
  p: (n: number, V: number, Tc: number) => ({ p: (n * Rgas * (Tc + 273.15)) / V }),
  V: (p: number, n: number, Tc: number) => ({ V: (n * Rgas * (Tc + 273.15)) / p }),
  T: (p: number, V: number, n: number) => ({ T: (p * V) / (n * Rgas) - 273.15 }),
};
const isa = (h: number) => {
  const TK = 288.15 - 0.0065 * h;
  const pPa = 101325 * (TK / 288.15) ** (G0 / (0.0065 * 287.05));
  return { T: TK - 273.15, p: pPa / 1000, rho: pPa / (287.05 * TK) };
};
const rtdR = (R0: number, T: number) => R0 * (1 + 3.9083e-3 * T + -5.775e-7 * T * T);
const rtdT = (R0: number, R: number) => {
  const A = 3.9083e-3, B = -5.775e-7;
  return (-A + Math.sqrt(A * A - 4 * B * (1 - R / R0))) / (2 * B);
};
const thermR = (R0: number, T0: number, beta: number, T: number) => R0 * Math.exp(beta * (1 / (T + 273.15) - 1 / (T0 + 273.15)));
const thermT = (R0: number, T0: number, beta: number, R: number) => 1 / (1 / (T0 + 273.15) + Math.log(R / R0) / beta) - 273.15;
const navyMan = (h: number, neck: number, waist: number) => 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
const navyWoman = (h: number, neck: number, waist: number, hip: number) => 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(h)) - 450;
const bmr = (sex: number, m: number, h: number, age: number) => 10 * m + 6.25 * h - 5 * age + (sex === 1 ? 5 : -161);
const fv = (P: number, rPct: number, t: number, m: number, D: number) => {
  const r = rPct / 100 / m;
  const n = m * t;
  const growth = (1 + r) ** n;
  return P * growth + (r === 0 ? D * n : (D * (growth - 1)) / r);
};
const pmt = (L: number, annualPct: number, years: number) => {
  const r = annualPct / 100 / 12;
  const n = years * 12;
  if (r === 0) return L / n;
  return (L * r) / (1 - (1 + r) ** -n);
};

export const HAND_REST: Record<string, HandCase[]> = {
  "gear-ratio": [
    k("1:1", { N1: 40, N2: 40, n: 1000, T: 5, eff: 100 }, { i: 1, nout: 1000, Tout: 5 }),
    k("2:1 step-up (driven smaller)", { N1: 40, N2: 20, n: 600, T: 8, eff: 100 }, { i: 0.5, nout: 1200, Tout: 4 }),
    k("90 % efficient 4:1", { N1: 10, N2: 40, n: 1200, T: 2, eff: 90 }, { i: 4, nout: 300, Tout: 7.2 }),
  ],
  "belt-length": [
    k("equal pulleys", { D: 100, d: 100, C: 400 }, { L: 800 + PI * 100, ratio: 1 }),
    k("3:1", { D: 300, d: 100, C: 500 }, { L: 1000 + (PI * 400) / 2 + 40000 / 2000, ratio: 3 }),
    k("close centres", { D: 80, d: 40, C: 200 }, { L: 400 + (PI * 120) / 2 + 1600 / 800, ratio: 2 }),
    k("large span", { D: 250, d: 150, C: 2000 }, { L: 4000 + (PI * 400) / 2 + 10000 / 8000, ratio: 250 / 150 }),
  ],
  "hookes-law": [
    k("force and rate", { F: 100, k: 5 }, { x: 20, E: 0.5 * 5 * 400 / 1000 }),
    k("1 N/mm through 10 mm", { k: 1, x: 10 }, { F: 10, E: 0.05 }),
    k("force and deflection 8 N, 4 mm", { F: 8, x: 4 }, { k: 2, E: 0.5 * 2 * 16 / 1000 }),
  ],
  "beam-simply-supported-point": [
    k("F=2 kN, L=3 m, steel, I=500 cm⁴", { F: 2, L: 3, E: 200, I: 500 }, beamPoint(2, 3, 200, 500)),
    k("F=10 kN, L=1 m", { F: 10, L: 1, E: 200, I: 2000 }, beamPoint(10, 1, 200, 2000)),
    k("aluminium", { F: 1, L: 1, E: 70, I: 100 }, beamPoint(1, 1, 70, 100)),
    k("double the span, 16× the deflection of a 1 m beam", { F: 4, L: 2, E: 200, I: 100 }, beamPoint(4, 2, 200, 100)),
  ],
  "beam-simply-supported-udl": [
    k("2 kN/m over 2 m", { w: 2, L: 2, E: 200, I: 500 }, beamUdl(2, 2, 200, 500)),
    k("0.5 kN/m over 6 m", { w: 0.5, L: 6, E: 200, I: 5000 }, beamUdl(0.5, 6, 200, 5000)),
    k("aluminium beam", { w: 1, L: 2, E: 70, I: 200 }, beamUdl(1, 2, 70, 200)),
    k("stiff short beam", { w: 10, L: 1, E: 200, I: 10000 }, beamUdl(10, 1, 200, 10000)),
  ],
  "beam-cantilever-point": [
    k("100 N, 1 m, steel", { F: 100, L: 1, E: 200, I: 50 }, cantPoint(100, 1, 200, 50)),
    k("1000 N, 0.5 m", { F: 1000, L: 0.5, E: 200, I: 100 }, cantPoint(1000, 0.5, 200, 100)),
    k("aluminium cantilever", { F: 200, L: 2, E: 70, I: 80 }, cantPoint(200, 2, 70, 80)),
    k("very stiff", { F: 50, L: 0.4, E: 200, I: 1000 }, cantPoint(50, 0.4, 200, 1000)),
  ],
  "beam-cantilever-udl": [
    k("500 N/m, 1 m", { w: 500, L: 1, E: 200, I: 100 }, cantUdl(500, 1, 200, 100)),
    k("2000 N/m, 1.5 m", { w: 2000, L: 1.5, E: 200, I: 400 }, cantUdl(2000, 1.5, 200, 400)),
    k("aluminium", { w: 100, L: 2, E: 70, I: 50 }, cantUdl(100, 2, 70, 50)),
    k("light load", { w: 100, L: 1, E: 200, I: 200 }, cantUdl(100, 1, 200, 200)),
  ],
  "bending-stress": [
    k("100 N·m, c=10 mm, I=1e6 mm⁴", { M: 100, c: 10, I: 1e6 }, { sigma: (100 * 10 * 1000) / 1e6 }),
    k("500 N·m, 25 mm, I=2e6", { M: 500, c: 25, I: 2e6 }, { sigma: (500 * 25 * 1000) / 2e6 }),
    k("10 N·m, 5 mm, I=10000", { M: 10, c: 5, I: 10000 }, { sigma: (10 * 5 * 1000) / 10000 }),
    k("square 50 mm, M=200", { M: 200, c: 25, I: (50 * 50 ** 3) / 12 }, { sigma: (200 * 25 * 1000) / ((50 * 50 ** 3) / 12) }),
  ],
  "euler-buckling": [
    k("pinned, 1 m, I=5 cm⁴", { E: 200, I: 5, L: 1, K: 1 }, euler(200, 5, 1, 1)),
    k("fixed-fixed K=0.5", { E: 200, I: 5, L: 1, K: 0.5 }, euler(200, 5, 1, 0.5)),
    k("fixed-pinned K=0.7", { E: 210, I: 20, L: 3, K: 0.7 }, euler(210, 20, 3, 0.7)),
  ],
  "pressure-vessel": [
    k("5 bar, r=200 mm, t=5 mm", { p: 5, r: 200, t: 5 }, vessel(5, 200, 5)),
    k("1 bar, r=100, t=2", { p: 1, r: 100, t: 2 }, vessel(1, 100, 2)),
    k("20 bar, r=250, t=8", { p: 20, r: 250, t: 8 }, vessel(20, 250, 8)),
    k("thin tube 2 bar", { p: 2, r: 50, t: 1 }, vessel(2, 50, 1)),
  ],
  "shear-stress": [
    k("single shear", { F: 5, A: 100, planes: 1 }, { tau: (5 * 1000) / 100 }),
    k("double shear 20 kN", { F: 20, A: 200, planes: 2 }, { tau: (20 * 1000) / 400 }),
    k("1 kN on 50 mm²", { F: 1, A: 50, planes: 1 }, { tau: 20 }),
    k("double shear equal areas", { F: 8, A: 40, planes: 2 }, { tau: 100 }),
  ],
  "shaft-torsion": [
    k("50 N·m, 20 mm, 0.5 m, G=80", { T: 50, d: 20, L: 0.5, G: 80 }, shaft(50, 20, 0.5, 80)),
    k("200 N·m, 40 mm, 2 m", { T: 200, d: 40, L: 2, G: 80 }, shaft(200, 40, 2, 80)),
    k("10 N·m, 10 mm, 0.2 m, aluminium G=26", { T: 10, d: 10, L: 0.2, G: 26 }, shaft(10, 10, 0.2, 26)),
    k("1 kN·m, 80 mm, 1 m", { T: 1000, d: 80, L: 1, G: 80 }, shaft(1000, 80, 1, 80)),
  ],
  "axial-deformation": [
    k("10 kN, 1 m, 50 mm², 200 GPa", { F: 10, L: 1, A: 50, E: 200 }, { sigma: 200, strain: 1000, delta: 1 }),
    k("5 kN, 3 m, 200 mm², 70 GPa", { F: 5, L: 3, A: 200, E: 70 }, { sigma: 25, strain: (25 / 70) * 1000, delta: (25 / 70) * 3 }),
    k("100 kN, 0.5 m, 500 mm²", { F: 100, L: 0.5, A: 500, E: 200 }, { sigma: 200, strain: 1000, delta: 0.5 }),
    k("1 kN, 4 m, 25 mm², 110 GPa", { F: 1, L: 4, A: 25, E: 110 }, { sigma: 40, strain: (40 / 110) * 1000, delta: (40 / 110) * 4 }),
  ],
  "spring-mass-frequency": [
    k("k=100, m=1", { k: 100, m: 1 }, { wn: 10, fn: 10 / (2 * PI) }),
    k("k=400, m=4", { k: 400, m: 4 }, { wn: 10, fn: 10 / (2 * PI) }),
    k("k=9, m=1", { k: 9, m: 1 }, { wn: 3, fn: 3 / (2 * PI) }),
    k("k=2500, m=10", { k: 2500, m: 10 }, { wn: Math.sqrt(250), fn: Math.sqrt(250) / (2 * PI) }),
  ],
  "bolt-torque": [
    k("K=0.2, 10 kN, M10", { K: 0.2, F: 10, d: 10 }, { T: 20 }),
    k("K=0.15, 50 kN, M16", { K: 0.15, F: 50, d: 16 }, { T: 120 }),
    k("K=0.3, 5 kN, M8", { K: 0.3, F: 5, d: 8 }, { T: 12 }),
    k("K=0.18, 20 kN, M12", { K: 0.18, F: 20, d: 12 }, { T: 43.2 }),
  ],
  "section-rectangle": [
    k("10 by 10 mm", { b: 10, h: 10 }, { A: 100, I: (10 * 10 ** 3) / 12, Z: (10 * 100) / 6 }),
    k("20 by 40", { b: 20, h: 40 }, { A: 800, I: (20 * 40 ** 3) / 12, Z: (20 * 40 ** 2) / 6 }),
    k("square 50", { b: 50, h: 50 }, { A: 2500, I: (50 ** 4) / 12, Z: (50 ** 3) / 6 }),
    k("wide flat 200 by 10", { b: 200, h: 10 }, { A: 2000, I: (200 * 1000) / 12, Z: (200 * 100) / 6 }),
  ],
  "section-circle": [
    k("hollow 100/80", { D: 100, d: 80 }, { A: (PI * (10000 - 6400)) / 4, I: (PI * (1e8 - 80 ** 4)) / 64, Z: ((PI * (1e8 - 80 ** 4)) / 64) / 50, J: (PI * (1e8 - 80 ** 4)) / 32 }),
    k("solid 20 mm", { D: 20, d: 0 }, { A: (PI * 400) / 4, I: (PI * 20 ** 4) / 64, Z: ((PI * 20 ** 4) / 64) / 10, J: (PI * 20 ** 4) / 32 }),
    k("thin tube 50/48", { D: 50, d: 48 }, { A: (PI * (2500 - 2304)) / 4, I: (PI * (50 ** 4 - 48 ** 4)) / 64 }),
    k("solid 2 mm", { D: 2, d: 0 }, { A: PI, I: (PI * 16) / 64 }),
  ],
  "concrete-volume": [
    k("1×1×100 mm, no waste", { L: 1, W: 1, T: 100, waste: 0 }, { V: 0.1, Vyd: 0.1 / 0.9144 ** 3 }),
    k("10 % waste", { L: 2, W: 3, T: 100, waste: 10 }, { V: 0.66, Vyd: 0.66 / 0.9144 ** 3 }),
    k("200 mm slab", { L: 6, W: 4, T: 200, waste: 0 }, { V: 4.8, Vyd: 4.8 / 0.9144 ** 3 }),
    k("5 % waste on 1 m³ net", { L: 2, W: 2, T: 250, waste: 5 }, { V: 1.05, Vyd: 1.05 / 0.9144 ** 3 }),
  ],
  "rebar-weight": [
    k("8 mm, 1 m", { d: 8, L: 1 }, { perM: (PI * 0.008 ** 2 / 4) * 7850, m: (PI * 0.008 ** 2 / 4) * 7850 }),
    k("16 mm, 12 m", { d: 16, L: 12 }, { perM: (PI * 0.016 ** 2 / 4) * 7850, m: (PI * 0.016 ** 2 / 4) * 7850 * 12 }),
    k("10 mm, 6 m", { d: 10, L: 6 }, { perM: (PI * 0.0001 / 4) * 7850, m: (PI * 0.0001 / 4) * 7850 * 6 }),
    k("25 mm, 2 m", { d: 25, L: 2 }, { perM: (PI * 0.025 ** 2 / 4) * 7850, m: (PI * 0.025 ** 2 / 4) * 7850 * 2 }),
  ],
  "grade-slope": [
    k("45° when rise equals run", { rise: 1, run: 1 }, { grade: 100, angle: 45, length: Math.SQRT2 }),
    k("1 in 100", { rise: 1, run: 100 }, { grade: 1, angle: deg(Math.atan(0.01)), length: Math.hypot(1, 100) }),
    k("3 in 4", { rise: 3, run: 4 }, { grade: 75, angle: deg(Math.atan(0.75)), length: 5 }),
    k("flat", { rise: 0, run: 10 }, { grade: 0, angle: 0, length: 10 }),
  ],
  "bearing-pressure": [
    k("100 kN on 2 m², allow 100 kPa", { P: 100, A: 2, qa: 100 }, { q: 50, Areq: 1, util: 50 }),
    k("at the allowable", { P: 300, A: 2, qa: 150 }, { q: 150, Areq: 2, util: 100 }),
    k("overstressed", { P: 400, A: 2, qa: 100 }, { q: 200, Areq: 4, util: 200 }),
    k("light footing", { P: 50, A: 5, qa: 50 }, { q: 10, Areq: 1, util: 20 }),
  ],
  "wind-load": [
    k("10 m/s, Cd=1, 1 m², rho=1.2", { V: 10, Cd: 1, A: 1, rho: 1.2 }, { q: 60, F: 0.06 }),
    k("20 m/s, Cd=1, A=1, rho=1.25", { V: 20, Cd: 1, A: 1, rho: 1.25 }, { q: 250, F: 0.25 }),
    k("zero speed", { V: 0, Cd: 1.3, A: 8, rho: 1.225 }, { q: 0, F: 0 }),
    k("Cd=2, 15 m/s", { V: 15, Cd: 2, A: 4, rho: 1.2 }, { q: 0.5 * 1.2 * 225, F: (0.5 * 1.2 * 225 * 2 * 4) / 1000 }),
  ],
  "rational-runoff": [
    k("C=1, 36 mm/h, 1 ha", { C: 1, i: 36, A: 1 }, { Q: 0.1 }),
    k("C=0.5, 72 mm/h, 10 ha", { C: 0.5, i: 72, A: 10 }, { Q: 1 }),
    k("C=0.3, 100 mm/h, 3.6 ha", { C: 0.3, i: 100, A: 3.6 }, { Q: 0.3 }),
    k("C=0.9, 20 mm/h, 4 ha", { C: 0.9, i: 20, A: 4 }, { Q: 0.2 }),
  ],
  "manning-pipe": [
    k("600 mm, 0.1 %, n=0.013", { D: 600, S: 0.1, n: 0.013 }, (() => {
      const D = 0.6, S = 0.001, n = 0.013;
      const V = (1 / n) * (D / 4) ** (2 / 3) * Math.sqrt(S);
      return { V, Q: V * PI * D * D * 250 };
    })()),
    k("n=0.01, 200 mm, 1 %", { D: 200, S: 1, n: 0.01 }, (() => {
      const D = 0.2, V = 100 * (0.05) ** (2 / 3) * 0.1;
      return { V, Q: ((V * PI * D * D) / 4) * 1000 };
    })()),
    k("150 mm at 0.5 %", { D: 150, S: 0.5, n: 0.013 }, (() => {
      const D = 0.15, V = (1 / 0.013) * (D / 4) ** (2 / 3) * Math.sqrt(0.005);
      return { V, Q: ((V * PI * D * D) / 4) * 1000 };
    })()),
    k("1000 mm, n=0.015, 0.05 %", { D: 1000, S: 0.05, n: 0.015 }, (() => {
      const D = 1, V = (1 / 0.015) * 0.25 ** (2 / 3) * Math.sqrt(0.0005);
      return { V, Q: ((V * PI) / 4) * 1000 };
    })()),
  ],
  "earthwork-volume": [
    k("equal ends", { A1: 8, A2: 8, L: 10 }, { V: 80 }),
    k("one end zero", { A1: 12, A2: 0, L: 30 }, { V: 180 }),
    k("5 and 15 over 4 m", { A1: 5, A2: 15, L: 4 }, { V: 40 }),
    k("unit prism", { A1: 1, A2: 1, L: 1 }, { V: 1 }),
  ],
  "brick-count": [
    k("exact 100 bricks", { A: 1, l: 190, h: 90, j: 10, waste: 0 }, { n: 50 }),
    k("25 % waste rounds up 62.5", { A: 1, l: 190, h: 90, j: 10, waste: 25 }, { n: 63 }),
    k("1 m² of 200×50 with 0 joint", { A: 1, l: 200, h: 50, j: 0, waste: 0 }, { n: 100 }),
    k("small wall rounds up", { A: 0.1, l: 215, h: 65, j: 10, waste: 0 }, { n: Math.ceil(0.1 / (0.225 * 0.075)) }),
  ],
  "heat-conduction": [
    k("k=1, A=1, 10 K, 10 mm", { k: 1, A: 1, dT: 10, L: 10 }, { Q: 1000, R: 0.01 }),
    k("copper-like k=400", { k: 400, A: 0.01, dT: 50, L: 5 }, { Q: (400 * 0.01 * 50) / 0.005, R: 0.005 / (400 * 0.01) }),
    k("thicker insulation", { k: 0.04, A: 20, dT: 15, L: 200 }, { Q: (0.04 * 20 * 15) / 0.2, R: 0.2 / (0.04 * 20) }),
    k("unit wall", { k: 2, A: 3, dT: 5, L: 50 }, { Q: (2 * 3 * 5) / 0.05, R: 0.05 / 6 }),
  ],
  "heat-convection": [
    k("h=5, A=1, 10 K", { h: 5, A: 1, dT: 10 }, { Q: 50 }),
    k("h=25, A=4, 8 K", { h: 25, A: 4, dT: 8 }, { Q: 800 }),
    k("no difference", { h: 100, A: 2, dT: 0 }, { Q: 0 }),
    k("h=1", { h: 1, A: 7, dT: 3 }, { Q: 21 }),
  ],
  "heat-radiation": [
    k("black body 0 °C to 0 °C", { eps: 1, A: 1, Ts: 0, Tinf: 0 }, { Q: 0 }),
    k("ε=1, 2 m², 27 °C vs 0 °C", { eps: 1, A: 2, Ts: 27, Tinf: 0 }, { Q: SIGMA * 2 * (300.15 ** 4 - 273.15 ** 4) }),
    k("ε=0.5, small rise", { eps: 0.5, A: 1, Ts: 30, Tinf: 20 }, { Q: 0.5 * SIGMA * ((303.15) ** 4 - 293.15 ** 4) }),
    k("surroundings hotter", { eps: 0.8, A: 1, Ts: 10, Tinf: 40 }, { Q: 0.8 * SIGMA * (283.15 ** 4 - 313.15 ** 4) }),
  ],
  "sensible-heat": [
    k("2 kg, c=1000, 10 K, no heater", { m: 2, c: 1000, dT: 10 }, { Q: 20 }),
    k("0.5 kg water, 10 K, 1 kW", { m: 0.5, c: 4184, dT: 10, P: 1 }, { Q: 20.92, t: (0.5 * 4184 * 10) / 60000 }),
    k("zero rise", { m: 5, c: 500, dT: 0, P: 1 }, { Q: 0, t: 0 }),
    k("10 kg, c=900, 20 K, 3 kW", { m: 10, c: 900, dT: 20, P: 3 }, { Q: 180, t: 180000 / 180000 }),
  ],
  "reynolds-number": [
    k("Re=2300 boundary", { rho: 1000, V: 1, D: 2.3, mu: 1 }, { Re: 2300 }),
    k("air-like", { rho: 1.2, V: 5, D: 100, mu: 0.018 }, { Re: (1.2 * 5 * 100) / 0.018 }),
    k("slow oil", { rho: 900, V: 0.2, D: 25, mu: 50 }, { Re: (900 * 0.2 * 25) / 50 }),
    k("D=10 mm water at 1 m/s", { rho: 1000, V: 1, D: 10, mu: 1 }, { Re: 10000 }),
  ],
  "darcy-weisbach": [
    k("laminar Re=500", { rho: 1000, mu: 10, V: 1, D: 5, L: 2, eps: 0 }, darcy(1000, 10, 1, 5, 2, 0)),
    k("smooth turbulent", { rho: 1000, mu: 1, V: 1, D: 100, L: 50, eps: 0 }, darcy(1000, 1, 1, 100, 50, 0)),
    k("rough commercial", { rho: 1000, mu: 1, V: 3, D: 80, L: 40, eps: 0.045 }, darcy(1000, 1, 3, 80, 40, 0.045)),
  ],
  "pipe-flow-rate": [
    k("50 mm at 2 m/s", { D: 50, V: 2 }, { Q: 2 * PI * 0.025 ** 2 * 3600 }),
    k("200 mm at 0.5 m/s", { D: 200, V: 0.5 }, { Q: 0.5 * PI * 0.1 ** 2 * 3600 }),
    k("from 36 m³/h in a 100 mm pipe", { D: 100, Q: 36 }, { V: (36 / 3600) / (PI * 0.05 ** 2) }),
    k("from 3.6 m³/h in a 20 mm pipe", { D: 20, Q: 3.6 }, { V: (3.6 / 3600) / (PI * 0.01 ** 2) }),
  ],
  "pump-power": [
    k("1 L/s, 10 m, 100 %", { Q: 1, H: 10, rho: 1000, eff: 100 }, { Phyd: (1000 * G0 * 0.001 * 10) / 1000, Pshaft: (G0 * 10) / 1000 }),
    k("water, 50 %", { Q: 5, H: 40, rho: 1000, eff: 50 }, { Phyd: (1000 * G0 * 0.005 * 40) / 1000, Pshaft: (1000 * G0 * 0.005 * 40) / 500 }),
    k("oil density 850", { Q: 2, H: 15, rho: 850, eff: 80 }, { Phyd: (850 * G0 * 0.002 * 15) / 1000, Pshaft: (850 * G0 * 0.002 * 15) / 800 }),
    k("small head", { Q: 20, H: 2, rho: 1000, eff: 60 }, { Phyd: (G0 * 0.02 * 2), Pshaft: (G0 * 0.02 * 2) / 0.6 }),
  ],
  lmtd: [
    k("10 K and 5 K", { dT1: 10, dT2: 5 }, { lmtd: 5 / Math.log(2) }),
    k("100 and 10", { dT1: 100, dT2: 10 }, { lmtd: 90 / Math.log(10) }),
    k("with UA", { dT1: 20, dT2: 10, U: 100, A: 4 }, { lmtd: 10 / Math.log(2), Q: (100 * 4 * (10 / Math.log(2))) / 1000 }),
  ],
  "fan-affinity": [
    k("double speed", { n1: 1000, n2: 2000, Q1: 10, p1: 100, P1: 1 }, { Q2: 20, p2: 400, P2: 8 }),
    k("same speed", { n1: 900, n2: 900, Q1: 50, p1: 250, P1: 4 }, { Q2: 50, p2: 250, P2: 4 }),
    k("10 % faster", { n1: 1000, n2: 1100, Q1: 100, p1: 200, P1: 5 }, { Q2: 110, p2: 200 * 1.21, P2: 5 * 1.1 ** 3 }),
    k("quarter speed", { n1: 1200, n2: 300, Q1: 80, p1: 160, P1: 16 }, { Q2: 20, p2: 10, P2: 0.25 }),
  ],
  "ideal-gas": [
    k("1 mol, 1 L, 0 °C", { n: 1, V: 1, T: 0 }, gas.p(1, 1, 0)),
    k("solve volume at 1 bar and 25 °C", { p: 100, n: 2, T: 25 }, gas.V(100, 2, 25)),
    k("solve temperature", { p: 101.325, V: 22.414, n: 1 }, gas.T(101.325, 22.414, 1)),
  ],
  "hydrostatic-pressure": [
    k("1 m of water, no atmosphere added to gauge", { rho: 1000, h: 1, patm: 101.325 }, { p: G0, pabs: G0 + 101.325 }),
    k("mercury-like density", { rho: 13600, h: 0.76, patm: 0 }, { p: (13600 * G0 * 0.76) / 1000, pabs: (13600 * G0 * 0.76) / 1000 }),
    k("zero depth", { rho: 1000, h: 0, patm: 100 }, { p: 0, pabs: 100 }),
    k("2 m, rho=1025", { rho: 1025, h: 2, patm: 101.3 }, { p: (1025 * G0 * 2) / 1000, pabs: (1025 * G0 * 2) / 1000 + 101.3 }),
  ],
  "orifice-flow": [
    k("Cd=1, 10 mm, 1 kPa, water", { d: 10, dp: 1, rho: 1000, Cd: 1 }, (() => {
      const A = PI * 0.005 ** 2;
      const v = Math.sqrt(2);
      return { v, Q: A * v * 1000 };
    })()),
    k("Cd=0.6, 50 mm, 100 kPa", { d: 50, dp: 100, rho: 1000, Cd: 0.6 }, (() => {
      const A = PI * 0.025 ** 2;
      const v = Math.sqrt(200);
      return { v, Q: 0.6 * A * v * 1000 };
    })()),
    k("air-like density", { d: 20, dp: 1, rho: 1.2, Cd: 0.65 }, (() => {
      const A = PI * 0.01 ** 2;
      const v = Math.sqrt((2 * 1000) / 1.2);
      return { v, Q: 0.65 * A * v * 1000 };
    })()),
    k("Cd=1, 1 mm, 4 kPa", { d: 1, dp: 4, rho: 1000, Cd: 1 }, (() => {
      const v = Math.sqrt(8);
      const A = PI * 0.0005 ** 2;
      return { v, Q: A * v * 1000 };
    })()),
  ],
  buoyancy: [
    k("seawater 1025 kg/m³, 2 L", { rho: 1025, V: 2 }, { F: 1025 * G0 * 0.002, m: 2.05 }),
    k("10 L of water", { rho: 1000, V: 10 }, { F: 10 * G0, m: 10 }),
    k("air on 1 m³", { rho: 1.2, V: 1000 }, { F: 1.2 * G0, m: 1.2 }),
    k("half a litre", { rho: 800, V: 0.5 }, { F: 800 * G0 * 0.0005, m: 0.4 }),
  ],
  "kinetic-energy": [
    k("1 kg at 1 m/s", { m: 1, v: 1 }, { KE: 0.5, p: 1 }),
    k("4 kg at 5 m/s", { m: 4, v: 5 }, { KE: 50, p: 20 }),
    k("at rest", { m: 12, v: 0 }, { KE: 0, p: 0 }),
  ],
  "potential-energy": [
    k("1 kg, 1 m, g=10", { m: 1, h: 1, g: 10 }, { PE: 10 }),
    k("2 kg, 3 m, standard g", { m: 2, h: 3, g: G0 }, { PE: 6 * G0 }),
    k("zero height", { m: 80, h: 0, g: G0 }, { PE: 0 }),
    k("moon g", { m: 5, h: 4, g: 1.62 }, { PE: 32.4 }),
  ],
  "newtons-second-law": [
    k("solve acceleration", { F: 12, m: 3 }, { a: 4 }),
    k("1 N on 1 kg", { F: 1, m: 1 }, { a: 1 }),
    k("mass from 9.8 N and 9.8 m/s²", { F: 9.8, a: 9.8 }, { m: 1 }),
  ],
  weight: [
    k("1 kg at standard g", { m: 1, g: G0 }, { W: G0 }),
    k("10 kg at g=10", { m: 10, g: 10 }, { W: 100 }),
    k("Mars gravity", { m: 10, g: 3.71 }, { W: 37.1 }),
    k("2 kg at 1.62", { m: 2, g: 1.62 }, { W: 3.24 }),
  ],
  "work-done": [
    k("aligned force", { F: 8, d: 3, theta: 0, t: 4 }, { W: 24, P: 6 }),
    k("30°", { F: 10, d: 2, theta: 30 }, { W: 10 * Math.sqrt(3) }),
    k("180° opposes motion", { F: 4, d: 5, theta: 180, t: 1 }, { W: -20, P: -20 }),
  ],
  "uniform-acceleration": [
    k("u=5, a=0, t=3", { u: 5, a: 0, t: 3 }, { v: 5, s: 15 }),
    k("u=10, a=-2, t=4", { u: 10, a: -2, t: 4 }, { v: 2, s: 24 }),
    k("u=3, a=1, t=2", { u: 3, a: 1, t: 2 }, { v: 5, s: 8 }),
    k("from rest, a=9.8, t=1", { u: 0, a: 9.8, t: 1 }, { v: 9.8, s: 4.9 }),
  ],
  "free-fall": [
    k("h=g/2 so t=1, v=g", { h: G0 / 2, g: G0 }, { t: 1, v: G0 }),
    k("5 m at g=10", { h: 5, g: 10 }, { t: 1, v: 10 }),
    k("zero height", { h: 0, g: G0 }, { t: 0, v: 0 }),
    k("45 m at g=10", { h: 45, g: 10 }, { t: 3, v: 30 }),
  ],
  "projectile": [
    k("straight up", { v: 10, theta: 90, g: 10 }, { R: 0, H: 5, T: 2 }),
    k("30° at g=10", { v: 10, theta: 30, g: 10 }, { R: 10 * Math.sin(PI / 3), H: (5 * 0.5) ** 2 / 20 * 4, T: 1 }),
    k("horizontal", { v: 20, theta: 0, g: 10 }, { R: 0, H: 0, T: 0 }),
    k("g=10, 20 m/s, 45°", { v: 20, theta: 45, g: 10 }, { R: 40, H: 10, T: 2 * Math.SQRT2 }),
  ],
  centripetal: [
    k("1 kg, 1 m/s, r=1", { m: 1, v: 1, r: 1 }, { a: 1, F: 1 }),
    k("3 kg, 6 m/s, r=3", { m: 3, v: 6, r: 3 }, { a: 12, F: 36 }),
    k("at rest", { m: 5, v: 0, r: 2 }, { a: 0, F: 0 }),
    k("v=10, r=5, m=2", { m: 2, v: 10, r: 5 }, { a: 20, F: 40 }),
  ],
  "angular-velocity": [
    k("120 rpm, r=1", { n: 120, r: 1 }, { w: 4 * PI, f: 2, v: 4 * PI }),
    k("zero speed", { n: 0, r: 2 }, { w: 0, f: 0, v: 0 }),
    k("30 rpm, r=2", { n: 30, r: 2 }, { w: PI, f: 0.5, v: 2 * PI }),
    k("300 rpm, r=0.1", { n: 300, r: 0.1 }, { w: 10 * PI, f: 5, v: PI }),
  ],
  pendulum: [
    k("L=g/(4π²) has T=1 s", { L: G0 / (4 * PI * PI), g: G0 }, { T: 1, f: 1 }),
    k("L=0.25, g=π²", { L: 0.25, g: PI * PI }, { T: 1, f: 1 }),
    k("L=4, g=π²", { L: 4, g: PI * PI }, { T: 4, f: 0.25 }),
    k("short pendulum", { L: 0.25, g: G0 }, { T: 2 * PI * Math.sqrt(0.25 / G0), f: 1 / (2 * PI * Math.sqrt(0.25 / G0)) }),
  ],
  friction: [
    k("μ=0", { mu: 0, N: 50 }, { F: 0 }),
    k("μ=1", { mu: 1, N: 12 }, { F: 12 }),
    k("μ=0.15", { mu: 0.15, N: 80 }, { F: 12 }),
    k("μ=0.5", { mu: 0.5, N: 40 }, { F: 20 }),
  ],
  "drag-force": [
    k("ρ=2, v=10, Cd=1, A=1", { rho: 2, v: 10, Cd: 1, A: 1 }, { F: 100, P: 1 }),
    k("at rest", { rho: 1.225, v: 0, Cd: 0.3, A: 2 }, { F: 0, P: 0 }),
    k("ρ=1, v=2, Cd=0.5, A=4", { rho: 1, v: 2, Cd: 0.5, A: 4 }, { F: 4, P: 0.008 }),
    k("20 m/s", { rho: 1.25, v: 20, Cd: 0.4, A: 1 }, { F: 100, P: 2 }),
  ],
  "coulombs-law": [
    k("opposite charges attract", { q1: 1, q2: -2, r: 10 }, { F: (KE * 1e-6 * -2e-6) / 0.01 }),
    k("1 µC, 1 µC, 100 cm", { q1: 1, q2: 1, r: 100 }, { F: KE * 1e-12 / 1 }),
    k("2 µC and 3 µC at 20 cm", { q1: 2, q2: 3, r: 20 }, { F: (KE * 6e-12) / 0.04 }),
    k("0.5 µC pair at 5 cm", { q1: 0.5, q2: 0.5, r: 5 }, { F: (KE * 0.25e-12) / 0.0025 }),
  ],
  "gravitational-force": [
    k("two 1 kg masses 1 km apart", { m1: 1, m2: 1, r: 1 }, { F: GN / 1e6 }),
    k("1000 kg and 1000 kg at 2 km", { m1: 1000, m2: 1000, r: 2 }, { F: (GN * 1e6) / 4e6 }),
    k("Earth and Moon order", { m1: 5.972e24, m2: 7.342e22, r: 384400 }, { F: (GN * 5.972e24 * 7.342e22) / (384400e3) ** 2 }),
    k("1e6 kg at 10 km", { m1: 1e6, m2: 1e6, r: 10 }, { F: (GN * 1e12) / 1e8 }),
  ],
  "wave-speed": [
    k("λ and v give f", { lambda: 2, v: 340 }, { f: 170, lambda: 2, v: 340 }),
    k("f and λ give v", { f: 100, lambda: 3 }, { v: 300, f: 100, lambda: 3 }),
    k("1 Hz, 1 m", { f: 1, lambda: 1 }, { v: 1 }),
    k("solve wavelength at 10 m/s", { f: 5, v: 10 }, { lambda: 2 }),
  ],
  "photon-energy": [
    k("1240 nm is about 1 eV", { lambda: 1240 }, { E: (HP * C0) / 1240e-9 / QE, f: C0 / 1240e-9 / 1e12 }),
    k("100 nm", { lambda: 100 }, { E: (HP * C0) / 100e-9 / QE, f: C0 / 100e-9 / 1e12 }),
    k("1000 nm", { lambda: 1000 }, { E: (HP * C0) / 1e-6 / QE }),
    k("632.8 nm HeNe", { lambda: 632.8 }, { E: (HP * C0) / 632.8e-9 / QE }),
  ],
  density: [
    k("solve mass", { rho: 1000, V: 2 }, { m: 2 }),
    k("solve volume", { rho: 500, m: 1 }, { V: 2 }),
    k("1 kg in 2 L", { m: 1, V: 2 }, { rho: 500 }),
    k("water 1 kg, 1 L", { m: 1, V: 1 }, { rho: 1000 }),
  ],
  "pressure-force-area": [
    k("100 N on 1 m²", { F: 100, A: 1 }, { p: 0.1 }),
    k("5000 N on 2 m²", { F: 5000, A: 2 }, { p: 2.5 }),
    k("1 N on 0.001 m²", { F: 1, A: 0.001 }, { p: 1 }),
    k("250 N on 0.25 m²", { F: 250, A: 0.25 }, { p: 1 }),
  ],
  impulse: [
    k("100 N for 1 s", { F: 100, dt: 1000, m: 2 }, { J: 100, dv: 50 }),
    k("zero force", { F: 0, dt: 50, m: 1 }, { J: 0, dv: 0 }),
    k("20 N for 250 ms on 4 kg", { F: 20, dt: 250, m: 4 }, { J: 5, dv: 1.25 }),
    k("1 N for 1 ms on 1 kg", { F: 1, dt: 1, m: 1 }, { J: 0.001, dv: 0.001 }),
  ],
  "moles-from-mass": [
    k("12 g of carbon-12", { m: 12, M: 12 }, { n: 1, N: NA }),
    k("2 moles of O2", { m: 64, M: 32 }, { n: 2, N: 2 * NA }),
    k("half a mole", { m: 9, M: 18 }, { n: 0.5, N: 0.5 * NA }),
    k("0.1 mol", { m: 5.844, M: 58.44 }, { n: 0.1, N: 0.1 * NA }),
  ],
  molarity: [
    k("2 mol in 0.5 L", { m: 116.88, M: 58.44, V: 0.5 }, { c: 4 }),
    k("0.1 mol in 2 L", { m: 4, M: 40, V: 2 }, { c: 0.05 }),
    k("10 g, M=10, 0.25 L", { m: 10, M: 10, V: 0.25 }, { c: 4 }),
    k("1 g, M=100, 2 L", { m: 1, M: 100, V: 2 }, { c: 0.005 }),
  ],
  dilution: [
    k("solve C2", { C1: 1, V1: 10, V2: 100 }, { C2: 0.1 }),
    k("solve V2", { C1: 2, V1: 50, C2: 0.25 }, { V2: 400 }),
    k("solve C1", { V1: 20, C2: 0.1, V2: 200 }, { C1: 1 }),
    k("equal volumes", { C1: 3, V1: 40, V2: 40 }, { C2: 3 }),
  ],
  ph: [
    k("1 M acid", { H: 1 }, { pH: 0, pOH: 14, OH: 1e-14 }),
    k("neutral 1e-7", { H: 1e-7 }, { pH: 7, pOH: 7, OH: 1e-7 }),
    k("1e-4 M", { H: 1e-4 }, { pH: 4, pOH: 10, OH: 1e-10 }),
    k("0.01 M", { H: 0.01 }, { pH: 2, pOH: 12, OH: 1e-12 }),
  ],
  "atom-particles": [
    k("carbon-12 neutral", { Z: 6, A: 12, q: 0 }, { p: 6, n: 6, e: 6 }),
    k("hydrogen", { Z: 1, A: 1, q: 0 }, { p: 1, n: 0, e: 1 }),
    k("chloride ion", { Z: 17, A: 35, q: -1 }, { p: 17, n: 18, e: 18 }),
    k("sodium ion", { Z: 11, A: 23, q: 1 }, { p: 11, n: 12, e: 10 }),
  ],
  arrhenius: [
    k("Ea=0, k=A", { A: 1000, Ea: 0, T: 25 }, { k: 1000 }),
    k("100 kJ/mol at 25 °C", { A: 1e13, Ea: 100, T: 25 }, { k: 1e13 * Math.exp(-100000 / (Rgas * 298.15)) }),
    k("50 kJ/mol at 100 °C", { A: 1e12, Ea: 50, T: 100 }, { k: 1e12 * Math.exp(-50000 / (Rgas * 373.15)) }),
    k("10 kJ/mol at 0.01 °C", { A: 2, Ea: 10, T: 0.01 }, { k: 2 * Math.exp(-10000 / (Rgas * 273.16)) }),
  ],
  antoine: [
    k("water at 0 °C", { A: 8.07131, B: 1730.63, C: 233.426, T: 0 }, { P: 10 ** (8.07131 - 1730.63 / 233.426) }),
    k("A=5, B=0 so P=10^5 mmHg", { A: 5, B: 0, C: 200, T: 25 }, { P: 1e5 }),
    k("simple numbers", { A: 7, B: 1000, C: 250, T: 50 }, { P: 10 ** (7 - 1000 / 300) }),
    k("water at 25 °C", { A: 8.07131, B: 1730.63, C: 233.426, T: 25 }, { P: 10 ** (8.07131 - 1730.63 / 258.426) }),
  ],
  "cstr-pfr-volume": [
    k("50 % conversion", { F: 1, k: 1, X: 50 }, { Vcstr: 0.001, Vpfr: 0.001 * Math.log(2) }),
    k("10 % conversion", { F: 2, k: 0.1, X: 10 }, { Vcstr: (0.002 * 0.1) / (0.1 * 0.9), Vpfr: -(0.002 / 0.1) * Math.log(0.9) }),
    k("99 %", { F: 0.5, k: 0.2, X: 99 }, { Vcstr: (0.0005 * 0.99) / (0.2 * 0.01), Vpfr: -(0.0005 / 0.2) * Math.log(0.01) }),
    k("low flow", { F: 0.1, k: 0.05, X: 20 }, { Vcstr: (0.0001 * 0.2) / (0.05 * 0.8), Vpfr: -(0.0001 / 0.05) * Math.log(0.8) }),
  ],
  "heat-exchanger-duty": [
    k("1 kg/s, cp=1, 5 K", { m: 1, cp: 1, dT: 5 }, { Q: 5 }),
    k("zero rise", { m: 3, cp: 4, dT: 0 }, { Q: 0 }),
    k("0.5 kg/s, cp=2, 40 K", { m: 0.5, cp: 2, dT: 40 }, { Q: 40 }),
    k("10 kg/s steam-like cp=2.1", { m: 10, cp: 2.1, dT: 8 }, { Q: 168 }),
  ],
  "rocket-equation": [
    k("Isp=1 s, mass ratio e", { Isp: 1, m0: Math.E, mf: 1 }, { dv: G0, ve: G0 }),
    k("equal masses, no Δv", { Isp: 250, m0: 10, mf: 10 }, { dv: 0, ve: 250 * G0 }),
    k("mass ratio 2", { Isp: 200, m0: 20, mf: 10 }, { dv: 200 * G0 * Math.log(2), ve: 200 * G0 }),
    k("Isp=100, ratio 4", { Isp: 100, m0: 8, mf: 2 }, { dv: 100 * G0 * Math.log(4), ve: 100 * G0 }),
  ],
  "circular-orbit": [
    k("surface, μ = R so v=1 m/s", { h: 0, R: 1, mu: 1000 }, { v: 3.6, T: (2 * PI * Math.sqrt(1000 ** 3 / 1000)) / 60 }),
    k("h=R, μ=8000", { h: 1, R: 1, mu: 8000 }, { v: Math.sqrt(8000 / 2000) * 3.6, T: (2 * PI * Math.sqrt(2000 ** 3 / 8000)) / 60 }),
    k("GEO-like numbers scaled", { h: 1000, R: 6000, mu: 4e14 }, { v: Math.sqrt(4e14 / 7e6) * 3.6, T: (2 * PI * Math.sqrt((7e6) ** 3 / 4e14)) / 60 }),
    k("low orbit 200 km", { h: 200, R: 6371, mu: 3.986004418e14 }, { v: Math.sqrt(3.986004418e14 / 6.571e6) * 3.6, T: (2 * PI * Math.sqrt(6.571e6 ** 3 / 3.986004418e14)) / 60 }),
  ],
  "lift-drag": [
    k("q=1, S=2, CL=1, CD=0.1", { rho: 2, V: 1, S: 2, CL: 1, CD: 0.1 }, { L: 0.002, D: 0.0002, LD: 10 }),
    k("CL=CD", { rho: 1.2, V: 10, S: 1, CL: 0.4, CD: 0.4 }, { L: (0.6 * 100 * 0.4) / 1000, D: (0.6 * 100 * 0.4) / 1000, LD: 1 }),
    k("zero lift", { rho: 1.225, V: 40, S: 10, CL: 0, CD: 0.02 }, { L: 0, D: (0.5 * 1.225 * 1600 * 10 * 0.02) / 1000, LD: 0 }),
    k("LD=20", { rho: 1, V: 50, S: 4, CL: 1, CD: 0.05 }, { L: (0.5 * 2500 * 4) / 1000, D: (0.5 * 2500 * 4 * 0.05) / 1000, LD: 20 }),
  ],
  "mach-number": [
    k("at rest, 15 °C", { V: 0, T: 15 }, { a: Math.sqrt(1.4 * 287.05 * 288.15), M: 0 }),
    k("Mach 1 at 15 °C", { V: Math.sqrt(1.4 * 287.05 * 288.15), T: 15 }, { a: Math.sqrt(1.4 * 287.05 * 288.15), M: 1 }),
    k("100 m/s at 0 °C", { V: 100, T: 0 }, { a: Math.sqrt(1.4 * 287.05 * 273.15), M: 100 / Math.sqrt(1.4 * 287.05 * 273.15) }),
    k("200 m/s at −50 °C", { V: 200, T: -50 }, { a: Math.sqrt(1.4 * 287.05 * 223.15), M: 200 / Math.sqrt(1.4 * 287.05 * 223.15) }),
  ],
  "isa-atmosphere": [
    k("1000 m", { h: 1000 }, isa(1000)),
    k("11000 m tropopause edge", { h: 11000 }, isa(11000)),
    k("2500 m", { h: 2500 }, isa(2500)),
  ],
  "thrust-mass-flow": [
    k("1 kg/s at g0", { m: 1, ve: G0 }, { F: G0 / 1000, Isp: 1 }),
    k("2 kg/s at 1000 m/s", { m: 2, ve: 1000 }, { F: 2, Isp: 1000 / G0 }),
    k("0.5 kg/s at 2000 m/s", { m: 0.5, ve: 2000 }, { F: 1, Isp: 2000 / G0 }),
    k("10 kg/s at 4500 m/s", { m: 10, ve: 4500 }, { F: 45, Isp: 4500 / G0 }),
  ],
  "sound-level-sum": [
    k("one source", { L: [73] }, { total: 73 }),
    k("10 dB apart adds little", { L: [80, 70] }, { total: 10 * Math.log10(10 ** 8 + 10 ** 7) }),
    k("four equal 60 dB", { L: [60, 60, 60, 60] }, { total: 66.02059991328 }),
  ],
  "sound-distance": [
    k("double distance", { L1: 80, r1: 2, r2: 4 }, { L2: 80 - 20 * Math.log10(2) }),
    k("same distance", { L1: 65, r1: 3, r2: 3 }, { L2: 65 }),
    k("closer by 10×", { L1: 50, r1: 10, r2: 1 }, { L2: 70 }),
    k("half distance", { L1: 40, r1: 8, r2: 4 }, { L2: 46.02059991328 }),
  ],
  "chemical-dosing": [
    k("1 mg/L, 1 m³/h, pure", { dose: 1, Q: 1, purity: 100 }, { feed: 0.024 }),
    k("50 % strength doubles the feed", { dose: 2, Q: 100, purity: 50 }, { feed: 9.6 }),
    k("10 mg/L, 10 m³/h, 80 %", { dose: 10, Q: 10, purity: 80 }, { feed: (10 * 10 * 24) / 1000 / 0.8 }),
    k("0 dose", { dose: 0, Q: 50, purity: 100 }, { feed: 0 }),
  ],
  "electricity-emissions": [
    k("1 kWh at 1 kg/kWh", { E: 1, EF: 1 }, { co2: 0.001 }),
    k("zero energy", { E: 0, EF: 0.7 }, { co2: 0 }),
    k("1000 kWh at 0.5", { E: 1000, EF: 0.5 }, { co2: 0.5 }),
    k("250 kWh at 0.4", { E: 250, EF: 0.4 }, { co2: 0.1 }),
  ],
  "lever-rule": [
    k("midway", { C0: 50, Ca: 0, CL: 100 }, { WL: 50, Wa: 50 }),
    k("at the liquid end", { C0: 80, Ca: 20, CL: 80 }, { WL: 100, Wa: 0 }),
    k("at the solid end", { C0: 20, Ca: 20, CL: 80 }, { WL: 0, Wa: 100 }),
    k("one quarter", { C0: 40, Ca: 20, CL: 100 }, { WL: 25, Wa: 75 }),
  ],
  "corrosion-rate": [
    k("zero loss", { W: 0, rho: 7.87, A: 10, t: 100 }, { CR: 0 }),
    k("87.6 mg, rho=1, A=1 cm², t=1 h", { W: 87.6, rho: 1, A: 1, t: 1 }, { CR: 87.6 * 87.6 }),
    k("steel coupon half the textbook case", { W: 50, rho: 7.87, A: 10, t: 1000 }, { CR: 87.6 * 50 / (7.87 * 10 * 1000) }),
    k("aluminium density", { W: 200, rho: 2.7, A: 20, t: 500 }, { CR: 87.6 * 200 / (2.7 * 20 * 500) }),
  ],
  "crystal-density": [
    k("simple cubic n=1, a=0.3 nm, A=50", { n: 1, A: 50, a: 0.3 }, { rho: 50 / (NA * (0.3e-7) ** 3) }),
    k("FCC n=4, a=0.4 nm, A=60", { n: 4, A: 60, a: 0.4 }, { rho: 240 / (NA * (0.4e-7) ** 3) }),
    k("BCC iron a=0.287 nm", { n: 2, A: 55.845, a: 0.287 }, { rho: (2 * 55.845) / (NA * (0.287e-7) ** 3) }),
    k("n=4, A=197, a=0.408 nm gold-like", { n: 4, A: 196.97, a: 0.408 }, { rho: (4 * 196.97) / (NA * (0.408e-7) ** 3) }),
  ],
  "loop-4-20ma": [
    k("4 mA is LRV", { I: 4, lrv: 0, urv: 100 }, { pv: 0, pct: 0 }),
    k("20 mA is URV", { I: 20, lrv: 0, urv: 100 }, { pv: 100, pct: 100 }),
    k("offset range at 16 mA", { I: 16, lrv: 100, urv: 200 }, { pv: 175, pct: 75 }),
  ],
  "loop-value-to-ma": [
    k("LRV is 4 mA", { pv: 0, lrv: 0, urv: 50 }, { I: 4 }),
    k("URV is 20 mA", { pv: 50, lrv: 0, urv: 50 }, { I: 20 }),
    k("25 %", { pv: 25, lrv: 0, urv: 100 }, { I: 8 }),
    k("negative range", { pv: 0, lrv: -40, urv: 40 }, { I: 12 }),
  ],
  "rtd-pt100": [
    k("0 °C is R0", { R0: 100, T: 0 }, { R: 100 }),
    k("200 °C", { R0: 100, T: 200 }, { R: rtdR(100, 200) }),
    k("Pt1000 at 50 °C", { R0: 1000, T: 50 }, { R: rtdR(1000, 50) }),
    k("inverse at 0 °C resistance", { R0: 100, R: 100 }, { T: 0 }),
  ],
  "thermistor-beta": [
    k("at T0, R=R0", { R0: 10, T0: 25, beta: 3950, T: 25 }, { R: 10 }),
    k("0 °C", { R0: 10, T0: 25, beta: 3950, T: 0 }, { R: thermR(10, 25, 3950, 0) }),
    k("inverse of R0", { R0: 10, T0: 25, beta: 3435, R: 10 }, { T: 25 }),
    k("beta 4000 at 40 °C", { R0: 5, T0: 25, beta: 4000, T: 40 }, { R: thermR(5, 25, 4000, 40) }),
  ],
  "strain-gauge": [
    k("no change", { R: 350, dR: 0, GF: 2, Vex: 5 }, { strain: 0, Vout: 0 }),
    k("GF=1, ΔR/R=0.001", { R: 1000, dR: 1, GF: 1, Vex: 4 }, { strain: 1000, Vout: 1 }),
    k("negative strain", { R: 120, dR: -0.24, GF: 2, Vex: 10 }, { strain: -1000, Vout: -5 }),
    k("GF=2.1", { R: 350, dR: 0.35, GF: 2.1, Vex: 2 }, { strain: (0.001 / 2.1) * 1e6, Vout: (2 * 2.1 * (0.001 / 2.1) / 4) * 1000 }),
  ],
  snr: [
    k("equal amplitudes", { Vs: 1, Vn: 1000 }, { snr: 0, enob: (0 - 1.76) / 6.02 }),
    k("10×", { Vs: 1, Vn: 100 }, { snr: 20, enob: (20 - 1.76) / 6.02 }),
    k("1000×", { Vs: 2, Vn: 2 }, { snr: 60, enob: (60 - 1.76) / 6.02 }),
    k("2×", { Vs: 1, Vn: 500 }, { snr: 20 * Math.log10(2), enob: (20 * Math.log10(2) - 1.76) / 6.02 }),
  ],
  nyquist: [
    k("1 kHz needs 2 kHz", { fmax: 1 }, { fmin: 2 }),
    k("exactly Nyquist aliases to 0? fs=2 f aliases to 0 if round", { fmax: 5, fs: 10 }, { alias: 5 }),
    k("below Nyquist, no alias shift", { fmax: 3, fs: 8 }, { alias: 3 }),
    k("11 kHz at 10 kHz", { fmax: 11, fs: 10 }, { alias: 1 }),
  ],
  "ziegler-nichols": [
    k("Ku=1, Tu=1", { Ku: 1, Tu: 1 }, { Kp: 0.6, Ti: 0.5, Td: 0.125, Ki: 1.2, Kd: 0.075 }),
    k("Ku=2, Tu=8", { Ku: 2, Tu: 8 }, { Kp: 1.2, Ti: 4, Td: 1, Ki: 0.3, Kd: 1.2 }),
    k("Ku=5, Tu=0.8", { Ku: 5, Tu: 0.8 }, { Kp: 3, Ti: 0.4, Td: 0.1, Ki: 7.5, Kd: 0.3 }),
    k("Ku=20, Tu=10", { Ku: 20, Tu: 10 }, { Kp: 12, Ti: 5, Td: 1.25, Ki: 2.4, Kd: 15 }),
  ],
  "first-order-response": [
    k("50 % is τ ln 2", { tau: 10, p: 50 }, { t: 10 * Math.log(2) }),
    k("0 %", { tau: 5, p: 0 }, { t: 0 }),
    k("86.466 % is about 2τ", { tau: 4, p: (1 - Math.exp(-2)) * 100 }, { t: 8 }),
    k("τ=1, 90 %", { tau: 1, p: 90 }, { t: -Math.log(0.1) }),
  ],
  "horizontal-tank": [
    k("empty", { D: 2, L: 3, h: 0 }, { V: 0, pct: 0, Vfull: 3 * PI }),
    k("full", { D: 2, L: 3, h: 2 }, { V: 3 * PI, pct: 100, Vfull: 3 * PI }),
    k("half of a 1 m tank", { D: 1, L: 4, h: 0.5 }, { pct: 50, Vfull: PI, V: PI / 2 }),
    k("quarter of unit cylinder", { D: 2, L: 1, h: 0.5 }, { V: Math.acos(0.5) - 0.5 * Math.sqrt(0.75), pct: ((Math.acos(0.5) - 0.5 * Math.sqrt(0.75)) / PI) * 100 }),
  ],
  "transfer-time": [
    k("8 Gbit at 1 Gbit/s is 8/60 min? 1 GB at 1000 Mbit/s", { size: 1, rate: 1000, eff: 100 }, { t: 0.1333333333333 }),
    k("50 % efficiency doubles the time", { size: 1, rate: 100, eff: 50 }, { t: 8 / 3 }),
    k("10 GB at 80 Mbit/s, 80 %", { size: 10, rate: 80, eff: 80 }, { t: (10 * 8e9) / (80e6 * 0.8) / 60 }),
    k("0.125 GB is 1 Gbit at 100 Mbit/s", { size: 0.125, rate: 100, eff: 100 }, { t: 10 / 60 }),
  ],
  "cpu-time": [
    k("1 instruction, CPI 1, 1 GHz", { N: 1, CPI: 1, f: 1 }, { t: 1e-6, mips: 1000, period: 1 }),
    k("CPI 4, 1 GHz, 1e6 instructions", { N: 1e6, CPI: 4, f: 1 }, { t: 4, mips: 250, period: 1 }),
    k("4 GHz, CPI 1, 2e9 instructions", { N: 2e9, CPI: 1, f: 4 }, { t: 500, mips: 4000, period: 0.25 }),
    k("0.5 GHz", { N: 5e8, CPI: 1, f: 0.5 }, { t: 1000, mips: 500, period: 2 }),
  ],
  "cache-amat": [
    k("no misses", { hit: 2, miss: 0, penalty: 100 }, { amat: 2 }),
    k("always miss", { hit: 1, miss: 100, penalty: 40 }, { amat: 41 }),
    k("2 % miss", { hit: 0.5, miss: 2, penalty: 50 }, { amat: 1.5 }),
    k("10 ns hit, 1 % , 200 ns", { hit: 10, miss: 1, penalty: 200 }, { amat: 12 }),
  ],
  amdahl: [
    k("nothing parallel", { p: 0, s: 100 }, { S: 1 }),
    k("all parallel, 4×", { p: 100, s: 4 }, { S: 4 }),
    k("50 % on 2 cores", { p: 50, s: 2 }, { S: 1 / 0.75, limit: 2 }),
    k("75 % on 4", { p: 75, s: 4 }, { S: 1 / (0.25 + 0.75 / 4), limit: 4 }),
  ],
  "bandwidth-delay": [
    k("1 Mbit/s, 8 ms", { rate: 1, rtt: 8 }, { bdp: 1 }),
    k("10 Mbit/s, 80 ms", { rate: 10, rtt: 80 }, { bdp: 100 }),
    k("1000 Mbit/s, 1 ms", { rate: 1000, rtt: 1 }, { bdp: 125 }),
    k("8 Mbit/s, 1 ms", { rate: 8, rtt: 1 }, { bdp: 1 }),
  ],
  circle: [
    k("r=2", { r: 2 }, { d: 4, C: 4 * PI, A: 4 * PI }),
    k("r=0.5", { r: 0.5 }, { d: 1, C: PI, A: PI / 4 }),
    k("r=10", { r: 10 }, { d: 20, C: 20 * PI, A: 100 * PI }),
    k("r=3", { r: 3 }, { d: 6, C: 6 * PI, A: 9 * PI }),
  ],
  rectangle: [
    k("square 5", { l: 5, w: 5 }, { A: 25, P: 20, d: Math.SQRT2 * 5 }),
    k("1 by 1", { l: 1, w: 1 }, { A: 1, P: 4, d: Math.SQRT2 }),
    k("6 by 8 is a 10 diagonal", { l: 6, w: 8 }, { A: 48, P: 28, d: 10 }),
    k("2 by 2", { l: 2, w: 2 }, { A: 4, P: 8, d: Math.SQRT2 * 2 }),
  ],
  "triangle-sss": [
    k("equilateral side 2", { a: 2, b: 2, c: 2 }, { area: Math.sqrt(3), A: 60, B: 60, C: 60, P: 6 }),
    k("5-5-6", { a: 5, b: 5, c: 6 }, { area: 12, P: 16, C: deg(Math.acos((25 + 25 - 36) / 50)) }),
    k("5-5-4", { a: 5, b: 5, c: 4 }, { P: 14, area: Math.sqrt(7 * 2 * 2 * 3) }),
  ],
  "triangle-sas": [
    k("right angle", { a: 3, b: 4, C: 90 }, { c: 5, area: 6 }),
    k("180° is flat, refused? use 120", { a: 2, b: 2, C: 120 }, { c: 2 * Math.sqrt(3), area: Math.sqrt(3) }),
    k("30°", { a: 4, b: 6, C: 30 }, { c: Math.sqrt(16 + 36 - 48 * Math.sqrt(3) / 2), area: 6 }),
    k("equal sides 45°", { a: 2, b: 2, C: 45 }, { c: Math.sqrt(8 - 8 * Math.cos(PI / 4)), area: 2 * Math.sin(PI / 4) }),
  ],
  pythagoras: [
    k("8-15-17", { a: 8, b: 15 }, { c: 17, area: 60 }),
    k("7-24-25", { b: 7, c: 25 }, { a: 24, area: 84 }),
    k("9-12-15", { a: 9, c: 15 }, { b: 12, area: 54 }),
  ],
  sphere: [
    k("r=0.5", { r: 0.5 }, { V: (4 / 3) * PI * 0.125, A: PI }),
    k("r=2", { r: 2 }, { V: (4 / 3) * PI * 8, A: 16 * PI }),
    k("r=3", { r: 3 }, { V: 36 * PI, A: 36 * PI }),
    k("r=10", { r: 10 }, { V: (4 / 3) * PI * 1000, A: 400 * PI }),
  ],
  cylinder: [
    k("r=1, h=1", { r: 1, h: 1 }, { V: PI, A: 4 * PI, Vl: 1000 * PI }),
    k("r=2, h=0.5", { r: 2, h: 0.5 }, { V: 2 * PI, A: 2 * PI * 2 * 2.5, Vl: 2000 * PI }),
    k("r=0.1, h=1", { r: 0.1, h: 1 }, { V: 0.01 * PI, Vl: 10 * PI }),
    k("r=1, h=2", { r: 1, h: 2 }, { V: 2 * PI, A: 6 * PI, Vl: 2000 * PI }),
  ],
  cone: [
    k("r=1, h=1", { r: 1, h: 1 }, { V: PI / 3, s: Math.SQRT2, A: PI * (1 + Math.SQRT2) }),
    k("r=5, h=12", { r: 5, h: 12 }, { V: 100 * PI, s: 13, A: 90 * PI }),
    k("r=6, h=8", { r: 6, h: 8 }, { V: (1 / 3) * PI * 36 * 8, s: 10, A: PI * 6 * 16 }),
    k("r=1, h=√3", { r: 1, h: Math.sqrt(3) }, { s: 2, V: PI / Math.sqrt(3) }),
  ],
  box: [
    k("unit cube", { l: 1, w: 1, h: 1 }, { V: 1, A: 6, d: Math.sqrt(3) }),
    k("1×1×2", { l: 1, w: 1, h: 2 }, { V: 2, A: 10, d: Math.sqrt(6) }),
    k("3×4×12", { l: 3, w: 4, h: 12 }, { V: 144, A: 2 * (12 + 36 + 48), d: 13 }),
    k("2×2×1", { l: 2, w: 2, h: 1 }, { V: 4, A: 16, d: 3 }),
  ],
  "regular-polygon": [
    k("square side 2", { n: 4, s: 2 }, { A: 4, P: 8, ap: 1, R: Math.SQRT2, angle: 90 }),
    k("equilateral triangle side 2", { n: 3, s: 2 }, { A: Math.sqrt(3), P: 6, angle: 60 }),
    k("octagon side 1", { n: 8, s: 1 }, { A: 8 / (4 * Math.tan(PI / 8)), P: 8, angle: 135 }),
    k("pentagon side 1", { n: 5, s: 1 }, { P: 5, angle: 108, R: 1 / (2 * Math.sin(PI / 5)) }),
  ],
  ellipse: [
    k("circle a=b=2", { a: 2, b: 2 }, { A: 4 * PI, P: 4 * PI }),
    k("a=3, b=4? semi axes 1 and 1", { a: 1, b: 1 }, { A: PI, P: 2 * PI }),
    k("a=4, b=2", { a: 4, b: 2 }, { A: 8 * PI, P: PI * (18 - Math.sqrt(14 * 10)) }),
    k("a=10, b=10", { a: 10, b: 10 }, { A: 100 * PI, P: 20 * PI }),
  ],
  trapezoid: [
    k("rectangle 4 by 3", { a: 4, b: 4, h: 3 }, { A: 12 }),
    k("triangle-like 0? a must be >0 use 1 and 1", { a: 1, b: 1, h: 1 }, { A: 1 }),
    k("6 and 2, height 5", { a: 6, b: 2, h: 5 }, { A: 20 }),
    k("10 and 0.5? both positive", { a: 10, b: 6, h: 4 }, { A: 32 }),
  ],
  "two-points": [
    k("horizontal", { x1: 0, y1: 3, x2: 4, y2: 3 }, { d: 4, m: 0, b: 3, mx: 2, my: 3, angle: 0 }),
    k("vertical is undefined slope", { x1: 2, y1: 1, x2: 2, y2: 5 }, { d: 4, mx: 2, my: 3, angle: 90 }),
    k("origin to 1,1", { x1: 0, y1: 0, x2: 1, y2: 1 }, { d: Math.SQRT2, m: 1, b: 0, mx: 0.5, my: 0.5, angle: 45 }),
    k("negative slope", { x1: 0, y1: 2, x2: 2, y2: 0 }, { d: Math.SQRT2 * 2, m: -1, b: 2, mx: 1, my: 1, angle: -45 }),
  ],
  "percent-of": [
    k("100 % of 7", { p: 100, V: 7 }, { x: 7 }),
    k("0 %", { p: 0, V: 50 }, { x: 0 }),
    k("12.5 % of 80", { p: 12.5, V: 80 }, { x: 10 }),
    k("200 % of 15", { p: 200, V: 15 }, { x: 30 }),
  ],
  "percent-what": [
    k("whole of itself", { x: 40, y: 40 }, { p: 100 }),
    k("zero part", { x: 0, y: 9 }, { p: 0 }),
    k("3 of 8", { x: 3, y: 8 }, { p: 37.5 }),
    k("1 of 3", { x: 1, y: 3 }, { p: 100 / 3 }),
  ],
  "percent-change": [
    k("no change", { a: 50, b: 50 }, { p: 0, d: 0 }),
    k("doubles", { a: 20, b: 40 }, { p: 100, d: 20 }),
    k("halves", { a: 40, b: 20 }, { p: -50, d: -20 }),
    k("negative old value", { a: -10, b: -5 }, { p: 50, d: 5 }),
  ],
  "percent-error": [
    k("exact", { m: 10, t: 10 }, { e: 0 }),
    k("10 vs 8", { m: 10, t: 8 }, { e: 25 }),
    k("negative true value", { m: -3, t: -4 }, { e: 25 }),
    k("measured 0, true 5", { m: 0, t: 5 }, { e: 100 }),
  ],
  logarithm: [
    k("log10 of 1000", { x: 1000, b: 10 }, { log: 3, ln: Math.log(1000), log10: 3 }),
    k("ln base e of e", { x: Math.E, b: Math.E }, { log: 1, ln: 1, log10: Math.log10(Math.E) }),
    k("log2 of 1", { x: 1, b: 2 }, { log: 0, ln: 0, log10: 0 }),
    k("log3 of 81", { x: 81, b: 3 }, { log: 4, ln: Math.log(81), log10: Math.log10(81) }),
  ],
  "average-speed": [
    k("solve distance", { v: 60, t: 1.5 }, { d: 90 }),
    k("solve time", { v: 80, d: 40 }, { t: 0.5 }),
    k("100 km/h for 0.25 h", { v: 100, t: 0.25 }, { d: 25 }),
    k("12 km in 0.4 h", { d: 12, t: 0.4 }, { v: 30 }),
  ],
  "loan-payment": [
    k("one year at 0 % is L/12", { L: 1200, rate: 0, years: 1 }, { pmt: 100, interest: 0, total: 1200 }),
    k("two years interest-free", { L: 2400, rate: 0, years: 2 }, { pmt: 100, interest: 0, total: 2400 }),
    k("12 % for 1 year", { L: 1200, rate: 12, years: 1 }, { pmt: pmt(1200, 12, 1), interest: pmt(1200, 12, 1) * 12 - 1200, total: pmt(1200, 12, 1) * 12 }),
  ],
  "simple-interest": [
    k("zero rate", { P: 500, r: 0, t: 10 }, { I: 0, A: 500 }),
    k("10 % for 1 year", { P: 200, r: 10, t: 1 }, { I: 20, A: 220 }),
    k("zero time", { P: 800, r: 7, t: 0 }, { I: 0, A: 800 }),
    k("8 % for 2.5 years", { P: 400, r: 8, t: 2.5 }, { I: 80, A: 480 }),
  ],
  "compound-interest": [
    k("zero rate with deposits", { P: 100, r: 0, t: 2, m: 12, D: 10 }, { A: 100 + 240, I: 0 }),
    k("annual compounding 10 % , 2 years", { P: 1000, r: 10, t: 2, m: 1, D: 0 }, { A: 1210, I: 210 }),
    k("quarterly 8 % for 1 year", { P: 100, r: 8, t: 1, m: 4, D: 0 }, { A: fv(100, 8, 1, 4, 0), I: fv(100, 8, 1, 4, 0) - 100 }),
  ],
  "present-value": [
    k("zero rate", { FV: 500, r: 0, t: 5, m: 1 }, { PV: 500 }),
    k("10 % annual, 1 year", { FV: 110, r: 10, t: 1, m: 1 }, { PV: 100 }),
    k("monthly 12 % for 1 year", { FV: 1000, r: 12, t: 1, m: 12 }, { PV: 1000 / 1.01 ** 12 }),
    k("zero years", { FV: 250, r: 8, t: 0, m: 4 }, { PV: 250 }),
  ],
  cagr: [
    k("no growth", { start: 100, end: 100, years: 4 }, { cagr: 0 }),
    k("doubles in 1 year", { start: 50, end: 100, years: 1 }, { cagr: 100 }),
    k("quadruples in 2 years", { start: 10, end: 40, years: 2 }, { cagr: 100 }),
    k("10 to 11 in 1 year", { start: 10, end: 11, years: 1 }, { cagr: 10 }),
  ],
  apy: [
    k("annual compounding equals nominal", { r: 7, m: 1 }, { ear: 7 }),
    k("zero rate", { r: 0, m: 12 }, { ear: 0 }),
    k("quarterly 8 %", { r: 8, m: 4 }, { ear: ((1.02) ** 4 - 1) * 100 }),
    k("daily 10 %", { r: 10, m: 365 }, { ear: ((1 + 0.1 / 365) ** 365 - 1) * 100 }),
  ],
  roi: [
    k("break even", { cost: 200, final: 200 }, { roi: 0, gain: 0 }),
    k("total loss", { cost: 80, final: 0, years: 1 }, { roi: -100, gain: -80 }),
    k("triples in 3 years", { cost: 100, final: 300, years: 3 }, { roi: 200, gain: 200, annual: (3 ** (1 / 3) - 1) * 100 }),
    k("no years given", { cost: 40, final: 50 }, { roi: 25, gain: 10 }),
  ],
  roas: [
    k("1×", { rev: 20, spend: 20 }, { roas: 1, pct: 100 }),
    k("zero revenue", { rev: 0, spend: 15 }, { roas: 0, pct: 0 }),
    k("2.5×", { rev: 250, spend: 100 }, { roas: 2.5, pct: 250 }),
    k("0.5×", { rev: 40, spend: 80 }, { roas: 0.5, pct: 50 }),
  ],
  discount: [
    k("no discount, no tax", { price: 100, d: 0, tax: 0 }, { sale: 100, saved: 0, total: 100 }),
    k("100 % off", { price: 80, d: 100, tax: 18 }, { sale: 0, saved: 80, total: 0 }),
    k("10 % off, no tax", { price: 50, d: 10, tax: 0 }, { sale: 45, saved: 5, total: 45 }),
    k("25 % off, 10 % tax", { price: 80, d: 25, tax: 10 }, { sale: 60, saved: 20, total: 66 }),
  ],
  tip: [
    k("no tip, one person", { bill: 50, rate: 0, people: 1 }, { tip: 0, total: 50, each: 50 }),
    k("20 % for 2", { bill: 100, rate: 20, people: 2 }, { tip: 20, total: 120, each: 60 }),
    k("15 % for 3", { bill: 200, rate: 15, people: 3 }, { tip: 30, total: 230, each: 230 / 3 }),
    k("5 % for 5", { bill: 1000, rate: 5, people: 5 }, { tip: 50, total: 1050, each: 210 }),
  ],
  "margin-markup": [
    k("cost equals price", { cost: 40, price: 40 }, { margin: 0, markup: 0, profit: 0 }),
    k("double the cost", { cost: 50, price: 100 }, { margin: 50, markup: 100, profit: 50 }),
    k("cost 80, price 100", { cost: 80, price: 100 }, { margin: 20, markup: 25, profit: 20 }),
    k("cost 200, price 250", { cost: 200, price: 250 }, { margin: 20, markup: 25, profit: 50 }),
  ],
  "price-from-margin": [
    k("zero margin", { cost: 70, m: 0 }, { price: 70 }),
    k("50 % margin", { cost: 40, m: 50 }, { price: 80 }),
    k("25 % margin", { cost: 75, m: 25 }, { price: 100 }),
    k("10 % margin", { cost: 90, m: 10 }, { price: 100 }),
  ],
  "break-even": [
    k("no fixed cost", { fixed: 0, price: 20, variable: 12 }, { units: 0, revenue: 0 }),
    k("contribution 10", { fixed: 1000, price: 25, variable: 15 }, { units: 100, revenue: 2500 }),
    k("price 8, variable 3, fixed 100", { fixed: 100, price: 8, variable: 3 }, { units: 20, revenue: 160 }),
    k("large contribution", { fixed: 5000, price: 200, variable: 50 }, { units: 5000 / 150, revenue: (5000 / 150) * 200 }),
  ],
  inflation: [
    k("zero inflation", { amount: 100, i: 0, years: 10 }, { future: 100, power: 100 }),
    k("100 % for 1 year", { amount: 50, i: 100, years: 1 }, { future: 100, power: 25 }),
    k("10 % for 2 years", { amount: 100, i: 10, years: 2 }, { future: 121, power: 100 / 1.21 }),
    k("zero years", { amount: 80, i: 5, years: 0 }, { future: 80, power: 80 }),
  ],
  salary: [
    k("zero hours", { rate: 30, hours: 0, weeks: 52 }, { year: 0, month: 0, week: 0 }),
    k("10 per hour, 1 hour, 12 weeks", { rate: 10, hours: 1, weeks: 12 }, { year: 120, month: 10, week: 10 }),
    k("100 per hour, 20 h, 50 weeks", { rate: 100, hours: 20, weeks: 50 }, { year: 100000, month: 100000 / 12, week: 2000 }),
    k("one week", { rate: 15, hours: 8, weeks: 1 }, { year: 120, month: 10, week: 120 }),
  ],
  "financial-ratios": [
    k("all ones", { ca: 1, cash: 1, cl: 1, ni: 1, rev: 1 }, { current: 1, cashRatio: 1, margin: 100 }),
    k("cash equals assets", { ca: 80, cash: 80, cl: 40, ni: 0, rev: 100 }, { current: 2, cashRatio: 2, margin: 0 }),
    k("loss", { ca: 50, cash: 10, cl: 25, ni: -5, rev: 50 }, { current: 2, cashRatio: 0.4, margin: -10 }),
    k("textbook 3, 1, 20 %", { ca: 300, cash: 100, cl: 100, ni: 40, rev: 200 }, { current: 3, cashRatio: 1, margin: 20 }),
  ],
  "dividend-yield": [
    k("no dividend", { dps: 0, price: 40, ni: 100, shares: 50 }, { yield: 0, eps: 2, payout: 0, pe: 20 }),
    k("EPS equals price", { dps: 1, price: 10, ni: 100, shares: 10 }, { yield: 10, eps: 10, payout: 10, pe: 1 }),
    k("half payout", { dps: 1, price: 20, ni: 200, shares: 100 }, { yield: 5, eps: 2, payout: 50, pe: 10 }),
    k("yield 8 %", { dps: 4, price: 50, ni: 800, shares: 100 }, { yield: 8, eps: 8, payout: 50, pe: 6.25 }),
  ],
  bmi: [
    k("exactly 25", { m: 100, h: 200 }, { bmi: 25 }),
    k("18.5 boundary", { m: 74, h: 200 }, { bmi: 18.5 }),
    k("1 kg, 100 cm", { m: 1, h: 100 }, { bmi: 1 }),
    k("80 kg, 160 cm", { m: 80, h: 160 }, { bmi: 80 / 2.56 }),
  ],
  bmr: [
    k("sedentary factor multiplies", { sex: 1, m: 80, h: 180, age: 40, act: 1.2 }, { bmr: bmr(1, 80, 180, 40), tdee: bmr(1, 80, 180, 40) * 1.2 }),
    k("woman extra active", { sex: 2, m: 55, h: 160, age: 30, act: 1.9 }, { bmr: bmr(2, 55, 160, 30), tdee: bmr(2, 55, 160, 30) * 1.9 }),
    k("man light activity", { sex: 1, m: 90, h: 190, age: 20, act: 1.375 }, { bmr: bmr(1, 90, 190, 20), tdee: bmr(1, 90, 190, 20) * 1.375 }),
  ],
  "body-fat-navy": [
    k("woman", { sex: 2, h: 165, neck: 32, waist: 80, hip: 100 }, { bf: navyWoman(165, 32, 80, 100) }),
    k("man, larger waist", { sex: 1, h: 180, neck: 40, waist: 100 }, { bf: navyMan(180, 40, 100) }),
    k("man, smaller difference", { sex: 1, h: 170, neck: 36, waist: 70 }, { bf: navyMan(170, 36, 70) }),
    k("woman, second set", { sex: 2, h: 160, neck: 30, waist: 70, hip: 95 }, { bf: navyWoman(160, 30, 70, 95) }),
  ],
  "lean-body-mass": [
    k("woman Boer", { sex: 2, m: 60, h: 165 }, { lbm: 0.252 * 60 + 0.473 * 165 - 48.3, fat: (1 - (0.252 * 60 + 0.473 * 165 - 48.3) / 60) * 100 }),
    k("man 80 kg 180 cm", { sex: 1, m: 80, h: 180 }, { lbm: 0.407 * 80 + 0.267 * 180 - 19.2, fat: (1 - (0.407 * 80 + 0.267 * 180 - 19.2) / 80) * 100 }),
    k("man 60 kg 170 cm", { sex: 1, m: 60, h: 170 }, { lbm: 0.407 * 60 + 0.267 * 170 - 19.2 }),
    k("woman 70 kg 170 cm", { sex: 2, m: 70, h: 170 }, { lbm: 0.252 * 70 + 0.473 * 170 - 48.3 }),
  ],
  pace: [
    k("5 km in 25 min", { d: 5, t: 25 }, { pace: 5, v: 12 }),
    k("21.1 km in 120 min", { d: 21.1, t: 120 }, { pace: 120 / 21.1, v: 21.1 * 0.5 }),
    k("1 km in 6 min", { d: 1, t: 6 }, { pace: 6, v: 10 }),
    k("42.2 km in 180 min", { d: 42.2, t: 180 }, { pace: 180 / 42.2, v: 42.2 / 3 }),
  ],
  "calories-burned": [
    k("MET 1 is resting", { met: 1, m: 70, t: 60 }, { kcal: 70 }),
    k("MET 3.5 for 30 min", { met: 3.5, m: 80, t: 30 }, { kcal: 3.5 * 80 * 0.5 }),
    k("MET 10, 60 kg, 30 min", { met: 10, m: 60, t: 30 }, { kcal: 300 }),
    k("MET 6, 75 kg, 45 min", { met: 6, m: 75, t: 45 }, { kcal: 6 * 75 * 0.75 }),
  ],
  "fuel-cost": [
    k("100 km at 10 km/L", { d: 100, eco: 10, price: 90 }, { fuel: 10, cost: 900 }),
    k("zero price", { d: 50, eco: 25, price: 0 }, { fuel: 2, cost: 0 }),
    k("15 km at 5 km/L", { d: 15, eco: 5, price: 110 }, { fuel: 3, cost: 330 }),
    k("1 km at 1 km/L", { d: 1, eco: 1, price: 2 }, { fuel: 1, cost: 2 }),
  ],
  "unit-price": [
    k("same unit price", { p1: 10, q1: 2, p2: 20, q2: 4 }, { u1: 5, u2: 5, saving: 0 }),
    k("B twice as expensive", { p1: 10, q1: 10, p2: 20, q2: 10 }, { u1: 1, u2: 2, saving: 100 }),
    k("B half", { p1: 40, q1: 4, p2: 10, q2: 2 }, { u1: 10, u2: 5, saving: -50 }),
    k("A is 4 per unit, B is 3", { p1: 8, q1: 2, p2: 9, q2: 3 }, { u1: 4, u2: 3, saving: -25 }),
  ],
};
