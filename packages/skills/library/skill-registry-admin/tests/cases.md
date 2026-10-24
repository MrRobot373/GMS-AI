# skill-registry-admin cases

## Routing-positive

- "Disable seo for everyone."
- "What depends on word-documents if we turn it off?"
- "Enable skill-router after review."

## Routing-negative

- "Rewrite the seo skill instructions" belongs to `skill-authoring`.
- "Draft the email" belongs to the email router.
- "Which skill should write a contract summary?" belongs to `skill-router`.

## Happy-path

A disable plan for `seo` lists from-state on, to-state off, no catalog row that uses it as `coveredBy`, rollback "enable seo", and `applied: false` until an admin confirms the slug.

## Edge-case

- Slug `not-a-skill`. Stop with no plan to create it.
- User says "turn skills off" with no slug. Ask for the slug.
- Confirm arrives for a different slug than the plan. Do not apply.

## Permission

Without an admin confirm that repeats the slug and the new state, no library PATCH is sent. The skill never deletes the folder.

## Evidence

An applied plan cites the API result. An unapplied plan does not say the organization changed.

## Artifact

The plan fields in `references/registry-record.md` are all present. Dependent rows are copied from the catalog, not guessed.

## Regression

Disabling `excel-spreadsheets` must list the catalog rows whose `coveredBy` is that slug before anyone is asked to confirm.
