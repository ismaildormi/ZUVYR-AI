# Build with ZUVYR — Safe Engineering Patterns

This guide extracts **general engineering patterns** from ZUVYR that other builders can learn from without exposing production credentials, private infrastructure, customer data, internal provider secrets, or privileged admin flows.

> These patterns are intentionally generic. They are not a promise that ZUVYR's internal APIs are public or stable.

## 1. Durable AI task pattern

For any AI task that can take time, fail, retry, or cost money, avoid "request -> provider -> charge" as one fragile synchronous step.

Use:

```text
request
  -> validate identity + permission
  -> create durable task with idempotency key
  -> reserve budget/credits
  -> enqueue
  -> claim once
  -> execute
  -> persist terminal state
  -> settle actual cost OR refund reservation
```

Important properties:
- retries must return the same logical task instead of creating duplicate paid work;
- a worker crash must not lose the task;
- only terminal success settles cost;
- failed/cancelled work reconciles reservation/refund explicitly;
- task state is server-authoritative.

See `examples/patterns/idempotent-task.js` and `examples/patterns/reserve-settle-refund.js`.

## 2. Permission-bound action pattern

Ownership is not enough for high-impact tools. Separate:
- **who owns the resource**;
- **what action is allowed**;
- **what scope it applies to**;
- **when the permission expires**;
- **whether it has been revoked**.

A computer-control, external-account, file or agent action should evaluate all of those before execution.

See `examples/patterns/permission-bound-action.js`.

## 3. Provider abstraction

Do not let the product UI depend directly on one AI vendor. Define a capability contract such as:

```js
generate({ capability, input, constraints, context })
```

Then route through:
1. capability compatibility;
2. permission/policy;
3. health and quota;
4. expected quality;
5. latency;
6. cost;
7. fallback policy.

This makes providers replaceable and lets you add owned models later without rebuilding every feature.

## 4. Failure-aware billing

Never assume "provider request sent" equals billable success.

Track:
- reserved amount;
- actual metered amount;
- provider outcome;
- product outcome;
- terminal task state;
- refund reason;
- reconciliation status.

For retries, use one idempotency key per logical operation.

## 5. Secure OAuth pattern

A connected account is **not** permission to do everything.

Use:
- explicit consent;
- minimum scopes;
- server-side state/nonce validation;
- encrypted secret/token storage;
- granted-scope checks before tool execution;
- denied-scope handling;
- disconnect + provider revoke;
- audit events.

Never place client secrets in frontend code.

## 6. Safe background workers

Workers should:
- claim work atomically;
- use leases/timeouts for crashed claims;
- verify current permission before execution;
- check cancellation before expensive steps;
- record provider request IDs safely;
- persist terminal state once;
- reconcile accounting;
- avoid logging secrets or full sensitive payloads.

## 7. User-visible state machine

Long-running features should expose clear states such as:

```text
draft -> queued -> running -> succeeded
                       -> failed
                       -> cancelled
```

Do not leave users with a spinner that hides failures. Provide useful retry/cancel behavior and persist history.

## 8. Production acceptance

For features that matter, test more than the happy path:
- authorized success;
- unauthenticated/unauthorized denial;
- wrong-owner denial;
- revoked permission;
- duplicate retry/idempotency;
- provider failure;
- worker restart;
- refund/reconciliation;
- cleanup of test fixtures.

A deployment being green is not proof that the user journey works.

## 9. What this repository intentionally does not publish as a developer contract

Unless a dedicated public API/SDK release says otherwise, do not depend on:
- internal admin endpoints;
- internal scheduler endpoints;
- production secrets or environment variable values;
- private provider routing rules;
- operational backdoors;
- undocumented database tables/RPCs as stable public APIs.

The current internal HTTP map lives in `docs/API.md`, but it is not automatically a public developer API.

## 10. Reuse and licensing

This repository currently does **not** include an explicit open-source license. That means readers should treat the code as reference/source-visible material unless and until the repository owner publishes a license granting reuse rights.

The architecture explanations and generic patterns here are intended to teach. Before copying repository code into another project, verify the applicable license and permissions.

See `docs/SAFE_REUSE.md`.
