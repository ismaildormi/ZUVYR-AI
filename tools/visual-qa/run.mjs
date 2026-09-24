import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=process.env.ZUVYR_VISUAL_BASE_URL||'http://127.0.0.1:4173';
const outDir=path.resolve(process.env.ZUVYR_VISUAL_OUT||'artifacts/visual-qa');
await fs.mkdir(outDir,{recursive:true});

const targets=['3d','voice','music','research','library','documents','spreadsheets','presentations','scheduled','plugins','usage','analytics'];
const viewports=[
  {name:'desktop',width:1440,height:1000},
  {name:'mobile',width:390,height:844},
];
const report={schema:1,generatedAt:new Date().toISOString(),baseUrl,playwright:'1.63.0',axe:'4.13.0',views:[],productionPublic:null,summary:{critical:0,serious:0,moderate:0,overflowFailures:0,duplicateIdFailures:0,missingViews:0,renderFailures:0,consoleFailures:0}};
let failed=false;
const browser=await chromium.launch({headless:true});

function safeName(value){return String(value).replace(/[^a-z0-9_-]+/gi,'-').toLowerCase();}

async function inspectPage(page,view,viewport){
  const state=await page.evaluate(({view,viewport})=>{
    const root=document.getElementById('screen-zuvyr-tools');
    const active=root&&root.querySelector(`[data-zs-view="${view}"]`);
    const all=[...(active?active.querySelectorAll('*'):[])];
    const visible=all.filter(el=>{
      const cs=getComputedStyle(el),r=el.getBoundingClientRect();
      return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)!==0&&r.width>0&&r.height>0;
    });
    const duplicateIds=[...document.querySelectorAll('[id]')].map(el=>el.id).filter((id,i,a)=>id&&a.indexOf(id)!==i).filter((id,i,a)=>a.indexOf(id)===i);
    const namelessControls=visible.filter(el=>['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(el.tagName)).filter(el=>{
      if(el.tagName==='INPUT'&&['hidden'].includes(el.type))return false;
      const labelledBy=String(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent||'').join(' ');
      const explicitLabel=el.id?(document.querySelector('label[for=\"'+CSS.escape(el.id)+'\"]')?.textContent||''):'';
      const wrappedLabel=el.closest('label')?.textContent||'';
      const name=(el.getAttribute('aria-label')||labelledBy||explicitLabel||wrappedLabel||el.getAttribute('title')||el.textContent||el.getAttribute('placeholder')||'').trim();
      return !name;
    }).map(el=>({tag:el.tagName,id:el.id||null,className:el.className||null}));
    const colors={};
    visible.slice(0,500).forEach(el=>{
      const cs=getComputedStyle(el);
      ['color','backgroundColor','borderTopColor'].forEach(k=>{const v=cs[k];if(v&&v!=='rgba(0, 0, 0, 0)'&&v!=='transparent')colors[v]=(colors[v]||0)+1;});
    });
    const typography=visible.filter(el=>/^H[1-6]$|P|BUTTON|LABEL|SPAN/.test(el.tagName)).slice(0,200).map(el=>{const cs=getComputedStyle(el);return {tag:el.tagName,text:(el.textContent||'').trim().slice(0,120),fontFamily:cs.fontFamily,fontSize:cs.fontSize,fontWeight:cs.fontWeight,lineHeight:cs.lineHeight,color:cs.color};});
    const rects=visible.filter(el=>['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(el.tagName)).slice(0,300).map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,text:(el.textContent||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'').trim().slice(0,100),x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};});
    return {
      view,viewport,
      title:active&&active.querySelector('h1')?.textContent?.trim()||null,
      visibleText:active?.innerText?.slice(0,40000)||'',
      renderFailure:!active||!active.querySelector('h1')||/^(null|undefined)$/i.test((active.innerText||'').trim()),
      bodyScrollWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
      horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+2,
      duplicateIds,namelessControls,
      colorInventory:Object.entries(colors).sort((a,b)=>b[1]-a[1]).slice(0,80).map(([value,count])=>({value,count})),
      typography,controls:rects,
    };
  },{view,viewport});
  const axe=await new AxeBuilder({page}).include('#screen-zuvyr-tools').analyze();
  const violations=axe.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,nodes:v.nodes.slice(0,20).map(n=>({target:n.target,html:n.html.slice(0,500),failureSummary:n.failureSummary}))}));
  return {...state,violations};
}

