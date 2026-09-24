import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=process.env.ZUVYR_VISUAL_BASE_URL||'http://127.0.0.1:4173';
const outDir=path.resolve(process.env.ZUVYR_VISUAL_OUT||'artifacts/visual-qa');
await fs.mkdir(outDir,{recursive:true});

const required=['screen-home','feature-chat','feature-images','feature-videos','feature-code','feature-roxip','screen-projects','feature-settings'];
const viewports=[{name:'native-desktop',width:1440,height:1000},{name:'native-mobile',width:390,height:844}];
const report={schema:1,generatedAt:new Date().toISOString(),source:'frontend/index.html',required,viewports:[],summary:{screens:0,missingRequired:0,critical:0,serious:0,moderate:0,overflowFailures:0,renderFailures:0,consoleFailures:0,duplicateIdFailures:0}};
let failed=false;
const browser=await chromium.launch({headless:true});

function safe(value){return String(value).replace(/[^a-z0-9_-]+/gi,'-').toLowerCase();}
function idSelector(id){return '#'+String(id).replace(/[^A-Za-z0-9_-]/g,ch=>'\\'+ch);}

function fixtureInit(){
  const session={access_token:'zuvyr-native-visual-token',refresh_token:'zuvyr-native-refresh',expires_at:4102444800,user:{id:'00000000-0000-4000-8000-000000000001',email:'visual-owner@example.invalid',user_metadata:{full_name:'ZUVYR Owner'}}};
  const profile={id:session.user.id,email:session.user.email,full_name:'ZUVYR Owner',credits_used:120,credits_total:5000,credits_balance:4880,subscription_status:'pro',is_admin:true};
  const resultFor=(table,single)=>({data:single?(table==='profiles'?profile:null):[],error:null,count:0});
  const query=(table)=>{
    let proxy;
    proxy=new Proxy({}, {get(_target,prop){
      if(prop==='then')return (resolve)=>resolve(resultFor(table,false));
      if(['single','maybeSingle'].includes(String(prop)))return async()=>resultFor(table,true);
      if(['select','eq','neq','order','limit','range','in','is','or','filter','match','contains','lt','lte','gt','gte','insert','update','upsert','delete'].includes(String(prop)))return()=>proxy;
      return()=>proxy;
    }});
    return proxy;
  };
  const client={
    auth:{
      getSession:async()=>({data:{session},error:null}),
      getUser:async()=>({data:{user:session.user},error:null}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signOut:async()=>({error:null}),
      updateUser:async()=>({data:{user:session.user},error:null})
    },
    from:(table)=>query(String(table||'')),
    rpc:async()=>({data:null,error:null}),
    storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:null},error:null}),getPublicUrl:()=>({data:{publicUrl:''}})})},
    functions:{invoke:async()=>({data:{status:'success'},error:null})},
    channel:()=>({on(){return this;},subscribe(){return this;},unsubscribe(){}}),
    removeChannel:async()=>{}
  };
  Object.defineProperty(window,'supabase',{configurable:true,writable:true,value:{createClient:()=>client}});
  Object.defineProperty(window,'tus',{configurable:true,writable:true,value:{Upload:function(){this.start=()=>{};this.abort=async()=>{};}}});
  window.__ZUVYR_NATIVE_VISUAL_QA=true;
  const nativeFetch=window.fetch.bind(window);
  const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
  const fixture=(url)=>{
    const p=String(url||'');
    if(p.includes('plans'))return {status:'success',plans:[],items:[]};
    if(p.includes('usage'))return {status:'success',plan:'pro',fiveHour:{state:'active',remaining:420,total:500},weekly:{state:'active',remaining:3200,total:4000},persistentTopupCredits:1200,recentRequests:[],warnings:{}};
    if(p.includes('conversations'))return {status:'success',conversations:[],items:[]};
    if(p.includes('projects'))return {status:'success',projects:[],items:[]};
    if(p.includes('history'))return {status:'success',history:[],items:[]};
    if(p.includes('devices'))return {status:'success',devices:[],items:[]};
    return {status:'success',items:[],history:[],projects:[],conversations:[],capabilities:{}};
  };
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input&&input.url)||'';
    let parsed;try{parsed=new URL(url,location.href);}catch{return json(fixture(url));}
    if(parsed.origin===location.origin)return nativeFetch(input,init);
    return json(fixture(parsed.href));
  };
}

