# System Register

This register deliberately separates distinct system identities. It must be populated from all available source materials; names below are initial required search targets, not a claim that the inventory is exhaustive.

| Canonical name | Known aliases/context | Current evidence source | Status | Required next action |
|---|---|---|---|---|
| ZUVYR | Formerly Rox AI; consumer AI platform/V1 | `README.md`, `docs/zuvyr/ROADMAP_150.md` | PARTIAL — repository scope documented; whole-system audit pending | Reconcile all packs, EA items, code, receipts, production evidence |
| ZEBRA V2 | Distinct system/workstream named in project handoff context | Uploaded/source dossiers and continuity files (inventory pending) | UNVERIFIED | Locate canonical specification, repositories, identifiers, status receipts |
| SYSTEM X | Master architecture/dossier and orchestration/system-of-systems context | Existing SYSTEM_X PDFs/Markdown bundles (inventory pending) | UNVERIFIED | Reconcile canonical documents, system boundaries, agents/tools, EA/PACK mappings |
| Additional systems | Any other named product, runtime, agent platform, or project found in source bundle | Pending exhaustive source inventory | UNVERIFIED | Add one row per distinct system; never silently fold into the three rows above |

## Required fields for every additional row

Canonical name; exact aliases; purpose; non-goals; owning repository; canonical documents; system boundary; connected systems; agents/tools/APIs/models; data stores; auth/permissions; deployments; PACK/EA mapping; current status; evidence commit/ref/environment/date; unresolved contradictions; next action.

## Naming and identity policy

- Preserve the exact spelling and historical name as found in source material.
- Keep Rox AI as a historical alias of ZUVYR where relevant; do not rewrite old evidence as if it originally said ZUVYR.
- Do not treat ZEBRA V2, SYSTEM X, and ZUVYR as synonyms unless a source explicitly defines that relationship.
- Shared components should be listed as shared dependencies, with ownership and access boundaries.
