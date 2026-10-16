/**
 * The GEM AI release calculators: 100+ golden cases worked by hand, then the edge cases every
 * calculator must handle (zeros, invalid input, unit mismatches, extremes, division by zero).
 * A non-finite result is an error, never an answer.
 */
import { describe, expect, it } from "vitest";
import { CORE } from "../defs";
import { CalcError, checkDefinition } from "../registry";
import { runCalculator } from "../run";
import { checkRef } from "./refs";

describe("release calculators: definitions", () => {
  it("has the twenty planned calculators", () => {
    expect(CORE.map((c) => c.id).sort()).toEqual(
      [
        "ohms-law", "dc-power-energy", "resistors-series-parallel", "voltage-divider",
        "single-phase-ac-power", "three-phase-power", "power-factor-correction", "transformer-ratio", "dc-cable-voltage-drop",
        "rc-time-constant", "capacitors-series-parallel", "reactance", "led-resistor",
        "buck-ideal", "boost-ideal", "buck-boost-inverting", "buck-inductor-ripple",
        "torque-speed-power", "axial-stress", "thermal-expansion",
      ].sort(),
    );
  });
  it("counts at least 100 golden cases", () => {
    expect(CORE.reduce((n, c) => n + c.refs.length, 0)).toBeGreaterThanOrEqual(100);
  });
  for (const c of CORE) {
    it(`${c.id} is well formed and verified`, () => {
      expect(checkDefinition(c)).toEqual([]);
      expect(c.status).toBe("verified");
      expect(c.refs.length).toBeGreaterThanOrEqual(5);
    });
  }
});

describe("release calculators: golden cases", () => {
  for (const c of CORE) {
    describe(c.id, () => {
      c.refs.forEach((ref, i) => {
        it(`case ${i + 1}: ${ref.note}`, () => {
          checkRef(c, ref);
        });
      });
    });
  }
});

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CalcError);
    return (e as CalcError).message;
  }
  throw new Error("expected an error");
};

