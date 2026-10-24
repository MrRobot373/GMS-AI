/**
 * Extra reference cases, worked from each calculator's stated formula (display units and the
 * published constants), not by copying `compute`. `def()` appends these so a calculator becomes
 * "verified" only once it has five cases. Ground-rod already has its five IEEE/Dwight cases.
 */
export interface HandCase {
  note: string;
  inputs: Record<string, number | number[]>;
  expect: Record<string, number>;
}

const PI = Math.PI;
const G0 = 9.80665;
const C0 = 299792458;
const MU0 = 1.25663706212e-6;
const Rgas = 8.314462618;
const KE = 8.9875517923e9;
const HP = 6.62607015e-34;
const QE = 1.602176634e-19;
const NA = 6.02214076e23;
const GN = 6.6743e-11;
const SIGMA = 5.670374419e-8;
const deg = (rad: number) => (rad * 180) / PI;
const k = (note: string, inputs: Record<string, number | number[]>, expect: Record<string, number>): HandCase => ({ note, inputs, expect });

const rlFc = (LmH: number, Rohm: number) => Rohm / (2 * PI * (LmH / 1000));
const tauMs = (LmH: number, Rohm: number) => LmH / Rohm;

export const HAND: Record<string, HandCase[]> = {
  "inductors-series-parallel": [
    k("10, 20 and 30 µH", { L: [10, 20, 30] }, { series: 60, parallel: 1 / (1 / 10 + 1 / 20 + 1 / 30) }),
    k("three equal 15 µH", { L: [15, 15, 15] }, { series: 45, parallel: 5 }),
    k("1 µH and 3 µH", { L: [1, 3] }, { series: 4, parallel: 0.75 }),
  ],
  "rl-time-constant": [
    k("10 mH, 100 Ω", { L: 10, R: 100 }, { tau: tauMs(10, 100), fc: rlFc(10, 100) }),
    k("50 mH, 50 Ω", { L: 50, R: 50 }, { tau: tauMs(50, 50), fc: rlFc(50, 50) }),
    k("2 mH, 200 Ω", { L: 2, R: 200 }, { tau: tauMs(2, 200), fc: rlFc(2, 200) }),
  ],
  "rlc-series-resonance": [
    k("R=50 Ω, L=10 mH, C=1 µF", { R: 50, L: 10, C: 1 }, (() => {
      const L = 0.01, C = 1e-6, R = 50;
      const f0 = 1 / (2 * PI * Math.sqrt(L * C));
      const Q = Math.sqrt(L / C) / R;
      return { f0, Q, BW: f0 / Q };
    })()),
    k("R=5 Ω, L=2 mH, C=8 µF", { R: 5, L: 2, C: 8 }, (() => {
      const L = 0.002, C = 8e-6, R = 5;
      const f0 = 1 / (2 * PI * Math.sqrt(L * C));
      const Q = Math.sqrt(L / C) / R;
      return { f0, Q, BW: f0 / Q };
    })()),
    k("R=2 Ω, L=8 mH, C=2 µF", { R: 2, L: 8, C: 2 }, (() => {
      const L = 0.008, C = 2e-6, R = 2;
      const f0 = 1 / (2 * PI * Math.sqrt(L * C));
      const Q = Math.sqrt(L / C) / R;
      return { f0, Q, BW: f0 / Q };
    })()),
  ],
  "series-rlc-impedance": [
    k("pure resistor at 60 Hz", { f: 60, R: 40, L: 0 }, { X: 0, Z: 40, phi: 0 }),
    k("1 kHz, 3-4-5 with capacitive X", { f: 1000, R: 30, L: 0, C: 1 / (2 * PI * 1000 * 40) * 1e6 }, { X: -40, Z: 50, phi: deg(Math.atan2(-40, 30)) }),
    k("50 Hz, L only, X=10 Ω", { f: 50, R: 0, L: 10 / (2 * PI * 50) * 1000 }, { X: 10, Z: 10, phi: 90 }),
  ],
  "decibel-power": [
    k("×10 is +10 dB", { P1: 1, P2: 10 }, { dB: 10, ratio: 10 }),
    k("×1000 is +30 dB", { P1: 0.001, P2: 1 }, { dB: 30, ratio: 1000 }),
    k("quarter power", { P1: 4, P2: 1 }, { dB: 10 * Math.log10(0.25), ratio: 0.25 }),
  ],
  "decibel-voltage": [
    k("×2 is +6.02 dB", { V1: 1, V2: 2 }, { dB: 20 * Math.log10(2) }),
    k("×100 is +40 dB", { V1: 0.1, V2: 10 }, { dB: 40 }),
    k("÷10 is −20 dB", { V1: 5, V2: 0.5 }, { dB: -20 }),
  ],
  "dbm-watts": [
    k("100 mW", { P: 100 }, { dBm: 20, dBW: -10 }),
    k("1 µW = −30 dBm", { P: 0.001 }, { dBm: -30, dBW: -60 }),
    k("10 W", { P: 10000 }, { dBm: 40, dBW: 10 }),
  ],
  "current-divider": [
    k("1 A into 30 Ω and 60 Ω", { I: 1, R1: 30, R2: 60 }, { I1: 2 / 3, I2: 1 / 3 }),
    k("4 A into 5 Ω and 15 Ω", { I: 4, R1: 5, R2: 15 }, { I1: 3, I2: 1 }),
    k("2 A into 8 Ω and 8 Ω", { I: 2, R1: 8, R2: 8 }, { I1: 1, I2: 1 }),
  ],
  "opamp-inverting": [
    k("gain −2", { Rf: 20, Rin: 10, Vin: 1.5 }, { G: -2, GdB: 20 * Math.log10(2), Vout: -3 }),
    k("gain −1", { Rf: 4.7, Rin: 4.7, Vin: 3 }, { G: -1, GdB: 0, Vout: -3 }),
    k("gain −100", { Rf: 100, Rin: 1 }, { G: -100, GdB: 40 }),
  ],
  "opamp-non-inverting": [
    k("gain 2", { Rf: 10, Rg: 10, Vin: 1.2 }, { G: 2, GdB: 20 * Math.log10(2), Vout: 2.4 }),
    k("gain 11", { Rf: 100, Rg: 10, Vin: 0.1 }, { G: 11, Vout: 1.1 }),
    k("gain 3", { Rf: 2, Rg: 1 }, { G: 3, GdB: 20 * Math.log10(3) }),
  ],
  "rc-lowpass-response": [
    k("10 kΩ, 10 nF at 1 kHz", { R: 10, C: 0.01, f: 1000 }, (() => {
      const fc = 1000 / (2 * PI * 10 * 0.01);
      const g = 1 / Math.sqrt(1 + (1000 / fc) ** 2);
      return { fc, gain: g, gaindB: 20 * Math.log10(g), phase: deg(-Math.atan(1000 / fc)) };
    })()),
    k("at one tenth of fc", { R: 1, C: 1, f: 15.91549430919 }, { gain: 1 / Math.sqrt(1.01), phase: deg(-Math.atan(0.1)) }),
    k("dc", { R: 2, C: 2, f: 0 }, { fc: 1000 / (2 * PI * 2 * 2), gain: 1, gaindB: 0, phase: 0 }),
  ],
  wavelength: [
    k("1 MHz in vacuum", { f: 1, vf: 1 }, { lambda: C0 / 1e6, quarter: C0 / 4e6 }),
    k("velocity factor 0.66 at 10 MHz", { f: 10, vf: 0.66 }, { lambda: 0.66 * C0 / 1e7, quarter: 0.66 * C0 / 4e7 }),
    k("433 MHz", { f: 433, vf: 1 }, { lambda: C0 / 433e6 }),
  ],
  "skin-depth": [
    k("copper at 60 Hz", { rho: 1.72e-8, f: 60, mur: 1 }, { delta: Math.sqrt(1.72e-8 / (PI * 60 * MU0)) * 1000 }),
    k("aluminium at 50 Hz", { rho: 2.65e-8, f: 50, mur: 1 }, { delta: Math.sqrt(2.65e-8 / (PI * 50 * MU0)) * 1000 }),
    k("steel µr=200 at 50 Hz", { rho: 1.7e-7, f: 50, mur: 200 }, { delta: Math.sqrt(1.7e-7 / (PI * 50 * MU0 * 200)) * 1000 }),
  ],
  "battery-runtime": [
    k("500 mAh at 250 mA, full", { C: 500, I: 250, k: 1 }, { t: 2 }),
    k("2500 mAh at 500 mA, 80 %", { C: 2500, I: 500, k: 0.8 }, { t: 4 }),
    k("100 mAh at 10 mA, 70 %", { C: 100, I: 10, k: 0.7 }, { t: 7 }),
  ],
  "adc-resolution": [
    k("8 bit, 5 V", { n: 8, Vref: 5 }, { lsb: (5 / 256) * 1000, levels: 256, snr: 6.02 * 8 + 1.76 }),
    k("10 bit, 3.3 V", { n: 10, Vref: 3.3 }, { lsb: (3.3 / 1024) * 1000, levels: 1024, snr: 6.02 * 10 + 1.76 }),
    k("1 bit, 1 V", { n: 1, Vref: 1 }, { lsb: 500, levels: 2, snr: 6.02 + 1.76 }),
  ],
  "pcb-trace-width": [
    k("2 A, 10 °C, 1 oz outer", { I: 2, dT: 10, oz: 1, layer: 0.048 }, (() => {
      const A = (2 / (0.048 * 10 ** 0.44)) ** (1 / 0.725);
      return { w: (A / 1.378) * 0.0254, area: A * 0.0254 ** 2 };
    })()),
    k("3 A, 20 °C, 2 oz outer", { I: 3, dT: 20, oz: 2, layer: 0.048 }, (() => {
      const A = (3 / (0.048 * 20 ** 0.44)) ** (1 / 0.725);
      return { w: (A / (2 * 1.378)) * 0.0254 };
    })()),
    k("0.5 A, 10 °C, 1 oz inner", { I: 0.5, dT: 10, oz: 1, layer: 0.024 }, (() => {
      const A = (0.5 / (0.024 * 10 ** 0.44)) ** (1 / 0.725);
      return { w: (A / 1.378) * 0.0254 };
    })()),
  ],
  "wheatstone-bridge": [
    k("2× unknown, 10 V", { Vs: 10, R1: 100, R2: 100, R3: 100, Rx: 200 }, { Vout: 10 * (100 / 300 - 0.5) * 1000, Rbal: 100 }),
    k("balance ratio 2", { Vs: 12, R1: 200, R2: 100, R3: 150, Rx: 300 }, { Vout: 0, Rbal: 300 }),
    k("small unbalance", { Vs: 1, R1: 1000, R2: 1000, R3: 1000, Rx: 1010 }, { Vout: 1 * (1000 / 2010 - 0.5) * 1000, Rbal: 1000 }),
  ],
  "timer-555-astable": [
    k("equal resistors, 50 % is unreachable; duty 2/3", { R1: 10, R2: 10, C: 1 }, { f: 1440 / 30, duty: (20 / 30) * 100, T: 1000 / (1440 / 30) }),
    k("R2 ≫ R1, near 50 %", { R1: 1, R2: 100, C: 0.1 }, { f: 1440 / (201 * 0.1), duty: (101 / 201) * 100 }),
    k("1 Hz-class", { R1: 10, R2: 68, C: 10 }, { f: 1440 / (146 * 10), duty: (78 / 146) * 100 }),
  ],
  "capacitor-energy": [
    k("100 µF at 5 V", { C: 100, V: 5 }, { E: 0.5 * 100e-6 * 25, Q: 100e-6 * 5 }),
    k("10 µF at 100 V", { C: 10, V: 100 }, { E: 0.05, Q: 0.001 }),
    k("1 µF at 1 V", { C: 1, V: 1 }, { E: 5e-7, Q: 1e-6 }),
  ],
  "inductor-energy": [
    k("1 mH at 1 A", { L: 1, I: 1 }, { E: 0.0005 }),
    k("100 mH at 0.5 A", { L: 100, I: 0.5 }, { E: 0.5 * 0.1 * 0.25 }),
    k("5 mH at 4 A", { L: 5, I: 4 }, { E: 0.5 * 0.005 * 16 }),
  ],
  "delta-star": [
    k("10, 10, 20", { Rab: 10, Rbc: 10, Rca: 20 }, { Ra: 200 / 40, Rb: 100 / 40, Rc: 200 / 40 }),
    k("6, 3, 2", { Rab: 6, Rbc: 3, Rca: 2 }, { Ra: 12 / 11, Rb: 18 / 11, Rc: 6 / 11 }),
    k("100, 200, 300", { Rab: 100, Rbc: 200, Rca: 300 }, { Ra: 30000 / 600, Rb: 20000 / 600, Rc: 60000 / 600 }),
  ],
  "coax-impedance": [
    k("D/d = e² in air is 120 Ω", { D: Math.E ** 2, d: 1, er: 1 }, { Z0: 120, vf: 1, delay: 1e9 / C0 }),
    k("foam dielectric 1.5, D/d = e", { D: Math.E, d: 1, er: 1.5 }, { Z0: 60 / Math.sqrt(1.5), vf: 1 / Math.sqrt(1.5) }),
    k("75 Ω-class polyethylene", { D: 4.6, d: 0.8, er: 2.3 }, { Z0: (60 / Math.sqrt(2.3)) * Math.log(4.6 / 0.8), vf: 1 / Math.sqrt(2.3) }),
  ],
  "motor-current-3ph": [
    k("unity pf and efficiency", { P: 10, V: 400, pf: 1, eff: 100 }, { I: 10000 / (Math.sqrt(3) * 400), Pin: 10 }),
    k("2.2 kW, 0.8 pf, 85 %", { P: 2.2, V: 230, pf: 0.8, eff: 85 }, { I: 2200 / (Math.sqrt(3) * 230 * 0.8 * 0.85), Pin: 2.2 / 0.85 }),
    k("100 kW, 690 V", { P: 100, V: 690, pf: 0.9, eff: 95 }, { I: 100000 / (Math.sqrt(3) * 690 * 0.9 * 0.95) }),
  ],
  "induction-motor-slip": [
    k("2-pole 50 Hz at 2940 rpm", { f: 50, p: 2, n: 2940 }, { ns: 3000, s: 2 }),
    k("8-pole 50 Hz at 720 rpm", { f: 50, p: 8, n: 720 }, { ns: 750, s: 4 }),
    k("4-pole 60 Hz at 1750 rpm", { f: 60, p: 4, n: 1750 }, { ns: 1800, s: (50 / 1800) * 100 }),
  ],
  "energy-cost": [
    k("100 W for 10 h, 1 day", { P: 100, h: 10, days: 1, price: 10 }, { E: 1, cost: 10 }),
    k("zero price", { P: 500, h: 4, days: 10, price: 0 }, { E: 20, cost: 0 }),
    k("2 kW, 3 h, 7 days", { P: 2000, h: 3, days: 7, price: 6 }, { E: 42, cost: 252 }),
  ],
  "voltage-regulation": [
    k("no drop", { Vnl: 230, Vfl: 230 }, { reg: 0 }),
    k("5 V on 115 V", { Vnl: 120, Vfl: 115 }, { reg: (5 / 115) * 100 }),
    k("24 to 22", { Vnl: 24, Vfl: 22 }, { reg: (2 / 22) * 100 }),
  ],
  "transformer-fault-current": [
    k("100 kVA, 400 V, 4 %", { S: 100, V: 400, Z: 4 }, { Ifl: 100000 / (Math.sqrt(3) * 400), Isc: 100000 / (Math.sqrt(3) * 400 * 0.04) / 1000 }),
    k("2 MVA, 11 kV, 8 %", { S: 2000, V: 11000, Z: 8 }, { Ifl: 2e6 / (Math.sqrt(3) * 11000), Isc: 2e6 / (Math.sqrt(3) * 11000 * 0.08) / 1000 }),
    k("10 kVA, 230 V, 3 %", { S: 10, V: 230, Z: 3 }, { Isc: 10000 / (Math.sqrt(3) * 230 * 0.03) / 1000 }),
  ],
  "ac-cable-voltage-drop-3ph": [
    k("unity pf, resistance only", { I: 10, L: 1, R: 1, X: 0, pf: 1, V: 400 }, { dV: Math.sqrt(3) * 10 * 1, pct: (Math.sqrt(3) * 10 * 100) / 400 }),
    k("zero pf, reactance only", { I: 10, L: 0.5, R: 0, X: 0.2, pf: 0, V: 400 }, { dV: Math.sqrt(3) * 10 * 0.5 * 0.2 }),
    k("short run", { I: 20, L: 0.05, R: 0.5, X: 0.08, pf: 0.8, V: 230 }, { dV: Math.sqrt(3) * 20 * 0.05 * (0.5 * 0.8 + 0.08 * 0.6) }),
  ],
  thd: [
    k("no harmonics", { V1: 230, Vh: [0, 0] }, { thd: 0, rms: 230 }),
    k("10 % third only", { V1: 100, Vh: [10] }, { thd: 10, rms: Math.hypot(100, 10) }),
    k("equal 2nd and 3rd", { V1: 50, Vh: [5, 5] }, { thd: (Math.hypot(5, 5) / 50) * 100, rms: Math.hypot(50, 5, 5) }),
  ],
  "load-factor": [
    k("flat load", { avg: 80, peak: 80, connected: 80 }, { lf: 100, df: 100 }),
    k("average half the peak", { avg: 25, peak: 50, connected: 200 }, { lf: 50, df: 25 }),
    k("peak equals connected", { avg: 40, peak: 100, connected: 100 }, { lf: 40, df: 100 }),
    k("average a third of the peak", { avg: 20, peak: 60, connected: 90 }, { lf: (20 / 60) * 100, df: (60 / 90) * 100 }),
  ],
  "buck-output-ripple": [
    k("2 A, 200 kHz, 47 µF", { dI: 2, fsw: 200, C: 47 }, { dV: (2 / (8 * 200e3 * 47e-6)) * 1000 }),
    k("0.2 A, 1 MHz, 10 µF", { dI: 0.2, fsw: 1000, C: 10 }, { dV: (0.2 / (8 * 1e6 * 10e-6)) * 1000 }),
    k("4 A, 50 kHz, 220 µF", { dI: 4, fsw: 50, C: 220 }, { dV: (4 / (8 * 50e3 * 220e-6)) * 1000 }),
  ],
  "boost-inductor-ripple": [
    k("doubling at 50 kHz", { Vin: 12, Vout: 24, fsw: 50, L: 22 }, { D: 0.5, dI: (12 * 0.5) / (50e3 * 22e-6) }),
    k("5 V to 15 V", { Vin: 5, Vout: 15, fsw: 100, L: 33 }, { D: 1 - 5 / 15, dI: (5 * (1 - 5 / 15)) / (100e3 * 33e-6) }),
    k("small step-up", { Vin: 20, Vout: 25, fsw: 250, L: 15 }, { D: 0.2, dI: (20 * 0.2) / (250e3 * 15e-6) }),
  ],
  "switching-loss": [
    k("no overlap, conduction only", { V: 100, I: 2, tr: 0, tf: 0, fsw: 100, Irms: 1, Rds: 50 }, { Psw: 0, Pcond: 0.05, Ptot: 0.05 }),
    k("10 ns edges", { V: 12, I: 4, tr: 10, tf: 10, fsw: 200, Irms: 2, Rds: 20 }, { Psw: 0.5 * 12 * 4 * 20e-9 * 200e3, Pcond: 4 * 0.02, Ptot: 0.5 * 12 * 4 * 20e-9 * 200e3 + 0.08 }),
    k("zero Rds", { V: 48, I: 1, tr: 100, tf: 100, fsw: 10, Irms: 1, Rds: 0 }, { Psw: 0.5 * 48 * 1 * 200e-9 * 10e3, Pcond: 0 }),
  ],
  heatsink: [
    k("1 W, large margin", { P: 1, Ta: 25, Tjmax: 125, Rjc: 2, Rcs: 1 }, { RsaMax: 100 - 3 }),
    k("exactly at the limit", { P: 10, Ta: 40, Tjmax: 150, Rjc: 1, Rcs: 0.5, Rsa: 9.5 }, { RsaMax: 9.5, Tj: 150 }),
    k("hot ambient", { P: 5, Ta: 70, Tjmax: 125, Rjc: 1.5, Rcs: 0.5, Rsa: 4 }, { RsaMax: 55 / 5 - 2, Tj: 70 + 5 * 6 }),
  ],
  "converter-efficiency": [
    k("ideal", { Pin: 50, Pout: 50 }, { eff: 100, loss: 0 }),
    k("half", { Pin: 20, Pout: 10 }, { eff: 50, loss: 10 }),
    k("1 W lost from 25 W", { Pin: 25, Pout: 24 }, { eff: 96, loss: 1 }),
  ],
  "flyback-ideal": [
    k("50 % duty, turns 1", { Vin: 12, n: 1, D: 0.5 }, { Vout: 12 }),
    k("25 % duty", { Vin: 100, n: 0.2, D: 0.25 }, { Vout: 100 * 0.2 * 0.25 / 0.75 }),
    k("60 % duty", { Vin: 24, n: 2, D: 0.6 }, { Vout: 24 * 2 * 0.6 / 0.4 }),
  ],
  "forward-ideal": [
    k("half turns, half duty", { Vin: 100, n: 0.5, D: 0.5 }, { Vout: 25 }),
    k("unity", { Vin: 48, n: 1, D: 0.25 }, { Vout: 12 }),
    k("step-up turns", { Vin: 12, n: 4, D: 0.3 }, { Vout: 14.4 }),
    k("low duty", { Vin: 325, n: 0.05, D: 0.2 }, { Vout: 3.25 }),
  ],
  "inverter-spwm": [
    k("m = 0.5", { Vdc: 100, m: 0.5 }, { Vph: 25, Vll: 0.5 * Math.sqrt(3) * 100 / (2 * Math.sqrt(2)) }),
    k("m = 1, 100 V", { Vdc: 100, m: 1 }, { Vph: 50, Vll: Math.sqrt(3) * 100 / (2 * Math.sqrt(2)) }),
    k("540 V bus, m = 0.9", { Vdc: 540, m: 0.9 }, { Vph: 0.9 * 270, Vll: 0.9 * Math.sqrt(3) * 540 / (2 * Math.sqrt(2)) }),
  ],
  "inverter-svpwm": [
    k("m = 0.5", { Vdc: 100, m: 0.5 }, { Vph: 50 / Math.sqrt(3), Vll: 50 / Math.sqrt(2) }),
    k("m = 1, 100 V", { Vdc: 100, m: 1 }, { Vph: 100 / Math.sqrt(3), Vll: 100 / Math.sqrt(2) }),
    k("400 V, m = 0.75", { Vdc: 400, m: 0.75 }, { Vph: 0.75 * 400 / Math.sqrt(3), Vll: 0.75 * 400 / Math.sqrt(2) }),
  ],
  "battery-pack": [
    k("1s1p", { S: 1, P: 1, Vc: 3.7, Cc: 2 }, { V: 3.7, C: 2, E: 3.7 * 2 / 1000, cells: 1 }),
    k("4s2p", { S: 4, P: 2, Vc: 3.7, Cc: 2.5 }, { V: 14.8, C: 5, E: 14.8 * 5 / 1000, cells: 8 }),
    k("7s1p", { S: 7, P: 1, Vc: 3.6, Cc: 5 }, { V: 25.2, C: 5, E: 25.2 * 5 / 1000, cells: 7 }),
  ],
};
