---
name: skill-router
description: "Use when a request could match several skills and you must pick the smallest set, with reasons and exclusions."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: low
maturity: draft
---

# Skill router

Pick the smallest installed set that can produce the outcome. A catalog name is not a skill until it is installed.

## Purpose

Return a skill selection the harness can load, with a reason and an exclusion for each choice.

## Trigger examples

- "Which skills should I use for this?"
- A request that mixes a document, a spreadsheet, and a decision.
- Two library descriptions both seem to match.

## Exclusions

- Creating or rewriting a skill package belongs to the `skill-authoring` skill.
- Turning a library skill on or off belongs to the `skill-registry-admin` skill.
- Deciding whether a chosen skill may send, delete, deploy, or purchase belongs to the `permission-and-approval-planner` skill.
- Do the actual document, code, or calculation in the selected skill, not here.

## Inputs

The user request, the enabled library descriptions already in context, and `references/catalog.json`.

Missing organization inputs: no department override table is shipped. If the task does not include one, say so and use the rules in `references/routing-rules.md`.

## Operating modes

- select: choose skills for one request.
- explain: say why a skill was or was not selected.
- reject: name the installed skill that should be used instead of a proposed catalog name.

## Workflow

1. Restate the outcome in one sentence.
2. Read `references/routing-rules.md` and `references/catalog.json`.
3. Keep candidates whose descriptions match. Replace a `routed` catalog row with its `coveredBy` slug. Drop every `proposed` name.
4. Prefer the narrower installed skill. Where the narrower name is not installed, keep the router that `coveredBy` names.
5. Order evidence and permission checks before any skill that writes or sends. Order the `artifact-quality-control` skill after a skill that creates a file.
6. Stop at four skills unless the user asked for a phased program. Then list the phase, not every future skill.

## Tool selection

Read the catalog file. Do not search the web for skill names. Do not load a skill body while selecting.

## Permissions

Read the catalog and the request. Do not write files, send messages, delete, publish, deploy, approve, or spend. Selection does not authorize the chosen skills to do those things.

## Output contract

A list of installed slugs. For each: why it matched, what it must not do, and which rejected slug it replaces when it is a router. End with skills considered and dropped.

## Quality gates

Every selected slug exists in the enabled library. Every proposed name from the catalog is absent from the selection. The set is smaller than the set of skills that merely share a keyword.

## Failure behavior

If nothing installed matches, say so and do the work without inventing a skill. If two skills tie, keep both only when the outcome needs both artifacts. Do not retry catalog lookups more than once. Missing catalog file: stop and report that `skill-router` is incomplete.

## Done when

The reply names only installed skills, gives a reason and an exclusion for each, stays within the cap unless a program was requested, and leaves proposed catalog names unloaded.
