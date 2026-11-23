/**
 * Running a calculator: check every input, convert to base units, compute, refuse anything that
 * isn't a finite number, and convert the results to the units asked for.
 */
import { CALCULATORS } from "./defs";
import { CalcError, type CalculatorDef } from "./registry";
import { quantity, unitOf, UnitError } from "./units";

export interface InputValue {
  value: number | number[] | null | undefined;
  unit?: string | null;
}

export interface RunResult {
  calculatorId: string;
  version: number;
  /** Inputs as given (value + unit), for history. */
  inputs: Record<string, { value: number | number[]; unit: string }>;
  outputs: { key: string; label: string; symbol?: string; value: number; unit: string; unitSymbol: string; base: number; quantity: string }[];
  warnings: string[];
  steps: string[];
  formula: string[];
  assumptions: string[];
}

const byId = new Map(CALCULATORS.map((c) => [c.id, c]));

export function getCalculator(id: string): CalculatorDef {
  const c = byId.get(id);
  if (!c) throw new CalcError(`There's no calculator "${id}".`);
  return c;
}

export function runCalculator(id: string, given: Record<string, InputValue | number>, outputUnits: Record<string, string> = {}): RunResult {
  const def = getCalculator(id);
  const values: Record<string, number> = {};
  const lists: Record<string, number[]> = {};
  const echo: RunResult["inputs"] = {};

  for (const inp of def.inputs) {
    const raw = given[inp.key];
    const iv: InputValue = typeof raw === "number" ? { value: raw } : (raw ?? { value: null });
    // Only nothing is missing; something that isn't a number (NaN, a typo) is an error, even when optional.
    const missing = iv.value === null || iv.value === undefined || (Array.isArray(iv.value) && iv.value.length === 0);
    if (missing) {
      if (inp.optional) continue;
      throw new CalcError(`${inp.label} is required.`, inp.key);
    }
    let unit;
    try {
      unit = unitOf(inp.quantity, inp.options ? null : (iv.unit ?? inp.unit));
    } catch (e) {
      throw new CalcError(e instanceof UnitError ? `${inp.label}: ${e.message}` : String(e), inp.key);
    }
    const floor = quantity(inp.quantity).floor;
    const check = (v: unknown): number => {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new CalcError(`${inp.label} must be a number.`, inp.key);
      if (inp.options && !inp.options.some((o) => o.value === v)) throw new CalcError(`${inp.label}: pick one of the options.`, inp.key);
      const b = unit.toBase(v);
      if (!Number.isFinite(b)) throw new CalcError(`${inp.label} is out of range for this unit.`, inp.key);
      // Every temperature, whatever its unit: −300 °C is 0 K minus 26.85, not a temperature.
      if (floor && b < floor.value) throw new CalcError(`${inp.label} is ${floor.reason}.`, inp.key);
      if (inp.integer && !Number.isInteger(b)) throw new CalcError(`${inp.label} must be a whole number.`, inp.key);
      if (inp.min !== undefined && (inp.exclusiveMin ? b <= inp.min : b < inp.min)) {
        throw new CalcError(`${inp.label} must be ${inp.exclusiveMin ? "greater than" : "at least"} ${fmtLimit(inp.min, inp.quantity, unit.id)}.`, inp.key);
      }
      if (inp.max !== undefined && (inp.exclusiveMax ? b >= inp.max : b > inp.max)) {
        throw new CalcError(`${inp.label} must be ${inp.exclusiveMax ? "less than" : "at most"} ${fmtLimit(inp.max, inp.quantity, unit.id)}.`, inp.key);
      }
      return b;
    };
    if (inp.list) {
      const arr = Array.isArray(iv.value) ? iv.value : [iv.value as number];
      if (arr.length > 100) throw new CalcError(`${inp.label}: at most 100 values.`, inp.key);
      lists[inp.key] = arr.map(check);
      echo[inp.key] = { value: arr, unit: unit.id };
    } else {
      if (Array.isArray(iv.value)) throw new CalcError(`${inp.label} takes one value.`, inp.key);
      values[inp.key] = check(iv.value);
      echo[inp.key] = { value: iv.value as number, unit: unit.id };
    }
  }

  if (def.pick) {
    const given2 = def.pick.keys.filter((k) => k in values);
    if (given2.length !== def.pick.count) {
      const names = def.pick.keys.map((k) => def.inputs.find((i) => i.key === k)?.symbol ?? k).join(", ");
      throw new CalcError(`Enter exactly ${def.pick.count} of ${names} (you entered ${given2.length}).`);
    }
  }

  let res;
  try {
    res = def.compute(Object.assign(values, { lists }));
  } catch (e) {
    if (e instanceof CalcError) throw e;
    throw new CalcError(e instanceof Error ? e.message : "The calculation failed.");
  }

  const outputs: RunResult["outputs"] = [];
  for (const out of def.outputs) {
    const v = res.values[out.key];
    if (v === undefined) {
      if (out.optional) continue;
      throw new CalcError(`${out.label} couldn't be computed from these inputs.`);
    }
    // A non-finite number is an error, never an answer.
    if (!Number.isFinite(v)) throw new CalcError(`${out.label} isn't a finite number for these inputs (division by zero or overflow).`);
    const floor = quantity(out.quantity).floor;
    if (floor && v < floor.value) throw new CalcError(`${out.label} would be ${floor.reason}: these inputs are outside the formula's range.`);
    let unit;
    try {
      unit = unitOf(out.quantity, outputUnits[out.key] ?? out.unit);
    } catch (e) {
      throw new CalcError(e instanceof UnitError ? `${out.label}: ${e.message}` : String(e));
    }
    const shown = unit.fromBase(v);
    if (!Number.isFinite(shown)) throw new CalcError(`${out.label} can't be shown in ${unit.symbol || unit.name}.`);
    outputs.push({ key: out.key, label: out.label, symbol: out.symbol, value: shown, unit: unit.id, unitSymbol: unit.symbol, base: v, quantity: out.quantity });
  }
  return {
    calculatorId: def.id,
    version: def.version,
    inputs: echo,
    outputs,
    warnings: res.warnings ?? [],
    steps: res.steps ?? [],
    formula: def.formula,
    assumptions: def.assumptions,
  };
}

