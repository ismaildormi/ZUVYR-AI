import {characters,skins,boards,packs,initialSave,normalizeSave,unlock,equip,GameSimulation} from './engine.mjs';
const $=id=>document.getElementById(id);
const key='ufc.playtest.v2.local-only';
let save;
try{save=normalizeSave(JSON.parse(localStorage.getItem(key)||'null'));}catch{save=initialSave();}
const persist=()=>localStorage.setItem(key,JSON.stringify(save));
let sim=new GameSimulation(save), endedHandled=false,toastUntil=0,seenEvent='',previewSkin=null;
const canvas=$('game'),ctx=canvas.getContext('2d');
const W=420,H=720;
function resize(){const d=Math.min(2,window.devicePixelRatio||1);canvas.width=W*d;canvas.height=H*d;ctx.setTransform(d,0,0,d,0,0);}
resize();window.addEventListener('resize',resize);
function note(msg){$('toast').textContent=msg;$('toast').classList.add('visible');toastUntil=performance.now()+2200;}
const itemName=id=>skins.find(x=>x.id===id)?.name||boards.find(x=>x.id===id)?.name||id;
function renderUI(){
  $('walletValue').textContent=save.credits.toLocaleString('ar-MA');
  $('bestValue').textContent=save.best.toLocaleString('ar-MA');$('stageValue').textContent=save.stage;
  $('missionOverview').innerHTML=`<b>x${1+save.mission.group}</b> · اقفز ${save.mission.jumps}/15 · تفادَ ${save.mission.dodges}/10 · اجمع ${save.mission.coins}/100<br><span>التقدم التجريبي لا يُرسل إلى التصنيف أو حساب Unity.</span>`;
  $('roster').replaceChildren(...characters.map(c=>{
    const b=document.createElement('button');b.type='button';b.className='hero-card'+(save.character===c.id?' selected':'');b.style.setProperty('--accent',c.accent);
    b.innerHTML=`<span class="hero-emblem">${c.emblem}</span><strong>${c.name}</strong><small>${c.role}</small>`;
    b.onclick=()=>{if(lockedInRun())return;save=equip(save,'character',c.id);persist();renderUI();note('تم اختيار '+c.name);};return b;
  }));
  $('skins').replaceChildren(...skins.map(s=>{
    const owned=s.price?save.owned.includes(s.id):save.stage>=s.stage;
    const b=document.createElement('button');b.type='button';b.className='swatch'+((previewSkin||save.skin)===s.id?' selected':'')+(!owned?' locked':'');
    b.style.setProperty('--swatch',s.color);b.innerHTML=`<i></i>${s.name}<small>${owned?(save.skin===s.id?'مجهّز':'متاح'):(s.price?'◉ '+s.price:'مرحلة '+s.stage)}</small>`;
    b.onclick=()=>{
      if(lockedInRun())return;
      if(!owned && !s.price){previewSkin=s.id;renderUI();note('معاينة مؤقتة · يُفتح عند المرحلة '+s.stage);return;}
      if(!owned){const result=unlock(save,s.id);if(!result.ok){note('رصيد التدريب غير كافٍ');return;}save=result.save;}
      previewSkin=null;save=equip(save,'skin',s.id);persist();renderUI();note('سكين '+s.name+' · تجريبي فقط');
    };return b;
  }));
  $('boards').replaceChildren(...boards.map(s=>{
    const owned=!s.price||save.owned.includes(s.id);
    const b=document.createElement('button');b.type='button';b.className='board-card'+(save.board===s.id?' selected':'');b.style.setProperty('--board',s.color);
    b.innerHTML=`<b>▰</b>${s.name}<small>${owned?(save.board===s.id?'مجهّز':'متاح'):'◉ '+s.price+' تدريب'}</small>`;
    b.onclick=()=>{
      if(lockedInRun())return;
      if(!owned){const result=unlock(save,s.id);if(!result.ok){note('رصيد التدريب غير كافٍ');return;}save=result.save;}
      save=equip(save,'board',s.id);persist();renderUI();note('لوح '+s.name+' · تجريبي فقط');
    };return b;
  }));
  $('packs').replaceChildren(...packs.map(p=>{
    const owned=save.packs.includes(p.id);const wrap=document.createElement('div');wrap.className='pack';wrap.style.setProperty('--pack-tone',p.tone);
    wrap.innerHTML=`<div class="pack-title"><strong>✦ ${p.name}</strong><span>◉ ${p.price}</span></div><p>${p.items.map(itemName).join(' + ')}</p>`;
    const button=document.createElement('button');button.textContent=owned?'تم فتح الباقة · تجريبية':'فتح باقة تدريبية';button.disabled=owned;
    button.onclick=()=>{if(lockedInRun())return;const result=unlock(save,p.id);if(!result.ok){note('رصيد التدريب غير كافٍ');return;}save=result.save;persist();renderUI();note('تم فتح الباقة محليًا؛ لا مشتريات حقيقية');};
    wrap.append(button);return wrap;
  }));
}
renderUI();
function lockedInRun(){if(sim.state==='running'){note('أنهِ الجولة قبل تغيير التجهيزات');return true;}return false;}
$('resetButton').onclick=()=>{
  if(lockedInRun())return;
  if(!confirm('إعادة ضبط تقدم المتصفح التجريبي فقط؟ لن يتأثر مشروع Unity أو أي حساب.'))return;
  save=initialSave();previewSkin=null;persist();sim=new GameSimulation(save);endedHandled=false;resetOverlay();renderUI();note('تمت إعادة ضبط تجربة المتصفح');
};
function resetOverlay(){
  $('overlay').classList.remove('hidden');$('overlayTitle').innerHTML='كل مطاردة<br>لها بداية.';
  $('overlayDesc').textContent='اجمع العملات، تفادَ العوائق، واختر مسارك. نتيجتك هنا تجريبية فقط.';
  $('primaryAction').innerHTML='ابدأ الجري <span>←</span>';
}
$('primaryAction').onclick=()=>{
  sim=new GameSimulation(save);sim.start();endedHandled=false;seenEvent='';$('overlay').classList.add('hidden');
  $('playfield').focus();note('انطلق! ← → للمسارات، ↑ قفز، ↓ انزلاق');
};
const action=cmd=>sim.input(cmd);
for(const btn of document.querySelectorAll('[data-action]')){
  btn.addEventListener('pointerdown',e=>{e.preventDefault();action(btn.dataset.action);});
}
window.addEventListener('keydown',e=>{
  const map={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',ArrowDown:'slide',KeyS:'slide'};
  if(!map[e.code])return;
  if(sim.state==='running'){e.preventDefault();action(map[e.code]);}
});
let touch=null;
canvas.addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY,t:performance.now()};});
canvas.addEventListener('pointerup',e=>{
  if(!touch||sim.state!=='running')return;
  const dx=e.clientX-touch.x,dy=e.clientY-touch.y;
  if(Math.abs(dx)>35||Math.abs(dy)>35)action(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy<0?'jump':'slide'));
  touch=null;
});
function path(points,fill){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
function rr(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
function pos(lane,ahead){const t=Math.max(0,Math.min(1,ahead/95));const depth=(1-t)**1.48;return{x:210+(lane-1)*(20+depth*98),y:208+depth*440,scale:.18+depth*.86,depth};}
function drawBackdrop(now){
  const sky=ctx.createLinearGradient(0,0,0,480);sky.addColorStop(0,'#142e40');sky.addColorStop(.38,'#547985');sky.addColorStop(.71,'#e8a777');sky.addColorStop(1,'#637a72');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  glow(310,165,165,'#ffdd9768');ctx.beginPath();ctx.arc(307,161,42,0,7);ctx.fillStyle='#ffdba0';ctx.fill();
  path([[0,236],[27,199],[51,215],[78,176],[105,205],[145,185],[184,222],[212,202],[257,220],[285,192],[318,210],[365,177],[420,215],[420,330],[0,330]],'#294953');
  const phase=sim.distance*.04;
  for(let i=0;i<18;i++){
    const x=(i*43+12)%450-12,h=24+(i*19)%78;
    ctx.fillStyle=i%3===0?'#253f48':'#31505a';ctx.fillRect(x,245-h,22+(i*7)%26,h);
    ctx.fillStyle='#e9c88b88';for(let wy=253-h;wy<240;wy+=12)for(let wx=x+5;wx<x+24;wx+=10)if((i+wy+wx)%3<1)ctx.fillRect(wx,wy,2,3);
  }
  // Original stadium arch and stand lights.
  ctx.strokeStyle='#94d8ce99';ctx.lineWidth=4;ctx.beginPath();ctx.arc(210,304,169,Math.PI,Math.PI*2);ctx.stroke();
  for(let i=0;i<11;i++){const angle=Math.PI+i*Math.PI/10,x=210+169*Math.cos(angle),y=304+169*Math.sin(angle);glow(x,y,10,'#b0f0bf8a');}
  path([[0,225],[176,205],[26,720],[0,720]],'#33565b');path([[244,205],[420,225],[420,720],[394,720]],'#33565b');
  // Road and three converging lanes.
  path([[176,206],[244,206],[420,720],[0,720]],'#1a3640');
  path([[179,206],[241,206],[400,720],[20,720]],'#273f47');
  for(let edge of [-1,1]){const near=210+edge*188,far=210+edge*33;path([[far-2,206],[far+2,206],[near+5,720],[near-5,720]],edge===1?'#ffbb77':'#9df0d1');}
  for(let sep of [-.5,.5]){
    ctx.strokeStyle='#a4d9c47c';ctx.lineWidth=2;
    for(let i=0;i<12;i++){
      const v=(i*12+phase%12),z=Math.max(0,95-v),p=pos(1+sep,z),q=pos(1+sep,Math.max(0,z-4));
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
    }
  }
  for(let i=0;i<9;i++){
    const ahead=(i*14+sim.distance%14);if(ahead>95)continue;const p=pos(1,ahead);const width=29+165*p.depth;
    ctx.strokeStyle=`rgba(166,214,189,${.06+.1*p.depth})`;ctx.lineWidth=1+p.depth*2;
    ctx.beginPath();ctx.moveTo(210-width,p.y);ctx.lineTo(210+width,p.y);ctx.stroke();
  }
  for(let side of [-1,1]){
    for(let i=0;i<8;i++){
      const ahead=(i*16+sim.distance%16);if(ahead>95)continue;const p=pos(side===-1?-1:3,ahead),r=3+p.depth*10;
      glow(p.x,p.y-35*p.scale,15+p.depth*30,side<0?'#91ffd387':'#ffc46b85');
      rr(p.x-r*.26,p.y-r*5,r*.52,r*5,1,'#203b43');
      path([[p.x-r,p.y-r*5],[p.x,p.y-r*6.5],[p.x+r,p.y-r*5]],side<0?'#9ef5c3':'#ffb372');
    }
  }
  // Subtle vignette.
  const vig=ctx.createRadialGradient(210,340,160,210,340,490);vig.addColorStop(0,'transparent');vig.addColorStop(1,'#081d2b86');ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);
}
function drawCoin(p,now){const s=p.scale;glow(p.x,p.y-19*s,20*s,'#ffcc6b80');ctx.save();ctx.translate(p.x,p.y-22*s);ctx.scale(.55+.4*Math.abs(Math.cos(now*.004)),1);ctx.beginPath();ctx.arc(0,0,14*s,0,7);ctx.fillStyle='#ffd867';ctx.fill();ctx.lineWidth=3*s;ctx.strokeStyle='#fff2a4';ctx.stroke();ctx.fillStyle='#a46226';ctx.textAlign='center';ctx.font=`900 ${15*s}px system-ui`;ctx.fillText('✦',0,5*s);ctx.restore();}
function drawHazard(e,p){const s=p.scale,x=p.x,y=p.y;
  ctx.fillStyle='#10262d77';ctx.beginPath();ctx.ellipse(x,y,31*s,8*s,0,0,7);ctx.fill();
  if(e.kind==='low'){glow(x,y-15*s,28*s,'#ffb5606b');rr(x-30*s,y-34*s,60*s,32*s,5*s,'#ff9f55');rr(x-29*s,y-29*s,58*s,6*s,2*s,'#ffe1a4');}
  if(e.kind==='beam'){rr(x-25*s,y-68*s,6*s,67*s,2*s,'#c77fe1');rr(x+19*s,y-68*s,6*s,67*s,2*s,'#c77fe1');rr(x-28*s,y-73*s,56*s,14*s,4*s,'#e6b1ff');}
  if(e.kind==='block'){rr(x-30*s,y-77*s,60*s,75*s,7*s,'#ef6c6c');rr(x-23*s,y-64*s,46*s,8*s,3*s,'#ffd1a1');ctx.fillStyle='#542a42';ctx.font=`900 ${27*s}px system-ui`;ctx.textAlign='center';ctx.fillText('×',x,y-19*s);}
  if(e.kind==='tackle'){glow(x,y-15*s,31*s,'#7ba5ff71');rr(x-30*s,y-23*s,60*s,23*s,11*s,'#7f93eb');ctx.beginPath();ctx.arc(x+16*s,y-30*s,11*s,0,7);ctx.fillStyle='#ffd4a7';ctx.fill();}
}
function drawRunner(now){const c=characters.find(x=>x.id===save.character)||characters[0],kit=skins.find(x=>x.id===(previewSkin||save.skin))||skins[0],board=boards.find(x=>x.id===save.board)||boards[0];const bob=sim.state==='running'?Math.sin(now*.017)*3:Math.sin(now*.003)*2;
  const x=210+(sim.xLane-1)*118,y=605-(sim.jump>0?Math.sin((.76-sim.jump)/.76*Math.PI)*86:0)+bob;
  ctx.fillStyle='#091d2888';ctx.beginPath();ctx.ellipse(x,631,38,10,0,0,7);ctx.fill();glow(x,y-48,100,c.accent+'45');
  if(save.board!=='classic'){ctx.save();ctx.translate(x,y+18);ctx.rotate(-.06);rr(-40,0,80,10,6,board.color);rr(-22,3,44,3,2,'#f5f4dc');ctx.restore();}
  ctx.save();ctx.translate(x,y);if(sim.slide>0)ctx.scale(1.1,.62);
  // Shoes, legs and gloves.
  rr(-24,-5,17,27,5,'#101e32');rr(7,-5,17,27,5,'#101e32');rr(-28,13,23,8,4,'#e5f3e2');rr(6,13,23,8,4,'#e5f3e2');
  rr(-34,-74,16,48,6,'#e2af8d');rr(18,-74,16,48,6,'#e2af8d');
  path([[-25,-86],[25,-86],[29,-22],[-29,-22]],'#112e3b');
  path([[-23,-85],[23,-85],[28,-36],[-28,-36]],kit.color);
  rr(-3,-81,6,43,3,c.accent);rr(-21,-30,42,9,3,'#1c3040');
  ctx.beginPath();ctx.arc(0,-106,25,0,7);ctx.fillStyle='#f0be9b';ctx.fill();
  ctx.fillStyle='#172b35';ctx.beginPath();ctx.arc(-8,-111,2,0,7);ctx.arc(8,-111,2,0,7);ctx.fill();
  // Eight original signature headpieces.
  ctx.fillStyle=c.accent;
  if(c.silhouette==='cap'){rr(-26,-132,53,13,5,c.accent);rr(11,-123,26,6,3,c.accent);}
  else if(c.silhouette==='guard'){rr(-36,-88,18,16,6,c.accent);rr(18,-88,18,16,6,c.accent);}
  else if(c.silhouette==='scarf'){rr(-19,-129,38,8,4,c.accent);path([[15,-71],[40,-72],[37,-57]],c.accent);}
  else if(c.silhouette==='visor'){rr(-25,-114,50,10,5,c.accent);ctx.beginPath();ctx.arc(0,-135,8,0,7);ctx.fill();}
  else if(c.silhouette==='crest'){rr(-27,-134,54,8,3,c.accent);path([[-4,-134],[0,-149],[8,-134]],c.accent);}
  else if(c.silhouette==='lens'){ctx.strokeStyle=c.accent;ctx.lineWidth=5;ctx.beginPath();ctx.arc(-15,-107,11,0,7);ctx.arc(15,-107,11,0,7);ctx.stroke();}
  else if(c.silhouette==='horns'){path([[-16,-128],[-23,-147],[-2,-131]],c.accent);path([[16,-128],[23,-147],[2,-131]],c.accent);}
  else {ctx.strokeStyle=c.accent;ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,-145,28,7,0,0,7);ctx.stroke();}
  ctx.restore();
}
let last=performance.now();
function frame(now){
  const dt=(now-last)/1000;last=now;
  if(sim.state==='running')sim.step(dt);
  if(sim.lastEvent && sim.lastEvent!==seenEvent){seenEvent=sim.lastEvent;if(sim.lastEvent==='coin')note('+1 عملة تدريب عند نهاية الجولة');if(sim.lastEvent==='stumble')note('اصطدام جانبي · تعثر!');}
  if(sim.state==='ended'&&!endedHandled){
    endedHandled=true;save=sim.finish();persist();renderUI();
    $('overlayTitle').innerHTML='بطاقة حمراء.<br>لكن القصة مستمرة.';
    $('overlayDesc').textContent=`قطعت ${Math.floor(sim.distance)} مترًا • ${sim.score.toLocaleString('ar-MA')} نقطة محلية • جمعت ${sim.coins} عملة تدريب. لا نتائج رسمية.`;
    $('primaryAction').innerHTML='حاول مرة أخرى <span>↻</span>';$('overlay').classList.remove('hidden');
  }
  drawBackdrop(now);
  const visible=sim.events.filter(e=>!e.done&&e.at>=sim.distance&&e.at<sim.distance+95).sort((a,b)=>b.at-a.at);
  for(const e of visible){const p=pos(e.lane,e.at-sim.distance);if(e.kind==='coin')drawCoin(p,now);else drawHazard(e,p);}
  drawRunner(now);
  $('distance').innerHTML=`${Math.floor(sim.distance)} <sup>m</sup>`;
  $('score').textContent=sim.score.toLocaleString('ar-MA');$('coins').innerHTML=`${sim.coins} <span>◉</span>`;
  if(now>toastUntil)$('toast').classList.remove('visible');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
