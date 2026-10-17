/**
 * The chat calculator tool reads numbers the way the person wrote them, or not at all: thousands groups
 * are one number, an ambiguous comma stops the tool, and a model's proposal only counts in the unit
 * that was written. No database needed.
 */
import { getCalculator } from "@aatmiq/calculators";
import { describe, expect, it } from "vitest";
import { acceptModelInputs, ambiguousNumber, findCalculation, readQuantities } from "./services/calc-tool";

const out = (r: Awaited<ReturnType<typeof findCalculation>>, key: string) => r?.outputs.find((o) => o.key === key)?.value;

describe("chat calculator tool: reading numbers", () => {
  it("reads thousands groups as one number, and the Unicode minus", () => {
    expect(readQuantities("at 1,440 rpm").map((q) => [q.value, q.unit])).toEqual([[1440, "rpm"]]);
    expect(readQuantities("1,00,000 W").map((q) => q.value)).toEqual([100000]);
    expect(readQuantities("12,345.5 V").map((q) => q.value)).toEqual([12345.5]);
    expect(readQuantities("−5 V").map((q) => q.value)).toEqual([-5]);
  });
  it("calls a comma between digits that isn't a thousands group ambiguous", () => {
    for (const t of ["3,3 V", "2,5", "7,5 kW", "10,22,47"]) expect(ambiguousNumber(t), t).toBe(true);
    for (const t of ["1,440 rpm", "1,00,000 W", "10, 22, 47", "a, b and 5 V"]) expect(ambiguousNumber(t), t).toBe(false);
  });
  it("runs on grouped numbers, and refuses rather than guesses", async () => {
    const r = await findCalculation({ text: "How much torque does a motor make at 7.5 kW and 1,440 rpm?", showBeta: false });
    expect(r?.calculatorId).toBe("torque-speed-power");
    expect(out(r, "T")).toBeCloseTo(49.7359, 3);
    // 7,5 kW: 7.5 or 75? The tool doesn't run.
    expect(await findCalculation({ text: "How much torque does a motor make at 7,5 kW and 1440 rpm?", showBeta: false })).toBeNull();
    // /calc with a comma inside a value doesn't run with the part before it.
    expect(await findCalculation({ text: "/calc buck-ideal Vin=1,000V D=0.5", showBeta: false })).toBeNull();
    expect(out(await findCalculation({ text: "/calc buck-ideal Vin=48V D=0.5", showBeta: false }), "Vout")).toBe(24);
  });
});

describe("chat calculator tool: what a model proposes", () => {
  const buck = getCalculator("buck-ideal");
  const text = "What does a buck give at 48 V in and 0.4 duty?";
  it("takes a number in the unit the person wrote, not the one the model claims", () => {
    expect(acceptModelInputs(buck, text, { Vin: { value: 48, unit: "kV" }, D: { value: 0.4 } })).toEqual({ Vin: { value: 48, unit: "V" }, D: { value: 0.4, unit: "fraction" } });
  });
  it("drops numbers that weren't written, and uses each written number once", () => {
    expect(acceptModelInputs(buck, text, { Vin: { value: 24, unit: "V" } })).toEqual({});
    const two = acceptModelInputs(getCalculator("buck-inductor-ripple"), "ripple from 12 V with 100 kHz and 22 uH", { Vin: { value: 12, unit: "V" }, Vout: { value: 12, unit: "V" } });
    expect(Object.keys(two)).toEqual(["Vin"]);
  });
  it("keeps a bare number only in the input's own unit", () => {
    const bare = "buck from 48 at 0.4 duty";
    expect(acceptModelInputs(buck, bare, { Vin: { value: 48 } })).toEqual({ Vin: { value: 48, unit: "V" } });
    expect(acceptModelInputs(buck, bare, { Vin: { value: 48, unit: "mV" } })).toEqual({});
  });
  it("refuses a written number of another quantity", () => {
    expect(acceptModelInputs(buck, "buck at 48 A and 0.4 duty", { Vin: { value: 48, unit: "V" } })).toEqual({});
  });
});