async function activate(page,id){
  return page.evaluate((targetId)=>{
    const nodes=[...document.querySelectorAll('.screen[id],.feature-screen[id],.modal-backdrop[id]')];
    for(const el of nodes){
      if(el.id==='screen-zuvyr-tools')continue;
      el.classList.remove('active','show','open');
      el.setAttribute('aria-hidden','true');
      el.style.removeProperty('display');
    }
    const el=document.getElementById(targetId);
    if(!el)return false;
    const login=document.getElementById('login-overlay');if(login){login.classList.add('hidden');login.style.display='none';}
    el.classList.remove('hidden');el.classList.add('active','show','open');el.setAttribute('aria-hidden','false');
    const child=el.classList.contains('modal-backdrop')?el.querySelector('.feature-screen'):null;
    if(child){child.classList.add('active');child.setAttribute('aria-hidden','false');}
    let r=el.getBoundingClientRect();
    if(!r.width||!r.height||getComputedStyle(el).display==='none'){
      el.style.display=el.classList.contains('modal-backdrop')?'flex':'block';
      if(child)child.style.display='block';
      r=el.getBoundingClientRect();
    }
    window.scrollTo(0,0);
    return !!(r.width&&r.height);
  },id);
}

async function inspect(page,id,viewport,consoleErrors){
  const state=await page.evaluate(({id,viewport})=>{
    const el=document.getElementById(id);
    if(!el)return {id,viewport,missing:true};
    const all=[el,...el.querySelectorAll('*')];
    const visible=all.filter(node=>{const cs=getComputedStyle(node),r=node.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)!==0&&r.width>0&&r.height>0;});
    const colors={};for(const node of visible.slice(0,700)){const cs=getComputedStyle(node);for(const k of ['color','backgroundColor','borderTopColor']){const v=cs[k];if(v&&v!=='transparent'&&v!=='rgba(0, 0, 0, 0)')colors[v]=(colors[v]||0)+1;}}
    const typography=visible.filter(node=>/^H[1-6]$|P|BUTTON|LABEL|SPAN|DIV/.test(node.tagName)).slice(0,240).map(node=>{const cs=getComputedStyle(node);return {tag:node.tagName,text:(node.textContent||'').trim().replace(/\s+/g,' ').slice(0,100),fontFamily:cs.fontFamily,fontSize:cs.fontSize,fontWeight:cs.fontWeight,lineHeight:cs.lineHeight,color:cs.color};});
    const rootRect=el.getBoundingClientRect();
    const duplicateIds=[...document.querySelectorAll('[id]')].map(n=>n.id).filter((value,index,array)=>value&&array.indexOf(value)!==index).filter((value,index,array)=>array.indexOf(value)===index);
    const visibleText=(el.innerText||'').trim();
    return {id,viewport,title:(el.querySelector('h1,h2,.feature-topbar .t,.modal-topbar .t')?.textContent||'').trim()||null,visibleText:visibleText.slice(0,50000),renderFailure:!visibleText||/^(null|undefined)$/i.test(visibleText),horizontalOverflow:Math.ceil(el.scrollWidth)>Math.ceil(rootRect.width)+3,scrollWidth:el.scrollWidth,clientWidth:Math.round(rootRect.width),duplicateIds,colorInventory:Object.entries(colors).sort((a,b)=>b[1]-a[1]).slice(0,80).map(([value,count])=>({value,count})),typography};
  },{id,viewport});
  if(state.missing)return {...state,consoleErrors};
  let violations=[];
  try{const axe=await new AxeBuilder({page}).include(idSelector(id)).analyze();violations=axe.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.slice(0,20).map(n=>({target:n.target,html:n.html.slice(0,500),failureSummary:n.failureSummary}))}));}catch(error){violations=[{id:'axe-run-failed',impact:'critical',help:String(error?.message||error),nodes:[]}];}
  return {...state,consoleErrors:[...new Set(consoleErrors)].slice(0,80),violations};
}

