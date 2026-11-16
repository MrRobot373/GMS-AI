/**
 * Errors a grader can raise. They keep an outage from lowering a score (the idea comes from Kortix's evals): a grader
 * that cannot run (no browser, no judge model, a missing tool) reports an ERROR, never a 0.
 */
export class EvalError extends Error {
  constructor(message) {
    super(message);
    this.name = "EvalError";
  }
}

/** Not applicable here (the task needs web search and this server has none): left out of the score. */
export class Skip extends Error {
  constructor(message) {
    super(message);
    this.name = "Skip";
  }
}
