# ZUVYR Repository Agent Instructions

These instructions apply to the entire repository.

## Mandatory pack contract

Before planning, modifying, validating, or locking any ZUVYR pack, read:

1. `docs/zuvyr/USER_OUTCOME_ENGINE.md`
2. `docs/zuvyr/PACK_EXECUTION_APPENDIX.md`
3. `docs/zuvyr/user-outcome-pack-overlay.v1.json`
4. the canonical pack roadmap/state files relevant to the active pack.

The User Outcome Engine is a global additive overlay for PACK001–PACK150 and future packs. It does not renumber historical packs, erase previous requirements, or by itself reopen a verified pack.

For every new or modified pack, before `LOCKED_VERIFIED`, the implementation and evidence must answer:

- How does this capability concretely improve the user's real-world position?
- What can ZUVYR execute for the user rather than merely explain?
- What contextual Next Best Action should ZUVYR suggest after the result?

User-facing packs must use contextual suggestion chips derived from the live conversation/task/result. A tap must restore/reuse current user and task context, execute or answer the selected intent, then re-evaluate and produce the next better suggestion set. Static generic FAQ chips do not satisfy this requirement.

When contextually relevant, scan for legitimate ways to help the user earn money, save money, find opportunities, negotiate, sell, build, automate, or otherwise improve their economic position. Do not force monetization where irrelevant and do not promise income.

Useful information may be surfaced without formal documentation when appropriate, but uncertainty/provenance must be represented and facts must not be fabricated. Use the provenance states defined in the canonical contract.

Preserve existing verified behavior. Apply only narrow operational hard stops for materially enabling severe harm or intrinsically abusive actions, while preserving safe useful portions of mixed requests.

Run `node tools/validate-user-outcome-pack-overlay.cjs` whenever the overlay files are changed.
