'use strict';
// ══════════════════════════════════════════════════════
//  BUILD ROUND CACHE FOR ONE PLAYER
// ══════════════════════════════════════════════════════
function buildPlayerRounds(player,slot){
  const rounds=[];
  const maps=new Set();
  player.matches.forEach(m=>{
    m.rounds.forEach(r=>{
      if(!r.positions||r.positions.length<2) return;
      const minTick=r.positions[0].tick;
      const nd=e=>({...e,tick:e.tick-minTick});
      // Side per round is read from the ACTUAL spawn position — the only ground truth.
      // The parser's match.team field is unreliable (verified inverted on every demo in
      // this set: players labelled 'CT' spawn at de_dust2's T-spawn). On de_dust2 CT spawns
      // up by the bomb sites (high world-Y, top of radar; cluster ≈ +2415) and T spawns at
      // the bottom (low world-Y; cluster ≈ -786). Reading each round's own spawn needs no
      // team label and no MR12/halftime guesswork — it is correct by construction.
      const _map=m.map||'de_dust2';
      const _sy=r.positions[0].y;
      let _rt;
      if(_map==='de_dust2'){
        _rt = _sy>800 ? 'CT' : 'T';
      } else {
        // Maps without a spawn rule: fall back to the (inverted) label, flipped, + MR12 swap.
        const _rn=r.round_num;
        const _opp=m.team==='CT'?'T':'CT';
        const _half=_rn<=24?Math.floor((_rn-1)/12):2+Math.floor((_rn-25)/3);
        _rt=_half%2===0?_opp:m.team;
      }
      rounds.push({
        matchIdx:m,roundIdx:r.round_num,team:_rt,slot,
        map:m.map||'de_dust2',color:sideColor(_rt,slot),playerName:player.name,
        positions:r.positions.map(p=>({tick:p.tick-minTick,x:p.x,y:p.y})),
        smokes:r.smokes.map(nd),flashes:r.flashes.map(nd),
        hes:r.hes.map(nd),fires:r.fires.map(nd),
        kills:r.kills.map(nd),deaths:r.deaths.map(nd),
      });
      maps.add(m.map||'de_dust2');
    });
  });
  return{rounds,maps};
}

function rebuildAll(){
  _heatPosCache=null;_heatKillCache=null;_zoneKillCache=null;
  // Recompute maxRoundTick and filters from all selected players
  maxRoundTick=0;
  const allMaps=new Set(),allRoundNums=new Set();
  selectedPlayers.forEach(sp=>{
    sp.rounds.forEach(rc=>{
      const ts=[
        ...rc.positions.map(p=>p.tick),
        ...rc.smokes.map(s=>s.tick+540),
        ...rc.flashes.map(f=>f.tick+36),
        ...rc.hes.map(h=>h.tick+54),
        ...rc.kills.map(k=>k.tick),
        ...rc.deaths.map(d=>d.tick),
      ];
      const mx=ts.length?Math.max(...ts):0;
      if(mx>maxRoundTick) maxRoundTick=mx;
      allMaps.add(rc.map);
      allRoundNums.add(rc.roundIdx);
    });
  });

  // Map filter
  const mf=document.getElementById('mapFilter');
  const prevM=mf.value;
  mf.innerHTML='<option value="">All Maps</option>';
  allMaps.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;mf.appendChild(o);});
  if(prevM&&allMaps.has(prevM)) mf.value=prevM;

  // Round filter
  const rf=document.getElementById('roundFilter');
  const prevR=rf.value;
  rf.innerHTML='<option value="">All</option>';
  Array.from(allRoundNums).sort((a,b)=>a-b).forEach(n=>{
    const o=document.createElement('option');o.value=n;o.textContent='Rnd '+n;rf.appendChild(o);
  });
  if(prevR) rf.value=prevR;

  tlSlider.max=maxRoundTick;
  buildTimelineEvents();
  updatePhaseStrip();
  rebuildKillFeed();
  updateStatsOverlay();
  updateScoreBar();
  const rc=getAllRounds().length;
  document.getElementById('roundCount').textContent=rc+'r';
  setInfo(`${selectedPlayers.map(sp=>sp.player.name).join(', ')} · ${rc} rounds`,true);
  redraw();
}

