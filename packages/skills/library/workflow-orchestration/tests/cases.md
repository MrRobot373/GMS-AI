# workflow-orchestration cases

## Routing-positive

- "Do the export, then the mail, and stop if the mail is not approved."
- "Resume the import that died after the file landed."
- "Cancel the rest of this multi-step job."

## Routing-negative

- "Just parse this one CSV" stays in the data skill.
- "Which skills do we need?" belongs to `skill-router`.
- "May I send this?" belongs to `permission-and-approval-planner`.

## Happy-path

Three steps: local transform, local file write, external create. The checkpoint shows the first two `applied`, the third `needs-approval`, and a resume point on the third. No external create has been called.

## Edge-case

- Resume after a timeout on the external create. State stays `attempted-unknown` and the step is not called again.
- User cancels during step two after step one applied. Step one stays `applied`; later steps are `cancelled`.
- Overlapping writes. Run them in series.

## Permission

An external step does not run while its permission class is `approval-required` or `denied`.

## Evidence

The checkpoint lists idempotency keys for every mutation attempt and the tool result or the timeout. It does not claim `applied` without a result.

## Artifact

The checkpoint file or reply contains the states from `references/state-machine.md` and a next step. A second resume with the same key does not add a second external result.

## Regression

A retry of a timed-out send must not create a second message. The step stays `attempted-unknown`.
