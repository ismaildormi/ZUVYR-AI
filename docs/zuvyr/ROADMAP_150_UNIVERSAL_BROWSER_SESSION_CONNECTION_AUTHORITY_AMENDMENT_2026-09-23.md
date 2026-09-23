# ZUVYR V1 — Universal Browser Session + Connection Authority Amendment

Date: 2026-09-23  
Status: CANONICAL ADDITIVE V1 PLAN  
Base roadmap: `docs/zuvyr/ROADMAP_150.md`  
Semantics: **UNION_NOT_REPLACEMENT**. This amendment does not renumber Packs, does not reopen a completed Pack, and does not change the current PACK089/PACK090 gate.

## Why this amendment exists

ZUVYR already planned a Universal Cloud Browser across Chat, Research, Shopping/Local, Images/Video where web input is needed, Code Studio, Documents/Spreadsheets/Presentations, Projects/Library, ZUVYR IP, Automations and Manager/Operator surfaces. Current source evidence still shows a gap between that plan and a Work-like universal browser runtime: Browserbase is registered as `registry_blocked_unverified`, while no universal browser-session executor is proven live across every eligible chat surface.

The V1 target is therefore not “a browser page”. It is a **shared execution capability** that any eligible ZUVYR conversation or agent can invoke through one canonical task/session/permission contract.

## External reference pattern researched on 2026-09-23

The design intentionally borrows the useful architecture pattern, not proprietary implementation details, from current browser-agent systems:

- a separate cloud browser session that can click, type, navigate and continue after the local client closes;
- connected apps/plugins and browser automation are complementary, not mutually exclusive;
- authenticated browser state may persist between sessions but must be treated like a credential;
- secure user takeover is available for sign-in, password, passkey, CAPTCHA or 2FA boundaries;
- website-access permission is distinct from approval for high-consequence actions;
- an optional cloud browser provider may persist contexts/cookies, while a self-hosted Playwright-compatible runtime remains possible.

## Product goal

From any eligible ZUVYR chat/surface, the user can ask for a result that requires the web. ZUVYR can:

1. use a connected API/plugin/MCP first when it can complete the task reliably;
2. open or resume an isolated Browser Session when UI navigation is required;
3. combine connector actions and browser actions in one durable task;
4. use the paired local device/browser as a fallback when a site blocks cloud automation or needs local/passkey interaction;
5. keep progress, screenshots/evidence, STOP, takeover, downloads/uploads, audit and task state visible in the originating chat.

## Connection-first authority model

### App connection flow

When a user connects an app, ZUVYR presents the exact permissions the provider supports and offers:

- **Maximum Authorized Access** — request the broadest provider-supported scopes needed for the user-selected product surfaces;
- **Custom Access** — let the user reduce scopes;
- **Read-only** — when supported.

“Maximum Authorized Access” never means bypassing provider policy, OAuth scope limits, organization policy, device security, 2FA, legal restrictions or ZUVYR hard safety gates. It means **the maximum authority the user explicitly grants and the provider legitimately issues**.

The user may additionally enable **Auto-complete consent screens for this connection**. When the exact app/domain/scopes match the user-approved connection intent, ZUVYR may click the provider’s consent/Allow UI without asking again. Password, passkey, CAPTCHA and 2FA entry remain a secure user-takeover boundary unless the provider exposes a supported delegated mechanism.

### Action authority modes

Each app/site can have one of four user-selected modes:

1. `ASK_EVERY_TIME`
2. `AUTO_LOW_RISK`
3. `FULL_TASK_ACCESS` — broad authority for the current mission/task only
4. `ALWAYS_ALLOW_APP` — broad reusable authority for that exact app/site within the granted provider/browser scope

Even with `FULL_TASK_ACCESS` or `ALWAYS_ALLOW_APP`, ZUVYR still pauses for actions that are materially difficult to reverse or create a financial, legal, account-security, destructive, publication or other high-consequence commitment unless a narrower pre-authorized policy explicitly covers that exact consequence.

## Canonical architecture

### 1. Universal Browser Broker

One server-side contract decides the execution path:

`Connector/API -> Plugin/MCP -> Cloud Browser -> Local Device Browser -> user takeover`

The Brain/Router chooses the cheapest reliable authorized path. Browser automation is not used when a direct connector is safer, cheaper and semantically complete.

### 2. Browser Runtime Provider abstraction

Canonical interface:

- create/resume/close session;
- navigate/read/screenshot;
- click/type/select/upload/download;
- tabs/popups;
- wait/observe;
- cookies/storage context import/export through encrypted secret references only;
- live-view/takeover;
- heartbeat/reconnect;
- cancellation/STOP;
- bounded step/time/resource budget.

Providers:

- **Primary low-cost path:** ZUVYR-controlled/self-hosted Playwright/Chromium worker on owned/BYOC compute.
- **Optional managed fallback:** Browserbase or another verified provider only after pricing, terms, credential and live E2E gates pass.
- **Local fallback:** ZUVYR Device Agent controls the user-authorized local browser when cloud execution is blocked or local authentication is required.

