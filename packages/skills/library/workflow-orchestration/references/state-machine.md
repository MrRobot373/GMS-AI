# Workflow states

Each step is one of: `planned`, `running`, `needs-approval`, `applied`, `attempted-unknown`, `failed`, `cancelled`, `skipped`.

The workflow is `running` while any step is `planned` or `running`, `needs-approval` while it is waiting, `completed` when every required step is `applied` or `skipped`, `partial` when some steps applied and the rest failed or cancelled, and `cancelled` when the user cancelled.

Rules:

- Write the checkpoint before the tool call that mutates something outside the task folder.
- An idempotency key is the workflow id plus the step id. A second attempt with the same key is forbidden when the state is `applied` or `attempted-unknown`.
- Retries are for local or proven-not-applied steps only. Maximum two retries, then `failed`.
- Cancellation does not roll back an `applied` external step. Record it so a person can undo it deliberately.
- Human checkpoints use `needs-approval` and the confirm sentence from the permission plan.
