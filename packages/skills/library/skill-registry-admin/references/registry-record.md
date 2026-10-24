# Registry plan

Record these fields before any apply call:

- slug
- action: enable, disable, stage, rollback, or retire
- fromState and toState
- catalog rows that point at the slug
- replacement slug, or "none" when the skill is standalone
- rollback action
- approver and the exact confirming sentence
- applied: true only with the API response, otherwise false
- timestamp and actor

Stage means the folder exists but the organization switch stays off until a later confirm. Retire sets maturity guidance in the plan; this skill does not rewrite another skill's frontmatter.