for(const viewport of viewports){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},colorScheme:'dark',locale:'en-US'});
  const page=await context.newPage();
  const consoleErrors=[];
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  page.on('pageerror',err=>consoleErrors.push(err.message));
  await page.goto(`${baseUrl}/tools/visual-qa/harness.html`,{waitUntil:'networkidle'});
  await page.waitForSelector('#screen-zuvyr-tools',{state:'attached'});

  for(const target of targets){
    const entry=page.locator(`[data-zuvyr-section="${target}"]`).first();
    if(await entry.count()===0){report.summary.missingViews++;failed=true;report.views.push({view:target,viewport:viewport.name,missing:true});continue;}
    await entry.click();
    await page.waitForTimeout(120);
    const view=page.locator(`[data-zs-view="${target}"]`);
    await view.waitFor({state:'visible'});
    const filename=`${safeName(target)}-${viewport.name}.png`;
    await view.screenshot({path:path.join(outDir,filename),animations:'disabled'});
    const evidence=await inspectPage(page,target,viewport.name);
    evidence.screenshot=filename;
    evidence.consoleErrors=[...new Set(consoleErrors)].slice(0,50);
    const critical=evidence.violations.filter(v=>v.impact==='critical').length;
    const serious=evidence.violations.filter(v=>v.impact==='serious').length;
    const moderate=evidence.violations.filter(v=>v.impact==='moderate').length;
    report.summary.critical+=critical;report.summary.serious+=serious;report.summary.moderate+=moderate;
    if(evidence.horizontalOverflow){report.summary.overflowFailures++;failed=true;}
    if(evidence.renderFailure){report.summary.renderFailures++;failed=true;}
    if(evidence.consoleErrors.length){report.summary.consoleFailures++;failed=true;}
    if(evidence.duplicateIds.length){report.summary.duplicateIdFailures++;failed=true;}
    if(critical||serious||moderate)failed=true;
    if(evidence.namelessControls.length)failed=true;
    report.views.push(evidence);
  }
  await context.close();
}

try{
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
  const page=await context.newPage();
  const response=await page.goto('https://rox-ai-sepia.vercel.app',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(750);
  await page.screenshot({path:path.join(outDir,'production-public-mobile.png'),fullPage:true,animations:'disabled'});
  report.productionPublic={status:response?.status()||null,url:page.url(),title:await page.title(),screenshot:'production-public-mobile.png'};
  if(!response||response.status()>=400)failed=true;
  await context.close();
}catch(error){report.productionPublic={error:String(error?.message||error)};failed=true;}

await browser.close();
await fs.writeFile(path.join(outDir,'report.json'),JSON.stringify(report,null,2));
const summary=[
  '# ZUVYR Visual QA',
  '',
  `Generated: ${report.generatedAt}`,
  `Views: ${report.views.length}`,
  `Critical accessibility violations: ${report.summary.critical}`,
  `Serious accessibility violations: ${report.summary.serious}`,
  `Moderate accessibility violations: ${report.summary.moderate}`,
  `Horizontal overflow failures: ${report.summary.overflowFailures}`,
  `Duplicate ID failures: ${report.summary.duplicateIdFailures}`,
  `Missing views: ${report.summary.missingViews}`,
  `Render failures: ${report.summary.renderFailures}`,
  `Views with console errors: ${report.summary.consoleFailures}`,
  `Production public status: ${report.productionPublic?.status??'unavailable'}`,
  '',
  failed?'**RESULT: FAIL**':'**RESULT: PASS**',
].join('\n');
await fs.writeFile(path.join(outDir,'SUMMARY.md'),summary);
console.log(summary);
if(failed)process.exitCode=1;
