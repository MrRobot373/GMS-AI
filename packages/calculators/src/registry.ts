/**
 * Formula calculators: each is a definition with its inputs, outputs, formula, assumptions and
 * reference cases. The numbers come from `compute`, plain code; no model is involved. Values
 * reach `compute` in each quantity's base unit (SI) and leave it the same way.
 *
 * status "verified": checked against at least five hand-worked reference cases (the GEM AI
 * December list). "beta": checked against fewer cases; shown with a label, and an admin can hide them.
 */
import { QUANTITIES, unitOf, UnitError } from "./units";

export interface InputDef {
  key: string;
  label: string;
  /** Symbol in the formula (V, I, R…). */
  symbol?: string;
  quantity: string;
  /** Unit shown first; defaults to the quantity's base unit. */
  unit?: string;
  /** Allowed range, in the base unit. */
  min?: number;
  max?: number;
  /** min/max themselves not allowed. */
  exclusiveMin?: boolean;
  exclusiveMax?: boolean;
  integer?: boolean;
  optional?: boolean;
  /** Pre-filled value, in `unit`. */
  default?: number;
  help?: string;
  /** A fixed choice instead of a number (the value is the option's). */
  options?: { value: number; label: string }[];
  /** A list of values (resistors in parallel...). */
  list?: boolean;
}

export interface OutputDef {
  key: string;
  label: string;
  symbol?: string;
  quantity: string;
  unit?: string;
  /** Not shown unless computed (an optional result). */
  optional?: boolean;
}

export interface ComputeResult {
  values: Record<string, number>;
  warnings?: string[];
  steps?: string[];
}

export interface RefCase {
  /** Plain numbers are in the input's display unit; [value, unitId] picks another. */
  inputs: Record<string, number | number[] | [number, string]>;
  /** Expected outputs in the output's display unit (or [value, unitId]). */
  expect: Record<string, number | [number, string]>;
  /** Relative tolerance (default 1e-6). */
  tol?: number;
  /** Where the expected number comes from. */
  note: string;
}

export interface CalculatorDef {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  description: string;
  keywords?: string[];
  /** The formula as people read it, one line each. */
  formula: string[];
  assumptions: string[];
  inputs: InputDef[];
  outputs: OutputDef[];
  /** Inputs given as `{ key: value }` in base units; missing optional ones are absent. */
  compute: (v: Record<string, number> & { lists: Record<string, number[]> }) => ComputeResult;
  /** At least one; five or more for "verified". */
  refs: RefCase[];
  status: "verified" | "beta";
  /** Bumped when the formula changes, kept with each history entry. */
  version: number;
  /** Exactly this many of the optional inputs must be given ("any two of V, I, R, P"). */
  pick?: { count: number; keys: string[] };
}

export class CalcError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
  }
}

export const CATEGORIES = [
  { id: "basic", name: "Basic electrical" },
  { id: "electrical", name: "Electrical power" },
  { id: "electronics", name: "Electronics" },
  { id: "power-electronics", name: "Power electronics" },
  { id: "mechanical", name: "Mechanical" },
  { id: "civil", name: "Civil & structural" },
  { id: "thermal", name: "Thermal & fluids" },
  { id: "instrumentation", name: "Instrumentation & control" },
  { id: "computer", name: "Computer engineering" },
  { id: "chemical", name: "Chemical" },
  { id: "aerospace", name: "Aerospace" },
  { id: "environmental", name: "Environmental" },
  { id: "materials", name: "Materials" },
  { id: "physics", name: "Physics" },
  { id: "chemistry", name: "Chemistry" },
  { id: "geometry", name: "Geometry" },
  { id: "math", name: "Math" },
  { id: "finance", name: "Finance" },
  { id: "health", name: "Health & life" },
  { id: "everyday", name: "Everyday" },
] as const;

const quantityIds = new Set(QUANTITIES.map((q) => q.id));

/** Sanity checks on a definition (run by the tests for every calculator). */
export function checkDefinition(d: CalculatorDef): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9-]+$/.test(d.id)) problems.push(`${d.id}: id must be kebab-case`);
  if (!CATEGORIES.some((c) => c.id === d.category)) problems.push(`${d.id}: unknown category ${d.category}`);
  for (const io of [...d.inputs, ...d.outputs]) {
    if (!quantityIds.has(io.quantity)) problems.push(`${d.id}.${io.key}: unknown quantity ${io.quantity}`);
    else {
      try {
        unitOf(io.quantity, io.unit);
      } catch (e) {
        if (e instanceof UnitError) problems.push(`${d.id}.${io.key}: ${e.message}`);
      }
    }
  }
  const keys = [...d.inputs, ...d.outputs].map((x) => x.key);
  if (new Set(d.inputs.map((x) => x.key)).size !== d.inputs.length) problems.push(`${d.id}: duplicate input keys`);
  if (new Set(d.outputs.map((x) => x.key)).size !== d.outputs.length) problems.push(`${d.id}: duplicate output keys`);
  if (d.refs.length < 1) problems.push(`${d.id}: needs at least one reference case`);
  if (d.status === "verified" && d.refs.length < 5) problems.push(`${d.id}: verified calculators need five reference cases`);
  if (!d.assumptions.length) problems.push(`${d.id}: state at least one assumption`);
  for (const r of d.refs) for (const k of [...Object.keys(r.inputs), ...Object.keys(r.expect)]) if (!keys.includes(k)) problems.push(`${d.id}: reference uses unknown key ${k}`);
  return problems;
}
