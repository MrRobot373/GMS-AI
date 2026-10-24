/**
 * Calculators as a tool for chat (docs/15-gem-ai.md): "what is the ideal output at 48 V and 0.4
 * duty?" runs the tested function, and the model only explains the numbers it's given.
 *
 * Finding the calculation, in order:
 *   1. "/calc <id> key=value unit …" runs exactly that calculator; "/calc <words and numbers>" goes to the rules.
 *   2. Rules: numbers with units are read from the message and matched to a calculator's inputs
 *      by quantity and by the words around them. Every number with a unit must find a place.
 *   3. With a real model (not the demo one), the model may map the question to one of a short
 *      list of calculators as JSON; the inputs it picks are still checked and run by the code.
 * Nothing is computed by a model; a result that doesn't run cleanly is never shown. When every input
 * is there but the calculator refuses them (a rod too thick for Dwight's formula, a temperature below
 * absolute zero), the refusal is passed on instead, so the model explains it rather than working out a
 * number of its own.
 */
import { calculatorHistory, type DB } from "@aatmiq/db";
import { CalcError, calculatorCatalog, getCalculator, QUANTITIES, runCalculator, searchCalculators, unitOf, type CalculatorDef, type InputValue, type RunResult } from "@aatmiq/calculators";
import { completeChat, type FunctionTool, type ProviderConfig } from "@aatmiq/model-gateway";
import { extractJson } from "@aatmiq/shared";

export interface CalcToolResult {
  calculatorId: string;
  name: string;
  status: "verified" | "beta";
  version: number;
  via: "command" | "rules" | "model" | "tool";
  /** unit: what people read ("kΩ"); unitId: the unit's id ("kohm"). */
  inputs: { key: string; label: string; symbol?: string; value: number | number[]; unit: string; unitId: string; assumed?: boolean }[];
  outputs: { key: string; label: string; symbol?: string; value: number; unit: string }[];
  warnings: string[];
  assumptions: string[];
  formula: string[];
  /** The calculator refused these inputs (outputs are empty): why, and the input it's about. */
  refused?: { message: string; field?: string };
}

interface Quantity {
  value: number;
  /** quantity id and unit id, when a unit was written. */
  q: string | null;
  unit: string | null;
  /** Words just before and after the number. */
  context: string;
  index: number;
}

/** Unit symbols as people type them, to [quantity, unit]. Case matters (mV vs MV) except for plain words. */
const UNIT_INDEX = (() => {
  const exact = new Map<string, [string, string]>();
  const loose = new Map<string, [string, string]>();
  const add = (sym: string, q: string, u: string) => {
    if (!sym || exact.has(sym)) return;
    exact.set(sym, [q, u]);
  };
  const skip = new Set(["dimensionless", "count", "money", "ratio", "cooking", "temperatureDelta", "fuelEconomy"]);
  for (const q of QUANTITIES) {
    if (skip.has(q.id)) continue;
    for (const u of q.units) {
      add(u.symbol, q.id, u.id);
      add(u.symbol.replace("µ", "u"), q.id, u.id);
      add(u.symbol.replace("Ω", "ohm"), q.id, u.id);
      add(u.symbol.replace("µ", "u").replace("Ω", "ohm"), q.id, u.id);
      // m² typed as m2.
      add(u.symbol.replace(/²/g, "2").replace(/³/g, "3"), q.id, u.id);
    }
  }
  // Words and common spellings.
  const words: [string, string, string][] = [
    ["volt", "voltage", "V"], ["volts", "voltage", "V"], ["kv", "voltage", "kV"], ["mv", "voltage", "mV"],
    ["amp", "current", "A"], ["amps", "current", "A"], ["ampere", "current", "A"], ["ma", "current", "mA"],
    ["ohm", "resistance", "ohm"], ["ohms", "resistance", "ohm"], ["kohm", "resistance", "kohm"], ["k", "resistance", "kohm"], ["kω", "resistance", "kohm"], ["mohm", "resistance", "Mohm"],
    ["watt", "power", "W"], ["watts", "power", "W"], ["kw", "power", "kW"], ["hp", "power", "hp"],
    ["hz", "frequency", "Hz"], ["khz", "frequency", "kHz"], ["mhz", "frequency", "MHz"],
    ["uh", "inductance", "uH"], ["mh", "inductance", "mH"], ["uf", "capacitance", "uF"], ["nf", "capacitance", "nF"], ["pf", "capacitance", "pF"],
    ["rpm", "angularSpeed", "rpm"], ["nm", "torque", "N·m"], ["n·m", "torque", "N·m"], ["n.m", "torque", "N·m"],
    ["mm2", "area", "mm2"], ["sqmm", "area", "mm2"], ["kva", "apparentPower", "kVA"], ["kvar", "reactivePower", "kvar"],
    ["kn", "force", "kN"], ["mpa", "pressure", "MPa"],
  ];
  for (const [w, q, u] of words) loose.set(w, [q, u]);
  return { exact, loose };
})();

