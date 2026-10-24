---
name: agent-tool-design
description: "Use when designing a model-callable tool: schema, validation, auth, dry-run, and audit."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: high
maturity: draft
---

# Agent tool design

Specify a narrow tool the model can call safely. Prefer one effect over a general "do anything" tool.

## Purpose

Produce a tool contract with validation, an idempotency rule, a dry-run, and tests for malformed and unauthorized calls.

## Trigger examples

- "Design a tool that creates a tracker item."
- "This tool description is too broad for the model."
- "Add a dry-run to this side-effecting tool."

## Exclusions

- Implementing an unrelated product feature belongs to the producer skill (`backend-api` or the matching application skill).
- Deciding whether a specific call is approved belongs to the `permission-and-approval-planner` skill.
- Injection rules for content the tool returns belong to the `prompt-injection-defense` skill.
- Scoring a set of traces belongs to the `llm-evaluation` skill.

## Inputs

The effect the tool must have, the system it touches, and who may call it. The contract fields are in `references/tool-schema.md`.

Missing organization inputs: no identity provider, scope catalog, or rate limit is shipped. If the user does not name the authority that checks auth, mark auth as "not specified" and do not pretend the tool enforces it.

## Operating modes

- design: write the contract.
- narrow: reduce an existing tool that accepts free-form commands.
- review: test the contract against malformed and unauthorized examples.

## Workflow

1. Name one effect. If the description needs "and", split the tool.
2. Fill `references/tool-schema.md`. Arguments are typed. Reject unknown fields.
3. Side effects require a dry-run that changes nothing and returns the exact change that would be made.
4. Mutations require an idempotency key. A repeat with the same key returns the first result and does not apply twice.
5. Errors name the field that failed and do not echo secrets or raw upstream headers.
6. Cap the result size and say what is truncated.
7. Write the contract tests listed in that reference: missing field, wrong type, unknown field, unauthorized caller, and duplicate mutation.

## Tool selection

This skill writes the contract and, when the user asks, the tests. It does not call the live system to "try" a mutation. Dry-run against a live system still needs the permission plan.

## Permissions

Read the current tool definition and write the contract locally. Do not publish the tool, deploy it, delete data, send a message, or spend. A sample call in the contract uses fake identifiers.

## Output contract

The schema, auth expectation, dry-run behavior, idempotency key, error shape, result cap, audit fields, and the five contract tests with expected errors. Auth left unspecified is labeled, not filled in.

## Quality gates

The schema has no free-form command string that can smuggle a second effect. Unauthorized and malformed cases expect errors, not partial success. Dry-run's example output contains no "applied" flag set to true.

## Failure behavior

If the effect cannot be made idempotent and it mutates, stop and say the tool is not ready; do not ship it as "best effort." If auth is unspecified, deliver the contract with that gap and do not mark it enforced. Two rounds of scope creep from the user: keep the original effect and list the rejected extras.

## Done when

The contract covers one effect, includes a dry-run for side effects, and the five tests expect rejection for malformed and unauthorized calls without performing them.
