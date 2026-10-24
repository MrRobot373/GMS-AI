---
name: permission-and-approval-planner
description: "Use when deciding which actions can run automatically and which need approval before they run."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: high
maturity: draft
---

# Permission and approval planner

Separate what the agent may do now from what a person must confirm. The default below is a platform default, not an approved company policy.

## Purpose

Return an action plan that names each side effect and whether it is allowed, denied, or waiting for approval.

## Trigger examples

- "Can you send this to the customer?"
- "Delete the old records and update the sheet."
- "Deploy the fix" or "buy the license."
- Any skill is about to write outside the task, send, delete, publish, or spend.

## Exclusions

- Choosing which skill runs belongs to the `skill-router` skill.
- Recording that an approved action occurred belongs to the `audit-log-and-reporting` skill.
- Do not review the legal content of a contract; that stays with the `contract-review` skill.

## Inputs

The intended actions, the destination of each one, and `references/permission-matrix.md`.

Missing organization inputs: no company approval matrix, spending limit, or role list is stored here. If the task does not attach one, label every non-automatic action as "platform default, not company policy."

## Operating modes

- plan: classify actions before they run.
- recheck: classify again after the user changes scope.
- deny: stop a class of action for the rest of the task.

## Workflow

1. List each action as a verb plus an object (send message, overwrite file, deploy service).
2. Classify it with `references/permission-matrix.md`.
3. Ask for approval only at the moment of the side effect, naming the exact recipients, records, or command. Do not ask for a blanket "trust me for this task."
4. A denial or a missing answer stops that action. Continue only the actions classed as automatic.
5. Hand the confirmed actions to the producer skill. Do not perform the send, delete, deploy, or purchase in this skill.

## Tool selection

No external tool is required to classify. Do not call a connector "to see if send would work" if that call itself sends.

## Permissions

Read the request and local task files. Write nothing except the plan if the user asked for it as a file. External send, delete, publish, deploy, approve, and spend are denied inside this skill. Approval recorded here is a classification, not the product's approval token.

## Output contract

A table: action, object, class (`automatic`, `approval-required`, `denied`), reason, and the exact confirm sentence still needed. Include the line "Platform default; no organization matrix was attached" unless the user supplied one.

## Quality gates

Every side effect in the request appears in the table. No denied or unapproved row is described as already done. Recipients and file paths are specific.

## Failure behavior

If the action is ambiguous ("update them"), stop and name the missing object. Do not guess the recipient list. Do not retry an action that may have been sent. Two unclear replies from the user: leave the action denied and return the partial plan.

## Done when

Each side effect has a class, unapproved external actions have not been performed, and the plan says whether the matrix is the platform default or a document the user supplied.
