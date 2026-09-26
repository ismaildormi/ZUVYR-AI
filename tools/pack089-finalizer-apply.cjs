'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_MAIN = '9a1527df295de260777e3a2f73972c1b064858ae';
const FINAL_RECEIPT = 'zuvyr-pack-evidence/pack-089/2026-09-26-89e-owner-acceptance-locked/receipt.json';
const REVOKED_AT = '2026-09-26T21:12:48.983055Z';
const NOW = new Date().toISOString();

function abs(rel) { return path.join(ROOT, rel); }
function read(rel) { return fs.readFileSync(abs(rel), 'utf8'); }
function write(rel, text) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), text, 'utf8');
}
function readJson(rel) { return JSON.parse(read(rel)); }
function writeJson(rel, value) { write(rel, JSON.stringify(value, null, 2) + '\n'); }
function blobSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([
    Buffer.from(`blob ${bytes.length}\0`, 'utf8'), bytes
  ])).digest('hex');
}
function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`missing expected text for ${label}`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`expected one occurrence for ${label}`);
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
}
function replaceRegexOnce(text, regex, replacement, label) {
  const matches = [...text.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))];
  if (matches.length !== 1) throw new Error(`expected one regex occurrence for ${label}, got ${matches.length}`);
  return text.replace(regex, replacement);
}

const acceptance = {
  status: 'LOCKED_VERIFIED',
  source_main: SOURCE_MAIN,
  owner_account_verified: true,
  browse_permission: 'PASS_OWNER_SESSION_BOUND',
  drive_list_read: 'PASS_19_FILES',
  denied_write: 'PASS_BLOCKED_AS_EXPECTED',
  disconnect_revoke: 'PASS',
  post_revoke_denial: 'PASS_HTTP_400',
  audit_persistence: 'PASS_INTEGRATION_REVOKED',
  active_connection_grants_after_revoke: 0,
  credential_secret_ref_cleared: true,
  refresh_token_present_after_revoke: false,
  token_expiry_cleared: true,
  integration_vault_rows_after_revoke: 0,
  pkce_vault_rows_after_revoke: 0,
  plaintext_tokenlike_text_columns: 0,
  external_write_executed: false,
  owner_browse_run: 'c23a8b83-8a0e-4e14-9d5b-1200c8267112',
  owner_revoke_run: '13bdbaf0-e903-44ec-b9e7-801bff884aee',
  vercel_production_deployment: 'dpl_DSjPGX8jWXnJAx3k8dSiCFnWPjC4',
  railway_backend_deployment: '13b888ce-e6d9-4d31-a910-2462891f5340',
  disconnect_http: 200,
  post_revoke_challenge_http: 400,
  revoked_at: REVOKED_AT
};

