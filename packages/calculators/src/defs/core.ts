/**
 * The twenty GEM AI release calculators. Each has five or more reference cases worked by hand
 * (and re-checked independently); see core.test.ts. Formulas state when they apply.
 */
import type { CalculatorDef } from "../registry";
import { def, fail, inp, nextStandard, nonneg, nonZero, out, pos } from "./helpers";

const ohmsLaw = def({
  id: "ohms-law",
  name: "Ohm's law",
  category: "basic",
  description: "Any two of voltage, current, resistance and power give the other two.",
  keywords: ["ohm", "ohms law", "voltage current resistance", "v=ir", "power"],
  formula: ["V = I·R", "P = V·I = I²·R = V²/R"],
  assumptions: ["A linear, resistive (ohmic) element", "DC, or AC RMS values with a purely resistive load"],
  inputs: [
    inp("V", "Voltage", "voltage", "V", { symbol: "V", optional: true }),
    inp("I", "Current", "current", "A", { symbol: "I", optional: true }),
    inp("R", "Resistance", "resistance", "ohm", { symbol: "R", optional: true, ...pos }),
    inp("P", "Power", "power", "W", { symbol: "P", optional: true, ...nonneg }),
  ],
  outputs: [out("V", "Voltage", "voltage", "V", { symbol: "V" }), out("I", "Current", "current", "A", { symbol: "I" }), out("R", "Resistance", "resistance", "ohm", { symbol: "R" }), out("P", "Power", "power", "W", { symbol: "P" })],
  pick: { count: 2, keys: ["V", "I", "R", "P"] },
  compute: ({ V, I, R, P }) => {
    let v = V,
      i = I,
      r = R,
      p = P;
    const steps: string[] = [];
    if (v !== undefined && i !== undefined) {
      r = v / nonZero(i, "Current", "I");
      p = v * i;
      steps.push("R = V / I", "P = V·I");
    } else if (v !== undefined && r !== undefined) {
      i = v / r;
      p = (v * v) / r;
      steps.push("I = V / R", "P = V² / R");
    } else if (v !== undefined && p !== undefined) {
      i = p / nonZero(v, "Voltage", "V");
      if (p === 0) fail("With zero power the resistance can't be found.", "P");
      r = (v * v) / p;
      steps.push("I = P / V", "R = V² / P");
    } else if (i !== undefined && r !== undefined) {
      v = i * r;
      p = i * i * r;
      steps.push("V = I·R", "P = I²·R");
    } else if (i !== undefined && p !== undefined) {
      v = p / nonZero(i, "Current", "I");
      r = p / (i * i);
      steps.push("V = P / I", "R = P / I²");
    } else if (r !== undefined && p !== undefined) {
      i = Math.sqrt(p / r);
      v = Math.sqrt(p * r);
      steps.push("I = √(P / R)", "V = √(P·R)");
    }
    if (r !== undefined && r < 0) fail("Voltage and current must have the same sign for a resistor (negative resistance).");
    return { values: { V: v!, I: i!, R: r!, P: p! }, steps };
  },
  status: "verified",
  refs: [
    { inputs: { V: 12, R: 4 }, expect: { I: 3, P: 36 }, note: "12/4 = 3 A; 12·3 = 36 W" },
    { inputs: { I: 2, R: 10 }, expect: { V: 20, P: 40 }, note: "2·10 = 20 V; 2²·10 = 40 W" },
    { inputs: { V: 230, P: 2300 }, expect: { I: 10, R: 23 }, note: "2300/230 = 10 A; 230²/2300 = 23 Ω" },
    { inputs: { P: 100, R: 4 }, expect: { I: 5, V: 20 }, note: "√(100/4) = 5 A; √(100·4) = 20 V" },
    { inputs: { V: 5, I: [20, "mA"] }, expect: { R: 250, P: 0.1 }, note: "5/0.02 = 250 Ω; 5·0.02 = 0.1 W" },
    { inputs: { I: 0.5, P: 12 }, expect: { V: 24, R: 48 }, note: "12/0.5 = 24 V; 12/0.25 = 48 Ω" },
  ],
});

const dcPower = def({
  id: "dc-power-energy",
  name: "DC power and energy",
  category: "basic",
  description: "Power, energy and charge for a steady DC load over a time.",
  keywords: ["dc power", "energy", "watt hour", "kwh", "battery energy", "ampere hour"],
  formula: ["P = V·I", "E = P·t", "Q = I·t"],
  assumptions: ["Voltage and current constant over the whole time"],
  inputs: [inp("V", "Voltage", "voltage", "V", { symbol: "V" }), inp("I", "Current", "current", "A", { symbol: "I" }), inp("t", "Time", "time", "h", { symbol: "t", ...nonneg })],
  outputs: [out("P", "Power", "power", "W", { symbol: "P" }), out("E", "Energy", "energy", "kWh", { symbol: "E" }), out("Q", "Charge", "charge", "Ah", { symbol: "Q" })],
  compute: ({ V, I, t }) => ({ values: { P: V! * I!, E: V! * I! * t!, Q: I! * t! } }),
  status: "verified",
  refs: [
    { inputs: { V: 12, I: 5, t: 2 }, expect: { P: 60, E: 0.12, Q: 10 }, note: "12·5 = 60 W; 60 W·2 h = 120 Wh; 5 A·2 h = 10 Ah" },
    { inputs: { V: 230, I: 10, t: 1 }, expect: { P: 2300, E: 2.3, Q: 10 }, note: "2300 W for 1 h = 2.3 kWh" },
    { inputs: { V: 3.7, I: 0.5, t: 3 }, expect: { P: 1.85, E: 0.00555, Q: 1.5 }, note: "1.85 W·3 h = 5.55 Wh" },
    { inputs: { V: 48, I: 100, t: 0.5 }, expect: { P: 4800, E: 2.4, Q: 50 }, note: "4.8 kW·0.5 h = 2.4 kWh" },
    { inputs: { V: 5, I: 2, t: [30, "min"] }, expect: { P: 10, E: 0.005, Q: 1 }, note: "10 W·0.5 h = 5 Wh; 2 A·0.5 h = 1 Ah" },
  ],
});