describe("release calculators: edge cases", () => {
  it("every calculator refuses empty input", () => {
    for (const c of CORE) expect(() => runCalculator(c.id, {}), c.id).toThrow(CalcError);
  });
  it("every calculator refuses NaN, Infinity and strings", () => {
    for (const c of CORE) {
      const first = c.inputs.find((i) => !i.optional && !i.options) ?? c.inputs[0]!;
      for (const bad of [Infinity, -Infinity, "12" as unknown as number]) {
        const base = Object.fromEntries(c.refs[0]!.inputs ? Object.entries(c.refs[0]!.inputs).map(([k, v]) => [k, { value: Array.isArray(v) && typeof v[1] === "string" ? (v[0] as number) : (v as number), unit: Array.isArray(v) && typeof v[1] === "string" ? v[1] : c.inputs.find((i) => i.key === k)!.unit }]) : []);
        base[first.key] = { value: (first.list ? [bad] : bad) as number, unit: first.unit };
        expect(() => runCalculator(c.id, base), `${c.id} with ${String(bad)}`).toThrow(CalcError);
      }
    }
  });
  it("refuses a unit from another quantity", () => {
    expect(err(() => runCalculator("ohms-law", { V: { value: 12, unit: "A" }, R: { value: 4, unit: "ohm" } }))).toMatch(/not a unit of voltage/);
    expect(err(() => runCalculator("thermal-expansion", { alpha: 12, L0: { value: 1, unit: "kg" }, dT: 10 }))).toMatch(/not a unit of length/);
  });
  it("converts units on the way in and out", () => {
    const r = runCalculator("ohms-law", { V: { value: 12000, unit: "mV" }, R: { value: 0.004, unit: "kohm" } }, { I: "mA", P: "kW" });
    expect(r.outputs.find((o) => o.key === "I")!.value).toBeCloseTo(3000, 9);
    expect(r.outputs.find((o) => o.key === "P")!.value).toBeCloseTo(0.036, 12);
  });
  it("Ohm's law: exactly two inputs, no division by zero", () => {
    expect(err(() => runCalculator("ohms-law", { V: 12 }))).toMatch(/exactly 2/);
    expect(err(() => runCalculator("ohms-law", { V: 12, I: 1, R: 12 }))).toMatch(/exactly 2/);
    expect(err(() => runCalculator("ohms-law", { V: 12, I: 0 }))).toMatch(/zero/);
    expect(err(() => runCalculator("ohms-law", { I: 0, P: 5 }))).toMatch(/zero/);
    expect(err(() => runCalculator("ohms-law", { V: 0, P: 5 }))).toMatch(/zero/);
    expect(err(() => runCalculator("ohms-law", { R: 0, V: 5 }))).toMatch(/greater than 0/);
    expect(err(() => runCalculator("ohms-law", { R: 10, P: -1 }))).toMatch(/at least 0/);
    expect(err(() => runCalculator("ohms-law", { V: 5, I: -1 }))).toMatch(/negative resistance/);
  });
  it("Ohm's law: zero voltage gives zero current and power", () => {
    const r = runCalculator("ohms-law", { V: 0, R: 10 });
    expect(r.outputs.map((o) => o.value)).toEqual([0, 0, 10, 0]);
  });
  it("division by zero is an error, never Infinity", () => {
    expect(err(() => runCalculator("boost-ideal", { Vin: 12, D: 1 }))).toMatch(/less than 1/);
    expect(err(() => runCalculator("buck-boost-inverting", { Vin: 12, D: 1 }))).toMatch(/less than 1/);
    expect(err(() => runCalculator("rc-time-constant", { R: 0, C: 1 }))).toMatch(/greater than 0/);
    expect(err(() => runCalculator("resistors-series-parallel", { R: { value: [10, 0] } }))).toMatch(/greater than 0/);
    expect(err(() => runCalculator("torque-speed-power", { P: 1, n: 0 }))).toMatch(/zero/);
    expect(err(() => runCalculator("transformer-ratio", { Np: 100, Ns: 0, Vp: 230 }))).toMatch(/greater than 0/);
  });
  it("extreme numbers overflow to an error, not a result", () => {
    expect(err(() => runCalculator("ohms-law", { V: 1e308, I: 1e308 }))).toMatch(/finite/);
    expect(err(() => runCalculator("dc-power-energy", { V: 1e200, I: 1e200, t: 1e10 }))).toMatch(/finite/);
    // Tiny but valid values still work.
    const r = runCalculator("rc-time-constant", { R: { value: 1e-3, unit: "ohm" }, C: { value: 1, unit: "pF" } });
    expect(r.outputs.find((o) => o.key === "tau")!.base).toBeCloseTo(1e-15, 25);
  });
  it("ratios stay in range", () => {
    expect(err(() => runCalculator("buck-ideal", { Vin: 48, D: 1.2 }))).toMatch(/at most 1/);
    expect(err(() => runCalculator("buck-ideal", { Vin: 48, D: -0.1 }))).toMatch(/at least 0/);
    expect(err(() => runCalculator("buck-ideal", { Vin: 48, D: { value: 120, unit: "percent" } }))).toMatch(/at most 100 %/);
    expect(err(() => runCalculator("single-phase-ac-power", { V: 230, I: 1, pf: 1.1 }))).toMatch(/at most 1/);
    expect(err(() => runCalculator("power-factor-correction", { P: 10, pf1: 0.9, pf2: 0.8, V: 230, f: 50, conn: 1 }))).toMatch(/higher than the present/);
    expect(err(() => runCalculator("power-factor-correction", { P: 10, pf1: 0.8, pf2: 0.9, V: 230, f: 50, conn: 2 }))).toMatch(/options/);
  });
  it("physical impossibilities are refused", () => {
    expect(err(() => runCalculator("led-resistor", { Vs: 5, Vf: 3, If: 20, n: 2 }))).toMatch(/higher than the LEDs/);
    expect(err(() => runCalculator("led-resistor", { Vs: 5, Vf: 2, If: 20, n: 1.5 }))).toMatch(/whole number/);
    expect(err(() => runCalculator("buck-inductor-ripple", { Vin: 5, Vout: 12, fsw: 100, L: 10 }))).toMatch(/lower than its input/);
    expect(err(() => runCalculator("dc-cable-voltage-drop", { I: 100, L: 100, A: 0.5, rho: 0.01724, V: 12 }))).toMatch(/larger than the supply/);
    expect(err(() => runCalculator("reactance", { f: 50 }))).toMatch(/inductance, a capacitance/);
  });
  it("warnings flag results outside the formula's comfort zone", () => {
    expect(runCalculator("dc-cable-voltage-drop", { I: 10, L: 20, A: 2.5, rho: 0.01724, V: 24 }).warnings[0]).toMatch(/3 %/);
    expect(runCalculator("boost-ideal", { Vin: 12, D: 0.9 }).warnings[0]).toMatch(/0.85/);
    expect(runCalculator("buck-inductor-ripple", { Vin: 12, Vout: 5, fsw: 100, L: 22, Iout: 0.2 }).warnings[0]).toMatch(/discontinuous/);
    expect(runCalculator("axial-stress", { F: 100, A: 100, Sy: 250 }).warnings[0]).toMatch(/yields/);
  });
  it("records the formula version with each result", () => {
    const r = runCalculator("buck-ideal", { Vin: 48, D: 0.4 });
    expect(r.version).toBe(1);
    expect(r.formula[0]).toBe("V_out = D·V_in");
    expect(r.assumptions[0]).toMatch(/continuous-conduction/);
    expect(r.inputs).toEqual({ Vin: { value: 48, unit: "V" }, D: { value: 0.4, unit: "fraction" } });
  });
  it("refuses an unknown calculator", () => {
    expect(err(() => runCalculator("warp-drive", {}))).toMatch(/no calculator/);
  });
});
