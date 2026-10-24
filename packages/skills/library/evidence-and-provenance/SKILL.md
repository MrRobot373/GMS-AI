---
name: evidence-and-provenance
description: "Use when a claim, number, or decision must cite a file, cell, commit, record, or source."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: medium
maturity: draft
---

# Evidence and provenance

Bind each factual claim to a source the reader can open, or mark it as an assumption.

## Purpose

Produce a claim-to-source map so a later reader can see what was checked and what was not.

## Trigger examples

- "Where did this number come from?"
- A report, proposal, or engineering note states measurements, money, or dates.
- The user asks for citations.

## Exclusions

- Deciding whether an action is allowed belongs to the `permission-and-approval-planner` skill.
- Checking that a generated file opens belongs to the `artifact-quality-control` skill.
- Web research technique stays with the `web-research` skill. This skill records what that research returned.

## Inputs

The draft claims and the files, cells, commits, or links the user made available. Read `references/source-hierarchy.md`.

Missing organization inputs: no records-retention schedule is shipped. Do not invent a retention period. If none is attached, write "retention: not specified."

## Operating modes

- bind: attach sources to an existing draft.
- audit: list claims that have no source.
- label: mark uncertainty without rewriting the whole document.

## Workflow

1. Split the draft into claims that a reader could check.
2. Rank sources with `references/source-hierarchy.md`. Prefer the task file over memory.
3. Cite the location: path and cell, path and heading, commit, record id, or URL and the date it was read.
4. Keep quotations short. Paraphrase the rest.
5. Claims with no source become "unsupported" or "assumption." Do not leave them looking like facts.
6. If two sources disagree, show both and do not average them silently.

## Tool selection

Open local files. Use web retrieval only when the claim is about the outside world and the `web-research` skill is the one gathering pages. Do not fetch a page merely to decorate a number that already lives in the task file.

## Permissions

Read task files and sources the user named. Do not send, delete, publish, deploy, or spend. Writing the map into the deliverable is a local write.

## Output contract

A map: claim, source location, source date or revision, and status (`supported`, `assumption`, `conflict`, `unsupported`). The deliverable's numbers must appear in the map.

## Quality gates

No unsupported claim remains in the prose without a label. Cited cells and files exist. Quotes are limited to the passage needed to check the claim.

## Failure behavior

Unreadable file: mark the claims that depended on it unsupported and continue with the rest. Do not invent a source. Stop after two failed opens of the same path. Conflicting sources: return both, do not pick a winner unless the user supplied a precedence rule.

## Done when

Every factual claim in scope is supported, labeled as an assumption, or marked unsupported, and each supported claim has a location someone else can open.
