'use strict';
// ══════════════════════════════════════════════════════
//  CS2 Scout v19 — Stats overlay K/D bars + active%, kill marker hover tooltip
//  New: per-segment trail ribbon (alpha+width gradient), map zone text labels,
//       auto-pause 550ms on kill during playback, bombsite rings for mirage/inferno/ancient
// ══════════════════════════════════════════════════════

const MAP_META = {
  de_dust2:  {px:-2476,py:3239,s:4.4},
  de_mirage: {px:-3230,py:3713,s:5.7},
  de_inferno:{px:-2087,py:3870,s:4.8},
  de_nuke:   {px:-3453,py:3208,s:6.2},
  de_ancient:{px:-2950,py:3300,s:5.3},
  de_anubis: {px:-2850,py:3200,s:5.0},
};
function g2p(gx,gy,map='de_dust2'){
  const m=MAP_META[map]||MAP_META.de_dust2;
  return[(gx-m.px)/m.s,(m.py-gy)/m.s];
}

// ── Roster-identity palette (sidebar, killfeed, stats overlay) — distinct per selected player ──
const PALETTE = [
  '#4d9eff', // CT blue
  '#ff8c1a', // T orange
  '#30d890', // green
  '#ff3c5a', // red
  '#c084fc', // purple
];
// Map trajectory colors MUST follow the side played that round:
//   CT → blue family, T → orange family. Shade varies by player slot so up to
//   5 same-side players stay distinguishable.
const CT_SHADES = ['#4d9eff','#36c6ff','#7a8cff','#2f7be0','#19d3e6']; // blues / cyans
const T_SHADES  = ['#ff8c1a','#ffb347','#ff6a2c','#e0a000','#ff5e3a']; // oranges / ambers
function sideColor(team,slot){ return (team==='CT'?CT_SHADES:T_SHADES)[((slot%5)+5)%5]; }
// Side → team display colour (CT blue / T orange) — single source for the call sites below.
function teamHex(t){ return t==='CT'?'#4d9eff':'#ff8c1a'; }
// Clamp a camera offset so the zoomed map can't pan past its edges (CW===CH===1024).
function clampCam(v,z){ return Math.min(0,Math.max(CW*(1-z),v)); }
// Reset every transient broadcast-effect pool (kill flashes, floating text, beams, rings).
function clearEffectPools(){ flashPool=[]; textPool=[]; linePool=[]; ringPool=[]; }
// Roster identity side, from the player's first round-1 spawn (de_dust2: CT spawns high
// world-Y by the bomb sites, T spawns low). match.team is unreliable (verified inverted).
function rosterSide(p){
  for(const m of (p.matches||[])){
    if((m.map||'de_dust2')!=='de_dust2') continue;
    for(const r of (m.rounds||[])){
      if(r.round_num===1 && r.positions && r.positions.length) return r.positions[0].y>800?'CT':'T';
    }
  }
  // fallback for non-dust2: flip the inverted label
  return (p.matches[0].team==='CT')?'T':'CT';
}

// Interpolate position between ticks
function lerpPos(positions,tick){
  if(!positions.length) return null;
  if(tick<=positions[0].tick) return[positions[0].x,positions[0].y];
  const last=positions[positions.length-1];
  if(tick>=last.tick) return[last.x,last.y];
  let lo=0,hi=positions.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;positions[mid].tick<=tick?lo=mid:hi=mid;}
  const a=positions[lo],b=positions[hi],t=(tick-a.tick)/(b.tick-a.tick);
  return[a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t];
}