const receipt = {
  schema_version: '1.0',
  pack: '089',
  phase: '89E_PRODUCTION_ACCEPTANCE',
  status: 'LOCKED_VERIFIED',
  title: 'Skills / Plugins / MCP / Connections — real owner Google Drive production acceptance',
  observed_at: NOW,
  source_main: SOURCE_MAIN,
  canonical_pack_status: 'LOCKED_VERIFIED',
  active_pack_after_finalizer: 'PACK090',
  evidence: {
    repository: 'ismaildormi/ZUVYR-AI',
    owner_authentication: 'VERIFIED',
    google_oauth_owner_consent_completed: true,
    oauth_callback_completed: true,
    granted_scopes_before_revoke: ['drive.export', 'drive.file.read'],
    drive_file_write_granted: false,
    owner_read_acceptance: {
      permission: 'Google Drive read permission',
      permission_mode: 'session',
      owner_scoped: true,
      loaded_files: 19,
      result: 'Google Drive read verified',
      write_scope_verification: 'blocked as expected',
      browser_run: acceptance.owner_browse_run
    },
    disconnect_acceptance: {
      deterministic_two_step_confirmation_pr: 133,
      deterministic_two_step_confirmation_main: SOURCE_MAIN,
      first_button: 'Disconnect',
      second_button: 'Confirm disconnect',
      result: 'Google Drive disconnected',
      browser_run: acceptance.owner_revoke_run
    },
    supabase_post_revoke: {
      status: 'revoked',
      connected: false,
      read_enabled: false,
      write_enabled: false,
      credential_secret_ref_cleared: true,
      refresh_token_present: false,
      token_expiry_cleared: true,
      active_connection_grants: 0,
      latest_integration_event: 'integration_revoked',
      external_write_executed: false,
      revoked_at: REVOKED_AT
    },
    vault_plaintext_cleanliness: {
      integration_vault_rows: 0,
      pkce_vault_rows: 0,
      plaintext_tokenlike_text_columns: 0
    },
    railway_runtime: {
      deployment_id: acceptance.railway_backend_deployment,
      status: 'SUCCESS',
      disconnect_route_http: 200,
      post_revoke_tool_challenge_http: 400,
      pending_work: 0
    },
    vercel: {
      deployment_id: acceptance.vercel_production_deployment,
      status: 'READY',
      target: 'production',
      source_sha: SOURCE_MAIN,
      live_alias_verified: true
    },
    github_post_merge: {
      release_quality: 'SUCCESS',
      codeql: 'SUCCESS',
      secret_history: 'SUCCESS',
      visual_qa: 'SUCCESS'
    },
    prior_fix_chain: {
      cors_alias_pr: 132,
      disconnect_confirmation_pr: 133
    },
    live_billing_allowed: false
  },
  interpretation: {
    pack089_complete: true,
    pack089_locked_verified: true,
    pack090_started: false,
    zero_known_actionable_pack089_findings: true,
    external_write_executed: false
  },
  USER_VALUE: 'The owner can connect Google Drive for scoped read/export use, verify denied write authority, and revoke the connection with immediate local/tool/Vault shutdown.',
  EXECUTABLE_USER_ACTIONS: 'Connect, approve exact read permission, browse owner files, disconnect/revoke; write remains unavailable without an explicit write scope.',
  MONEY_OPPORTUNITY_RELEVANCE: 'INDIRECT',
  MONEY_OPPORTUNITY_NOTES: 'Safe scoped connections enable future agent workflows without silently granting external write authority.',
  NEXT_BEST_ACTION: 'Begin PACK090 with the fresh universal-browser gap audit before implementing any new Browser Broker/provider work.',
  PROVENANCE_BEHAVIOR: 'VERIFIED from owner-authenticated production UI, Supabase authority state, Vault cleanliness, Railway HTTP logs, GitHub CI, Visual QA and exact-source Vercel production deployment.',
  HARD_STOP_IMPACT: 'Revoke removes the credential reference, disables read/write, revokes connection grants and makes post-revoke tool challenge fail closed.',
  UNRESOLVED_P0_P1: [],
  next: {
    pack090_allowed: true,
    active_pack_after_finalizer: 'PACK090',
    required_sequence: 'PACK090 fresh universal-browser gap audit -> canonical Browser Broker/provider abstraction only where gaps are evidenced -> connector-first routing -> cross-surface live proof -> progress/STOP/owner scoping.'
  }
};
writeJson(FINAL_RECEIPT, receipt);

