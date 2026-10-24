/**
 * The chat calculator tool reads numbers the way the person wrote them, or not at all: thousands groups
 * are one number, an ambiguous comma stops the tool, and a model's proposal only counts in the unit
 * that was written. No database needed.
 */
import { calculatorCatalog, getCalculator } from "@aatmiq/calculators";
import { describe, expect, it } from "vitest";
import { acceptModelInputs, ambiguousNumber, calcContext, dispatchCalculatorTool, findCalculation, readQuantities, runCalculatorTool, saveChatCalculation, searchCalculatorsTool } from "./services/calc-tool";

const out = (r: Awaited<ReturnType<typeof findCalculation>>, key: string) => r?.outputs.find((o) => o.key === key)?.value;

describe("chat calculator tool: reading numbers", () => {
  it("reads thousands groups as one number, and the Unicode minus", () => {
    expect(readQuantities("at 1,440 rpm").map((q) => [q.value, q.unit])).toEqual([[1440, "rpm"]]);
    expect(readQuantities("1,00,000 W").map((q) => q.value)).toEqual([100000]);
    expect(readQuantities("12,345.5 V").map((q) => q.value)).toEqual([12345.5]);
    expect(readQuantities("−5 V").map((q) => q.value)).toEqual([-5]);
    // Units with ² as typed (m² wasn't read, so "area 1 m²" fitted no area input), and as m2.
    expect(readQuantities("area 1 m², 2.5 mm² and 3 m2").map((q) => [q.value, q.q, q.unit])).toEqual([[1, "area", "m2"], [2.5, "area", "mm2"], [3, "area", "m2"]]);
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
  it("reads /calc values with and without units, in any order", async () => {
    // "Vin=48 D=0.5" read "D=0.5" as Vin's unit and didn't run.
    expect(out(await findCalculation({ text: "/calc buck-ideal Vin=48 D=0.5", showBeta: false }), "Vout")).toBe(24);
    expect(out(await findCalculation({ text: "/calc buck-ideal D=0.5 Vin=48 V", showBeta: false }), "Vout")).toBe(24);
    expect(out(await findCalculation({ text: "/calc ohms-law V=12 R=4", showBeta: false }), "I")).toBe(3);
    expect(out(await findCalculation({ text: "/calc ohms-law V=12V R=0.004kohm", showBeta: false }), "I")).toBe(3);
  });
});

describe("chat calculator tool: inputs the formula doesn't cover", () => {
  it("passes on the refusal, with no result, instead of leaving the model to compute one", async () => {
    // Dwight's formula gave ≈ −305 Ω for a 0.1 m rod 1000 mm thick.
    const rod = await findCalculation({ text: "/calc ground-rod-resistance rho=100 L=0.1m d=1000mm", showBeta: true });
    expect(rod).toMatchObject({ calculatorId: "ground-rod-resistance", version: 2, outputs: [], refused: { field: "L" } });
    expect(rod!.refused!.message).toMatch(/slender rod/);
    expect(rod!.inputs.map((i) => [i.key, i.value, i.unit])).toEqual([["rho", 100, "Ω·m"], ["L", 0.1, "m"], ["d", 1000, "mm"]]);
    const ctx = calcContext(rod!);
    expect(ctx).toMatch(/refused the user's numbers: Dwight's formula is for a slender rod/);
    expect(ctx).toMatch(/Don't work out a result for these numbers yourself/);
    expect(ctx).not.toMatch(/Results:/);
    // A question with numbers: −300 °C is below absolute zero.
    const hot = await findCalculation({ text: "What is the net radiation heat flow for emissivity 0.9, area 1 m², surface temperature −300 °C and surroundings temperature 20 °C?", showBeta: true });
    expect(hot).toMatchObject({ calculatorId: "heat-radiation", via: "rules", outputs: [], refused: { field: "Ts" } });
    expect(hot!.refused!.message).toMatch(/below absolute zero/);
    // The same question at 100 °C runs.
    const ok = await findCalculation({ text: "What is the net radiation heat flow for emissivity 0.9, area 1 m², surface temperature 100 °C and surroundings temperature 20 °C?", showBeta: true });
    expect(ok?.refused).toBeUndefined();
    expect(out(ok, "Q")).toBeCloseTo(612.5474056958, 6);
  });
  it("still runs nothing for a command with an input missing or a unit it can't read", async () => {
    expect(await findCalculation({ text: "/calc ground-rod-resistance rho=100 L=3m", showBeta: true })).toBeNull();
    expect(await findCalculation({ text: "/calc heat-radiation eps=0.9 A=1 Ts=-300furlongs Tinf=20", showBeta: true })).toBeNull();
  });
  it("keeps a refusal out of the calculation history", async () => {
    const rod = await findCalculation({ text: "/calc ground-rod-resistance rho=100 L=0.1m d=1000mm", showBeta: true });
    const db = { insert: () => { throw new Error("nothing should be saved"); } } as unknown as Parameters<typeof saveChatCalculation>[0];
    await expect(saveChatCalculation(db, "u", "w", rod!)).resolves.toBeUndefined();
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

describe("calculator tool calls", () => {
  it("runs the calculator the model names, from a JSON string or an object", () => {
    const json = runCalculatorTool("ohms-law", '{"V":{"value":12,"unit":"V"},"R":4}', false);
    expect(json.calculation?.via).toBe("tool");
    expect(json.calculation?.outputs.find((o) => o.key === "I")?.value).toBe(3);
    expect(json.text).toMatch(/tested code/);
    const obj = dispatchCalculatorTool("calculators_run", { calculator_id: "ohms-law", inputs: { V: 12, R: 4 } }, false);
    expect(obj.calculation?.outputs.find((o) => o.key === "I")?.value).toBe(3);
  });
  it("searches by words, and does not offer a calculator that is hidden", () => {
    expect(searchCalculatorsTool("ohm current resistance", false)).toMatch(/id: ohms-law/);
    expect(runCalculatorTool("not-a-calculator", { V: 1 }, false).text).toMatch(/no calculator/i);
    const beta = calculatorCatalog().find((c) => c.kind === "formula" && c.status === "beta");
    if (!beta) return;
    expect(runCalculatorTool(beta.id, {}, false).text).toMatch(/not available/);
    expect(searchCalculatorsTool(beta.name, false)).not.toContain(`id: ${beta.id}`);
  });
  it("does not invent a number when the formula refuses the inputs", () => {
    const r = dispatchCalculatorTool("calculators_run", { calculator_id: "ground-rod-resistance", inputs_json: { rho: 100, L: 0.1, d: 1000 } }, true);
    expect(r.calculation?.refused?.field).toBe("L");
    expect(r.calculation?.outputs).toEqual([]);
    expect(r.text).toMatch(/Don't work out a result/);
  });
});