function unitFor(token: string): [string, string] | null {
  // As typed first: the symbols themselves have ² and ³ (m², not m2).
  const t = token.replace(/²/g, "2").replace(/³/g, "3");
  return UNIT_INDEX.exact.get(token) ?? UNIT_INDEX.exact.get(t) ?? UNIT_INDEX.loose.get(t.toLowerCase()) ?? null;
}

// A number, with its thousands groups (1,440 and the Indian 1,00,000) read as one number.
const NUM = /(?<![\w.,])(-?(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3}|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(%|[A-Za-zµΩ°][A-Za-zµΩ°·./²³0-9]*)?/g;
const GROUPED = /(?<![\w.,])-?(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})(?![\d,])/g;
/** The Unicode minus is a minus (one character for one, so positions stay). */
const normal = (text: string) => text.replace(/\u2212/g, "-");
/**
 * A comma between digits that isn't a thousands group (2,5 or 3,3 V, a decimal comma?) can't be read
 * without guessing, so the tool doesn't run at all.
 */
export const ambiguousNumber = (text: string) => /\d,\d/.test(normal(text).replace(GROUPED, "0"));

export function readQuantities(input: string): Quantity[] {
  const text = normal(input);
  const out: Quantity[] = [];
  for (const m of text.matchAll(NUM)) {
    const value = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const token = (m[2] ?? "").replace(/[.,;:]+$/, "");
    const i = m.index ?? 0;
    const before = text.slice(Math.max(0, i - 40), i).toLowerCase();
    let q: string | null = null;
    let unit: string | null = null;
    let after = "";
    if (token === "%") {
      q = "ratio";
      unit = "percent";
    } else if (token) {
      const hit = unitFor(token);
      if (hit) [q, unit] = hit;
      else after = token.toLowerCase();
    }
    // The words right next to the number tell inputs apart: "12 V input", "from 12 V to 5 V", "0.4 duty".
    const wordsBefore = before.split(/[^\p{L}\p{N}_]+/u).filter(Boolean).slice(-3);
    const wordsAfter = text.slice(i + m[0].length, i + m[0].length + 30).toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean).slice(0, 2);
    out.push({ value, q, unit, context: [...wordsBefore, after, ...wordsAfter].join(" "), index: i });
  }
  return out;
}

/** Words that tell inputs of the same quantity apart. */
function cues(inp: CalculatorDef["inputs"][number]): string[] {
  const words = `${inp.key} ${inp.label} ${inp.symbol ?? ""}`.toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1);
  const extra: string[] = [];
  if (/in$|^vin|input|primary/.test(`${inp.key} ${inp.label}`.toLowerCase())) extra.push("input", "in", "from", "supply", "source");
  if (/out$|^vout|output|secondary/.test(`${inp.key} ${inp.label}`.toLowerCase())) extra.push("output", "out", "to", "load");
  if (inp.key === "D") extra.push("duty", "d");
  return [...words, ...extra].filter((w) => !["of", "the", "voltage", "current", "power"].includes(w));
}

const takesBare = (q: string) => q === "ratio" || q === "dimensionless" || q === "count";

