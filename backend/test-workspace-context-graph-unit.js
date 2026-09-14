'use strict';
const assert = require('assert');
const {
  GRAPH_TYPES,
  normalizeQuery,
  createWorkspaceContextGraphStore
} = require('./lib/workspaceContextGraphRepository');

assert(GRAPH_TYPES.has('project'));
assert(GRAPH_TYPES.has('decision'));
assert(GRAPH_TYPES.has('connection'));

assert.deepStrictEqual(
  normalizeQuery({q:' launch ',types:'project,decision',limit:999,depth:9}),
  {q:'launch',projectId:null,types:['project','decision'],limit:100,depth:3}
);

assert.deepStrictEqual(
  normalizeQuery({},'manager').types,
  ['project','task','deployment','connection','decision']
);

assert.throws(
  ()=>normalizeQuery({types:'project,forbidden'}),
  e=>e.code==='workspace_context_graph_input_invalid'
);

const calls=[];
const db={
  rpc: async (name,args)=>{
    calls.push([name,args]);
    if(name==='refresh_zuvyr_context_graph') return {data:{nodes:2,edges:1},error:null};
    if(name==='retrieve_zuvyr_context_graph') return {
      data:{ownerScoped:true,scanScope:'owner_indexed_graph',nodes:[],edges:[]},
      error:null
    };
    return {data:null,error:new Error('unexpected')};
  }
};

(async()=>{
  const store=createWorkspaceContextGraphStore(db);
  const out=await store.getBrainContext('11111111-1111-4111-8111-111111111111',{q:'decision'});
  assert.strictEqual(out.mode,'brain');
  assert.strictEqual(out.owner_scoped,true);
  assert.strictEqual(out.unrelated_user_scan,false);
  assert.strictEqual(calls[0][0],'refresh_zuvyr_context_graph');
  assert.strictEqual(calls[1][0],'retrieve_zuvyr_context_graph');
  console.log('PASS');
})().catch(e=>{console.error(e);process.exit(1)});