// Compact current-state authority.
const currentPath = 'docs/zuvyr/ZUVYR_CURRENT_STATE_OVERRIDE_2026-09-23.json';
const current = readJson(currentPath);
if (current.active_work?.pack !== 'PACK089') throw new Error(`unexpected active pack in current override: ${current.active_work?.pack}`);
current.updated_at = NOW;
current.source_main_before_this_reconciliation = SOURCE_MAIN;
Object.assign(current.active_work, {
  pack: 'PACK089',
  pack_status: 'LOCKED_VERIFIED',
  phase: '89E_PRODUCTION_ACCEPTANCE',
  phase_status: 'LOCKED_VERIFIED',
  pack090_allowed: true,
  latest_receipt: FINAL_RECEIPT,
  next_legal_step: 'Begin PACK090 with a fresh universal-browser gap audit; reconcile the live Browser/Automation/Connection authority surfaces before any new implementation.'
});
current.active_work.completed_subphases = {
  ...(current.active_work.completed_subphases || {}),
  '89E_non_external_acceptance': 'PASS',
  '89E': 'LOCKED_VERIFIED'
};
current.active_work.google_drive_connection_current = {
  status: 'revoked',
  connected: false,
  scopes_before_revoke: ['drive.export', 'drive.file.read'],
  explicit_consent: true,
  read_enabled: false,
  write_enabled: false,
  refresh_token_present: false,
  revoked_at: REVOKED_AT,
  credential_storage: 'VAULT_CLEARED_AFTER_REVOKE',
  active_connection_grants: 0,
  latest_audit_event: 'integration_revoked',
  external_write_executed: false,
  observed_from: 'fresh owner-authenticated production acceptance + Supabase/Railway evidence after main ' + SOURCE_MAIN
};
current.active_work.owner_acceptance_controls = {
  status: 'PRODUCTION_VERIFIED_OWNER_ACCEPTANCE_COMPLETE',
  source_main: SOURCE_MAIN,
  browse_files: true,
  permission_center_challenge_and_grant: true,
  granted_read_list_result: 'PASS_19_FILES',
  denied_write_guard: 'PASS',
  disconnect_revoke: 'PASS',
  post_revoke_denial_check: 'PASS_HTTP_400',
  audit_persistence: 'PASS',
  vault_plaintext_cleanliness: 'PASS',
  real_owner_execution: 'VERIFIED'
};
current.pack089_final_acceptance = acceptance;
if (current.infrastructure) {
  current.infrastructure.railway_services_latest_status = 'SUCCESS_ON_MAIN_' + SOURCE_MAIN.toUpperCase();
  current.infrastructure.railway_pending_work = 0;
  current.infrastructure.railway_backend_deployment = acceptance.railway_backend_deployment;
  current.infrastructure.vercel_current_production_deployment = acceptance.vercel_production_deployment;
  current.infrastructure.vercel_current_production_source_sha = SOURCE_MAIN;
  current.infrastructure.vercel_current_production_status = 'READY';
  current.infrastructure.vercel_build_rate_limit_current_gate = false;
  current.infrastructure.vercel_build_rate_limit_resolution = 'CLOSED_BY_FRESH_EXACT_MAIN_READY_PRODUCTION_DEPLOYMENT_2026_09_26';
}
writeJson(currentPath, current);

// Long-form master state capsule only; historical ledger remains semantically intact.
const masterStatePath = 'ZUVYR_MASTER_STATE.json';
const masterState = readJson(masterStatePath);
const capsule = masterState.continuity_capsule || {};
if (capsule.active_pack !== 'PACK089') throw new Error(`unexpected MASTER_STATE active pack: ${capsule.active_pack}`);
Object.assign(capsule, {
  updated_at: '2026-09-26',
  active_pack: 'PACK089',
  active_phase: '89E_PRODUCTION_ACCEPTANCE',
  active_status: 'LOCKED_VERIFIED',
  latest_receipt: FINAL_RECEIPT,
  pack090_allowed: true,
  next_legal_step: 'Begin PACK090 with a fresh universal-browser gap audit; reconcile live Browser/Automation/Connection authority before implementation.'
});
masterState.continuity_capsule = capsule;
masterState.pack089_final_acceptance = acceptance;
writeJson(masterStatePath, masterState);