const resistors = def({
  id: "resistors-series-parallel",
  name: "Resistors in series and parallel",
  category: "basic",
  description: "Total resistance of resistors connected in series, and in parallel.",
  keywords: ["series resistance", "parallel resistance", "equivalent resistance", "resistor network"],
  formula: ["Series: Rₛ = R₁ + R₂ + …", "Parallel: 1/Rₚ = 1/R₁ + 1/R₂ + …"],
  assumptions: ["Ideal resistors; wiring resistance ignored"],
  inputs: [inp("R", "Resistances", "resistance", "ohm", { list: true, ...pos, help: "Separate values with commas" })],
  outputs: [out("series", "Series total", "resistance", "ohm", { symbol: "Rₛ" }), out("parallel", "Parallel total", "resistance", "ohm", { symbol: "Rₚ" })],
  compute: ({ lists }) => {
    const R = lists.R!;
    return { values: { series: R.reduce((a, b) => a + b, 0), parallel: 1 / R.reduce((a, b) => a + 1 / b, 0) } };
  },
  status: "verified",
  refs: [
    { inputs: { R: [100, 100] }, expect: { series: 200, parallel: 50 }, note: "Two equal resistors: half in parallel" },
    { inputs: { R: [10, 20, 30] }, expect: { series: 60, parallel: 5.454545454545 }, note: "1/(1/10+1/20+1/30) = 60/11" },
    { inputs: { R: [1000, 2200] }, expect: { series: 3200, parallel: 687.5 }, note: "1k·2.2k/3.2k = 687.5 Ω" },
    { inputs: { R: [47] }, expect: { series: 47, parallel: 47 }, note: "A single resistor" },
    { inputs: { R: [4, 4, 4, 4] }, expect: { series: 16, parallel: 1 }, note: "Four 4 Ω: 16 Ω series, 1 Ω parallel" },
  ],
});

const divider = def({
  id: "voltage-divider",
  name: "Voltage divider",
  category: "basic",
  description: "Output voltage of a two-resistor divider, optionally with a load on the output.",
  keywords: ["voltage divider", "potential divider", "resistor divider"],
  formula: ["Vout = Vin·R₂ / (R₁ + R₂)", "With a load: R₂ is replaced by R₂ ∥ R_L = R₂·R_L / (R₂ + R_L)"],
  assumptions: ["Ideal resistors", "Source with no internal resistance", "Without R_L: no current drawn from the output"],
  inputs: [
    inp("Vin", "Input voltage", "voltage", "V", { symbol: "Vin" }),
    inp("R1", "Top resistor", "resistance", "kohm", { symbol: "R₁", ...nonneg }),
    inp("R2", "Bottom resistor", "resistance", "kohm", { symbol: "R₂", ...pos }),
    inp("RL", "Load resistance", "resistance", "kohm", { symbol: "R_L", optional: true, ...pos }),
  ],
  outputs: [out("Vout", "Output voltage", "voltage", "V", { symbol: "Vout" }), out("ratio", "Division ratio", "ratio", "fraction", { symbol: "Vout/Vin" }), out("I", "Divider current", "current", "mA", { symbol: "I" })],
  compute: ({ Vin, R1, R2, RL }) => {
    const r2 = RL !== undefined ? (R2! * RL) / (R2! + RL) : R2!;
    const ratio = r2 / (R1! + r2);
    return { values: { Vout: Vin! * ratio, ratio, I: Vin! / (R1! + r2) }, steps: RL !== undefined ? [`R₂ ∥ R_L = ${Number((r2 / 1000).toPrecision(6))} kΩ`] : [] };
  },
  status: "verified",
  refs: [
    { inputs: { Vin: 12, R1: 10, R2: 10 }, expect: { Vout: 6, I: 0.6 }, note: "Equal resistors halve the voltage; 12 V/20 kΩ = 0.6 mA" },
    { inputs: { Vin: 5, R1: 1, R2: 2 }, expect: { Vout: 3.333333333333, ratio: 0.666666666667 }, note: "5·2/3" },
    { inputs: { Vin: 24, R1: 3.3, R2: 1 }, expect: { Vout: 5.581395348837 }, note: "24·1/4.3" },
    { inputs: { Vin: 12, R1: 10, R2: 10, RL: 10 }, expect: { Vout: 4, I: 0.8 }, note: "10k∥10k = 5k; 12·5/15 = 4 V" },
    { inputs: { Vin: 3.3, R1: 100, R2: 47 }, expect: { Vout: 1.055102040816 }, note: "3.3·47/147" },
  ],
});

const singlePhase = def({
  id: "single-phase-ac-power",
  name: "Single-phase AC power",
  category: "electrical",
  description: "Apparent, real and reactive power from RMS voltage, current and power factor.",
  keywords: ["single phase power", "ac power", "power factor", "kva", "reactive power"],
  formula: ["S = V·I", "P = S·cos φ", "Q = S·sin φ", "cos φ = PF"],
  assumptions: ["Sinusoidal voltage and current (no harmonics)", "RMS values", "Q shown as a magnitude (lagging or leading not distinguished)"],
  inputs: [inp("V", "Voltage (RMS)", "voltage", "V", { symbol: "V", min: 0 }), inp("I", "Current (RMS)", "current", "A", { symbol: "I", min: 0 }), inp("pf", "Power factor", "ratio", "fraction", { symbol: "PF", min: 0, max: 1 })],
  outputs: [out("S", "Apparent power", "apparentPower", "VA", { symbol: "S" }), out("P", "Real power", "power", "W", { symbol: "P" }), out("Q", "Reactive power", "reactivePower", "var", { symbol: "Q" }), out("phi", "Phase angle", "angle", "deg", { symbol: "φ" })],
  compute: ({ V, I, pf }) => {
    const S = V! * I!;
    return { values: { S, P: S * pf!, Q: S * Math.sqrt(1 - pf! * pf!), phi: Math.acos(pf!) } };
  },
  status: "verified",
  refs: [
    { inputs: { V: 230, I: 10, pf: 0.8 }, expect: { S: 2300, P: 1840, Q: 1380, phi: 36.86989764584 }, note: "3-4-5 triangle: sin φ = 0.6" },
    { inputs: { V: 120, I: 5, pf: 1 }, expect: { S: 600, P: 600, phi: 0 }, note: "Unity power factor" },
    { inputs: { V: 240, I: 20, pf: 0.9 }, expect: { S: 4800, P: 4320, Q: 2092.271492900 }, note: "4800·√0.19" },
    { inputs: { V: 230, I: 4.35, pf: 0.5 }, expect: { S: 1000.5, P: 500.25, Q: 866.4584164863, phi: 60 }, note: "cos 60° = 0.5" },
    { inputs: { V: 110, I: 15, pf: [70, "percent"] }, expect: { S: 1650, P: 1155, Q: 1178.33569071 }, note: "PF given as 70 %" },
  ],
});

