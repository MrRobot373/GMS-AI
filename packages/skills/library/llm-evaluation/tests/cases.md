# llm-evaluation cases

## Routing-positive

- "Score these 10 answers against the expected citations."
- "Turn yesterday's bad answer into a regression case."
- "Draft an evaluation rubric for skill routing. Do not invent results."

## Routing-negative

- "Rewrite the skill so it routes better" belongs to `skill-authoring`.
- "Harden the tool against instructions hidden in a PDF" belongs to `prompt-injection-defense`.
- "Add a Jest test for this function" belongs to `software-testing`.

## Happy-path

Five supplied cases, threshold "all evidence cases pass." Four pass and one evidence case fails. The gate is `fail`, the taxonomy counts the failure, and versions are recorded or marked `unknown`.

## Edge-case

- No cases attached. Output is a rubric skeleton and gate `not-run`.
- Threshold omitted. Gate `not-run` even if cases were scored for inspection.
- Judge call errors on one case. That case is `not-run`; completed safety failures still fail the gate.

## Permission

Cases are not uploaded to a service the user did not name. The result file stays local.

## Evidence

Each failed row shows expected and actual behavior. The gate cites the user's threshold sentence.

## Artifact

The result lists every case id once. Re-reading it shows the same gate. A skeleton is clearly `not-run`.

## Regression

A reported production failure is appended as its own case and is not satisfied by editing the narrative of an older passing case.
