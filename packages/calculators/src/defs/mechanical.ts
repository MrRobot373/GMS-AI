/** Mechanical, civil and structural, thermal and fluids. */
import type { CalculatorDef } from "../registry";
import { def, fail, G0, inp, nonneg, out, pos } from "./helpers";

const SIGMA = 5.670374419e-8;

export const MECHANICAL: CalculatorDef[] = [
  def({
    id: "gear-ratio",
    name: "Gear ratio",
    category: "mechanical",
    description: "Speed and torque through a simple gear pair.",
    formula: ["i = N_driven / N_driver", "n_out = n_in / i", "T_out = T_in·i·η"],
    assumptions: ["Rigid gears", "η is the mesh efficiency (≈ 0.98 per spur stage)"],
    inputs: [
      inp("N1", "Driver teeth", "count", undefined, { min: 1, integer: true }),
      inp("N2", "Driven teeth", "count", undefined, { min: 1, integer: true }),
      inp("n", "Input speed", "angularSpeed", "rpm", { ...nonneg }),
      inp("T", "Input torque", "torque", "N·m", { ...nonneg }),
      inp("eff", "Efficiency", "ratio", "percent", { min: 0, max: 1, exclusiveMin: true, default: 100 }),
    ],
    outputs: [out("i", "Ratio", "dimensionless"), out("nout", "Output speed", "angularSpeed", "rpm"), out("Tout", "Output torque", "torque", "N·m")],
    compute: ({ N1, N2, n, T, eff }) => {
      const i = N2! / N1!;
      return { values: { i, nout: n! / i, Tout: T! * i * eff! } };
    },
    refs: [
      { inputs: { N1: 20, N2: 60, n: 1500, T: 10, eff: 100 }, expect: { i: 3, nout: 500, Tout: 30 }, note: "3:1 reduction" },
      { inputs: { N1: 15, N2: 45, n: 900, T: 20, eff: 98 }, expect: { nout: 300, Tout: 58.8 }, note: "With 2 % loss" },
    ],
  }),
  def({
    id: "belt-length",
    name: "Belt drive (open belt)",
    category: "mechanical",
    description: "Belt length and speed ratio of an open belt drive.",
    formula: ["L = 2C + π(D + d)/2 + (D - d)² / (4C)", "Ratio = D / d"],
    assumptions: ["Open (uncrossed) belt", "Pitch diameters", "No slip"],
    inputs: [inp("D", "Large pulley diameter", "length", "mm", { ...pos }), inp("d", "Small pulley diameter", "length", "mm", { ...pos }), inp("C", "Centre distance", "length", "mm", { ...pos })],
    outputs: [out("L", "Belt length", "length", "mm"), out("ratio", "Speed ratio", "dimensionless")],
    compute: ({ D, d, C }) => {
      if (C! < (D! + d!) / 2) fail("The pulleys overlap at this centre distance.", "C");
      return { values: { L: 2 * C! + (Math.PI * (D! + d!)) / 2 + (D! - d!) ** 2 / (4 * C!), ratio: D! / d! } };
    },
    refs: [{ inputs: { D: 200, d: 100, C: 1000 }, expect: { L: 2473.738898038, ratio: 2 }, note: "2000 + 471.24 + 2.5" }],
  }),
  def({
    id: "hookes-law",
    name: "Spring (Hooke's law)",
    category: "mechanical",
    description: "Any two of force, spring rate and deflection give the third, plus the stored energy.",
    formula: ["F = k·x", "E = ½·k·x²"],
    assumptions: ["Linear spring within its elastic range"],
    inputs: [inp("F", "Force", "force", "N", { optional: true }), inp("k", "Spring rate", "stiffness", "N/mm", { optional: true, ...pos }), inp("x", "Deflection", "length", "mm", { optional: true })],
    outputs: [out("F", "Force", "force", "N"), out("k", "Spring rate", "stiffness", "N/mm"), out("x", "Deflection", "length", "mm"), out("E", "Stored energy", "energy", "J")],
    pick: { count: 2, keys: ["F", "k", "x"] },
    compute: ({ F, k, x }) => {
      let f = F,
        kk = k,
        xx = x;
      if (f === undefined) f = kk! * xx!;
      else if (kk === undefined) {
        if (xx === 0) fail("Deflection can't be zero here.", "x");
        kk = f / xx!;
      } else xx = f / kk;
      return { values: { F: f, k: kk!, x: xx!, E: 0.5 * kk! * xx! * xx! } };
    },
    refs: [
      { inputs: { k: 10, x: 20 }, expect: { F: 200, E: 2 }, note: "10 N/mm·20 mm" },
      { inputs: { F: 500, x: 25 }, expect: { k: 20, E: 6.25 }, note: "500/25" },
    ],
  }),
  def({
    id: "beam-simply-supported-point",
    name: "Simply supported beam, centre load",
    category: "civil",
    description: "Maximum deflection and bending moment of a simply supported beam with a central point load.",
    formula: ["δ_max = F·L³ / (48·E·I)", "M_max = F·L / 4"],
    assumptions: ["Linear elastic, small deflections", "Prismatic beam; self-weight ignored", "Load exactly at mid-span"],
    inputs: [inp("F", "Load", "force", "kN", { ...pos }), inp("L", "Span", "length", "m", { ...pos }), inp("E", "Young's modulus", "pressure", "GPa", { ...pos, default: 200 }), inp("I", "Second moment of area", "secondMoment", "cm4", { ...pos })],
    outputs: [out("delta", "Maximum deflection", "length", "mm"), out("M", "Maximum moment", "torque", "kN·m")],
    compute: ({ F, L, E, I }) => ({ values: { delta: (F! * L! ** 3) / (48 * E! * I!), M: (F! * L!) / 4 } }),
    refs: [{ inputs: { F: 1, L: 2, E: 200, I: 833 }, expect: { delta: 0.1000400160064, M: 0.5 }, note: "1000·8/(48·200e9·8.33e-6)" }],
  }),
  def({
    id: "beam-simply-supported-udl",
    name: "Simply supported beam, uniform load",
    category: "civil",
    description: "Maximum deflection and moment of a simply supported beam under a uniformly distributed load.",
    formula: ["δ_max = 5·w·L⁴ / (384·E·I)", "M_max = w·L² / 8"],
    assumptions: ["Linear elastic, small deflections", "w is load per metre of span (include self-weight if it matters)"],
    inputs: [inp("w", "Load per metre (kN/m)", "dimensionless", undefined, { ...pos }), inp("L", "Span", "length", "m", { ...pos }), inp("E", "Young's modulus", "pressure", "GPa", { ...pos, default: 200 }), inp("I", "Second moment of area", "secondMoment", "cm4", { ...pos })],
    outputs: [out("delta", "Maximum deflection", "length", "mm"), out("M", "Maximum moment", "torque", "kN·m")],
    compute: ({ w, L, E, I }) => {
      const W = w! * 1000;
      return { values: { delta: (5 * W * L! ** 4) / (384 * E! * I!), M: (W * L! * L!) / 8 } };
    },
    refs: [{ inputs: { w: 1, L: 4, E: 200, I: 1000 }, expect: { delta: 1.666666666667, M: 2 }, note: "5·1000·256/(384·200e9·1e-5)" }],
  }),
  def({
    id: "beam-cantilever-point",
    name: "Cantilever, end load",
    category: "civil",
    description: "Tip deflection and root moment of a cantilever with a point load at its free end.",
    formula: ["δ = F·L³ / (3·E·I)", "M = F·L"],
    assumptions: ["Fully fixed root", "Linear elastic, small deflections"],
    inputs: [inp("F", "Load", "force", "N", { ...pos }), inp("L", "Length", "length", "m", { ...pos }), inp("E", "Young's modulus", "pressure", "GPa", { ...pos, default: 200 }), inp("I", "Second moment of area", "secondMoment", "cm4", { ...pos })],
    outputs: [out("delta", "Tip deflection", "length", "mm"), out("M", "Root moment", "torque", "N·m")],
    compute: ({ F, L, E, I }) => ({ values: { delta: (F! * L! ** 3) / (3 * E! * I!), M: F! * L! } }),
    refs: [{ inputs: { F: 500, L: 1.5, E: 70, I: 20 }, expect: { delta: 40.17857142857, M: 750 }, note: "Aluminium: 500·3.375/(3·70e9·2e-7)" }],
  }),
  def({
    id: "beam-cantilever-udl",
    name: "Cantilever, uniform load",
    category: "civil",
    description: "Tip deflection and root moment of a cantilever under a uniform load.",
    formula: ["δ = w·L⁴ / (8·E·I)", "M = w·L² / 2"],
    assumptions: ["Fully fixed root", "Linear elastic, small deflections"],
    inputs: [inp("w", "Load per metre (N/m)", "dimensionless", undefined, { ...pos }), inp("L", "Length", "length", "m", { ...pos }), inp("E", "Young's modulus", "pressure", "GPa", { ...pos, default: 200 }), inp("I", "Second moment of area", "secondMoment", "cm4", { ...pos })],
    outputs: [out("delta", "Tip deflection", "length", "mm"), out("M", "Root moment", "torque", "N·m")],
    compute: ({ w, L, E, I }) => ({ values: { delta: (w! * L! ** 4) / (8 * E! * I!), M: (w! * L! * L!) / 2 } }),
    refs: [{ inputs: { w: 1000, L: 2, E: 200, I: 100 }, expect: { delta: 10, M: 2000 }, note: "1000·16/(8·200e9·1e-6) = 10 mm" }],
  }),
  def({
    id: "bending-stress",
    name: "Bending stress",
    category: "mechanical",
    description: "Maximum bending stress in a beam from the moment and the section.",
    formula: ["σ = M·c / I"],
    assumptions: ["Linear elastic, plane sections stay plane", "c: distance from the neutral axis to the outer fibre"],
    inputs: [inp("M", "Bending moment", "torque", "N·m"), inp("c", "Distance to outer fibre", "length", "mm", { ...pos }), inp("I", "Second moment of area", "secondMoment", "mm4", { ...pos })],
    outputs: [out("sigma", "Bending stress", "pressure", "MPa")],
    compute: ({ M, c, I }) => ({ values: { sigma: (M! * c!) / I! } }),
    refs: [{ inputs: { M: 1000, c: 50, I: 8.333e6 }, expect: { sigma: 6.000240009600 }, note: "100×100 mm square: I = 8.333e6 mm⁴" }],
  }),
  def({
    id: "euler-buckling",
    name: "Column buckling (Euler)",
    category: "civil",
    description: "Critical buckling load of a slender column.",
    formula: ["P_cr = π²·E·I / (K·L)²"],
    assumptions: ["Slender, initially straight column; elastic buckling (check slenderness against the material's limit)", "K: 1 pinned–pinned, 0.5 fixed–fixed, 0.7 fixed–pinned, 2 fixed–free"],
    inputs: [
      inp("E", "Young's modulus", "pressure", "GPa", { ...pos, default: 200 }),
      inp("I", "Second moment of area", "secondMoment", "cm4", { ...pos }),
      inp("L", "Length", "length", "m", { ...pos }),
      inp("K", "End conditions", "dimensionless", undefined, { options: [{ value: 1, label: "Pinned–pinned (K = 1)" }, { value: 0.5, label: "Fixed–fixed (K = 0.5)" }, { value: 0.7, label: "Fixed–pinned (K = 0.7)" }, { value: 2, label: "Fixed–free (K = 2)" }], default: 1 }),
    ],
    outputs: [out("Pcr", "Critical load", "force", "kN")],
    compute: ({ E, I, L, K }) => ({ values: { Pcr: (Math.PI ** 2 * E! * I!) / (K! * L!) ** 2 } }),
    refs: [
      { inputs: { E: 200, I: 10, L: 2, K: 1 }, expect: { Pcr: 49.34802200545 }, note: "π²·200e9·1e-7/4" },
      { inputs: { E: 200, I: 10, L: 2, K: 2 }, expect: { Pcr: 12.33700550136 }, note: "Cantilever column: a quarter" },
    ],
  }),
  def({
    id: "pressure-vessel",
    name: "Thin-walled pressure vessel",
    category: "mechanical",
    description: "Hoop and longitudinal stress in a thin cylinder.",
    formula: ["σ_hoop = p·r / t", "σ_long = p·r / (2t)"],
    assumptions: ["Thin wall: r/t ≥ 10", "Away from heads, nozzles and welds (no joint efficiency applied)"],
    inputs: [inp("p", "Internal pressure", "pressure", "bar", { ...pos }), inp("r", "Inner radius", "length", "mm", { ...pos }), inp("t", "Wall thickness", "length", "mm", { ...pos })],
    outputs: [out("hoop", "Hoop stress", "pressure", "MPa"), out("long", "Longitudinal stress", "pressure", "MPa")],
    compute: ({ p, r, t }) => ({ values: { hoop: (p! * r!) / t!, long: (p! * r!) / (2 * t!) }, warnings: r! / t! < 10 ? ["r/t is below 10: thin-wall formulas underestimate the stress."] : [] }),
    refs: [{ inputs: { p: 10, r: 500, t: 10 }, expect: { hoop: 50, long: 25 }, note: "1 MPa·500/10" }],
  }),
  def({
    id: "shear-stress",
    name: "Average shear stress",
    category: "mechanical",
    description: "Average shear stress on a section (bolts, pins, keys).",
    formula: ["τ = F / A", "Double shear: τ = F / (2A)"],
    assumptions: ["Average stress; the peak in a beam is higher (1.5× for a rectangle)"],
    inputs: [inp("F", "Shear force", "force", "kN"), inp("A", "Area", "area", "mm2", { ...pos }), inp("planes", "Shear planes", "dimensionless", undefined, { options: [{ value: 1, label: "Single shear" }, { value: 2, label: "Double shear" }], default: 1 })],
    outputs: [out("tau", "Shear stress", "pressure", "MPa")],
    compute: ({ F, A, planes }) => ({ values: { tau: F! / (A! * planes!) } }),
    refs: [{ inputs: { F: 10, A: 78.54, planes: 2 }, expect: { tau: 63.66182836771 }, note: "10 mm pin in double shear" }],
  }),
  def({
    id: "shaft-torsion",
    name: "Solid shaft torsion",
    category: "mechanical",
    description: "Maximum shear stress and twist angle of a solid round shaft.",
    formula: ["J = π·d⁴ / 32", "τ = T·(d/2) / J", "θ = T·L / (G·J)"],
    assumptions: ["Solid circular shaft", "Linear elastic", "Steel G ≈ 80 GPa"],
    inputs: [inp("T", "Torque", "torque", "N·m"), inp("d", "Diameter", "length", "mm", { ...pos }), inp("L", "Length", "length", "m", { ...pos }), inp("G", "Shear modulus", "pressure", "GPa", { ...pos, default: 80 })],
    outputs: [out("tau", "Maximum shear stress", "pressure", "MPa"), out("theta", "Twist", "angle", "deg")],
    compute: ({ T, d, L, G }) => {
      const J = (Math.PI * d! ** 4) / 32;
      return { values: { tau: (T! * d!) / 2 / J, theta: (T! * L!) / (G! * J) } };
    },
    refs: [{ inputs: { T: 100, d: 25, L: 1, G: 80 }, expect: { tau: 32.59493234522, theta: [0.03259493234522, "rad"] }, note: "J = 38 350 mm⁴" }],
  }),
  def({
    id: "axial-deformation",
    name: "Axial deformation",
    category: "mechanical",
    description: "Elongation of a bar under axial load, with stress and strain.",
    formula: ["σ = F / A", "ε = σ / E", "δ = F·L / (A·E)"],
    assumptions: ["Linear elastic (below yield)", "Uniform section"],
    inputs: [inp("F", "Force", "force", "kN"), inp("L", "Length", "length", "m", { ...pos }), inp("A", "Area", "area", "mm2", { ...pos }), inp("E", "Young's modulus", "pressure", "GPa", { ...pos, default: 200 })],
    outputs: [out("delta", "Elongation", "length", "mm"), out("strain", "Strain", "ratio", "ppm"), out("sigma", "Stress", "pressure", "MPa")],
    compute: ({ F, L, A, E }) => {
      const sigma = F! / A!;
      return { values: { sigma, strain: sigma / E!, delta: (sigma / E!) * L! } };
    },
    refs: [{ inputs: { F: 20, L: 2, A: 100, E: 200 }, expect: { sigma: 200, strain: 1000, delta: 2 }, note: "200 MPa/200 GPa = 0.001" }],
  }),
  def({
    id: "spring-mass-frequency",
    name: "Natural frequency (spring–mass)",
    category: "mechanical",
    description: "Undamped natural frequency of a mass on a spring.",
    formula: ["f_n = (1/2π)·√(k / m)"],
    assumptions: ["Single degree of freedom, no damping", "Spring mass ignored"],
    inputs: [inp("k", "Stiffness", "stiffness", "N/m", { ...pos }), inp("m", "Mass", "mass", "kg", { ...pos })],
    outputs: [out("fn", "Natural frequency", "frequency", "Hz"), out("wn", "Angular frequency", "angularSpeed", "rad/s")],
    compute: ({ k, m }) => ({ values: { fn: Math.sqrt(k! / m!) / (2 * Math.PI), wn: Math.sqrt(k! / m!) } }),
    refs: [{ inputs: { k: 1000, m: 10 }, expect: { fn: 1.591549430919, wn: 10 }, note: "√100 = 10 rad/s" }],
  }),
  def({
    id: "bolt-torque",
    name: "Bolt tightening torque",
    category: "mechanical",
    description: "Torque for a bolt preload (short-form torque equation).",
    formula: ["T = K·F·d"],
    assumptions: ["Nut factor K ≈ 0.2 dry steel, 0.15 lubricated (wide scatter: ±25 % preload)"],
    inputs: [inp("K", "Nut factor", "dimensionless", undefined, { ...pos, default: 0.2 }), inp("F", "Preload", "force", "kN", { ...pos }), inp("d", "Nominal diameter", "length", "mm", { ...pos })],
    outputs: [out("T", "Torque", "torque", "N·m")],
    compute: ({ K, F, d }) => ({ values: { T: K! * F! * d! } }),
    refs: [{ inputs: { K: 0.2, F: 30, d: 12 }, expect: { T: 72 }, note: "0.2·30 000·0.012" }],
  }),
  def({
    id: "section-rectangle",
    name: "Rectangle section properties",
    category: "civil",
    description: "Area, second moment of area and section modulus of a solid rectangle.",
    formula: ["A = b·h", "I = b·h³ / 12", "Z = b·h² / 6"],
    assumptions: ["Bending about the axis parallel to b, through the centroid"],
    inputs: [inp("b", "Width", "length", "mm", { ...pos }), inp("h", "Depth", "length", "mm", { ...pos })],
    outputs: [out("A", "Area", "area", "mm2"), out("I", "Second moment of area", "secondMoment", "mm4"), out("Z", "Section modulus", "volume", "mm3")],
    compute: ({ b, h }) => ({ values: { A: b! * h!, I: (b! * h! ** 3) / 12, Z: (b! * h! * h!) / 6 } }),
    refs: [{ inputs: { b: 100, h: 200 }, expect: { A: 20000, I: 66666666.66667, Z: 666666.6666667 }, note: "100·200³/12" }],
  }),
  def({
    id: "section-circle",
    name: "Round and tube section properties",
    category: "civil",
    description: "Area, second moment of area and section modulus of a solid or hollow circle.",
    formula: ["A = π(D² - d²)/4", "I = π(D⁴ - d⁴)/64", "Z = I / (D/2)", "J = 2I"],
    assumptions: ["d = 0 for a solid bar"],
    inputs: [inp("D", "Outer diameter", "length", "mm", { ...pos }), inp("d", "Inner diameter", "length", "mm", { ...nonneg, default: 0 })],
    outputs: [out("A", "Area", "area", "mm2"), out("I", "Second moment of area", "secondMoment", "mm4"), out("Z", "Section modulus", "volume", "mm3"), out("J", "Polar moment", "secondMoment", "mm4")],
    compute: ({ D, d }) => {
      if (d! >= D!) fail("The inner diameter must be smaller than the outer.", "d");
      const I = (Math.PI * (D! ** 4 - d! ** 4)) / 64;
      return { values: { A: (Math.PI * (D! ** 2 - d! ** 2)) / 4, I, Z: I / (D! / 2), J: 2 * I } };
    },
    refs: [{ inputs: { D: 100, d: 0 }, expect: { A: 7853.981633974, I: 4908738.521234, Z: 98174.77042468 }, note: "Solid 100 mm bar" }],
  }),
  def({
    id: "concrete-volume",
    name: "Concrete volume (slab)",
    category: "civil",
    description: "Concrete for a rectangular slab or footing, with an allowance for waste.",
    formula: ["V = L·W·T·(1 + waste)"],
    assumptions: ["Rectangular pour, uniform thickness", "5–10 % waste is common"],
    inputs: [inp("L", "Length", "length", "m", { ...pos }), inp("W", "Width", "length", "m", { ...pos }), inp("T", "Thickness", "length", "mm", { ...pos }), inp("waste", "Waste allowance", "ratio", "percent", { ...nonneg, default: 5 })],
    outputs: [out("V", "Volume", "volume", "m3"), out("Vyd", "Volume", "volume", "yd3")],
    compute: ({ L, W, T, waste }) => {
      const V = L! * W! * T! * (1 + waste!);
      return { values: { V, Vyd: V } };
    },
    refs: [{ inputs: { L: 5, W: 4, T: 150, waste: 0 }, expect: { V: 3, Vyd: 3.923851857943 }, note: "5·4·0.15" }],
  }),
  def({
    id: "rebar-weight",
    name: "Rebar weight",
    category: "civil",
    description: "Mass of steel reinforcing bar by diameter and length.",
    formula: ["m/L = π·d²/4·ρ (≈ d²/162 kg/m with d in mm)"],
    assumptions: ["Steel density 7850 kg/m³", "Nominal diameter"],
    inputs: [inp("d", "Bar diameter", "length", "mm", { ...pos }), inp("L", "Total length", "length", "m", { ...pos })],
    outputs: [out("perM", "Mass per metre (kg/m)", "dimensionless"), out("m", "Total mass", "mass", "kg")],
    compute: ({ d, L }) => {
      const perM = ((Math.PI * d! * d!) / 4) * 7850;
      return { values: { perM, m: perM * L! } };
    },
    refs: [{ inputs: { d: 12, L: 100 }, expect: { perM: 0.8878140839045, m: 88.78140839045 }, note: "π·0.012²/4·7850 (d²/162 ≈ 0.889)" }],
  }),
  def({
    id: "grade-slope",
    name: "Grade and slope",
    category: "civil",
    description: "Grade percentage, angle and ratio from rise and run.",
    formula: ["Grade = rise / run", "θ = atan(rise / run)"],
    assumptions: ["Run measured horizontally"],
    inputs: [inp("rise", "Rise", "length", "m"), inp("run", "Run", "length", "m", { ...pos })],
    outputs: [out("grade", "Grade", "ratio", "percent"), out("angle", "Angle", "angle", "deg"), out("length", "Slope length", "length", "m")],
    compute: ({ rise, run }) => ({ values: { grade: rise! / run!, angle: Math.atan(rise! / run!), length: Math.hypot(rise!, run!) } }),
    refs: [{ inputs: { rise: 1, run: 12 }, expect: { grade: 8.333333333333, angle: 4.763641690726 }, note: "1:12 ramp" }],
  }),
  def({
    id: "bearing-pressure",
    name: "Footing bearing pressure",
    category: "civil",
    description: "Average soil pressure under a footing, and the area needed for an allowable pressure.",
    formula: ["q = P / A", "A_required = P / q_allow"],
    assumptions: ["Concentric load, rigid footing (uniform pressure)", "q_allow already includes the safety factor"],
    inputs: [inp("P", "Load", "force", "kN", { ...pos }), inp("A", "Footing area", "area", "m2", { ...pos }), inp("qa", "Allowable pressure", "pressure", "kPa", { ...pos })],
    outputs: [out("q", "Bearing pressure", "pressure", "kPa"), out("Areq", "Area needed", "area", "m2"), out("util", "Utilisation", "ratio", "percent")],
    compute: ({ P, A, qa }) => {
      const q = P! / A!;
      return { values: { q, Areq: P! / qa!, util: q / qa! }, warnings: q > qa! ? ["The pressure is above the allowable value: enlarge the footing."] : [] };
    },
    refs: [{ inputs: { P: 500, A: 4, qa: 150 }, expect: { q: 125, Areq: 3.333333333333, util: 83.33333333333 }, note: "500/4" }],
  }),
  def({
    id: "wind-load",
    name: "Wind pressure and force",
    category: "civil",
    description: "Dynamic wind pressure and the drag force on a surface.",
    formula: ["q = ½·ρ·V²", "F = q·C_d·A"],
    assumptions: ["Air density 1.225 kg/m³ (sea level, 15 °C)", "Not a code calculation: design codes add gust, exposure and importance factors"],
    inputs: [inp("V", "Wind speed", "speed", "m/s", { ...nonneg }), inp("Cd", "Drag (force) coefficient", "dimensionless", undefined, { ...pos, default: 1.2 }), inp("A", "Area", "area", "m2", { ...pos }), inp("rho", "Air density", "density", "kg/m3", { ...pos, default: 1.225 })],
    outputs: [out("q", "Dynamic pressure", "pressure", "Pa"), out("F", "Force", "force", "kN")],
    compute: ({ V, Cd, A, rho }) => {
      const q = 0.5 * rho! * V! * V!;
      return { values: { q, F: q * Cd! * A! } };
    },
    refs: [{ inputs: { V: 30, Cd: 1.2, A: 10, rho: 1.225 }, expect: { q: 551.25, F: 6.615 }, note: "½·1.225·900" }],
  }),
  def({
    id: "rational-runoff",
    name: "Stormwater runoff (rational method)",
    category: "civil",
    description: "Peak runoff from a small catchment.",
    formula: ["Q = C·i·A / 360 (Q in m³/s, i in mm/h, A in ha)"],
    assumptions: ["Small catchments (under ~80 ha)", "Uniform rainfall for at least the time of concentration", "C: 0.7–0.95 paved, 0.1–0.35 lawns"],
    inputs: [inp("C", "Runoff coefficient", "dimensionless", undefined, { min: 0, max: 1 }), inp("i", "Rainfall intensity (mm/h)", "dimensionless", undefined, { ...pos }), inp("A", "Catchment area", "area", "ha", { ...pos })],
    outputs: [out("Q", "Peak flow", "flow", "m3/s")],
    compute: ({ C, i, A }) => ({ values: { Q: (C! * i! * (A! / 1e4)) / 360 } }),
    refs: [{ inputs: { C: 0.7, i: 50, A: 2 }, expect: { Q: 0.1944444444444 }, note: "0.7·50·2/360" }],
  }),
  def({
    id: "manning-pipe",
    name: "Pipe flowing full (Manning)",
    category: "civil",
    description: "Velocity and flow of a circular pipe flowing full by Manning's equation.",
    formula: ["V = (1/n)·R^(2/3)·S^(1/2), R = D/4", "Q = V·πD²/4"],
    assumptions: ["Gravity flow, pipe just full, uniform flow", "n ≈ 0.013 concrete, 0.009–0.011 PVC"],
    inputs: [inp("D", "Diameter", "length", "mm", { ...pos }), inp("S", "Slope", "ratio", "percent", { ...pos }), inp("n", "Manning's n", "dimensionless", undefined, { ...pos, default: 0.013 })],
    outputs: [out("V", "Velocity", "speed", "m/s"), out("Q", "Flow", "flow", "L/s")],
    compute: ({ D, S, n }) => {
      const V = (1 / n!) * (D! / 4) ** (2 / 3) * Math.sqrt(S!);
      return { values: { V, Q: (V * Math.PI * D! * D!) / 4 } };
    },
    refs: [{ inputs: { D: 300, S: 1, n: 0.013 }, expect: { V: 1.368035886342, Q: 96.70075853355 }, note: "300 mm at 1 %" }],
  }),
  def({
    id: "earthwork-volume",
    name: "Earthwork volume (average end area)",
    category: "civil",
    description: "Cut or fill volume between two cross-sections.",
    formula: ["V = L·(A₁ + A₂) / 2"],
    assumptions: ["Straight section between the two stations", "Average end area overestimates slightly versus the prismoidal formula"],
    inputs: [inp("A1", "Area at station 1", "area", "m2", { ...nonneg }), inp("A2", "Area at station 2", "area", "m2", { ...nonneg }), inp("L", "Distance between", "length", "m", { ...pos })],
    outputs: [out("V", "Volume", "volume", "m3")],
    compute: ({ A1, A2, L }) => ({ values: { V: (L! * (A1! + A2!)) / 2 } }),
    refs: [{ inputs: { A1: 10, A2: 14, L: 20 }, expect: { V: 240 }, note: "20·24/2" }],
  }),
  def({
    id: "brick-count",
    name: "Bricks for a wall",
    category: "civil",
    description: "Number of bricks for a wall area, including mortar joints and waste.",
    formula: ["n = A / ((l + j)·(h + j))·(1 + waste)"],
    assumptions: ["Single leaf (one brick thick), stretcher bond", "Openings already taken out of the area"],
    inputs: [
      inp("A", "Wall area", "area", "m2", { ...pos }),
      inp("l", "Brick length", "length", "mm", { ...pos, default: 215 }),
      inp("h", "Brick height", "length", "mm", { ...pos, default: 65 }),
      inp("j", "Joint", "length", "mm", { ...nonneg, default: 10 }),
      inp("waste", "Waste", "ratio", "percent", { ...nonneg, default: 5 }),
    ],
    outputs: [out("n", "Bricks", "count")],
    compute: ({ A, l, h, j, waste }) => ({ values: { n: Math.ceil((A! / ((l! + j!) * (h! + j!))) * (1 + waste!)) } }),
    refs: [{ inputs: { A: 10, l: 215, h: 65, j: 10, waste: 0 }, expect: { n: 593 }, note: "10/(0.225·0.075) = 592.6 → 593" }],
  }),
  def({
    id: "heat-conduction",
    name: "Heat conduction (Fourier)",
    category: "thermal",
    description: "Steady heat flow through a flat wall.",
    formula: ["Q = k·A·ΔT / L", "R = L / (k·A)"],
    assumptions: ["Steady state, one-dimensional", "k constant with temperature"],
    inputs: [inp("k", "Thermal conductivity", "thermalConductivity", "W/mK", { ...pos }), inp("A", "Area", "area", "m2", { ...pos }), inp("dT", "Temperature difference", "temperatureDelta", "dK"), inp("L", "Thickness", "length", "mm", { ...pos })],
    outputs: [out("Q", "Heat flow", "power", "W"), out("R", "Thermal resistance", "thermalResistance", "K/W")],
    compute: ({ k, A, dT, L }) => ({ values: { Q: (k! * A! * dT!) / L!, R: L! / (k! * A!) } }),
    refs: [{ inputs: { k: 0.04, A: 10, dT: 20, L: 100 }, expect: { Q: 80, R: 0.25 }, note: "Insulation: 0.04·10·20/0.1" }],
  }),
  def({
    id: "heat-convection",
    name: "Convection (Newton's law of cooling)",
    category: "thermal",
    description: "Heat flow from a surface to a fluid.",
    formula: ["Q = h·A·ΔT"],
    assumptions: ["h from correlations or tables (still air 5–25, forced air 25–250, water 500–10 000 W/m²K)"],
    inputs: [inp("h", "Heat transfer coefficient", "heatTransferCoeff", "W/m2K", { ...pos }), inp("A", "Area", "area", "m2", { ...pos }), inp("dT", "Surface minus fluid", "temperatureDelta", "dK")],
    outputs: [out("Q", "Heat flow", "power", "W")],
    compute: ({ h, A, dT }) => ({ values: { Q: h! * A! * dT! } }),
    refs: [{ inputs: { h: 10, A: 2, dT: 30 }, expect: { Q: 600 }, note: "10·2·30" }],
  }),
  def({
    id: "heat-radiation",
    name: "Thermal radiation",
    category: "thermal",
    description: "Net radiant heat exchange between a surface and its surroundings.",
    formula: ["Q = ε·σ·A·(T_s⁴ - T_∞⁴)"],
    assumptions: ["Grey surface small compared with its surroundings", "σ = 5.670374419e-8 W/(m²K⁴); temperatures absolute"],
    inputs: [inp("eps", "Emissivity", "ratio", "fraction", { min: 0, max: 1 }), inp("A", "Area", "area", "m2", { ...pos }), inp("Ts", "Surface temperature", "temperature", "C"), inp("Tinf", "Surroundings temperature", "temperature", "C")],
    outputs: [out("Q", "Net heat flow", "power", "W")],
    compute: ({ eps, A, Ts, Tinf }) => ({ values: { Q: eps! * SIGMA * A! * (Ts! ** 4 - Tinf! ** 4) } }),
    refs: [{ inputs: { eps: 0.9, A: 1, Ts: 100, Tinf: 20 }, expect: { Q: 612.5474056958 }, note: "0.9·σ·(373.15⁴ - 293.15⁴)" }],
  }),
  def({
    id: "sensible-heat",
    name: "Heat to warm a mass",
    category: "thermal",
    description: "Energy to change a mass's temperature, and the time at a given heater power.",
    formula: ["Q = m·c·ΔT", "t = Q / P"],
    assumptions: ["No phase change", "c constant (water 4186 J/kgK)", "No losses"],
    inputs: [inp("m", "Mass", "mass", "kg", { ...pos }), inp("c", "Specific heat", "specificHeat", "J/kgK", { ...pos, default: 4186 }), inp("dT", "Temperature rise", "temperatureDelta", "dK"), inp("P", "Heater power", "power", "kW", { optional: true, ...pos })],
    outputs: [out("Q", "Energy", "energy", "kJ"), out("t", "Time", "time", "min", { optional: true })],
    compute: ({ m, c, dT, P }) => {
      const Q = m! * c! * dT!;
      return { values: { Q, ...(P !== undefined ? { t: Q / P } : {}) } };
    },
    refs: [{ inputs: { m: 1, c: 4186, dT: 80, P: 2 }, expect: { Q: 334.88, t: 2.790666666667 }, note: "A litre of water, 20 → 100 °C" }],
  }),
  def({
    id: "reynolds-number",
    name: "Reynolds number",
    category: "thermal",
    description: "Reynolds number for flow in a pipe, and the flow regime.",
    formula: ["Re = ρ·V·D / μ"],
    assumptions: ["Pipe flow: laminar below about 2300, turbulent above about 4000"],
    inputs: [inp("rho", "Density", "density", "kg/m3", { ...pos, default: 1000 }), inp("V", "Velocity", "speed", "m/s", { ...nonneg }), inp("D", "Diameter", "length", "mm", { ...pos }), inp("mu", "Dynamic viscosity", "dynamicViscosity", "cP", { ...pos, default: 1 })],
    outputs: [out("Re", "Reynolds number", "dimensionless")],
    compute: ({ rho, V, D, mu }) => {
      const Re = (rho! * V! * D!) / mu!;
      return { values: { Re }, warnings: [Re < 2300 ? "Laminar flow" : Re < 4000 ? "Transitional flow: neither laminar nor turbulent correlations are reliable" : "Turbulent flow"] };
    },
    refs: [{ inputs: { rho: 1000, V: 2, D: 50, mu: 1 }, expect: { Re: 100000 }, note: "Water at 2 m/s in a 50 mm pipe" }],
  }),
  def({
    id: "darcy-weisbach",
    name: "Pipe pressure drop (Darcy–Weisbach)",
    category: "thermal",
    description: "Friction pressure drop in a straight pipe, with the friction factor from the flow.",
    formula: ["Re = ρVD/μ", "Laminar: f = 64/Re; turbulent: Swamee–Jain f = 0.25 / log₁₀(ε/3.7D + 5.74/Re^0.9)²", "Δp = f·(L/D)·ρV²/2"],
    assumptions: ["Fully developed flow, straight pipe (fittings not included)", "Swamee–Jain valid for 5000 < Re < 10⁸, 10⁻⁶ < ε/D < 10⁻²", "Roughness ε: 0.0015 mm drawn tube, 0.045 mm commercial steel"],
    inputs: [
      inp("rho", "Density", "density", "kg/m3", { ...pos, default: 1000 }),
      inp("mu", "Viscosity", "dynamicViscosity", "cP", { ...pos, default: 1 }),
      inp("V", "Velocity", "speed", "m/s", { ...pos }),
      inp("D", "Diameter", "length", "mm", { ...pos }),
      inp("L", "Length", "length", "m", { ...pos }),
      inp("eps", "Roughness", "length", "mm", { ...nonneg, default: 0.045 }),
    ],
    outputs: [out("Re", "Reynolds number", "dimensionless"), out("f", "Friction factor", "dimensionless"), out("dp", "Pressure drop", "pressure", "kPa"), out("head", "Head loss", "length", "m")],
    compute: ({ rho, mu, V, D, L, eps }) => {
      const Re = (rho! * V! * D!) / mu!;
      const warnings: string[] = [];
      let f: number;
      if (Re < 2300) f = 64 / Re;
      else {
        if (Re < 5000) warnings.push("Transitional flow: the friction factor is uncertain.");
        f = 0.25 / Math.log10(eps! / (3.7 * D!) + 5.74 / Re ** 0.9) ** 2;
      }
      const dp = f * (L! / D!) * ((rho! * V! * V!) / 2);
      return { values: { Re, f, dp, head: dp / (rho! * G0) }, warnings };
    },
    refs: [
      { inputs: { rho: 1000, mu: 1, V: 2, D: 50, L: 100, eps: 0.1 }, expect: { Re: 100000, f: 0.02533292623811, dp: 101.3317049524 }, note: "Swamee–Jain at ε/D = 0.002" },
      { inputs: { rho: 1000, mu: 100, V: 0.5, D: 20, L: 10, eps: 0 }, expect: { Re: 100, f: 0.64, dp: 40 }, note: "Laminar oil: f = 64/100" },
    ],
  }),
  def({
    id: "pipe-flow-rate",
    name: "Pipe flow and velocity",
    category: "thermal",
    description: "Flow rate from velocity in a round pipe (or velocity from flow).",
    formula: ["Q = V·πD²/4"],
    assumptions: ["Average velocity over the section"],
    inputs: [inp("D", "Inner diameter", "length", "mm", { ...pos }), inp("V", "Velocity", "speed", "m/s", { optional: true, ...nonneg }), inp("Q", "Flow", "flow", "m3/h", { optional: true, ...nonneg })],
    outputs: [out("V", "Velocity", "speed", "m/s"), out("Q", "Flow", "flow", "m3/h")],
    pick: { count: 1, keys: ["V", "Q"] },
    compute: ({ D, V, Q }) => {
      const A = (Math.PI * D! * D!) / 4;
      return V !== undefined ? { values: { V, Q: V * A } } : { values: { Q: Q!, V: Q! / A } };
    },
    refs: [{ inputs: { D: 100, V: 1 }, expect: { Q: 28.27433388231 }, note: "π·0.05²·3600" }],
  }),
  def({
    id: "pump-power",
    name: "Pump power",
    category: "thermal",
    description: "Hydraulic and shaft power of a pump.",
    formula: ["P_hyd = ρ·g·Q·H", "P_shaft = P_hyd / η"],
    assumptions: ["Steady flow", "H is total dynamic head"],
    inputs: [inp("Q", "Flow", "flow", "L/s", { ...pos }), inp("H", "Head", "length", "m", { ...pos }), inp("rho", "Density", "density", "kg/m3", { ...pos, default: 1000 }), inp("eff", "Pump efficiency", "ratio", "percent", { min: 0, max: 1, exclusiveMin: true, default: 70 })],
    outputs: [out("Phyd", "Hydraulic power", "power", "kW"), out("Pshaft", "Shaft power", "power", "kW")],
    compute: ({ Q, H, rho, eff }) => {
      const P = rho! * G0 * Q! * H!;
      return { values: { Phyd: P, Pshaft: P / eff! } };
    },
    refs: [{ inputs: { Q: 10, H: 20, rho: 1000, eff: 70 }, expect: { Phyd: 1.961330, Pshaft: 2.8019 }, note: "1000·9.80665·0.01·20" }],
  }),
  def({
    id: "lmtd",
    name: "Log mean temperature difference",
    category: "thermal",
    description: "LMTD of a heat exchanger and the heat duty for a UA value.",
    formula: ["LMTD = (ΔT₁ - ΔT₂) / ln(ΔT₁/ΔT₂)", "Q = U·A·LMTD"],
    assumptions: ["Counter-flow or parallel flow (no F correction for multi-pass)", "Constant U"],
    inputs: [inp("dT1", "ΔT at one end", "temperatureDelta", "dK", { ...pos }), inp("dT2", "ΔT at the other end", "temperatureDelta", "dK", { ...pos }), inp("U", "Overall coefficient", "heatTransferCoeff", "W/m2K", { optional: true, ...pos }), inp("A", "Area", "area", "m2", { optional: true, ...pos })],
    outputs: [out("lmtd", "LMTD", "temperatureDelta", "dK"), out("Q", "Heat duty", "power", "kW", { optional: true })],
    compute: ({ dT1, dT2, U, A }) => {
      const l = Math.abs(dT1! - dT2!) < 1e-9 ? dT1! : (dT1! - dT2!) / Math.log(dT1! / dT2!);
      return { values: { lmtd: l, ...(U !== undefined && A !== undefined ? { Q: U * A * l } : {}) } };
    },
    refs: [
      { inputs: { dT1: 40, dT2: 20 }, expect: { lmtd: 28.85390081778 }, note: "20/ln 2" },
      { inputs: { dT1: 30, dT2: 30, U: 500, A: 2 }, expect: { lmtd: 30, Q: 30 }, note: "Equal ends" },
    ],
  }),
  def({
    id: "fan-affinity",
    name: "Fan and pump affinity laws",
    category: "thermal",
    description: "Flow, pressure and power at a new speed.",
    formula: ["Q₂ = Q₁·(n₂/n₁)", "p₂ = p₁·(n₂/n₁)²", "P₂ = P₁·(n₂/n₁)³"],
    assumptions: ["Same fan or pump and impeller diameter", "Same fluid density", "System curve passes through the origin (no static head)"],
    inputs: [inp("n1", "Speed 1", "angularSpeed", "rpm", { ...pos }), inp("n2", "Speed 2", "angularSpeed", "rpm", { ...pos }), inp("Q1", "Flow 1", "flow", "m3/h", { ...nonneg }), inp("p1", "Pressure 1", "pressure", "Pa", { ...nonneg }), inp("P1", "Power 1", "power", "kW", { ...nonneg })],
    outputs: [out("Q2", "Flow 2", "flow", "m3/h"), out("p2", "Pressure 2", "pressure", "Pa"), out("P2", "Power 2", "power", "kW")],
    compute: ({ n1, n2, Q1, p1, P1 }) => {
      const r = n2! / n1!;
      return { values: { Q2: Q1! * r, p2: p1! * r * r, P2: P1! * r ** 3 } };
    },
    refs: [{ inputs: { n1: 1450, n2: 725, Q1: 1000, p1: 400, P1: 8 }, expect: { Q2: 500, p2: 100, P2: 1 }, note: "Half speed: ½, ¼, ⅛" }],
  }),
  def({
    id: "ideal-gas",
    name: "Ideal gas law",
    category: "thermal",
    description: "Any three of pressure, volume, amount and temperature give the fourth.",
    formula: ["p·V = n·R·T", "R = 8.314462618 J/(mol·K)"],
    assumptions: ["Ideal gas: low pressure, well above the boiling point"],
    inputs: [inp("p", "Pressure", "pressure", "kPa", { optional: true, ...pos }), inp("V", "Volume", "volume", "L", { optional: true, ...pos }), inp("n", "Amount", "amount", "mol", { optional: true, ...pos }), inp("T", "Temperature", "temperature", "C", { optional: true, min: 0, exclusiveMin: true })],
    outputs: [out("p", "Pressure", "pressure", "kPa"), out("V", "Volume", "volume", "L"), out("n", "Amount", "amount", "mol"), out("T", "Temperature", "temperature", "C")],
    pick: { count: 3, keys: ["p", "V", "n", "T"] },
    compute: ({ p, V, n, T }) => {
      const R = 8.314462618;
      if (p === undefined) return { values: { V: V!, n: n!, T: T!, p: (n! * R * T!) / V! } };
      if (V === undefined) return { values: { p, n: n!, T: T!, V: (n! * R * T!) / p } };
      if (n === undefined) return { values: { p, V, T: T!, n: (p * V) / (R * T!) } };
      return { values: { p, V, n, T: (p * V) / (n * R) } };
    },
    refs: [
      { inputs: { p: 101.325, V: 22.4, T: 0 }, expect: { n: 0.9993767483010 }, note: "Molar volume at STP ≈ 22.4 L" },
      { inputs: { n: 1, V: 24.465, T: 25 }, expect: { p: 101.3267, }, tol: 1e-4, note: "1 mol at 25 °C in 24.465 L ≈ 1 atm" },
    ],
  }),
  def({
    id: "hydrostatic-pressure",
    name: "Hydrostatic pressure",
    category: "thermal",
    description: "Pressure at a depth in a liquid.",
    formula: ["p = ρ·g·h (gauge)", "Absolute = gauge + atmospheric"],
    assumptions: ["Incompressible liquid at rest", "g = 9.80665 m/s²"],
    inputs: [inp("rho", "Density", "density", "kg/m3", { ...pos, default: 1000 }), inp("h", "Depth", "length", "m", { ...nonneg }), inp("patm", "Atmospheric pressure", "pressure", "kPa", { ...nonneg, default: 101.325 })],
    outputs: [out("p", "Gauge pressure", "pressure", "kPa"), out("pabs", "Absolute pressure", "pressure", "kPa")],
    compute: ({ rho, h, patm }) => ({ values: { p: rho! * G0 * h!, pabs: rho! * G0 * h! + patm! } }),
    refs: [{ inputs: { rho: 1000, h: 10, patm: 101.325 }, expect: { p: 98.0665, pabs: 199.3915 }, note: "10 m of water ≈ 1 bar" }],
  }),
  def({
    id: "orifice-flow",
    name: "Orifice flow",
    category: "thermal",
    description: "Flow through a sharp-edged orifice from the pressure drop.",
    formula: ["Q = C_d·A·√(2Δp/ρ)"],
    assumptions: ["Incompressible flow", "C_d ≈ 0.61 for a sharp-edged orifice", "Approach velocity ignored (small orifice in a large pipe)"],
    inputs: [inp("d", "Orifice diameter", "length", "mm", { ...pos }), inp("dp", "Pressure drop", "pressure", "kPa", { ...pos }), inp("rho", "Density", "density", "kg/m3", { ...pos, default: 1000 }), inp("Cd", "Discharge coefficient", "dimensionless", undefined, { ...pos, default: 0.61 })],
    outputs: [out("Q", "Flow", "flow", "L/s"), out("v", "Jet velocity", "speed", "m/s")],
    compute: ({ d, dp, rho, Cd }) => {
      const v = Math.sqrt((2 * dp!) / rho!);
      return { values: { v, Q: ((Cd! * Math.PI * d! * d!) / 4) * v } };
    },
    refs: [{ inputs: { d: 25, dp: 10, rho: 1000, Cd: 0.61 }, expect: { Q: 1.339105308105 }, note: "0.61·4.909e-4·√20" }],
  }),
  def({
    id: "buoyancy",
    name: "Buoyant force",
    category: "physics",
    description: "Upward force on a submerged volume (Archimedes).",
    formula: ["F_b = ρ_fluid·g·V"],
    assumptions: ["Fluid at rest, uniform density"],
    inputs: [inp("rho", "Fluid density", "density", "kg/m3", { ...pos, default: 1000 }), inp("V", "Submerged volume", "volume", "L", { ...pos })],
    outputs: [out("F", "Buoyant force", "force", "N"), out("m", "Mass it can float", "mass", "kg")],
    compute: ({ rho, V }) => ({ values: { F: rho! * G0 * V!, m: rho! * V! } }),
    refs: [{ inputs: { rho: 1000, V: 1 }, expect: { F: 9.80665, m: 1 }, note: "1 L of water" }],
  }),
];