const threePhase = def({
  id: "three-phase-power",
  name: "Three-phase balanced power",
  category: "electrical",
  description: "Power in a balanced three-phase load from line voltage, line current and power factor.",
  keywords: ["three phase power", "3 phase", "line voltage", "kw kva", "balanced load"],
  formula: ["S = √3·V_L·I_L", "P = S·PF", "Q = S·√(1 - PF²)", "V_phase (star) = V_L / √3"],
  assumptions: ["Balanced, symmetrical three-phase system", "Sinusoidal waveforms", "V_L is line-to-line, I_L is line current (star or delta)"],
  inputs: [inp("VL", "Line voltage", "voltage", "V", { symbol: "V_L", min: 0 }), inp("IL", "Line current", "current", "A", { symbol: "I_L", min: 0 }), inp("pf", "Power factor", "ratio", "fraction", { symbol: "PF", min: 0, max: 1 })],
  outputs: [
    out("S", "Apparent power", "apparentPower", "kVA", { symbol: "S" }),
    out("P", "Real power", "power", "kW", { symbol: "P" }),
    out("Q", "Reactive power", "reactivePower", "kvar", { symbol: "Q" }),
    out("Vph", "Phase voltage (star)", "voltage", "V", { symbol: "V_ph" }),
  ],
  compute: ({ VL, IL, pf }) => {
    const S = Math.sqrt(3) * VL! * IL!;
    return { values: { S, P: S * pf!, Q: S * Math.sqrt(1 - pf! * pf!), Vph: VL! / Math.sqrt(3) } };
  },
  status: "verified",
  refs: [
    { inputs: { VL: 400, IL: 10, pf: 0.85 }, expect: { S: 6.928203230276, P: 5.888972745734, Q: 3.649657518179, Vph: 230.9401076759 }, note: "√3·400·10 = 6928 VA" },
    { inputs: { VL: 415, IL: 100, pf: 0.9 }, expect: { S: 71.88010851411, P: 64.69209766270, Q: 31.33181290637 }, note: "√3·415·100" },
    { inputs: { VL: 480, IL: 50, pf: 0.8 }, expect: { S: 41.56921938165, P: 33.25537550532, Q: 24.94153162899 }, note: "√3·480·50, sin φ = 0.6" },
    { inputs: { VL: [11, "kV"], IL: 52.5, pf: 1 }, expect: { S: 1000.259341371, P: 1000.259341371, Vph: 6350.852961086 }, note: "About 1 MVA at 11 kV" },
    { inputs: { VL: 208, IL: 20, pf: 0.95 }, expect: { S: 7.205331359487, P: 6.845064791512, Q: 2.249863995890 }, note: "√3·208·20" },
  ],
});

const pfCorrection = def({
  id: "power-factor-correction",
  name: "Power-factor correction",
  category: "electrical",
  description: "Capacitor reactive power and capacitance to raise a load's power factor.",
  keywords: ["power factor correction", "pfc capacitor", "kvar", "capacitor bank"],
  formula: ["Q_c = P·(tan φ₁ - tan φ₂)", "1-phase: C = Q_c / (2πf·V²)", "3-phase delta: C per phase = Q_c / (3·2πf·V_L²)", "3-phase star: C per phase = Q_c / (2πf·V_L²)"],
  assumptions: ["Real power P stays the same", "Sinusoidal supply, no harmonics (harmonics can resonate with the capacitors)", "Both power factors lagging"],
  inputs: [
    inp("P", "Real power", "power", "kW", { symbol: "P", ...pos }),
    inp("pf1", "Present power factor", "ratio", "fraction", { symbol: "PF₁", min: 0, max: 1, exclusiveMin: true }),
    inp("pf2", "Target power factor", "ratio", "fraction", { symbol: "PF₂", min: 0, max: 1, exclusiveMin: true }),
    inp("V", "Voltage (line for 3-phase)", "voltage", "V", { symbol: "V", ...pos }),
    inp("f", "Frequency", "frequency", "Hz", { symbol: "f", ...pos, default: 50 }),
    inp("conn", "Connection", "dimensionless", undefined, { options: [{ value: 1, label: "Single-phase" }, { value: 3, label: "Three-phase, delta capacitors" }, { value: 4, label: "Three-phase, star capacitors" }], default: 1 }),
  ],
  outputs: [
    out("Qc", "Capacitor reactive power", "reactivePower", "kvar", { symbol: "Q_c" }),
    out("C", "Capacitance (per phase)", "capacitance", "uF", { symbol: "C" }),
    out("S1", "Apparent power before", "apparentPower", "kVA", { symbol: "S₁" }),
    out("S2", "Apparent power after", "apparentPower", "kVA", { symbol: "S₂" }),
  ],
  compute: ({ P, pf1, pf2, V, f, conn }) => {
    if (pf2! <= pf1!) fail("The target power factor must be higher than the present one.", "pf2");
    const Qc = P! * (Math.tan(Math.acos(pf1!)) - Math.tan(Math.acos(pf2!)));
    const w = 2 * Math.PI * f!;
    const C = conn === 3 ? Qc / (3 * w * V! * V!) : Qc / (w * V! * V!);
    const warnings = pf2! > 0.98 ? ["Correcting above about 0.98 risks a leading power factor when the load drops."] : [];
    return { values: { Qc, C, S1: P! / pf1!, S2: P! / pf2! }, warnings };
  },
  status: "verified",
  refs: [
    { inputs: { P: 10, pf1: 0.7, pf2: 0.95, V: 230, f: 50, conn: 1 }, expect: { Qc: 6.915199560415, C: 416.1013960329, S1: 14.28571428571, S2: 10.52631578947 }, note: "tan φ: 1.0202 → 0.3287" },
    { inputs: { P: 100, pf1: 0.8, pf2: 0.95, V: 400, f: 50, conn: 3 }, expect: { Qc: 42.13158948211, C: 279.3937802665, S1: 125 }, note: "0.75 - 0.3287 = 0.4213; delta at 400 V" },
    { inputs: { P: 100, pf1: 0.8, pf2: 0.95, V: 400, f: 50, conn: 4 }, expect: { C: 838.1813407996 }, note: "Star needs 3× the delta capacitance" },
    { inputs: { P: 50, pf1: 0.75, pf2: 1, V: 415, f: 50, conn: 3 }, expect: { Qc: 44.09585518441, C: 271.6629727571, S2: 50 }, note: "To unity: Q_c = P·tan φ₁" },
    { inputs: { P: 5, pf1: 0.6, pf2: 0.9, V: 120, f: 60, conn: 1 }, expect: { Qc: 4.245056142477, C: 781.9695240485 }, note: "tan φ: 1.3333 → 0.4843 at 60 Hz" },
  ],
});

