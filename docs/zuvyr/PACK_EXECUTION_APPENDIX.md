# ZUVYR — Mandatory Appendix Sent With Every Pack

This appendix is part of every PACK001–PACK150 execution prompt and every future ZUVYR pack. It is not optional guidance. It is a completion requirement.

## Mandatory external architecture audit overlay

The canonical `docs/zuvyr/ROADMAP_150.md` contains the **EXTERNAL TECHNICAL ARCHITECTURE AUDIT OVERLAY — 2026-09-22** with requirements `EA-001` through `EA-090`. That overlay is part of the Pack contract.

- Do not renumber Packs or reopen historical Packs merely to satisfy it.
- When an EA item maps to the current or a future Pack, that Pack owns reconciliation of the mapped requirement in addition to its original scope.
- A mapped P0/P1 requirement may be marked not implemented only when the corresponding capability is explicitly `NOT_ADVERTISED` / `NOT_IN_V1`, is not misleadingly reachable, and the limitation is recorded.
- `PACK148` must run the horizontal-plane acceptance rehearsal; `PACK149` must reconcile external/legal/business/claim gates; `PACK150` must reconcile every `EA-001…EA-090` item in the final release manifest.
- Plan-level absence is not proof that runtime code is absent. Inspect the current implementation first and preserve verified behavior.

Every modified Pack receipt must additionally record, where applicable:

```text
EXTERNAL_AUDIT_ITEMS_TOUCHED:
EA_RECONCILIATION_STATUS:
UNRESOLVED_P0_P1:
NOT_ADVERTISED_DECISIONS:
HORIZONTAL_PLANE_TESTS:
```

## Mandatory instruction to the executing engineer/agent

Before you modify anything, preserve the existing verified implementation and exact pack identity. Do not renumber historical packs, do not reopen completed packs merely to attach this overlay, and do not delete prior requirements. Apply this contract additively wherever the current pack touches product behavior, UI, orchestration, tools, models, routing, memory/context, economics, learning, or evaluation.

Before the pack may be marked `LOCKED_VERIFIED`, answer and implement these three questions:

1. **How does this feature concretely help the user in the real world?**
2. **What can ZUVYR execute for the user here, instead of merely explaining what the user could do?**
3. **After the result, what is the best contextual Next Best Action ZUVYR should suggest?**

The answers must be reflected in the implementation where relevant, not written only in the receipt.

## Required user-facing behavior

ZUVYR is outcome-oriented. The default flow is:

`UNDERSTAND -> ANSWER OR EXECUTE -> VERIFY RESULT -> EXPLAIN WHAT CHANGED -> RE-EVALUATE USER POSITION -> SUGGEST NEXT BEST ACTION`

If an authorized tool can complete the useful step, prefer execution over instructions-only output. If execution is unavailable, produce the closest executable artifact or the exact next step.

Do not add unnecessary steps. Do not invent success. Do not claim a tool action happened unless it was actually executed and verified.

## Contextual suggestions are a product feature, not decoration

After a meaningful answer or action, generate a small set of relevant suggestion chips. Examples of possible labels are:

- `شنو ندير دابا؟`
- `جاوب بلاصتي`
- `كيفاش نربح من هاد الفرصة؟`
- `نفّذ الخطوة التالية`
- `شنو أحسن قرار ليا؟`

These examples are not a fixed menu. The labels and intents must adapt to the actual result and current user goal.

A suggestion MUST NOT be shown just because it exists in a static list. For example, do not show a money suggestion when money is irrelevant and do not show an execution suggestion for an action that cannot actually be executed.

### What must happen after a suggestion is tapped

The tap is not treated as an isolated short prompt. Reconstruct the intended request using:

- current conversation state;
- immediately preceding answer/action/result;
- user's active objective;
- relevant authorized memory/context;
- available tools and permissions;
- unresolved blockers;
- known cost/risk information;
- current task state.

Then answer or execute what that suggestion means **for this user, in this situation, at this moment**.

After the new result, re-evaluate again and replace the suggestion set with a better next set. The intended loop is:

`CONTEXT -> ANSWER/ACTION -> RESULT -> RE-EVALUATE -> NEXT BEST ACTION -> TAP -> CONTEXTUAL EXECUTION -> NEW RESULT -> BETTER NEXT ACTION`

Static FAQ-style chips that ignore the current result fail this requirement.

## Money & Opportunity behavior

When financially relevant, ZUVYR should proactively notice legitimate opportunities that may improve the user's position, even when the user did not literally ask "how do I make money?".

Relevant categories may include jobs, freelance work, creator/UGC campaigns, affiliate programs, services, products, business ideas, monetizable skills, negotiation, cost savings, sponsorships, partnerships, grants/programs, automation savings, repurposing existing assets, or market-demand gaps.

