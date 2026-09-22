# ZUVYR Architecture Overview

ZUVYR V1 uses a shared execution foundation so product surfaces do not become separate AI applications.

```text
User / UI
   |
Identity + Session + Permissions
   |
Unified Request / Context / Workspace
   |
Brain Kernel + Planner + Capability Graph
   |
Router / Provider Registry / Cost & Health Gates
   |
+---------+---------+---------+---------+---------+
| Chat    | Media   | Code    | Voice   | IP/Agent|
+---------+---------+---------+---------+---------+
   |
Durable Tasks / Queues / Workers / Automations
   |
Usage Reservation -> Execution -> Settlement/Refund
   |
Supabase persistence + artifact lineage + audit/telemetry
```

## Runtime
The backend owns authorization, contracts and authoritative state. Workers execute durable/background work. Supabase holds persistent product state and RLS-backed ownership boundaries. Railway hosts production backend/worker/maintenance workloads and Vercel serves the frontend in the current deployment architecture.

## Intelligence
A capability-aware router selects permitted providers/models according to task requirements, health, cost and policy. Provider abstractions and the owned-model foundation are designed so implementations can evolve without rewriting every product surface.

## Safety boundaries
Permissions are checked at the resource/tool boundary, not inferred only from ownership. Computer control, OAuth integrations, code execution and automation use explicit grants and auditable execution state. Retries and partial failures are reconciled through idempotent durable tasks and authoritative accounting.

For detailed implementation truth use the canonical state, matrix, roadmap and pack receipts rather than this overview.
