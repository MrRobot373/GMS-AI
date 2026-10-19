/**
 * Inputs outside a formula's range are refused, never turned into a number: the ground rod outside
 * Dwight's slender-rod geometry, and any temperature below absolute zero, in whatever unit it's typed.
 */
import { describe, expect, it } from "vitest";
import { CALCULATORS } from "../defs";
import { CalcError } from "../registry";
import { getCalculator, runCalculator, type InputValue } from "../run";
import { conversion, convert } from "../units";

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CalcError);
    return { message: (e as CalcError).message, field: (e as CalcError).field };
  }
  throw new Error("expected the inputs to be refused");
};
const value = (id: string, inputs: Record<string, InputValue | number>, key: string) => runCalculator(id, inputs).outputs.find((o) => o.key === key)!.value;

describe("ground rod resistance (Dwight)", () => {
  it("uses the radius in ln(4L/a): ln(8L/d) with the diameter", () => {
    const def = getCalculator("ground-rod-resistance");
    expect(def.version).toBe(2);
    expect(def.formula[0]).toBe("R = ρ / (2π·L)·(ln(8L / d) - 1)");
    // IEEE Std 142 (Green Book): 10 ft × 5/8 in rod in 100 Ω·m soil ≈ 33.1 Ω (the old formula gave 29.8).
    expect(value("ground-rod-resistance", { rho: 100, L: 3.05, d: 15.9 }, "R")).toBeCloseTo(33.06, 2);
    expect(value("ground-rod-resistance", { rho: 100, L: { value: 10, unit: "ft" }, d: { value: 0.625, unit: "in" } }, "R")).toBeCloseTo(33.089, 3);
  });
  it("refuses a rod that isn't slender, naming the fields, instead of a negative resistance", () => {
    // ρ = 100 Ω·m, L = 0.1 m, d = 1000 mm gave ≈ −304.987 Ω.
    const r = refusal(() => runCalculator("ground-rod-resistance", { rho: 100, L: 0.1, d: 1000 }));
    expect(r.field).toBe("L");
    expect(r.message).toMatch(/rod length \(L\).*rod diameter \(d\)/);
    expect(r.message).toMatch(/L\/d = 0\.1/);
    expect(refusal(() => runCalculator("ground-rod-resistance", { rho: 100, L: 0.5, d: 60 })).message).toMatch(/slender/);
    // Right at the limit it runs, and the result is positive.
    expect(value("ground-rod-resistance", { rho: 100, L: 1, d: 100 }, "R")).toBeGreaterThan(0);
    expect(getCalculator("ground-rod-resistance").assumptions.join(" ")).toMatch(/at least 10 × d/);
  });
  it("never returns zero or a negative resistance for any slender rod", () => {
    for (const L of [0.5, 1, 3, 10, 30]) for (const d of [5, 16, 25]) {
      if (L < (10 * d) / 1000) continue;
      expect(value("ground-rod-resistance", { rho: 100, L, d }, "R"), `L ${L} d ${d}`).toBeGreaterThan(0);
    }
  });
});