const transformer = def({
  id: "transformer-ratio",
  name: "Transformer ratio",
  category: "electrical",
  description: "Turns ratio, secondary voltage and (optionally) secondary current of an ideal transformer.",
  keywords: ["transformer", "turns ratio", "primary secondary", "step down", "step up"],
  formula: ["a = N_p / N_s", "V_s = V_p / a", "I_s = I_p·a"],
  assumptions: ["Ideal transformer: no losses, no leakage, no magnetizing current", "No load regulation (voltage at no load)"],
  inputs: [
    inp("Np", "Primary turns", "count", undefined, { symbol: "N_p", ...pos }),
    inp("Ns", "Secondary turns", "count", undefined, { symbol: "N_s", ...pos }),
    inp("Vp", "Primary voltage (RMS)", "voltage", "V", { symbol: "V_p", min: 0 }),
    inp("Ip", "Primary current (RMS)", "current", "A", { symbol: "I_p", optional: true, min: 0 }),
  ],
  outputs: [out("a", "Turns ratio", "dimensionless", undefined, { symbol: "a" }), out("Vs", "Secondary voltage", "voltage", "V", { symbol: "V_s" }), out("Is", "Secondary current", "current", "A", { symbol: "I_s", optional: true })],
  compute: ({ Np, Ns, Vp, Ip }) => {
    const a = Np! / Ns!;
    const values: Record<string, number> = { a, Vs: Vp! / a };
    if (Ip !== undefined) values.Is = Ip * a;
    return { values };
  },
  status: "verified",
  refs: [
    { inputs: { Np: 1000, Ns: 100, Vp: 230 }, expect: { a: 10, Vs: 23 }, note: "10:1 step-down" },
    { inputs: { Np: 500, Ns: 1000, Vp: 120, Ip: 2 }, expect: { a: 0.5, Vs: 240, Is: 1 }, note: "1:2 step-up halves the current" },
    { inputs: { Np: 2750, Ns: 100, Vp: 11000 }, expect: { a: 27.5, Vs: 400 }, note: "11 kV / 27.5 = 400 V" },
    { inputs: { Np: 100, Ns: 12, Vp: 240, Ip: 0.5 }, expect: { a: 8.333333333333, Vs: 28.8, Is: 4.166666666667 }, note: "240·12/100 = 28.8 V" },
    { inputs: { Np: 1, Ns: 1, Vp: 50 }, expect: { a: 1, Vs: 50 }, note: "1:1 isolation transformer" },
  ],
});

const cableDrop = def({
  id: "dc-cable-voltage-drop",
  name: "DC cable voltage drop",
  category: "electrical",
  description: "Voltage drop and power loss in a two-wire DC cable run.",
  keywords: ["voltage drop", "cable drop", "wire size", "dc cable", "conductor resistance"],
  formula: ["R = ρ·(2L) / A", "ΔV = I·R", "ΔV% = 100·ΔV / V", "P_loss = I²·R"],
  assumptions: [
    "Two conductors (out and back), each of length L",
    "Resistivity at 20 °C: copper 0.01724 Ω·mm²/m (IACS annealed), aluminium 0.0282; it rises about 0.4 %/K",
    "DC, so no skin effect or reactance",
  ],
  inputs: [
    inp("I", "Current", "current", "A", { symbol: "I", ...nonneg }),
    inp("L", "One-way length", "length", "m", { symbol: "L", ...pos }),
    inp("A", "Conductor cross-section", "area", "mm2", { symbol: "A", ...pos }),
    inp("rho", "Resistivity", "resistivity", "ohm·mm2/m", { symbol: "ρ", ...pos, default: 0.01724 }),
    inp("V", "Supply voltage", "voltage", "V", { symbol: "V", ...pos }),
  ],
  outputs: [
    out("R", "Loop resistance", "resistance", "ohm", { symbol: "R" }),
    out("dV", "Voltage drop", "voltage", "V", { symbol: "ΔV" }),
    out("pct", "Voltage drop", "ratio", "percent", { symbol: "ΔV%" }),
    out("Vload", "Voltage at the load", "voltage", "V", { symbol: "V_load" }),
    out("Ploss", "Power lost in the cable", "power", "W", { symbol: "P_loss" }),
  ],
  compute: ({ I, L, A, rho, V }) => {
    const R = (rho! * 2 * L!) / A!;
    const dV = I! * R;
    const pct = dV / V!;
    const warnings: string[] = [];
    if (pct > 1) fail("The drop is larger than the supply voltage: the cable can't carry this current.");
    if (pct > 0.03) warnings.push("More than 3 % drop: many codes and equipment makers recommend 3 % or less.");
    return { values: { R, dV, pct, Vload: V! - dV, Ploss: I! * I! * R }, warnings };
  },
  status: "verified",
  refs: [
    { inputs: { I: 10, L: 20, A: 2.5, rho: 0.01724, V: 24 }, expect: { R: 0.27584, dV: 2.7584, pct: 11.49333333333, Ploss: 27.584 }, note: "0.01724·40/2.5 = 0.27584 Ω" },
    { inputs: { I: 5, L: 10, A: 1.5, rho: 0.01724, V: 12 }, expect: { R: 0.2298666666667, dV: 1.149333333333, pct: 9.577777777778 }, note: "0.01724·20/1.5" },
    { inputs: { I: 50, L: 30, A: 16, rho: 0.01724, V: 48 }, expect: { R: 0.06465, dV: 3.2325, pct: 6.734375, Ploss: 161.625 }, note: "0.01724·60/16" },
    { inputs: { I: 20, L: 50, A: 25, rho: 0.0282, V: 230 }, expect: { R: 0.1128, dV: 2.256, pct: 0.9808695652174, Ploss: 45.12 }, note: "Aluminium, 100 m loop" },
    { inputs: { I: 1, L: 100, A: 0.5, rho: 0.01724, V: 12 }, expect: { R: 6.896, dV: 6.896, Vload: 5.104 }, note: "Thin long run: 57 % drop" },
  ],
});

