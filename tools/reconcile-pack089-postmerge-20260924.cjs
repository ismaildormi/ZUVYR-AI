'use strict';

const fs = require('fs');
const crypto = require('crypto');

const SOURCE_MAIN = 'f1886d5cd9a9a3a6d56c0cc8a83daf80fb6a47ea';
const STATUS = 'OWNER_AUTH_ACCEPTANCE_PENDING';
const PHASE = '89E_PRODUCTION_ACCEPTANCE';
const RECEIPT = 'zuvyr-pack-evidence/pack-089/2026-09-24-89e-post-merge-owner-acceptance-ready/receipt.json';
const NEXT = 'Use the real owner-authenticated Plugins & Connections surface: Browse files -> approve the exact read permission -> verify the granted Drive list/read result and denied write proof -> Disconnect -> verify post-revoke denial -> verify audit persistence and Vault/plaintext-secret cleanliness. Do not start PACK090 first.';
const observedAt = new Date().toISOString();

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.mkdirSync(require('path').dirname(path), { recursive: true }); fs.writeFileSync(path, value); }
function json(path) { return JSON.parse(read(path)); }
function writeJson(path, value) { write(path, JSON.stringify(value, null, 2) + '\n'); }
function blobSha(text) {
  const b = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
}
function mustReplace(text, regex, replacement, label) {
  if (!regex.test(text)) throw new Error(`missing reconciliation anchor: ${label}`);
  return text.replace(regex, replacement);
}

const receipt = {
  schema_version: '1.0',
  pack: '089',
  phase: PHASE,
  status: STATUS,
  observed_at: observedAt,
  source_main: SOURCE_MAIN,
  evidence: {
    repository: 'ismaildormi/ZUVYR-AI',
    merged_owner_acceptance_controls: true,
    owner_acceptance_controls: {
      browse_files: 'DEPLOYED',
      permission_center_challenge_and_grant: 'DEPLOYED',
      expected_denied_write_guard: 'DEPLOYED',
      disconnect_revoke: 'DEPLOYED',
      post_revoke_denial_check: 'DEPLOYED'
    },
    google_oauth_owner_consent_completed: true,
    oauth_callback_completed: true,
    google_drive_connection: {
      status: 'active', connected: true,
      scopes: ['drive.export', 'drive.file.read'],
      explicit_consent: true, read_enabled: true, write_enabled: false,
      credential_storage: 'VAULT_BACKED'
    },
    owner_drive_permission_audit_events_after_deploy: 0,
    interpretation_of_zero_permission_events: 'The real owner has not yet executed the newly deployed Browse files acceptance flow; this must not be fabricated.',
    vercel: {
      status: 'READY', target: 'production',
      deployment_id: 'dpl_DEhSnxP5pC5JUeZmaKhgHRN9nbeU',
      github_commit_sha: SOURCE_MAIN,
      github_status: 'SUCCESS'
    },
    railway: {
      environment: 'production',
      backend: { deployment_id: '22e6f76e-8d39-41c4-899e-49c38d94cad4', status: 'SUCCESS' },
      worker: { deployment_id: '579f52ff-bb4e-41bb-9e5a-cf13c2b4561e', status: 'SUCCESS' },
      maintenance: { deployment_id: '7b711dfc-e6bf-4856-90e6-e521c35c7c9e', status: 'SUCCESS' }
    },
    visual_qa: {
      workflow_run_id: 36067370611,
      artifact_id: 10836762121,
      artifact_name: `zuvyr-visual-qa-${SOURCE_MAIN}`,
      status: 'PASS',
      fixture_views: 24,
      native_screens: 26,
      horizontal_overflow: 0,
      missing_views: 0,
      duplicate_ids: 0,
      console_errors: 0,
      accessibility_critical: 0,
      accessibility_serious: 0,
      accessibility_moderate: 0,
      public_production_http: 200
    },
    release_quality_run_id: 36067370563,
    continuity_run_id: 36067370688,
    rw_016_visual_qa: 'CLOSED_WITH_POST_MERGE_EVIDENCE',
    rw_018_vercel_build_rate_limit: 'CLOSED_COOLDOWN_RECOVERED_EXACT_PRODUCTION_READY'
  },
  interpretation: {
    pack089_complete: false,
    pack090_started: false,
    internally_actionable_owner_acceptance_controls_deployed: true,
    only_remaining_pack089_gate: 'REAL_OWNER_AUTHENTICATED_ACCEPTANCE_AND_POST_ACCEPTANCE_DB_VAULT_VERIFICATION'
  },
  next: {
    pack090_allowed: false,
    required_sequence: 'owner Browse files -> exact permission approval -> granted read/list -> denied write -> disconnect/revoke -> post-revoke denial -> audit persistence -> Vault/plaintext-secret cleanliness'
  }
};
writeJson(RECEIPT, receipt);

