# PACK088 — Automations & Durable Workflows — Execution Plan

Date: 2026-09-21  
Canonical predecessor: PACK087 `LOCKED_VERIFIED`  
Planning status: `PLANNING`  
Implementation status: `NOT_STARTED`

## 1. Objective

Turn the existing ZUVYR durable task kernel into a production automation system that can run one-time and recurring work at the intended time, in the intended timezone, with durable recovery, exactly-once occurrence identity, run-time funding, permission revalidation, pause/cancel, history, and in-app notifications.

PACK088 must build on the verified foundations from PACK013/017/037/038/039/047/050/087. It must not replace the Brain/Kernel, create a second billing ledger, or duplicate the task persistence already verified.

## 2. Verified foundations to reuse

The following are treated as dependencies and are not re-verified as PACK088 work unless a PACK088 change touches them:

- Unified usage ledger and reservation/settlement/refund path.
- Five-hour / weekly capacity protection contract.
- `zuvyr_task_runs` and `zuvyr_task_steps` as durable Postgres task source of truth.
- Stable task idempotency and BullMQ job identity.
- Worker leases, lease expiry reclaim, checkpoints and resume_count.
- Retry, timeout and stale-worker rejection.
- Pack039 cancel / compensation / rollback semantics.
- Pack047 Permission Center: default deny, owner/resource scope, allow-once, replay denial, revoke/expiry.
- Pack050 unified shell / responsive / RTL navigation foundation.
- Pack087 mission-bound Full Computer Control, STOP, Undo, screen/pointer/keyboard/app/clipboard/files/shell execution.

## 3. Current production truth

### Existing durable execution

- Postgres task source of truth: `zuvyr_task_runs`, `zuvyr_task_steps`.
- Brain Kernel runtime: `backend/lib/brainKernelRuntime.js`.
- Durable task persistence: `backend/lib/durableTaskPersistence.js`.
- Durable task queue: `backend/lib/durableTaskQueue.js`.
- Worker processor: `backend/lib/brainKernelWorker.js`.
- Redis/BullMQ production queue already exists.
- Per-run quote, consent and usage reservation already happen inside `brainKernelRuntime.start()`.
- Task settlement/refund already uses the unified usage path.

### Existing automation foundations

Production already contains:

- `workspace_workflows`
- `workspace_workflow_steps`
- `workspace_schedules`
- `zuvyr_notifications`

All have RLS enabled.

The existing workspace automation foundation is intentionally disabled:

- `workspace_workflows.execution_enabled = false`
- `workspace_workflow_steps.execution_enabled = false`
- `workspace_schedules.execution_enabled = false`
- schedule states are currently limited to `draft | paused | cancelled`
- there is no durable occurrence/run ledger
- there is no `next_run_at` / `last_run_at` execution lifecycle
- there is no runtime schedule dispatcher
- there is no exactly-once schedule occurrence identity
- the Scheduled Tasks UI is currently marked safety-blocked

Therefore PACK088 is an additive activation/hardening pack, not a greenfield automation system.

## 4. Canonical architecture

### 4.1 Source-of-truth rule

Postgres remains authoritative for:

- schedule definition
- workflow revision
- next due occurrence
- occurrence identity
- run state
- task_run linkage
- funding state
- notification state
- pause/cancel/revoke state

Redis/BullMQ is delivery infrastructure only. A Redis retry or worker restart must never create a second logical occurrence.

### 4.2 Schedule -> occurrence -> task chain

Canonical chain:

`workspace_schedule`
-> `workspace_schedule_run`
-> `brainKernelRuntime.start()`
-> `zuvyr_task_run`
-> `zuvyr_task_steps`
-> verify/settle/refund
-> notification

Every scheduled occurrence gets one stable occurrence identity.

Recommended stable keys:

- occurrence key: `<schedule_id>:<scheduled_for_utc>`
- schedule run idempotency key: hash of schedule id + workflow revision + scheduled occurrence
- BullMQ automation dispatch job id: `pack088:<schedule_run_id>`
- Brain Kernel idempotency input: `schedule:<schedule_id>:<occurrence_key>`

Duplicate scheduler scans, queue retries, server restarts and worker restarts must resolve to the same occurrence and the same task identity.

### 4.3 New production table

Add `workspace_schedule_runs` as the durable occurrence ledger.

Minimum fields:

- `id uuid primary key`
- `owner_id uuid`
- `schedule_id uuid`
- `workflow_id uuid`
- `workflow_revision integer`
- `occurrence_key text`
- `scheduled_for timestamptz`
- `state text`
- `claim_token uuid nullable`
- `claimed_at timestamptz nullable`
- `queued_at timestamptz nullable`
- `task_run_id uuid nullable`
- `usage_record_id bigint nullable`
- `funding_state text`
- `attempt_count integer`
- `error_code text nullable`
- `notification_id uuid nullable`
- `created_at / updated_at / completed_at`