const rc = def({
  id: "rc-time-constant",
  name: "RC time constant",
  category: "electronics",
  description: "Time constant and cut-off frequency of an RC circuit, and how far it has charged after a time.",
  keywords: ["rc time constant", "tau", "rc filter cutoff", "capacitor charging"],
  formula: ["τ = R·C", "f_c = 1 / (2π·R·C)", "Charged fraction after t: 1 - e^(-t/τ)"],
  assumptions: ["Step input from an ideal source", "Ideal capacitor (no leakage, no ESR)", "Capacitor starts empty"],
  inputs: [inp("R", "Resistance", "resistance", "kohm", { symbol: "R", ...pos }), inp("C", "Capacitance", "capacitance", "uF", { symbol: "C", ...pos }), inp("t", "Time", "time", "ms", { symbol: "t", optional: true, ...nonneg })],
  outputs: [
    out("tau", "Time constant", "time", "ms", { symbol: "τ" }),
    out("fc", "Cut-off frequency (−3 dB)", "frequency", "Hz", { symbol: "f_c" }),
    out("t5", "Time to 99.3 % (5τ)", "time", "ms", { symbol: "5τ" }),
    out("charged", "Charged after t", "ratio", "percent", { optional: true }),
  ],
  compute: ({ R, C, t }) => {
    const tau = R! * C!;
    const values: Record<string, number> = { tau, fc: 1 / (2 * Math.PI * tau), t5: 5 * tau };
    if (t !== undefined) values.charged = 1 - Math.exp(-t / tau);
    return { values };
  },
  status: "verified",
  refs: [
    { inputs: { R: 10, C: 100 }, expect: { tau: 1000, fc: 0.1591549430919, t5: 5000 }, note: "10 kΩ·100 µF = 1 s" },
    { inputs: { R: 1, C: 1 }, expect: { tau: 1, fc: 159.1549430919 }, note: "1 kΩ·1 µF = 1 ms" },
    { inputs: { R: 4.7, C: [10, "nF"] }, expect: { tau: 0.047, fc: 3386.275384934 }, note: "4.7 kΩ·10 nF = 47 µs" },
    { inputs: { R: 1, C: 1, t: 1 }, expect: { charged: 63.21205588286 }, note: "After one τ: 1 - 1/e" },
    { inputs: { R: 100, C: 10, t: [2, "s"] }, expect: { tau: 1000, charged: 86.46647167634 }, note: "After 2τ: 1 - e⁻²" },
  ],
});

const capacitors = def({
  id: "capacitors-series-parallel",
  name: "Capacitors in series and parallel",
  category: "electronics",
  description: "Total capacitance of capacitors in parallel and in series.",
  keywords: ["series capacitance", "parallel capacitance", "equivalent capacitance"],
  formula: ["Parallel: Cₚ = C₁ + C₂ + …", "Series: 1/Cₛ = 1/C₁ + 1/C₂ + …"],
  assumptions: ["Ideal capacitors", "In series, voltage shares in inverse proportion to capacitance (leakage ignored)"],
  inputs: [inp("C", "Capacitances", "capacitance", "uF", { list: true, ...pos })],
  outputs: [out("parallel", "Parallel total", "capacitance", "uF", { symbol: "Cₚ" }), out("series", "Series total", "capacitance", "uF", { symbol: "Cₛ" })],
  compute: ({ lists }) => {
    const C = lists.C!;
    return { values: { parallel: C.reduce((a, b) => a + b, 0), series: 1 / C.reduce((a, b) => a + 1 / b, 0) } };
  },
  status: "verified",
  refs: [
    { inputs: { C: [10, 10] }, expect: { parallel: 20, series: 5 }, note: "Equal pair" },
    { inputs: { C: [1, 2.2, 4.7] }, expect: { parallel: 7.9, series: 0.5997679814385 }, note: "1/(1 + 1/2.2 + 1/4.7)" },
    { inputs: { C: [100] }, expect: { parallel: 100, series: 100 }, note: "One capacitor" },
    { inputs: { C: [22, 47] }, expect: { parallel: 69, series: 14.98550724638 }, note: "22·47/69" },
    { inputs: { C: [0.1, 0.1, 0.1] }, expect: { parallel: 0.3, series: 0.03333333333333 }, note: "Three 100 nF" },
  ],
});

const reactance = def({
  id: "reactance",
  name: "Inductive and capacitive reactance",
  category: "electronics",
  description: "Reactance of an inductor and/or a capacitor at a frequency, and their resonant frequency.",
  keywords: ["reactance", "xl", "xc", "inductive reactance", "capacitive reactance", "resonance"],
  formula: ["X_L = 2π·f·L", "X_C = 1 / (2π·f·C)", "f₀ = 1 / (2π·√(L·C))"],
  assumptions: ["Ideal L and C (no resistance, no self-resonance)", "Sinusoidal signal"],
  inputs: [inp("f", "Frequency", "frequency", "Hz", { symbol: "f", ...pos }), inp("L", "Inductance", "inductance", "mH", { symbol: "L", optional: true, ...pos }), inp("C", "Capacitance", "capacitance", "uF", { symbol: "C", optional: true, ...pos })],
  outputs: [
    out("XL", "Inductive reactance", "resistance", "ohm", { symbol: "X_L", optional: true }),
    out("XC", "Capacitive reactance", "resistance", "ohm", { symbol: "X_C", optional: true }),
    out("f0", "Resonant frequency", "frequency", "Hz", { symbol: "f₀", optional: true }),
  ],
  compute: ({ f, L, C }) => {
    if (L === undefined && C === undefined) fail("Enter an inductance, a capacitance, or both.");
    const values: Record<string, number> = {};
    if (L !== undefined) values.XL = 2 * Math.PI * f! * L;
    if (C !== undefined) values.XC = 1 / (2 * Math.PI * f! * C);
    if (L !== undefined && C !== undefined) values.f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    return { values };
  },
  status: "verified",
  refs: [
    { inputs: { f: 50, L: 100 }, expect: { XL: 31.41592653590 }, note: "2π·50·0.1" },
    { inputs: { f: [1, "kHz"], C: 1 }, expect: { XC: 159.1549430919 }, note: "1/(2π·1000·1e-6)" },
    { inputs: { f: 60, L: 10, C: 100 }, expect: { XL: 3.769911184308, XC: 26.52582384865, f0: 159.1549430919 }, note: "√(LC) = 1 ms" },
    { inputs: { f: [1, "MHz"], L: [10, "uH"] }, expect: { XL: 62.83185307180 }, note: "2π·1e6·1e-5" },
    { inputs: { f: [10, "kHz"], C: [10, "nF"] }, expect: { XC: 1591.549430919 }, note: "1/(2π·1e4·1e-8)" },
  ],
});

