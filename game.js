(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = 900, H = 525, COLS = 12, ROWS = 7, CELL = 68, OX = 42, OY = 24;
  const types = {
    fire:{name:'Cindercub',type:'FIRE',emoji:'🦊',color:'#f19a62',pale:'#fff0df',cost:85,range:145,rate:.95,damage:23,ability:'area damage',evolutions:['Cindercub','Blazetail','Sunflare']},
    water:{name:'Bubblot',type:'WATER',emoji:'🐸',color:'#72b9d1',pale:'#e5f5f8',cost:90,range:158,rate:1.15,damage:17,ability:'slow',evolutions:['Bubblot','Tidehop','Coralord']},
    grass:{name:'Spriglet',type:'GRASS',emoji:'🦔',color:'#8fc77d',pale:'#edf6e6',cost:80,range:145,rate:1.25,damage:15,ability:'poison',evolutions:['Spriglet','Brambleback','Verdantusk']},
    electric:{name:'Zappup',type:'ELECTRIC',emoji:'🐰',color:'#edca62',pale:'#fff7db',cost:105,range:175,rate:.78,damage:20,ability:'stun',evolutions:['Zappup','Voltusk','Thundhare']},
    rock:{name:'Pebblit',type:'ROCK',emoji:'🐻',color:'#aa9786',pale:'#f1ece6',cost:95,range:125,rate:1.3,damage:30,ability:'area damage',evolutions:['Pebblit','Boulderbear','Granititan']},
    wind:{name:'Flitfin',type:'WIND',emoji:'🐦',color:'#83b8a7',pale:'#e8f4ef',cost:100,range:190,rate:.55,damage:13,ability:'slow',evolutions:['Flitfin','Gustwing','Skyseraph']}
  };
  const path = [[0,5],[1,5],[2,5],[3,5],[3,4],[3,3],[4,3],[5,3],[6,3],[6,4],[6,5],[7,5],[8,5],[8,4],[8,3],[9,3],[10,3],[10,2],[10,1],[11,1]];
  const pathCenters = path.map(([x,y])=>({x:OX+x*CELL+CELL/2,y:OY+y*CELL+CELL/2}));
  const state = {hp:20,maxHp:20,energy:260,wave:0,totalWaves:10,phase:'prep',paused:false,speed:1,selectedType:'fire',selectedTower:null,unlocked:['fire','water','grass'],towers:[],enemies:[],projectiles:[],particles:[],floats:[],spawnLeft:0,spawnTimer:0,spawnInterval:.9,frame:0,toastTimer:0,offerTypes:[],waveStartCount:0};
  const pathCells = new Set(path.map(([x,y])=>`${x},${y}`));
  const $ = id => document.getElementById(id);
  const rand = (a,b)=>a+Math.random()*(b-a);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  function resize(){
    const r=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(r.width*dpr); canvas.height=Math.round(r.height*dpr);
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    ctx.imageSmoothingEnabled=false;
  }
  window.addEventListener('resize',resize); resize();
  function tileCenter(x,y){return {x:OX+x*CELL+CELL/2,y:OY+y*CELL+CELL/2};}
  function tileAt(px,py){const x=Math.floor((px-OX)/CELL),y=Math.floor((py-OY)/CELL);return x>=0&&x<COLS&&y>=0&&y<ROWS?{x,y}:null;}
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');state.toastTimer=1.5;}
  function renderRoster(){
    const list=$('creatureList');list.innerHTML='';
    for(const key of state.unlocked){const c=types[key],b=document.createElement('button');b.className='creature-card'+(state.selectedType===key&&!state.selectedTower?' selected':'');b.innerHTML=`<span class="creature-avatar" style="background:${c.pale}">${c.emoji}</span><span class="creature-info"><span class="creature-name">${c.name}</span><span class="creature-type">${c.type} · ${c.ability.toUpperCase()}</span></span><span class="creature-cost">✦ ${c.cost}</span>`;
      b.addEventListener('click',()=>{state.selectedType=key;state.selectedTower=null;renderAllUI();showToast(`${c.name} ready to place`);});list.appendChild(b);
    }
    $('rosterCount').textContent=String(state.unlocked.length).padStart(2,'0');
  }
  function renderSelection(){
    const box=$('selectionPanel');
    if(state.selectedTower){const t=state.selectedTower,c=types[t.kind],name=c.evolutions[t.level-1],next=c.evolutions[t.level];
      box.innerHTML=`<div class="selected-creature"><span class="selected-avatar" style="background:${c.pale}">${c.emoji}</span><div class="selected-text"><span class="selected-title">${name} <span style="color:#a6b0a7;font-weight:600">· STAGE ${t.level}</span></span><span class="selected-meta">${c.type} · ${c.ability.toUpperCase()} · DMG ${Math.round(c.damage*(1+(t.level-1)*.65))}</span></div></div><div class="selected-actions"><button class="mini-action" id="upgradeBtn">${next?`⬆ EVOLVE · ✦ ${upgradeCost(t)}`:'✧ MAX EVOLUTION'}</button><button class="mini-action sell" id="sellBtn">SELL · ✦ ${Math.floor(t.invested*.7)}</button></div>`;
      const up=$('upgradeBtn');if(next)up.addEventListener('click',upgradeSelected);else up.disabled=true;
      $('sellBtn').addEventListener('click',sellSelected);
    }else{
      box.innerHTML=`<div class="selection-empty"><span class="empty-spark">✦</span><div><strong>Nothing selected</strong><small>Pick a creature, then tap an empty tile</small></div></div>`;
    }
  }
  function renderAllUI(){renderRoster();renderSelection();updateHud();}
  function upgradeCost(t){return t.level===1?100:160;}
  function updateHud(){
    $('hpValue').innerHTML=`${state.hp} <i>/ ${state.maxHp}</i>`;$('hpBar').style.width=`${100*state.hp/state.maxHp}%`;
    $('energyValue').textContent=state.energy;$('waveValue').innerHTML=`${state.wave} <i>/ ${state.totalWaves}</i>`;
    const live=state.phase==='wave';$('waveButton').disabled=live||state.phase==='ended'||state.phase==='choice';
    $('waveButton').innerHTML=live?`<span>●</span> WAVE ${state.wave} IN PROGRESS`:state.wave>=state.totalWaves?'<span>✓</span> TRAIL SECURE':`<span>▶</span> START WAVE ${state.wave+1}`;
    $('phaseTitle').textContent=live?'Wild ones incoming!':state.phase==='choice'?'A new friend awaits':state.phase==='ended'?'Trail defended!':'A quiet moment';
    $('phaseCopy').textContent=live?`${state.enemies.length+state.spawnLeft} wild creatures still on the trail. Keep them away from your base!`:state.phase==='prep'?'Choose a companion and place them beside the trail. The wild ones are coming.':state.phase==='choice'?'Choose a new companion to add to your team.':'Your companions are holding the line.';
    $('phaseBadge').textContent=live?'UNDER ATTACK':state.phase==='choice'?'REWARD':'PREP';$('phaseBadge').classList.toggle('live',live);
    $('waveLabel').textContent=live?`${state.enemies.length+state.spawnLeft} WILD ON TRAIL`:'PREPARE YOUR DEFENSE';
    const progress=live?100*(state.waveStartCount-state.spawnLeft-state.enemies.length)/state.waveStartCount:state.wave>=state.totalWaves?100:0;
    $('waveProgress').style.width=`${clamp(progress,0,100)}%`;
    $('pauseButton').classList.toggle('active',state.paused);$('pauseButton').textContent=state.paused?'▶':'Ⅱ';$('speedButton').textContent=`${state.speed}×`;
  }

  function startWave(){
    if(state.phase!=='prep'||state.wave>=state.totalWaves)return;
    state.wave++;state.phase='wave';state.paused=false;
    const n=7+state.wave*2+(state.wave===10?1:0);state.spawnLeft=n;state.waveStartCount=n;state.spawnTimer=.25;state.spawnInterval=Math.max(.43,.88-state.wave*.035);
    renderAllUI();showToast(state.wave===10?'THE MEADOW GUARDIAN APPROACHES!':`WAVE ${state.wave} · STAY SHARP!`);
  }
  function chooseOffer(){
    if(state.wave>=state.totalWaves){state.phase='ended';renderAllUI();showEnd(true);return;}
    state.phase='choice';state.paused=false;
    const unowned=Object.keys(types).filter(k=>!state.unlocked.includes(k));
    state.offerTypes=[];
    if(unowned.length){const shuffled=unowned.sort(()=>Math.random()-.5);state.offerTypes=shuffled.slice(0,Math.min(3,shuffled.length));}
    else state.offerTypes=Object.keys(types).sort(()=>Math.random()-.5).slice(0,3);
    renderAllUI();showChoices();
  }
  function showChoices(){
    const cont=$('choiceCards');cont.innerHTML='';const fresh=state.offerTypes.some(k=>!state.unlocked.includes(k));
    $('choiceTitle').textContent=fresh?'A new friend is near!':'A little field training';
    $('choiceCopy').textContent=fresh?'Choose one companion to join your team.':'Choose a companion to receive a permanent boost.';
    for(const key of state.offerTypes){const c=types[key],isNew=!state.unlocked.includes(key),b=document.createElement('button');b.className='choice-card';b.innerHTML=`<span class="choice-emoji" style="background:${c.pale}">${c.emoji}</span><strong>${c.name}</strong><small>${c.type} · ${c.ability.toUpperCase()}</small><em>${isNew?'✦ RECRUIT':'⬆ +15% TEAM DAMAGE'}</em>`;
      b.addEventListener('click',()=>{if(isNew){state.unlocked.push(key);showToast(`${c.name} joined the team!`);}else{state.towers.filter(t=>t.kind===key).forEach(t=>t.bonus=(t.bonus||0)+.15);state.energy+=45;showToast(`${c.name} trained up · +45 energy`);} $('choiceModal').classList.add('hidden');state.phase='prep';state.selectedType=state.unlocked[0];state.selectedTower=null;renderAllUI();});cont.appendChild(b);
    }
    $('choiceModal').classList.remove('hidden');
  }
  function showEnd(win){$('endIcon').textContent=win?'✦':'♥';$('endIcon').style.background=win?'#eaf4e6':'#fae8e4';$('endIcon').style.color=win?'#63a367':'#d87b70';$('endTitle').textContent=win?'Trail defended!':'The trail was overrun';$('endCopy').textContent=win?'All 10 waves cleared! Fernvale is safe thanks to you and your companions.':'Your base fell, but your companions fought bravely. Give the trail another try.';$('endOverlay').classList.remove('hidden');}
  function placeTower(x,y){
    if(!state.selectedType){showToast('Choose a companion first');return;}
    if(pathCells.has(`${x},${y}`)){showToast('The wild trail needs to stay clear');return;}
    if(state.towers.some(t=>t.x===x&&t.y===y)){showToast('That tile is already occupied');return;}
    const c=types[state.selectedType];if(state.energy<c.cost){showToast('Not enough energy yet');return;}
    state.energy-=c.cost;const tower={kind:state.selectedType,x,y,level:1,cooldown:.2,invested:c.cost,bonus:0,anim:0};state.towers.push(tower);state.selectedTower=tower;renderAllUI();
  }
  function upgradeSelected(){const t=state.selectedTower;if(!t||t.level>=3)return;const cost=upgradeCost(t);if(state.energy<cost){showToast('Not enough energy to evolve');return;}state.energy-=cost;t.invested+=cost;t.level++;renderAllUI();showToast(`${types[t.kind].evolutions[t.level-1]} evolved!`);}
  function sellSelected(){const t=state.selectedTower;if(!t)return;state.energy+=Math.floor(t.invested*.7);state.towers=state.towers.filter(x=>x!==t);state.selectedTower=null;renderAllUI();showToast('Creature returned to your team');}
  function hitMap(e){if(state.phase==='ended')return;const r=canvas.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W,py=(e.clientY-r.top)/r.height*H,tile=tileAt(px,py);if(!tile)return;
    const tower=state.towers.find(t=>t.x===tile.x&&t.y===tile.y);if(tower){state.selectedTower=tower;state.selectedType=tower.kind;renderAllUI();return;}
    if(pathCells.has(`${tile.x},${tile.y}`)){showToast('That’s the wild trail — build beside it!');return;}
    if(state.selectedTower){state.selectedTower=null;renderAllUI();}
    else placeTower(tile.x,tile.y);
  }
  canvas.addEventListener('pointerdown',hitMap);
  $('waveButton').addEventListener('click',startWave);
  $('pauseButton').addEventListener('click',()=>{if(state.phase==='wave'){state.paused=!state.paused;updateHud();}});
  $('speedButton').addEventListener('click',()=>{state.speed=state.speed===1?2:1;updateHud();});
  $('restartButton').addEventListener('click',()=>location.reload());

  function enemyAt(e){
    const idx=Math.min(pathCenters.length-2,Math.floor(e.progress));const f=e.progress-idx,a=pathCenters[idx],b=pathCenters[idx+1];
    return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};
  }
  function spawnEnemy(){
    const w=state.wave,boss=w===10&&state.spawnLeft===1;
    const roll=Math.random();let kind=boss?'boss':w>2&&roll<.2?'flying':w>1&&roll<.48?'tank':'fast';
    const hp=boss?1550:Math.round((kind==='tank'?100:kind==='flying'?48:62)*(1+w*.22));
    state.enemies.push({kind,progress:0,hp,maxHp:hp,speed:boss?22:kind==='fast'?49:kind==='flying'?62:25,slow:0,poison:0,poisonTick:0,stun:0,bob:rand(0,6),boss});
    state.spawnLeft--;state.spawnTimer=state.spawnInterval;
  }
  function typeMultiplier(t,e){
    if(t.kind==='water'&&e.kind==='fire')return 1.45;
    if(t.kind==='fire'&&e.kind==='grass')return 1.45;
    if(t.kind==='grass'&&e.kind==='water')return 1.45;
    if(t.kind==='electric'&&e.kind==='flying')return 1.55;
    if(t.kind==='rock'&&e.kind==='tank')return 1.25;
    if(t.kind==='wind'&&e.kind==='flying')return 1.25;
    if((t.kind==='fire'&&e.kind==='water')||(t.kind==='water'&&e.kind==='grass')||(t.kind==='grass'&&e.kind==='fire'))return .72;
    return 1;
  }
  function fireAt(t,e,target){
    const c=types[t.kind],mult=typeMultiplier(t,e),dmg=Math.round(c.damage*(1+(t.level-1)*.65)*(1+(t.bonus||0))*mult);
    state.projectiles.push({x:tileCenter(t.x,t.y).x,y:tileCenter(t.x,t.y).y-10,tx:target.x,ty:target.y,kind:t.kind,target:e,damage:dmg,life:.2});
    t.cooldown=c.rate/(1+(t.level-1)*.12);t.anim=.24;
  }
  function damageEnemy(e,damage,kind){
    if(e.hp<=0)return;e.hp-=damage;const p=enemyAt(e);state.floats.push({x:p.x+rand(-8,8),y:p.y-18,text:`-${Math.round(damage)}`,color:types[kind]?.color||'#fff',life:.8});
    if(e.hp<=0){e.hp=0;state.energy+=e.boss?150:e.kind==='tank'?13:e.kind==='flying'?10:9;for(let i=0;i<8;i++)state.particles.push({x:p.x,y:p.y,vx:rand(-45,45),vy:rand(-50,20),life:rand(.3,.7),color:e.boss?'#ffd36d':'#f3c278',size:rand(2,5)});}
  }
  function update(dt){
    if(state.toastTimer>0){state.toastTimer-=dt;if(state.toastTimer<=0)$('toast').classList.remove('show');}
    if(state.paused||state.phase!=='wave')return;
    dt*=state.speed;state.frame+=dt;
    state.spawnTimer-=dt;if(state.spawnLeft>0&&state.spawnTimer<=0)spawnEnemy();
    for(const e of state.enemies){
      if(e.hp<=0)continue;
      if(e.poison>0){e.poison-=dt;e.poisonTick-=dt;if(e.poisonTick<=0){e.poisonTick=.55;damageEnemy(e,5,'grass');}}
      if(e.stun>0)e.stun-=dt;
      if(e.slow>0)e.slow-=dt;
      if(e.stun<=0)e.progress+=e.speed*(e.slow>0?.55:1)*dt/ CELL;
      if(e.progress>=pathCenters.length-1){e.hp=0;state.hp=Math.max(0,state.hp-(e.boss?6:1));for(let i=0;i<12;i++)state.particles.push({x:pathCenters.at(-1).x,y:pathCenters.at(-1).y,vx:rand(-55,55),vy:rand(-60,10),life:.5,color:'#ed8177',size:rand(2,5)});}
    }
    state.enemies=state.enemies.filter(e=>e.hp>0);
    for(const t of state.towers){t.cooldown-=dt;t.anim=Math.max(0,t.anim-dt);if(t.cooldown<=0){const c=types[t.kind],p=tileCenter(t.x,t.y);let target=null,best=Infinity;
      for(const e of state.enemies){if(e.hp<=0)continue;const q=enemyAt(e),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<=c.range&&e.progress>best)continue;if(d<=c.range&&e.progress>=(target?.progress??-1)){target=e;best=e.progress;}}
      if(target)fireAt(t,target,enemyAt(target));
    }}
    for(const p of state.projectiles){p.life-=dt;const q=enemyAt(p.target);p.tx=q.x;p.ty=q.y-3;if(p.life<=0){const t=state.towers.find(a=>a.kind===p.kind);const ability=types[p.kind].ability;damageEnemy(p.target,p.damage,p.kind);
        if(ability==='slow')p.target.slow=Math.max(p.target.slow,1.3);
        if(ability==='poison'){p.target.poison=Math.max(p.target.poison,3);p.target.poisonTick=.1;}
        if(ability==='stun'&&Math.random()<.3)p.target.stun=.65;
        if(ability==='area damage'){const center=enemyAt(p.target);for(const other of state.enemies)if(other!==p.target&&other.hp>0){const o=enemyAt(other);if(Math.hypot(o.x-center.x,o.y-center.y)<52)damageEnemy(other,p.damage*.45,p.kind);}
          for(let i=0;i<9;i++)state.particles.push({x:center.x,y:center.y,vx:rand(-35,35),vy:rand(-35,35),life:.35,color:types[p.kind].color,size:rand(2,4)});
        }
      }}
    state.projectiles=state.projectiles.filter(p=>p.life>0);
    for(const p of state.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=65*dt;}
    state.particles=state.particles.filter(p=>p.life>0);
    for(const f of state.floats){f.life-=dt;f.y-=25*dt;}
    state.floats=state.floats.filter(f=>f.life>0);
    if(state.hp<=0){state.phase='ended';showEnd(false);}
    else if(state.spawnLeft===0&&state.enemies.length===0)chooseOffer();
    updateHud();
  }

  function drawBackground(){
    ctx.fillStyle='#dcebc9';ctx.fillRect(0,0,W,H);
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      const px=OX+x*CELL,py=OY+y*CELL,seed=(x*17+y*31)%13;
      ctx.fillStyle=(x+y)%2?'#deedca':'#d9e8c5';ctx.fillRect(px,py,CELL-2,CELL-2);
      ctx.fillStyle='rgba(102,143,89,.09)';ctx.fillRect(px+5,py+5,CELL-12,2);
      if(!pathCells.has(`${x},${y}`)&&seed<3){ctx.fillStyle=seed===0?'#99c78a':'#b4d69a';ctx.fillRect(px+13+seed*9,py+17+seed*8,3,7);ctx.fillRect(px+16+seed*9,py+15+seed*8,3,4);}
      if(!pathCells.has(`${x},${y}`)&&seed===5){ctx.fillStyle='#f8eab1';ctx.fillRect(px+49,py+47,3,3);ctx.fillStyle='#e99da1';ctx.fillRect(px+52,py+44,3,3);}
    }
    for(let i=0;i<path.length;i++){
      const [x,y]=path[i],px=OX+x*CELL,py=OY+y*CELL;
      ctx.fillStyle='#d4b989';ctx.fillRect(px+1,py+1,CELL-4,CELL-4);
      ctx.fillStyle='#dfc69e';ctx.fillRect(px+4,py+4,CELL-10,CELL-10);
      ctx.fillStyle='rgba(135,104,64,.1)';ctx.fillRect(px+6,py+CELL-12,CELL-14,4);
      if(i>0&&i<path.length-1&&i%2===0){const q=tileCenter(x,y);ctx.fillStyle='rgba(171,133,84,.2)';ctx.fillRect(q.x-3,q.y-3,6,6);}
    }
    const a=pathCenters[0],z=pathCenters.at(-1);
    // trail entrance and trainer's little base
    ctx.fillStyle='#709a68';ctx.beginPath();ctx.arc(a.x-14,a.y,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#eff4dd';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText('↠',a.x-14,a.y+5);
    ctx.fillStyle='#7898bd';ctx.fillRect(z.x-17,z.y-20,34,40);ctx.fillStyle='#9eb9d5';ctx.fillRect(z.x-13,z.y-16,26,32);ctx.fillStyle='#5e7ea2';ctx.beginPath();ctx.moveTo(z.x-21,z.y-14);ctx.lineTo(z.x,z.y-31);ctx.lineTo(z.x+21,z.y-14);ctx.fill();ctx.fillStyle='#fff5db';ctx.fillRect(z.x-3,z.y+1,7,15);ctx.fillStyle='#446589';ctx.font='bold 8px "DM Mono",monospace';ctx.fillText('BASE',z.x,z.y+30);
  }
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function drawTower(t){
    const c=types[t.kind],p=tileCenter(t.x,t.y),sel=t===state.selectedTower;
    if(sel){ctx.beginPath();ctx.arc(p.x,p.y,c.range,0,Math.PI*2);ctx.fillStyle='rgba(104,158,105,.09)';ctx.fill();ctx.strokeStyle='rgba(76,139,83,.32)';ctx.setLineDash([5,5]);ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle='rgba(61,97,57,.16)';ctx.beginPath();ctx.ellipse(p.x,p.y+16,24,10,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=sel?'#c5dfa9':'#c6dcae';ctx.beginPath();ctx.ellipse(p.x,p.y+13,23,10,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.pale;ctx.beginPath();ctx.arc(p.x,p.y-2,21,0,Math.PI*2);ctx.fill();ctx.strokeStyle=sel?'#559564':'#fffefa';ctx.lineWidth=sel?3:2;ctx.stroke();
    ctx.font='25px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(c.emoji,p.x,p.y-3);
    if(t.level>1){ctx.fillStyle='#e2ae4f';ctx.font='10px sans-serif';ctx.fillText(t.level===2?'✦':'✦✦',p.x+15,p.y-18);}
    if(t.anim>0){ctx.strokeStyle=c.color;ctx.globalAlpha=t.anim/.24;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y-2,24+(1-t.anim/.24)*8,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
  }
  function drawEnemy(e){
    const p=enemyAt(e),s=e.boss?1.5:1;ctx.save();ctx.translate(p.x,p.y+Math.sin(state.frame*5+e.bob)*2);ctx.scale(s,s);
    if(e.kind==='flying'){ctx.fillStyle='rgba(84,118,123,.15)';ctx.beginPath();ctx.ellipse(0,12,16,5,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e7f8e9';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-7,-4);ctx.quadraticCurveTo(-22,-18,-17,-3);ctx.moveTo(7,-4);ctx.quadraticCurveTo(22,-18,17,-3);ctx.stroke();}
    if(e.boss){ctx.fillStyle='#9f718a';ctx.beginPath();ctx.arc(0,0,21,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d9a369';ctx.beginPath();ctx.moveTo(-14,-14);ctx.lineTo(-18,-29);ctx.lineTo(-5,-19);ctx.moveTo(14,-14);ctx.lineTo(18,-29);ctx.lineTo(5,-19);ctx.fill();ctx.font='28px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('👹',0,-2);}
    else{const col=e.kind==='tank'?'#777c83':e.kind==='flying'?'#7594a2':'#bd776d';ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(0,1,e.kind==='tank'?15:12,e.kind==='tank'?12:11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,.26)';ctx.beginPath();ctx.arc(-4,-4,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(4,-2,2.4,0,Math.PI*2);ctx.arc(-3,-2,2.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#39413d';ctx.beginPath();ctx.arc(4,-2,1.2,0,Math.PI*2);ctx.arc(-3,-2,1.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#855e57';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,4,3,0,Math.PI);ctx.stroke();}
    ctx.restore();const bw=e.boss?54:31,bh=e.boss?5:3.5,bx=p.x-bw/2,by=p.y-(e.boss?34:20);
    ctx.fillStyle='rgba(57,61,55,.35)';roundRect(bx,by,bw,bh,3);ctx.fill();ctx.fillStyle=e.boss?'#f0bd57':e.kind==='tank'?'#d37d6e':'#d99b69';roundRect(bx,by,bw*clamp(e.hp/e.maxHp,0,1),bh,3);ctx.fill();
    if(e.poison>0){ctx.fillStyle='#78bd63';ctx.beginPath();ctx.arc(p.x+12,p.y-12,3,0,Math.PI*2);ctx.fill();}if(e.stun>0){ctx.fillStyle='#f6d05f';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('✦',p.x+13,p.y-15);}
  }
  function draw(){
    ctx.clearRect(0,0,W,H);drawBackground();ctx.strokeStyle='rgba(168,129,79,.24)';ctx.lineWidth=2;ctx.setLineDash([3,8]);ctx.beginPath();pathCenters.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);
    for(const t of state.towers)drawTower(t);for(const e of state.enemies)drawEnemy(e);
    for(const p of state.projectiles){ctx.strokeStyle=types[p.kind].color;ctx.lineWidth=3;ctx.globalAlpha=.72;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.tx,p.ty);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.tx,p.ty,3,0,Math.PI*2);ctx.fill();}
    for(const p of state.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);}ctx.globalAlpha=1;
    for(const f of state.floats){ctx.globalAlpha=clamp(f.life*2,0,1);ctx.fillStyle=f.color;ctx.font='bold 11px "DM Mono",monospace';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;
    if(state.phase==='prep'&&state.selectedType&&!state.selectedTower){const c=types[state.selectedType];ctx.fillStyle='rgba(255,255,255,.88)';roundRect(OX+5,OY+5,190,25,7);ctx.fill();ctx.fillStyle='#57765c';ctx.font='500 10px "DM Mono",monospace';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(`${c.emoji}  ${c.name} selected · tap to place`,OX+14,OY+18);}
    if(state.paused&&state.phase==='wave'){ctx.fillStyle='rgba(38,59,46,.42)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fffefa';ctx.font='900 30px Nunito,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('PAUSED',W/2,H/2-5);ctx.font='500 11px "DM Mono",monospace';ctx.fillText('TAP PLAY TO RESUME',W/2,H/2+20);}
  }
  let last=performance.now();function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop);}
  renderAllUI();requestAnimationFrame(loop);
})();
