---
name: artifact-quality-control
description: "Use when a generated spreadsheet, document, PDF, deck, image, or data file must be reopened and checked."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: low
maturity: draft
---

# Artifact quality control

Reopen the file that will be delivered and report what actually parsed. Do not describe a file as ready from the writer’s memory of having saved it.

## Purpose

Produce a quality report that says whether the artifact reopened and which critical problems remain.

## Trigger examples

- "Check this workbook before I send it."
- A skill just wrote an `.xlsx`, `.docx`, `.pptx`, `.pdf`, `.csv`, or `.json` file.
- "Render the deck and look for broken slides."

## Exclusions

- Creating the file belongs to the producer skill (`excel-spreadsheets`, `word-documents`, `pdf-documents`, `presentations`, or the code skill that compiled it).
- Citing why a number is true belongs to the `evidence-and-provenance` skill.
- Visual design critique of a slide’s story belongs to the `presentations` skill or the `ui-ux-design` skill.

## Inputs

The output path and the format the user asked for. Checks by type are in `references/checks.md`.

Missing organization inputs: no brand, font, or template baseline is shipped. A missing font or logo is a warning unless the user supplied a baseline and the file violates it.

## Operating modes

- inspect: report only.
- block: inspect and refuse delivery when any critical finding exists.
- compare: inspect two files and report sheet, page, or key counts for both.

## Workflow

1. Confirm the path exists and the extension matches the requested format.
2. Run `python3 scripts/inspect_artifact.py` on the file. On a machine without `python3`, use `python`.
3. Apply the extra checks in `references/checks.md` for that type. For Office and PDF files, render or reopen visually when a renderer is available; if it is not, say the visual check did not run.
4. Critical findings block delivery. Warnings ship only with the report beside them.
5. Do not "fix" the file in this skill unless the user asked for a repair. Otherwise hand the findings to the producer.

## Tool selection

Prefer `scripts/inspect_artifact.py` over a one-off parser. Do not install packages to get a green report. A missing package is a critical result from the script and stays critical.

## Permissions

Read the artifact and write the report. Do not send, delete, publish, deploy, or spend. Do not overwrite the artifact unless the user asked this skill to repair it.

## Output contract

The script’s JSON plus a short verdict: `pass` or `blocked`. Include sheet, page, or slide counts from the summary. List critical items and warnings separately. State which visual checks did not run.

## Quality gates

The script exited 0 for a pass. A pass with an unread file is not allowed. Formula error markers listed by the script are critical. The report names the path that was opened.

## Failure behavior

Missing file: verdict `blocked`. Unsupported extension: warning, verdict `blocked` if the user required that format to be verified and no inspector exists. Stop after two identical script failures and return the stderr. Do not replace a failed check with a claim that the file looks fine.

## Done when

The report names the opened path, the counts the script returned, the verdict, and any check that could not be run.
