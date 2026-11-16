/**
 * task_recall: the agent searches its own task's full record, word for word. Older steps are condensed to keep a long
 * job inside the model's window, but the record is all still stored: this gets an exact command output, path, number,
 * error or sentence back instead of a guess. The search itself is Aatmiq's (apps/api/src/services/work-recall.ts).
 * Plain JavaScript on purpose: loaded directly by the harness runtime.
 */

/**
 * @param {Function} defineTool DSH's defineTool
 * @param {(path: string, init?: object) => Promise<any>} call Aatmiq's internal API
 */
export function recallTools(defineTool, call) {
  const output = {
    schema: { type: "object", additionalProperties: false, properties: { text: { type: "string", required: true } } },
    render: (_args, value) => [{ type: "text", text: value.text }],
  };
  const int = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Math.floor(Number(v))));
  return [
    defineTool({
      name: "task_recall",
      description:
        "Search this task's own full record, word for word: what you ran and what it printed, what you wrote, what the person said. Older steps are condensed to make room, but nothing is lost: use this to get an exact command output, file path, number, error or sentence back instead of guessing it or doing the work again. Every word you give must appear; results come oldest first with when each happened. Give seq to read one entry whole.",
      parameters: {
        query: { type: "string", description: "Words that all appear in the entry, like \"Traceback camera\" or \"total 199.99\"." },
        kind: { type: "string", description: "Only one kind of entry: user, assistant, tool_call or tool_result (default: all)." },
        since_minutes: { type: "integer", description: "Only entries from the last N minutes." },
        before_minutes: { type: "integer", description: "Only entries older than N minutes." },
        seq: { type: "integer", description: "Read entry #N whole (the number is shown next to each result)." },
        offset: { type: "integer", description: "With seq: where to continue reading a long entry, in characters." },
        limit: { type: "integer", description: "How many matches to show (default 8, at most 20)." },
      },
      output,
      timeoutMs: 30_000,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const a = args ?? {};
        const body = {
          ...(a.query ? { query: String(a.query) } : {}),
          ...(["user", "assistant", "tool_call", "tool_result"].includes(a.kind) ? { kind: a.kind } : {}),
          ...(int(a.since_minutes) ? { sinceMinutes: int(a.since_minutes) } : {}),
          ...(int(a.before_minutes) ? { beforeMinutes: int(a.before_minutes) } : {}),
          ...(int(a.seq) !== undefined ? { seq: int(a.seq) } : {}),
          ...(int(a.offset) ? { offset: int(a.offset) } : {}),
          ...(int(a.limit) ? { limit: Math.min(20, Math.max(1, int(a.limit))) } : {}),
        };
        const r = await call("/recall", { method: "POST", body: JSON.stringify(body), signal: exec.signal });
        return { text: r.text };
      },
    }),
  ];
}
