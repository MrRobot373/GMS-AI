import { CalcError, type CalculatorDef, type InputDef, type OutputDef, type RefCase } from "../registry";
import { HAND } from "./handworked";
import { HAND_REST } from "./handworked-rest";

const EXTRA: Record<string, RefCase[]> = { ...HAND, ...HAND_REST };

/** Short constructors for definitions. */
export const inp = (key: string, label: string, quantity: string, unit?: string, extra: Partial<InputDef> = {}): InputDef => ({ key, label, quantity, unit, ...extra });
export const out = (key: string, label: string, quantity: string, unit?: string, extra: Partial<OutputDef> = {}): OutputDef => ({ key, label, quantity, unit, ...extra });

export function def(d: Omit<CalculatorDef, "version" | "status"> & { version?: number; status?: CalculatorDef["status"] }): CalculatorDef {
  const more = (EXTRA[d.id] ?? []).filter((h) => !d.refs.some((r) => JSON.stringify(r.inputs) === JSON.stringify(h.inputs)));
  const refs = [...d.refs, ...more];
  // Verified means five reference cases worked from the stated formula. See handworked.ts.
  return { version: 1, ...d, refs, status: refs.length >= 5 ? "verified" : "beta" };
}

/** Throw a domain error the person can act on. */
export function fail(message: string, field?: string): never {
  throw new CalcError(message, field);
}

export function nonZero(v: number, what: string, field?: string): number {
  if (v === 0) fail(`${what} can't be zero (division by zero).`, field);
  return v;
}

/** Positive, non-zero (min 0, exclusive). */
export const pos = { min: 0, exclusiveMin: true } as const;
export const nonneg = { min: 0 } as const;
export const fraction01 = { min: 0, max: 1 } as const;

export const sq = (x: number) => x * x;
export const DEG = Math.PI / 180;
export const G0 = 9.80665;

/** E-series standard resistor values (IEC 60063). */
export const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];
export const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];

/** The next standard value at or above v in a series (E24 by default). */
export function nextStandard(v: number, series = E24): number {
  if (!(v > 0)) return v;
  const dec = Math.floor(Math.log10(v)) - 1;
  for (let d = dec; d <= dec + 1; d++) {
    for (const s of series) {
      const c = Number((s * 10 ** d).toPrecision(3));
      if (c >= v * (1 - 1e-9)) return c;
    }
  }
  return Number((series[0]! * 10 ** (dec + 2)).toPrecision(3));
}
