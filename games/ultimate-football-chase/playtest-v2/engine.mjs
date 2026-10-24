// V2 browser playtest. Independent of Unity saves, Firebase and account currency.
export const characters = [
  { id:'kivo', name:'كيفو', role:'المراوغ', emblem:'◆', accent:'#ffc75b', silhouette:'cap' },
  { id:'mira', name:'ميرا', role:'الحارسة', emblem:'✦', accent:'#67c9f2', silhouette:'guard' },
  { id:'selo', name:'سيلو', role:'السريع', emblem:'↗', accent:'#ff7388', silhouette:'scarf' },
  { id:'nexa', name:'نيكسا', role:'راصدة النجوم', emblem:'✳', accent:'#bd9aff', silhouette:'visor' },
  { id:'taro', name:'تارو', role:'المستكشف', emblem:'⌁', accent:'#ffa66a', silhouette:'crest' },
  { id:'lumi', name:'لومي', role:'المخترعة', emblem:'◈', accent:'#88eab1', silhouette:'lens' },
  { id:'vora', name:'فورا', role:'الدينامو', emblem:'⚡', accent:'#ee83c4', silhouette:'horns' },
  { id:'ziri', name:'زيري', role:'الحالم', emblem:'☾', accent:'#70d9d7', silhouette:'halo' },
];
export const skins = [
  { id:'teal', name:'توركواز', color:'#35d5b7', stage:0 },
  { id:'amber', name:'عنبر', color:'#f6b74f', stage:0 },
  { id:'violet', name:'بنفسج', color:'#9e83ee', stage:0 },
  { id:'storm', name:'عاصفة', color:'#647da9', stage:5 },
  { id:'dawn', name:'شروق', color:'#ff9566', stage:10 },
  { id:'ember', name:'جمر', color:'#f56360', stage:15 },
  { id:'lagoon', name:'لاجون', color:'#34b9c8', stage:20 },
  { id:'rose', name:'وردة', color:'#e88dae', stage:25 },
  { id:'cobalt', name:'كوبالت', color:'#558bfc', price:75 },
  { id:'coral', name:'مرجان', color:'#ff796e', price:100 },
  { id:'mint', name:'نعناع', color:'#a0efd1', price:125 },
  { id:'aurora', name:'شفق', color:'#85dce2', price:145 },
  { id:'pearl', name:'لؤلؤ', color:'#e0cce8', price:165 },
  { id:'nightfall', name:'ليل', color:'#56689b', price:180 },
];
export const boards = [
  { id:'classic', name:'لوح البداية', color:'#ffd362', price:0 },
  { id:'comet_board', name:'لوح المذنّب', color:'#ffa34e', price:130 },
  { id:'lantern_board', name:'لوح الفانوس', color:'#c096fb', price:155 },
  { id:'ripple_board', name:'لوح الموج', color:'#66e2d2', price:185 },
];
export const packs = [
  { id:'pack_city_glow', name:'باقة أضواء المدينة', price:250, items:['cobalt','coral','comet_board'], tone:'#fdab67' },
  { id:'pack_celestial', name:'باقة السماء', price:290, items:['mint','aurora','lantern_board'], tone:'#a79dfd' },
  { id:'pack_moonrise', name:'باقة طلوع القمر', price:325, items:['pearl','nightfall','ripple_board'], tone:'#80e2d9' },
];
const item = id => skins.find(x=>x.id===id) || boards.find(x=>x.id===id);
export const initialSave = () => ({ version:2, credits:360, stage:0, best:0, character:'kivo', skin:'teal', board:'classic', owned:[], packs:[], mission:{group:0,jumps:0,dodges:0,coins:0} });
export function normalizeSave(raw) {
  const s=initialSave();
  if (!raw || raw.version!==2) return s;
  s.credits=clampInt(raw.credits,0,100000);
  s.stage=clampInt(raw.stage,0,1000);
  s.best=clampInt(raw.best,0,1000000000);
  s.owned=Array.isArray(raw.owned) ? [...new Set(raw.owned.filter(id=>typeof id==='string' && item(id)?.price>0))].slice(0,20):[];
  s.packs=Array.isArray(raw.packs) ? [...new Set(raw.packs.filter(id=>packs.some(p=>p.id===id)))].slice(0,3):[];
  if (characters.some(c=>c.id===raw.character)) s.character=raw.character;
  if (skins.some(x=>x.id===raw.skin && (!x.price ? s.stage>=x.stage : s.owned.includes(x.id)))) s.skin=raw.skin;
  if (boards.some(x=>x.id===raw.board && (!x.price || s.owned.includes(x.id)))) s.board=raw.board;
  const m=raw.mission||{};
  s.mission={group:clampInt(m.group,0,29),jumps:clampInt(m.jumps,0,15),dodges:clampInt(m.dodges,0,10),coins:clampInt(m.coins,0,100)};
  if(s.mission.group===29) s.mission={group:29,jumps:0,dodges:0,coins:0};
  return s;
}
function clampInt(n,min,max){ return Number.isFinite(n) ? Math.max(min,Math.min(max,Math.floor(n))) : min; }
export function unlock(save,id) {
  const s=normalizeSave(save);
  const p=packs.find(x=>x.id===id);
  const x=item(id);
  const price=p?.price ?? x?.price;
  if (!price) return {ok:false,save:s,reason:'not_available'};
  if (p ? s.packs.includes(id) : s.owned.includes(id)) return {ok:true,save:s,reason:'already_owned'};
  if(s.credits<price) return {ok:false,save:s,reason:'insufficient_demo_credits'};
  s.credits-=price;
  if(p){ s.packs.push(id); for(const included of p.items) if(item(included)?.price>0 && !s.owned.includes(included)) s.owned.push(included); }
  else s.owned.push(id);
  return {ok:true,save:s,reason:'unlocked_demo_only'};
}
export function equip(save,kind,id) {
  const s=normalizeSave(save);
  if(kind==='character' && characters.some(x=>x.id===id)) s.character=id;
  if(kind==='skin' && skins.some(x=>x.id===id && (!x.price?s.stage>=x.stage:s.owned.includes(id)))) s.skin=id;
  if(kind==='board' && boards.some(x=>x.id===id && (!x.price||s.owned.includes(id)))) s.board=id;
  return s;
}
export function tickMission(m,type){
  const s={group:clampInt(m?.group,0,29), jumps:clampInt(m?.jumps,0,15),dodges:clampInt(m?.dodges,0,10),coins:clampInt(m?.coins,0,100)};
  if(s.group===29) return {group:29,jumps:0,dodges:0,coins:0};
  if(type==='jump') s.jumps=Math.min(15,s.jumps+1);
  if(type==='dodge') s.dodges=Math.min(10,s.dodges+1);
  if(type==='coin') s.coins=Math.min(100,s.coins+1);
  if(s.jumps===15&&s.dodges===10&&s.coins===100) return {group:s.group+1,jumps:0,dodges:0,coins:0};
  return s;
}
export class GameSimulation {
  constructor(save,random=Math.random){
    this.save=normalizeSave(save); this.random=random; this.state='ready'; this.distance=0; this.speed=9; this.lane=1; this.xLane=1; this.jump=0;this.slide=0;
    this.coins=0;this.stumbles=0;this.score=0;this.events=[];this.nextSpawn=18;
    this.mission={...this.save.mission};this.time=0;this.lastEvent='';this.finishedSave=null;
  }
  start(){if(this.state==='ready') this.state='running';}
  input(command){
    if(this.state!=='running')return;
    if(command==='left')this.lane=Math.max(0,this.lane-1);
    if(command==='right')this.lane=Math.min(2,this.lane+1);
    if(command==='jump'&&this.jump<=0&&this.slide<=0){this.jump=.76;this.mission=tickMission(this.mission,'jump');}
    if(command==='slide'&&this.slide<=0&&this.jump<=0)this.slide=.76;
  }
  spawn(){
    const danger=Math.floor(this.random()*3), safe=(danger+1+Math.floor(this.random()*2))%3;
    const types=this.distance<250?['low','block']:this.distance<750?['low','block','tackle']:['low','beam','block','tackle'];
    const type=types[Math.floor(this.random()*types.length)];
    this.events.push({kind:'coin',lane:safe,at:this.nextSpawn-5,done:false});
    this.events.push({kind:type,lane:danger,at:this.nextSpawn,done:false});
    this.nextSpawn+=Math.max(10,20-this.distance/300);
  }
  step(seconds){
    if(this.state!=='running')return;
    let remaining=Math.min(.15,Math.max(0,seconds));
    while(remaining>0){
      const dt=Math.min(.02,remaining);remaining-=dt;
      this.time+=dt;
      this.speed=9*Math.pow(1.03,Math.min(20,Math.floor(this.distance/100)));
      this.distance+=this.speed*dt;
      this.xLane+=Math.max(-1,Math.min(1,this.lane-this.xLane))*Math.min(1,dt*13);
      this.jump=Math.max(0,this.jump-dt);this.slide=Math.max(0,this.slide-dt);
      while(this.nextSpawn<this.distance+95)this.spawn();
      for(const e of this.events){
        if(e.done || e.at>this.distance)continue;
        e.done=true;
        const dx=Math.abs(e.lane-this.xLane);
        if(e.kind==='coin'){
          if(dx<.42){this.coins++;this.mission=tickMission(this.mission,'coin');this.lastEvent='coin';}
          continue;
        }
        if(e.kind==='tackle' && dx>.72){this.mission=tickMission(this.mission,'dodge');}
        if(dx>=.72)continue;
        const protectedMove=(e.kind==='low'||e.kind==='tackle')&&this.jump>.12 || e.kind==='beam'&&this.slide>.12;
        if(protectedMove){if(e.kind==='tackle')this.mission=tickMission(this.mission,'dodge');continue;}
        if(dx>.48 && this.stumbles===0){this.stumbles++;this.lastEvent='stumble';continue;}
        this.state='ended';this.lastEvent='fall';break;
      }
      this.events=this.events.filter(e=>!e.done && e.at>this.distance-2);
      this.score=Math.min(1000000000,Math.floor((Math.floor(this.distance)+this.coins*10)*(1+this.mission.group)));
      if(this.state==='ended')break;
    }
  }
  finish(){
    if(this.state!=='ended')return null;
    if(this.finishedSave)return normalizeSave(this.finishedSave);
    const s=normalizeSave(this.save);
    s.credits=Math.min(100000,s.credits+Math.min(200,this.coins));
    s.best=Math.max(s.best,this.score);s.mission={...this.mission};
    if(this.distance>=(s.stage+1)*250)s.stage++;
    this.finishedSave=normalizeSave(s);
    return s;
  }
}
