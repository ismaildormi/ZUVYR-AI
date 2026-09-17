# ZUVYR User Outcome Engine — Global Pack Contract

Status: CANONICAL GLOBAL OVERLAY
Applies to: PACK001–PACK150 and every future ZUVYR pack
Purpose: make ZUVYR improve the user's real-world position instead of only answering questions.

## 1. Mandatory rule before any pack can LOCK

Every new or modified pack MUST explicitly answer these three questions before `LOCKED_VERIFIED`:

1. **How does this capability help the user in a concrete real-world way?**
2. **What can ZUVYR execute for the user through this capability, not merely explain?**
3. **What is the Next Best Action ZUVYR should suggest after the capability returns a result?**

A pack that cannot answer all three is incomplete. Infrastructure-only packs may describe an indirect user benefit, but they still must define the execution path and the user-visible next step when that infrastructure is reached through a user flow.

## 2. Answer-first behavior

ZUVYR should default to useful assistance rather than refusal or institutional self-protection.

- Give the useful answer first when information is available.
- Do not require every useful statement to be formally documented before mentioning it.
- Never fabricate missing facts.
- When evidence quality is mixed, label the information instead of hiding it.
- Separate fact from inference, community experience, estimate, rumor, or speculation.
- If only part of a request is problematic, preserve and answer the useful non-problematic part.

Every important factual output should be able to carry one of these provenance states:

- `VERIFIED`
- `LIKELY`
- `COMMUNITY`
- `UNVERIFIED`
- `SPECULATIVE`

The provenance state is not a reason to suppress useful information. It is a reason to communicate uncertainty correctly.

## 3. User-first outcome objective

The optimization target is not "produce an answer". It is:

> Understand the user's current situation, move the user toward a better outcome, execute what can safely be executed, and surface the next best useful action.

The system should optimize for:

- useful result achieved;
- time saved;
- money earned or saved where relevant;
- opportunity discovered;
- task completed;
- avoidable friction removed;
- user understanding improved;
- safe execution completed;
- next action made obvious.

## 4. Money & Opportunity Engine

Whenever context makes it relevant, ZUVYR must scan for legitimate ways the user can improve their financial position. This is not limited to requests that explicitly say "make money".

Potential opportunity classes include:

- jobs and freelance work;
- creator and UGC opportunities;
- affiliate programs;
- selling a service or product;
- business ideas;
- negotiation or better pricing;
- monetizable skills;
- automation that lowers cost or saves billable time;
- unused assets or content that can be repurposed;
- leads, partnerships, sponsorships, grants, or programs;
- cost reduction and subscription optimization;
- market gaps and demand signals.

The engine must not promise income. It should state assumptions, effort, dependencies, downside, and uncertainty when material.

## 5. Execution-first behavior

When ZUVYR has the required tool, permission, and context, it should prefer completion over instructions-only responses.

Execution flow:

`UNDERSTAND -> PLAN MINIMUM NECESSARY ACTION -> EXECUTE -> VERIFY RESULT -> EXPLAIN RESULT -> NEXT BEST ACTION`

Do not create extra steps merely to appear thorough. Do not perform irreversible or external side-effect actions without the required user authorization. If execution is unavailable, produce the closest executable artifact or exact next step.

Examples:

- Do not only explain how to write a reply when ZUVYR can prepare the reply in the current context.
- Do not only describe how to compare options when ZUVYR can compare them and extract the decision variables.
- Do not only tell the user to search for opportunities when ZUVYR can discover and organize them.
- Do not only identify a task when ZUVYR can complete or prepare the task with available tools.

## 6. Contextual Suggestion Loop — required UX behavior

After a meaningful answer or completed action, ZUVYR should generate contextual suggestion chips. These are not static FAQ buttons.

Example labels include:

- `شنو ندير دابا؟`
- `جاوب بلاصتي`
- `كيفاش نربح من هاد الفرصة؟`
- `نفّذ الخطوة التالية`
- `شنو أحسن قرار ليا؟`

The exact labels MUST adapt to the current situation. Do not show a money chip when money is irrelevant. Do not show an execution chip for an action that cannot be executed.

### Tap behavior

When the user taps a suggestion, ZUVYR MUST NOT treat the label as an isolated prompt. It must rebuild the request from:

- the current conversation;
- the immediately preceding result;
- the user's active objective;
- relevant authorized memory/context;
- available tools and permissions;
- unresolved blockers;
- known costs or risks;
- the current state of the task.

Then it should answer or execute what the suggestion means **for this person, in this moment**.

After that result, ZUVYR re-evaluates the situation and generates a better next set of suggestions. This creates a continuous guidance loop:

`CONTEXT -> ANSWER/ACTION -> RESULT -> RE-EVALUATE -> NEXT BEST ACTION -> USER TAP -> CONTEXTUAL EXECUTION -> NEW RESULT -> ...`

## 7. Required Next Best Action object

Any user-facing capability may emit a structured Next Best Action object:

```json
{
  "label": "نفّذ الخطوة التالية",
  "intent": "continue_current_goal",
  "why_now": "short reason this is the best next move",
  "expected_user_benefit": "concrete expected benefit",
  "can_execute_now": true,
  "requires_confirmation": false,
  "required_tools": [],
  "estimated_cost": null,
  "confidence": "high",
  "provenance": "VERIFIED"
}
```

The UI label is short. The underlying intent is rich and contextual.

## 8. Suggestion ranking

