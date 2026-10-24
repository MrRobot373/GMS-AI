# agent-tool-design cases

## Routing-positive

- "Specify a tool that adds a comment to an existing tracker item."
- "This tool accepts a raw shell command. Narrow it."
- "Write the dry-run and the unauthorized-call test for the export tool."

## Routing-negative

- "Implement the REST handler" belongs to `backend-api`.
- "May this call send mail?" belongs to `permission-and-approval-planner`.
- "The tool's JSON result contains hostile instructions" belongs to `prompt-injection-defense`.

## Happy-path

Effect: create one tracker item. The contract has typed fields, a dry-run that does not create, an idempotency key, and five tests. Auth is `not specified` if the user did not name a checker. No live tracker is called.

## Edge-case

- User asks the tool to create items and also email them. Split into two contracts or refuse the email half.
- Mutation that cannot be idempotent. Stop and mark the tool not ready.
- Result that could be huge. The contract names a cap.

## Permission

Design mode does not call the live system. Sample identifiers are fake.

## Evidence

Each test names the input and the expected error code. Dry-run's sample says the effect was not applied.

## Artifact

The contract includes every field in `references/tool-schema.md`. Unknown-field and unauthorized cases are present.

## Regression

A tool whose schema contains a single string "command" or "query" that can express a second effect fails review until that argument is removed or constrained to an enum of safe operations.