No provider-specific session ID becomes the product identity; it is stored behind a canonical ZUVYR Browser Session record.

### 3. Canonical Browser Session

A browser session is owner-scoped and task-linked. Minimum fields/semantics:

- `browser_session_id`
- `owner_id`
- organization/project/conversation/task references
- provider/runtime identity
- encrypted auth-state secret reference
- allowed domains / blocked destinations
- connection/app identity and granted scopes
- permission mode
- mission digest
- status, heartbeat, TTL and idle expiry
- current URL/title/tab metadata
- takeover/live-view state
- download/upload quarantine state
- action sequence and consequence receipts
- last checkpoint/resume cursor
- cost/compute usage
- created/updated/revoked timestamps

Cookies, bearer tokens, passwords, raw OAuth refresh/access tokens and reusable auth storage must never be written to Git, model prompts, normal logs or plaintext application tables.

### 4. Persistent Browser Profile

Users may persist an authenticated profile per app/domain. The profile is encrypted and revocable independently from chat history. It can contain provider-allowed browser storage needed to resume sign-in. Clearing/revoking it immediately blocks reuse.

### 5. Secure takeover

The user can take control of the exact remote browser session to:

- sign in;
- enter password/passkey/2FA;
- resolve CAPTCHA;
- inspect a sensitive page;
- correct the agent.

During secure credential entry, the model does not receive the secret value. After takeover ends, the agent resumes from the resulting browser state.

### 6. Universal chat binding

Browser capability is injected into every eligible surface through the same `browser_session_ref` / task authority:

- Chat
- Research / Deep Research / Shopping / Local
- Images and Video when web assets/input are required
- Code Studio
- Documents / Spreadsheets / Presentations
- Projects / Library
- ZUVYR IP
- Automations
- Manager / Operator
- Web, Windows, Android and iOS clients

No surface gets a separate browser implementation.

### 7. Evidence and user control

The originating chat shows:

- current step and domain;
- important screenshots/evidence;
- connected app/session being used;
- current authority mode;
- pause/takeover;
- global STOP;
- cancel;
- retry/recover state;
- action receipts and final result.

A task may continue server-side after the client disconnects when the user’s policy allows it.

### 8. Download/upload bridge

Browser downloads/uploads pass through canonical Library/Project ownership and quarantine controls before another tool can trust them. Browser-authenticated content does not bypass MIME/content/size/malware/active-content/path checks.

### 9. Security boundaries

Required before V1 release:

- prompt-injection isolation: page/plugin/file text is data, never authority;
- target/domain/redirect verification;
- SSRF/DNS-rebinding/internal-metadata deny rules;
- secret/redaction policy;
- tenant/session isolation;
- changed scope/app/tool version invalidates stale approval;
- bounded steps, wall time, tabs, downloads, bandwidth and compute;
- action idempotency and uncertain-outcome reconciliation;
- immediate revoke/STOP propagation;
- no cross-user browser profile reuse.

## Cost strategy

Goal: **minimum cost per successful browser task**, not a false claim of literal zero infrastructure cost.

Order:

1. connected API/plugin/MCP when free/cheaper and complete;
2. self-hosted/BYOC Playwright runtime;
3. paired local-device browser;
4. truthfully eligible free quota/credits;
5. managed cloud-browser provider only when it wins reliability/cost or is required.

Every managed-browser cost must enter the canonical cost registry before paid execution. Browser session idle time must auto-suspend/expire.

## Additive routing into the existing 150 Packs

The original Pack scope remains mandatory. These are extra acceptance responsibilities.

### PACK090 — Agent Checkpoint I
- Run a fresh universal-browser gap audit against PACK081/082 output.
- Prove one canonical Browser Session contract can be invoked from eligible Chat plus at least Research and one additional surface.
- Add the Browser Broker and provider abstraction if runtime evidence shows they are missing.
- Prove connector-first routing, browser fallback, progress, STOP and owner scoping.
- Do not mark PACK090 complete on registry/config presence alone.

### PACK101 — Cross-surface resumable tasks
- Persist `browser_session_ref`, task cursor and browser checkpoint across surfaces and client reconnect.
- Resume the same authorized task without replaying already completed external actions.

### PACK118 — Preview isolation adversarial proof
- Extend isolation/SSRF/origin/egress testing to browser-worker and live-view/takeover transport where applicable.
- Prove one tenant/session cannot reach another session’s state or internal infrastructure.

### PACK121 — Browser session recovery
- Implement encrypted persistent profile/context restore, heartbeat, idle expiry, worker-loss recovery and bounded reconnect.
- Prove sensitive sessions expire safely and authorized resumable sessions continue without duplicate actions.

