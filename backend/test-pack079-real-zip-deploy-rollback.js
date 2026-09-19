'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const {
  projectFromVersion,
  projectFilesDigest,
  buildReleaseZip,
  verifyReleaseZip
} = require('./lib/codeReleaseZip');
const {
  createVercelDeploymentProvider,
  deploymentAvailability,
  deploymentFilesFromZip
} = require('./lib/codeVercelDeploymentProvider');
const {
  publicPolicy
} = require('./lib/permissionCenterPolicy');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const migration = read('79_pack079_real_zip_deploy_rollback.sql');
const routes = read('lib/codeReleaseRoutes.js');
const repository = read('lib/codeReleaseRepository.js');
const studioRoutes = read('lib/codeStudioRoutes.js');
const studioConfig = require('./config/code-studio.v1.json');
const releaseConfig = require('./config/code-release.v1.json');

function count(source, value) {
  return source.split(value).length - 1;
}

for (const marker of [
  'create table if not exists public.code_release_validations',
  'create table if not exists public.code_release_artifacts',
  'create table if not exists public.code_deployment_targets',
  'create table if not exists public.code_deployment_rollbacks',
  'deployment_target_id uuid',
  'alter table public.code_release_validations enable row level security',
  'alter table public.code_release_artifacts enable row level security',
  'alter table public.code_deployment_targets enable row level security',
  'alter table public.code_deployment_rollbacks enable row level security',
  'reserve_zuvyr_code_release_validation_pack079',
  'record_zuvyr_code_release_artifact_pack079',
  'reserve_zuvyr_code_deploy_request_pack079',
  'transition_zuvyr_code_deploy_request_pack079',
  'reserve_zuvyr_code_deployment_rollback_pack079',
  'transition_zuvyr_code_deployment_rollback_pack079',
  'deploy.rollback',
  'permission.deploy.rollback.v1'
]) {
  assert(migration.includes(marker), marker);
}

for (const fn of [
  'reserve_zuvyr_code_release_validation_pack079',
  'record_zuvyr_code_release_artifact_pack079',
  'reserve_zuvyr_code_deploy_request_pack079',
  'transition_zuvyr_code_deploy_request_pack079',
  'reserve_zuvyr_code_deployment_rollback_pack079',
  'transition_zuvyr_code_deployment_rollback_pack079',
  'create_zuvyr_permission_grant'
]) {
  assert.equal(
    count(migration, 'create or replace function public.' + fn + '('),
    1,
    fn + ' must exist exactly once'
  );
}

assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));

const deployStart=migration.indexOf('create or replace function public.reserve_zuvyr_code_deploy_request_pack079(');
const deployEnd=migration.indexOf('create or replace function public.transition_zuvyr_code_deploy_request_pack079(',deployStart);
const deployFn=migration.slice(deployStart,deployEnd);
assert(deployFn.includes('p_deployment_target_id uuid'));
assert(!deployFn.includes('p_provider_project_id text'));
assert(deployFn.includes("v_target = any(v_deployment_target.allowed_targets)"));

const rollbackStart=migration.indexOf('create or replace function public.reserve_zuvyr_code_deployment_rollback_pack079(');
const rollbackEnd=migration.indexOf('create or replace function public.transition_zuvyr_code_deployment_rollback_pack079(',rollbackStart);
const rollbackFn=migration.slice(rollbackStart,rollbackEnd);
assert(!rollbackFn.includes('p_rollback_to_provider_deployment_id'));
assert(rollbackFn.includes('v_deploy.previous_production_deployment_id'));

assert.equal(studioConfig.version,'pack-079.code-studio.v1');
assert.equal(studioConfig.capabilities.export_zip.enabledByDefault,true);
assert.equal(studioConfig.capabilities.export_zip.status,'implemented_pack079');
assert.equal(studioConfig.capabilities.deploy.enabledByDefault,false);
assert.equal(studioConfig.capabilities.deploy.status,'pack079_implemented_live_deferred_m16');

