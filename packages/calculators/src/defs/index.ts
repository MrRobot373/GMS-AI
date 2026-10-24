import type { CalculatorDef } from "../registry";
import { CORE } from "./core";
import { ELECTRICAL } from "./electrical";
import { EVERYDAY } from "./everyday";
import { MECHANICAL } from "./mechanical";
import { SCIENCE } from "./science";

/** Every formula calculator. The release twenty are listed first; the rest are verified the same way. */
export const CALCULATORS: CalculatorDef[] = [...CORE, ...ELECTRICAL, ...MECHANICAL, ...SCIENCE, ...EVERYDAY];
export { CORE };