for(const viewport of viewports){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},colorScheme:'dark',locale:'en-US'});
  await context.addInitScript(fixtureInit);
  await context.route('**/*',async route=>{
    const req=route.request();const url=new URL(req.url());
    if(url.origin===new URL(baseUrl).origin)return route.continue();
    if(['script','stylesheet','font','image','media'].includes(req.resourceType()))return route.abort();
    return route.continue();
  });
  const page=await context.newPage();const consoleErrors=[];
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  page.on('pageerror',err=>consoleErrors.push(err.message));
  await page.goto(`${baseUrl}/frontend/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1800);
  await page.evaluate(()=>{const login=document.getElementById('login-overlay');if(login){login.classList.add('hidden');login.style.display='none';}});
  const inventory=await page.evaluate(()=>[...document.querySelectorAll('.screen[id],.feature-screen[id],.modal-backdrop[id]')].map(el=>({id:el.id,tag:el.tagName,className:el.className})).filter((item,index,array)=>item.id&&item.id!=='screen-zuvyr-tools'&&array.findIndex(x=>x.id===item.id)===index));
  const ids=inventory.map(x=>x.id);
  const missing=required.filter(id=>!ids.includes(id));
  report.summary.missingRequired+=missing.length;if(missing.length)failed=true;
  const viewportReport={viewport:viewport.name,inventory,missingRequired:missing,screens:[]};
  for(const item of inventory){
    const ok=await activate(page,item.id);if(!ok){failed=true;report.summary.renderFailures++;viewportReport.screens.push({id:item.id,renderFailure:true,reason:'not_visible_after_activation'});continue;}
    await page.waitForTimeout(80);
    const locator=page.locator(idSelector(item.id)).first();
    const filename=`${safe(item.id)}-${viewport.name}.png`;
    await locator.screenshot({path:path.join(outDir,filename),animations:'disabled'});
    const evidence=await inspect(page,item.id,viewport.name,consoleErrors);evidence.screenshot=filename;
    const critical=evidence.violations.filter(v=>v.impact==='critical').length;
    const serious=evidence.violations.filter(v=>v.impact==='serious').length;
    const moderate=evidence.violations.filter(v=>v.impact==='moderate').length;
    report.summary.critical+=critical;report.summary.serious+=serious;report.summary.moderate+=moderate;
    if(evidence.horizontalOverflow){report.summary.overflowFailures++;failed=true;}
    if(evidence.renderFailure){report.summary.renderFailures++;failed=true;}
    if(evidence.consoleErrors.length){report.summary.consoleFailures++;failed=true;}
    if(evidence.duplicateIds.length){report.summary.duplicateIdFailures++;failed=true;}
    if(critical||serious||moderate)failed=true;
    viewportReport.screens.push(evidence);report.summary.screens++;
  }
  report.viewports.push(viewportReport);
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outDir,'native-report.json'),JSON.stringify(report,null,2));
const summary=['# ZUVYR Native Shell Visual QA','',`Generated: ${report.generatedAt}`,`Captured native screens: ${report.summary.screens}`,`Missing required screens: ${report.summary.missingRequired}`,`Critical accessibility violations: ${report.summary.critical}`,`Serious accessibility violations: ${report.summary.serious}`,`Moderate accessibility violations: ${report.summary.moderate}`,`Horizontal overflow failures: ${report.summary.overflowFailures}`,`Render failures: ${report.summary.renderFailures}`,`Views with console errors: ${report.summary.consoleFailures}`,`Duplicate ID failures: ${report.summary.duplicateIdFailures}`,'',failed?'**RESULT: FAIL**':'**RESULT: PASS**'].join('\n');
await fs.writeFile(path.join(outDir,'NATIVE_SUMMARY.md'),summary);
console.log(summary);
if(failed)process.exitCode=1;
