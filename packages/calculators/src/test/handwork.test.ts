/** Every extra case is worked from the stated formula, then checked against the engine. */
import { describe, expect, it } from "vitest";
import { HAND } from "../defs/handworked";
import { HAND_REST } from "../defs/handworked-rest";

const CASES = { ...HAND, ...HAND_REST };
import { CALCULATORS } from "../defs";
import { runCalculator, type InputValue } from "../run";

function run(id: string, inputs: Record<string, number | number[]>) {
  const def = CALCULATORS.find((c) => c.id === id)!;
  const given: Record<string, InputValue> = {};
  for (const [key, value] of Object.entries(inputs)) {
    const inp = def.inputs.find((i) => i.key === key)!;
    given[key] = { value, unit: inp.unit };
  }
  return runCalculator(id, given);
}

describe("hand-worked cases match the engine", () => {
  for (const [id, cases] of Object.entries(CASES)) {
    describe(id, () => {
      cases.forEach((c, i) => {
        it(`${i + 1}: ${c.note}`, () => {
          const r = run(id, c.inputs);
          for (const [key, want] of Object.entries(c.expect)) {
            const got = r.outputs.find((o) => o.key === key);
            expect(got, key).toBeDefined();
            const err = want === 0 ? Math.abs(got!.value) : Math.abs(got!.value - want) / Math.abs(want);
            expect(err, `${key}: got ${got!.value}, expected ${want}`).toBeLessThanOrEqual(want === 0 ? 1e-9 : 1e-8);
          }
        });
      });
    });
  }
});