// Human master matrix: replace only the compact current override before historical boundary.
const matrixPath = 'ZUVYR_MASTER_MATRIX.md';
let matrix = read(matrixPath);
const matrixMarker = '\n---\n\n# ZUVYR MASTER MATRIX - PACK 005 / FIX7';
const markerIndex = matrix.indexOf(matrixMarker);
if (markerIndex < 0) throw new Error('MASTER_MATRIX historical boundary not found');
const matrixTail = matrix.slice(markerIndex);
const matrixHead = `# ZUVYR MASTER MATRIX — LATEST CANONICAL CONTINUITY OVERRIDE — 2026-09-26\n\nThis dated override is the **current-state entry point**. Older Pack headers/status blocks below are preserved as historical evidence and must not be interpreted as current merely because they appear earlier in the file.\n\n| Field | Current canonical value |\n|---|---|\n| Continuity manifest | \`docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json\` |\n| Continuity validator | \`tools/validate-zuvyr-continuity.cjs\` |\n| Continuity CI | \`.github/workflows/zuvyr-continuity.yml\` |\n| Readiness matrix | \`docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json\` |\n| V1 readiness range | \`EA-001…EA-292\` |\n| Active main Pack | \`PACK089 — Skills / Plugins / MCP / Connections\` |\n| Active phase | \`89E_PRODUCTION_ACCEPTANCE\` |\n| Current status | \`LOCKED_VERIFIED\` |\n| 89A / 89B / 89C / 89D / 89E | \`LOCKED_VERIFIED\` |\n| Latest receipt | \`${FINAL_RECEIPT}\` |\n| PACK090 allowed | **YES** |\n| Owner read/list acceptance | **PASS — 19 files** |\n| Write-scope proof | **PASS — blocked as expected** |\n| Disconnect/revoke | **PASS — DB/Vault/runtime verified** |\n| Post-revoke denial | **PASS — tool challenge HTTP 400** |\n| Vercel production | **READY on exact main \`${SOURCE_MAIN}\` / \`${acceptance.vercel_production_deployment}\`** |\n| Railway production | **SUCCESS on \`${acceptance.railway_backend_deployment}\`** |\n| RW-001 | **CLOSED** |\n| RW-018 | **CLOSED — fresh exact-main production deployment READY** |\n| Remaining PACK089 gate | **NONE** |\n| Final release gate | \`PACK150\` only; \`V1_READY=true\` still requires every applicable final gate |\n\n**Next legal step:** Begin PACK090 with the fresh universal-browser gap audit defined by the canonical V1 plan. Do not skip the audit or infer gaps from chat memory; reconcile current Browser/Automation/Connection authority first.\n\n**Conflict rule:** fresh production/source/receipt evidence beats this override; this override beats older historical matrix sections. If a new session sees disagreement between continuity sources, or the continuity validator/CI fails, it must repair/reconcile continuity before feature work rather than guessing.\n`;
matrix = matrixHead + matrixTail;
write(matrixPath, matrix);

