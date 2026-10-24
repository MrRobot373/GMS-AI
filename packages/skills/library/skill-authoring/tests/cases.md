# skill-authoring cases

## Routing-positive

- "Write a skill package for reconciling two exports."
- "The description on this SKILL.md is vague. Revise it."
- "Validate this skill folder and list what fails."

## Routing-negative

- "Which skills should this task load?" belongs to `skill-router`.
- "Turn the new skill on for the company" belongs to `skill-registry-admin`.
- "Build the workbook" belongs to the spreadsheet router, not to a new skill, when the user did not ask for a skill.

## Happy-path

Given a name that is not installed and a one-sentence outcome, the folder contains SKILL.md, tests/cases.md, and any reference the workflow actually cites. `scripts/validate_skill.py` prints `ok` and the maturity in the file is `draft`.

## Edge-case

- Name collides with `excel-spreadsheets`. Do not create a folder.
- User asks for assets but supplies no template. Omit `assets/` and record the missing template.
- Description is 161 characters. Shorten it; do not ship the folder as valid.

## Permission

The skill writes only the named folder. It does not call the library enable API and does not delete another skill.

## Evidence

The reply quotes the validator output and the folder-relative paths written. It does not claim a human ran the routing cases.

## Artifact

`SKILL.md` re-parses: name matches the directory, and every `references/` or `scripts/` path in that file exists.

## Regression

A request to "add a skill" for work an installed router already does must not create a second package.
