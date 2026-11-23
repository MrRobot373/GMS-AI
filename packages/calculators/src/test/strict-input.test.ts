/** Typed numbers on the tool screens are read strictly (CALC-PLAN-X1, CALC-09): no guessing at blanks or commas. */
import { describe, expect, it } from "vitest";
import { InputError, optionalNumber, readList, strictNumber } from "../run";

describe("strict typed numbers", () => {
  it("reads plain numbers, signs and e-notation", () => {
    expect(strictNumber("2.5")).toBe(2.5);
    expect(strictNumber(" -3 ")).toBe(-3);
    expect(strictNumber("−4")).toBe(-4);
    expect(strictNumber("1.5e3")).toBe(1500);
  });

  it("refuses a blank, a comma, hex and words instead of guessing", () => {
    expect(() => strictNumber("", "Rate")).toThrow(/Rate is empty/);
    expect(() => strictNumber("   ")).toThrow(InputError);
    expect(() => strictNumber("2,5", "Rate")).toThrow(/use a point for decimals/);
    expect(() => strictNumber("8,5")).toThrow(/no thousands separators/);
    expect(() => strictNumber("0x10")).toThrow(/isn't a number/);
    expect(() => strictNumber("Infinity")).toThrow(/isn't a number/);
    expect(() => strictNumber("12abc")).toThrow(/isn't a number/);
  });

  it("uses a default only when a field is left blank", () => {
    expect(optionalNumber("", 4)).toBe(4);
    expect(optionalNumber("6", 4)).toBe(6);
    expect(() => optionalNumber("6,5", 4)).toThrow(InputError);
  });

  it("reads lists, and refuses thousands separators mixed with list commas", () => {
    expect(readList("10, 20, 30")).toEqual([10, 20, 30]);
    expect(readList("10 20 30")).toEqual([10, 20, 30]);
    expect(readList("1;2;3")).toEqual([1, 2, 3]);
    expect(readList("1,2,3")).toEqual([1, 2, 3]);
    expect(readList("-100000, 30000, 35000")).toEqual([-100000, 30000, 35000]);
    // "1,500, 2,200" is two numbers written with separators, not four numbers.
    expect(() => readList("1,500, 2,200")).toThrow(/don't use commas inside numbers/);
    expect(() => readList("1,500; 2,200")).toThrow(/don't use commas inside numbers/);
    expect(() => readList("")).toThrow(/is empty/);
    expect(() => readList("10, abc")).toThrow(/isn't a number/);
  });
});
