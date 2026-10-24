# Skill contract

Frontmatter keys, one scalar each. The loader does not read nested YAML.

- `name`: folder name, lowercase, hyphenated, at most 64 characters.
- `description`: "Use when" or "Use for", 61 to 160 characters, including the nearest exclusion in spirit if it fits.
- `category`: Software development, Data, Documents & writing, Business, Apps, or Platform.
- `version`: `major.minor.patch`.
- `owner_team`: team accountable for the skill.
- `risk_level`: low, medium, high, or restricted.
- `maturity`: draft, tested, verified, production, restricted, or deprecated.

Required headings, in any order, each as a level-2 heading: Purpose, Trigger examples, Exclusions, Inputs, Operating modes, Workflow, Tool selection, Permissions, Output contract, Quality gates, Failure behavior, Done when.

`tests/cases.md` needs level-2 headings: Routing-positive, Routing-negative, Happy-path, Edge-case, Permission, Evidence, Artifact, Regression.

Permissions name read, write, external send, delete, publish, deploy, approve, and spend. Anything other than local read, and local write inside the task, is denied unless the user has already approved that exact action.

Do not copy a standard, datasheet, or policy into the skill. Point at the identifier and tell the agent to use the copy the user supplies.

Maturity `draft` is correct while the cases have not been run in a task. Do not mark `production` from inside the authoring skill.
