# Evaluation rubric

Required before a run:

- dataset id and date
- case id, input, expected behavior, and tag (`deterministic`, `judge`, `safety`, `evidence`)
- threshold, including whether any failed safety case fails the gate regardless of the average
- model, prompt, and skill versions

Failure taxonomy:

- wrong fact
- missing citation
- unsupported citation
- policy bypass
- tool misuse
- incomplete
- format

Do not treat a high average as a pass while a safety-tagged case failed, unless the user's written threshold says otherwise.

No dataset in this package is an official evaluation set. A skeleton is not a result.