Required uniqueness:

- unique `(schedule_id, occurrence_key)`
- at most one bound `task_run_id`
- stable owner/schedule/workflow relationship

### 4.4 Additive changes to workspace_schedules

Extend the existing table rather than replace it.

Add or evolve:

- state: `draft | active | paused | blocked | completed | cancelled`
- `next_run_at timestamptz`
- `last_run_at timestamptz`
- `last_success_at timestamptz`
- `last_failure_at timestamptz`
- `last_error_code text`
- `workflow_revision integer`
- recurrence representation
- `misfire_policy`
- `max_credits_per_run`
- `allow_topup boolean default false`
- notification policy
- explicit automation authorization digest
- authorization expiry/revocation state where required

The old hard check forcing `execution_enabled=false` must be replaced by a controlled activation contract, not simply removed.

### 4.5 Recurrence and timezone

V1 requirements:

- one-time schedule
- recurring schedule
- IANA timezone
- DST-safe next occurrence calculation

Canonical storage should preserve:

- original timezone
- normalized recurrence rule/spec
- UTC `next_run_at`

The scheduler must calculate the next occurrence from the timezone-aware recurrence definition, not by repeatedly adding 24 hours to UTC for daily/weekly local-time schedules.

Minimum recurring support for PACK088:

- hourly interval
- daily at local time
- weekly on selected weekdays/local time

Monthly/advanced RFC5545 forms may remain blocked unless implemented and tested truthfully.

### 4.6 Misfire policy

Default: `run_once`.

If the scheduler is unavailable across multiple intended occurrences:

- `run_once`: execute one recovery occurrence, then move to the next future occurrence
- `skip`: skip missed occurrences and continue from the next future occurrence

Do not silently replay an unbounded backlog.

### 4.7 Funding at run time

Creating/editing a schedule must not reserve credits.

At each actual occurrence:

1. load current workflow revision and automation authorization
2. revalidate permissions
3. build the current Brain/Kernel request
4. call Brain Kernel preview using current pricing
5. enforce `max_credits_per_run`
6. enforce Pack017 capacity limits
7. enforce current balance/top-up policy
8. call `brainKernelRuntime.start()`
9. let the existing unified usage ledger reserve once
10. existing terminal logic settles or refunds

If funding is insufficient or current price exceeds the schedule cap:

- no provider/tool execution
- no duplicate reservation
- occurrence state becomes `blocked_funding`
- schedule remains valid unless policy says pause
- create an in-app notification

`allow_topup` defaults to false and must be explicitly enabled.

### 4.8 Authorization and permissions

A schedule is durable authorization to attempt the approved workflow, not a permanent wildcard permission.

The stored authorization must be bound to:

- owner
- schedule
- workflow revision
- approved capability set
- budget ceiling
- external-write policy
- optional device identity
- expiry/revocation state

Every occurrence must revalidate current Pack047 permissions before execution.

Editing a workflow in a way that changes capabilities, destinations, device scope, external writes, or budget invalidates the old authorization and requires re-approval.

### 4.9 PACK087 / Full Computer Control integration

A recurring schedule must never store or replay a stale 15-minute PACK087 Full Control grant.

For a scheduled device-control step:

1. verify the durable automation authorization is still valid
2. verify the specific paired device is still owner-bound and online
3. derive the exact occurrence mission from the approved workflow revision
4. mint a new short-lived mission-bound PACK087 Full Control grant for that occurrence only
5. run the device step
6. preserve STOP, Undo, audit and secret redaction
7. revoke/expire the short-lived grant after the occurrence

No schedule may create unrestricted computer-control permission outside the approved mission.

### 4.10 Exactly-once semantics

Exactly-once means one logical occurrence identity and one billing/task identity, not a promise that distributed delivery happens literally once.

Required invariants:

- scheduler scan can run multiple times
- due occurrence insert is unique
- queue delivery can retry
- worker can restart
- Brain Kernel start can be replayed
- usage reservation remains one logical reservation
- a successful external side effect must not be repeated because of queue redelivery
- Pack037/038 stable step idempotency remains authoritative

Manual “Run again” after a terminal failure creates a new explicit occurrence and therefore a new run/billing identity.

### 4.11 Pause / resume / cancel

Pause:

- blocks new future occurrence claims
- does not silently cancel an already running task

Resume:

- recomputes `next_run_at`
- does not replay every missed occurrence unless the selected misfire policy allows it

