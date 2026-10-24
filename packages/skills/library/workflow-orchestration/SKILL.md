---
name: workflow-orchestration
description: "Use when a job spans skills or tools and must checkpoint, retry, resume, or cancel safely."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: high
maturity: draft
---

# Workflow orchestration

Run a multi-step job so a retry cannot send the same external action twice.

## Purpose

Leave a durable record of steps, checkpoints, and side effects that a later turn can resume without duplicating a mutation.

## Trigger examples

- "Continue the job that failed after the file was uploaded."
- "Run these three steps and stop if the second one needs approval."
- "Cancel the workflow."

## Exclusions

- A single skill’s internal steps stay inside that skill.
- Choosing the skill set belongs to the `skill-router` skill.
- Classifying whether a step may send or delete belongs to the `permission-and-approval-planner` skill.
- The long-term memory store is not installed. Do not invent organizational memory.

## Inputs

The goal, the ordered steps, and any checkpoint already written. Step states are defined in `references/state-machine.md`.

Missing organization inputs: no ticketing system or on-call rota is shipped. Escalation is a line in the checkpoint, not a message, until a person approves a send.

## Operating modes

- start: create the checkpoint and run automatic steps.
- resume: continue from the last safe step.
- cancel: stop and record what already happened.

## Workflow

1. Write the checkpoint before the first side effect, using `references/state-machine.md`.
2. Ask the `permission-and-approval-planner` skill to class any step that might send, delete, deploy, publish, or spend.
3. Run automatic steps in order. Parallelize only steps whose writes do not overlap and that have no external side effect.
4. After an external mutation succeeds or times out, record an idempotency key and do not run that step again.
5. On failure, retry at most twice, and only when the step has no external side effect or the system proved it did not apply.
6. On cancel, leave completed steps as they are and mark the rest cancelled.

## Tool selection

Use the producer skill for each step. This skill tracks state; it does not reimplement spreadsheet, mail, or deploy tools.

## Permissions

Write the checkpoint locally. External send, delete, publish, deploy, and spend happen only inside a step the permission plan classed as allowed, and only once per idempotency key. This skill does not grant those permissions by itself.

## Output contract

A checkpoint: workflow id, step id, state, idempotency key if a mutation was attempted, last error, and the next safe step. Partial success lists finished and unfinished steps.

## Quality gates

A resume does not repeat a step whose mutation key is already `attempted` or `applied`. The checkpoint is written before the side effect, not after a crash-only memory. Retry count is visible and stops at two.

## Failure behavior

Unknown checkpoint: start over only if no mutation key exists; otherwise stop and ask. Timeout on a send or deploy: state `unknown`, no retry. Two failed reads of a local input: stop with the checkpoint in `failed` and the completed steps intact.

## Done when

The checkpoint shows each step’s state, every external attempt has an idempotency key, and a resume instruction names the next safe step or states that the job is complete or cancelled.
