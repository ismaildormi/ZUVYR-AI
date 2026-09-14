'use strict';

const assert = require('assert');
const {
  normalizeAction,
  compareVersionRecords,
  createUniversalActionsStore
} = require('./lib/universalActionsRepository');

assert.equal(normalizeAction('Translate'), 'translate');
assert.throws(() => normalizeAction('deploy'), /workspace_universal_action_invalid/);

const comparison = compareVersionRecords(
  { id:'v1', version_number:1, sha256:'a', uri:'u', mime_type:'text/plain', payload:{a:1,b:2}, provenance:{p:1} },
  { id:'v2', version_number:2, sha256:'b', uri:'u', mime_type:'text/plain', payload:{a:1,b:3,c:4}, provenance:{p:1,q:2} }
);
assert.equal(comparison.sha256_changed, true);
assert.deepEqual(comparison.payload_changed_keys, ['b','c']);
assert.deepEqual(comparison.provenance_changed_keys, ['q']);

const calls = [];
const client = {
  rpc: async (name,args) => {
    calls.push({name,args});
    return { data:{success:true,replayed:false,action_id:'a1',status:'completed',result:args.p_result || {
      schema_version:'pack049.universal-handoff.v1',
      destination:'code',
      affected_file_ids:['f1'],
      canonical_content_id:'c1',
      canonical_version_id:'v2'
    }}, error:null };
  },
  from: () => ({
    select(){return this}, eq(){return this}, maybeSingle: async()=>({data:{id:'a1'},error:null})
  })
};
const libraryStore = {
  getItem: async () => ({
    id:'c1', current_version_id:'v2', project_id:null, source_kind:'generated',
    source_system:'image', source_id:'g1', model:'m', provider:'p',
    assets:[{id:'asset1',status:'active'}],
    versions:[{id:'v2',version_number:2,payload:{},provenance:{source:'test'}}]
  }),
  createSendTo: async ({destination}) => ({
    schema_version:'pack044.library-handoff.v1',
    destination,
    canonical_content_id:'c1',
    canonical_version_id:'v2',
    project_id:null,
    kind:'image',
    title:'Image',
    asset_ids:['asset1'],
    provenance:{source_system:'image'},
    upload_required:false,
    reuse_mode:'canonical_reference'
  })
};

(async()=>{
  const store=createUniversalActionsStore({client,libraryStore});

  const action=await store.createContextAction({ownerId:'o1',contentId:'c1',action:'verify',requestId:'r1'});
  assert.equal(action.action_id,'a1');
  assert.equal(calls.at(-1).name,'create_zuvyr_universal_action');
  assert.equal(calls.at(-1).args.p_destination,'research');

  const preflight=await store.sendTo({ownerId:'o1',contentId:'c1',destination:'code'});
  assert.equal(preflight.persisted,false);
  assert.equal(preflight.requires.project_write_permission,true);

  await store.sendTo({
    ownerId:'o1',contentId:'c1',destination:'code',codeProjectId:'cp1',
    sessionId:'s1',requestId:'r2'
  });
  assert.equal(calls.at(-1).name,'execute_zuvyr_code_asset_handoff');
  assert.equal(calls.at(-1).args.p_code_project_id,'cp1');

  await store.sendTo({ownerId:'o1',contentId:'c1',destination:'video',requestId:'r3'});
  assert.equal(calls.at(-1).name,'create_zuvyr_universal_action');
  assert.equal(calls.at(-1).args.p_result.canonical_content_id,'c1');
  assert.equal(calls.at(-1).args.p_result.canonical_version_id,'v2');

  console.log('PASS: Pack049 context actions normalize and route through canonical references');
  console.log('PASS: Asset→Code requires project+permission context before persistence');
  console.log('PASS: Image→Video style handoff preserves canonical content/version IDs');
  console.log('PASS: version compare is deterministic and side-effect free');
})().catch(error=>{console.error(error);process.exit(1)});