Cancel schedule:

- permanently blocks future occurrences
- preserves history/audit
- may optionally request cancellation of the active task through Pack039

Active task cancellation must use the existing cancel/compensation path.

### 4.12 Notifications

PACK088 enables in-app notifications through the existing `zuvyr_notifications` table.

Required notification events:

- schedule activated
- occurrence started
- occurrence succeeded
- occurrence failed
- funding blocked
- permission blocked
- schedule paused
- schedule cancelled

Do not claim email/push/Slack delivery in PACK088 unless a real connector/provider is wired and live-verified.

## 5. Runtime components to add

Planned files/components:

- `backend/88_pack088_automations_durable_workflows.sql`
- `backend/lib/automationRepository.js`
- `backend/lib/automationService.js`
- `backend/lib/automationScheduler.js`
- `backend/lib/automationQueue.js`
- `backend/lib/automationWorker.js`
- `backend/lib/automationRoutes.js`
- `backend/config/automations.v1.json`
- `backend/test-pack088-automations-durable-workflows.js`
- frontend Scheduled Tasks activation in `frontend/zuvyr-suite-v1.js`

Exact paths remain subject to source-grounded implementation review. Existing files are extended instead of duplicated where that is safer.

## 6. API surface

Owner-scoped authenticated routes planned:

- `GET /api/automations`
- `POST /api/automations`
- `GET /api/automations/:id`
- `PATCH /api/automations/:id`
- `POST /api/automations/:id/activate`
- `POST /api/automations/:id/pause`
- `POST /api/automations/:id/resume`
- `POST /api/automations/:id/cancel`
- `POST /api/automations/:id/run-now`
- `GET /api/automations/:id/runs`
- `GET /api/automation-runs/:runId`

No browser/client direct mutation of service-role scheduler authority.

## 7. Worker model

Use one database-authoritative scheduler loop and BullMQ delivery.

Recommended flow:

1. scheduler tick asks a service-role RPC for due schedules
2. RPC uses row locks / `FOR UPDATE SKIP LOCKED`
3. RPC atomically creates unique `workspace_schedule_runs`
4. RPC atomically advances `next_run_at`
5. scheduler enqueues the occurrence with stable BullMQ job id
6. automation worker revalidates authorization/funding
7. worker calls `brainKernelRuntime.start()`
8. Brain Kernel creates/resumes the durable task
9. schedule run stores `task_run_id`
10. terminal reconciliation writes final schedule-run state + notification

If Redis enqueue fails after DB claim, the occurrence stays recoverable from Postgres and can be re-enqueued with the same job identity.

## 8. UX activation

The current Scheduled Tasks surface is safety-blocked. PACK088 will turn it live only after backend acceptance.

Required UI:

- create schedule
- one-time / recurring choice
- timezone selection
- next run preview
- workflow/goal summary
- budget cap per run
- top-up policy
- device-control warning where relevant
- activate
- pause / resume
- cancel
- run now
- schedule history
- per-run status
- last success / last error
- funding blocked state
- permission blocked state
- retry/run-again
- notification history
- loading / empty / error / retry / reopen
- responsive + keyboard + RTL

The UI must display “no credits charged at schedule creation”.

## 9. Implementation phases

### Phase 88A — Schema + invariants

Build additive migration and repository contract.

Acceptance:

- existing rows preserved
- RLS remains ON
- no wildcard client mutation
- one occurrence uniqueness enforced
- active/paused/cancelled lifecycle constraints enforced
- schedule authorization bound to workflow revision
- no customer row reset

### Phase 88B — Scheduler + exactly-once dispatch

Build due-schedule RPC, scheduler loop and automation queue.

Acceptance:

- same due schedule scanned concurrently creates one occurrence
- duplicate enqueue produces one logical queue job
- Redis outage leaves occurrence recoverable
- restart re-enqueues the same occurrence identity
- timezone next-run calculation passes DST fixtures

#### 88B FINALIZED — LOCKED_VERIFIED