### PACK122 — Agent consequence reconciliation
- Every consequential browser action gets an external action receipt.
- Unknown/timeout outcomes are reconciled before retry; no duplicate submit/purchase/publish/delete.

### PACK125 — Connector token lifecycle
- Unify browser profiles and connector OAuth lifecycle: refresh, reconnect, revoke and logout/clear-browser-state propagation.
- Revoking an app connection must prevent future connector calls and associated browser-profile reuse when policy requires it.

### PACK126 — Skill and plugin version governance
- Pin browser-capable skills/plugins/connectors to version + declared permissions.
- Scope or manifest changes invalidate stale approvals/session grants.

### PACK127 — Agent platform checkpoint
- End-to-end proof of connector -> browser -> local-device fallback, recovery, secure takeover, STOP and consequence receipts.
- Include one signed-in app workflow and one cloud-automation-blocked/local-fallback workflow when a legitimate test target is available.

### PACK139 — Security abuse and tenant isolation
- Complete prompt-injection, phishing/lookalike, redirect, SSRF, secret-exfiltration, cross-tenant, malicious-download and scope-escalation tests for browser/connection authority.

### PACK142 — Capacity and load qualification
- Browser worker admission control, concurrency, per-session CPU/RAM/time budgets, queues, auto-suspend, cleanup and provider fallback.
- Load test must include abandoned/background sessions and recovery.

### PACK144 — Client release qualification
- Same browser task/progress/takeover/STOP semantics across web, Windows, Android and iOS.
- A client may hand off control without creating a second browser task/action.

### PACK145 — Cross-version compatibility
- Version Browser Session schema, action protocol, browser worker, client takeover protocol and connector/browser authority contracts.
- Rolling upgrade must not silently widen authority or corrupt resumable sessions.

### PACK148 — Full V1 acceptance rehearsal
- Rehearse Universal Browser from all eligible canonical surfaces.
- Include background continuation, signed-in session, download/upload quarantine, takeover, STOP, revoke, recovery and local fallback.

### PACK149 — External launch gate reconciliation
- Verify provider terms/pricing, browser automation policies, OAuth redirect/scope configuration, connection claims, privacy/retention and any managed-browser/BYOC external dependencies.

### PACK150 — V1 final release and recovery gate
- Seal exact browser worker/runtime versions, provider adapters, session schema, permission policies, domain policy, encrypted profile mechanism, client protocol, STOP/recovery targets and UBA acceptance matrix.
- `V1_READY=true` is forbidden if an applicable Universal Browser requirement below is not PASS or true `N/A_WITH_EVIDENCE`.

## Universal Browser Acceptance Matrix

- **UBA-01** Shared Browser Broker
- **UBA-02** Universal chat/surface binding
- **UBA-03** Canonical owner-scoped Browser Session
- **UBA-04** Isolated browser contexts
- **UBA-05** Encrypted persistent authenticated profiles
- **UBA-06** Connector/API-first execution routing
- **UBA-07** Self-hosted/BYOC low-cost browser runtime
- **UBA-08** Optional managed-provider fallback
- **UBA-09** Local Device Browser fallback
- **UBA-10** Maximum Authorized Access connection mode
- **UBA-11** Custom/read-only connection modes
- **UBA-12** Full-task / always-allow app authority policy
- **UBA-13** Secure takeover for credentials/2FA/CAPTCHA
- **UBA-14** Consent-screen auto-completion only within exact pre-authorized app/domain/scopes
- **UBA-15** Progress/screenshots/evidence in originating chat
- **UBA-16** Global STOP/cancel/revoke propagation
- **UBA-17** Background continuation and resumable cursor
- **UBA-18** Exactly-once consequence receipts/reconciliation
- **UBA-19** Download/upload quarantine + Library/Project bridge
- **UBA-20** Prompt-injection/phishing/redirect/egress defenses
- **UBA-21** Tenant/session isolation and secret hygiene
- **UBA-22** Dynamic runtime budgets / idle suspend / cost truth
- **UBA-23** Cross-client takeover/handoff compatibility
- **UBA-24** Final all-surface production E2E + recovery proof

## Final acceptance

The amendment is satisfied only when:

```text
ORIGINAL_PACK_SCOPES_PRESERVED
AND APPLICABLE_EA_001_292_ALL_PASS_OR_TRUE_NA_WITH_EVIDENCE
AND UBA_01_24_ALL_PASS_OR_TRUE_NA_WITH_EVIDENCE
AND PACK090_UNIVERSAL_BROWSER_CHECKPOINT_PASS
AND PACK127_AGENT_BROWSER_CONNECTION_CHECKPOINT_PASS
AND PACK148_ALL_SURFACE_REHEARSAL_PASS
AND PACK149_EXTERNAL_RIGHTS_TERMS_PRIVACY_PASS
AND PACK150_EXACT_BROWSER_RELEASE_RECOVERY_SEAL_PASS
```

No configuration entry, button, mock browser, provider registration or planning document is sufficient by itself.
