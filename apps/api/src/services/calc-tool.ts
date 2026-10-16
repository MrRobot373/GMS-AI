/**
 * Calculators as a tool for chat (docs/15-gem-ai.md): "what is the ideal output at 48 V and 0.4
 * duty?" runs the tested function, and the model only explains the numbers it's given.
 *
 * Finding the calculation, in order:
 *   1. "/calc <id> key=value unit …" runs exactly that calculator.
 *   2. Rules: numbers with units are read from the message and matched to a calculator's inputs
 *      by quantity and by the words around them. Every number with a unit must find a place.
 *   3. With a real model (not the demo one), the model may map the question to one of a short
 *      list of calculators as JSON; the inputs it picks are still checked and run by the code.
 * Nothing is computed by a model; a result that doesn't run cleanly is never shown.
 */
import { calculatorHistory, type DB } from "@aatmiq/db";
import { calculatorCatalog, getCalculator, QUANTITIES, runCalculator, searchCalculators, unitOf, type CalculatorDef, type InputValue, type RunResult } from "@aatmiq/calculators";
import { completeChat, type ProviderConfig } from "@aatmiq/model-gateway";
import { extractJson } from "@aatmiq/shared";

export interface CalcToolResult {
  calculatorId: string;
  name: string;
  status: "verified" | "beta";
  version: number;
  via: "command" | "rules" | "model";
  /** unit: what people read ("kΩ"); unitId: the unit's id ("kohm"). */
  inputs: { key: string; label: string; symbol?: string; value: number | number[]; unit: string; unitId: string; assumed?: boolean }[];
  outputs: { key: string; label: string; symbol?: string; value: number; unit: string }[];
  warnings: string[];
  assumptions: string[];
  formula: string[];
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
  const t = token.replace(/²/g, "2").replace(/³/g, "3");
  return UNIT_INDEX.exact.get(t) ?? UNIT_INDEX.loose.get(t.toLowerCase()) ?? null;
}

const NUM = /(?<![\w.])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(%|[A-Za-zµΩ°][A-Za-zµΩ°·./²³0-9]*)?/g;

export function readQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  for (const m of text.matchAll(NUM)) {
    const value = Number(m[1]);
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
  const m = /^\/calc\s+([a-z0-9-]+)\s*(.*)$/is.exec(text.trim());
  if (!m) return null;
  let def: CalculatorDef;
  try {
    def = getCalculator(m[1]!);
  } catch {
    return null;
  }
  if (!allow(def)) return null;
  const given: Record<string, InputValue> = {};
  for (const p of m[2]!.split("\n")[0]!.matchAll(/([A-Za-z0-9_]+)\s*=\s*(-?[\d.eE+-]+)\s*([^\s,;]*)/g)) {
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
  try {
    return describe(def, runCalculator(def.id, given), "command", assumed);
  } catch {
    return null;
  }
}

export interface CalcToolOptions {
  text: string;
  showBeta: boolean;
  /** The chat's model, for the model-assisted step (skipped for the demo model). */
  model?: { provider: ProviderConfig; modelKey: string } | null;
  onUsage?: (u: { inputTokens: number; outputTokens: number; estimated: boolean }) => Promise<void>;
}

export async function findCalculation(o: CalcToolOptions): Promise<CalcToolResult | null> {
  const text = o.text.slice(0, 2000);
  const allow = (d: CalculatorDef) => d.status === "verified" || o.showBeta;
  const cmd = command(text, allow);
  if (cmd || text.trim().startsWith("/calc")) return cmd;
  if (!ASKS.test(text) || !/\d/.test(text)) return null;
  const qs = readQuantities(text);
  if (!qs.length) return null;
  const formulas = calculatorCatalog().filter((c) => c.kind === "formula");
  const ranked = searchCalculators(text, formulas).slice(0, 6).map((c) => getCalculator(c.id)).filter(allow);
  for (const def of ranked.slice(0, 4)) {
    const a = assign(def, qs);
    if (!a) continue;
    try {
      return describe(def, runCalculator(def.id, a.given), "rules", a.assumed);
    } catch {
      /* the next candidate */
    }
  }
  if (!o.model || o.model.provider.type === "mock" || !ranked.length) return null;
  return viaModel(o, text, ranked.slice(0, 5));
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
    // Only numbers that appear in the question are accepted.
    const written = new Set(readQuantities(text).map((q) => q.value));
    const given: Record<string, InputValue> = {};
    for (const [k, v] of Object.entries(json.inputs)) {
      const inp = def.inputs.find((i) => i.key === k);
      if (!inp || typeof v?.value !== "number" || !written.has(v.value)) continue;
      given[k] = { value: v.value, unit: typeof v.unit === "string" ? v.unit : inp.unit };
    }
    const assumed: string[] = [];
    for (const i of def.inputs) if (!(i.key in given) && !i.optional && i.default !== undefined) {
      given[i.key] = { value: i.default, unit: i.unit };
      assumed.push(i.key);
    }
    return describe(def, runCalculator(def.id, given), "model", assumed);
  } catch {
    return null;
  }
}

const fmt = (v: number) => (Math.abs(v) >= 1e-4 && Math.abs(v) < 1e12) || v === 0 ? String(Number(v.toPrecision(6))) : v.toExponential(5);

/** What the model is told: the exact results, to explain and not to change. */
export function calcContext(r: CalcToolResult): string {
  const unit = (u: string) => (u ? ` ${u}` : "");
  return [
    "<calculator>",
    `GEM AI ran its tested calculator "${r.name}" (formula version ${r.version}${r.status === "beta" ? ", beta" : ", verified"}) on the user's numbers.`,
    "These results come from tested code. Use them exactly as given: don't recompute, round differently or change them. Explain what they mean, and state the assumptions.",
    `Formula: ${r.formula.join("; ")}`,
    `Inputs: ${r.inputs.map((i) => `${i.symbol ?? i.key} = ${Array.isArray(i.value) ? i.value.join(", ") : fmt(i.value)}${unit(i.unit)}${i.assumed ? " (default, assumed)" : ""}`).join("; ")}`,
    `Results: ${r.outputs.map((o) => `${o.label}${o.symbol ? ` ${o.symbol}` : ""} = ${fmt(o.value)}${o.unit ? ` ${o.unit}` : ""}`).join("; ")}`,
    `Assumptions: ${r.assumptions.join("; ")}`,
    ...(r.warnings.length ? [`Warnings: ${r.warnings.join("; ")}`] : []),
    "</calculator>",
  ].join("\n");
}

export async function saveChatCalculation(db: DB, userId: string, workspaceId: string, r: CalcToolResult) {
  await db.insert(calculatorHistory).values({
    userId,
    workspaceId,
    calculatorId: r.calculatorId,
    kind: "formula",
    formulaVersion: r.version,
    inputs: Object.fromEntries(r.inputs.map((i) => [i.key, { value: i.value, unit: i.unitId }])),
    outputs: r.outputs,
    source: "chat",
  });
}