assert.equal(releaseConfig.deploy.externalGate,'M16');
assert.equal(releaseConfig.deploy.liveEnabledByDefault,false);
assert.equal(releaseConfig.deploy.rawClientApprovalReceiptAccepted,false);

const permissions=publicPolicy();
assert.deepEqual(permissions.actions['deploy.execute'].modes,['allow_once']);
assert.deepEqual(permissions.actions['deploy.rollback'].modes,['allow_once']);
assert.equal(permissions.actions['deploy.rollback'].risk,'critical');
assert.equal(permissions.actions['deploy.rollback'].maxGrantSeconds,600);

for(const marker of [
  'getValidationInternal',
  'getDeployByRequest',
  'getRollbackByRequest',
  'getDeploymentTargetInternal',
  'listDeploymentTargets'
]) assert(repository.includes(marker),marker);

for(const marker of [
  "router.post('/projects/:projectId/releases/:versionId/validate'",
  "router.post('/projects/:projectId/releases/:versionId/artifacts'",
  "router.get('/release-artifacts/:artifactId/download'",
  "router.post('/projects/:projectId/deployments'",
  "router.post('/deployments/:deployRequestId/rollback'",
  'guardDeploymentBeforeExecution',
  'guardDeploymentRollbackBeforeExecution',
  'assertDeploymentLive(env)',
  'assertProviderCredentials(env)',
  'deploymentTargetId',
  'previous_production_deployment_id'
]) assert(routes.includes(marker),marker);

assert(studioRoutes.includes('createCodeReleaseRouter'));
assert(studioRoutes.includes('pack079:'));
assert(studioRoutes.includes("explicitRollbackPermission: 'deploy.rollback'"));

const assetId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const versionId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const projectId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const assetBytes=Buffer.from([0,1,2,3,4,5,250,251,252,253]);
const assetSha=require('node:crypto').createHash('sha256').update(assetBytes).digest('hex');

const reference=JSON.stringify({
  schema_version:'pack049.code-asset-reference.v1',
  canonical_content_id:contentId,
  canonical_version_id:versionId,
  asset_ids:[assetId]
});

const version={
  id:versionId,
  snapshot:{
    name:'Pack079 deterministic test',
    entryFile:'index.html',
    files:[
      {path:'index.html',content:'<!doctype html><h1>ZUVYR</h1>',language:'html'},
      {path:'.zuvyr/assets/hero.json',content:reference,language:'json'}
    ]
  }
};

const project=projectFromVersion(version);
const validation={
  snapshot_sha256:'f'.repeat(64),
  files_digest:projectFilesDigest(project)
};

const assetRow={
  id:assetId,
  owner_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  canonical_content_id:contentId,
  canonical_version_id:versionId,
  storage_bucket:'zuvyr-assets',
  storage_path:'owner/project/hero.png',
  mime_type:'image/png',
  file_size_bytes:assetBytes.length,
  sha256:assetSha,
  status:'active',
  metadata:{originalName:'hero.png'},
  deleted_at:null
};

function fakeQuery(rows){
  return {
    select(){return this;},
    eq(){return this;},
    in(){return this;},
    is(){return this;},
    then(resolve,reject){
      return Promise.resolve({data:rows,error:null}).then(resolve,reject);
    }
  };
}

const fakeDb={
  from(table){
    assert.equal(table,'zuvyr_assets');
    return fakeQuery([assetRow]);
  },
  storage:{
    from(bucket){
      assert.equal(bucket,'zuvyr-assets');
      return {
        async download(storagePath){
          assert.equal(storagePath,'owner/project/hero.png');
          return {
            data:{
              async arrayBuffer(){
                return assetBytes.buffer.slice(
                  assetBytes.byteOffset,
                  assetBytes.byteOffset+assetBytes.byteLength
                );
              }
            },
            error:null
          };
        }
      };
    }
  }
};