/** Try to fill a calculator's inputs from the quantities in a message. */
function assign(def: CalculatorDef, qs: Quantity[]): { given: Record<string, InputValue>; assumed: string[] } | null {
  const given: Record<string, InputValue> = {};
  const used = new Set<number>();
  const free = def.inputs.filter((i) => !i.options && !i.list);
  // Numbers with a unit first, then bare ones.
  const order = [...qs.keys()].sort((a, b) => Number(qs[b]!.q !== null) - Number(qs[a]!.q !== null));
  for (const k of order) {
    const qn = qs[k]!;
    const fits = free.filter((i) => !(i.key in given) && (qn.q ? i.quantity === qn.q : takesBare(i.quantity)));
    if (!fits.length) continue;
    const score = (i: (typeof fits)[number]) => cues(i).filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(qn.context)).length;
    const best = [...fits].sort((a, b) => score(b) - score(a))[0]!;
    // A bare number only goes to an input whose words are near it ("0.4 duty").
    if (!qn.q && score(best) === 0) continue;
    given[best.key] = { value: qn.value, unit: qn.unit ?? (best.quantity === "ratio" ? (qn.value > 1 ? "percent" : "fraction") : undefined) };
    used.add(k);
  }
  // Every number with a unit must have found a place, or this isn't the right calculator.
  if (qs.some((q, k) => q.q && !used.has(k))) return null;
  const assumed: string[] = [];
  for (const i of def.inputs) {
    if (i.key in given || i.optional) continue;
    if (i.default !== undefined) {
      given[i.key] = { value: i.default, unit: i.unit };
      assumed.push(i.key);
    } else return null;
  }
  if (def.pick && def.pick.keys.filter((k) => k in given).length !== def.pick.count) return null;
  return { given, assumed };
}

/** Every input the calculator needs is there, so an error from it is about the values, not a gap. */
function complete(def: CalculatorDef, given: Record<string, InputValue>): boolean {
  return def.inputs.every((i) => i.optional || i.key in given) && (!def.pick || def.pick.keys.filter((k) => k in given).length === def.pick.count);
}

/** Run, or the calculator's refusal when the inputs are complete; null for anything else. */
function attempt(def: CalculatorDef, given: Record<string, InputValue>, via: CalcToolResult["via"], assumed: string[]): CalcToolResult | null {
  try {
    return describe(def, runCalculator(def.id, given), via, assumed);
  } catch (e) {
    return e instanceof CalcError && complete(def, given) ? refusal(def, given, via, assumed, e) : null;
  }
}

function refusal(def: CalculatorDef, given: Record<string, InputValue>, via: CalcToolResult["via"], assumed: string[], e: CalcError): CalcToolResult {
  return {
    calculatorId: def.id,
    name: def.name,
    status: def.status,
    version: def.version,
    via,
    inputs: def.inputs
      .filter((i) => i.key in given)
      .map((i) => {
        const v = given[i.key]!;
        let unit = { symbol: "", id: v.unit ?? i.unit ?? "" };
        try {
          const u = unitOf(i.quantity, i.options ? null : (v.unit ?? i.unit));
          unit = { symbol: u.symbol, id: u.id };
        } catch {
          /* shown as typed */
        }
        return { key: i.key, label: i.label, symbol: i.symbol, value: v.value as number | number[], unit: unit.symbol, unitId: unit.id, assumed: assumed.includes(i.key) || undefined };
      }),
    outputs: [],
    warnings: [],
    assumptions: def.assumptions,
    formula: def.formula,
    refused: { message: e.message, field: e.field },
  };
}

function describe(def: CalculatorDef, r: RunResult, via: CalcToolResult["via"], assumed: string[]): CalcToolResult {
  return {
    calculatorId: def.id,
    name: def.name,
    status: def.status,
    version: def.version,
    via,
    inputs: Object.entries(r.inputs).map(([key, v]) => {
      const i = def.inputs.find((x) => x.key === key)!;
      return { key, label: i.label, symbol: i.symbol, value: v.value, unit: unitOf(i.quantity, v.unit).symbol, unitId: v.unit, assumed: assumed.includes(key) || undefined };
    }),
    outputs: r.outputs.map((o) => ({ key: o.key, label: o.label, symbol: o.symbol, value: o.value, unit: o.unitSymbol })),
    warnings: r.warnings,
    assumptions: r.assumptions,
    formula: r.formula,
  };
}

