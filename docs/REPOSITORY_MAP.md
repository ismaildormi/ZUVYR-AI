# ZUVYR Repository Map

A practical map for people visiting the repository.

## Start here

| Goal | Go here |
|---|---|
| Understand what ZUVYR is | [README](../README.md) |
| Understand the product | [docs/PRODUCT.md](PRODUCT.md) |
| Start building quickly | [docs/QUICKSTART.md](QUICKSTART.md) |
| Reuse safe engineering patterns | [docs/BUILD_WITH_ZUVYR.md](BUILD_WITH_ZUVYR.md) |
| Run starter projects | [starter-kits/](../starter-kits/README.md) |
| Copy small educational examples | [examples/](../examples/README.md) |
| Understand architecture | [docs/ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) |
| Understand security expectations | [SECURITY.md](../SECURITY.md) |
| Understand reuse/legal boundary | [docs/PUBLIC_USE_POLICY.md](PUBLIC_USE_POLICY.md) |
| Contribute | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Follow V1 execution | [docs/zuvyr/ROADMAP_150.md](zuvyr/ROADMAP_150.md) |

## Public builder resources

### `starter-kits/`
Runnable, dependency-light reference projects intended for external builders.

Current kits:
- durable AI task;
- permission-bound tool;
- provider router.

Licensed under Apache License 2.0.

### `examples/`
Small educational patterns that can be studied or reused independently.

Licensed under Apache License 2.0.

### `docs/BUILD_WITH_ZUVYR.md`
Explains general engineering patterns extracted from ZUVYR:
- durable execution;
- idempotency;
- permission binding;
- provider abstraction;
- safe workers;
- OAuth boundaries;
- accounting reconciliation;
- production acceptance.

## ZUVYR product and architecture documentation

### `docs/PRODUCT.md`
Public product overview.

### `docs/ARCHITECTURE_OVERVIEW.md`
High-level architecture intended to explain how major systems fit together without exposing secrets.

### `docs/SECURITY.md` and `SECURITY.md`
Security architecture and public reporting policy.

## V1 execution and engineering truth

The following areas are primarily for ZUVYR development/operations rather than public SDK use:

- `ZUVYR_CONTINUE_HERE.md`
- `ZUVYR_MASTER_STATE.json`
- `ZUVYR_MASTER_MATRIX.md`
- `docs/zuvyr/ROADMAP_150.md`
- `docs/zuvyr/PACK*_EXECUTION_PLAN.md`
- `zuvyr-pack-evidence/`
- backend migrations and production acceptance tests.

They may be useful to understand how ZUVYR is built, but they are not automatically stable public interfaces.

## Application source

### `frontend/`
ZUVYR web product UI and product assets.

### `backend/`
Backend services, product modules, workers, policies, migrations and runtime code.

### `device-agent/`
ZUVYR device/computer-control agent implementation.

### `cli/`
Operational/developer CLI used by the project.

### `tools/`
Validation, smoke-test, continuity and operational utilities.

## Deployment and infrastructure

Infrastructure and deployment files exist in the repository for ZUVYR operations. Treat them as implementation material, not a promise of a reusable hosting template.

Never copy credentials, environment values, production IDs or privileged operational data.

## Historical and legacy material

The repository still contains some pre-ZUVYR historical filenames, backups and compatibility identifiers.

They are **not the current product identity** and should not be treated as recommended starting points for new integrations. They remain only where safe migration, compatibility or historical evidence still matters.

Current product identity: **ZUVYR**.

## Licensing boundary

- `examples/` → Apache License 2.0
- `starter-kits/` → Apache License 2.0
- everything else → proprietary unless a file/directory explicitly states otherwise

See the root [LICENSE](../LICENSE).