const led = def({
  id: "led-resistor",
  name: "LED series resistor",
  category: "electronics",
  description: "Current-limiting resistor for one LED or a string of LEDs in series.",
  keywords: ["led resistor", "current limiting resistor", "led series"],
  formula: ["R = (V_s - n·V_f) / I_f", "P_R = I_f²·R"],
  assumptions: ["V_f is the LED's forward voltage at I_f (from its datasheet)", "Constant supply voltage", "The next E24 value up keeps the current at or below I_f"],
  inputs: [
    inp("Vs", "Supply voltage", "voltage", "V", { symbol: "V_s", ...pos }),
    inp("Vf", "LED forward voltage", "voltage", "V", { symbol: "V_f", ...pos }),
    inp("If", "LED current", "current", "mA", { symbol: "I_f", ...pos }),
    inp("n", "LEDs in series", "count", undefined, { symbol: "n", min: 1, integer: true, default: 1 }),
  ],
  outputs: [
    out("R", "Resistor", "resistance", "ohm", { symbol: "R" }),
    out("P", "Resistor power", "power", "W", { symbol: "P_R" }),
    out("Rstd", "Next E24 value", "resistance", "ohm", { symbol: "R_E24" }),
    out("Istd", "Current with the E24 value", "current", "mA", { symbol: "I" }),
  ],
  compute: ({ Vs, Vf, If, n }) => {
    const head = Vs! - n! * Vf!;
    if (head <= 0) fail("The supply must be higher than the LEDs' total forward voltage.", "Vs");
    const R = head / If!;
    const Rstd = nextStandard(R);
    const warnings = head < 0.1 * Vs! ? ["Little voltage is left for the resistor, so the current will vary a lot with V_f."] : [];
    return { values: { R, P: If! * If! * R, Rstd, Istd: head / Rstd }, warnings };
  },
  status: "verified",
  refs: [
    { inputs: { Vs: 5, Vf: 2, If: 20, n: 1 }, expect: { R: 150, P: 0.06, Rstd: 150 }, note: "3 V/20 mA" },
    { inputs: { Vs: 12, Vf: 3.2, If: 20, n: 3 }, expect: { R: 120, P: 0.048, Rstd: 120 }, note: "(12 - 9.6)/0.02" },
    { inputs: { Vs: 9, Vf: 2.1, If: 15, n: 1 }, expect: { R: 460, P: 0.1035, Rstd: 470, Istd: 14.68085106383 }, note: "6.9/0.015 = 460 → 470 Ω" },
    { inputs: { Vs: 3.3, Vf: 1.8, If: 10, n: 1 }, expect: { R: 150, P: 0.015 }, note: "1.5 V/10 mA" },
    { inputs: { Vs: 24, Vf: 3, If: 350, n: 6 }, expect: { R: 17.14285714286, P: 2.1, Rstd: 18 }, note: "6 V/0.35 A; 0.35²·17.14 = 2.1 W" },
  ],
});

const duty = (label = "Duty cycle") => inp("D", label, "ratio", "fraction", { symbol: "D", min: 0, max: 1 });

const buck = def({
  id: "buck-ideal",
  name: "Buck converter (ideal)",
  category: "power-electronics",
  description: "Output voltage of an ideal buck (step-down) converter in continuous conduction.",
  keywords: ["buck", "step down converter", "buck converter output", "duty cycle"],
  formula: ["V_out = D·V_in", "I_in = D·I_out (lossless)"],
  assumptions: ["Ideal continuous-conduction mode (CCM): the inductor current never reaches zero", "Lossless switch, diode and inductor (100 % efficiency)", "Steady state; not a hardware result"],
  inputs: [inp("Vin", "Input voltage", "voltage", "V", { symbol: "V_in", ...pos }), duty(), inp("Iout", "Output current", "current", "A", { symbol: "I_out", optional: true, ...nonneg })],
  outputs: [out("Vout", "Output voltage", "voltage", "V", { symbol: "V_out" }), out("Iin", "Input current", "current", "A", { symbol: "I_in", optional: true })],
  compute: ({ Vin, D, Iout }) => {
    const values: Record<string, number> = { Vout: D! * Vin! };
    if (Iout !== undefined) values.Iin = D! * Iout;
    return { values };
  },
  status: "verified",
  refs: [
    { inputs: { Vin: 48, D: 0.4 }, expect: { Vout: 19.2 }, note: "0.4·48" },
    { inputs: { Vin: 12, D: 0.5, Iout: 2 }, expect: { Vout: 6, Iin: 1 }, note: "Power in = power out: 12·1 = 6·2" },
    { inputs: { Vin: 24, D: 0.1375 }, expect: { Vout: 3.3 }, note: "3.3/24 = 0.1375" },
    { inputs: { Vin: 5, D: [66, "percent"] }, expect: { Vout: 3.3 }, note: "Duty as 66 %" },
    { inputs: { Vin: 400, D: 0.3, Iout: 10 }, expect: { Vout: 120, Iin: 3 }, note: "0.3·400; 0.3·10" },
  ],
});

const boost = def({
  id: "boost-ideal",
  name: "Boost converter (ideal)",
  category: "power-electronics",
  description: "Output voltage of an ideal boost (step-up) converter in continuous conduction.",
  keywords: ["boost", "step up converter", "boost converter output"],
  formula: ["V_out = V_in / (1 - D)", "I_in = I_out / (1 - D) (lossless)"],
  assumptions: ["Ideal continuous-conduction mode (CCM)", "Lossless parts; real converters fall well short of the ideal gain above D ≈ 0.8", "Steady state"],
  inputs: [inp("Vin", "Input voltage", "voltage", "V", { symbol: "V_in", ...pos }), inp("D", "Duty cycle", "ratio", "fraction", { symbol: "D", min: 0, max: 1, exclusiveMax: true }), inp("Iout", "Output current", "current", "A", { symbol: "I_out", optional: true, ...nonneg })],
  outputs: [out("Vout", "Output voltage", "voltage", "V", { symbol: "V_out" }), out("Iin", "Input current", "current", "A", { symbol: "I_in", optional: true })],
  compute: ({ Vin, D, Iout }) => {
    const k = 1 / (1 - D!);
    const values: Record<string, number> = { Vout: Vin! * k };
    if (Iout !== undefined) values.Iin = Iout * k;
    return { values, warnings: D! > 0.85 ? ["Above D ≈ 0.85 losses dominate: a real boost won't reach this voltage."] : [] };
  },
  status: "verified",
  refs: [
    { inputs: { Vin: 12, D: 0.5 }, expect: { Vout: 24 }, note: "12/(1 - 0.5)" },
    { inputs: { Vin: 5, D: 0.6 }, expect: { Vout: 12.5 }, note: "5/0.4" },
    { inputs: { Vin: 3.7, D: 0.26 }, expect: { Vout: 5 }, note: "3.7/0.74" },
    { inputs: { Vin: 24, D: 0.75, Iout: 1 }, expect: { Vout: 96, Iin: 4 }, note: "Gain 4" },
    { inputs: { Vin: 48, D: 0.2 }, expect: { Vout: 60 }, note: "48/0.8" },
  ],
});