describe("temperatures below absolute zero", () => {
  it("heat radiation refuses −300 °C (it gave a number)", () => {
    const r = refusal(() => runCalculator("heat-radiation", { eps: 0.9, A: 1, Ts: { value: -300, unit: "C" }, Tinf: { value: 20, unit: "C" } }));
    expect(r).toEqual({ message: "Surface temperature is below absolute zero (0 K = −273.15 °C = −459.67 °F).", field: "Ts" });
    expect(refusal(() => runCalculator("heat-radiation", { eps: 0.9, A: 1, Ts: 100, Tinf: { value: -1, unit: "K" } })).field).toBe("Tinf");
    // 0 K itself is a temperature; Q = −εσA·T∞⁴.
    expect(value("heat-radiation", { eps: 1, A: 1, Ts: { value: 0, unit: "K" }, Tinf: { value: 300, unit: "K" } }, "Q")).toBeCloseTo(-5.670374419e-8 * 300 ** 4, 9);
  });
  it("every temperature input of every calculator refuses it, in °C, °F, K and °R", () => {
    const withTemperature = CALCULATORS.filter((c) => c.inputs.some((i) => i.quantity === "temperature"));
    expect(withTemperature.map((c) => c.id).sort()).toEqual(["antoine", "arrhenius", "heat-radiation", "heatsink", "ideal-gas", "mach-number", "thermistor-beta"]);
    for (const c of withTemperature) {
      const base: Record<string, InputValue> = {};
      for (const [k, v] of Object.entries(c.refs[0]!.inputs)) {
        base[k] = Array.isArray(v) && typeof v[1] === "string" ? { value: v[0] as number, unit: v[1] } : { value: v as number, unit: c.inputs.find((i) => i.key === k)!.unit };
      }
      for (const inp of c.inputs.filter((i) => i.quantity === "temperature")) {
        for (const t of [{ value: -300, unit: "C" }, { value: -273.16, unit: "C" }, { value: -460, unit: "F" }, { value: -0.01, unit: "K" }, { value: -1, unit: "R" }]) {
          const r = refusal(() => runCalculator(c.id, { ...base, [inp.key]: t }));
          expect(r.field, `${c.id}.${inp.key} at ${t.value} ${t.unit}`).toBe(inp.key);
          expect(r.message).toMatch(/below absolute zero/);
        }
      }
    }
  });
  it("one case per family: gas law, Arrhenius, speed of sound, vapour pressure, thermistor, heatsink", () => {
    expect(refusal(() => runCalculator("ideal-gas", { p: 101.325, V: 22.4, T: { value: -500, unit: "F" } })).field).toBe("T");
    expect(refusal(() => runCalculator("arrhenius", { A: 1e13, Ea: 50, T: -300 })).message).toBe("Temperature is below absolute zero (0 K = −273.15 °C = −459.67 °F).");
    expect(refusal(() => runCalculator("mach-number", { V: 300, T: { value: -280, unit: "C" } })).field).toBe("T");
    expect(refusal(() => runCalculator("antoine", { A: 8.07131, B: 1730.63, C: 233.426, T: -274 })).field).toBe("T");
    expect(refusal(() => runCalculator("thermistor-beta", { R0: 10, T0: -300, beta: 3950, T: 50 })).field).toBe("T0");
    expect(refusal(() => runCalculator("heatsink", { P: 20, Ta: -300, Tjmax: 125, Rjc: 0.5, Rcs: 0.2 })).field).toBe("Ta");
    // The vapour-pressure temperature is now read in any unit: 212 °F is 100 °C, water boils at 760 mmHg.
    expect(value("antoine", { A: 8.07131, B: 1730.63, C: 233.426, T: { value: 212, unit: "F" } }, "P")).toBeCloseTo(760.0863691649, 6);
    // Exactly 0 K where the formula divides by T is still refused by the calculator's own limit.
    expect(refusal(() => runCalculator("arrhenius", { A: 1e13, Ea: 50, T: { value: 0, unit: "K" } })).message).toBe("Temperature must be greater than 0 K.");
  });
  it("a computed temperature below absolute zero is refused too", () => {
    // β model far outside its range: 1/T = 1/T₀ + ln(R/R₀)/β goes negative.
    expect(refusal(() => runCalculator("thermistor-beta", { R0: 10, T0: 25, beta: 3950, R: 1e-30 })).message).toBe(
      "Temperature would be below absolute zero (0 K = −273.15 °C = −459.67 °F): these inputs are outside the formula's range.",
    );
    expect(value("thermistor-beta", { R0: 10, T0: 25, beta: 3950, R: 5 }, "T")).toBeCloseTo(41.46023479819, 9);
  });
  it("the unit converter refuses it too, but converts absolute zero and temperature differences", () => {
    expect(() => conversion(-300, "temperature", "C", "K")).toThrow("-300 °C is below absolute zero (0 K = −273.15 °C = −459.67 °F).");
    expect(() => convert(-500, "temperature", "F", "C")).toThrow(/below absolute zero/);
    expect(() => convert(-1, "temperature", "K", "C")).toThrow(/below absolute zero/);
    expect(convert(-273.15, "temperature", "C", "K")).toBe(0);
    expect(convert(-459.67, "temperature", "F", "K")).toBe(0);
    expect(conversion(-300, "temperatureDelta", "dC", "dF").result).toBeCloseTo(-540, 9);
  });
});
