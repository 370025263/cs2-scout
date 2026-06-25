'use strict';
function updateStatsOverlay(){
  const ov=document.getElementById('stats-overlay');
  if(!selectedPlayers.length){ov.style.display='none';return;}
  ov.style.display='block';
  ov.innerHTML=selectedPlayers.map(sp=>{
    const p=sp.player;
    let K=0,D=0,rwk=0,rTotal=0;const W={};
    let distSum=0,distCnt=0,smkCnt=0,flshCnt=0,heCnt=0;
    p.matches.forEach(m=>m.rounds.forEach(r=>{
      K+=r.kills.length;D+=r.deaths.length;rTotal++;
      if(r.kills.length>0) rwk++;
      r.kills.forEach(k=>{
        if(k.weapon){const wk=k.weapon;W[wk]=(W[wk]||0)+1;}
        if(k.x!=null&&k.other_x!=null){
          const dx=k.other_x-k.x,dy=k.other_y-k.y;
          distSum+=Math.sqrt(dx*dx+dy*dy)/39.37;distCnt++;
        }
      });
      if(r.weapon_counts) Object.entries(r.weapon_counts).forEach(([w,c])=>W[w]=(W[w]||0)+c);
      smkCnt+=(r.smokes||[]).length;
      flshCnt+=(r.flashes||[]).length;
      heCnt+=(r.hes||[]).length;
    }));
    const kdVal=D>0?K/D:K;
    const kdStr=D>0?kdVal.toFixed(2):K+'';
    const kc=kdVal>=1?'good':'bad';
    const pct=rTotal>0?Math.round(rwk/rTotal*100):0;
    const kpr=rTotal>0?(K/rTotal).toFixed(2):'0';
    const avgDist=distCnt>0?Math.round(distSum/distCnt):0;
    const top=Object.entries(W).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const team=p.matches[0]?.team||'?';
    const teamCol=team==='CT'?'var(--ct)':'var(--t)';
    const utilStr=`S:${smkCnt} F:${flshCnt} H:${heCnt}`;
    return`<div class="so-player">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <div class="so-name" style="color:${sp.color}">${p.name}</div>
        <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${teamCol}18;color:${teamCol};border:1px solid ${teamCol}44;font-weight:700">${team}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="val ${kc}" style="font-size:12px;font-family:'JetBrains Mono',monospace">${kdStr}</span>
        <span style="font-size:9px;color:var(--text-dim)">${K}K ${D}D</span>
      </div>
      ${kdBar(kdVal)}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:3px;margin-bottom:2px">
        <span style="font-size:9px;color:var(--text-dim)">KPR <span style="color:var(--text-mid);font-family:'JetBrains Mono',monospace">${kpr}</span></span>
        ${avgDist>0?`<span style="font-size:9px;color:var(--text-dim)">avg <span style="color:var(--text-mid);font-family:'JetBrains Mono',monospace">${avgDist}m</span></span>`:''}
        <span style="font-size:9px;color:var(--text-dim);font-family:'JetBrains Mono',monospace">${utilStr}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div>${top.map(([w,c])=>`<span class="weapon-tag" style="color:${weaponColor(w)}">${w}</span>`).join('')}</div>
        <span style="font-size:9px;color:var(--text-dim)">${pct}% active</span>
      </div>
      <div style="height:2px;border-radius:1px;background:var(--border2)">
        <div style="height:100%;width:${pct}%;border-radius:1px;background:${sp.color}88"></div>
      </div>
    </div>`;
  }).join('');
  // KPR comparison bar (when 2+ players selected)
  if(selectedPlayers.length>=2){
    const bars=selectedPlayers.map(sp=>{
      let K=0,rTotal=0;
      sp.player.matches.forEach(m=>m.rounds.forEach(r=>{K+=r.kills.length;rTotal++;}));
      const kpr=rTotal>0?K/rTotal:0;
      return{name:sp.player.name.slice(0,9),kpr,color:sp.color};
    });
    const maxKpr=Math.max(...bars.map(b=>b.kpr),0.01);
    ov.innerHTML+=`<div style="border-top:1px solid var(--border2);padding:6px 8px 4px;margin-top:0">
      <div style="font-size:8px;color:var(--text-dim);margin-bottom:4px;letter-spacing:.05em">KPR</div>
      ${bars.map(b=>`<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
        <span style="font-size:8px;color:${b.color};min-width:62px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.name}</span>
        <div style="flex:1;height:3px;background:var(--border2);border-radius:2px">
          <div style="height:100%;width:${(b.kpr/maxKpr*100).toFixed(1)}%;background:${b.color};border-radius:2px;transition:width .3s"></div>
        </div>
        <span style="font-size:8px;color:var(--text-dim);font-family:'JetBrains Mono',monospace;min-width:26px;text-align:right">${b.kpr.toFixed(2)}</span>
      </div>`).join('')}
    </div>`;
  }
}