- Finalized: 2026-09-21T13:43:10.952481Z
- PR #65 merged as `172e7d3dc56277461459f279ed8ffe7de5b5e608`.
- GitHub run `35605334166`: Backend Quality PASS + Release Quality PASS.
- Production migrations: `20260921132002 pack088_88b_scheduler_exactly_once` and `20260921133533 pack088_88b_claim_conflict_hotfix`.
- Concurrent due-schedule claims produced one logical occurrence for the acceptance schedule; the parallel replay returned no duplicate occurrence.
- Redis-dispatch failure recovery preserved the occurrence as `pending`, then requeued the same run identity with stable BullMQ job ID `pack088-<runId>`.
- DST fixtures passed across 2026 America/New_York spring-forward and fall-back transitions while preserving 09:00 local time.
- Railway worker runs the scheduler with `enabled=true`, interval 15000 ms and batch 25. First observed production tick had 0 claimed / 0 queued / 0 failed.
- Acceptance fixtures were removed. Production now has 0 execution-enabled schedules and 0 pending/queued automation runs.
- No provider call, Brain Kernel task start, or billing mutation occurred in 88B.
- Evidence: `zuvyr-pack-evidence/pack-088/2026-09-21-88b/receipt.json`.
- **88C remains NOT_STARTED and requires explicit user instruction.**

### Phase 88C — Brain Kernel + funding + permission binding

Connect each occurrence to the existing Brain Kernel.

Acceptance:

- current pricing is calculated at run time
- one reservation per occurrence
- insufficient credits => no provider execution
- price > cap => blocked, no execution
- permission revoked => blocked, no execution
- workflow revision change invalidates stale authorization
- Pack087 device-control occurrence mints only a fresh short-lived mission grant

#### 88C FINALIZED — LOCKED_VERIFIED

- Finalized: 2026-09-21T15:46:23.144019Z
- Primary implementation PR #67 merged as `dcfb1c03ff3db3a274c7af3b319f1380de5caeda`; quality run `35614175709` passed Backend Quality + Release Quality.
- FIX2 bound Brain plan capabilities to the workflow-approved capability set before reservation and preserved exact quote/cap evidence.
- FIX3 PR #70 merged as `6c6b6eb18c30a04343a21cbd5d53dea44fcb7613`; quality run `35620353690` passed Backend Quality + Release Quality.
- Production migration: `20260921144521 pack088_88c_funding_permission_brain`.
- Live stale/revoked workflow authorization acceptance reached `blocked_permission` before task creation or usage reservation.
- Live cap=0 acceptance reached `blocked_funding / PACK040_CREDIT_CAP_EXCEEDED` with exact runtime quote evidence (3 estimated credits, cap 0), zero Brain task and zero usage record.
- Transaction-only PACK087 IP proof minted a fresh mission-bound Full Control grant with 9 scopes, verified mission digest/receipt, then rolled back fully; the real expired session was not misrepresented as live-active.
- Worker log confirms automation execution runtime is enabled. Railway backend/worker/maintenance are SUCCESS on FIX3 runtime commit.
- Acceptance fixtures were removed; production is clean: 0 execution-enabled schedules and 0 pending/queued/claimed/running automation runs.
- No provider call and no payment mutation occurred during live acceptance.
- Evidence: `zuvyr-pack-evidence/pack-088/2026-09-21-88c/receipt.json`.
- **88D remains NOT_STARTED and requires explicit user instruction.**

### Phase 88D — Pause/cancel/history/notifications/UI

Activate product surface.

Acceptance:

- pause blocks future runs
- resume recomputes next run
- cancel preserves history
- active task cancellation uses Pack039
- in-app notifications created exactly once per event
- Scheduled Tasks UI is real, not placeholder
- loading/empty/error/retry/reopen + keyboard/RTL/mobile pass

#### 88D IMPLEMENTATION CHECKPOINT — PRODUCTION UI GATE

- Implementation PR #72 merged as `cbaff02b1512ff75b550999f7e17c3c0d1b64426`; quality head `178e8dc75a831bc6cfbeeea62f3b0a3c2bfc6418` and GitHub quality runs `35637079084` / `35637348576` passed.
- Production migration: `20260921181528 pack088_88d_ui_notifications_pause_cancel`.
- Production-schema transaction-only acceptance passed pause/resume/run-now/cancel/history/exactly-once notifications and the claimed-before-Brain cancellation race. It created 0 Brain tasks, 0 usage records, 0 provider execution and 0 charged credits; cleanup left zero acceptance rows.
- Active linked task cancellation reuses PACK039. Control is checked after claim and after reservation to prevent cancel races.
- Railway backend, worker and maintenance are SUCCESS on the exact merge commit; scheduler and automation execution runtimes are enabled.
- Scheduled Tasks source UI and branch previews are READY, but the merged Vercel production deployment is blocked by the account build-rate-limit.
- 88D is **not yet canonical LOCKED_VERIFIED**. Remaining gate: merged production frontend deployment + live Scheduled Tasks verification.
- Evidence: `zuvyr-pack-evidence/pack-088/2026-09-21-88d/receipt.json`.
- **88E remains NOT_STARTED until this gate clears.**

### Phase 88E — Production acceptance + recovery

Real production proof.

Minimum live proof:

