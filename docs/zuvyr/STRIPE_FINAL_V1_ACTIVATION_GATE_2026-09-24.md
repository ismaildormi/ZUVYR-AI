# ZUVYR V1 — Final Stripe Live Activation Gate

Date: 2026-09-24
Status: CANONICAL ADDITIVE V1 ACTIVATION ORDER

## Decision

Stripe test-mode engineering and owner acceptance already remain historical/canonical evidence under PACK019/PACK020 and M08/M09. Stripe **live** activation is intentionally deferred by explicit owner instruction.

This deferral does not waive live billing acceptance. Instead, it fixes the execution order:

1. Complete every other applicable ZUVYR V1 engineering, security, production, authenticated-user, provider and recovery gate.
2. Reach PACK150 with every non-Stripe applicable V1 requirement in `PASS` or `N/A_WITH_EVIDENCE`.
3. Perform Stripe business verification and live-account activation.
4. Perform the controlled real-money Stripe acceptance defined below.
5. Only after that final Stripe acceptance may PACK150 emit `V1_READY=true`.

**Stripe business verification + live-mode real-money acceptance is the final external activation action of ZUVYR V1.**

## State before the final activation

Until PACK150 reaches this last step, billing must remain fail-closed:

- `ZUVYR_BILLING_V1_ACTIVE` must not be `true` in production.
- `LIVE_BILLING_ALLOWED` must not be `true` in production.
- Test-mode webhook settlement in the production database must remain disabled unless a bounded acceptance explicitly enables it and cleans up afterward.
- Stripe secret-key mode and configured billing mode must match.
- A wrong-mode Stripe event must be rejected before any financial/entitlement settlement.
- The canonical Stripe catalog may not be treated as live-ready until every required live Price binding exists.

The presence of Stripe credentials or Price IDs alone does **not** authorize charging a customer.

## PACK150 final Stripe acceptance

The final activation must be evidence-driven and use the real verified Stripe business account. At minimum:

1. Stripe business verification is complete and the account is eligible for live payments/payouts.
2. The intended payout/bank configuration is complete where Stripe requires it for live operation.
3. Production uses live-mode credentials and a live webhook signing secret; no secret value is written to Git, receipts, logs or client code.
4. `STRIPE_BILLING_MODE=live` and the secret-key mode contract passes.
5. Live Price bindings are verified for **Plus, Pro, Legend and Max**.
6. Canonical top-up live Price bindings are verified for every enabled top-up tier.
7. A controlled authenticated live subscription Checkout succeeds using the intended plan and authoritative metadata.
8. A controlled authenticated live top-up Checkout succeeds using the canonical top-up catalog.
9. Signed live webhook delivery settles each operation exactly once; duplicate delivery does not double-credit or double-apply entitlement state.
10. Wrong-mode webhook delivery is rejected before settlement.
11. Subscription lifecycle/invoice handling is proven for the live account.
12. A controlled refund/reversal path is proven and reconciles credits/revenue/entitlements without underflow or duplicate refund.
13. Customer-facing success/cancel paths return to the production ZUVYR application correctly.
14. No acceptance fixture, temporary permission, temporary test-settlement flag or stale checkout intent remains afterward.
15. `ZUVYR_BILLING_V1_ACTIVE=true` and `LIVE_BILLING_ALLOWED=true` are enabled only after the preceding live checks pass.
16. A final post-activation receipt records account mode, Stripe object IDs safe to retain, settlement/reconciliation proof, cleanup and zero secret leakage.

## V1_READY invariant

`V1_READY=true` is forbidden while this final Stripe live gate is incomplete, even if every other PACK and EA item has passed.

Conversely, this deferred external gate must **not** be used to skip or delay fixable internal Stripe work. Any internal billing/configuration/webhook/security/idempotency finding discovered before PACK150 must be repaired immediately under the continuous-improvement policy.

## Historical integrity

This document does not rewrite the historical M08/M09 receipts. It supersedes only the **future execution order** for the still-unverified live Stripe activation.