// Per-map radar overviews, lazy-loaded + cached (assets/radars/<map>.png).
// Missing maps fall back to the tactical grid drawn in redraw().
const _radarCache={};
function getRadar(map){
  let img=_radarCache[map];
  if(!img){ img=new Image(); img.onload=()=>redraw(); img.src='assets/radars/'+(map||'de_dust2')+'.png'; _radarCache[map]=img; }
  return img;
}
// RADAR points at the current map's overview; redraw() reassigns it per frame.
let RADAR=getRadar('de_dust2');
// Real CS2 grenade-effect icons (from cs-demo-manager 2D radar assets) — drawn at landing point
const NADE_IMG={};['smoke','flashbang','he','molotov','decoy'].forEach(n=>{NADE_IMG[n]=new Image();NADE_IMG[n].src='assets/nade_icons/'+n+'.png';});

// ── State ──
let scoutData=null;
let selectedPlayers=[]; // [{player, color, rounds}]
let playing=false,speed=2;
let show={trails:true,labels:true,nades:true,fires:false,kills:true,deaths:true,heat:false};
let currentTick=0,maxRoundTick=0,_prevTick=-1;
let _kfEvents=[];
// Broadcast-style flash effects: [{cx,cy,color,born,type}]
let flashPool=[];
// Floating kill text: [{cx,cy,text,color,born}]
let textPool=[];
// Kill engagement beams: [{x1,y1,x2,y2,color,born}]
let linePool=[];
// Expanding kill rings at victim positions: [{cx,cy,color,born}]
let ringPool=[];
// Precomputed caches (invalidated on filter/data change)
let _heatPosCache=null,_heatKillCache=null,_zoneKillCache=null;
// Camera zoom/pan state
let camZoom=1,camX=0,camY=0;
let _isPanning=false,_panStartX=0,_panStartY=0,_panCamX0=0,_panCamY0=0;
// Kill border flash state
let _borderFlash=null; // {color, born}
// Zone activity flash: [{map,zone,born,color}]
let _zoneActivityPool=[];
// Cinematic letterbox end-tick (multi-kill/ACE)
let _letterboxUntil=0;

const canvas=document.getElementById('c');
const ctx=canvas.getContext('2d');
const mapZone=document.getElementById('map-zone');
const tlSlider=document.getElementById('tl-slider');
const CW=1024,CH=1024;

function fitCanvas(){
  const z=mapZone.getBoundingClientRect();
  const f=Math.min(z.width-10,z.height-10,CW);
  canvas.style.width=f+'px';canvas.style.height=f+'px';
}
window.addEventListener('resize',()=>{fitCanvas();redraw();});
fitCanvas();

// Keyboard
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT') return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  // Ctrl+Arrow or K/J: jump between kills
  if((e.code==='ArrowRight'&&e.ctrlKey)||e.code==='KeyK'){e.preventDefault();jumpKill(1);return;}
  if((e.code==='ArrowLeft' &&e.ctrlKey)||e.code==='KeyJ'){e.preventDefault();jumpKill(-1);return;}
  if(e.code==='ArrowRight'){currentTick=Math.min(currentTick+64,maxRoundTick);_prevTick=currentTick;redraw();}
  if(e.code==='ArrowLeft') {currentTick=Math.max(currentTick-64,0);_prevTick=currentTick;redraw();}
  if(e.code==='BracketLeft') { speed=Math.max(0.25,speed/2); document.getElementById('speed').value=speed; }
  if(e.code==='BracketRight'){ speed=Math.min(16,speed*2);   document.getElementById('speed').value=speed; }
  if(e.code==='KeyH') tgl('heat');
  if(e.code==='KeyT') tgl('trails');
  if(e.code==='KeyL') tgl('labels');
  if(e.code==='KeyN') tgl('nades');
  // R: rewind to start
  if(e.code==='KeyR'){currentTick=0;_prevTick=-1;clearEffectPools();redraw();}
  // C: cycle team side filter (All → CT → T → All)
  if(e.code==='KeyC'){
    const pills=[...document.getElementById('teamFilter').querySelectorAll('.tf-pill')];
    const cur=pills.findIndex(p=>p.classList.contains('active'));
    pills.forEach(p=>p.classList.remove('active'));
    pills[(cur+1)%pills.length].classList.add('active');
    onFilter();
  }
  // 1-9: jump to 10%-90% of round
  if(/^Digit[1-9]$/.test(e.code)&&!e.ctrlKey&&!e.altKey&&maxRoundTick){
    currentTick=Math.round(maxRoundTick*parseInt(e.key)/10);
    _prevTick=currentTick;clearEffectPools();redraw();
  }
  // 0: reset camera zoom
  if(e.code==='Digit0'&&!e.ctrlKey&&!e.altKey){camZoom=1;camX=0;camY=0;canvas.style.cursor='crosshair';redraw();}
  // ?: toggle shortcuts panel
  if(e.code==='Slash'&&e.shiftKey){e.preventDefault();toggleShortcuts();}
});