const buckBoost = def({
  id: "buck-boost-inverting",
  name: "Inverting buck-boost (ideal)",
  category: "power-electronics",
  description: "Output voltage of an ideal inverting buck-boost converter in continuous conduction.",
  keywords: ["buck boost", "inverting converter", "negative voltage converter"],
  formula: ["V_out = -V_in·D / (1 - D)"],
  assumptions: ["Ideal continuous-conduction mode (CCM)", "Lossless parts", "Output is negative with respect to the input's ground"],
  inputs: [inp("Vin", "Input voltage", "voltage", "V", { symbol: "V_in", ...pos }), inp("D", "Duty cycle", "ratio", "fraction", { symbol: "D", min: 0, max: 1, exclusiveMax: true })],
  outputs: [out("Vout", "Output voltage", "voltage", "V", { symbol: "V_out" })],
  compute: ({ Vin, D }) => ({ values: { Vout: (-Vin! * D!) / (1 - D!) }, warnings: D! > 0.85 ? ["Above D ≈ 0.85 a real converter won't reach this voltage."] : [] }),
  status: "verified",
  refs: [
    { inputs: { Vin: 12, D: 0.5 }, expect: { Vout: -12 }, note: "D = 0.5 inverts at unity gain" },
    { inputs: { Vin: 12, D: 0.6 }, expect: { Vout: -18 }, note: "-12·0.6/0.4" },
    { inputs: { Vin: 24, D: 0.333333333333333 }, expect: { Vout: -12 }, note: "D = 1/3: gain 0.5" },
    { inputs: { Vin: 5, D: 0.25 }, expect: { Vout: -1.666666666667 }, note: "-5·0.25/0.75" },
    { inputs: { Vin: 48, D: 0.8 }, expect: { Vout: -192 }, note: "-48·0.8/0.2" },
  ],
});

const ripple = def({
  id: "buck-inductor-ripple",
  name: "Buck inductor ripple current",
  category: "power-electronics",
  description: "Peak-to-peak inductor ripple in an ideal buck converter, and the peak current.",
  keywords: ["inductor ripple", "buck inductor", "ripple current", "inductor selection"],
  formula: ["D = V_out / V_in", "ΔI_L = (V_in - V_out)·D / (f_sw·L)", "I_peak = I_out + ΔI_L / 2"],
  assumptions: ["Ideal buck in continuous-conduction mode", "Lossless switch and diode", "Inductance constant (no saturation)"],
  inputs: [
    inp("Vin", "Input voltage", "voltage", "V", { symbol: "V_in", ...pos }),
    inp("Vout", "Output voltage", "voltage", "V", { symbol: "V_out", ...pos }),
    inp("fsw", "Switching frequency", "frequency", "kHz", { symbol: "f_sw", ...pos }),
    inp("L", "Inductance", "inductance", "uH", { symbol: "L", ...pos }),
    inp("Iout", "Output current", "current", "A", { symbol: "I_out", optional: true, ...nonneg }),
  ],
  outputs: [out("D", "Duty cycle", "ratio", "fraction", { symbol: "D" }), out("dI", "Ripple (peak to peak)", "current", "A", { symbol: "ΔI_L" }), out("Ipk", "Peak inductor current", "current", "A", { symbol: "I_peak", optional: true })],
  compute: ({ Vin, Vout, fsw, L, Iout }) => {
    if (Vout! >= Vin!) fail("A buck's output must be lower than its input.", "Vout");
    const D = Vout! / Vin!;
    const dI = ((Vin! - Vout!) * D) / (fsw! * L!);
    const values: Record<string, number> = { D, dI };
    const warnings: string[] = [];
    if (Iout !== undefined) {
      values.Ipk = Iout + dI / 2;
      if (Iout < dI / 2) warnings.push("I_out is below half the ripple: the converter runs in discontinuous mode (DCM) and these formulas don't hold.");
    }
    return { values, warnings };
  },
  status: "verified",
  refs: [
    { inputs: { Vin: 12, Vout: 5, fsw: 100, L: 22 }, expect: { D: 0.4166666666667, dI: 1.325757575758 }, note: "7·(5/12)/(1e5·22e-6)" },
    { inputs: { Vin: 48, Vout: 12, fsw: 200, L: 47 }, expect: { D: 0.25, dI: 0.9574468085106 }, note: "36·0.25/9.4" },
    { inputs: { Vin: 24, Vout: 3.3, fsw: 500, L: 4.7 }, expect: { D: 0.1375, dI: 1.211170212766 }, note: "20.7·0.1375/2.35" },
    { inputs: { Vin: 5, Vout: 1.8, fsw: [1, "MHz"], L: 1, Iout: 3 }, expect: { D: 0.36, dI: 1.152, Ipk: 3.576 }, note: "3.2·0.36/1; 3 + 0.576" },
    { inputs: { Vin: 400, Vout: 48, fsw: 50, L: 330 }, expect: { D: 0.12, dI: 2.56 }, note: "352·0.12/16.5" },
  ],
});