(async()=>{
  const ownerId=assetRow.owner_id;
  const first=await buildReleaseZip({
    db:fakeDb,
    ownerId,
    projectId,
    version,
    validation
  });
  const second=await buildReleaseZip({
    db:fakeDb,
    ownerId,
    projectId,
    version,
    validation
  });

  assert.equal(first.archiveSha256,second.archiveSha256);
  assert.equal(first.manifestSha256,second.manifestSha256);
  assert.equal(first.assetCount,1);
  assert.equal(first.fileCount,2);
  assert.equal(first.verifiedReopen,true);

  const verified=await verifyReleaseZip(first.archive,{
    archiveSha256:first.archiveSha256,
    manifestSha256:first.manifestSha256
  });
  assert.equal(verified.verified,true);

  const reopened=await JSZip.loadAsync(first.archive,{checkCRC32:true});
  assert(reopened.file('index.html'));
  assert(reopened.file('.zuvyr/assets/hero.json'));
  const binaryPath=Object.keys(reopened.files).find(name=>name.endsWith('/hero.png'));
  assert(binaryPath);
  const binary=await reopened.file(binaryPath).async('nodebuffer');
  assert.equal(binary.toString('hex'),assetBytes.toString('hex'));

  const manifestText=await reopened.file('zuvyr-release-manifest.json').async('string');
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.projectVersionId,versionId);
  assert.equal(manifest.assets[0].sha256,assetSha);
  assert(!/preview[_-]?token/i.test(manifestText));
  assert(!/sandbox[_-]?session/i.test(manifestText));
  assert(!/service[_-]?role/i.test(manifestText));
  assert(!/vercel[_-]?token/i.test(manifestText));

  const deployFiles=await deploymentFilesFromZip(first.archive);
  assert(deployFiles.some(file=>file.file==='index.html'));
  assert(deployFiles.some(file=>file.file===binaryPath));
  assert(!deployFiles.some(file=>file.file==='zuvyr-release-manifest.json'));

  const gatedEnv={
    VERCEL_TOKEN:'test-token',
    VERCEL_TEAM_ID:'team_test',
    ZUVYR_M16_VERIFIED:'true'
  };
  assert.equal(deploymentAvailability(gatedEnv).live,false);
  assert(deploymentAvailability(gatedEnv).blockers.includes('pack079_source_live_gate_closed'));

  let networkCalls=0;
  const fetchImpl=async(url,options={})=>{
    networkCalls++;
    assert(String(url).includes('/rollback/'));
    assert.equal(options.method,'POST');
    return {
      ok:true,
      status:201,
      headers:{get:()=>''},
      text:async()=>''
    };
  };
  const provider=createVercelDeploymentProvider({
    fetchImpl,
    env:gatedEnv,
    sleep:async()=>{}
  });

  await assert.rejects(
    ()=>provider.createPreviewDeployment({
      providerProjectId:'prj_test',
      archive:first.archive,
      artifactSha256:first.archiveSha256,
      versionId
    }),
    error=>error.code==='pack079_deploy_live_gate_closed'
  );
  assert.equal(networkCalls,0,'M16/source gate must block before provider network calls');

  const rolled=await provider.rollback({
    providerProjectId:'prj_test',
    deploymentId:'dpl_abcdef123456',
    description:'test rollback'
  });
  assert.equal(rolled.rolledBack,true);
  assert.equal(networkCalls,1,'Emergency rollback remains available with credentials');

  console.log('PASS: Pack079 builds deterministic real ZIP bytes with canonical referenced assets');
  console.log('PASS: Pack079 reopens and verifies archive + manifest hashes before receipts');
  console.log('PASS: Pack079 deployment targets and rollback targets are server-authoritative');
  console.log('PASS: Pack079 deploy and rollback permissions are critical allow-once');
  console.log('PASS: Pack079 live deploy gate makes zero provider calls while M16/source gate is closed');
  console.log('LIVE DEPLOY / PAYMENT CALLS: NONE');
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