// Canvas hover — find nearest player dot and show tooltip
// ── Zoom/pan: wheel to zoom, drag to pan ──
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const rect=canvas.getBoundingClientRect();
  const sc=CW/rect.width;
  const rawX=(e.clientX-rect.left)*sc,rawY=(e.clientY-rect.top)*sc;
  const wx=(rawX-camX)/camZoom,wy=(rawY-camY)/camZoom;
  const factor=e.deltaY<0?1.18:1/1.18;
  const nz=Math.min(5,Math.max(1,camZoom*factor));
  camX=clampCam(rawX-wx*nz,nz);
  camY=clampCam(rawY-wy*nz,nz);
  camZoom=nz;
  canvas.style.cursor=camZoom>1.01?'grab':'crosshair';
  redraw();
},{passive:false});

canvas.addEventListener('mousedown',e=>{
  if(e.button!==0||camZoom<=1.01) return;
  _isPanning=true;
  _panStartX=e.clientX;_panStartY=e.clientY;
  _panCamX0=camX;_panCamY0=camY;
  canvas.style.cursor='grabbing';
});
canvas.addEventListener('mouseup',()=>{
  _isPanning=false;
  canvas.style.cursor=camZoom>1.01?'grab':'crosshair';
});
canvas.addEventListener('dblclick',e=>{
  if(camZoom>=4.5){camZoom=1;camX=0;camY=0;canvas.style.cursor='crosshair';redraw();return;}
  const rect=canvas.getBoundingClientRect();
  const sc=CW/rect.width;
  const rawX=(e.clientX-rect.left)*sc,rawY=(e.clientY-rect.top)*sc;
  const wx=(rawX-camX)/camZoom,wy=(rawY-camY)/camZoom;
  const nz=Math.min(5,camZoom*2);
  camX=clampCam(rawX-wx*nz,nz);
  camY=clampCam(rawY-wy*nz,nz);
  camZoom=nz;
  canvas.style.cursor='grab';
  redraw();
});