const torque = def({
  id: "torque-speed-power",
  name: "Torque, speed and power",
  category: "mechanical",
  description: "Any two of torque, rotational speed and shaft power give the third.",
  keywords: ["torque", "rpm", "shaft power", "motor torque", "kw to nm"],
  formula: ["P = T·ω", "ω = 2π·n / 60 (n in rpm)"],
  assumptions: ["Steady rotation", "Shaft power (mechanical), not electrical input power"],
  inputs: [
    inp("T", "Torque", "torque", "N·m", { symbol: "T", optional: true, ...nonneg }),
    inp("n", "Speed", "angularSpeed", "rpm", { symbol: "n", optional: true, ...nonneg }),
    inp("P", "Power", "power", "kW", { symbol: "P", optional: true, ...nonneg }),
  ],
  outputs: [out("T", "Torque", "torque", "N·m", { symbol: "T" }), out("n", "Speed", "angularSpeed", "rpm", { symbol: "n" }), out("P", "Power", "power", "kW", { symbol: "P" })],
  pick: { count: 2, keys: ["T", "n", "P"] },
  compute: ({ T, n, P }) => {
    if (T !== undefined && n !== undefined) return { values: { T, n, P: T * n } };
    if (P !== undefined && n !== undefined) return { values: { P, n, T: P / nonZero(n, "Speed", "n") } };
    return { values: { P: P!, T: T!, n: P! / nonZero(T!, "Torque", "T") } };
  },
  status: "verified",
  refs: [
    { inputs: { T: 100, n: 1500 }, expect: { P: 15.70796326795 }, note: "100·157.08 rad/s" },
    { inputs: { P: 7.5, n: 1450 }, expect: { T: 49.39291337335 }, note: "7500/(1450·2π/60)" },
    { inputs: { P: 1, T: 10 }, expect: { n: 954.9296585514 }, note: "ω = 100 rad/s" },
    { inputs: { T: 50, n: 3000 }, expect: { P: 15.70796326795 }, note: "Half the torque at twice the speed" },
    { inputs: { P: [1, "hp"], n: 1750 }, expect: { T: 4.069090992868 }, note: "1 hp = 745.70 W at 1750 rpm" },
  ],
});

const stress = def({
  id: "axial-stress",
  name: "Normal axial stress",
  category: "mechanical",
  description: "Normal stress in a bar under an axial load, and the safety factor against yield.",
  keywords: ["stress", "axial stress", "normal stress", "tensile stress", "safety factor"],
  formula: ["σ = F / A", "SF = σ_y / |σ|"],
  assumptions: ["Load along the bar's axis, spread evenly over the section", "Away from holes, notches and load points (no stress concentration)", "Compression: no buckling check (see column buckling)"],
  inputs: [
    inp("F", "Axial force (− for compression)", "force", "kN", { symbol: "F" }),
    inp("A", "Cross-section area", "area", "mm2", { symbol: "A", ...pos }),
    inp("Sy", "Yield strength", "pressure", "MPa", { symbol: "σ_y", optional: true, ...pos }),
  ],
  outputs: [out("sigma", "Normal stress", "pressure", "MPa", { symbol: "σ" }), out("SF", "Safety factor", "dimensionless", undefined, { symbol: "SF", optional: true })],
  compute: ({ F, A, Sy }) => {
    const sigma = F! / A!;
    const values: Record<string, number> = { sigma };
    const warnings: string[] = [];
    if (Sy !== undefined && sigma !== 0) {
      values.SF = Sy / Math.abs(sigma);
      if (values.SF < 1) warnings.push("The stress is above the yield strength: the bar yields.");
    }
    return { values, warnings };
  },
  status: "verified",
  refs: [
    { inputs: { F: 10, A: 100 }, expect: { sigma: 100 }, note: "10 000 N/100 mm²" },
    { inputs: { F: 50, A: 250, Sy: 250 }, expect: { sigma: 200, SF: 1.25 }, note: "250/200" },
    { inputs: { F: 1, A: 78.54 }, expect: { sigma: 12.73236567354 }, note: "10 mm round bar" },
    { inputs: { F: -200, A: 2000, Sy: 355 }, expect: { sigma: -100, SF: 3.55 }, note: "Compression, S355 steel" },
    { inputs: { F: 0.5, A: 12.5 }, expect: { sigma: 40 }, note: "500/12.5" },
  ],
});

const expansion = def({
  id: "thermal-expansion",
  name: "Linear thermal expansion",
  category: "mechanical",
  description: "Change in length of a part with temperature.",
  keywords: ["thermal expansion", "linear expansion", "coefficient of expansion"],
  formula: ["ΔL = α·L₀·ΔT", "L = L₀ + ΔL"],
  assumptions: ["α constant over the temperature range", "Free to expand (no restraint, so no thermal stress)", "Typical α (10⁻⁶/K): steel 12, aluminium 23, copper 17, concrete 10"],
  inputs: [
    inp("alpha", "Expansion coefficient", "expansionCoeff", "ppm/K", { symbol: "α" }),
    inp("L0", "Original length", "length", "m", { symbol: "L₀", ...pos }),
    inp("dT", "Temperature change", "temperatureDelta", "dK", { symbol: "ΔT" }),
  ],
  outputs: [out("dL", "Change in length", "length", "mm", { symbol: "ΔL" }), out("L", "New length", "length", "m", { symbol: "L" })],
  compute: ({ alpha, L0, dT }) => {
    const dL = alpha! * L0! * dT!;
    // A part can't shrink to nothing or less: that's an α or ΔT nobody meant.
    if (L0! + dL <= 0) fail("The length after the change would be zero or less: check α and ΔT.", "alpha");
    // Solids and liquids sit well inside ±500 ppm/K.
    const warnings = Math.abs(alpha!) > 5e-4 ? ["α is far outside common materials (they stay within ±500 ppm/K): check its unit."] : [];
    return { values: { dL, L: L0! + dL }, warnings };
  },
  status: "verified",
  refs: [
    { inputs: { alpha: 12, L0: 10, dT: 50 }, expect: { dL: 6, L: 10.006 }, note: "12e-6·10·50 = 6 mm" },
    { inputs: { alpha: 23, L0: 2, dT: 100 }, expect: { dL: 4.6, L: 2.0046 }, note: "Aluminium" },
    { inputs: { alpha: 17, L0: 1, dT: -40 }, expect: { dL: -0.68, L: 0.99932 }, note: "Copper cooled 40 K" },
    { inputs: { alpha: 12, L0: 100, dT: 30 }, expect: { dL: 36 }, note: "100 m steel rail" },
    { inputs: { alpha: 10, L0: 30, dT: [45, "dF"] }, expect: { dL: 7.5 }, note: "45 °F = 25 K" },
  ],
});

export const CORE: CalculatorDef[] = [
  ohmsLaw,
  dcPower,
  resistors,
  divider,
  singlePhase,
  threePhase,
  pfCorrection,
  transformer,
  cableDrop,
  rc,
  capacitors,
  reactance,
  led,
  buck,
  boost,
  buckBoost,
  ripple,
  torque,
  stress,
  expansion,
];