const ASKS = /\b(calculate|compute|what\s+is|what's|whats|find|how\s+(much|many|long|big)|determine|size|work\s+out|estimate|give\s+me)\b|\?|=/i;

/** "/calc buck-ideal Vin=48V D=0.4" */
function command(text: string, allow: (d: CalculatorDef) => boolean): CalcToolResult | null {
  const m = /^\/calc\s+([a-z0-9-]+)\s*(.*)$/is.exec(normal(text).trim());
  if (!m) return null;
  // Vin=1,000V would otherwise run with 1: a comma inside a value stops the command.
  if (/=\s*-?[\d.]+,\d/.test(m[2]!)) return null;
  let def: CalculatorDef;
  try {
    def = getCalculator(m[1]!);
  } catch {
    return null;
  }
  if (!allow(def)) return null;
  const given: Record<string, InputValue> = {};
  // A unit is the word right after the value, unless that word is the next key (rho=100 L=3m).
  for (const p of m[2]!.split("\n")[0]!.matchAll(/([A-Za-z0-9_]+)\s*=\s*(-?[\d.eE+-]+)(?:\s*([^\s,;=]+)(?=[\s,;]|$)(?!\s*=))?/g)) {
    const inp = def.inputs.find((i) => i.key.toLowerCase() === p[1]!.toLowerCase());
    if (!inp) continue;
    let unit: string | undefined = inp.unit;
    if (p[3]) {
      // A unit's id ("kohm") or what people type ("kΩ", "%"); one that can't be read stops the run.
      const q = QUANTITIES.find((x) => x.id === inp.quantity);
      const byId = q?.units.find((x) => x.id === p[3]);
      const typed = p[3] === "%" ? ["ratio", "percent"] : unitFor(p[3]);
      if (byId) unit = byId.id;
      else if (typed && typed[0] === inp.quantity) unit = typed[1];
      else return null;
    }
    given[inp.key] = { value: Number(p[2]), unit };
  }
  const assumed: string[] = [];
  for (const i of def.inputs) if (!(i.key in given) && !i.optional && i.default !== undefined) {
    given[i.key] = { value: i.default, unit: i.unit };
    assumed.push(i.key);
  }
  return attempt(def, given, "command", assumed);
}

export interface CalcToolOptions {
  text: string;
  showBeta: boolean;
  /** The chat's model, for the model-assisted step (skipped for the demo model). */
  model?: { provider: ProviderConfig; modelKey: string } | null;
  onUsage?: (u: { inputTokens: number; outputTokens: number; estimated: boolean }) => Promise<void>;
}

export async function findCalculation(o: CalcToolOptions): Promise<CalcToolResult | null> {
  let text = o.text.slice(0, 2000);
  const allow = (d: CalculatorDef) => d.status === "verified" || o.showBeta;
  const cmd = command(text, allow);
  if (cmd) return cmd;
  if (/^\/calc\b/i.test(text.trim())) {
    // "/calc <id> …" that didn't run stays unrun; "/calc ohm's law V=12V I=2A" is matched like a question.
    const rest = text.trim().replace(/^\/calc\s*/i, "");
    if (calculatorCatalog().some((c) => c.id === rest.split(/\s/)[0]?.toLowerCase())) return null;
    text = rest;
  } else if (!ASKS.test(text)) return null;
  if (!/\d/.test(text) || ambiguousNumber(text)) return null;
  const qs = readQuantities(text);
  if (!qs.length) return null;
  const formulas = calculatorCatalog().filter((c) => c.kind === "formula");
  const ranked = searchCalculators(text, formulas).slice(0, 6).map((c) => getCalculator(c.id)).filter(allow);
  // The first candidate that runs; failing that, the first one that refused numbers that all fit it.
  let refused: CalcToolResult | null = null;
  for (const def of ranked.slice(0, 4)) {
    const a = assign(def, qs);
    if (!a) continue;
    const r = attempt(def, a.given, "rules", a.assumed);
    if (r && !r.refused) return r;
    refused ??= r;
  }
  if (!o.model || o.model.provider.type === "mock" || !ranked.length) return refused;
  // A model may still find the calculator that does run; otherwise the refusal stands.
  const viaM = await viaModel(o, text, ranked.slice(0, 5));
  return viaM && !viaM.refused ? viaM : (refused ?? viaM);
}

async function viaModel(o: CalcToolOptions, text: string, candidates: CalculatorDef[]): Promise<CalcToolResult | null> {
  const list = candidates.map((d) => ({
    id: d.id,
    name: d.name,
    inputs: d.inputs.filter((i) => !i.list).map((i) => ({ key: i.key, label: i.label, quantity: i.quantity, units: QUANTITIES.find((q) => q.id === i.quantity)!.units.map((u) => u.id).slice(0, 12), optional: !!i.optional, options: i.options?.map((x) => x.value) })),
    pick: d.pick,
  }));
  try {
    const r = await completeChat(
      o.model!.provider,
      o.model!.modelKey,
      [
        {
          role: "system",
          content: [
            "Map the user's question to one of these calculators and its inputs, using only numbers the user wrote. Reply with JSON only:",
            `{"calculatorId": string | null, "inputs": {"<key>": {"value": number, "unit": "<unit id>"}}}`,
            "Use null if none fits or a needed number is missing. Never compute anything yourself.",
            JSON.stringify(list),
          ].join("\n"),
        },
        { role: "user", content: text },
      ],
      { maxTokens: 400, temperature: 0, thinking: false },
    );
    await o.onUsage?.(r.usage);
    const json = extractJson(r.text) as { calculatorId?: string | null; inputs?: Record<string, { value: unknown; unit?: unknown }> } | null;
    const def = candidates.find((d) => d.id === json?.calculatorId);
    if (!def || !json?.inputs) return null;
    const given = acceptModelInputs(def, text, json.inputs);
    const assumed: string[] = [];
    for (const i of def.inputs) if (!(i.key in given) && !i.optional && i.default !== undefined) {
      given[i.key] = { value: i.default, unit: i.unit };
      assumed.push(i.key);
    }
    return attempt(def, given, "model", assumed);
  } catch {
    return null;
  }
}

/**
 * What the model proposed, kept only where it matches what the person wrote: the same number, used
 * once, in the unit that was written (48 V never runs as 48 kV). A bare number is taken in the input's
 * own unit, and only when the model didn't claim another one.
 */
export function acceptModelInputs(def: CalculatorDef, text: string, proposed: Record<string, { value: unknown; unit?: unknown }>): Record<string, InputValue> {
  const written = readQuantities(text);
  const used = new Set<number>();
  const given: Record<string, InputValue> = {};
  for (const [k, v] of Object.entries(proposed)) {
    const inp = def.inputs.find((i) => i.key === k);
    if (!inp || inp.list || typeof v?.value !== "number") continue;
    const same = written.filter((q) => q.value === v.value && !used.has(q.index));
    const withUnit = same.find((q) => q.unit && q.q === inp.quantity);
    const bare = same.find((q) => !q.unit && (v.unit === undefined || v.unit === null || v.unit === inp.unit));
    const hit = withUnit ?? bare;
    if (!hit) continue;
    used.add(hit.index);
    given[k] = { value: v.value, unit: hit.unit ?? inp.unit };
  }
  return given;
}

const fmt = (v: number) => (Math.abs(v) >= 1e-4 && Math.abs(v) < 1e12) || v === 0 ? String(Number(v.toPrecision(6))) : v.toExponential(5);

/** What the model is told: the exact results, to explain and not to change. */
export function calcContext(r: CalcToolResult): string {
  const unit = (u: string) => (u ? ` ${u}` : "");
  const inputs = `Inputs: ${r.inputs.map((i) => `${i.symbol ?? i.key} = ${Array.isArray(i.value) ? i.value.join(", ") : fmt(i.value)}${unit(i.unit)}${i.assumed ? " (default, assumed)" : ""}`).join("; ")}`;
  if (r.refused) {
    return [
      "<calculator>",
      `GEM AI's tested calculator "${r.name}" (formula version ${r.version}${r.status === "beta" ? ", beta" : ", verified"}) refused the user's numbers: ${r.refused.message}`,
      "Don't work out a result for these numbers yourself, by this formula or another. Tell the user plainly why they were refused and what values the formula does cover.",
      `Formula: ${r.formula.join("; ")}`,
      inputs,
      `Assumptions: ${r.assumptions.join("; ")}`,
      "</calculator>",
    ].join("\n");
  }
  return [
    "<calculator>",
    `GEM AI ran its tested calculator "${r.name}" (formula version ${r.version}${r.status === "beta" ? ", beta" : ", verified"}) on the user's numbers.`,
    "These results come from tested code. Use them exactly as given: don't recompute, round differently or change them. Explain what they mean, and state the assumptions.",
    `Formula: ${r.formula.join("; ")}`,
    inputs,
    `Results: ${r.outputs.map((o) => `${o.label}${o.symbol ? ` ${o.symbol}` : ""} = ${fmt(o.value)}${o.unit ? ` ${o.unit}` : ""}`).join("; ")}`,
    `Assumptions: ${r.assumptions.join("; ")}`,
    ...(r.warnings.length ? [`Warnings: ${r.warnings.join("; ")}`] : []),
    "</calculator>",
  ].join("\n");
}

/**
 * What a model asked for by tool call. `inputs` is an object, or a JSON string of one: each value is
 * a number (the input's own unit) or `{ value, unit }`. Beta calculators run only when `showBeta`.
 */
export function runCalculatorTool(id: string, inputs: unknown, showBeta: boolean): { text: string; calculation: CalcToolResult | null } {
  const name = String(id ?? "").trim();
  let def: CalculatorDef;
  try {
    def = getCalculator(name);
  } catch (e) {
    return { text: e instanceof CalcError ? e.message : `There's no calculator "${name}". Call calculators_search first.`, calculation: null };
  }
  if (def.status === "beta" && !showBeta) return { text: `"${def.name}" is not available.`, calculation: null };
  const given = readToolInputs(inputs);
  if (!given) return { text: 'inputs_json must be a JSON object. Each key is an input key, and each value is a number or {"value": number, "unit": "V"}.', calculation: null };
  const r = attempt(def, given, "tool", []);
  if (!r) return { text: "A required input is missing or doesn't match this calculator. Use the keys and units from calculators_search.", calculation: null };
  return { text: calcContext(r), calculation: r };
}

/** Calculators a model can choose from, as plain text (ids, formulas, input keys). */
export function searchCalculatorsTool(query: string, showBeta: boolean): string {
  const formulas = calculatorCatalog().filter((c) => c.kind === "formula" && (c.status !== "beta" || showBeta));
  const hits = searchCalculators(query, formulas).slice(0, 6);
  if (!hits.length) return `No calculator matches "${query}". Try the quantity you want, such as current, torque or pressure drop.`;
  return hits
    .map((c) => {
      const def = getCalculator(c.id);
      const inputs = def.inputs.map((i) => `${i.key} (${i.label}${i.unit ? `, ${i.unit}` : ""}${i.optional ? ", optional" : ""})`).join("; ");
      const pick = def.pick ? ` Give exactly ${def.pick.count} of: ${def.pick.keys.join(", ")}.` : "";
      return [`id: ${def.id}`, `name: ${def.name}${def.status === "beta" ? " (beta)" : ""}`, `formula: ${def.formula.join("; ")}`, `inputs: ${inputs}.${pick}`].join("\n");
    })
    .join("\n\n");
}

/** The two tools Chat and Work AI give a model so it can run tested formulas. */
export const CALCULATOR_TOOLS: FunctionTool[] = [
  {
    type: "function",
    function: {
      name: "calculators_search",
      description: "Find a tested engineering calculator by what it computes (current, torque, pressure drop, heat). Returns ids, formulas and the input keys to pass to calculators_run.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { query: { type: "string", description: "What to calculate, in plain words." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculators_run",
      description: "Run a tested calculator by id. The number comes from code, not from you. Explain the result exactly as given. If it refuses the inputs, say why and do not invent a number.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          calculator_id: { type: "string", description: "The id from calculators_search, such as ohms-law." },
          inputs_json: { type: "string", description: 'JSON object of input key to a number or {"value", "unit"}. Example: {"V":{"value":12,"unit":"V"},"R":4}' },
        },
        required: ["calculator_id", "inputs_json"],
      },
    },
  },
];

