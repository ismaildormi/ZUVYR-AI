import test from 'node:test';
import assert from 'node:assert/strict';
import {characters,skins,boards,packs,initialSave,normalizeSave,unlock,equip,tickMission,GameSimulation} from './engine.mjs';
test('V2 has eight original heroes, distinct skins, boards and three local packs',()=>{
  assert.equal(characters.length,8);assert.equal(new Set(characters.map(x=>x.id)).size,8);
  assert.equal(skins.length,14);assert.equal(boards.length,4);assert.equal(packs.length,3);
  for(const p of packs)for(const id of p.items)assert.ok(skins.some(x=>x.id===id)||boards.some(x=>x.id===id));
});
test('demo-only pack is atomic, sanitized and never charges twice',()=>{
  let s=initialSave();const bought=unlock(s,'pack_city_glow');assert.equal(bought.ok,true);
  assert.equal(bought.save.credits,110);assert.deepEqual(bought.save.owned.sort(),['cobalt','comet_board','coral']);
  assert.equal(unlock(bought.save,'pack_city_glow').save.credits,110);
  assert.equal(unlock(s,'unknown').ok,false);
  assert.equal(unlock({...s,credits:5},'pack_city_glow').ok,false);
  assert.equal(equip(s,'board','comet_board').board,'classic');
  assert.equal(equip(bought.save,'board','comet_board').board,'comet_board');
  const forged=normalizeSave({...bought.save,owned:['cobalt','premium_festival','comet_board'],credits:Infinity});
  assert.deepEqual(forged.owned,['cobalt','comet_board']);assert.equal(forged.credits,0);
});
test('preview-stage outfit gates and language-safe save fallback',()=>{
  let s=initialSave();assert.equal(equip(s,'skin','storm').skin,'teal');
  s=normalizeSave({...s,stage:5});assert.equal(equip(s,'skin','storm').skin,'storm');
  assert.equal(normalizeSave({version:1,credits:1e9}).credits,360);
});
test('mission group increments and cap is thirty',()=>{
  let m={group:0,jumps:0,dodges:0,coins:0};
  for(let i=0;i<15;i++)m=tickMission(m,'jump');
  for(let i=0;i<10;i++)m=tickMission(m,'dodge');
  for(let i=0;i<100;i++)m=tickMission(m,'coin');
  assert.deepEqual(m,{group:1,jumps:0,dodges:0,coins:0});
  assert.equal(tickMission({group:29,jumps:15,dodges:10,coins:100},'coin').group,29);
});
test('initial speed 9m/s and 3% after each hundred metres',()=>{
  const sim=new GameSimulation(initialSave(),()=>0);
  sim.start();sim.nextSpawn=100000;sim.distance=100;
  sim.step(.01);assert.ok(Math.abs(sim.speed-9*1.03)<1e-8);
  sim.distance=2000;sim.step(.01);assert.ok(Math.abs(sim.speed-9*Math.pow(1.03,20))<1e-8);
});
test('safe-lane coin and dodge, jump over low obstacle, direct blocker fall',()=>{
  const sim=new GameSimulation(initialSave(),()=>0);sim.start();
  sim.nextSpawn=100000;sim.events=[{kind:'coin',lane:1,at:1,done:false},{kind:'low',lane:1,at:1.5,done:false}];
  sim.input('jump');sim.step(.25);assert.equal(sim.coins,1);assert.equal(sim.state,'running');
  sim.events=[{kind:'block',lane:1,at:sim.distance+.5,done:false}];sim.step(.1);
  assert.equal(sim.state,'ended');
  const a=sim.finish(),b=sim.finish();assert.equal(a.credits,b.credits);
});