function fmtLimit(base: number, quantity: string, unitId: string): string {
  const u = unitOf(quantity, unitId);
  const v = u.fromBase(base);
  return `${Number(v.toPrecision(6))}${u.symbol ? ` ${u.symbol}` : ""}`;
}

/** Engineering-friendly number text: up to `digits` significant digits, exponent form when far from 1. */
export function formatNumber(v: number, digits = 6, mode: "auto" | "sci" | "eng" | "fix" = "auto", fixed = 2): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (mode === "fix") return v.toFixed(fixed);
  if (mode === "sci") return v.toExponential(digits - 1).replace(/\.?0+e/, "e");
  if (mode === "eng") {
    const e = Math.floor(Math.log10(a) / 3) * 3;
    const m = v / 10 ** e;
    return `${Number(m.toPrecision(digits))}${e ? `e${e}` : ""}`;
  }
  if (a >= 1e-4 && a < 1e12) return String(Number(v.toPrecision(digits)));
  return v.toExponential(digits - 1).replace(/\.?0+e/, "e");
}

/**
 * How a number typed on a calculator screen is read: a decimal point, an optional sign (− counts) and
 * optional e-notation. A comma is refused rather than guessed (1,000 and 2,5 mean different things in
 * different places), and so are hex, binary and words that JavaScript's Number() would accept.
 * Empty text is null.
 */
export function readNumber(text: string): { value: number } | { error: "comma" | "invalid" } | null {
  const s = text.trim().replace(/\u2212/g, "-");
  if (!s) return null;
  if (s.includes(",")) return { error: "comma" };
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(s)) return { error: "invalid" };
  const value = Number(s);
  return Number.isFinite(value) ? { value } : { error: "invalid" };
}

/** Why a typed value can't be used: blank, a comma, or not a plain number. */
export class InputError extends Error {}

/**
 * A number typed on a tool screen, read strictly (see readNumber): blank, "2,5", "0x10" or "abc" throw an InputError
 * that says what to type, instead of becoming 0, 2, 16 or NaN.
 */
export function strictNumber(text: string, what = "This field"): number {
  const r = readNumber(text);
  if (!r) throw new InputError(`${what} is empty: enter a number.`);
  if ("error" in r) throw new InputError(r.error === "comma" ? `${what}: use a point for decimals and no thousands separators (2.5, 1500).` : `${what}: "${text.trim()}" isn't a number.`);
  return r.value;
}

/** An optional typed number: its default when left blank, strict otherwise. */
export const optionalNumber = (text: string, fallback: number, what?: string) => (text.trim() ? strictNumber(text, what) : fallback);

/**
 * A list of numbers typed in one field ("10, 20, 30", "10 20 30" or "10; 20; 30"). A comma that looks like a thousands
 * separator next to list commas ("1,500, 2,200") is refused instead of being read as four numbers.
 */
export function readList(text: string, what = "The list"): number[] {
  const s = text.trim();
  if (!s) throw new InputError(`${what} is empty: enter numbers separated by commas or spaces.`);
  // Comma+space or semicolons separate items; then a digit,3-digits group inside an item is a thousands separator.
  const spaced = /,\s|;/.test(s);
  if (spaced && /\d,\d{3}(?!\d)/.test(s.replace(/,\s+/g, " ")))
    throw new InputError(`${what}: don't use commas inside numbers (1500, not 1,500). Separate the numbers with commas or spaces.`);
  return s
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((x) => strictNumber(x, what));
}