function buildTimelineEvents(){
  const el=document.getElementById('tl-events');el.innerHTML='';
  if(!maxRoundTick) return;
  // Tick mark factory
  const mkTick=(pct,color,top,height,radius,tooltip,onClick,isClickable)=>{
    const d=document.createElement('div');
    const br=radius?'50%':(radius===0?'0':'1px');
    d.style.cssText=`position:absolute;left:${pct.toFixed(2)}%;top:${top}px;width:2px;height:${height}px;`+
      `border-radius:${br};background:${color};transform:translateX(-50%);`+
      (isClickable?'cursor:pointer;pointer-events:auto;z-index:6;':'opacity:.55;');
    d.title=tooltip;
    if(isClickable&&onClick) d.onclick=(e)=>{e.stopPropagation();onClick();};
    if(isClickable){
      d.onmouseenter=()=>{d.style.opacity='.95';d.style.transform='translateX(-50%) scaleX(1.8)';};
      d.onmouseleave=()=>{d.style.opacity='';d.style.transform='translateX(-50%)';};
    }
    el.appendChild(d);
    return d;
  };
  const mkDot=(pct,color,size,top,tooltip,onClick)=>{
    const d=document.createElement('div');
    d.style.cssText=`position:absolute;left:${pct.toFixed(2)}%;top:${top}px;width:${size}px;height:${size}px;`+
      `border-radius:50%;background:${color};transform:translateX(-50%);`+
      `cursor:pointer;pointer-events:auto;z-index:6;opacity:.72;transition:transform .1s,opacity .1s;`;
    d.title=tooltip;
    d.onclick=(e)=>{e.stopPropagation();onClick();};
    d.onmouseenter=()=>{d.style.transform='translateX(-50%) scale(2.2)';d.style.opacity='1';};
    d.onmouseleave=()=>{d.style.transform='translateX(-50%)';d.style.opacity='.72';};
    el.appendChild(d);
  };

  // .tl-wrap height=24px; track centered at 12px, 3px thick → track spans 10.5–13.5px
  // Kill ticks: above track (top:1→10px)
  // Nade dots: straddle track (top:11px, 3px)
  // Death ticks: below track (top:15→22px)
  getAllRounds().forEach(rc=>{
    // Smokes (teal dot on track)
    rc.smokes.forEach(s=>{
      const pct=s.tick/maxRoundTick*100;if(pct<0||pct>100) return;
      mkDot(pct,'#7fc4e0',3,11,`Smoke • ${rc.playerName}`,
        ()=>{_prevTick=Math.max(0,s.tick-8);currentTick=_prevTick;redraw();});
    });
    // Flashes (soft white dot on track)
    rc.flashes.forEach(f=>{
      const pct=f.tick/maxRoundTick*100;if(pct<0||pct>100) return;
      mkDot(pct,'#d8d0ff',3,11,`Flash • ${rc.playerName}`,
        ()=>{_prevTick=Math.max(0,f.tick-8);currentTick=_prevTick;redraw();});
    });
    // HEs (lime dot on track)
    rc.hes.forEach(h=>{
      const pct=h.tick/maxRoundTick*100;if(pct<0||pct>100) return;
      mkDot(pct,'#30d890',3,11,`HE • ${rc.playerName}`,
        ()=>{_prevTick=Math.max(0,h.tick-8);currentTick=_prevTick;redraw();});
    });
    // Deaths (gold tick below track)
    rc.deaths.forEach(d=>{
      const pct=d.tick/maxRoundTick*100;if(pct<0||pct>100) return;
      mkTick(pct,'#ffd060',15,7,false,`Death • ${d.weapon||'?'} • ${rc.playerName}`,
        ()=>{_prevTick=Math.max(0,d.tick-16);currentTick=_prevTick;clearEffectPools();redraw();},true);
    });
    // Kills (player identity color, tall tick above track)
    rc.kills.forEach(k=>{
      const pct=k.tick/maxRoundTick*100;if(pct<0||pct>100) return;
      mkTick(pct,rc.color,1,9,false,`Kill • ${k.weapon||'?'} • ${rc.playerName}`,
        ()=>{_prevTick=Math.max(0,k.tick-16);currentTick=_prevTick;clearEffectPools();redraw();},true);
    });
  });
}

function rebuildKillFeed(){
  _kfEvents=[];
  selectedPlayers.forEach(sp=>{
    sp.rounds.forEach(rc=>{
      rc.kills.forEach( k=>_kfEvents.push({...k,type:'kill', name:sp.player.name,color:sp.color}));
      rc.deaths.forEach(d=>_kfEvents.push({...d,type:'death',name:sp.player.name,color:sp.color}));
    });
  });
  _kfEvents.sort((a,b)=>a.tick-b.tick);
}

