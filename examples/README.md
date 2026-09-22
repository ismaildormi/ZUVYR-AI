# ZUVYR Engineering Pattern Examples

These small examples demonstrate general patterns used when building reliable AI products.

They intentionally contain:
- no production credentials;
- no ZUVYR customer data;
- no private provider configuration;
- no dependency on ZUVYR's internal production endpoints.

Examples:
- `patterns/idempotent-task.js` — prevent duplicate logical work on retry.
- `patterns/permission-bound-action.js` — evaluate explicit scoped grants before an action.
- `patterns/reserve-settle-refund.js` — model usage reservation and terminal reconciliation.

> Licensing: everything inside `examples/` is licensed under Apache License 2.0. ZUVYR trademarks and branding are not licensed. See [LICENSE](LICENSE) and the [Public Use Policy](../docs/PUBLIC_USE_POLICY.md).
