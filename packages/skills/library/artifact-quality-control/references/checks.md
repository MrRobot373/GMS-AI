# Checks by type

`scripts/inspect_artifact.py` covers reopen and structural scans. Add the following when the tool exists:

- Workbook: sheet names, used range, and the script’s formula-error scan. Cached values appear only after a spreadsheet application has calculated the file; say so when formulas were not evaluated.
- Word: paragraph and table counts, then a visual pass for overflow, heading orphans, and broken links when a renderer exists.
- PDF: page count. Visual page images are a separate step; do not claim them if no renderer ran.
- Presentation: slide count, then clipping, font substitution, and contrast when a renderer exists.
- CSV or JSON: row or key counts. An empty file is a warning unless the user expected rows.
- Image: file opens and dimensions are known. This script does not inspect pixels; say that the pixel check was not run.
- Code: run the project’s own test or typecheck. Do not invent a command if the project has none; report "no project check configured."

Critical means the file is missing, unreadable, has no required pages or sheets, contains a formula error marker, or the inspector package is absent. Warnings are empty extracts, skipped visual review, and unknown extensions.
