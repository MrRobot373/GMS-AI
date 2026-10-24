# template-library cases

## Routing-positive

- "Fill the attached status template and do not touch the footer clause."
- "What template version is this workbook?"
- "Map these fields onto the attached docx before writing a new file."

## Routing-negative

- "Write a memo from scratch" belongs to `word-documents`.
- "Create our house PowerPoint style" is a template-authoring job that is not installed.
- "Make sure the filled file opens" belongs to `artifact-quality-control`.

## Happy-path

User attaches `status.docx` with a locked footer and three placeholders, plus values for two of them. The output is a new path, the footer matches, one placeholder remains and is listed, and the version is `user-supplied`.

## Edge-case

- No file and no registry. Stop with no invented letterhead.
- Input includes a value for a locked clause. The clause stays, and the skipped edit is listed.
- Output path equals the template path. Refuse and pick a new path.

## Permission

The template file is not deleted and not emailed. Only the new output is written.

## Evidence

The reply names the template path and the output path. Version `user-supplied` is used when the file has no version.

## Artifact

The new file is a different path. Placeholder tokens that were mapped are gone. The locked excerpt still matches the template.

## Regression

A request that names a company template which was not attached must not be satisfied by a freshly designed lookalike.
