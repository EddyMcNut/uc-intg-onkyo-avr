# npm audit reports js-yaml vulnerability in test dependencies

Current project keeps AVA as test runner. `npm audit` may report moderate vulnerabilities through this dev-only chain:

- `ava` -> `supertap` -> `js-yaml`

This is a test-time dependency path, not part of runtime integration package. We already removed `tap-junit` to reduce additional `js-yaml` exposure, but this AVA path remains upstream.

Audit exception note:

- Accepted while AVA stays in place.
- Scope: development and CI test tooling only.
- Revisit when AVA dependency tree ships a fix, or when test runner migration is scheduled.
