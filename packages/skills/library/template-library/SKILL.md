---
name: template-library
description: "Use when an approved template must be found, version-pinned, and filled without changing locked text."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: medium
maturity: draft
---

# Template library

Use an approved template when one is actually available. This package does not contain organization templates.

## Purpose

Select a template version and produce a filled artifact that preserves locked regions, or stop when no approved template exists.

## Trigger examples

- "Use the company weekly status template."
- "Fill the technical report template with these headings."
- "Which template version did this document come from?"

## Exclusions

- Designing a new template belongs in a later document-template skill and is not installed. Do not invent one here.
- Freeform documents with no template belong to `word-documents`, `excel-spreadsheets`, or `presentations`.
- Checking the filled file opens belongs to the `artifact-quality-control` skill.

## Inputs

The template id or a file the user says is the template, the field values, and the output filename. Metadata to record is listed in `references/template-metadata.md`.

Missing organization inputs: no brand pack, locked clause library, or template registry is shipped. If the user does not attach a template, stop. Do not generate letterhead, logos, or legal clauses.

## Operating modes

- find: identify which supplied file is the template and record its version.
- fill: write a new output from that file.
- preview: show the field mapping without saving.

## Workflow

1. If no template file and no registry entry is attached, stop with "no approved template."
2. Treat a user-supplied file as version `user-supplied` unless the file states a version.
3. Map input fields to placeholders, content controls, or named ranges. List unmatched placeholders and extra input fields.
4. Write a new file. Do not save over the template.
5. Copy locked regions unchanged. If a requested edit touches locked text, skip that edit and list it.
6. Record the metadata in `references/template-metadata.md` in the reply.
7. Hand the output to the `artifact-quality-control` skill before calling it delivered.

## Tool selection

Edit with the producer skill’s tools (`excel-spreadsheets`, `word-documents`, `presentations`) after the mapping is fixed. Do not rebuild the document from scratch when a template file was supplied.

## Permissions

Read the template. Write only the new output path. Do not send, delete the template, publish, deploy, or spend.

## Output contract

The output path, template id, version, a field map, unmatched placeholders, locked text left unchanged, and a statement that brand rules were not applied unless a brand file was attached.

## Quality gates

The template file’s hash or path is recorded. A search of the output shows no leftover placeholder tokens the mapping claimed to fill. Locked text matches the template. The output is a different path from the template.

## Failure behavior

Missing template: stop, no substitute document. Unknown placeholder: leave it and list it; do not guess legal or brand text. Two failed saves: return the mapping without a file. Do not overwrite the template after a partial write.

## Done when

Either the reply stops because no approved template was attached, or a new file exists with the version recorded, unmatched placeholders listed, and locked text unchanged.