const statePath = 'docs/zuvyr/ZUVYR_CURRENT_STATE_OVERRIDE_2026-09-23.json';
const state = json(statePath);
state.schema_version = '1.9';
state.updated_at = observedAt;
state.source_main_before_this_reconciliation = SOURCE_MAIN;
Object.assign(state.active_work, {
  pack: 'PACK089', pack_status: 'IN_PROGRESS', phase: PHASE, phase_status: STATUS,
  pack090_allowed: false, latest_receipt: RECEIPT, next_legal_step: NEXT,
  interactive_owner_consent_completed: true,
  google_oauth_values_or_google_side_validity: 'PRODUCTION_OWNER_CONSENT_AND_CALLBACK_CONFIRMED'
});
state.active_work.owner_acceptance_controls = {
  status: 'DEPLOYED_ON_PRODUCTION_MAIN',
  source_main: SOURCE_MAIN,
  browse_files: true,
  permission_center_challenge_and_grant: true,
  denied_write_guard: true,
  disconnect_revoke: true,
  post_revoke_denial_check: true,
  real_owner_execution: 'PENDING'
};
state.active_work.google_drive_connection_current = {
  status: 'active', connected: true, scopes: ['drive.export','drive.file.read'],
  explicit_consent: true, read_enabled: true, write_enabled: false,
  refresh_token_present: true, revoked_at: null,
  credential_storage: 'VAULT_BACKED',
  owner_permission_audit_after_acceptance_controls_deploy: 0,
  observed_from: 'fresh Supabase production evidence after main ' + SOURCE_MAIN
};
state.infrastructure = Object.assign({}, state.infrastructure, {
  railway_services_latest_status: 'SUCCESS_ON_MAIN_' + SOURCE_MAIN.toUpperCase(),
  railway_pending_work: 0,
  railway_backend_deployment: '22e6f76e-8d39-41c4-899e-49c38d94cad4',
  railway_worker_deployment: '579f52ff-bb4e-41bb-9e5a-cf13c2b4561e',
  railway_maintenance_deployment: '7b711dfc-e6bf-4856-90e6-e521c35c7c9e',
  vercel_current_production_reachable: true,
  vercel_current_production_deployment: 'dpl_DEhSnxP5pC5JUeZmaKhgHRN9nbeU',
  vercel_current_production_source_sha: SOURCE_MAIN,
  vercel_current_production_status: 'READY',
  vercel_build_rate_limit_current_gate: false,
  vercel_build_rate_limit_resolution: 'CLOSED_COOLDOWN_RECOVERED_EXACT_PRODUCTION_READY'
});
state.reconciled_prior_pack_hardening = state.reconciled_prior_pack_hardening || {};
state.reconciled_prior_pack_hardening.level3_postmerge_2026_09_24 = {
  status: 'LOCKED_VERIFIED_POST_MERGE',
  source_main: SOURCE_MAIN,
  visual_qa_run_id: 36067370611,
  visual_qa_artifact_id: 10836762121,
  public_production_http: 200,
  actionable_visual_findings: 0,
  rw_016: 'CLOSED', rw_018: 'CLOSED'
};
state.known_unresolved_gates = (state.known_unresolved_gates || []).filter(x => !/Vercel Git build-rate-limit|ChatGPT-visible ZUVYR visual/i.test(String(x)));
const pack089Gate = 'PACK089 final Google Drive production acceptance: real owner Browse files permission/read, denied write proof, disconnect/revoke, post-revoke denial, audit persistence and Vault/plaintext-secret cleanliness';
state.known_unresolved_gates = state.known_unresolved_gates.filter(x => !String(x).startsWith('PACK089 final Google Drive production acceptance:'));
state.known_unresolved_gates.unshift(pack089Gate);
writeJson(statePath, state);

