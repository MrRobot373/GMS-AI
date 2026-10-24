---
name: audit-log-and-reporting
description: "Use when recording what the agent did, which tools ran, and which approval changed a result."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: medium
maturity: draft
---

# Audit log and reporting

Write a record of actions that already happened. Do not use the log to justify an action that was not approved.

## Purpose

Produce a searchable account of the actor, the tools, the objects changed, and the approval that allowed a change.

## Trigger examples

- "What did the agent change in this task?"
- "Record the approval and the before and after."
- "Show the tool calls without the secrets."

## Exclusions

- Deciding if an action is allowed belongs to the `permission-and-approval-planner` skill.
- Running the steps belongs to the `workflow-orchestration` skill or the producer skill.
- Legal hold and retention periods are not in this package. Do not invent one.

## Inputs

Tool results, file paths, record ids, approval text, and the actor identity already in the task. The field list is in `references/audit-record.md`.

Missing organization inputs: no log sink, retention rule, or redaction dictionary beyond the rules below is shipped. If none is attached, write the record into the task reply and set retention to "not specified."

## Operating modes

- record: append one action.
- report: summarize the actions of this task.
- redact: remove secret and unnecessary personal values from a draft log.

## Workflow

1. Take events from tool results and files, not from memory of an intended plan.
2. Fill the fields in `references/audit-record.md`.
3. Redact secrets, tokens, passwords, and connection strings. Replace the value with `[redacted]` and keep the field name.
4. For a change, record before and after when both are known. If before is unknown, write `before: unknown` rather than a guessed value.
5. Tie each external change to the approval sentence or write `approval: none` and do not describe the change as authorized.
6. Order events by time. Do not drop a failed attempt.

## Tool selection

Read the task timeline and local files. Do not call a connector again just to enrich the log if that call can mutate state.

## Permissions

Read task records. Write the log locally when a file is requested. Do not send the log, delete events, publish, deploy, or spend. Redaction is a local rewrite of the log draft, not a delete of the source file unless the user asked to replace a file that contains a secret.

## Output contract

Events matching `references/audit-record.md`, plus a one-paragraph summary: how many actions, how many external changes, how many lacked approval. Retention is stated or "not specified."

## Quality gates

Every external mutation in the task appears once. No secret value remains in the log text. Timestamps and actor are present. Unauthorized changes are visible, not omitted.

## Failure behavior

Missing timestamp: use `time: unknown` and continue. Unreadable tool output: record the tool name and `result: unreadable`. Stop after two failed reads of the same log file. Do not backfill events that have no trace.

## Done when

A reader can see who did what, to which object, under which approval, with secrets removed and gaps marked unknown instead of filled in.
