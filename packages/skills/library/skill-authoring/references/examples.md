# Minimal shape

```text
capability-name/
├── SKILL.md
├── references/notes.md    # only if a mode needs it
├── scripts/check.py       # only if the workflow runs it
└── tests/cases.md
```

Frontmatter:

```yaml
name: capability-name
description: "Use when <outcome>. Do not use it for <nearest other task>."
category: Platform
version: 1.0.0
owner_team: Platform
risk_level: medium
maturity: draft
```

A description that no longer fits in 160 characters is too broad. Split the capability or cut the trigger list, do not wrap the description onto a second line.

Example invocation after validation: "Use the capability-name skill to <one outcome>." The reply must include the validator line `ok capability-name` and must not claim the skill is enabled for the organization.
