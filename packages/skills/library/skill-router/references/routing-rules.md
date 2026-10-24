# Routing rules

Read `catalog.json` beside this file. Status meanings:

- `installed`: the folder name in `installedAs` may be selected.
- `routed`: do not select `name`. Select `coveredBy` when that slug is enabled.
- `proposed`: do not select it and do not write its instructions. Tell the user the capability is not installed.

## Budget

- One outcome: one skill, or two when a checker must follow a producer.
- Mixed outcome: at most four skills.
- A phased program: name the current phase only.

## Order

1. `permission-and-approval-planner` when the outcome can send, delete, deploy, publish, or purchase.
2. The producer skill.
3. `evidence-and-provenance` when the outcome states numbers, citations, or a decision.
4. `artifact-quality-control` when the outcome is a file the user will open.

## Conflicts

- A router stays selected when its specialist row is `proposed` or `routed` back to that same router.
- Retained library slugs in `retainedLibrary` are real skills. Select one when its description matches and no catalog row is narrower and installed.
- Organization override text in the task wins over this file. If no override is attached, say that this file is the platform default.