function updateKillFeed(){
  const el=document.getElementById('killfeed');el.innerHTML='';
  if(!_kfEvents.length) return;
  const WINDOW=120;
  const vis=_kfEvents.filter(e=>e.tick>=currentTick-WINDOW&&e.tick<=currentTick);
  vis.slice(-5).reverse().forEach(e=>{
    const div=document.createElement('div');
    div.className='kf-entry'+(e.type==='death'?' death':'');
    const tintCol=e.type==='kill'?e.color:'#ffd060';
    div.style.background=`linear-gradient(90deg,rgba(5,7,14,.94) 45%,${tintCol}10 100%)`;
    const wc=weaponColor(e.weapon||'');
    const ageTicks=currentTick-e.tick;
    const ageSec=Math.round(ageTicks/16);
    const ageStr=ageSec<2?'now':`${ageSec}s`;
    const dx=(e.other_x||0)-(e.x||0),dy=(e.other_y||0)-(e.y||0);
    const dist=dx||dy?Math.round(Math.sqrt(dx*dx+dy*dy)/39.37):0;
    const distStr=dist>2?` ${dist}m`:'';
    const bar=`<div class="kf-bar" style="background:${e.type==='kill'?e.color:'#ffd060'}"></div>`;
    if(e.type==='kill'){
      div.innerHTML=`${bar}
        <span class="kf-name" style="color:${e.color}">${e.name}</span>
        <span class="kf-ico">✕</span>
        <span class="kf-wpn" style="color:${wc}">${e.weapon||'?'}${distStr}</span>
        <span class="kf-age">${ageStr}</span>`;
    } else {
      div.innerHTML=`${bar}
        <span class="kf-ico" style="color:#ffd060">✝</span>
        <span class="kf-wpn" style="color:${wc}">${e.weapon||'?'}</span>
        <span class="kf-name" style="color:var(--text-mid);margin-left:2px">${e.name}</span>
        <span class="kf-age">${ageStr}</span>`;
    }
    el.appendChild(div);
  });
}

function updateAliveHUD(active){
  const el=document.getElementById('alive-hud');
  if(!active.length){el.style.display='none';return;}
  const ct=[],t_=[];
  active.forEach(rc=>{
    const dead=rc.deaths.some(d=>d.tick<=currentTick);
    const K=rc.kills.filter(k=>k.tick<=currentTick).length;
    const D=rc.deaths.filter(d=>d.tick<=currentTick).length;
    (rc.team==='CT'?ct:t_).push({color:rc.color,dead,name:rc.playerName,K,D});
  });
  if(!ct.length&&!t_.length){el.style.display='none';return;}
  const mkDots=arr=>arr.map(p=>`<div class="ah-dot${p.dead?' dead':''}" style="background:${p.color}" title="${p.name}${p.dead?' [DEAD]':''} · ${p.K}K ${p.D}D"></div>`).join('');
  document.getElementById('ah-ct').innerHTML=mkDots(ct);
  document.getElementById('ah-t').innerHTML=mkDots(t_);
  const ctAlive=ct.filter(p=>!p.dead).length;
  const tAlive=t_.filter(p=>!p.dead).length;
  document.getElementById('ah-ct-cnt').textContent=ct.length?ctAlive:'—';
  document.getElementById('ah-t-cnt').textContent=t_.length?tAlive:'—';
  el.style.display='flex';
}

function updatePhaseStrip(){
  const el=document.getElementById('tl-phase');if(!maxRoundTick) return;
  const bp=Math.min(240/maxRoundTick*100,100).toFixed(1);
  const ep=Math.min(960/maxRoundTick*100,100).toFixed(1);
  const mp=Math.min(1440/maxRoundTick*100,100).toFixed(1);
  el.style.background=`linear-gradient(90deg,
    rgba(80,90,130,.55) 0%,rgba(80,90,130,.55) ${bp}%,
    rgba(48,216,144,.4) ${bp}%,rgba(48,216,144,.4) ${ep}%,
    rgba(255,208,96,.38) ${ep}%,rgba(255,208,96,.38) ${mp}%,
    rgba(255,60,90,.38) ${mp}%,rgba(255,60,90,.38) 100%)`;
}

function updateRoundMini(active){
  if(!active.length) return;
  const fr=document.getElementById('roundFilter').value;
  if(fr){document.getElementById('mini-round').textContent=fr;return;}
  const cur=active.find(rc=>currentTick>=rc.positions[0]?.tick&&currentTick<=rc.positions[rc.positions.length-1]?.tick);
  document.getElementById('mini-round').textContent=cur?cur.roundIdx:'—';
}

function kdBar(kd){
  const fill=Math.min(98,Math.round(kd/(kd+1)*100*1.48));
  const col=kd>=1.2?'var(--success)':kd>=0.8?'var(--gold)':'var(--kill)';
  return`<div style="height:3px;border-radius:2px;background:var(--border2);margin:3px 0 4px">
    <div style="height:100%;width:${fill}%;border-radius:2px;background:${col}"></div>
  </div>`;
}

