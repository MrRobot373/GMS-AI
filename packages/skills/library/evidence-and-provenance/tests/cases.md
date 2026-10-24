# evidence-and-provenance cases

## Routing-positive

- "Cite the cells behind these totals."
- "Which sentences in this memo are not in the source notes?"
- "Mark assumptions in the design note."

## Routing-negative

- "Calculate the totals" belongs to the spreadsheet or finance skill.
- "Check the workbook opens" belongs to `artifact-quality-control`.
- "Search the web for competitors" belongs to `web-research`, which then returns sources this skill can bind.

## Happy-path

A paragraph with three figures, two of which are in `budget.xlsx` cells, yields a map with those two `supported` and the third `assumption` or `unsupported`.

## Edge-case

- Source file missing. Dependent claims are `unsupported`. The rest of the map is still returned.
- Two attachments disagree on the same total. Both locations are listed as `conflict`.
- User forbids web access. Tier 4 is unused.

## Permission

The skill does not email the map and does not upload it. Local write only if a file was requested.

## Evidence

Each `supported` row includes a path, cell, commit, record id, or URL. An `assumption` row does not fake one.

## Artifact

The map covers every numeric claim in the draft. Status values are only the four named in the output contract.

## Regression

A number that came from the model's memory must not be cited as a file that was never opened.
