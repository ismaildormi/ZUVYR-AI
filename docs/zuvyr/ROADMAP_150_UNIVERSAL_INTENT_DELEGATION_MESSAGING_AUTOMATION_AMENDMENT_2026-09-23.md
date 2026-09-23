# ZUVYR V1 — Universal Intent Delegation + Messaging/App Automation Amendment

Date: 2026-09-23  
Status: CANONICAL ADDITIVE V1 PLAN  
Base roadmap: `docs/zuvyr/ROADMAP_150.md`  
Semantics: **UNION_NOT_REPLACEMENT**. This amendment does not renumber Packs, does not reopen completed Packs, and does not change the current PACK089/PACK090 gate.

## Product principle

ZUVYR V1 must not treat app/browser automation as a sequence of isolated clicks that repeatedly asks the user what to do. Once the user has connected an app/site and granted a bounded authority policy, ZUVYR should carry the user's **intent** across the entire task and act inside that authority until the desired outcome is reached.

The canonical mental model is:

`User intent -> conversation context -> standing app/site policy -> plan -> actions -> observe -> adapt -> reply/continue -> verify -> durable receipt`

Examples:

- In Chat, the user says “connect Google Drive and use it whenever needed for this project”; ZUVYR may use the granted Drive capabilities later without asking again for each low-risk read/export action.
- In a connected WhatsApp/business-messaging account, the user may configure “answer customer questions using this conversation/project knowledge and my response policy”; ZUVYR receives authorized inbound events, reads only permitted context, composes the reply, sends it, records the result and escalates only when policy says to do so.
- On a website, the user may say “finish this setup”; ZUVYR can navigate, click, type, choose options, upload/download and continue through ordinary reversible steps covered by the task authority, rather than asking approval for every button.
- The same intent may hand off between connector/API, plugin/MCP, cloud browser and paired local device without losing task state.

## Authority is broader than OAuth consent

`ALWAYS_ALLOW_APP` and `FULL_TASK_ACCESS` are **execution authority modes**, not merely permission to press an OAuth Allow button.

Within the provider-supported scopes and the user's explicit policy, they may authorize ZUVYR to:

- read authorized app/site state;
- receive authorized events/webhooks;
- draft and send messages/replies;
- click, type, select, navigate and submit ordinary workflow steps;
- upload/download files through canonical ownership/quarantine controls;
- create/update records where the granted connector scope allows it;
- continue in the background;
- use project/chat memory and user-authored business rules as decision context;
- recover after disconnect/worker restart without duplicating completed external actions.

No authority mode may fabricate permissions the provider did not issue, bypass authentication, bypass organization policy, defeat 2FA/CAPTCHA, or override ZUVYR consequence/safety policy.

## Universal Conversation Agent

Every eligible connected messaging surface must normalize into one canonical conversation/event contract rather than receiving a one-off implementation.

Canonical inbound event fields/semantics include:

- owner / organization / connection identity;
- external app + account/channel identity;
- external conversation/thread/contact identity;
- message/event ID and timestamp;
- sender/recipient roles;
- text/media/attachment references;
- reply/thread relationship;
- delivery/read/status events where supported;
- permission/scopes and standing policy reference;
- dedupe/idempotency key;
- allowed project/memory/knowledge context;
- escalation state;
- retention/training-rights policy.

Canonical outbound action semantics include:

- draft-only, send-now or policy-auto-send;
- text/media/document reply;
- quoted/threaded reply where supported;
- template/message-type selection where the provider requires it;
- exactly-once send receipt;
- delivery/failure reconciliation;
- STOP/pause/revoke propagation.

## WhatsApp reference implementation

WhatsApp Business/Cloud API should be one V1 reference connector when legitimate account/provider access is available; it is not a special architecture fork.

The connector must use provider-supported APIs/webhooks where available, with browser automation only for setup/admin flows that do not have a suitable API and are permitted by provider policy.

The user may configure, for example:

- `DRAFT_ONLY`
- `AUTO_REPLY_LOW_RISK`
- `AUTO_REPLY_WITHIN_POLICY`
- `HUMAN_ESCALATE_ON_UNCERTAINTY`
- allowed hours / languages / contacts / labels / topics;
- project/knowledge source to use;
- response tone and business rules;
- forbidden claims/actions;
- escalation contacts and thresholds.

