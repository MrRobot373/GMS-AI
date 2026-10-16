/** A plain-data view of every calculator and tool (for lists, search and the chat tool). */
import { CALCULATORS } from "./defs";
import type { InputDef, OutputDef } from "./registry";
import { TOOLS } from "./tools";

export interface CatalogEntry {
  id: string;
  kind: "formula" | "tool";
  name: string;
  category: string;
  description: string;
  keywords: string[];
  status: "verified" | "beta" | "tool";
  version?: number;
  formula?: string[];
  assumptions?: string[];
  inputs?: Omit<InputDef, never>[];
  outputs?: OutputDef[];
  pick?: { count: number; keys: string[] };
  refCount?: number;
}

export function calculatorCatalog(): CatalogEntry[] {
  return [
    ...TOOLS.map((t): CatalogEntry => ({ ...t, kind: "tool", status: "tool" })),
    ...CALCULATORS.map(
      (c): CatalogEntry => ({
        id: c.id,
        kind: "formula",
        name: c.name,
        category: c.category,
        description: c.description,
        keywords: c.keywords ?? [],
        status: c.status,
        version: c.version,
        formula: c.formula,
        assumptions: c.assumptions,
        inputs: c.inputs,
        outputs: c.outputs,
        pick: c.pick,
        refCount: c.refs.length,
      }),
    ),
  ];
}

const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1);

/** Rank calculators for a query: name and keyword matches count most. */
export function searchCalculators(query: string, entries = calculatorCatalog()): CatalogEntry[] {
  const q = words(query);
  if (!q.length) return entries;
  const scored = entries.map((e) => {
    const name = e.name.toLowerCase();
    const kw = e.keywords.join(" ").toLowerCase();
    const desc = `${e.description} ${e.category}`.toLowerCase();
    let score = 0;
    for (const w of q) {
      if (name.includes(w)) score += 3;
      if (kw.includes(w)) score += 2;
      if (desc.includes(w)) score += 1;
    }
    if (name.includes(query.toLowerCase().trim())) score += 5;
    return { e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.e);
}
