# artifact-quality-control cases

## Routing-positive

- "Reopen the xlsx and tell me if any formula errors are stored in it."
- "Do not deliver the PDF until its page count is checked."
- "Compare the JSON export to the file on disk."

## Routing-negative

- "Build the workbook" belongs to `excel-spreadsheets`.
- "Explain which source supports the total" belongs to `evidence-and-provenance`.
- "Redesign the title slide" belongs to `presentations`.

## Happy-path

A workbook saved with a literal `#DIV/0!` cell is `blocked`, and the report names the cell. A small JSON object with no critical findings is `pass` and includes the key count.

## Edge-case

- Path does not exist. Verdict `blocked`, no invented page count.
- Extension `.png`. The report says the pixel inspector did not run.
- `openpyxl` missing while checking `.xlsx`. Verdict `blocked` because the script records a missing package. Do not pass the file.

## Permission

The checker does not email the artifact and does not delete the failed file.

## Evidence

The verdict quotes the script JSON, including `summary` counts. Visual checks that did not run are named.

## Artifact

The report is valid JSON from the script plus the verdict line. Re-running the script on the same file returns the same critical list.

## Regression

A file the writer believes was saved must still be opened from the path. Memory of the write is not a pass.
