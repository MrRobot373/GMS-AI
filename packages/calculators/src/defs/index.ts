import type { CalculatorDef } from "../registry";
import { CORE } from "./core";
import { ELECTRICAL } from "./electrical";
import { EVERYDAY } from "./everyday";
import { MECHANICAL } from "./mechanical";
import { SCIENCE } from "./science";

/** Every formula calculator: the release twenty first, then the rest (beta). */
export const CALCULATORS: CalculatorDef[] = [...CORE, ...ELECTRICAL, ...MECHANICAL, ...SCIENCE, ...EVERYDAY];
export { CORE };