Inbound WhatsApp events must be deduplicated and tied to an external-conversation cursor. ZUVYR may answer from authorized conversation/project context according to the user's policy; it must not treat a message from an external contact as new authority to widen permissions or reveal private data.

Provider-specific messaging windows, template requirements, rate limits, account quality rules, user opt-outs and other current platform restrictions remain authoritative and must be verified in PACK149 before launch. The implementation must adapt to those rules rather than hard-code an assumed permanent policy.

## Intent policy object

Every reusable app/site delegation uses a versioned `intent_authority_policy` containing at minimum:

- owner/org;
- app/site/connection identity;
- purpose/mission description;
- allowed action classes;
- allowed data/context sources;
- allowed recipients/destinations;
- send/publish/write/delete/payment/account-change permissions;
- auto-run vs draft-only behavior;
- escalation conditions;
- monetary/time/step/rate budgets;
- allowed schedule/background execution;
- expiry / review date;
- model/tool minimum-quality requirements where relevant;
- STOP/revoke behavior;
- audit/retention requirements;
- policy version/hash.

Changed app scopes, destination, tool version, recipient class or materially changed mission invalidates stale authority when required by policy.

## Consequence tiers

ZUVYR must distinguish ordinary authorized execution from materially consequential commitments.

- **Tier A — reversible/low-risk:** read, navigate, search, ordinary typing, draft, low-risk reply inside standing messaging policy. May auto-execute under `AUTO_LOW_RISK`, `FULL_TASK_ACCESS` or `ALWAYS_ALLOW_APP`.
- **Tier B — meaningful but bounded:** send/publish/update/create where the user's standing policy explicitly authorizes that exact class and destination. May auto-execute only when pre-authorized and receipt/recovery are available.
- **Tier C — high consequence:** payments/purchases, destructive deletion, security/credential changes, sensitive disclosures, legal/financial commitments, major public publishing, account ownership/admin changes or similarly difficult-to-reverse actions. Require the applicable stronger consequence policy/confirmation even if the app is otherwise always allowed, unless a narrowly defined pre-authorized rule explicitly and safely covers the exact action.

The goal is **minimal unnecessary interruption**, not removal of all consequence boundaries.

## Cross-surface behavior

The same delegation must work from all eligible ZUVYR surfaces:

- Chat;
- Research / Deep Research / Shopping / Local;
- Images / Video when external apps/sites are needed;
- Code Studio;
- Documents / Spreadsheets / Presentations;
- Projects / Library;
- ZUVYR IP / device control;
- Automations;
- Manager / Operator;
- web, Windows, Android and iOS clients.

A task created in one surface may continue through another without creating a second external action or forgetting the user's intent.

## Additive routing into the existing 150 Packs

### PACK090 — Agent Checkpoint I
- Add a **Universal Intent Delegation gap audit** to the existing Browser/Automation/Connection checkpoint.
- Prove that a chat-issued mission can invoke an authorized connector/browser action without per-click approval and still respect STOP/revoke/consequence policy.
- Establish the canonical `intent_authority_policy` contract if missing.

### PACK101 — Cross-surface resumable tasks
- Persist intent, authority-policy version, external conversation/task cursor and action receipts across reconnect and cross-surface handoff.
- Resume without repeating messages or external actions.

### PACK122 — Agent consequence reconciliation
- Apply consequence tiers to browser, connector, messaging and device actions.
- Reconcile uncertain send/submit outcomes before retry.

### PACK124 — Automation schedule semantics
- Support standing message/app automations, quiet hours, allowed hours, missed-trigger policy and duplicate-event suppression.
- Background reply/action policy must use the same versioned intent authority.

### PACK125 — Connector token lifecycle
- Connection lifecycle must preserve or invalidate standing app authority correctly on refresh, reconnect, revoke, account switch and scope change.
- Messaging connectors must stop sending immediately when connection authority is revoked.

### PACK126 — Skill and plugin version governance
- Pin the connector/tool schema used by an intent policy.
- Material action/schema/scope changes cannot silently inherit old broad approval.

### PACK127 — Agent platform checkpoint
- Prove at least one event-driven messaging/app workflow end-to-end when legitimate provider access exists: inbound event -> context -> policy -> plan -> reply/action -> receipt -> status/recovery.
- Prove one browser-driven ordinary multi-step task can complete without per-click approval under a valid standing authority.