// Continue-here: update top checkpoint and current capsule, preserve history.
const continuePath = 'ZUVYR_CONTINUE_HERE.md';
let cont = read(continuePath);
const updatedMarker = '\nUpdated: 2026-09-22 — EA-001…EA-292 full V1 readiness + anti-loss continuity integrated';
const updatedIndex = cont.indexOf(updatedMarker);
if (updatedIndex < 0) throw new Error('CONTINUE_HERE updated marker not found');
const afterTop = cont.slice(updatedIndex);
const top = `# ZUVYR — CONTINUE HERE\n\n## PACK089 OWNER-ACCEPTANCE FINALIZED — PACK090 ALLOWED — 2026-09-26\n\n- Source truth before finalizer: main \`${SOURCE_MAIN}\`.\n- PACK089 89A–89E: **LOCKED_VERIFIED**.\n- Real owner Google Drive acceptance: **PASS** — session-bound read permission approved, 19 files listed/read, write scope blocked as expected.\n- Real disconnect/revoke: **PASS** — deterministic two-step confirmation, production revoke HTTP 200, post-revoke tool challenge HTTP 400.\n- Supabase post-revoke: status=revoked, connected=false, read/write=false, active connection grants=0, latest audit=integration_revoked, external_write_executed=false.\n- Vault/plaintext cleanliness: integration credential rows=0, PACK089 PKCE Vault rows=0, plaintext token-like public columns=0.\n- Vercel: production \`${acceptance.vercel_production_deployment}\` is **READY** on exact main \`${SOURCE_MAIN}\`; RW-018 is CLOSED.\n- Railway: backend \`${acceptance.railway_backend_deployment}\` is **SUCCESS**; runtime HTTP proof includes disconnect 200 then post-revoke challenge 400.\n- PACK089: **LOCKED_VERIFIED**.\n- PACK090: **ALLOWED, NOT YET STARTED BY THIS FINALIZER**.\n- Receipt: \`${FINAL_RECEIPT}\`.\n`;
cont = top + afterTop;
const capsuleStart = cont.indexOf('## CURRENT CANONICAL EXECUTION CAPSULE');
const capsuleEnd = cont.indexOf('\n### PACK150 readiness invariant', capsuleStart);
if (capsuleStart < 0 || capsuleEnd < 0) throw new Error('CONTINUE_HERE capsule boundary not found');
const newCapsule = `## CURRENT CANONICAL EXECUTION CAPSULE — 2026-09-26\n\nThis small section is intentionally duplicated from the machine-readable continuity manifest so a human or a fresh chat can identify the legal continuation point before reading historical material. Fresh evidence overrides older text.\n\n- **Active Pack:** \`PACK089 — Skills / Plugins / MCP / Connections\`\n- **Pack status:** \`LOCKED_VERIFIED\`\n- **Active phase:** \`89E_PRODUCTION_ACCEPTANCE\`\n- **Phase status:** \`LOCKED_VERIFIED\`\n- **89A / 89B / 89C / 89D / 89E:** \`LOCKED_VERIFIED\`\n- **Latest receipt:** \`${FINAL_RECEIPT}\`\n- **PACK090 allowed:** \`YES\`\n- **Next legal step:** Begin PACK090 with a fresh universal-browser gap audit; reconcile current Browser/Automation/Connection authority before new implementation.\n- **Do not skip PACK090's fresh audit and do not infer its gaps from chat memory.**\n- **Continuity validator:** \`tools/validate-zuvyr-continuity.cjs\`\n- **Continuity CI:** \`.github/workflows/zuvyr-continuity.yml\`\n\n`;
cont = cont.slice(0, capsuleStart) + newCapsule + cont.slice(capsuleEnd + 1);
write(continuePath, cont);

// Remaining-work ledger: close RW-001 and RW-018, preserve item history.
const remainingPath = 'docs/zuvyr/ZUVYR_REMAINING_WORK.md';
let remaining = read(remainingPath);
remaining = replaceRegexOnce(
  remaining,
  /### RW-001 — PACK089 Google OAuth production acceptance[\s\S]*?\n---\n/,
  `### RW-001 — PACK089 Google OAuth production acceptance\nStatus: \`CLOSED\`\nClosed: 2026-09-26\n\nClosure evidence:\n- real owner session approved the exact Google Drive read permission and loaded 19 files;\n- \`drive.file.write\` remained unavailable and the live UI reported write scope blocked as expected;\n- deterministic two-step disconnect confirmation shipped in PR #133 / main \`${SOURCE_MAIN}\`;\n- Vercel production \`${acceptance.vercel_production_deployment}\` is READY on exact main \`${SOURCE_MAIN}\`;\n- real revoke returned HTTP 200; immediate post-revoke tool challenge returned HTTP 400;\n- Supabase authoritative state is revoked/connected=false/read=false/write=false; active connection grants=0; latest audit event=\`integration_revoked\`; external_write_executed=false;\n- credential reference, refresh-token flag and token expiry are cleared; integration Vault rows=0; PACK089 PKCE Vault rows=0; plaintext token-like public columns=0;\n- final receipt: \`${FINAL_RECEIPT}\`.\n\nPACK089 may be marked \`LOCKED_VERIFIED\`; PACK090 may begin only through its canonical fresh universal-browser gap audit.\n\n---\n`,
  'RW-001 closure'
);
remaining = replaceRegexOnce(
  remaining,
  /### RW-018 — Vercel Git build-rate-limit blocks all-green deployment evidence[\s\S]*?\n\n## Rules for future additions/,
  `### RW-018 — Vercel Git build-rate-limit blocks all-green deployment evidence\nStatus: \`CLOSED\`\nClosed: 2026-09-26\nSubsystem: \`Vercel Git integration / production deployment evidence\`\n\nClosure evidence:\n- the prior provider rate-limit/cooldown monitor recovered;\n- exact-main production deployment \`${acceptance.vercel_production_deployment}\` reached **READY** on \`${SOURCE_MAIN}\`;\n- production runtime was owner-accessed successfully and the PACK089 disconnect UI executed on that deployment;\n- post-merge Visual QA, Release Quality, Secret History and CodeQL are green on the same main;\n- no integration safety control was disabled to obtain a green status.\n\nReopen only if a later relevant production deployment again becomes externally blocked or exact-source identity cannot be proven. QH-015 still independently requires final PACK149/150 launch-source reconciliation on the final release SHA.\n\n\n## Rules for future additions`,
  'RW-018 closure'
);
write(remainingPath, remaining);