1. create a one-time schedule a few minutes in the future
2. no charge at creation
3. occurrence fires at intended time
4. current quote/funding check runs
5. one task_run is created
6. one usage reservation exists
7. task completes and result persists
8. exactly one terminal settlement/refund is recorded
9. notification appears
10. force worker restart during a second scheduled run
11. same occurrence/task resumes after restart
12. no duplicate charge and no duplicate external side effect
13. recurring schedule produces the next distinct occurrence
14. pause prevents the following occurrence

Only then may PACK088 become `LOCKED_VERIFIED`.

## 10. Required regression coverage

Must preserve:

- Pack037 task idempotency
- Pack038 lease/retry/timeout/resume
- Pack039 cancellation/compensation
- Pack040 one usage reservation + terminal settle/refund
- Pack047 owner/resource scope and revoke/expiry
- Pack050 responsive/RTL shell
- Pack087 STOP/Undo/mission-bound device authorization when used by an automation

PACK087 real-device verification is not repeated unless PACK088 changes a PACK087 runtime path or a scheduled device-control acceptance explicitly needs that path.

## 11. Explicit non-goals for PACK088

Not part of this pack unless required to make the core contract work:

- plugin marketplace
- OAuth connector lifecycle
- external email/Slack notification delivery
- arbitrary third-party MCP installation
- multi-tenant enterprise workflow marketplace
- PACK089 connection management
- PACK090 general agent checkpoint
- advanced monthly/calendar recurrence beyond the tested V1 recurrence subset

## 12. Final PACK088 definition of done

PACK088 is complete only when:

- one-time and recurring schedules are live
- timezone behavior is real and tested
- Postgres owns schedule/occurrence truth
- queue retries cannot duplicate a logical occurrence
- current permissions and current pricing are revalidated for every run
- funding is reserved only at execution time
- worker restart resumes the same durable task
- pause/cancel work
- results/history survive reload
- in-app notifications work
- owner boundaries and RLS pass
- production deployment identities are verified
- a dated real production scheduled run proves “runs once, charges once, persists result, resumes after restart”
- receipt/state/matrix/roadmap are reconciled

PACK089 must not start before this gate.

## 13. Phase 88A canonical checkpoint — 2026-09-21

Status: **LOCKED_VERIFIED**

- PACK088 overall status: `IN_PROGRESS`.
- Base implementation PR `#60`, merge `bba73570d735d4801047e90635715eb7d4b3f9cc`.
- Workflow invalidation FIX2 PR `#63`, merge `f3df3a881a01742b4f927ea9f986bc5d2c23c737`.
- GitHub quality gates:
  - run `35563765307`: Backend Quality PASS + Release Quality PASS.
  - run `35564345862`: Backend Quality PASS + Release Quality PASS.
- Production schema now includes workflow/schedule revision binding plus durable `workspace_schedule_runs` occurrence identity.
- Production migration history:
  - `20260921051008 pack088_88a_automations_durable_workflows`
  - `20260921051010 pack088_88a_automations_schema_invariants`
  - `20260921051244 pack088_88a_ledger_privilege_hardening`
  - `20260921052207 pack088_88a_workflow_invalidation_trigger`
- The first two 88A migrations contain identical SQL (SHA256 `654ce05524e1547f9f10b9f385f5e61711abec8a9dc8f2d2ca5cefeb5b8c1813`). Migration history is preserved; no schema divergence was found.
- `workspace_schedule_runs`: RLS ON, zero anon/authenticated grants, service-role privileges limited to SELECT/INSERT/UPDATE.
- Behavioral production test used transaction-only rows and ROLLBACK. It verifies workflow revision bumps, stale authorization invalidation after workflow change, schedule-definition revision invalidation, duplicate occurrence rejection, owner mismatch rejection and IANA timezone rejection. Zero test rows persisted.
- Real testing found and closed FIX2: `AFTER UPDATE OF revision` did not fire when a BEFORE trigger derived a revision change. Canonical trigger is now `AFTER UPDATE`, while the function itself guards on `NEW.revision IS DISTINCT FROM OLD.revision`.
- Railway backend, worker and maintenance are SUCCESS on exact commit `f3df3a881a01742b4f927ea9f986bc5d2c23c737`.
- No frontend file changed; Vercel deployment was not required for 88A. The known Vercel build-rate-limit status is not an 88A runtime regression.
- No schedule was activated, no provider call occurred and no billing mutation occurred.
- Final receipt: `zuvyr-pack-evidence/pack-088/2026-09-21-88a/receipt.json`.
- **88B Scheduler + Exactly-Once Dispatch is NOT_STARTED and requires explicit user instruction.**

