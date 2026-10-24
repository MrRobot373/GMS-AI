# skill-router cases

## Routing-positive

- "Which skills should handle a board update and the spreadsheet behind the numbers?"
- "This request mentions both a contract summary and an email draft. What should load?"
- "Use the excel financial model skill." The catalog row is routed, so the selector must return the installed router.

## Routing-negative

- "Create a new skill package called procurement-and-rfq" belongs to `skill-authoring`.
- "Disable the seo skill for everyone" belongs to `skill-registry-admin`.
- "Write the weekly status report" belongs to the installed project router, not to this selector, once the selection is made.

## Happy-path

Request: "Prepare a customer proposal with a price table." Selection contains the installed proposal router and, because a workbook is implied, the spreadsheet router. It does not contain `sales-proposal-and-sow` while that row is only routed. Each line says what that skill must not do.

## Edge-case

- No description matches. Reply that no library skill applies and continue without a fake slug.
- Catalog file missing. Stop. Do not reconstruct the 195 rows from memory as if they were installed.
- User names five unrelated tasks. Ask which outcome is in scope instead of loading all five families.

## Permission

The selection text does not grant send, delete, deploy, publish, or purchase. Those stay with `permission-and-approval-planner`.

## Evidence

Each chosen slug cites the phrase that matched and the catalog status used (`installed`, `routed`, or retained).

## Artifact

The selection list is the artifact. It contains folder slugs only, never a proposed name.

## Regression

A request that needs one installed skill must not be answered with the whole catalog copied into the reply.