### PACK134 — Evaluation/quality responsibilities
- Add policy-following, recipient/destination correctness, reply relevance, hallucination/uncertainty, escalation and conversation-continuity evals for delegated messaging/actions.

### PACK139 — Security abuse and tenant isolation
- Test malicious inbound messages, prompt injection, impersonation, recipient confusion, context exfiltration, unauthorized send, replay and cross-tenant leakage.
- External message content is untrusted data, never authority.

### PACK142 — Capacity and load qualification
- Load-test webhook/event bursts, message queues, dedupe, outbound rate controls, reconnect, provider outage and backpressure.

### PACK144 — Client release qualification
- Show the same delegation state, pause/STOP, pending approvals, conversation/action receipts and handoff behavior across clients.

### PACK145 — Cross-version compatibility
- Version intent-policy schema, event envelope, messaging adapter contract and action-receipt contract.

### PACK148 — Full V1 acceptance rehearsal
- Rehearse delegated actions from all canonical eligible surfaces.
- Include one event-driven messaging conversation, one multi-step website task, background continuation, STOP/revoke, uncertain-outcome recovery and cross-client handoff.

### PACK149 — External launch gate reconciliation
- Verify current provider terms, automation/messaging rules, OAuth/scopes, webhook requirements, template/message restrictions, rate limits, opt-out rules, privacy/retention and account prerequisites for every launch connector including WhatsApp if advertised.

### PACK150 — V1 final release and recovery gate
- Seal the exact intent-policy schema, connector/message adapters, browser authority, event/dedupe contracts, consequence policy, STOP/revoke behavior and acceptance matrix.
- `V1_READY=true` is forbidden if an applicable Universal Intent Delegation requirement remains partial, mock-only or unverified.

## Universal Intent Delegation Acceptance Matrix

- **UIA-01** User intent persists as a durable mission across app/browser actions
- **UIA-02** `ALWAYS_ALLOW_APP` is execution authority, not only OAuth-consent authority
- **UIA-03** Versioned owner-scoped `intent_authority_policy`
- **UIA-04** Universal inbound event/webhook envelope
- **UIA-05** Universal outbound action/message envelope
- **UIA-06** Conversation/project/memory context binding with permission boundaries
- **UIA-07** Draft-only / low-risk-auto / policy-auto / escalation modes
- **UIA-08** Event/message dedupe and exactly-once external action receipts
- **UIA-09** Ordinary multi-step browser completion without per-click prompts
- **UIA-10** Connector/API-first, browser/device fallback without intent loss
- **UIA-11** Background execution, schedules and quiet-hour policy
- **UIA-12** Immediate STOP/pause/revoke propagation
- **UIA-13** Recipient/destination and account identity verification
- **UIA-14** Malicious inbound content cannot widen authority or exfiltrate context
- **UIA-15** Consequence-tier enforcement with minimal unnecessary interruption
- **UIA-16** WhatsApp/business-messaging reference workflow when legitimately connectable
- **UIA-17** Provider-rule adaptive messaging/templates/rate/opt-out handling
- **UIA-18** Cross-surface and cross-client task/conversation handoff
- **UIA-19** Eval coverage for relevance, policy following, uncertainty and escalation
- **UIA-20** Final production E2E + recovery proof across messaging + website/app action paths

## Final acceptance

```text
ORIGINAL_PACK_SCOPES_PRESERVED
AND APPLICABLE_EA_001_292_ALL_PASS_OR_TRUE_NA_WITH_EVIDENCE
AND APPLICABLE_UBA_REQUIREMENTS_ALL_PASS_OR_TRUE_NA_WITH_EVIDENCE
AND UIA_01_20_ALL_PASS_OR_TRUE_NA_WITH_EVIDENCE
AND PACK090_INTENT_DELEGATION_CHECKPOINT_PASS
AND PACK127_EVENT_DRIVEN_MESSAGING_AND_BROWSER_ACTION_PROOF_PASS
AND PACK148_DELEGATED_ACTION_REHEARSAL_PASS
AND PACK149_PROVIDER_RULES_RIGHTS_PRIVACY_PASS
AND PACK150_EXACT_INTENT_ACTION_RELEASE_RECOVERY_SEAL_PASS
```

A button, connector registry entry, demo reply, mock webhook or planning document alone is never completion.