const masterStatePath = 'ZUVYR_MASTER_STATE.json';
const master = json(masterStatePath);
master.continuity_capsule.updated_at = '2026-09-24';
master.continuity_capsule.active_pack = 'PACK089';
master.continuity_capsule.active_phase = PHASE;
master.continuity_capsule.active_status = STATUS;
master.continuity_capsule.latest_receipt = RECEIPT;
master.continuity_capsule.pack090_allowed = false;
master.continuity_capsule.next_legal_step = NEXT;
writeJson(masterStatePath, master);

let matrix = read('ZUVYR_MASTER_MATRIX.md');
const matrixHeader = `# ZUVYR MASTER MATRIX — LATEST CANONICAL CONTINUITY OVERRIDE — 2026-09-24\n\nThis dated override is the **current-state entry point**. Older Pack headers/status blocks below are preserved as historical evidence and must not be interpreted as current merely because they appear earlier in the file.\n\n| Field | Current canonical value |\n|---|---|\n| Continuity manifest | \`docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json\` |\n| Continuity validator | \`tools/validate-zuvyr-continuity.cjs\` |\n| Continuity CI | \`.github/workflows/zuvyr-continuity.yml\` |\n| Readiness matrix | \`docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json\` |\n| V1 readiness range | \`EA-001…EA-292\` |\n| Active main Pack | \`PACK089 — Skills / Plugins / MCP / Connections\` |\n| Active phase | \`${PHASE}\` |\n| Current status | \`${STATUS}\` |\n| 89A / 89B / 89C / 89D | \`LOCKED_VERIFIED\` |\n| 89E non-external acceptance | \`PASS\` |\n| Latest receipt | \`${RECEIPT}\` |\n| PACK090 allowed | **NO** |\n| OAuth owner consent/callback | **PASS** |\n| Owner acceptance controls | **DEPLOYED on main \`${SOURCE_MAIN}\`** |\n| Vercel cooldown / RW-018 | **CLOSED — exact production READY** |\n| Visual QA / RW-016 | **CLOSED — post-merge workflow PASS** |\n| Remaining PACK089 gate | Real owner Browse files permission/read → denied write → disconnect/revoke → post-revoke denial → audit/Vault cleanliness |\n| Final release gate | \`PACK150\` only; \`V1_READY=true\` requires all applicable \`EA-001…EA-292\` PASS |\n\n**Next legal step:** ${NEXT}\n\n**Conflict rule:** fresh production/source/receipt evidence beats this override; this override beats older historical matrix sections. If a new session sees disagreement between continuity sources, or the continuity validator/CI fails, it must repair/reconcile continuity before feature work rather than guessing.\n\n---`;
matrix = mustReplace(matrix, /^# ZUVYR MASTER MATRIX — LATEST CANONICAL CONTINUITY OVERRIDE — 2026-09-24[\s\S]*?\n---/, matrixHeader, 'master matrix header');
write('ZUVYR_MASTER_MATRIX.md', matrix);

let cont = read('ZUVYR_CONTINUE_HERE.md');
const freshTop = `# ZUVYR — CONTINUE HERE\n\n## FRESH PACK089 89E POST-MERGE OWNER-ACCEPTANCE-READY CHECKPOINT — 2026-09-24\n\n- Source truth: main \`${SOURCE_MAIN}\`.\n- Google OAuth owner consent + callback: **PASS**. One owner Google Drive connection remains active with \`drive.file.read\` + \`drive.export\`; write is disabled and credentials remain Vault-backed.\n- PACK089 owner acceptance controls are deployed in production: **Browse files → Permission Center challenge/grant → real Drive list/read → expected denied write guard → Disconnect/revoke → post-revoke denial check**.\n- The real owner has **not yet executed** the newly deployed Browse-files permission flow; current permission-audit count for that acceptance is zero. Do not fabricate it.\n- Vercel cooldown/build-rate-limit gate is **CLOSED**: production deployment \`dpl_DEhSnxP5pC5JUeZmaKhgHRN9nbeU\` is READY on exact main \`${SOURCE_MAIN}\`.\n- Railway production backend/worker/maintenance are all **SUCCESS** on the merged source.\n- Post-merge Visual QA is **PASS** (run \`36067370611\`, artifact \`10836762121\`): 24 fixture views + 26 native screens, zero overflow/missing views/duplicate IDs/console errors, zero critical/serious/moderate accessibility violations, public production HTTP 200. RW-016 and RW-018 are closed by evidence.\n- PACK089 remains \`IN_PROGRESS\`; PACK090 remains **NOT ALLOWED**.\n- Remaining legal gate: real owner Browse-files permission/read → denied write proof → disconnect/revoke → post-revoke denial → audit persistence → Vault/plaintext-secret cleanliness.\n- Receipt: \`${RECEIPT}\`.\n\nUpdated:`;
cont = mustReplace(cont, /^# ZUVYR — CONTINUE HERE\n\n[\s\S]*?\n\nUpdated:/, freshTop, 'continue fresh checkpoint');
const capsule = `## CURRENT CANONICAL EXECUTION CAPSULE — 2026-09-24\n\nThis small section is intentionally duplicated from the machine-readable continuity manifest so a human or a fresh chat can identify the legal continuation point before reading historical material. Fresh evidence overrides older text.\n\n- **Active Pack:** \`PACK089 — Skills / Plugins / MCP / Connections\`\n- **Pack status:** \`IN_PROGRESS\`\n- **Active phase:** \`${PHASE}\`\n- **Phase status:** \`${STATUS}\`\n- **89A / 89B / 89C / 89D:** \`LOCKED_VERIFIED\`\n- **89E non-external acceptance:** \`PASS\`\n- **Latest receipt:** \`${RECEIPT}\`\n- **PACK090 allowed:** \`NO\`\n- **Next legal step:** ${NEXT}\n- **Do not fabricate owner acceptance and do not start PACK090 before PACK089 becomes LOCKED_VERIFIED.**\n- **Continuity validator:** \`tools/validate-zuvyr-continuity.cjs\`\n- **Continuity CI:** \`.github/workflows/zuvyr-continuity.yml\`\n\n\n### PACK150 readiness invariant`;
cont = mustReplace(cont, /## CURRENT CANONICAL EXECUTION CAPSULE[\s\S]*?\n\n### PACK150 readiness invariant/, capsule, 'continue execution capsule');
write('ZUVYR_CONTINUE_HERE.md', cont);

let rw = read('docs/zuvyr/ZUVYR_REMAINING_WORK.md');
const rw001 = `### RW-001 — PACK089 Google OAuth production acceptance\nStatus: \`AUTH_ACCEPTANCE_PENDING\`\n\nCompleted and production-verified:\n- owner-scoped Google OAuth consent and callback succeeded;\n- one live Google Drive connection is active with \`drive.file.read\` + \`drive.export\`; \`write_enabled=false\`;\n- duplicate-connect/callback idempotency and expired PKCE Vault cleanup are production verified;\n- owner acceptance controls are deployed on main \`${SOURCE_MAIN}\`: Browse files, exact Permission Center grant, denied-write guard, disconnect/revoke and post-revoke denial check;\n- credentials remain server-side through the Vault-backed path.\n\nStill required before PACK090:\n- the real owner executes **Browse files** and approves the exact read permission;\n- granted Drive list/read result is observed;\n- denied write/scope proof is observed;\n- real disconnect/revoke is executed;\n- post-revoke denial is observed;\n- audit persistence is verified;\n- Vault/plaintext-secret cleanliness is verified after revoke.\n\nCurrent production permission-audit evidence shows the new owner acceptance has not yet been executed. Do not mark PACK089 complete or start PACK090 before this sequence exists.\n\n---\n\n`;
rw = mustReplace(rw, /### RW-001 — PACK089 Google OAuth production acceptance[\s\S]*?\n---\n\n(?=### RW-002)/, rw001, 'RW-001');
const rw016 = `### RW-016 — ChatGPT-visible ZUVYR visual and product-experience QA\nStatus: \`CLOSED\`\nClosed: 2026-09-24\nSubsystem: \`Visual QA / UX / accessibility / responsive product acceptance\`\n\nClosure evidence:\n- merged production source: \`${SOURCE_MAIN}\`;\n- post-merge Visual QA workflow run: \`36067370611\` = **PASS**;\n- immutable artifact: \`10836762121\` / \`zuvyr-visual-qa-${SOURCE_MAIN}\`;\n- 24 deterministic fixture views + 26 native screens inspected;\n- horizontal overflow=0, missing views=0, duplicate IDs=0, console errors=0, render failures=0;\n- accessibility critical=0, serious=0, moderate=0;\n- canonical public-production probe HTTP 200.\n\nThe required visual harness, screenshot/report inspection, actionable-finding repair and passing rerun are now evidenced. Reopen this item only if a later UI change creates a new actionable regression.\n\n---\n\n`;
rw = mustReplace(rw, /### RW-016 — ChatGPT-visible ZUVYR visual and product-experience QA[\s\S]*?\n---\n\n(?=### RW-017)/, rw016, 'RW-016');
const rw018 = `### RW-018 — Vercel Git build-rate-limit blocks all-green deployment evidence\nStatus: \`CLOSED\`\nClosed: 2026-09-24\nSubsystem: \`Vercel Git integration / Level 3 production deployment evidence\`\n\nClosure evidence:\n- cooldown/build quota recovered without disabling the Vercel Git safety path;\n- exact production deployment \`dpl_DEhSnxP5pC5JUeZmaKhgHRN9nbeU\` is **READY**;\n- deployment source SHA is exact merged main \`${SOURCE_MAIN}\`;\n- GitHub Vercel status on current main is **SUCCESS**;\n- post-merge Visual QA run \`36067370611\` is **PASS** and its production probe returned HTTP 200.\n\nThe historical rate-limit failures remain evidence, but they are no longer a current ZUVYR gate.\n\n`;
rw = mustReplace(rw, /### RW-018 — Vercel Git build-rate-limit blocks all-green deployment evidence[\s\S]*?(?=\n## Rules for future additions)/, rw018, 'RW-018');
write('docs/zuvyr/ZUVYR_REMAINING_WORK.md', rw);

const manifestPath = 'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json';
const manifest = json(manifestPath);
manifest.schema_version = '2.9';
manifest.updated_at = observedAt;
manifest.created_from_git_head = SOURCE_MAIN;
manifest.active_work = JSON.parse(JSON.stringify(state.active_work));
manifest.recent_reconciled_hardening = manifest.recent_reconciled_hardening || {};
manifest.recent_reconciled_hardening.level3_postmerge_2026_09_24 = {
  status: 'LOCKED_VERIFIED_POST_MERGE',
  source_main: SOURCE_MAIN,
  vercel_production_deployment: 'dpl_DEhSnxP5pC5JUeZmaKhgHRN9nbeU',
  vercel_status: 'READY',
  visual_qa_run_id: 36067370611,
  visual_qa_artifact_id: 10836762121,
  rw_016: 'CLOSED', rw_018: 'CLOSED'
};
manifest.current_state_override.blob_sha = blobSha(read(statePath));
for (const rel of Object.keys(manifest.canonical_files_snapshot || {})) {
  manifest.canonical_files_snapshot[rel] = blobSha(read(rel));
}
writeJson(manifestPath, manifest);

console.log(JSON.stringify({
  status: 'PACK089_POSTMERGE_CONTINUITY_RECONCILED',
  source_main: SOURCE_MAIN,
  phase_status: STATUS,
  latest_receipt: RECEIPT,
  rw016: 'CLOSED', rw018: 'CLOSED',
  pack090_allowed: false,
  remaining_gate: receipt.next.required_sequence
}, null, 2));
