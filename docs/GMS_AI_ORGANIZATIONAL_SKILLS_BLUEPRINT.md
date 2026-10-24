# GMS AI / Monolith Atomic Engine — Organizational Skills Blueprint

**Prepared:** 18 October 2026  
**Maintained enumeration:** `packages/skills/library/skill-router/references/catalog.json` (195 rows)  
**Installed phase 0:** the twelve Platform skills in `packages/skills/library/`

This file is the contract the catalog and the phase 0 skills implement. The row-level list (priority, phase, purpose, and whether a current library skill already covers the work) lives in the catalog so it cannot drift from a second copy of the tables.

## 1. Direction

Do not add a folder for every catalog row. A row is selectable only when its status is `installed`. `routed` means use `coveredBy`. `proposed` means the capability is not a skill yet.

The first production catalog should stay near 110–125 skills, by installing a row only after a real workflow needs it and the contract below passes. Phase 0 is the trust layer. Later phases stay in the catalog until that evidence exists.

## 2. What every governed skill contains

```text
skill-name/
├── SKILL.md
├── references/     # only when a mode reads them
├── scripts/        # only for a deterministic helper
├── assets/         # only for a real template
└── tests/cases.md
```

Do not create empty directories. Do not add `agents/openai.yaml`; this harness loads `SKILL.md` through the skill tool, not that file.

`SKILL.md` frontmatter is scalar. The loader does not read nested YAML.

- **name:** lowercase, hyphenated, the folder name, under 64 characters.
- **description:** "Use when" or "Use for", 61–160 characters.
- **category:** Software development, Data, Documents & writing, Business, Apps, or Platform.
- **version, owner_team, risk_level, maturity.**

Body headings: Purpose, Trigger examples, Exclusions, Inputs, Operating modes, Workflow, Tool selection, Permissions, Output contract, Quality gates, Failure behavior, Done when.

`tests/cases.md` headings: Routing-positive, Routing-negative, Happy-path, Edge-case, Permission, Evidence, Artifact, Regression.

Permissions cover read, write, external send, delete, publish, deploy, approve, and spend. Send, delete, publish, deploy, and purchase do not run without a confirmation that names the object. No skill grants those to itself.

Missing organization policy, templates, credentials, standards, and approval matrices stay missing. The skill says they were not attached. It does not invent them.

Maturity:

| Level | Meaning |
|---|---|
| draft | Instructions and structural checks exist; cases have not been run in a task |
| tested | Happy path and main edge cases have been run, with a sample artifact |
| verified | Independent cases and permission checks have a recorded result |
| production | Used in a real organization workflow, with an owner and a runbook |
| restricted | High-risk domain; a qualified person must review the output |
| deprecated | Kept for compatibility, with a replacement |

Phase 0 skills are `draft`. Structural validation is not a production evaluation.

## 3. Catalog status

`packages/skills/catalog/build_catalog.py` writes the JSON. `--check` fails when the JSON is stale.

- `installed` — folder in `installedAs` may be selected.
- `routed` — select `coveredBy`, which is an installed router. Do not create the narrower name yet.
- `proposed` — do not select it and do not author it unless someone explicitly asks the `skill-authoring` skill for that capability and no router already covers it.
- `retainedLibrary` — installed skills that are not a catalog row and not a current router. They remain selectable when their description matches.

Broad routers that must keep doing the work until a specialist is installed include `ui-ux-design`, `excel-spreadsheets`, `word-documents`, `pdf-documents`, `presentations`, `email-calendar-assistant`, `system-design`, `project-management`, and `product-management`.

## 4. Phases

### Phase 0 — installed as draft

`skill-router`, `skill-authoring`, `skill-registry-admin`, `permission-and-approval-planner`, `evidence-and-provenance`, `artifact-quality-control`, `template-library`, `workflow-orchestration`, `audit-log-and-reporting`, `llm-evaluation`, `prompt-injection-defense`, `agent-tool-design`.

Exit gate for Production, not yet met: routing cases run in the harness, permission checks observed, artifact checks observed, and a regression case for each production failure.

### Phase 1 — Office and delivery

Spreadsheet, Word, PDF, and presentation specialists, plus requirements, project plans, weekly reports, decisions, SOPs, and executive briefings. Exit gate: a supplied template can be filled, rendered, reopened, and checked without changing locked text.

### Phase 2 — Product and software

UX specialists, architecture, frontend, backend, identity, tenancy, data, and delivery operations. Exit gate: one feature can move from requirements to design, implementation, tests, documentation, and release evidence.

### Phase 3 — AI engine

Provider integration, model routing, prompts, RAG, grounded answers, memory, orchestration, incident response, and governance. Exit gate: an evaluation set shows citation quality, isolation, tool correctness, and cost bounds.

### Phase 4 — Power electronics and engineering

Calculation verification through protection, high-voltage safety, PCB review, tests, and uncertainty. These rows are restricted when the output could affect people, high voltage, machinery, or production hardware. Exit gate: independent numerical cases, units, invalid inputs, validity ranges, and a qualified-engineer review rule. No engineering skill is installed yet.

### Phase 5 — Departments and remaining connectors

Procurement, finance, HR, sales, marketing, support, compliance, quality, manufacturing, and specialist engineering, only when an owner and a real workflow exist.

## 5. Harness rules the skills assume

Descriptions are the only text loaded for every task. Full instructions, references, and the catalog load when that skill is selected. Secrets stay out of prompts, artifacts, and logs. External mutations are classified by `permission-and-approval-planner` before they run. File outputs go through `artifact-quality-control` before they are called done. Claims with numbers go through `evidence-and-provenance`.

## 6. Prompt for the next skill

```text
Create a production-ready skill package named <skill-name> for the GMS AI / Monolith Atomic Engine.

Use the organizational skill contract in docs/GMS_AI_ORGANIZATIONAL_SKILLS_BLUEPRINT.md
and the matching row in packages/skills/library/skill-router/references/catalog.json.

Requirements:
1. Create SKILL.md with scalar YAML frontmatter: name, description, category, version, owner_team, risk_level, maturity.
2. Keep the routing description inside 61–160 characters, starting with "Use when" or "Use for".
3. Define purpose, operating modes, inputs, workflow, tool choice, permissions, output contract, failure behavior, quality gates, and "Done when".
4. Put schemas, standards, and mode-specific procedures in references/ and link them only where needed.
5. Add scripts/ only for deterministic work. Run the skill-authoring validator.
6. Add assets/ only for a real template. Do not invent organization templates or policy.
7. Create tests/cases.md for routing-positive, routing-negative, happy-path, edge-case, permission, evidence, artifact, and regression behavior.
8. If the catalog row is routed, do not add a second folder unless the user asked to replace that router.
9. Leave maturity at draft until the cases have been run in a task.
10. Return the file tree, validator result, example invocation, limitations, and the evidence still required for production.

Specific skill definition:
<paste the catalog row and any organization inputs the user actually supplied>
```
