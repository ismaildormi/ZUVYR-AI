'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeSpecializedMode,
  buildSpecializedQuery,
  decorateExternalGrounding,
  connectedResearchFromGraph,
  buildSpecializedEvidenceContext
} = require('./lib/specializedResearchEngine');

assert.equal(normalizeSpecializedMode('shopping'),'shopping');
assert.match(buildSpecializedQuery({mode:'shopping',query:'laptop'}),/price availability/i);
assert.match(buildSpecializedQuery({mode:'local_research',query:'coffee in Agadir'}),/opening hours/i);
assert.throws(()=>normalizeSpecializedMode('other'), e=>e.code==='invalid_specialized_research_mode');

const shopping = decorateExternalGrounding('shopping',{
  evidence:'current evidence',
  sources:[{type:'web',title:'Store',url:'https://store.example/item',snippet:'listed'}],
  usage:{server_tool_use:{web_search_requests:1}}
});
assert.equal(shopping.sources[0].type,'product');
assert.equal(shopping.sources[0].metadata.researchMode,'shopping');

const memoryId='11111111-1111-4111-8111-111111111111';
const connected=connectedResearchFromGraph({
  owner_scoped:true,
  unrelated_user_scan:false,
  bounded:true,
  nodes:[
    {id:'22222222-2222-4222-8222-222222222222',type:'memory',entityId:memoryId,label:'Preference',summary:'Prefers concise reports'},
    {id:'33333333-3333-4333-8333-333333333333',type:'connection',entityId:'drive',label:'Drive foundation',summary:'OAuth not executed'}
  ]
});
assert.equal(connected.ownerScoped,true);
assert.equal(connected.sources.length,1);
assert.equal(connected.sources[0].externalId,memoryId);
assert.match(buildSpecializedEvidenceContext({mode:'connected_research',connected,responseSources:connected.sources}),/owner-scoped/i);

const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
for(const marker of [
  "chatMode === 'shopping'",
  "chatMode === 'local_research'",
  "chatMode === 'connected_research'",
  'decorateExternalGrounding(chatMode, webGrounding)',
  'getDefaultWorkspaceContextGraphStore()',
  'owner_scoped_connected',
  'externalWebEnabled'
]) assert(server.includes(marker),`Missing Pack057 server marker: ${marker}`);

const config=require('./config/chat-system.v1.json');
for(const mode of ['shopping','local_research','connected_research']){
  assert.equal(config.modes[mode].enabledByDefault,true);
  assert.equal(config.modes[mode].status,'live_verified');
}
const plans=require('./config/plans.json');
for(const mode of ['shopping','local_research','connected_research']){
  assert.equal(plans.tiers.plus.features[mode],false);
  assert.equal(plans.tiers.pro.features[mode],true);
}
const flags=require('./config/feature-flags.json');
for(const mode of ['shopping','local_research','connected_research']){
  assert.equal(flags[mode].enabled,true);
  assert.equal(flags[mode].status,'live_verified');
}
console.log('PASS: Pack057 shopping/local/connected research uses bounded Pack055 web evidence or owner-scoped ZUVYR context, Pro entitlements and durable source-compatible citations');
