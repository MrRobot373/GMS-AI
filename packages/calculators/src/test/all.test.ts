/** Every calculator: well-formed definitions and passing reference cases. */
import { describe, expect, it } from "vitest";
import { CALCULATORS } from "../defs";
import { checkDefinition } from "../registry";
import { calculatorCatalog, searchCalculators } from "../catalog";
import { checkRef } from "./refs";

describe("all calculators", () => {
  it("ids are unique", () => {
    const ids = CALCULATORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("there are many of them", () => {
    expect(CALCULATORS.length).toBeGreaterThan(150);
  });
  it("every formula calculator is verified against at least five cases", () => {
    const beta = CALCULATORS.filter((c) => c.status !== "verified" || c.refs.length < 5).map((c) => c.id);
    expect(beta).toEqual([]);
  });
  for (const c of CALCULATORS) {
    it(`${c.id}: definition`, () => expect(checkDefinition(c)).toEqual([]));
    c.refs.forEach((ref, i) => it(`${c.id}: reference ${i + 1} (${ref.note})`, () => void checkRef(c, ref)));
  }
});

describe("catalog", () => {
  it("lists tools and formulas without code", () => {
    const cat = calculatorCatalog();
    expect(cat.some((e) => e.kind === "tool" && e.id === "scientific")).toBe(true);
    expect(JSON.parse(JSON.stringify(cat)).length).toBe(cat.length);
  });
  it("search ranks by name and keywords", () => {
    expect(searchCalculators("buck converter")[0]!.id).toBe("buck-ideal");
    expect(searchCalculators("ohm")[0]!.id).toBe("ohms-law");
    expect(searchCalculators("three phase")[0]!.id).toBe("three-phase-power");
    expect(searchCalculators("zzzz")).toEqual([]);
  });
});
