# ZUVYR Quickstart

This page is for builders visiting the ZUVYR repository who want something useful immediately without depending on ZUVYR production infrastructure.

## Choose a path

### I want to understand ZUVYR first
Read these in order:

1. [Product](PRODUCT.md)
2. [Architecture overview](ARCHITECTURE_OVERVIEW.md)
3. [Build with ZUVYR](BUILD_WITH_ZUVYR.md)
4. [Security](../SECURITY.md)
5. [Public Use Policy](PUBLIC_USE_POLICY.md)

### I want runnable starter code
Go to [Starter Kits](../starter-kits/README.md).

Available kits:

- **Durable AI Job** — idempotent task creation, reservation, execution and settlement/refund.
- **Permissioned Tool** — explicit grants, owner checks, scope, expiry and revocation.
- **Provider Router** — local mock providers, capability filtering, health gates, ranking and fallback.

Each starter kit uses Node.js 22+ and has no paid-provider dependency by default.

### I want small copyable patterns
Go to [Engineering Pattern Examples](../examples/README.md).

These are smaller than the starter kits and focus on one reusable idea at a time.

## Run a starter kit

Example:

```bash
# Copy the current HTTPS clone URL from GitHub's “Code” button.
git clone <repository-https-url>
cd <repository-directory>/starter-kits/durable-ai-job
npm start
```

Using the repository URL shown by GitHub keeps this guide valid if the repository name changes.

## What you can safely reuse

The contents of:

- `examples/`
- `starter-kits/`

are licensed under Apache License 2.0.

The rest of the repository is **not automatically open-source**. See [LICENSE](../LICENSE) and [Public Use Policy](PUBLIC_USE_POLICY.md).

## What you should not copy into your own project

Do not copy or depend on:

- production credentials or secret values;
- service-role keys;
- customer data;
- private infrastructure identifiers;
- internal admin endpoints;
- undocumented production database interfaces;
- internal ZUVYR deployment procedures as if they were a public API.

## Recommended production checklist

Before turning a prototype into a real AI product, verify:

- authentication and session handling;
- object-level and action-level authorization;
- explicit permission/revocation for high-impact tools;
- idempotency for retried operations;
- durable task states for long-running jobs;
- rate/resource limits;
- reserve → execute → settle/refund accounting when money is involved;
- provider failure and fallback behavior;
- cancellation and cleanup;
- secret handling;
- observability;
- tested denial/failure paths, not only happy paths.

## Next

Use the [Repository Map](REPOSITORY_MAP.md) to find the right material quickly.
