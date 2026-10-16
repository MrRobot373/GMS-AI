import { expect } from "vitest";
import type { CalculatorDef, RefCase } from "../registry";
import { runCalculator, type InputValue } from "../run";

/** Run one reference case and compare every expected output. */
export function checkRef(def: CalculatorDef, ref: RefCase) {
  const given: Record<string, InputValue> = {};
  for (const [k, v] of Object.entries(ref.inputs)) {
    const inp = def.inputs.find((i) => i.key === k)!;
    if (Array.isArray(v) && v.length === 2 && typeof v[1] === "string") given[k] = { value: v[0] as number, unit: v[1] };
    else given[k] = { value: v as number | number[], unit: inp.unit };
  }
  const units: Record<string, string> = {};
  for (const [k, v] of Object.entries(ref.expect)) if (Array.isArray(v)) units[k] = v[1];
  const r = runCalculator(def.id, given, units);
  for (const [k, v] of Object.entries(ref.expect)) {
    const want = Array.isArray(v) ? v[0] : v;
    const got = r.outputs.find((o) => o.key === k);
    expect(got, `${def.id}: output ${k} missing (${ref.note})`).toBeDefined();
    const tol = ref.tol ?? 1e-6;
    const err = want === 0 ? Math.abs(got!.value) : Math.abs(got!.value - want) / Math.abs(want);
    expect(err, `${def.id}.${k}: got ${got!.value}, expected ${want} (${ref.note})`).toBeLessThanOrEqual(want === 0 ? 1e-9 : tol);
  }
  return r;
}
