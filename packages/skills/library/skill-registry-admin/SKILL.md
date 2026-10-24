---
name: skill-registry-admin
description: "Use when enabling, disabling, versioning, or retiring a library skill without breaking dependents."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: high
maturity: draft
---

# Skill registry admin

Prepare a registry change. An admin applies it. This skill does not flip the switch on its own.

## Purpose

Produce a change plan that enables, disables, stages, rolls back, or retires one installed skill without leaving a router pointing at a missing slug.

## Trigger examples

- "Turn off the seo skill for the organization."
- "What breaks if we disable excel-spreadsheets?"
- "Retire this skill and name its replacement."

## Exclusions

- Writing the skill folder belongs to the `skill-authoring` skill.
- Choosing skills for a user task belongs to the `skill-router` skill.
- Do not create a proposed catalog skill by enabling a name that has no folder.

## Inputs

The slug, the intended state, and the catalog shipped with the `skill-router` skill. Read `references/registry-record.md` for the plan shape.

Missing organization inputs: rollout rings, owners beyond `owner_team`, and a change-advisory board are not in this package. If the task does not name an admin approver, stop at the plan.

## Operating modes

- plan: describe the change and its dependents.
- disable: plan turning an installed skill off.
- enable: plan turning an installed skill on.
- retire: plan a deprecation date and the replacement slug.

## Workflow

1. Resolve the slug to an installed folder. If the catalog status is `proposed`, stop.
2. Find catalog rows whose `coveredBy` or `installedAs` is that slug. Those rows lose their router if the slug is disabled.
3. Write the plan in `references/registry-record.md`'s fields, including rollback (turn it back on) and who must confirm.
4. Show the plan to the user. Apply the product's library switch only after this conversation contains an explicit confirm that names the slug and the new on or off state, and only when the user is an admin.
5. After an applied change, append the audit fields. Do not claim the change happened if the API was not called.

## Tool selection

Read the catalog and the skill folders. Use the admin library endpoint only in the confirmed apply step. Do not edit `SKILL.md` here.

## Permissions

Read the library. Writing the registry is approval-required. Delete, send, publish, deploy, and spend are denied. Disabling a skill is not a delete of its folder.

## Output contract

A registry plan with slug, from-state, to-state, dependent catalog rows, rollback, approver, and whether it was applied. Applied plans include the API result. Unapplied plans say `applied: false`.

## Quality gates

No dependent `coveredBy` target is left unpublished without the plan saying which installed skill replaces it. The slug in the plan matches a real folder when the action is enable or disable.

## Failure behavior

Unknown slug: stop, do not create it. Ambiguous confirm ("yes, do it" with no slug): stop. Two failed reads of the catalog: stop with a partial plan that lists only the slugs already verified. Never retry an apply call; a timeout may have succeeded.

## Done when

The plan names the slug, the dependents, and the rollback, and the reply is explicit about whether the organization setting changed.
