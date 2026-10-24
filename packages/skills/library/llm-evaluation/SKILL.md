---
name: llm-evaluation
description: "Use when building or running a quality, safety, or evidence evaluation with a pass or fail gate."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: medium
maturity: draft
---

# LLM evaluation

Score a model or a skill against cases the user supplies. Do not invent a passing score.

## Purpose

Produce a versioned evaluation result with a pass or fail gate and a failure taxonomy, or a runnable rubric when no dataset was supplied.

## Trigger examples

- "Evaluate whether answers cite the source passage."
- "Add a regression case for this wrong answer."
- "Did this skill pass its routing tests?"

## Exclusions

- Fixing a prompt or skill belongs to the `skill-authoring` skill or the producer skill.
- Defending a live tool call against hostile text belongs to the `prompt-injection-defense` skill. This skill scores a set of cases; it does not replace that design.
- Ordinary unit tests of application code belong to the `software-testing` skill.

## Inputs

The dataset (cases, expected behavior, and threshold) or a request to draft a rubric only. Rubric fields are in `references/rubric.md`.

Missing organization inputs: no golden set, judge model, or pass threshold is shipped. If the user does not provide cases and a threshold, deliver the rubric skeleton and do not report a pass rate.

## Operating modes

- design: write the dataset shape and rubric without running a model.
- run: score supplied cases.
- regress: add one production failure as a permanent case.

## Workflow

1. If there is no dataset, write the rubric from `references/rubric.md` and stop before any score.
2. Record model, prompt, and skill versions beside the result. If a version is unknown, write `unknown` and do not hide it.
3. Score each case against the expected behavior. Separate deterministic checks from judge opinions.
4. Apply the user's threshold. No threshold means no pass/fail claim.
5. Group failures with the taxonomy in `references/rubric.md`.
6. A single production failure becomes a new case with the input, the bad output, and the expected behavior. Do not delete older cases.

## Tool selection

Run deterministic checks in code when the expected value is exact. Use a model judge only for cases the user marked as judged, and keep those rows separate. Do not send private cases to an external service the user did not name.

## Permissions

Read the dataset and write the result locally. Do not publish scores, send them, delete cases, deploy a model, or spend beyond the model calls the user already allowed for the run. A missing allowance means design mode only.

## Output contract

Dataset id or "none", versions, per-case status (`pass`, `fail`, `not-run`), failure taxonomy counts, and a gate of `pass`, `fail`, or `not-run`. Include the threshold used.

## Quality gates

`not-run` is the gate whenever cases or a threshold are missing. Failed cases include the expected behavior and the actual output. The result does not average away a failed safety case.

## Failure behavior

Judge error: mark that case `not-run` and continue. Two identical judge failures: stop the run and return partial counts, with the gate `fail` if any completed safety case failed, otherwise `not-run`. Do not lower the threshold to obtain a pass.

## Done when

The result states the gate, the threshold, the versions, and every failed or not-run case, and it does not claim a pass without a dataset the user supplied.
