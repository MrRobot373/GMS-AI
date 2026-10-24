/**
 * calculators_search and calculators_run: tested engineering formulas, run by Aatmiq.
 * The agent names a calculator and its inputs; the number comes back from the calculator code.
 * Plain JavaScript on purpose: loaded directly by the harness runtime.
 */

/**
 * @param {Function} defineTool DSH's defineTool
 * @param {(path: string, init?: object) => Promise<any>} call Aatmiq's internal API
 */
export function calculatorTools(defineTool, call) {
  const output = {
    schema: { type: "object", additionalProperties: false, properties: { text: { type: "string", required: true } } },
    render: (_args, value) => [{ type: "text", text: value.text }],
  };
  const tool = (name, description, parameters, run) =>
    defineTool({ name, description, parameters, output, timeoutMs: 30_000, execute: (args, exec) => run(args ?? {}, exec.signal) });

  return [
    tool(
      "calculators_search",
      "Find a tested engineering calculator by what it computes (current, torque, pressure drop, heat). Returns ids, formulas and the input keys to pass to calculators_run. Use it before running a calculator you have not already been given.",
      { query: { type: "string", required: true, description: "What to calculate, in plain words." } },
      async (a, signal) => {
        const r = await call("/calculators/search", { method: "POST", body: JSON.stringify({ query: String(a.query ?? "") }), signal });
        return { text: r.text };
      },
    ),
    tool(
      "calculators_run",
      "Run a tested calculator by id. The number comes from code, not from you. Explain the result exactly as given. If it refuses the inputs, say why and do not invent a number.",
      {
        calculator_id: { type: "string", required: true, description: "The id from calculators_search, such as ohms-law." },
        inputs_json: { type: "string", required: true, description: 'JSON object of input key to a number or {"value", "unit"}. Example: {"V":{"value":12,"unit":"V"},"R":4}' },
      },
      async (a, signal) => {
        const r = await call("/calculators/run", {
          method: "POST",
          body: JSON.stringify({ calculatorId: String(a.calculator_id ?? ""), inputs: a.inputs_json }),
          signal,
        });
        return { text: r.text };
      },
    ),
  ];
}
