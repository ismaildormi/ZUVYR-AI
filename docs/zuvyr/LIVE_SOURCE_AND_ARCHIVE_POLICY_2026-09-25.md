# ZUVYR Live Source and Archive Boundary — 2026-09-25

Status: **V1 hardening contract**

This document removes ambiguity between deployable ZUVYR source and historical evidence retained in the repository.

## Canonical live source

Unless a later signed release manifest says otherwise, executable/buildable V1 source is limited to the current repository root configuration plus these live roots:

- `.github/workflows/` — active CI/release workflows only.
- `backend/` — current API, workers, migrations, tests and runtime configuration.
- `cli/` — current ZUVYR/legacy-compatible CLI implementation.
- `config/` — current configuration contracts.
- `device-agent/` — current local computer-control agent.
- `frontend/` — current web application source/assets.
- `nginx/`, `scripts/`, `starter-kits/`, `supabase/`, `tools/` — current operational/support source where referenced by active contracts.
- Root release/deployment manifests such as `package.json`, lockfiles, `vercel.json`, `.railwayignore`, and other current deployment configuration.

A historical file is never promoted to live source merely because it still exists in Git.

## Historical/archive material

The following are evidence/rollback archives and **must not** be used as build, deployment, runtime, test-discovery, plugin-discovery, or release-validation source:

- top-level `ROX-LIVE-CHECKPOINT-HISTORY-*` trees;
- top-level `ROX-FRONTEND-EMERGENCY-BACKUP-*` trees;
- top-level `ROX-FRONTEND-*.zip` and other backup ZIP snapshots;
- `logs_backup/` and runtime `logs/`;
- files explicitly named as `*.bak`, `*.backup-*`, `*before-*`, `*broken*`, `*corrupted*`, `*previous-production*`, or similar historical snapshots under runtime roots.

`zuvyr-pack-evidence/` is evidence, not executable runtime source. It may be read by continuity/evidence validation only when a canonical contract explicitly references it; it must never be a deployment/build root or executable plugin source.

Legacy-named root operational scripts (for example `ROX-MANAGER.ps1`) are **not automatically archives**. If `package.json`, a documented operator contract, or a current test still intentionally invokes one, it remains live compatibility source until a dedicated migration removes it.

## Required controls

1. Railway upload ignores historical checkpoints, runtime logs, backup trees and ZIP snapshots.
2. Active package scripts, Vercel configuration, Docker build manifests, Railway configuration, and GitHub Actions must not execute or build from an archive root.
3. Runtime `logs/` must not be tracked in the accepted live tree.
4. Temporary write-capable audit workflows must not survive into the accepted release tree.
5. Release validation must carry an automated source-boundary check.
6. PACK149/150 must seal the exact accepted commit/model/data/client/deployment identities; archives are never implicit fallback source.

## Closure evidence for QH-008

QH-008 can close only when:

- this policy is present on the accepted source identity;
- the machine guard passes in mandatory CI;
- Railway exclusions contain the known historical roots;
- no active operational manifest references those historical roots;
- the exact-source receipt used by PACK149/150 identifies only canonical live source/deploy identities.
