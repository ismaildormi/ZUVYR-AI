# ZUVYR Native Level 3 — verification rerun

Date: 2026-09-24

This owner-authored change triggers the normal Visual QA workflow after the self-cleaning fix commit `6054cd061e7725681b9e8705de3f460275e210ca`.

That fix was based on the first native-shell artifact and addressed only verified findings:

- Chat workspace visibility is now tied to the active Chat surface so it cannot remain overlaid on Images or another feature;
- History view buttons now expose proper tab semantics for their existing `aria-selected` state;
- Settings navigation now exposes matching tablist/tab semantics;
- Home AI Chat card heading semantics no longer skip a level;
- the native QA fixture distinguishes synthetic blocked external resources from local application network failures instead of counting resource noise as product console failures.

No provider call, customer data mutation, billing action, or production-changing acceptance action is performed by this file. RW-016 remains open until the rerun artifact and screenshots are inspected.