/** Electronics, electrical power and power electronics beyond the release twenty (beta). */
import type { CalculatorDef } from "../registry";
import { def, fail, inp, nonneg, out, pos } from "./helpers";

const MU0 = 1.25663706212e-6;
const C0 = 299792458;

export const ELECTRICAL: CalculatorDef[] = [
  def({
    id: "inductors-series-parallel",
    name: "Inductors in series and parallel",
    category: "electronics",
    description: "Total inductance of inductors in series and in parallel.",
    formula: ["Series: Lₛ = L₁ + L₂ + …", "Parallel: 1/Lₚ = 1/L₁ + 1/L₂ + …"],
    assumptions: ["No mutual coupling between the inductors"],
    inputs: [inp("L", "Inductances", "inductance", "uH", { list: true, ...pos })],
    outputs: [out("series", "Series total", "inductance", "uH"), out("parallel", "Parallel total", "inductance", "uH")],
    compute: ({ lists }) => ({ values: { series: lists.L!.reduce((a, b) => a + b, 0), parallel: 1 / lists.L!.reduce((a, b) => a + 1 / b, 0) } }),
    refs: [
      { inputs: { L: [10, 10] }, expect: { series: 20, parallel: 5 }, note: "Equal pair" },
      { inputs: { L: [100, 220] }, expect: { series: 320, parallel: 68.75 }, note: "100·220/320" },
    ],
  }),
  def({
    id: "rl-time-constant",
    name: "RL time constant",
    category: "electronics",
    description: "Time constant and cut-off frequency of an RL circuit.",
    formula: ["τ = L / R", "f_c = R / (2π·L)"],
    assumptions: ["Ideal inductor (no core saturation, no winding resistance beyond R)"],
    inputs: [inp("L", "Inductance", "inductance", "mH", { symbol: "L", ...pos }), inp("R", "Resistance", "resistance", "ohm", { symbol: "R", ...pos })],
    outputs: [out("tau", "Time constant", "time", "ms", { symbol: "τ" }), out("fc", "Cut-off frequency", "frequency", "Hz", { symbol: "f_c" })],
    compute: ({ L, R }) => ({ values: { tau: L! / R!, fc: R! / (2 * Math.PI * L!) } }),
    refs: [
      { inputs: { L: 100, R: 10 }, expect: { tau: 10, fc: 15.91549430919 }, note: "0.1/10 = 10 ms" },
      { inputs: { L: 1, R: 1000 }, expect: { tau: 0.001, fc: 159154.9430919 }, note: "1 mH/1 kΩ = 1 µs" },
    ],
  }),
  def({
    id: "rlc-series-resonance",
    name: "Series RLC resonance",
    category: "electronics",
    description: "Resonant frequency, quality factor and bandwidth of a series RLC circuit.",
    formula: ["f₀ = 1 / (2π·√(L·C))", "Q = (1/R)·√(L/C)", "BW = f₀ / Q"],
    assumptions: ["Ideal components; R is all the series resistance (including the inductor's)"],
    inputs: [inp("R", "Resistance", "resistance", "ohm", { symbol: "R", ...pos }), inp("L", "Inductance", "inductance", "mH", { symbol: "L", ...pos }), inp("C", "Capacitance", "capacitance", "uF", { symbol: "C", ...pos })],
    outputs: [out("f0", "Resonant frequency", "frequency", "Hz", { symbol: "f₀" }), out("Q", "Quality factor", "dimensionless", undefined, { symbol: "Q" }), out("BW", "Bandwidth (−3 dB)", "frequency", "Hz", { symbol: "BW" })],
    compute: ({ R, L, C }) => {
      const f0 = 1 / (2 * Math.PI * Math.sqrt(L! * C!));
      const Q = Math.sqrt(L! / C!) / R!;
      return { values: { f0, Q, BW: f0 / Q } };
    },
    refs: [
      { inputs: { R: 10, L: 1, C: 1 }, expect: { f0: 5032.921210449, Q: 3.162277660168, BW: 1591.549430919 }, note: "√(1e-3/1e-6)/10" },
      { inputs: { R: 1, L: 10, C: 10000 }, expect: { f0: 15.91549430919, Q: 1 }, note: "√(10 mH/10 mF) = 1 Ω" },
    ],
  }),
  def({
    id: "series-rlc-impedance",
    name: "Series RLC impedance",
    category: "electronics",
    description: "Impedance magnitude and phase of R, L and C in series at a frequency.",
    formula: ["X = 2πfL - 1/(2πfC)", "|Z| = √(R² + X²)", "φ = atan(X / R)"],
    assumptions: ["Ideal components", "Sinusoidal steady state"],
    inputs: [
      inp("f", "Frequency", "frequency", "Hz", { ...pos }),
      inp("R", "Resistance", "resistance", "ohm", { ...nonneg }),
      inp("L", "Inductance", "inductance", "mH", { ...nonneg }),
      inp("C", "Capacitance", "capacitance", "uF", { optional: true, ...pos }),
    ],
    outputs: [out("X", "Net reactance", "resistance", "ohm", { symbol: "X" }), out("Z", "Impedance", "resistance", "ohm", { symbol: "|Z|" }), out("phi", "Phase angle", "angle", "deg", { symbol: "φ" })],
    compute: ({ f, R, L, C }) => {
      const w = 2 * Math.PI * f!;
      const X = w * L! - (C !== undefined ? 1 / (w * C) : 0);
      return { values: { X, Z: Math.hypot(R!, X), phi: Math.atan2(X, R!) } };
    },
    refs: [
      { inputs: { f: 1000, R: 100, L: 10, C: 1 }, expect: { Z: 138.8457333555, phi: -43.92704013466 }, note: "X = 62.83 - 159.15 = -96.32 Ω" },
      { inputs: { f: 50, R: 30, L: 127.3239544735 }, expect: { Z: 50, phi: 53.13010235416 }, note: "X_L = 40 Ω: 3-4-5" },
    ],
  }),
  def({
    id: "decibel-power",
    name: "Decibels (power ratio)",
    category: "electronics",
    description: "Gain or loss in dB from two powers.",
    formula: ["G = 10·log₁₀(P₂ / P₁)"],
    assumptions: ["Both powers in the same impedance"],
    inputs: [inp("P1", "Reference power", "power", "W", { ...pos }), inp("P2", "Measured power", "power", "W", { ...pos })],
    outputs: [out("dB", "Gain", "dimensionless", undefined, { symbol: "dB" }), out("ratio", "Power ratio", "dimensionless", undefined)],
    compute: ({ P1, P2 }) => ({ values: { dB: 10 * Math.log10(P2! / P1!), ratio: P2! / P1! } }),
    refs: [
      { inputs: { P1: 1, P2: 2 }, expect: { dB: 3.010299956640 }, note: "Doubling: +3.01 dB" },
      { inputs: { P1: 100, P2: 1 }, expect: { dB: -20, ratio: 0.01 }, note: "1/100: -20 dB" },
    ],
  }),
  def({
    id: "decibel-voltage",
    name: "Decibels (voltage ratio)",
    category: "electronics",
    description: "Gain or loss in dB from two voltages (or currents).",
    formula: ["G = 20·log₁₀(V₂ / V₁)"],
    assumptions: ["Both voltages across the same impedance (otherwise it isn't a power gain)"],
    inputs: [inp("V1", "Reference voltage", "voltage", "V", { ...pos }), inp("V2", "Measured voltage", "voltage", "V", { ...pos })],
    outputs: [out("dB", "Gain", "dimensionless", undefined, { symbol: "dB" })],
    compute: ({ V1, V2 }) => ({ values: { dB: 20 * Math.log10(V2! / V1!) } }),
    refs: [
      { inputs: { V1: 1, V2: 10 }, expect: { dB: 20 }, note: "×10 voltage = 20 dB" },
      { inputs: { V1: 1, V2: 0.5 }, expect: { dB: -6.020599913280 }, note: "Half voltage" },
    ],
  }),
  def({
    id: "dbm-watts",
    name: "dBm and watts",
    category: "electronics",
    description: "Power level in dBm and dBW from watts.",
    formula: ["dBm = 10·log₁₀(P / 1 mW)", "dBW = dBm - 30"],
    assumptions: ["Power, not voltage (for dBµV the impedance matters)"],
    inputs: [inp("P", "Power", "power", "mW", { ...pos })],
    outputs: [out("dBm", "Level", "dimensionless", undefined, { symbol: "dBm" }), out("dBW", "Level", "dimensionless", undefined, { symbol: "dBW" })],
    compute: ({ P }) => ({ values: { dBm: 10 * Math.log10(P! / 1e-3), dBW: 10 * Math.log10(P!) } }),
    refs: [
      { inputs: { P: 1 }, expect: { dBm: 0, dBW: -30 }, note: "1 mW = 0 dBm" },
      { inputs: { P: [1, "W"] }, expect: { dBm: 30, dBW: 0 }, note: "1 W = 30 dBm" },
    ],
  }),
  def({
    id: "current-divider",
    name: "Current divider",
    category: "electronics",
    description: "How a current splits between two parallel resistors.",
    formula: ["I₁ = I·R₂ / (R₁ + R₂)", "I₂ = I·R₁ / (R₁ + R₂)"],
    assumptions: ["Ideal resistors and an ideal current source"],
    inputs: [inp("I", "Total current", "current", "A"), inp("R1", "Resistor 1", "resistance", "ohm", { ...pos }), inp("R2", "Resistor 2", "resistance", "ohm", { ...pos })],
    outputs: [out("I1", "Current in R₁", "current", "A"), out("I2", "Current in R₂", "current", "A")],
    compute: ({ I, R1, R2 }) => ({ values: { I1: (I! * R2!) / (R1! + R2!), I2: (I! * R1!) / (R1! + R2!) } }),
    refs: [
      { inputs: { I: 3, R1: 10, R2: 20 }, expect: { I1: 2, I2: 1 }, note: "The smaller resistor takes more" },
      { inputs: { I: 1, R1: 100, R2: 100 }, expect: { I1: 0.5, I2: 0.5 }, note: "Equal split" },
    ],
  }),
  def({
    id: "opamp-inverting",
    name: "Inverting op-amp gain",
    category: "electronics",
    description: "Gain and output of an inverting amplifier.",
    formula: ["G = -R_f / R_in", "V_out = G·V_in"],
    assumptions: ["Ideal op-amp: infinite open-loop gain, no input current", "Output within the supply rails"],
    inputs: [inp("Rf", "Feedback resistor", "resistance", "kohm", { ...pos }), inp("Rin", "Input resistor", "resistance", "kohm", { ...pos }), inp("Vin", "Input voltage", "voltage", "V", { optional: true })],
    outputs: [out("G", "Gain", "dimensionless"), out("GdB", "Gain", "dimensionless", undefined, { symbol: "dB" }), out("Vout", "Output voltage", "voltage", "V", { optional: true })],
    compute: ({ Rf, Rin, Vin }) => {
      const G = -Rf! / Rin!;
      return { values: { G, GdB: 20 * Math.log10(Math.abs(G)), ...(Vin !== undefined ? { Vout: G * Vin } : {}) } };
    },
    refs: [
      { inputs: { Rf: 100, Rin: 10, Vin: 0.2 }, expect: { G: -10, GdB: 20, Vout: -2 }, note: "-100k/10k" },
      { inputs: { Rf: 47, Rin: 4.7 }, expect: { G: -10 }, note: "Same ratio" },
    ],
  }),
  def({
    id: "opamp-non-inverting",
    name: "Non-inverting op-amp gain",
    category: "electronics",
    description: "Gain and output of a non-inverting amplifier.",
    formula: ["G = 1 + R_f / R_g", "V_out = G·V_in"],
    assumptions: ["Ideal op-amp", "Output within the supply rails"],
    inputs: [inp("Rf", "Feedback resistor", "resistance", "kohm", { ...nonneg }), inp("Rg", "Resistor to ground", "resistance", "kohm", { ...pos }), inp("Vin", "Input voltage", "voltage", "V", { optional: true })],
    outputs: [out("G", "Gain", "dimensionless"), out("GdB", "Gain", "dimensionless", undefined, { symbol: "dB" }), out("Vout", "Output voltage", "voltage", "V", { optional: true })],
    compute: ({ Rf, Rg, Vin }) => {
      const G = 1 + Rf! / Rg!;
      return { values: { G, GdB: 20 * Math.log10(G), ...(Vin !== undefined ? { Vout: G * Vin } : {}) } };
    },
    refs: [
      { inputs: { Rf: 9, Rg: 1, Vin: 0.5 }, expect: { G: 10, Vout: 5 }, note: "1 + 9" },
      { inputs: { Rf: 0, Rg: 10 }, expect: { G: 1, GdB: 0 }, note: "Voltage follower" },
    ],
  }),
  def({
    id: "rc-lowpass-response",
    name: "RC low-pass response",
    category: "electronics",
    description: "Gain and phase of a first-order RC low-pass filter at a frequency.",
    formula: ["f_c = 1/(2πRC)", "|H| = 1/√(1 + (f/f_c)²)", "φ = -atan(f/f_c)"],
    assumptions: ["First-order RC, driven by a low-impedance source, into a high-impedance load"],
    inputs: [inp("R", "Resistance", "resistance", "kohm", { ...pos }), inp("C", "Capacitance", "capacitance", "uF", { ...pos }), inp("f", "Frequency", "frequency", "Hz", { ...nonneg })],
    outputs: [out("fc", "Cut-off frequency", "frequency", "Hz"), out("gain", "Gain", "ratio", "fraction"), out("gaindB", "Gain", "dimensionless", undefined, { symbol: "dB" }), out("phase", "Phase", "angle", "deg")],
    compute: ({ R, C, f }) => {
      const fc = 1 / (2 * Math.PI * R! * C!);
      const g = 1 / Math.sqrt(1 + (f! / fc) ** 2);
      return { values: { fc, gain: g, gaindB: 20 * Math.log10(g), phase: -Math.atan(f! / fc) } };
    },
    refs: [
      { inputs: { R: 1, C: 1, f: 1000 }, expect: { fc: 159.1549430919, gaindB: -16.07223526581, phase: -80.95693892096 }, note: "f/f_c = 6.283" },
      { inputs: { R: 1, C: 1, f: 159.1549430919 }, expect: { gain: 0.7071067811865, phase: -45 }, note: "At f_c: −3 dB, −45°" },
    ],
  }),
  def({
    id: "wavelength",
    name: "Frequency and wavelength",
    category: "electronics",
    description: "Wavelength of an electromagnetic wave in a medium.",
    formula: ["λ = v_f·c / f"],
    assumptions: ["c = 299 792 458 m/s; velocity factor v_f = 1 in vacuum (≈ 0.66 in solid-PE coax)"],
    inputs: [inp("f", "Frequency", "frequency", "MHz", { ...pos }), inp("vf", "Velocity factor", "ratio", "fraction", { min: 0, max: 1, exclusiveMin: true, default: 1 })],
    outputs: [out("lambda", "Wavelength", "length", "m", { symbol: "λ" }), out("quarter", "Quarter wavelength", "length", "m", { symbol: "λ/4" })],
    compute: ({ f, vf }) => {
      const l = (vf! * C0) / f!;
      return { values: { lambda: l, quarter: l / 4 } };
    },
    refs: [
      { inputs: { f: 100, vf: 1 }, expect: { lambda: 2.99792458 }, note: "FM band ≈ 3 m" },
      { inputs: { f: [2.4, "GHz"], vf: 1 }, expect: { lambda: 0.1249135241667, quarter: 0.03122838104167 }, note: "Wi-Fi" },
    ],
  }),
  def({
    id: "skin-depth",
    name: "Skin depth",
    category: "electronics",
    description: "Depth at which AC current density falls to 1/e in a conductor.",
    formula: ["δ = √(ρ / (π·f·μ₀·μᵣ))"],
    assumptions: ["Good conductor, thickness well above δ", "Copper at 20 °C: ρ = 1.72e-8 Ω·m, μᵣ = 1"],
    inputs: [inp("rho", "Resistivity", "resistivity", "ohm·m", { default: 1.72e-8, ...pos }), inp("f", "Frequency", "frequency", "Hz", { ...pos }), inp("mur", "Relative permeability", "dimensionless", undefined, { default: 1, min: 1 })],
    outputs: [out("delta", "Skin depth", "length", "mm", { symbol: "δ" })],
    compute: ({ rho, f, mur }) => ({ values: { delta: Math.sqrt(rho! / (Math.PI * f! * MU0 * mur!)) } }),
    refs: [
      { inputs: { rho: 1.72e-8, f: 50, mur: 1 }, expect: { delta: 9.334678242177 }, note: "Copper at mains frequency" },
      { inputs: { rho: 1.72e-8, f: [1, "MHz"], mur: 1 }, expect: { delta: 0.06600614285238 }, note: "Copper at 1 MHz: 66 µm" },
    ],
  }),
  def({
    id: "battery-runtime",
    name: "Battery runtime",
    category: "electronics",
    description: "How long a battery lasts at a steady load.",
    formula: ["t = C·k / I"],
    assumptions: ["Constant current draw", "k derates for temperature, ageing and cut-off (0.7–0.85 is typical)", "Peukert effect ignored"],
    inputs: [inp("C", "Capacity", "charge", "mAh", { ...pos }), inp("I", "Load current", "current", "mA", { ...pos }), inp("k", "Usable fraction", "ratio", "fraction", { min: 0, max: 1, exclusiveMin: true, default: 0.85 })],
    outputs: [out("t", "Runtime", "time", "h")],
    compute: ({ C, I, k }) => ({ values: { t: (C! * k!) / I! } }),
    refs: [
      { inputs: { C: 2000, I: 100, k: 1 }, expect: { t: 20 }, note: "2000 mAh/100 mA" },
      { inputs: { C: 3000, I: 250, k: 0.85 }, expect: { t: 10.2 }, note: "12 h × 0.85" },
    ],
  }),
  def({
    id: "adc-resolution",
    name: "ADC resolution",
    category: "instrumentation",
    description: "Step size (LSB) and ideal signal-to-noise ratio of an analog-to-digital converter.",
    formula: ["LSB = V_ref / 2ⁿ", "SNR (ideal) = 6.02·n + 1.76 dB", "Quantization error = ±LSB/2"],
    assumptions: ["Ideal converter (no INL/DNL or noise)", "Full-scale sine for the SNR figure"],
    inputs: [inp("n", "Bits", "count", undefined, { min: 1, max: 32, integer: true }), inp("Vref", "Reference voltage", "voltage", "V", { ...pos })],
    outputs: [out("lsb", "Step size (LSB)", "voltage", "mV"), out("levels", "Levels", "count"), out("snr", "Ideal SNR", "dimensionless", undefined, { symbol: "dB" })],
    compute: ({ n, Vref }) => ({ values: { lsb: Vref! / 2 ** n!, levels: 2 ** n!, snr: 6.02 * n! + 1.76 } }),
    refs: [
      { inputs: { n: 12, Vref: 3.3 }, expect: { lsb: 0.8056640625, levels: 4096, snr: 74 }, note: "3.3/4096" },
      { inputs: { n: 16, Vref: 5 }, expect: { lsb: 0.0762939453125, snr: 98.08 }, note: "5/65536" },
    ],
  }),
  def({
    id: "pcb-trace-width",
    name: "PCB trace width (IPC-2221)",
    category: "electronics",
    description: "Minimum trace width for a current and an allowed temperature rise.",
    formula: ["A [mil²] = (I / (k·ΔT^0.44))^(1/0.725)", "w = A / (t·1.378 mil/oz)", "k = 0.048 outer layers, 0.024 inner layers"],
    assumptions: ["IPC-2221 curve fit, valid up to about 35 A, 400 mil wide, 10–100 °C rise", "Copper thickness in oz/ft² (1 oz = 1.378 mil = 35 µm)", "IPC-2152 gives less conservative results"],
    inputs: [
      inp("I", "Current", "current", "A", { ...pos }),
      inp("dT", "Temperature rise", "temperatureDelta", "dK", { ...pos, default: 10 }),
      inp("oz", "Copper weight (oz/ft²)", "dimensionless", undefined, { ...pos, default: 1 }),
      inp("layer", "Layer", "dimensionless", undefined, { options: [{ value: 0.048, label: "Outer" }, { value: 0.024, label: "Inner" }], default: 0.048 }),
    ],
    outputs: [out("area", "Cross-section", "area", "mm2"), out("w", "Minimum width", "length", "mm")],
    compute: ({ I, dT, oz, layer }) => {
      const A = (I! / (layer! * dT! ** 0.44)) ** (1 / 0.725);
      const wMil = A / (oz! * 1.378);
      const MIL = 2.54e-5;
      return { values: { area: A * MIL * MIL, w: wMil * MIL }, warnings: I! > 35 ? ["Above 35 A the IPC-2221 fit isn't valid."] : [] };
    },
    refs: [
      { inputs: { I: 1, dT: 10, oz: 1, layer: 0.048 }, expect: { w: [11.82583552047, "mil"] }, note: "IPC-2221 outer, 1 A, 10 °C: 11.8 mil" },
      { inputs: { I: 1, dT: 10, oz: 1, layer: 0.024 }, expect: { w: [30.76419967266, "mil"] }, note: "Inner layer needs ~2.6×" },
    ],
  }),
  def({
    id: "wheatstone-bridge",
    name: "Wheatstone bridge",
    category: "instrumentation",
    description: "Output voltage of a Wheatstone bridge and the balancing resistance.",
    formula: ["V_out = V_s·(R₃/(R₃ + Rₓ) - R₂/(R₁ + R₂))", "Balanced when Rₓ = R₁·R₃ / R₂"],
    assumptions: ["Ideal source; the output is measured with no load (high-impedance meter)", "R₁–R₂ one arm, Rₓ–R₃ the other; R₂ and R₃ to the same supply rail"],
    inputs: [
      inp("Vs", "Supply voltage", "voltage", "V"),
      inp("R1", "R₁", "resistance", "ohm", { ...pos }),
      inp("R2", "R₂", "resistance", "ohm", { ...pos }),
      inp("R3", "R₃", "resistance", "ohm", { ...pos }),
      inp("Rx", "Rₓ (unknown)", "resistance", "ohm", { ...pos }),
    ],
    outputs: [out("Vout", "Output voltage", "voltage", "mV"), out("Rbal", "Rₓ for balance", "resistance", "ohm")],
    compute: ({ Vs, R1, R2, R3, Rx }) => ({ values: { Vout: Vs! * (R3! / (R3! + Rx!) - R2! / (R1! + R2!)), Rbal: (R1! * R3!) / R2! } }),
    refs: [
      { inputs: { Vs: 10, R1: 1000, R2: 1000, R3: 1000, Rx: 1000 }, expect: { Vout: 0, Rbal: 1000 }, note: "Balanced bridge" },
      { inputs: { Vs: 5, R1: 120, R2: 120, R3: 120, Rx: 121 }, expect: { Vout: -10.37344398340 }, note: "5·(120/241 - 0.5)" },
    ],
  }),
  def({
    id: "timer-555-astable",
    name: "555 timer (astable)",
    category: "electronics",
    description: "Frequency and duty cycle of a 555 in astable mode.",
    formula: ["f = 1.44 / ((R₁ + 2R₂)·C)", "Duty = (R₁ + R₂) / (R₁ + 2R₂)"],
    assumptions: ["Classic bipolar 555; 1.44 ≈ 1/ln 2 rounded", "Capacitor tolerance dominates real accuracy"],
    inputs: [inp("R1", "R₁", "resistance", "kohm", { ...pos }), inp("R2", "R₂", "resistance", "kohm", { ...pos }), inp("C", "Capacitance", "capacitance", "uF", { ...pos })],
    outputs: [out("f", "Frequency", "frequency", "Hz"), out("duty", "Duty cycle", "ratio", "percent"), out("T", "Period", "time", "ms")],
    compute: ({ R1, R2, C }) => {
      const f = 1.44 / ((R1! + 2 * R2!) * C!);
      return { values: { f, duty: (R1! + R2!) / (R1! + 2 * R2!), T: 1 / f } };
    },
    refs: [
      { inputs: { R1: 1, R2: 10, C: 10 }, expect: { f: 6.857142857143, duty: 52.38095238095 }, note: "1.44/(21k·10µ)" },
      { inputs: { R1: 10, R2: 100, C: 1 }, expect: { f: 6.857142857143 }, note: "Same RC product" },
    ],
  }),
  def({
    id: "capacitor-energy",
    name: "Capacitor energy and charge",
    category: "electronics",
    description: "Energy stored in a capacitor and its charge.",
    formula: ["E = ½·C·V²", "Q = C·V"],
    assumptions: ["Ideal capacitor"],
    inputs: [inp("C", "Capacitance", "capacitance", "uF", { ...pos }), inp("V", "Voltage", "voltage", "V")],
    outputs: [out("E", "Energy", "energy", "J"), out("Q", "Charge", "charge", "C")],
    compute: ({ C, V }) => ({ values: { E: 0.5 * C! * V! * V!, Q: C! * V! } }),
    refs: [
      { inputs: { C: 1000, V: 10 }, expect: { E: 0.05, Q: 0.01 }, note: "½·1e-3·100" },
      { inputs: { C: [1, "F"], V: 2.7 }, expect: { E: 3.645 }, note: "Supercapacitor" },
    ],
  }),
  def({
    id: "inductor-energy",
    name: "Inductor energy",
    category: "electronics",
    description: "Energy stored in an inductor's magnetic field.",
    formula: ["E = ½·L·I²"],
    assumptions: ["Ideal inductor, not saturated"],
    inputs: [inp("L", "Inductance", "inductance", "mH", { ...pos }), inp("I", "Current", "current", "A")],
    outputs: [out("E", "Energy", "energy", "J")],
    compute: ({ L, I }) => ({ values: { E: 0.5 * L! * I! * I! } }),
    refs: [
      { inputs: { L: 10, I: 2 }, expect: { E: 0.02 }, note: "½·0.01·4" },
      { inputs: { L: [100, "uH"], I: 10 }, expect: { E: 0.005 }, note: "½·1e-4·100" },
    ],
  }),
  def({
    id: "delta-star",
    name: "Delta to star (Δ–Y)",
    category: "electronics",
    description: "Star (wye) resistances equivalent to a delta network.",
    formula: ["R_a = R_ab·R_ca / ΣR", "R_b = R_ab·R_bc / ΣR", "R_c = R_bc·R_ca / ΣR"],
    assumptions: ["Resistive networks (works the same for impedances)"],
    inputs: [inp("Rab", "R_ab", "resistance", "ohm", { ...pos }), inp("Rbc", "R_bc", "resistance", "ohm", { ...pos }), inp("Rca", "R_ca", "resistance", "ohm", { ...pos })],
    outputs: [out("Ra", "R_a", "resistance", "ohm"), out("Rb", "R_b", "resistance", "ohm"), out("Rc", "R_c", "resistance", "ohm")],
    compute: ({ Rab, Rbc, Rca }) => {
      const s = Rab! + Rbc! + Rca!;
      return { values: { Ra: (Rab! * Rca!) / s, Rb: (Rab! * Rbc!) / s, Rc: (Rbc! * Rca!) / s } };
    },
    refs: [
      { inputs: { Rab: 30, Rbc: 30, Rca: 30 }, expect: { Ra: 10, Rb: 10, Rc: 10 }, note: "Balanced: R_Y = R_Δ/3" },
      { inputs: { Rab: 10, Rbc: 20, Rca: 30 }, expect: { Ra: 5, Rb: 3.333333333333, Rc: 10 }, note: "Σ = 60" },
    ],
  }),
  def({
    id: "coax-impedance",
    name: "Coaxial cable impedance",
    category: "electronics",
    description: "Characteristic impedance and delay of a coaxial line.",
    formula: ["Z₀ = (60 / √εᵣ)·ln(D / d)", "Delay = √εᵣ / c"],
    assumptions: ["Lossless line", "D: inside diameter of the shield; d: outside diameter of the centre conductor"],
    inputs: [inp("D", "Shield inner diameter", "length", "mm", { ...pos }), inp("d", "Conductor diameter", "length", "mm", { ...pos }), inp("er", "Dielectric constant", "dimensionless", undefined, { min: 1, default: 2.25 })],
    outputs: [out("Z0", "Impedance", "resistance", "ohm"), out("delay", "Delay per metre", "time", "ns"), out("vf", "Velocity factor", "ratio", "fraction")],
    compute: ({ D, d, er }) => {
      if (d! >= D!) fail("The conductor must be thinner than the shield.", "d");
      return { values: { Z0: (60 / Math.sqrt(er!)) * Math.log(D! / d!), delay: Math.sqrt(er!) / C0, vf: 1 / Math.sqrt(er!) } };
    },
    refs: [
      { inputs: { D: 2.95, d: 0.91, er: 2.25 }, expect: { Z0: 47.04463399292, vf: 0.6666666666667 }, note: "RG-58-like geometry" },
      { inputs: { D: 2.718281828459, d: 1, er: 1 }, expect: { Z0: 60, delay: 3.335640951982 }, note: "D/d = e in air" },
    ],
  }),
  def({
    id: "motor-current-3ph",
    name: "Three-phase motor current",
    category: "electrical",
    description: "Full-load line current of a three-phase motor from its shaft power.",
    formula: ["I = P_out / (√3·V_L·PF·η)"],
    assumptions: ["Balanced supply", "Nameplate (rated) efficiency and power factor", "Starting current is 5–8× higher (direct on line)"],
    inputs: [inp("P", "Shaft power", "power", "kW", { ...pos }), inp("V", "Line voltage", "voltage", "V", { ...pos }), inp("pf", "Power factor", "ratio", "fraction", { min: 0, max: 1, exclusiveMin: true }), inp("eff", "Efficiency", "ratio", "percent", { min: 0, max: 1, exclusiveMin: true })],
    outputs: [out("I", "Line current", "current", "A"), out("Pin", "Electrical input", "power", "kW")],
    compute: ({ P, V, pf, eff }) => ({ values: { I: P! / (Math.sqrt(3) * V! * pf! * eff!), Pin: P! / eff! } }),
    refs: [
      { inputs: { P: 7.5, V: 400, pf: 0.85, eff: 90 }, expect: { I: 14.15074189190, Pin: 8.333333333333 }, note: "7500/(√3·400·0.85·0.9)" },
      { inputs: { P: 15, V: 415, pf: 0.88, eff: 92 }, expect: { I: 25.77579300754 }, note: "15 kW at 415 V" },
    ],
  }),
  def({
    id: "induction-motor-slip",
    name: "Induction motor speed and slip",
    category: "electrical",
    description: "Synchronous speed and slip of an AC induction motor.",
    formula: ["n_s = 120·f / p", "s = (n_s - n) / n_s"],
    assumptions: ["p is the number of poles (not pole pairs)"],
    inputs: [inp("f", "Supply frequency", "frequency", "Hz", { ...pos }), inp("p", "Poles", "count", undefined, { min: 2, integer: true }), inp("n", "Rotor speed", "angularSpeed", "rpm", { ...nonneg })],
    outputs: [out("ns", "Synchronous speed", "angularSpeed", "rpm"), out("s", "Slip", "ratio", "percent")],
    compute: ({ f, p, n }) => {
      if (p! % 2 !== 0) fail("A motor has an even number of poles.", "p");
      const ns = (2 * f! * 2 * Math.PI) / p!;
      return { values: { ns, s: (ns - n!) / ns } };
    },
    refs: [
      { inputs: { f: 50, p: 4, n: 1440 }, expect: { ns: 1500, s: 4 }, note: "4-pole at 50 Hz" },
      { inputs: { f: 60, p: 6, n: 1164 }, expect: { ns: 1200, s: 3 }, note: "6-pole at 60 Hz" },
    ],
  }),
  def({
    id: "energy-cost",
    name: "Energy use and cost",
    category: "electrical",
    description: "Energy used by an appliance and what it costs.",
    formula: ["E = P·h·days", "Cost = E·price"],
    assumptions: ["Constant power while running", "Price per kWh flat (no time-of-day tariff)"],
    inputs: [inp("P", "Power", "power", "W", { ...nonneg }), inp("h", "Hours per day", "dimensionless", undefined, { min: 0, max: 24 }), inp("days", "Days", "dimensionless", undefined, { ...nonneg, default: 30 }), inp("price", "Price per kWh", "money", undefined, { ...nonneg })],
    outputs: [out("E", "Energy", "energy", "kWh"), out("cost", "Cost", "money")],
    compute: ({ P, h, days, price }) => {
      const E = P! * h! * 3600 * days!;
      return { values: { E, cost: (E / 3.6e6) * price! } };
    },
    refs: [
      { inputs: { P: 1000, h: 2, days: 30, price: 8 }, expect: { E: 60, cost: 480 }, note: "1 kW·2 h·30 d = 60 kWh" },
      { inputs: { P: 60, h: 5, days: 365, price: 0.15 }, expect: { E: 109.5, cost: 16.425 }, note: "60 W bulb for a year" },
    ],
  }),
  def({
    id: "voltage-regulation",
    name: "Voltage regulation",
    category: "electrical",
    description: "How much a supply's voltage falls from no load to full load.",
    formula: ["Regulation = (V_nl - V_fl) / V_fl"],
    assumptions: ["Both measured at the same point and temperature"],
    inputs: [inp("Vnl", "No-load voltage", "voltage", "V", { ...pos }), inp("Vfl", "Full-load voltage", "voltage", "V", { ...pos })],
    outputs: [out("reg", "Regulation", "ratio", "percent")],
    compute: ({ Vnl, Vfl }) => ({ values: { reg: (Vnl! - Vfl!) / Vfl! } }),
    refs: [
      { inputs: { Vnl: 240, Vfl: 230 }, expect: { reg: 4.347826086957 }, note: "10/230" },
      { inputs: { Vnl: 12.6, Vfl: 12 }, expect: { reg: 5 }, note: "0.6/12" },
    ],
  }),
  def({
    id: "transformer-fault-current",
    name: "Transformer short-circuit current",
    category: "electrical",
    description: "Prospective three-phase fault current at a transformer's secondary terminals.",
    formula: ["I_fl = S / (√3·V_L)", "I_sc = I_fl / Z%"],
    assumptions: ["Infinite source upstream (the transformer impedance alone limits the fault)", "Bolted three-phase fault; cable impedance ignored, so this is the worst case"],
    inputs: [inp("S", "Rating", "apparentPower", "kVA", { ...pos }), inp("V", "Secondary line voltage", "voltage", "V", { ...pos }), inp("Z", "Impedance", "ratio", "percent", { ...pos, max: 1 })],
    outputs: [out("Ifl", "Full-load current", "current", "A"), out("Isc", "Fault current", "current", "kA")],
    compute: ({ S, V, Z }) => {
      const Ifl = S! / (Math.sqrt(3) * V!);
      return { values: { Ifl, Isc: Ifl / Z! } };
    },
    refs: [
      { inputs: { S: 1000, V: 400, Z: 5 }, expect: { Ifl: 1443.375672974, Isc: 28.86751345948 }, note: "1 MVA, 5 %" },
      { inputs: { S: 500, V: 415, Z: 4.5 }, expect: { Isc: 15.45783853252 }, note: "500 kVA, 4.5 %" },
    ],
  }),
  def({
    id: "ac-cable-voltage-drop-3ph",
    name: "AC cable voltage drop (three-phase)",
    category: "electrical",
    description: "Voltage drop of a balanced three-phase cable run from its resistance and reactance per km.",
    formula: ["ΔV = √3·I·L·(R·cos φ + X·sin φ)", "ΔV% = 100·ΔV / V_L"],
    assumptions: ["Balanced load", "R and X per km per conductor at operating temperature (from the cable datasheet)", "Approximate formula, good for drops under ~10 %"],
    inputs: [
      inp("I", "Current", "current", "A", { ...nonneg }),
      inp("L", "Length", "length", "km", { ...pos }),
      inp("R", "Resistance per km", "resistance", "ohm", { ...nonneg }),
      inp("X", "Reactance per km", "resistance", "ohm", { ...nonneg }),
      inp("pf", "Power factor", "ratio", "fraction", { min: 0, max: 1 }),
      inp("V", "Line voltage", "voltage", "V", { ...pos }),
    ],
    outputs: [out("dV", "Voltage drop", "voltage", "V"), out("pct", "Voltage drop", "ratio", "percent")],
    compute: ({ I, L, R, X, pf, V }) => {
      // R and X are per km; L is in metres.
      const dV = Math.sqrt(3) * I! * (L! / 1000) * (R! * pf! + X! * Math.sqrt(1 - pf! * pf!));
      return { values: { dV, pct: dV / V! }, warnings: dV / V! > 0.05 ? ["More than 5 % drop: check the limit your code sets."] : [] };
    },
    refs: [
      { inputs: { I: 100, L: [200, "m"], R: 0.193, X: 0.08, pf: 0.85, V: 400 }, expect: { dV: 7.142721706905, pct: 1.785680426726 }, note: "√3·100·0.2·(0.164 + 0.0421)" },
      { inputs: { I: 50, L: [100, "m"], R: 0.727, X: 0.09, pf: 0.9, V: 415 }, expect: { dV: 6.006146766549 }, note: "25 mm²-class cable" },
    ],
  }),
  def({
    id: "ground-rod-resistance",
    name: "Ground rod resistance",
    category: "electrical",
    description: "Earth resistance of a single vertical rod (Dwight's formula).",
    // Dwight writes ln(4L/a) - 1 with a the radius; with the diameter that's ln(8L/d) - 1 (version 1 used 4L/d, about 10 % low).
    version: 2,
    formula: ["R = ρ / (2π·L)·(ln(8L / d) - 1)", "Dwight: ln(4L / a) - 1 with a = d / 2, the rod's radius"],
    assumptions: [
      "Uniform soil resistivity ρ",
      "Rod driven fully, top at ground level",
      "Single rod; rods closer than their length interfere",
      "Valid for a slender rod: L at least 10 × d (the formula assumes L ≫ d); shorter or thicker rods are refused",
    ],
    inputs: [inp("rho", "Soil resistivity", "resistivity", "ohm·m", { ...pos }), inp("L", "Rod length", "length", "m", { ...pos }), inp("d", "Rod diameter", "length", "mm", { ...pos })],
    outputs: [out("R", "Earth resistance", "resistance", "ohm")],
    compute: ({ rho, L, d }) => {
      // Below L/d = 10 the formula drifts from the true value, and below L/d ≈ 0.34 it turns negative.
      if (L! < 10 * d!) fail(`Dwight's formula is for a slender rod: the rod length (L) must be at least 10 times the rod diameter (d). Here L/d = ${Number((L! / d!).toPrecision(3))}.`, "L");
      return { values: { R: (rho! / (2 * Math.PI * L!)) * (Math.log((8 * L!) / d!) - 1) } };
    },
    refs: [
      { inputs: { rho: 100, L: 3.05, d: 15.9 }, expect: { R: 33.1 }, tol: 2e-3, note: "IEEE Std 142 (Green Book): 10 ft × 5/8 in rod in 100 Ω·m soil ≈ 33.1 Ω" },
      { inputs: { rho: 100, L: [10, "ft"], d: [0.625, "in"] }, expect: { R: 33.08906935295 }, note: "The same rod in exact feet and inches: 100/(2π·3.048)·(ln(8·3.048/0.015875) - 1)" },
      { inputs: { rho: 100, L: 3, d: 16 }, expect: { R: 33.49267438113 }, note: "3 m × 16 mm rod in 100 Ω·m soil: 100/(6π)·(ln 1500 - 1)" },
      { inputs: { rho: 50, L: 2.4, d: 12.7 }, expect: { R: 20.95892733118 }, note: "8 ft × ½ in rod in 50 Ω·m soil: 50/(4.8π)·(ln(19.2/0.0127) - 1)" },
      { inputs: { rho: 30, L: 1.5, d: 20 }, expect: { R: 17.17896064294 }, note: "1.5 m × 20 mm rod in 30 Ω·m soil: 30/(3π)·(ln 600 - 1)" },
    ],
  }),
  def({
    id: "thd",
    name: "Total harmonic distortion",
    category: "electrical",
    description: "THD from the fundamental and the harmonic amplitudes.",
    formula: ["THD = √(V₂² + V₃² + …) / V₁"],
    assumptions: ["RMS (or all peak) values, consistently", "THD-F (relative to the fundamental)"],
    inputs: [inp("V1", "Fundamental", "voltage", "V", { ...pos }), inp("Vh", "Harmonics", "voltage", "V", { list: true, ...nonneg })],
    outputs: [out("thd", "THD", "ratio", "percent"), out("rms", "Total RMS", "voltage", "V")],
    compute: ({ V1, lists }) => {
      const h = Math.sqrt(lists.Vh!.reduce((s, v) => s + v * v, 0));
      return { values: { thd: h / V1!, rms: Math.sqrt(V1! * V1! + h * h) } };
    },
    refs: [
      { inputs: { V1: 230, Vh: [10, 5, 3] }, expect: { thd: 5.032972566431 }, note: "√134/230" },
      { inputs: { V1: 100, Vh: [4, 3] }, expect: { thd: 5, rms: 100.1249219725 }, note: "3-4-5 harmonics" },
    ],
  }),
  def({
    id: "load-factor",
    name: "Load and demand factor",
    category: "electrical",
    description: "Load factor and demand factor of an installation.",
    formula: ["Load factor = average load / peak load", "Demand factor = maximum demand / connected load"],
    assumptions: ["Average and peak over the same period"],
    inputs: [inp("avg", "Average load", "power", "kW", { ...nonneg }), inp("peak", "Peak (maximum) demand", "power", "kW", { ...pos }), inp("connected", "Connected load", "power", "kW", { ...pos })],
    outputs: [out("lf", "Load factor", "ratio", "percent"), out("df", "Demand factor", "ratio", "percent")],
    compute: ({ avg, peak, connected }) => ({ values: { lf: avg! / peak!, df: peak! / connected! } }),
    refs: [{ inputs: { avg: 60, peak: 100, connected: 150 }, expect: { lf: 60, df: 66.66666666667 }, note: "60/100; 100/150" }],
  }),
  def({
    id: "buck-output-ripple",
    name: "Buck output voltage ripple",
    category: "power-electronics",
    description: "Output voltage ripple of a buck converter from the inductor ripple and the capacitor.",
    formula: ["ΔV = ΔI_L / (8·f_sw·C)"],
    assumptions: ["Ideal CCM buck", "Capacitor's ESR and ESL ignored (ESR often dominates: ΔV_ESR = ΔI·ESR)"],
    inputs: [inp("dI", "Inductor ripple (p-p)", "current", "A", { ...pos }), inp("fsw", "Switching frequency", "frequency", "kHz", { ...pos }), inp("C", "Output capacitance", "capacitance", "uF", { ...pos })],
    outputs: [out("dV", "Output ripple (p-p)", "voltage", "mV")],
    compute: ({ dI, fsw, C }) => ({ values: { dV: dI! / (8 * fsw! * C!) } }),
    refs: [
      { inputs: { dI: 1, fsw: 100, C: 100 }, expect: { dV: 12.5 }, note: "1/(8·1e5·1e-4)" },
      { inputs: { dI: 0.5, fsw: 500, C: 22 }, expect: { dV: 5.681818181818 }, note: "0.5/(8·5e5·22e-6)" },
    ],
  }),
  def({
    id: "boost-inductor-ripple",
    name: "Boost inductor ripple current",
    category: "power-electronics",
    description: "Peak-to-peak inductor ripple in an ideal boost converter.",
    formula: ["D = 1 - V_in / V_out", "ΔI_L = V_in·D / (f_sw·L)"],
    assumptions: ["Ideal boost in continuous-conduction mode", "Lossless parts"],
    inputs: [inp("Vin", "Input voltage", "voltage", "V", { ...pos }), inp("Vout", "Output voltage", "voltage", "V", { ...pos }), inp("fsw", "Switching frequency", "frequency", "kHz", { ...pos }), inp("L", "Inductance", "inductance", "uH", { ...pos })],
    outputs: [out("D", "Duty cycle", "ratio", "fraction"), out("dI", "Ripple (p-p)", "current", "A")],
    compute: ({ Vin, Vout, fsw, L }) => {
      if (Vout! <= Vin!) fail("A boost's output must be higher than its input.", "Vout");
      const D = 1 - Vin! / Vout!;
      return { values: { D, dI: (Vin! * D) / (fsw! * L!) } };
    },
    refs: [
      { inputs: { Vin: 12, Vout: 24, fsw: 100, L: 47 }, expect: { D: 0.5, dI: 1.276595744681 }, note: "12·0.5/(1e5·47e-6)" },
      { inputs: { Vin: 5, Vout: 12, fsw: 200, L: 10 }, expect: { dI: 1.458333333333 }, note: "5·0.5833/2" },
    ],
  }),
  def({
    id: "switching-loss",
    name: "MOSFET switching and conduction loss",
    category: "power-electronics",
    description: "Approximate switching and conduction losses of a hard-switched MOSFET.",
    formula: ["P_sw = ½·V·I·(t_r + t_f)·f_sw", "P_cond = I_rms²·R_DS(on)"],
    assumptions: ["Linear voltage and current ramps (hard switching)", "Gate-drive and output-capacitance (Coss) losses not included", "R_DS(on) at the junction temperature (often 1.5–2× the 25 °C value)"],
    inputs: [
      inp("V", "Drain voltage", "voltage", "V", { ...pos }),
      inp("I", "Switched current", "current", "A", { ...pos }),
      inp("tr", "Rise time", "time", "ns", { ...nonneg }),
      inp("tf", "Fall time", "time", "ns", { ...nonneg }),
      inp("fsw", "Switching frequency", "frequency", "kHz", { ...pos }),
      inp("Irms", "RMS current", "current", "A", { ...nonneg }),
      inp("Rds", "R_DS(on)", "resistance", "mohm", { ...nonneg }),
    ],
    outputs: [out("Psw", "Switching loss", "power", "W"), out("Pcond", "Conduction loss", "power", "W"), out("Ptot", "Total", "power", "W")],
    compute: ({ V, I, tr, tf, fsw, Irms, Rds }) => {
      const Psw = 0.5 * V! * I! * (tr! + tf!) * fsw!;
      const Pcond = Irms! * Irms! * Rds!;
      return { values: { Psw, Pcond, Ptot: Psw + Pcond } };
    },
    refs: [
      { inputs: { V: 48, I: 10, tr: 20, tf: 20, fsw: 100, Irms: 7, Rds: 10 }, expect: { Psw: 0.96, Pcond: 0.49, Ptot: 1.45 }, note: "½·48·10·40ns·100k" },
      { inputs: { V: 400, I: 5, tr: 50, tf: 30, fsw: 50, Irms: 3, Rds: 100 }, expect: { Psw: 4, Pcond: 0.9 }, note: "½·400·5·80ns·50k" },
    ],
  }),
  def({
    id: "heatsink",
    name: "Heatsink thermal resistance",
    category: "power-electronics",
    description: "Junction temperature with a heatsink, and the heatsink needed for a junction limit.",
    formula: ["T_j = T_a + P·(R_jc + R_cs + R_sa)", "R_sa (needed) = (T_j,max - T_a) / P - R_jc - R_cs"],
    assumptions: ["Steady state", "All heat flows through the heatsink path", "Thermal resistances from datasheets (R_cs depends on the interface material)"],
    inputs: [
      inp("P", "Power dissipated", "power", "W", { ...pos }),
      inp("Ta", "Ambient temperature", "temperature", "C"),
      inp("Tjmax", "Maximum junction temperature", "temperature", "C"),
      inp("Rjc", "Junction to case", "thermalResistance", "K/W", { ...nonneg }),
      inp("Rcs", "Case to sink", "thermalResistance", "K/W", { ...nonneg }),
      inp("Rsa", "Sink to ambient (your heatsink)", "thermalResistance", "K/W", { optional: true, ...nonneg }),
    ],
    outputs: [out("RsaMax", "Heatsink needed (at most)", "thermalResistance", "K/W"), out("Tj", "Junction temperature with your heatsink", "temperature", "C", { optional: true })],
    compute: ({ P, Ta, Tjmax, Rjc, Rcs, Rsa }) => {
      const RsaMax = (Tjmax! - Ta!) / P! - Rjc! - Rcs!;
      const values: Record<string, number> = { RsaMax };
      const warnings: string[] = [];
      if (RsaMax <= 0) warnings.push("No heatsink is good enough: the device's own R_jc + R_cs already exceed the limit. Lower the power or the ambient.");
      if (Rsa !== undefined) {
        values.Tj = Ta! + P! * (Rjc! + Rcs! + Rsa);
        if (values.Tj > Tjmax!) warnings.push("With your heatsink the junction runs above its maximum.");
      }
      return { values, warnings };
    },
    refs: [
      { inputs: { P: 20, Ta: 40, Tjmax: 125, Rjc: 0.5, Rcs: 0.2 }, expect: { RsaMax: 3.55 }, note: "85/20 - 0.7" },
      { inputs: { P: 10, Ta: 40, Tjmax: 150, Rjc: 1, Rcs: 0.5, Rsa: 3 }, expect: { Tj: 85 }, note: "40 + 10·4.5" },
    ],
  }),
  def({
    id: "converter-efficiency",
    name: "Efficiency and losses",
    category: "power-electronics",
    description: "Efficiency from input and output power, and the power lost as heat.",
    formula: ["η = P_out / P_in", "P_loss = P_in - P_out"],
    assumptions: ["Powers measured at the same time (steady state)"],
    inputs: [inp("Pin", "Input power", "power", "W", { ...pos }), inp("Pout", "Output power", "power", "W", { ...nonneg })],
    outputs: [out("eff", "Efficiency", "ratio", "percent"), out("loss", "Losses", "power", "W")],
    compute: ({ Pin, Pout }) => {
      if (Pout! > Pin!) fail("Output power can't exceed input power.", "Pout");
      return { values: { eff: Pout! / Pin!, loss: Pin! - Pout! } };
    },
    refs: [
      { inputs: { Pin: 100, Pout: 92 }, expect: { eff: 92, loss: 8 }, note: "92 %" },
      { inputs: { Pin: [5, "kW"], Pout: 4850 }, expect: { eff: 97, loss: 150 }, note: "97 %" },
    ],
  }),
  def({
    id: "flyback-ideal",
    name: "Flyback converter (ideal)",
    category: "power-electronics",
    description: "Output voltage of an ideal flyback converter in continuous conduction.",
    formula: ["V_out = V_in·(N_s / N_p)·D / (1 - D)"],
    assumptions: ["Ideal CCM flyback", "Lossless; diode drop and leakage inductance ignored"],
    inputs: [inp("Vin", "Input voltage", "voltage", "V", { ...pos }), inp("n", "Turns ratio N_s/N_p", "dimensionless", undefined, { ...pos }), inp("D", "Duty cycle", "ratio", "fraction", { min: 0, max: 1, exclusiveMax: true })],
    outputs: [out("Vout", "Output voltage", "voltage", "V")],
    compute: ({ Vin, n, D }) => ({ values: { Vout: (Vin! * n! * D!) / (1 - D!) } }),
    refs: [
      { inputs: { Vin: 48, n: 0.25, D: 0.4 }, expect: { Vout: 8 }, note: "48·0.25·0.4/0.6" },
      { inputs: { Vin: 325, n: 0.1, D: 0.45 }, expect: { Vout: 26.59090909091 }, note: "Rectified 230 V mains" },
    ],
  }),
  def({
    id: "forward-ideal",
    name: "Forward converter (ideal)",
    category: "power-electronics",
    description: "Output voltage of an ideal single-switch forward converter.",
    formula: ["V_out = V_in·(N_s / N_p)·D"],
    assumptions: ["Ideal CCM", "D below 0.5 for a 1:1 reset winding"],
    inputs: [inp("Vin", "Input voltage", "voltage", "V", { ...pos }), inp("n", "Turns ratio N_s/N_p", "dimensionless", undefined, { ...pos }), inp("D", "Duty cycle", "ratio", "fraction", { min: 0, max: 1 })],
    outputs: [out("Vout", "Output voltage", "voltage", "V")],
    compute: ({ Vin, n, D }) => ({ values: { Vout: Vin! * n! * D! }, warnings: D! > 0.5 ? ["With a 1:1 reset winding D must stay below 0.5 or the core won't reset."] : [] }),
    refs: [{ inputs: { Vin: 48, n: 0.5, D: 0.4 }, expect: { Vout: 9.6 }, note: "48·0.5·0.4" }],
  }),
  def({
    id: "inverter-spwm",
    name: "Three-phase inverter output (sine PWM)",
    category: "power-electronics",
    description: "Fundamental output voltage of a two-level three-phase inverter with sinusoidal PWM.",
    formula: ["V_ph,peak = m·V_dc / 2", "V_LL,rms = m·√3·V_dc / (2√2) ≈ 0.612·m·V_dc"],
    assumptions: ["Linear modulation, 0 ≤ m ≤ 1 (above 1 is overmodulation)", "Ideal switches, no dead time", "Fundamental component only"],
    inputs: [inp("Vdc", "DC link voltage", "voltage", "V", { ...pos }), inp("m", "Modulation index", "dimensionless", undefined, { min: 0, max: 1 })],
    outputs: [out("Vph", "Phase voltage (peak)", "voltage", "V"), out("Vll", "Line voltage (RMS)", "voltage", "V")],
    compute: ({ Vdc, m }) => ({ values: { Vph: (m! * Vdc!) / 2, Vll: (m! * Math.sqrt(3) * Vdc!) / (2 * Math.SQRT2) } }),
    refs: [
      { inputs: { Vdc: 400, m: 0.8 }, expect: { Vph: 160, Vll: 195.9591794227 }, note: "0.612·0.8·400" },
      { inputs: { Vdc: 700, m: 1 }, expect: { Vph: 350, Vll: 428.6607049871 }, note: "Top of the linear range" },
    ],
  }),
  def({
    id: "inverter-svpwm",
    name: "Three-phase inverter output (SVPWM)",
    category: "power-electronics",
    description: "Fundamental output of a two-level inverter with space-vector PWM (or third-harmonic injection).",
    formula: ["V_ph,peak = m·V_dc / √3", "V_LL,rms = m·V_dc / √2", "m = 1 is 15.5 % above sine PWM's maximum"],
    assumptions: ["Linear range 0 ≤ m ≤ 1 with m normalised to the SVPWM limit", "Ideal switches, no dead time", "Fundamental component only"],
    inputs: [inp("Vdc", "DC link voltage", "voltage", "V", { ...pos }), inp("m", "Modulation index (SVPWM)", "dimensionless", undefined, { min: 0, max: 1 })],
    outputs: [out("Vph", "Phase voltage (peak)", "voltage", "V"), out("Vll", "Line voltage (RMS)", "voltage", "V")],
    compute: ({ Vdc, m }) => ({ values: { Vph: (m! * Vdc!) / Math.sqrt(3), Vll: (m! * Vdc!) / Math.SQRT2 } }),
    refs: [
      { inputs: { Vdc: 700, m: 1 }, expect: { Vph: 404.1451884327, Vll: 494.9747468306 }, note: "Vdc/√3, Vdc/√2" },
      { inputs: { Vdc: 800, m: 0.9 }, expect: { Vll: 509.1168824543 }, note: "0.9·800/√2" },
    ],
  }),
  def({
    id: "battery-pack",
    name: "Battery pack (series and parallel)",
    category: "power-electronics",
    description: "Voltage, capacity and energy of a pack of identical cells.",
    formula: ["V = S·V_cell", "C = P·C_cell", "E = V·C"],
    assumptions: ["Identical, balanced cells", "Nominal cell voltage (Li-ion ≈ 3.6–3.7 V, LiFePO₄ 3.2 V)"],
    inputs: [inp("S", "Cells in series", "count", undefined, { min: 1, integer: true }), inp("P", "Strings in parallel", "count", undefined, { min: 1, integer: true }), inp("Vc", "Cell voltage", "voltage", "V", { ...pos }), inp("Cc", "Cell capacity", "charge", "Ah", { ...pos })],
    outputs: [out("V", "Pack voltage", "voltage", "V"), out("C", "Pack capacity", "charge", "Ah"), out("E", "Pack energy", "energy", "kWh"), out("cells", "Cells", "count")],
    compute: ({ S, P, Vc, Cc }) => ({ values: { V: S! * Vc!, C: P! * Cc!, E: S! * Vc! * P! * Cc!, cells: S! * P! } }),
    refs: [
      { inputs: { S: 14, P: 4, Vc: 3.6, Cc: 3 }, expect: { V: 50.4, C: 12, E: 0.6048, cells: 56 }, note: "14s4p of 3 Ah cells" },
      { inputs: { S: 16, P: 1, Vc: 3.2, Cc: 100 }, expect: { V: 51.2, E: 5.12 }, note: "16s LiFePO₄ 100 Ah" },
    ],
  }),
];