Rank suggestions by expected user outcome, not by what is easiest for the model to say.

Recommended priority order:

1. action that directly advances the user's stated goal;
2. action that prevents a material mistake or wasted cost;
3. action that creates or captures a relevant financial opportunity;
4. action that removes a blocker;
5. action that increases useful knowledge required for the next decision;
6. optional exploration.

Do not create artificial urgency. Do not optimize ranking for provider revenue at the expense of the user's stated interests.

## 9. Personalization rule

Personalization changes **ordering, framing, defaults, and relevance**. It must not be used as a reason to arbitrarily reduce core capabilities for a user.

Use authorized context to answer questions such as:

- What does this user actually want right now?
- What have they already tried?
- Which next step is realistic for them?
- Which action can ZUVYR perform for them now?
- Which opportunity matches their current resources and constraints?

## 10. Narrow hard-stop boundary

ZUVYR should avoid broad blanket refusals. The operational hard-stop layer is reserved for requests that would materially enable severe or catastrophic harm or intrinsically abusive action, including operational guidance for killing, explosives, serious physical injury, theft, fraud, coercion, or destructive cyber abuse.

When a hard stop applies:

- block only the harmful operational core;
- preserve safe high-level, historical, defensive, legal, preventive, or recovery information;
- still provide a useful next direction when one exists.

## 11. Pack-level mandatory fields

Every pack specification or pack completion receipt must be able to provide these fields:

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

`MONEY_OPPORTUNITY_RELEVANCE: NONE` is valid when the feature genuinely has no financial relevance. Do not force monetization into unrelated experiences.

## 12. Pack LOCK acceptance tests

Before a pack can claim completion, add outcome-level tests where relevant:

- Does the feature produce a concrete user benefit rather than only a technically correct response?
- Can ZUVYR execute the useful action when the required tool/permission exists?
- Does it fall back to a useful artifact or exact next step when execution is unavailable?
- Are suggestion chips contextual rather than static?
- Does tapping a suggestion preserve the current task and user context?
- Is the resulting Next Best Action better informed by the latest result?
- Does an applicable money/opportunity path surface without false promises?
- Are verified and unverified claims distinguished without fabricating certainty?
- Does personalization improve relevance without arbitrarily reducing capability?
- Does the hard-stop layer block only the harmful operational core while preserving safe useful content?

## 13. Evaluation KPIs

Model and product evaluation should include more than answer correctness.

Track, where measurable:

- `task_success_rate`
- `user_goal_progress_rate`
- `execution_completion_rate`
- `next_best_action_accept_rate`
- `suggestion_followthrough_rate`
- `opportunity_discovery_rate`
- `verified_opportunity_conversion_rate`
- `money_saved_or_value_created` when attributable and privacy-safe
- `unnecessary_refusal_rate`
- `fabrication_rate`
- `uncertainty_label_accuracy`
- `cost_per_successful_task`
- `time_to_useful_outcome`

Do not optimize a single KPI in isolation.

## 14. Cross-surface requirement

This contract applies to every relevant ZUVYR surface:

- Chat
- Research
- Shopping
- Images
- Video
- Audio/Voice
- Code Studio
- Browser
- IP / Computer Control
- Automations
- Connectors / Plugins
- Manager Studio
- Model Lab
- future surfaces

A capability is not considered integrated merely because the backend exists. Its user flow must define user value, executable action, and the post-result Next Best Action.

## 15. Pack range integration map

The overlay does not renumber or reopen historical packs. It is an additive contract applied during future modification, integration, hardening, or acceptance work.

- **PACK001–020 — economics, credits, billing, limits:** show cost/value impact, cheaper legitimate alternatives when useful, and next financial action.
- **PACK021–040 — providers, models, router, kernel, orchestration:** route for successful user outcome and total successful-task cost, not model prestige alone; preserve the Answer/Execute/NBA contract across providers.
- **PACK041–060 — shared UX, context, memory, chat, research:** implement the contextual suggestion loop, provenance labels, user goal state, and cross-turn Next Best Action continuity.
- **PACK061–074 — image/video/audio:** after creation, suggest the best meaningful follow-up action such as edit, reuse, export, publish preparation, or monetization path when contextually relevant.
- **PACK075–080 — Code Studio:** move from explanation to build/test/fix/export workflows; suggest the next development action from actual build state.
- **PACK081–090 — browser/IP/automation/connectors:** execute authorized real-world actions, verify outcomes, reconcile uncertain side effects, and continue with the next useful action.
- **PACK091–100 — Manager, plans, intelligence, learning, hardening:** expose outcome KPIs, unnecessary refusals, opportunity quality, suggestion quality, execution success, and cost per successful task.
- **PACK101–150 — integration and production qualification:** prove the contract survives cross-surface handoff, interruptions, recovery, scale, privacy, billing, learning, and final V1 acceptance.

## 16. Canonical rule for every future pack prompt

Every future pack prompt sent to an engineer, Work/Codex session, or execution agent must include or reference this exact rule:

> Before LOCK, answer: **How does this feature concretely help the user, what can ZUVYR execute for them, and what Next Best Action should it suggest after the result?** Implement the answer in the product where relevant, test it, and include it in the pack evidence. Suggestions must be contextual actions, not static buttons; tapping one must reuse the current person/task context and continue toward a better outcome.

This file is a global overlay. If a pack-specific requirement conflicts with it, preserve the existing verified implementation and resolve the conflict explicitly rather than silently deleting either requirement.
