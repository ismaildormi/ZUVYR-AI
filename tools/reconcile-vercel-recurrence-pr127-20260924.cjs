'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const HEAD = 'b7f3baa70cd2705e5defcf70f486fd4d6e055b31';
const MAIN = 'f1886d5cd9a9a3a6d56c0cc8a83daf80fb6a47ea';
const PROD = 'dpl_DEhSnxP5pC5JUeZmaKhgHRN9nbeU';
const PR = 127;
const observedAt = new Date().toISOString();

function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,v); }
function json(p){ return JSON.parse(read(p)); }
function writeJson(p,v){ write(p, JSON.stringify(v,null,2)+'\n'); }
function blobSha(text){ const b=Buffer.from(text,'utf8'); return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex'); }
function replaceOrFail(text, from, to, label){ if(!text.includes(from)) throw new Error(`missing anchor ${label}`); return text.replace(from,to); }

const receiptPath='zuvyr-pack-evidence/pack-089/2026-09-24-89e-post-merge-owner-acceptance-ready/receipt.json';
const receipt=json(receiptPath);
receipt.observed_at=observedAt;
receipt.evidence.vercel = {
  production_status: 'READY',
  production_target: 'production',
  production_deployment_id: PROD,
  production_github_commit_sha: MAIN,
  production_runtime_reachable: true,
  latest_pr_number: PR,
  latest_pr_head_sha: HEAD,
  latest_pr_vercel_status: 'FAILURE_BUILD_RATE_LIMIT',
  latest_pr_vercel_target_url: 'https://vercel.com/rox-ai?upgradeToPro=build-rate-limit',
  interpretation: 'Production is healthy on exact merged main, but fresh deployment evidence is externally blocked again for PR127. Do not classify the quota/cooldown issue as permanently closed.'
};
receipt.evidence.rw_016_visual_qa='CLOSED_WITH_POST_MERGE_EVIDENCE';
receipt.evidence.rw_018_vercel_build_rate_limit='BLOCKED_EXTERNAL_MONITOR_RECURRED_ON_PR127';
receipt.interpretation.vercel_production_runtime_gate='PASS';
receipt.interpretation.vercel_new_deployment_evidence_gate='BLOCKED_EXTERNAL_BUILD_RATE_LIMIT';
writeJson(receiptPath, receipt);

const statePath='docs/zuvyr/ZUVYR_CURRENT_STATE_OVERRIDE_2026-09-23.json';
const state=json(statePath);
state.updated_at=observedAt;
state.infrastructure.vercel_current_production_reachable=true;
state.infrastructure.vercel_current_production_deployment=PROD;
state.infrastructure.vercel_current_production_source_sha=MAIN;
state.infrastructure.vercel_current_production_status='READY';
state.infrastructure.vercel_build_rate_limit_current_gate=true;
state.infrastructure.vercel_build_rate_limit_resolution='RECURRED_ON_PR127_HEAD_AFTER_PRODUCTION_RECOVERY';
state.infrastructure.vercel_latest_pr={
  pr: PR,
  head_sha: HEAD,
  status: 'FAILURE_BUILD_RATE_LIMIT',
  production_impact: 'NONE_OBSERVED',
  classification: 'BLOCKED_EXTERNAL_DEPLOYMENT_EVIDENCE'
};
if(state.reconciled_prior_pack_hardening?.level3_postmerge_2026_09_24){
  state.reconciled_prior_pack_hardening.level3_postmerge_2026_09_24.rw_016='CLOSED';
  state.reconciled_prior_pack_hardening.level3_postmerge_2026_09_24.rw_018='BLOCKED_EXTERNAL_MONITOR_RECURRED_ON_PR127';
}
state.known_unresolved_gates=(state.known_unresolved_gates||[]).filter(x=>!/Vercel Git build-rate-limit/i.test(String(x)));
state.known_unresolved_gates.push('Vercel Git build-rate-limit recurred on PR #127 head while exact production main remains READY; wait for quota/cooldown recovery and require a fresh green deployment check before closing RW-018 permanently.');
writeJson(statePath,state);

const masterPath='ZUVYR_MASTER_STATE.json';
const master=json(masterPath);
master.continuity_capsule.updated_at='2026-09-24';
writeJson(masterPath,master);

let matrix=read('ZUVYR_MASTER_MATRIX.md');
matrix=replaceOrFail(matrix,'| Vercel cooldown / RW-018 | **CLOSED — exact production READY** |','| Vercel production | **READY on exact main `'+MAIN+'`** |\n| Vercel fresh deploy evidence / RW-018 | **BLOCKED_EXTERNAL / MONITOR — rate limit recurred on PR #127** |','matrix rw018');
write('ZUVYR_MASTER_MATRIX.md',matrix);

let cont=read('ZUVYR_CONTINUE_HERE.md');
cont=replaceOrFail(cont,'- Vercel cooldown/build-rate-limit gate is **CLOSED**: production deployment `'+PROD+'` is READY on exact main `'+MAIN+'`.','- Vercel production remains **READY** on deployment `'+PROD+'` at exact main `'+MAIN+'`. Fresh PR #127 deployment evidence is **BLOCKED_EXTERNAL / MONITOR** because the Vercel build-rate-limit recurred on head `'+HEAD+'`; production impact is none observed.','continue vercel');
cont=replaceOrFail(cont,'- Post-merge Visual QA is **PASS** (run `36067370611`, artifact `10836762121`): 24 fixture views + 26 native screens, zero overflow/missing views/duplicate IDs/console errors, zero critical/serious/moderate accessibility violations, public production HTTP 200. RW-016 and RW-018 are closed by evidence.','- Post-merge Visual QA is **PASS** (run `36067370611`, artifact `10836762121`): 24 fixture views + 26 native screens, zero overflow/missing views/duplicate IDs/console errors, zero critical/serious/moderate accessibility violations, public production HTTP 200. RW-016 is CLOSED; RW-018 remains an external deployment-evidence monitor because the Vercel rate limit recurred on PR #127.','continue visual');
write('ZUVYR_CONTINUE_HERE.md',cont);

let rw=read('docs/zuvyr/ZUVYR_REMAINING_WORK.md');
const old=/### RW-018 — Vercel Git build-rate-limit blocks all-green deployment evidence[\s\S]*?(?=\n## Rules for future additions)/;
if(!old.test(rw)) throw new Error('missing RW-018 block');
const block=`### RW-018 — Vercel Git build-rate-limit blocks all-green deployment evidence\nStatus: \`BLOCKED_EXTERNAL / ACTIVE MONITOR\`\nSubsystem: \`Vercel Git integration / Level 3 production deployment evidence\`\n\nCurrent evidence:\n- exact production deployment \`${PROD}\` is **READY** on merged main \`${MAIN}\`; public production remains reachable;\n- the build-rate-limit temporarily recovered and allowed that production deployment;\n- fresh PR #127 head \`${HEAD}\` then received GitHub Vercel status **failure** with \`upgradeToPro=build-rate-limit\`;\n- therefore the provider quota/cooldown is not permanently resolved, even though current production is healthy;\n- RW-016 Visual QA remains CLOSED because it is backed by a successful post-merge production run and this docs/test PR does not change frontend runtime code.\n\nRequired before permanent closure:\n- wait for Vercel quota/cooldown to permit a fresh deployment again;\n- obtain a green Vercel status on the then-current relevant head/main;\n- verify exact deployment SHA/identity is READY and production probe remains healthy;\n- keep Git deployment safety intact; do not disable the integration merely to hide a red status.\n\nThis is an external deployment-evidence blocker, not evidence of a current ZUVYR frontend outage.\n\n`;
rw=rw.replace(old,block);
write('docs/zuvyr/ZUVYR_REMAINING_WORK.md',rw);

const manifestPath='docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json';
const manifest=json(manifestPath);
manifest.updated_at=observedAt;
manifest.active_work=JSON.parse(JSON.stringify(state.active_work));
if(manifest.recent_reconciled_hardening?.level3_postmerge_2026_09_24){
  manifest.recent_reconciled_hardening.level3_postmerge_2026_09_24.rw_016='CLOSED';
  manifest.recent_reconciled_hardening.level3_postmerge_2026_09_24.rw_018='BLOCKED_EXTERNAL_MONITOR_RECURRED_ON_PR127';
}
manifest.current_state_override.blob_sha=blobSha(read(statePath));
for(const rel of Object.keys(manifest.canonical_files_snapshot||{})) manifest.canonical_files_snapshot[rel]=blobSha(read(rel));
writeJson(manifestPath,manifest);

console.log(JSON.stringify({status:'PR127_VERCEL_RECURRENCE_RECONCILED',production:'READY',rw016:'CLOSED',rw018:'BLOCKED_EXTERNAL_MONITOR',pack090_allowed:false},null,2));