/** calculators_search or calculators_run, from the arguments the model sent. */
export function dispatchCalculatorTool(name: string, args: unknown, showBeta: boolean): { text: string; calculation: CalcToolResult | null } {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  if (name === "calculators_search") return { text: searchCalculatorsTool(String(a.query ?? ""), showBeta), calculation: null };
  if (name === "calculators_run") return runCalculatorTool(String(a.calculator_id ?? a.calculatorId ?? ""), a.inputs_json ?? a.inputs, showBeta);
  return { text: `Unknown tool ${name}. Use calculators_search or calculators_run.`, calculation: null };
}

function readToolInputs(raw: unknown): Record<string, InputValue> | null {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      obj = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const given: Record<string, InputValue> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "number") given[k] = { value: v };
    else if (Array.isArray(v) && v.every((x) => typeof x === "number")) given[k] = { value: v };
    else if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as { value?: unknown }).value === "number") {
      const unit = (v as { unit?: unknown }).unit;
      given[k] = { value: (v as { value: number }).value, unit: typeof unit === "string" ? unit : undefined };
    } else return null;
  }
  return given;
}

export async function saveChatCalculation(db: DB, userId: string, workspaceId: string, r: CalcToolResult, source = "chat") {
  // A refusal has no result to keep; the chat message keeps it.
  if (r.refused) return;
  await db.insert(calculatorHistory).values({
    userId,
    workspaceId,
    calculatorId: r.calculatorId,
    kind: "formula",
    formulaVersion: r.version,
    inputs: Object.fromEntries(r.inputs.map((i) => [i.key, { value: i.value, unit: i.unitId }])),
    outputs: r.outputs,
    source,
  });
}