function updateScoreBar(){
  let ct=0,t=0;
  // Use the spawn-derived per-round side (rc.team), not the inverted match.team label.
  selectedPlayers.forEach(sp=>sp.rounds.forEach(rc=>{
    if(rc.team==='CT') ct+=rc.kills.length; else t+=rc.kills.length;
  }));
  document.getElementById('score-ct').textContent=ct;
  document.getElementById('score-t').textContent=t;
  document.getElementById('score-bar').style.display=selectedPlayers.length?'flex':'none';
}

// ══════════════════════════════════════════════════════
//  TIMELINE
// ══════════════════════════════════════════════════════
function updateTimeline(){
  const pct=maxRoundTick>0?(currentTick/maxRoundTick*100):0;
  document.getElementById('tl-fill').style.width=pct+'%';
  document.getElementById('tl-thumb').style.left=`calc(${pct}% - 6px)`;
  tlSlider.value=currentTick;tlSlider.max=maxRoundTick;
  const f=t=>{const s=Math.floor(t/16);return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  document.getElementById('tl-cur').textContent=f(currentTick);
  document.getElementById('tl-max').textContent=f(maxRoundTick);
}

function updateClock(){
  const cp=document.getElementById('clock-panel');
  const cv=document.getElementById('clock-val');
  if(!selectedPlayers.length){cp.style.display='none';return;}
  cp.style.display='block';
  // CS2 round = ~115s from first tick; buy phase ~15s
  const elapsed=currentTick/16;
  const remaining=Math.max(0,115-elapsed);
  const m=Math.floor(remaining/60);
  const s=Math.floor(remaining%60);
  cv.textContent=`${m}:${String(s).padStart(2,'0')}`;
  cv.className='ck-val'+(remaining<10?' crit':remaining<30?' warn':'');
}

document.getElementById('tl-slider').oninput=function(){
  _prevTick=parseInt(this.value);currentTick=_prevTick;
  clearEffectPools();
  redraw();
};

// Timeline hover — show timestamp preview
(function(){
  const wrap=document.querySelector('.tl-wrap');
  const tip=document.getElementById('tl-tip');
  const fmt=t=>{const s=Math.floor(t/16);return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  wrap.addEventListener('mousemove',e=>{
    if(!maxRoundTick){tip.style.display='none';return;}
    const rect=wrap.getBoundingClientRect();
    const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    const tick=Math.round(pct*maxRoundTick);
    tip.textContent=fmt(tick);
    tip.style.left=(e.clientX-rect.left)+'px';
    tip.style.display='block';
  });
  wrap.addEventListener('mouseleave',()=>tip.style.display='none');
})();

function togglePlay(){
  if(!selectedPlayers.length) return;
  playing=!playing;
  const b=document.getElementById('playBtn');
  b.textContent=playing?'⏸':'▶';b.classList.toggle('on',playing);
  if(playing) requestAnimationFrame(animLoop);
}

let _lastTs=0,_killPauseUntil=0;
function animLoop(ts){
  if(!playing||!selectedPlayers.length) return;
  const dt=ts-_lastTs;_lastTs=ts;
  if(dt>0&&dt<200){
    speed=parseFloat(document.getElementById('speed').value)||2;
    const prevT=currentTick;
    if(ts<_killPauseUntil){
      // Hold position during kill-pause
    } else {
      currentTick+=(dt/1000)*16*speed;
      // Auto-pause 550ms when a kill occurs during playback
      const active=getAllRounds();
      const hitKill=active.some(rc=>rc.kills.some(k=>k.tick>prevT&&k.tick<=currentTick));
      if(hitKill) _killPauseUntil=ts+550;
    }
  }
  if(currentTick>=maxRoundTick){
    currentTick=maxRoundTick;playing=false;
    document.getElementById('playBtn').textContent='▶';
    document.getElementById('playBtn').classList.remove('on');
    redraw();return;
  }
  redraw();
  requestAnimationFrame(animLoop);
}

// ══════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════
function buildPlayerList(){
  if(!scoutData) return;
  const sec=document.getElementById('players-section');sec.innerHTML='';
  let ct=0,t=0;
  scoutData.players.forEach((p,idx)=>{
    if(!p.matches?.length) return;
    const team=rosterSide(p); // spawn-derived; match.team label is inverted
    if(team==='CT') ct++;else t++;
    const K=p.matches.reduce((s,m)=>s+m.rounds.reduce((rs,r)=>rs+r.kills.length,0),0);
    const D=p.matches.reduce((s,m)=>s+m.rounds.reduce((rs,r)=>rs+r.deaths.length,0),0);
    const kd=D>0?(K/D).toFixed(1):K+'';
    const rounds=p.matches.reduce((s,m)=>s+m.rounds.length,0);
    const card=document.createElement('div');
    card.className='player-card '+team;card.dataset.name=p.name;
    card.style.animationDelay=(idx*.02)+'s';
    card.onclick=()=>togglePlayer(p.name);
    card.innerHTML=`
      <div class="avatar">${p.name.slice(0,2).toUpperCase()}</div>
      <div class="info">
        <div class="name">${p.name}</div>
        <div class="meta">${p.matches.length}m · ${rounds}r</div>
      </div>
      <span class="kd-badge">${kd}</span>
    `;
    sec.appendChild(card);
  });
  document.getElementById('player-count').textContent=`${scoutData.players.length} players`;
  const tot=ct+t;
  if(tot>0){
    const pCT=Math.max(10,Math.round(ct/tot*100));
    document.getElementById('team-dist-bar').innerHTML=
      `<div class="ct-bar" style="flex:${pCT}">${ct} CT</div><div class="t-bar" style="flex:${100-pCT}">${t} T</div>`;
  }
}

function togglePlayer(name){
  if(!scoutData) return;
  const idx=selectedPlayers.findIndex(sp=>sp.player.name===name);
  if(idx>=0){
    selectedPlayers.splice(idx,1);
  } else {
    if(selectedPlayers.length>=5) return;
    const player=scoutData.players.find(p=>p.name===name);
    if(!player) return;
    const slot=selectedPlayers.length;
    const color=PALETTE[slot]; // roster-identity color (sidebar / killfeed / stats)
    const{rounds,maps}=buildPlayerRounds(player,slot);
    selectedPlayers.push({player,slot,color,rounds});
  }
  updateCardStates();
  rebuildAll();
  if(!selectedPlayers.length){
    document.getElementById('round-mini').style.display='none';
    document.getElementById('stats-overlay').style.display='none';
    document.getElementById('score-bar').style.display='none';
    document.getElementById('tl-events').innerHTML='';
    document.getElementById('roundCount').textContent='—';
    setInfo('Ready',false);
    redraw();
    return;
  }
  document.getElementById('round-mini').style.display='block';
}

function updateCardStates(){
  document.querySelectorAll('.player-card').forEach(el=>{
    const sp=selectedPlayers.find(s=>s.player.name===el.dataset.name);
    if(sp){
      el.classList.add('sel');
      el.style.setProperty('--p-color',sp.color);
      el.querySelector('.avatar').style.background=sp.color+'28';
      el.querySelector('.avatar').style.color=sp.color;
    } else {
      el.classList.remove('sel');
      el.style.removeProperty('--p-color');
      const team=el.classList.contains('CT')?'CT':'T';
      el.querySelector('.avatar').style.background=team==='CT'?'rgba(77,158,255,.1)':'rgba(255,140,26,.1)';
      el.querySelector('.avatar').style.color=team==='CT'?'var(--ct)':'var(--t)';
    }
  });
  // Selection badges
  const sb=document.getElementById('sel-badges');sb.innerHTML='';
  selectedPlayers.forEach(sp=>{
    const b=document.createElement('span');
    b.className='sel-badge';b.style.background=sp.color;b.style.color=sp.color;
    b.title=sp.player.name;sb.appendChild(b);
  });
}

// ══════════════════════════════════════════════════════
//  FILTERS & TOGGLES
// ══════════════════════════════════════════════════════
function onFilter(){currentTick=0;_zoneActivityPool=[];_heatPosCache=null;_heatKillCache=null;_zoneKillCache=null;buildTimelineEvents();redraw();}

function tgl(k){
  show[k]=!show[k];
  const btnMap={trails:'tr',labels:'la',nades:'nd',fires:'fi',kills:'ki',deaths:'de',heat:'ht'};
  document.getElementById((btnMap[k]||k)+'Btn').classList.toggle('on',show[k]);
  redraw();
}

function clearAll(){
  selectedPlayers=[];_kfEvents=[];_zoneActivityPool=[];_heatPosCache=null;_heatKillCache=null;_zoneKillCache=null;currentTick=0;maxRoundTick=0;playing=false;
  document.getElementById('players-section').innerHTML='';
  document.getElementById('stats-overlay').style.display='none';
  document.getElementById('round-mini').style.display='none';
  document.getElementById('alive-hud').style.display='none';
  document.getElementById('killfeed').innerHTML='';
  document.getElementById('score-bar').style.display='none';
  document.getElementById('tl-events').innerHTML='';
  document.getElementById('roundCount').textContent='—';
  document.getElementById('roundFilter').innerHTML='<option value="">All</option>';
  document.getElementById('playBtn').textContent='▶';
  document.getElementById('playBtn').classList.remove('on');
  document.getElementById('player-count').textContent='0 players';
  document.getElementById('team-dist-bar').innerHTML='<div class="ct-bar">CT</div><div class="t-bar">T</div>';
  document.getElementById('sel-badges').innerHTML='';
  setInfo('Ready — click players to compare on map',false);
  scoutData=null;
  fetch('scout_data.json').then(r=>r.json()).then(initData).catch(e=>setInfo('Load error: '+e.message,false));
}

// ══════════════════════════════════════════════════════
//  STEAM LOOKUP
// ══════════════════════════════════════════════════════
async function scoutSteam(){
  const sid=document.getElementById('steamInput').value.trim();
  if(!sid||sid.length<10) return;
  setInfo('Querying wmpvp.com…',true,true);
  try{
    const r=await fetch('https://api.wmpvp.com/api/csgo/home/match/list',{
      method:'POST',
      headers:{'Content-Type':'application/json','token':'d1097da03df2a706653409f91de42537c2ef41cb','appversion':'3.5.4.172'},
      body:JSON.stringify({csgoSeasonId:'recent',dataSource:3,mySteamId:76561198125512291,page:1,pageSize:10,pvpType:-1,toSteamId:parseInt(sid)}),
    });
    const d=await r.json();
    if(!d.data?.matchList?.length){setInfo('No matches found for '+sid,false);return;}
    setInfo(`Found ${d.data.matchList.length} matches — ${sid}`,true);
    document.getElementById('info-extra').textContent=d.data.matchList.slice(0,3).map(m=>m.matchId?.replace('PVP@','')||'?').join(' · ');
    document.getElementById('info-extra').style.display='inline';
    document.getElementById('info-sep2').style.display='inline';
  }catch(e){setInfo('API error: '+e.message,false);}
}

function setInfo(msg,active,loading=false){
  document.getElementById('info-text').textContent=msg;
  const dot=document.getElementById('sdot');
  dot.className='sdot'+(loading?' loading':active?'':' idle');
  document.getElementById('info-extra').style.display='none';
  document.getElementById('info-sep2').style.display='none';
}

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
function initData(d){
  scoutData=d;buildPlayerList();
  setInfo(`Loaded ${d.players.length} players · click to compare`,true);
}

// Team filter pill click handlers
document.getElementById('teamFilter').querySelectorAll('.tf-pill').forEach(btn=>{
  btn.onclick=()=>{
    document.getElementById('teamFilter').querySelectorAll('.tf-pill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    onFilter();
  };
});

fetch('scout_data.json').then(r=>r.json()).then(initData)
  .catch(e=>setInfo('Failed to load scout_data.json — '+e.message,false));

RADAR.onload=()=>{redraw();};