// Quality hardening matrix: close QH-016 and reconcile top/current summary only.
const qhPath = 'docs/zuvyr/V1_QUALITY_HARDENING_MATRIX_2026-09-25.md';
let qh = read(qhPath);
qh = replaceRegexOnce(
  qh,
  /^Status: .*$/m,
  'Status: POST-PACK089 OWNER-ACCEPTANCE RECONCILIATION — additive to the canonical PACK001..PACK150 roadmap. PACK089 owner acceptance is closed; PACK090 is allowed only through its canonical fresh audit.',
  'QH matrix status'
);
qh = replaceRegexOnce(
  qh,
  /^\| QH-016 \|.*$/m,
  `| QH-016 | PACK089 engineering required real owner Google Drive acceptance. | External acceptance / connection authority | PACK089 | PACK090 entry gate, PACK148 | Connections / OAuth / authority | CLOSED | Real owner approved session-bound read permission, loaded 19 Drive files, write scope stayed blocked, deterministic disconnect/revoke completed, post-revoke challenge returned HTTP 400, integration audit persisted, active grants=0, Vault credential/PKCE rows=0, plaintext token-like public columns=0, and external_write_executed=false. Final receipt: \`${FINAL_RECEIPT}\`. |`,
  'QH-016 row'
);
qh = qh.replace('PACK090: **still blocked by QH-016 owner Google Drive acceptance**', 'PACK090: **ALLOWED after PACK089 LOCKED_VERIFIED finalizer; start with the canonical fresh universal-browser gap audit**');
qh = qh.replace('QH-012/013/015/016 remain external/final gates as stated above.', 'QH-016 is CLOSED; QH-012/013/015 remain external/final gates as stated above.');
write(qhPath, qh);

// Continuity validator: remove the PACK089-era hardcode while preserving fail-closed transition semantics.
const validatorPath = 'tools/validate-zuvyr-continuity.cjs';
let validator = read(validatorPath);
validator = replaceOnce(
  validator,
  "expect(active.pack090_allowed === false && manifestActive.pack090_allowed === false, 'PACK090 must remain blocked');",
  `expect(typeof active.pack090_allowed === 'boolean', 'current-state pack090_allowed must be boolean');\nexpect(manifestActive.pack090_allowed === active.pack090_allowed, 'manifest/current-state pack090_allowed mismatch');\nconst activePackNumber = Number(active.pack.slice(4));\nif (active.pack === 'PACK089') {\n  const pack089Locked = active.pack_status === 'LOCKED_VERIFIED' && active.phase_status === 'LOCKED_VERIFIED';\n  expect(active.pack090_allowed === pack089Locked, 'PACK090 allowance must exactly match PACK089 LOCKED_VERIFIED state');\n}\nif (Number.isFinite(activePackNumber) && activePackNumber >= 90) {\n  expect(active.pack090_allowed === true, 'PACK090 must remain allowed once active Pack is PACK090 or later');\n}`,
  'validator PACK090 gate'
);
validator = replaceOnce(
  validator,
  "if (typeof receipt?.next?.pack090_allowed === 'boolean') expect(receipt.next.pack090_allowed === false, 'latest receipt unexpectedly allows PACK090');",
  "if (typeof receipt?.next?.pack090_allowed === 'boolean') expect(receipt.next.pack090_allowed === active.pack090_allowed, 'latest receipt/current-state PACK090 allowance mismatch');",
  'validator receipt PACK090 gate'
);
validator = replaceOnce(
  validator,
  "expect(c.pack090_allowed === false, 'MASTER_STATE unexpectedly allows PACK090');",
  "expect(c.pack090_allowed === active.pack090_allowed, 'MASTER_STATE/current-state pack090_allowed mismatch');",
  'validator master-state PACK090 gate'
);
validator = replaceOnce(
  validator,
  "  'PACK089',\n  '89E_PRODUCTION_ACCEPTANCE',",
  "  active.pack,\n  active.phase,",
  'validator matrix active markers'
);
write(validatorPath, validator);

