# Tool contract

- name and one-sentence effect
- arguments: name, type, required, and what is rejected
- auth: who may call it, or `not specified`
- side effect: yes or no
- dry-run: the response shape when nothing is changed
- idempotency key for mutations
- error shape: code, field, message with no secrets
- maximum result size and truncation behavior
- audit fields: actor, object, dry-run or apply, result

Contract tests, each with an expected error and no live side effect:

1. Missing required field.
2. Wrong type.
3. Unknown field.
4. Unauthorized caller.
5. Duplicate mutation key, expecting the first result and no second effect.

Fake ids only (`item_example`, `user_example`). No live host is part of this package.
