# ZUVYR Repository Agent Instructions

These instructions apply to the entire repository.

## Mandatory pack contract

Before planning, modifying, validating, or locking any ZUVYR pack, read:

1. `docs/zuvyr/ZUVYR_CURRENT_STATE_OVERRIDE_2026-09-23.json`
2. `docs/zuvyr/USER_OUTCOME_ENGINE.md`
3. `docs/zuvyr/PACK_EXECUTION_APPENDIX.md`
4. `docs/zuvyr/user-outcome-pack-overlay.v1.json`
5. `docs/zuvyr/CONTINUOUS_IMPROVEMENT_OVERRIDE_2026-09-23.md`
6. `docs/zuvyr/continuous-improvement-override.v1.json`
7. the canonical pack roadmap/state files relevant to the active pack.

The current-state override is a compact dated continuity source. Fresh Git/production evidence and newer explicit user instruction still outrank it. If it disagrees with older state capsules, reconcile the older capsules rather than discarding the fresh evidence.

The User Outcome Engine is a global additive overlay for PACK001–PACK150 and future packs. It does not renumber historical packs or erase previous requirements.

## Continuous-improvement rule

A previously completed or `LOCKED_VERIFIED` Pack is not immutable. If fresh evidence, a regression, a security finding, a missing commit/push/deploy/production proof, a better implementation, a new additive V1 requirement, or a new product idea materially improves an older Pack, revisit it through a named FIX/HARDENING/RECONCILIATION without renumbering it or rewriting prior evidence.

Do not redo unchanged work only for ceremony. Preserve the old receipts and verified behavior, then complete the improvement with focused tests, regressions, commit, push, deployment when runtime changed, production verification, a new dated receipt, and canonical-state reconciliation. An older-Pack improvement never authorizes skipping the legal active-Pack gate.

This continuous-improvement rule supersedes older wording that could be read as “never reopen completed Packs.” Older “do not reopen merely to attach this overlay” language remains applicable only to documentation-only ceremony, not substantive fixes or improvements.

### Truthful completion / adjacent-findings rule

Never claim `CLEAN`, `LOCKED_VERIFIED`, final, finished, complete, or all-green while any known actionable internal finding remains unresolved. The requested edit is not the completion boundary: while executing any ZUVYR task, also resolve safe actionable defects discovered in or adjacent to that task when they affect security, authorization, privacy, billing, reliability, data integrity, accessibility, performance, recovery, deployment, monitoring, state correctness, or regression risk.

Only genuinely external blockers may remain at closure, such as missing third-party credentials, account-plan restrictions, missing administrative authority, provider funding, or required human/legal approval. Each external blocker must be explicit, fresh-evidence-backed, and state the exact owner and exact action required. Never hide an external blocker behind a generic clean/final claim.

Informational findings may be intentionally accepted only when there is a documented technical reason and risk analysis showing that changing them would be cosmetic, unnecessary, or riskier than preserving them.

For every new or modified pack, before `LOCKED_VERIFIED`, the implementation and evidence must answer:

- How does this capability concretely improve the user's real-world position?
- What can ZUVYR execute for the user rather than merely explain?
- What contextual Next Best Action should ZUVYR suggest after the result?

User-facing packs must use contextual suggestion chips derived from the live conversation/task/result. A tap must restore/reuse current user and task context, execute or answer the selected intent, then re-evaluate and produce the next better suggestion set. Static generic FAQ chips do not satisfy this requirement.

When contextually relevant, scan for legitimate ways to help the user earn money, save money, find opportunities, negotiate, sell, build, automate, or otherwise improve their economic position. Do not force monetization where irrelevant and do not promise income.

Useful information may be surfaced without formal documentation when appropriate, but uncertainty/provenance must be represented and facts must not be fabricated. Use the provenance states defined in the canonical contract.

Preserve existing verified behavior. Apply only narrow operational hard stops for materially enabling severe harm or intrinsically abusive actions, while preserving safe useful portions of mixed requests.

Run `node tools/validate-user-outcome-pack-overlay.cjs` whenever the overlay files are changed.