// Refresh manifest last so its integrity hashes represent the final working tree.
const manifestPath = 'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json';
const manifest = readJson(manifestPath);
manifest.updated_at = NOW;
manifest.created_from_git_head = SOURCE_MAIN;
manifest.active_work = JSON.parse(JSON.stringify(current.active_work));
manifest.pack089_final_acceptance = acceptance;
if (manifest.infrastructure) {
  manifest.infrastructure.railway_services_latest_status = 'SUCCESS_ON_MAIN_' + SOURCE_MAIN.toUpperCase();
  manifest.infrastructure.railway_pending_work = 0;
  manifest.infrastructure.railway_backend_deployment = acceptance.railway_backend_deployment;
  manifest.infrastructure.vercel_current_production_deployment = acceptance.vercel_production_deployment;
  manifest.infrastructure.vercel_current_production_source_sha = SOURCE_MAIN;
  manifest.infrastructure.vercel_current_production_status = 'READY';
  manifest.infrastructure.vercel_build_rate_limit_current_gate = false;
  manifest.infrastructure.vercel_build_rate_limit_resolution = 'CLOSED_BY_FRESH_EXACT_MAIN_READY_PRODUCTION_DEPLOYMENT_2026_09_26';
}
manifest.last_reconciled_git_head_before_manifest_update = SOURCE_MAIN;
manifest.current_state_override.blob_sha = blobSha(read(currentPath));
manifest.canonical_files_snapshot = manifest.canonical_files_snapshot || {};
for (const rel of [
  'ZUVYR_CONTINUE_HERE.md',
  'ZUVYR_MASTER_STATE.json',
  'ZUVYR_MASTER_MATRIX.md',
  'docs/zuvyr/ZUVYR_V1_COMPLETE_MASTER_PLAN.md',
  'docs/zuvyr/ROADMAP_150.md'
]) manifest.canonical_files_snapshot[rel] = blobSha(read(rel));
manifest.integrity_guard_files = manifest.integrity_guard_files || {};
for (const rel of [
  'tools/validate-zuvyr-continuity.cjs',
  '.github/workflows/zuvyr-continuity.yml',
  'tools/verify-zuvyr-continuity.js',
  'package.json'
]) manifest.integrity_guard_files[rel] = blobSha(read(rel));
writeJson(manifestPath, manifest);

// Final consistency assertions before the workflow commits anything.
const reCurrent = readJson(currentPath);
const reManifest = readJson(manifestPath);
const reMaster = readJson(masterStatePath);
if (reCurrent.active_work.pack_status !== 'LOCKED_VERIFIED') throw new Error('current override PACK089 not locked');
if (reCurrent.active_work.phase_status !== 'LOCKED_VERIFIED') throw new Error('current override 89E not locked');
if (reCurrent.active_work.pack090_allowed !== true) throw new Error('current override did not allow PACK090');
if (reManifest.active_work.pack090_allowed !== true) throw new Error('manifest did not allow PACK090');
if (reMaster.continuity_capsule.pack090_allowed !== true) throw new Error('MASTER_STATE did not allow PACK090');
if (!fs.existsSync(abs(FINAL_RECEIPT))) throw new Error('final receipt missing');
console.log('PACK089_FINALIZER_APPLIED');
console.log(JSON.stringify({
  source_main: SOURCE_MAIN,
  receipt: FINAL_RECEIPT,
  pack089: 'LOCKED_VERIFIED',
  pack090_allowed: true,
  next: 'PACK090 fresh universal-browser gap audit'
}, null, 2));
