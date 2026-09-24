# ZUVYR Active Brand Cleanup — 2026-09-24

This cleanup updates active runtime and operator-facing brand text after the repository rename. Historical receipts, backups, immutable evidence and compatibility identifiers are intentionally not rewritten.

The Level 3 mobile containment from superseded PR #120 is rebased here onto the current main.

Changed paths:
- `ROX-BRIDGE.ps1`
- `ROX-MANAGER.ps1`
- `ROX-SETUP.ps1`
- `ROX-SHORTCUT.ps1`
- `ROX-START.ps1`
- `ROX-STOP.ps1`
- `ROX-SUPABASE.ps1`
- `ROX-SUPPORT.ps1`
- `ROX-TEST.ps1`
- `ROX-UPDATE.ps1`
- `ROX-VERIFY-LIVE.ps1`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/server.js`
- `backend/worker.js`
- `cli/commands/ai/advisor.js`
- `cli/commands/ai/forecast.js`
- `cli/commands/ai/health.js`
- `cli/commands/ai/index.js`
- `cli/commands/ai/models.js`
- `cli/commands/ai/optimize.js`
- `cli/commands/ai/providers.js`
- `cli/commands/ai/routing.js`
- `cli/commands/ai/status.js`
- `cli/commands/backup.js`
- `cli/commands/cron/index.js`
- `cli/commands/cron/restart.js`
- `cli/commands/cron/status.js`
- `cli/commands/doctor.js`
- `cli/commands/health.js`
- `cli/commands/jobs.js`
- `cli/commands/latency.js`
- `cli/commands/logs.js`
- `cli/commands/monitor.js`
- `cli/commands/optimize.js`
- `cli/commands/plugins.js`
- `cli/commands/queue/clear.js`
- `cli/commands/queue/index.js`
- `cli/commands/queue/restart.js`
- `cli/commands/queue/status.js`
- `cli/commands/restart.js`
- `cli/commands/restore.js`
- `cli/commands/server/index.js`
- `cli/commands/server/info.js`
- `cli/commands/setup.js`
- `cli/commands/start.js`
- `cli/commands/stop.js`
- `cli/commands/update/group.js`
- `cli/commands/update/index.js`
- `cli/commands/update/models.js`
- `cli/commands/update/providers.js`
- `cli/lib/aiBackend.js`
- `cli/lib/backendLoader.js`
- `cli/lib/flags.js`
- `cli/lib/group.js`
- `cli/lib/interactive.js`
- `cli/lib/platform.js`
- `cli/lib/pluginLoader.js`
- `cli/lib/progress.js`
- `cli/lib/util.js`
- `cli/plugins/example-hello/index.js`
- `cli/rox.js`
- `cli/tests/test-ai-backend.js`
- `cli/tests/test-cross-platform.js`
- `cli/tests/test-group-dispatch.js`
- `cli/tests/test-ops-commands.js`
- `cli/tests/test-production-deploy-config.js`
- `cli/tests/test-setup-redis-check.js`
- `frontend/rox-brand-blue-violet.css`
- `scripts/windows/ROX.Common.ps1`
- `tools/live-smoke.js`
- `tools/rox-ai-admin-dashboard.html`
- `tools/rox-ai-telemetry.html`

Compatibility note: legacy `rox` command/file/function identifiers remain aliases until a dedicated alias-safe migration proves they can be renamed without breaking automation.
