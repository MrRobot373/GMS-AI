---
name: skill-authoring
description: "Use when creating or revising a skill package: name, workflow, permissions, tests, and version."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: medium
maturity: draft
---

# Skill authoring

Write a small skill another session can route to. The `skill-router` skill decides when it loads. This skill does not publish it.

## Purpose

Produce one valid skill folder for a named capability, with the contract sections and tests a reviewer can run.

## Trigger examples

- "Create the skill package for this workflow."
- "Revise this SKILL.md; the description is too broad."
- "Split this router into a narrower skill."

## Exclusions

- Choosing skills for an unrelated user task belongs to the `skill-router` skill.
- Enabling the new folder for the organization belongs to the `skill-registry-admin` skill.
- Do not author a second copy of an installed router. Extend the router or stop and say which slug already covers the job.
- Do not invent standards, credentials, brand text, or approval policy. Mark them as missing organization inputs.

## Inputs

The capability name, the outcome it must produce, the nearest installed skill, and `references/contract.md`. Use `references/examples.md` when the folder shape is unclear.

Missing organization inputs: template files, glossaries, and policy excerpts are not in this package. Leave a visible gap in the new skill's Inputs section.

## Operating modes

- create: new folder.
- revise: edit an existing folder without renaming it unless the user asked.
- validate: run the checker and report failures only.

## Workflow

1. Confirm the name is lowercase, hyphenated, and under 64 characters. Reject names that duplicate an installed slug.
2. If the catalog row for that name is `routed` or `installed`, stop unless the user asked to replace that router with a narrower installed skill.
3. Write `SKILL.md` with the scalar frontmatter and headings in `references/contract.md`. Put long schemas, standards, and examples in `references/` and link them only from the mode that needs them.
4. Add `scripts/` only for a deterministic check or transform. Add `assets/` only for a real template. Do not create empty directories.
5. Write `tests/cases.md` with the headings the checker requires, using requests a person would actually type.
6. Run `python3 scripts/validate_skill.py` on the new folder and fix every line it prints.
7. Leave maturity at `draft` until those cases have been exercised in a task and a sample artifact exists.

## Tool selection

Use `scripts/validate_skill.py` for the contract. Do not use a model to "approve" a folder the script rejects. Python is `python3` in the task image and `python` where that command is absent; the script itself has no package dependencies.

## Permissions

Write only inside the skill folder the user named. Do not enable the skill, send it, delete unrelated skills, publish, deploy, or spend. Overwriting an existing `SKILL.md` requires the user to have asked for a revision of that slug.

## Output contract

The folder tree, the validator's `ok` line, one example request that should trigger the skill, known limitations, and the evidence still required before maturity can leave `draft`.

## Quality gates

`scripts/validate_skill.py` exits 0. The description starts with "Use when" or "Use for" and is 61 to 160 characters. Cross-references point at installed skills. No secret, token, or credential appears in the folder.

## Failure behavior

If the validator fails, return the folder only together with the error lines and do not call it ready. Stop after two failed validator runs on the same fault and report the unresolved line. If the requested capability duplicates an installed router, do not create the folder.

## Done when

The validator prints `ok` for the folder, the routing description distinguishes the nearest other skill, and the reply states that registry publication has not been done.
