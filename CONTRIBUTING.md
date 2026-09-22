# Contributing to ZUVYR

ZUVYR is under active V1 development. Changes must preserve verified production behavior and the canonical pack execution model.

## Before changing code
1. Read `README.md`, `ZUVYR_CONTINUE_HERE.md`, `ZUVYR_MASTER_STATE.json`, `ZUVYR_MASTER_MATRIX.md` and `docs/zuvyr/ROADMAP_150.md`.
2. Reconcile the relevant area with current implementation and tests.
3. Do not treat historical ROX files/backups as current product truth.
4. Never commit secrets, credentials, tokens or customer data.

## Change standard
Keep changes scoped and reviewable. Add or update tests for successful, denied and failure behavior where applicable. Authorization, idempotency, accounting, cleanup, accessibility, cost and operational impact are part of feature quality.

A deploy, mock or local test alone is not evidence that a production acceptance gate is complete. Pack status is changed only with the required receipt/evidence.

## Pull requests
Describe the problem, scope, tests/evidence, migration or deployment impact, security/permission impact, usage/cost impact and rollback considerations. Do not mix unrelated cleanup into production-critical changes.

## Brand
The current product name is **ZUVYR**. Legacy ROX names can remain only where they are historical artifacts or compatibility identifiers that have not yet been safely migrated.