Do not force monetization into unrelated experiences and do not promise income. Where material, identify assumptions, effort, dependencies, downside, and uncertainty.

## Information/provenance behavior

Useful information does not have to be formally documented before it can be mentioned. However, ZUVYR must never fabricate certainty.

Where useful, attach one of these states:

`VERIFIED | LIKELY | COMMUNITY | UNVERIFIED | SPECULATIVE`

The provenance state should help the user judge confidence; it should not automatically suppress useful information. Facts, inference, community experience, estimate, rumor, and speculation should not be silently blended together.

## Personalization behavior

Personalization is used to improve ordering, relevance, framing, defaults, and Next Best Action selection. It is not a reason to arbitrarily remove core capabilities from a user.

Ask internally:

- What is this user actually trying to accomplish now?
- What has already happened in this task?
- What is the realistic next move?
- What can ZUVYR execute immediately?
- Is there a relevant opportunity to earn or save money?

## Narrow hard-stop behavior

Avoid broad blanket refusals. The operational hard-stop layer is reserved for requests that materially enable severe or catastrophic harm or intrinsically abusive actions, including operational guidance for killing, explosives, serious physical injury, theft, fraud, coercion, or destructive cyber abuse.

When this boundary applies, block only the harmful operational core where possible and preserve safe high-level, historical, defensive, legal, preventive, recovery, or other non-operationally harmful help.

## Mandatory pack receipt fields

Every new or modified pack must record:

```text
USER_VALUE:
EXECUTABLE_USER_ACTIONS:
MONEY_OPPORTUNITY_RELEVANCE: NONE | DIRECT | INDIRECT
MONEY_OPPORTUNITY_NOTES:
NEXT_BEST_ACTION:
SUGGESTION_CHIPS:
PROVENANCE_BEHAVIOR:
PERSONALIZATION_BEHAVIOR:
HARD_STOP_IMPACT:
OUTCOME_TESTS:
```

`MONEY_OPPORTUNITY_RELEVANCE: NONE` is valid when money/opportunity behavior is genuinely irrelevant.

## Mandatory acceptance checks

Where relevant to the pack, verify all of the following before LOCK:

- the feature produces a concrete user benefit rather than only a technically correct response;
- available authorized execution is used instead of unnecessarily returning instructions;
- unavailable execution falls back to a useful artifact or exact next step;
- suggestions are derived from the current result and user goal;
- tapping a suggestion preserves/reconstructs the active context rather than starting a generic query;
- the next suggestion set changes when the latest result changes the user's situation;
- financially relevant opportunities can surface without false promises;
- uncertainty/provenance is visible when material;
- personalization improves relevance without arbitrarily removing capability;
- the hard-stop layer does not erase safe useful parts of a mixed request;
- prior pack behavior and verified regressions remain intact.

## Range-specific integration

- **001–020:** cost/value, billing/credits/limits, cheaper legitimate alternatives when relevant, and the next useful financial action.
- **021–040:** provider/model/router/kernel/orchestration choices optimize successful user outcomes and total cost per successful task; preserve Answer/Execute/NBA behavior across model/provider switches.
- **041–060:** contextual suggestions, provenance, goal/context continuity, memory-aware Next Best Action, chat/research continuation.
- **061–074:** image/video/audio results lead to contextually useful edit/reuse/export/publish/monetization follow-ups when relevant.
- **075–080:** Code Studio moves from explanation to build/test/fix/export and chooses the next action from actual workspace/build state.
- **081–090:** browser/IP/automation/connectors execute authorized actions, verify consequences, reconcile uncertain side effects, and continue intelligently.
- **091–100:** Manager/learning/hardening measure task success, execution success, suggestion usefulness, unnecessary refusal, opportunity quality, and cost per successful task.
- **101–150:** integration/production qualification proves this contract survives cross-surface handoffs, interruption/recovery, billing, privacy, scaling, learning, and final V1 acceptance.

## Exact rule to paste into every pack prompt

> **GLOBAL ZUVYR USER-OUTCOME CONTRACT:** Before LOCK, determine and implement (1) how this capability concretely improves the user's situation, (2) what ZUVYR can execute for the user instead of merely explaining, and (3) the contextual Next Best Action after the result. User-facing packs must generate dynamic suggestion chips from the live conversation/task/result; tapping a chip must rebuild its intent from the current user and task context and continue toward a better outcome. Scan for legitimate earning/saving opportunities when contextually relevant. Distinguish verified, likely, community, unverified, and speculative information without fabrication. Preserve existing verified behavior and use only narrow hard stops for materially enabling severe harm or intrinsically abusive actions.

Canonical full contract: `docs/zuvyr/USER_OUTCOME_ENGINE.md`
Machine-readable overlay: `docs/zuvyr/user-outcome-pack-overlay.v1.json`
