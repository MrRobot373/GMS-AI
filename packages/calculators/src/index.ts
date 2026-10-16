/**
 * GEM AI calculators: tested engineering formulas, a unit system, an expression engine for the
 * keypad calculators, and math tools. Plain code, no model: the same functions run in the browser
 * (instant results) and on the server (history, and the chat tool).
 */
export * from "./units";
export * from "./expression";
export { differentiate, simplify, toString as formatExpression, dependsOn } from "./symbolic";
export * as calculus from "./calculus";
export * as algebra from "./algebra";
export * as matrix from "./matrix";
export * as stats from "./stats";
export * as finance from "./finance";
export * as tools from "./tools";
export { TOOLS, type ToolInfo } from "./tools";
export { CATEGORIES, CalcError, checkDefinition, type CalculatorDef, type InputDef, type OutputDef, type RefCase } from "./registry";
export { CALCULATORS, CORE } from "./defs";
export { formatNumber, getCalculator, runCalculator, type InputValue, type RunResult } from "./run";
export { calculatorCatalog, searchCalculators, type CatalogEntry } from "./catalog";
