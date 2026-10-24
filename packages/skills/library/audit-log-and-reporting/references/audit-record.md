# Audit record

Each event:

- time (or `unknown`)
- actor (user or agent id already in the task; otherwise `unknown`)
- skill slug, when one applied
- tool name
- object (path, record id, or message id)
- action verb
- before and after, or `unknown`
- approval sentence, or `none`
- result: `ok`, `failed`, `unreadable`, or `unknown`
- redaction note when a value was removed

Do not store secret values, full personal documents, or raw connector headers. A file path is acceptable. A password, token, or connection string is not.

Retention and the destination system are `not specified` unless the task includes a rule.