canvas.addEventListener('mousemove',e=>{
  if(_isPanning){
    const rect=canvas.getBoundingClientRect();
    const sc=CW/rect.width;
    camX=clampCam(_panCamX0+(e.clientX-_panStartX)*sc,camZoom);
    camY=clampCam(_panCamY0+(e.clientY-_panStartY)*sc,camZoom);
    redraw();return;
  }
  if(!selectedPlayers.length) return;
  const tip=document.getElementById('hover-tip');
  const rect=canvas.getBoundingClientRect();
  const sc=CW/rect.width;
  // Convert mouse → world coordinates (accounting for camera transform)
  const rawX=(e.clientX-rect.left)*sc,rawY=(e.clientY-rect.top)*sc;
  const mx=(rawX-camX)/camZoom,my=(rawY-camY)/camZoom;
  const active=getAllRounds();
  let best=null,bestD=999;
  active.forEach(rc=>{
    if(rc.deaths.some(d=>d.tick<=currentTick)) return;
    const raw=lerpPos(rc.positions,currentTick);if(!raw) return;
    const[px,py]=g2p(raw[0],raw[1],rc.map);
    const d=Math.sqrt((px-mx)**2+(py-my)**2);
    if(d<bestD){bestD=d;best={rc,px,py};}
  });
  if(best&&bestD<28){
    const K=best.rc.kills.filter(k=>k.tick<=currentTick).length;
    const D=best.rc.deaths.filter(d=>d.tick<=currentTick).length;
    const raw2=lerpPos(best.rc.positions,currentTick);
    const zone=raw2?getNearestZone(raw2[0],raw2[1],best.rc.map):null;
    tip.innerHTML=`<span style="color:${best.rc.color};font-weight:700">${best.rc.playerName}</span>
      <span style="color:var(--text-dim);font-size:10px;margin-left:6px">${best.rc.team}</span>
      <span style="color:var(--text-dim);margin-left:8px;font-family:JetBrains Mono,monospace">K:${K} D:${D}</span>`+
      (zone?`<span style="color:#8fa8c8;font-size:9px;margin-left:8px;font-family:'JetBrains Mono',monospace">@ ${zone}</span>`:'');
    const screenX=best.px*camZoom+camX,screenY=best.py*camZoom+camY;
    const cssX=screenX/CW*rect.width,cssY=screenY/CH*rect.height;
    tip.style.left=(rect.left-mapZone.getBoundingClientRect().left+cssX+14)+'px';
    tip.style.top =(rect.top -mapZone.getBoundingClientRect().top +cssY-24)+'px';
    tip.style.display='block';
  } else {
    // Fall back: check kill markers
    let kBest=null,kBestD=999;
    if(show.kills) active.forEach(rc=>{
      rc.kills.forEach(k=>{
        if(k.tick>currentTick) return;
        const[vx,vy]=g2p(k.other_x,k.other_y,rc.map);
        const d=Math.sqrt((vx-mx)**2+(vy-my)**2);
        if(d<kBestD){kBestD=d;kBest={rc,vx,vy,k};}
      });
    });
    if(kBest&&kBestD<18){
      const wc=weaponColor(kBest.k.weapon);
      tip.innerHTML=`<span style="color:${kBest.rc.color};font-weight:700">${kBest.rc.playerName}</span>
        <span style="color:var(--text-dim);font-size:9px;margin-left:6px">✕</span>
        <span style="color:${wc};font-weight:600;margin-left:6px;font-family:'JetBrains Mono',monospace">${kBest.k.weapon||'?'}</span>`;
      const screenX=kBest.vx*camZoom+camX,screenY=kBest.vy*camZoom+camY;
      const cssX=screenX/CW*rect.width,cssY=screenY/CH*rect.height;
      tip.style.left=(rect.left-mapZone.getBoundingClientRect().left+cssX+12)+'px';
      tip.style.top =(rect.top -mapZone.getBoundingClientRect().top +cssY-22)+'px';
      tip.style.display='block';
    } else {
      tip.style.display='none';
    }
  }
});
canvas.addEventListener('mouseleave',()=>{
  _isPanning=false;
  canvas.style.cursor=camZoom>1.01?'grab':'crosshair';
  document.getElementById('hover-tip').style.display='none';
});

function saveScreenshot(){
  if(!selectedPlayers.length) return;
  const a=document.createElement('a');
  a.download='cs2scout_frame.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
}
function toggleShortcuts(){
  document.getElementById('shortcuts-panel').classList.toggle('on');
}

function jumpKill(dir){
  const ticks=getAllRounds().flatMap(rc=>rc.kills.map(k=>k.tick)).sort((a,b)=>a-b);
  if(!ticks.length) return;
  let target;
  if(dir>0) target=ticks.find(t=>t>currentTick+5);
  else       target=[...ticks].reverse().find(t=>t<currentTick-5);
  if(target!=null){currentTick=Math.max(0,target-16);_prevTick=currentTick;clearEffectPools();redraw();}
}

