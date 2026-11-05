/**
 * Work AI's own tools for Super AI (docs/20-super-ai.md): the same browser, documents and calculator
 * tools, defined once in dsh-plugin/ and given to Claude Code as an in-process MCP server. Only the
 * shape changes: DSH's parameter lists become zod shapes and its results become MCP text.
 */
import { browserTools } from "../../dsh-plugin/browser.mjs";
import { calculatorTools } from "../../dsh-plugin/calculators.mjs";
import { documentTools } from "../../dsh-plugin/documents.mjs";

/** A tool as dsh-plugin/ defines it (DSH's defineTool input). */
export interface DshTool {
  name: string;
  description: string;
  parameters: Record<string, DshParam>;
  output?: { render?: (args: unknown, value: unknown) => { type: string; text?: string }[] };
  execute: (args: Record<string, unknown>, exec: { signal?: AbortSignal }) => Promise<unknown>;
}
interface DshParam {
  type: string;
  required?: boolean;
  description?: string;
  items?: { type: string };
}

type Z = typeof import("zod").z;
type Text = { content: { type: "text"; text: string }[]; isError?: boolean };

/** A DSH parameter list as a zod shape (what the SDK's tool() takes). */
export function zodShape(z: Z, params: Record<string, DshParam>): Record<string, unknown> {
  const one = (p: DshParam): import("zod").ZodTypeAny => {
    switch (p.type) {
      case "integer":
        return z.number().int();
      case "number":
        return z.number();
      case "boolean":
        return z.boolean();
      case "array":
        return z.array(p.items ? one({ type: p.items.type }) : z.unknown());
      default:
        return z.string();
    }
  };
  return Object.fromEntries(
    Object.entries(params).map(([k, p]) => {
      let s = one(p);
      if (p.description) s = s.describe(p.description);
      return [k, p.required ? s : s.optional()];
    }),
  );
}

/** Run a DSH tool for the SDK: its rendered text, or the error as a failed result the model reads. */
export async function runDshTool(t: DshTool, args: Record<string, unknown>, signal?: AbortSignal): Promise<Text> {
  try {
    const value = await t.execute(args ?? {}, { signal });
    const blocks = t.output?.render ? t.output.render(args, value) : [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }];
    const text = blocks.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("\n");
    return { content: [{ type: "text", text }] };
  } catch (e) {
    return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
}

/** Work AI's tool definitions for this task, by the same switches (browser, calculators; documents unless a review). */
export function workAiTools(
  spec: { browser?: boolean; calculators?: boolean; review?: boolean },
  call: (path: string, init?: RequestInit) => Promise<any>,
): DshTool[] {
  const define = (d: unknown) => d as DshTool;
  const browser = (body: object, signal?: AbortSignal) => call("/browser", { method: "POST", body: JSON.stringify(body), signal });
  const all = [
    ...(spec.browser ? (browserTools(define, browser) as DshTool[]) : []),
    ...(spec.review ? [] : (documentTools(define, call) as DshTool[])),
    ...(spec.calculators ? (calculatorTools(define, call) as DshTool[]) : []),
  ];
  // Claude Code reads an image with its own Read tool (there is no read_image here).
  return all.map((t) => ({ ...t, description: t.description.replace(/\bread_image\b/g, "Read") }));
}
