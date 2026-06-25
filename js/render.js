'use strict';
// ══════════════════════════════════════════════════════
//  ALL ROUNDS FROM ALL SELECTED PLAYERS (flat list)
// ══════════════════════════════════════════════════════
function getAllRounds(){
  const fm=document.getElementById('mapFilter').value;
  const _tfA=document.getElementById('teamFilter').querySelector('.tf-pill.active');
  const ft=_tfA?_tfA.dataset.val:'';
  const fr=document.getElementById('roundFilter').value;
  return selectedPlayers.flatMap(sp=>
    sp.rounds.filter(rc=>
      (!fm||rc.map===fm)&&(!ft||rc.team===ft)&&(!fr||String(rc.roundIdx)===fr)
    )
  );
}

// ══════════════════════════════════════════════════════
//  DRAW
// ══════════════════════════════════════════════════════
function redraw(){
  canvas.width=CW;canvas.height=CH;

  // Select the radar for the map currently in view (falls back to dust2).
  const _radarMap=document.getElementById('mapFilter').value||selectedPlayers[0]?.rounds[0]?.map||(scoutData&&scoutData.map)||'de_dust2';
  RADAR=getRadar(_radarMap);

  // ── Apply camera transform (zoom/pan) ──
  ctx.save();
  ctx.setTransform(camZoom,0,0,camZoom,camX,camY);

  // Background / map
  if(RADAR.complete&&RADAR.naturalWidth>0){
    ctx.drawImage(RADAR,0,0,CW,CH);
    ctx.fillStyle='rgba(0,0,0,0.22)';ctx.fillRect(0,0,CW,CH);
  } else {
    ctx.fillStyle='#080c12';ctx.fillRect(0,0,CW,CH);
    // Tactical grid for maps without radar
    ctx.save();
    ctx.strokeStyle='rgba(30,45,70,.45)';ctx.lineWidth=0.5;
    for(let x=0;x<=CW;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke();}
    for(let y=0;y<=CH;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke();}
    ctx.strokeStyle='rgba(40,60,100,.22)';ctx.lineWidth=1.2;
    for(let x=0;x<=CW;x+=256){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke();}
    for(let y=0;y<=CH;y+=256){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke();}
    ctx.font='9px "JetBrains Mono",monospace';ctx.fillStyle='rgba(50,70,110,.35)';ctx.textAlign='left';
    for(let x=0;x<CW;x+=256) for(let y=0;y<CH;y+=256) ctx.fillText(`${x>>2},${y>>2}`,x+4,y+12);
    ctx.restore();
  }

  const hasPlayers=selectedPlayers.length>0;
  document.getElementById('empty-state').style.display=hasPlayers?'none':'flex';
  if(!hasPlayers) return;

  const active=getAllRounds();

  // ── Map annotations ──
  const mapName=document.getElementById('mapFilter').value||selectedPlayers[0]?.rounds[0]?.map||'de_dust2';
  drawZoneLabels(mapName);
  // Bombsite danger: fraction 0-1 based on nearest live T player proximity
  const _bsDanger=(gx,gy)=>{
    if(currentTick<=0||!active.length) return 0;
    const[bsx,bsy]=g2p(gx,gy,mapName);
    return Math.min(1,active.filter(rc=>rc.team==='T'&&!rc.deaths.some(d=>d.tick<=currentTick)).reduce((mx,rc)=>{
      const raw=lerpPos(rc.positions,currentTick);if(!raw) return mx;
      const[px,py]=g2p(raw[0],raw[1],rc.map);
      return Math.max(mx,Math.max(0,1-Math.sqrt((px-bsx)**2+(py-bsy)**2)/130));
    },0));
  };
  if(mapName==='de_dust2'){
    drawBombsite(-1430,2220,'B','#30d890',_bsDanger(-1430,2220));
    drawBombsite(1560,2150,'A','#ff4060',_bsDanger(1560,2150));
  } else if(mapName==='de_mirage'){
    drawBombsite(-333,1600,'A','#ff4060',_bsDanger(-333,1600));
    drawBombsite(-1500,470,'B','#30d890',_bsDanger(-1500,470));
  } else if(mapName==='de_inferno'){
    drawBombsite(2400,1310,'B','#30d890',_bsDanger(2400,1310));
    drawBombsite(850,330,'A','#ff4060',_bsDanger(850,330));
  } else if(mapName==='de_ancient'){
    drawBombsite(-600,1200,'A','#ff4060',_bsDanger(-600,1200));
    drawBombsite(-2200,1500,'B','#30d890',_bsDanger(-2200,1500));
  }

  // Radar sweep — slow rotating wedge over the map (ambient broadcast aesthetic)
  if(currentTick>0){
    const _swAng=((currentTick*0.014)%(Math.PI*2));
    const _swR=CW*0.74,_swCx=CW/2,_swCy=CH/2;
    ctx.save();
    const _swGrd=ctx.createRadialGradient(_swCx,_swCy,0,_swCx,_swCy,_swR);
    _swGrd.addColorStop(0,'rgba(77,158,255,0.06)');
    _swGrd.addColorStop(0.65,'rgba(77,158,255,0.025)');
    _swGrd.addColorStop(1,'rgba(77,158,255,0)');
    ctx.fillStyle=_swGrd;
    ctx.beginPath();ctx.moveTo(_swCx,_swCy);
    ctx.arc(_swCx,_swCy,_swR,_swAng-0.24,_swAng+0.24);
    ctx.closePath();ctx.fill();
    ctx.globalAlpha=0.045;ctx.strokeStyle='#4d9eff';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(_swCx,_swCy);
    ctx.lineTo(_swCx+Math.cos(_swAng)*_swR,_swCy+Math.sin(_swAng)*_swR);ctx.stroke();
    ctx.restore();
  }

  if(show.heat) drawHeatmap(active);

  // ── Detect new kills/deaths for broadcast flash ──
  if(_prevTick < currentTick){
    // First blood detection: total kills across all active rounds before _prevTick
    const priorKills=active.reduce((s,r)=>s+r.kills.filter(k=>k.tick<=_prevTick).length,0);
    let newKillCount=0;
    active.forEach(rc=>{
      rc.kills.forEach(k=>{
        if(k.tick>_prevTick&&k.tick<=currentTick){
          const[vx,vy]=g2p(k.other_x,k.other_y,rc.map);
          const[kx,ky]=g2p(rc.positions[0]?.x||k.x,rc.positions[0]?.y||k.y,rc.map);
          const raw=lerpPos(rc.positions,k.tick);
          const[kpx,kpy]=raw?g2p(raw[0],raw[1],rc.map):[kx,ky];
          flashPool.push({cx:vx,cy:vy,color:'#ff3c5a',born:currentTick,type:'kill'});
          flashPool.push({cx:kpx,cy:kpy,color:rc.color,born:currentTick,type:'shooter'});
          const isFirstBlood=(priorKills+newKillCount)===0;
          textPool.push({cx:kpx,cy:kpy,text:isFirstBlood?'FIRST BLOOD':'KILL',color:isFirstBlood?'#ffd060':rc.color,born:currentTick});
          newKillCount++;
          // engagement beam drawn in drawRound (persistent, scrub-safe)
          ringPool.push({cx:vx,cy:vy,color:isFirstBlood?'#ffd060':weaponColor(k.weapon),born:currentTick});
          if(isFirstBlood) ringPool.push({cx:vx,cy:vy,color:'#ffd060',born:currentTick-8}); // extra ring
          _borderFlash={color:isFirstBlood?'#ffd060':rc.color,born:currentTick};
          // Multi-kill streak detection (per player, per round)
          const _multiKillN=rc.kills.filter(k2=>k2.tick<=currentTick).length;
          const _multiMap={2:'DOUBLE',3:'TRIPLE',4:'QUAD',5:'ACE'};
          const _mText=_multiMap[_multiKillN]||(_multiKillN>5?'ACE':null);
          if(_mText){
            const _mCol=_multiKillN>=5?'#ffd060':_multiKillN>=4?'#ff3040':_multiKillN>=3?'#ff6020':'#ffa030';
            textPool.push({cx:kpx,cy:kpy-18,text:_mText,color:_mCol,born:currentTick,dur:72});
            ringPool.push({cx:kpx,cy:kpy,color:_mCol,born:currentTick-14});
            if(_multiKillN>=5) _borderFlash={color:'#ffd060',born:currentTick};
            // Cinematic letterbox on quad-kill or ACE
            if(_multiKillN>=4) _letterboxUntil=currentTick+90;
          }
          // Zone activity flash
          const vZone=getNearestZone(k.other_x,k.other_y,rc.map);
          if(vZone) _zoneActivityPool.push({map:rc.map,zone:vZone,born:currentTick,color:teamHex(rc.team)});
        }
      });
      rc.deaths.forEach(d=>{
        if(d.tick>_prevTick&&d.tick<=currentTick){
          const[dx,dy]=g2p(d.x,d.y,rc.map);
          flashPool.push({cx:dx,cy:dy,color:'#ffd060',born:currentTick,type:'death'});
          textPool.push({cx:dx,cy:dy,text:'✝ '+(d.weapon||''),color:rc.color,born:currentTick});
        }
      });
      if(show.nades) rc.flashes.forEach(f=>{
        const detTick=f.tick+18;
        if(detTick>_prevTick&&detTick<=currentTick){
          const[lx,ly]=_estimateLand(f.throw_x,f.throw_y,rc,f.tick,260);
          textPool.push({cx:lx,cy:ly,text:'FLASH',color:'#ffe060',born:currentTick});
        }
      });
    });
  }
  _prevTick=currentTick;

  // ── Position snapshots at kill/death moments (ghost rings behind live dots) ──
  if(active.length>=1) drawPositionSnapshots(active);

  // ── Squad proximity lines (behind player dots) ──
  drawSquadLines(active);

  // ── Per-round rendering ──
  active.forEach(rc=>drawRound(rc));

  // ── Name labels on top ──
  if(show.labels) active.forEach(rc=>drawLabel(rc));

  // ── Broadcast flash effects ──
  drawBroadcastFX();

  // ── Restore screen-space transform ──
  ctx.restore();

  // ── Cinematic edge vignette (screen space) ──
  drawVignette();

  // ── Round progress bar (top edge, screen space) ──
  drawRoundProgressBar();

  // ── Flashbang blind overlay (screen space) ──
  drawFlashBlind(active);

  // ── Kill border flash (screen space) ──
  drawKillBorderFlash();

  // ── Round scan effect (screen space) ──
  drawScanLine();

  // ── Mini-map inset (when zoomed) ──
  drawMiniMap(active);
  drawNadeLegend();
  // ── Off-screen player arrows (when zoomed) ──
  drawOffscreenArrows(active);

  // ── Broadcast-style scoreboard header (screen space) ──
  drawBroadcastHeader(active);

  // ── Round badge (screen space) ──
  drawRoundBadge(active);

  // ── "LIVE" / "PAUSED" badge (screen space) ──
  drawLiveBadge();

  // ── Clutch situation banner ──
  drawClutchBanner(active);

  // ── Live round stats HUD (bottom of canvas, screen space) ──
  drawRoundStatsHUD(active);

  // ── Round end stats card (screen space) ──
  drawEndCard(active);

  // ── Cinematic letterbox (quad-kill/ACE) ──
  drawLetterbox();

  updateTimeline();
  updateKillFeed();
  updateRoundMini(active);
  updateAliveHUD(active);
  updateClock();
  // Replay button: show only when round is finished and not playing
  const rb=document.getElementById('replay-btn');
  if(rb) rb.style.display=(active.length&&currentTick>=maxRoundTick&&!playing)?'block':'none';
}

// Map zone text labels (game-world coords)
const MAP_ZONES={
  de_dust2:[
    {gx:-200,gy:470,name:'MID'},
    {gx:-1450,gy:440,name:'LONG A'},
    {gx:820,gy:700,name:'SHORT'},
    {gx:-2350,gy:265,name:'T SPAWN'},
    {gx:1100,gy:560,name:'CT SPAWN'},
    {gx:-1640,gy:870,name:'TUNNELS'},
    {gx:-880,gy:1430,name:'LOWER MID'},
  ],
  de_mirage:[
    {gx:-333,gy:1600,name:'A SITE'},
    {gx:-1500,gy:470,name:'B SITE'},
    {gx:-140,gy:680,name:'MID'},
    {gx:-760,gy:1580,name:'CT'},
    {gx:440,gy:1320,name:'T SPAWN'},
  ],
  de_inferno:[
    {gx:2400,gy:1310,name:'B SITE'},
    {gx:850,gy:330,name:'A SITE'},
    {gx:1400,gy:650,name:'BANANA'},
    {gx:740,gy:900,name:'MID'},
    {gx:580,gy:1700,name:'CT SPAWN'},
    {gx:2780,gy:480,name:'T SPAWN'},
  ],
  de_ancient:[
    {gx:-600,gy:1200,name:'A SITE'},
    {gx:-2200,gy:1500,name:'B SITE'},
    {gx:-1000,gy:800,name:'MID'},
    {gx:100,gy:400,name:'CT SPAWN'},
    {gx:-2400,gy:200,name:'T SPAWN'},
    {gx:-1400,gy:1200,name:'CAVE'},
  ],
  de_nuke:[
    {gx:600,gy:1700,name:'A SITE'},
    {gx:600,gy:900,name:'B SITE'},
    {gx:-200,gy:1200,name:'OUTSIDE'},
    {gx:1400,gy:1200,name:'CT SPAWN'},
    {gx:1200,gy:2400,name:'T SPAWN'},
  ],
};

function getNearestZone(gx,gy,map){
  const zones=MAP_ZONES[map];if(!zones) return null;
  let bestZ=null,bestD=Infinity;
  zones.forEach(z=>{
    const d=Math.sqrt((gx-z.gx)**2+(gy-z.gy)**2);
    if(d<bestD){bestD=d;bestZ=z.name;}
  });
  return bestD<900?bestZ:null;
}

function drawZoneLabels(map){
  const zones=MAP_ZONES[map];if(!zones) return;
  ctx.save();
  if(!_zoneKillCache){
    _zoneKillCache={};
    getAllRounds().forEach(rc=>{
      rc.kills.forEach(k=>{
        const zn=getNearestZone(k.other_x,k.other_y,rc.map);
        if(zn) _zoneKillCache[zn]=(_zoneKillCache[zn]||0)+1;
      });
    });
  }
  const _zoneCounts=_zoneKillCache;
  // Purge stale zone flashes
  _zoneActivityPool=_zoneActivityPool.filter(a=>currentTick-a.born<80);
  ctx.font='600 9px "JetBrains Mono",monospace';ctx.textAlign='center';ctx.letterSpacing='0.1em';
  zones.forEach(z=>{
    const[x,y]=g2p(z.gx,z.gy,map);
    const tw=ctx.measureText(z.name).width;
    const activity=_zoneActivityPool.find(a=>a.map===map&&a.zone===z.name);
    const pulse=activity?Math.max(0,1-(currentTick-activity.born)/80):0;
    const cnt=_zoneCounts[z.name]||0;
    // Pill background — widen to fit kill count
    const pillW=tw+(cnt>0?20:10);
    ctx.globalAlpha=0.44+pulse*0.3;
    ctx.fillStyle=pulse>0?activity.color+'22':'rgba(6,10,20,.88)';
    ctx.strokeStyle=pulse>0?activity.color:`rgba(80,100,160,.38)`;ctx.lineWidth=pulse>0?1.2:0.8;
    ctx.beginPath();ctx.roundRect(x-tw/2-5,y-9,pillW,13,3);ctx.fill();ctx.stroke();
    // Outer glow ring on activity
    if(pulse>0.15){
      ctx.globalAlpha=pulse*0.45;ctx.strokeStyle=activity.color;ctx.lineWidth=2;
      ctx.beginPath();ctx.roundRect(x-tw/2-8,y-12,pillW+6,19,5);ctx.stroke();
    }
    // Label text
    ctx.globalAlpha=0.62+pulse*0.3;ctx.fillStyle=pulse>0?activity.color:'#bccee8';
    ctx.fillText(z.name,x,y+1);
    // Kill count badge
    if(cnt>0){
      ctx.globalAlpha=0.72+pulse*0.15;
      ctx.fillStyle=cnt>=8?'#ff4060':cnt>=4?'#ffa030':'rgba(160,190,230,.75)';
      ctx.font='500 7px "JetBrains Mono",monospace';ctx.textAlign='left';ctx.letterSpacing='0';
      ctx.fillText(`×${cnt}`,x+tw/2+3,y+1);
      ctx.letterSpacing='0.1em';ctx.font='600 9px "JetBrains Mono",monospace';
    }
  });
  ctx.restore();
}

function drawBombsite(gx,gy,lbl,col,danger=0){
  const[px,py]=g2p(gx,gy);
  ctx.save();
  if(danger>0.05){
    const dp=danger*(0.55+0.45*Math.abs(Math.sin(currentTick*0.12)));
    // Pulsing halo fill
    ctx.globalAlpha=dp*0.17;ctx.fillStyle=col;
    ctx.beginPath();ctx.arc(px,py,40,0,Math.PI*2);ctx.fill();
    // Danger ring (solid, animated)
    ctx.globalAlpha=dp*0.80;ctx.strokeStyle=col;ctx.lineWidth=2.0;
    ctx.beginPath();ctx.arc(px,py,34,0,Math.PI*2);ctx.stroke();
    // DANGER label above site
    ctx.globalAlpha=dp*0.88;ctx.fillStyle=col;
    ctx.font='bold 7px "JetBrains Mono",monospace';ctx.textAlign='center';ctx.letterSpacing='.08em';
    ctx.strokeStyle='rgba(0,0,0,.88)';ctx.lineWidth=2.2;
    ctx.strokeText('DANGER',px,py-42);ctx.fillText('DANGER',px,py-42);
    ctx.letterSpacing='0';
  }
  ctx.globalAlpha=Math.max(.14,.14+danger*0.32);
  ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.setLineDash([5,4]);
  ctx.beginPath();ctx.arc(px,py,30,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  ctx.globalAlpha=.65+danger*0.22;ctx.font='bold 15px "Inter",sans-serif';ctx.textAlign='center';
  ctx.lineWidth=3.5;ctx.strokeStyle='rgba(0,0,0,.92)';
  ctx.strokeText(lbl,px,py+5);ctx.fillStyle=col;ctx.fillText(lbl,px,py+5);
  ctx.restore();
}

function drawSquadLines(active){
  // Show thin team-colored line between same-team players when in close proximity
  const groups={CT:[],T:[]};
  active.forEach(rc=>{
    if(rc.deaths.some(d=>d.tick<=currentTick)) return;
    const raw=lerpPos(rc.positions,currentTick);if(!raw) return;
    const[px,py]=g2p(raw[0],raw[1],rc.map);
    (groups[rc.team]||(groups[rc.team]=[])).push({px,py});
  });
  ['CT','T'].forEach(team=>{
    const pts=groups[team];if(!pts||pts.length<2) return;
    const tc=teamHex(team);
    const _sqMap=active.find(r=>!r.deaths.some(d=>d.tick<=currentTick))?.map||'de_dust2';
    const _sqS=(MAP_META[_sqMap]||MAP_META.de_dust2).s;
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
      const dx=pts[j].px-pts[i].px,dy=pts[j].py-pts[i].py;
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d>180) continue;
      const f=Math.max(0,1-d/180);
      ctx.save();
      ctx.globalAlpha=f*0.28;ctx.strokeStyle=tc;ctx.lineWidth=1.1;
      ctx.setLineDash([3,5]);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(pts[i].px,pts[i].py);ctx.lineTo(pts[j].px,pts[j].py);ctx.stroke();
      ctx.setLineDash([]);
      // Distance label at midpoint
      const _sqDistM=Math.round(d*_sqS/39.37);
      if(_sqDistM>2&&_sqDistM<120){
        const _mx=(pts[i].px+pts[j].px)/2,_my=(pts[i].py+pts[j].py)/2;
        ctx.globalAlpha=f*0.55;ctx.font='500 6.5px "JetBrains Mono",monospace';ctx.textAlign='center';
        ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=1.8;
        ctx.strokeText(`${_sqDistM}m`,_mx,_my-4);ctx.fillStyle=tc;ctx.fillText(`${_sqDistM}m`,_mx,_my-4);
      }
      ctx.restore();
    }
    // STACK alert: 2+ players within 65px
    const clust=[];
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
      const dx=pts[j].px-pts[i].px,dy=pts[j].py-pts[i].py;
      if(Math.sqrt(dx*dx+dy*dy)<65){
        if(!clust.includes(i)) clust.push(i);
        if(!clust.includes(j)) clust.push(j);
      }
    }
    if(clust.length>=2){
      const cx=clust.reduce((s,i)=>s+pts[i].px,0)/clust.length;
      const cy=clust.reduce((s,i)=>s+pts[i].py,0)/clust.length;
      const pulse=0.55+0.35*Math.sin(currentTick*0.1);
      ctx.save();
      ctx.globalAlpha=pulse;
      ctx.font='bold 7px "JetBrains Mono",monospace';
      ctx.textAlign='center';
      ctx.strokeStyle='rgba(0,0,0,.75)';ctx.lineWidth=2.5;
      ctx.strokeText('STACK',cx,cy-20);
      ctx.fillStyle=tc;
      ctx.fillText('STACK',cx,cy-20);
      ctx.restore();
    }
  });
}

function drawPositionSnapshots(active){
  // At kill/death moments, draw dashed ghost rings for where all players were
  // CS2 broadcast "everyone's position when this happened" context
  const SNAP_DUR=62;
  const _drawSnap=(tick,ringColor,ringAlpha)=>{
    const age=currentTick-tick;
    if(age<0||age>SNAP_DUR) return;
    const fade=age<10?(age/10):Math.max(0,1-(age-10)/(SNAP_DUR-10));
    active.forEach(other=>{
      const raw=lerpPos(other.positions,tick);if(!raw) return;
      const[px,py]=g2p(raw[0],raw[1],other.map);
      const teamC=teamHex(other.team);
      ctx.save();
      ctx.globalAlpha=fade*ringAlpha;ctx.strokeStyle=ringColor||teamC;ctx.lineWidth=1.4;
      ctx.setLineDash([3,4]);
      ctx.beginPath();ctx.arc(px,py,10,0,Math.PI*2);ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha=fade*(ringAlpha*0.28);ctx.fillStyle=ringColor||teamC;
      ctx.beginPath();ctx.arc(px,py,10,0,Math.PI*2);ctx.fill();
      ctx.restore();
    });
  };
  active.forEach(rc=>{
    rc.kills.forEach(k=>_drawSnap(k.tick,null,0.30));
    if(active.length>=2) rc.deaths.forEach(d=>_drawSnap(d.tick,'#ffd060',0.22));
  });
}

function drawBroadcastFX(){
  const KILL_DUR=22, SHOOT_DUR=14, DEATH_DUR=20, TEXT_DUR=30, LINE_DUR=20;
  // Purge expired (first blood text lasts 54 ticks)
  flashPool=flashPool.filter(f=>{
    const DUR=f.type==='kill'?KILL_DUR:f.type==='shooter'?SHOOT_DUR:DEATH_DUR;
    return currentTick-f.born<DUR;
  });
  textPool=textPool.filter(t=>{const d=t.dur||(t.text==='FIRST BLOOD'?54:TEXT_DUR);return currentTick-t.born<d;});
  linePool=linePool.filter(l=>currentTick-l.born<LINE_DUR);

  // Draw kill engagement beams (shooter → victim)
  linePool.forEach(l=>{
    const age=currentTick-l.born, frac=age/LINE_DUR;
    const alpha=Math.max(0,(1-frac)*.72);
    ctx.save();
    ctx.globalAlpha=alpha; ctx.strokeStyle=l.color; ctx.lineWidth=1.4;
    ctx.setLineDash([5,4]); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(l.x1,l.y1); ctx.lineTo(l.x2,l.y2); ctx.stroke();
    ctx.setLineDash([]);
    // Arrowhead at victim end
    const ang=Math.atan2(l.y2-l.y1,l.x2-l.x1);
    ctx.globalAlpha=alpha*.8; ctx.fillStyle=l.color;
    ctx.beginPath();
    ctx.moveTo(l.x2,l.y2);
    ctx.lineTo(l.x2-7*Math.cos(ang-.45),l.y2-7*Math.sin(ang-.45));
    ctx.lineTo(l.x2-7*Math.cos(ang+.45),l.y2-7*Math.sin(ang+.45));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  });

  // Draw flash rings
  flashPool.forEach(f=>{
    const DUR=f.type==='kill'?KILL_DUR:f.type==='shooter'?SHOOT_DUR:DEATH_DUR;
    const age=currentTick-f.born, t=age/DUR;
    const alpha=Math.max(0,1-t)*( f.type==='shooter'?0.6:0.85 );
    const r=(f.type==='kill'?14:f.type==='shooter'?12:11)+age*( f.type==='kill'?3.2:2.5 );
    ctx.save();
    if(f.type==='kill'){
      // Outer ring
      ctx.strokeStyle=f.color; ctx.lineWidth=2.5; ctx.globalAlpha=alpha;
      ctx.beginPath();ctx.arc(f.cx,f.cy,r,0,Math.PI*2);ctx.stroke();
      // Inner glow
      const g=ctx.createRadialGradient(f.cx,f.cy,0,f.cx,f.cy,r*.6);
      g.addColorStop(0,f.color+'55');g.addColorStop(1,f.color+'00');
      ctx.fillStyle=g;ctx.globalAlpha=alpha*.7;ctx.beginPath();ctx.arc(f.cx,f.cy,r*.6,0,Math.PI*2);ctx.fill();
    } else if(f.type==='shooter'){
      // Pulse ring around shooter
      ctx.strokeStyle=f.color; ctx.lineWidth=2; ctx.globalAlpha=alpha*.9;
      ctx.beginPath();ctx.arc(f.cx,f.cy,r,0,Math.PI*2);ctx.stroke();
    } else {
      // Death: gold cross-spark
      ctx.strokeStyle=f.color; ctx.lineWidth=2; ctx.globalAlpha=alpha;
      const d=r*.5;
      ctx.beginPath();ctx.moveTo(f.cx-d,f.cy-d);ctx.lineTo(f.cx+d,f.cy+d);ctx.stroke();
      ctx.beginPath();ctx.moveTo(f.cx+d,f.cy-d);ctx.lineTo(f.cx-d,f.cy+d);ctx.stroke();
    }
    ctx.restore();
  });

  // Draw floating kill/event text
  textPool.forEach(t=>{
    const dur=t.dur||(t.text==='FIRST BLOOD'?54:TEXT_DUR);
    const age=currentTick-t.born, frac=age/dur;
    const alpha=Math.max(0,frac<0.25?frac/.25:1-frac);
    const rise=18+age*1.6;
    const y=t.cy-rise;
    const isKill=t.text==='KILL';
    const isFlash=t.text==='FLASH';
    const isFB=t.text==='FIRST BLOOD';
    const isMulti=['DOUBLE','TRIPLE','QUAD','ACE'].includes(t.text);
    const sz=isFB?(15-frac*3):isMulti?(17-frac*4):isKill?(13-frac*2):isFlash?9:9;
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.font=`bold ${Math.max(7,sz)}px "Inter",sans-serif`; ctx.textAlign='center';
    ctx.strokeStyle='rgba(0,0,0,.9)'; ctx.lineWidth=isMulti?4.5:isKill?3.5:2.5;
    ctx.strokeText(t.text,t.cx,y);
    ctx.fillStyle=t.color; ctx.fillText(t.text,t.cx,y);
    ctx.restore();
  });

  // Draw expanding kill rings at victim positions
  const RING_DUR=44;
  ringPool=ringPool.filter(r=>currentTick-r.born<RING_DUR);
  ringPool.forEach(r=>{
    const age=currentTick-r.born, frac=age/RING_DUR;
    const alpha=Math.max(0,(1-frac)*.74);
    const lw=Math.max(0.4,2.4*(1-frac));
    ctx.save();
    // Primary ring — fast expand
    const rad=5+frac*46;
    ctx.strokeStyle=r.color;ctx.lineWidth=lw;ctx.globalAlpha=alpha;
    ctx.beginPath();ctx.arc(r.cx,r.cy,rad,0,Math.PI*2);ctx.stroke();
    // Secondary inner ring — half-speed
    const rad2=3+frac*0.5*46;
    ctx.globalAlpha=alpha*0.40;ctx.lineWidth=lw*0.6;
    ctx.beginPath();ctx.arc(r.cx,r.cy,rad2,0,Math.PI*2);ctx.stroke();
    // Tertiary outer ring — slow, white depth cue (broadcast style)
    if(frac>0.07){
      const rad3=8+frac*1.35*46;
      ctx.globalAlpha=alpha*0.16;ctx.lineWidth=0.7;ctx.strokeStyle='#ffffff';
      ctx.beginPath();ctx.arc(r.cx,r.cy,rad3,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=r.color;
    }
    // Radial spark streaks — 8 directions, visible only in first 13 ticks
    if(age<13){
      const sf=1-age/13;
      ctx.globalAlpha=sf*0.55;ctx.strokeStyle=r.color;ctx.lineWidth=1.0;ctx.lineCap='round';
      for(let _k=0;_k<8;_k++){
        const _sa=_k*Math.PI*0.25;
        const _si=rad2*0.42,_so=_si+3+age*3.0*sf;
        ctx.beginPath();
        ctx.moveTo(r.cx+Math.cos(_sa)*_si,r.cy+Math.sin(_sa)*_si);
        ctx.lineTo(r.cx+Math.cos(_sa)*_so,r.cy+Math.sin(_sa)*_so);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

function drawHeatmap(active){
  if(!_heatPosCache){
    const off=new OffscreenCanvas(CW,CH);
    const oc=off.getContext('2d');
    active.forEach(rc=>{
      const col=hexToRgb(rc.color);
      rc.positions.forEach(p=>{
        const[x,y]=g2p(p.x,p.y,rc.map);
        const g=oc.createRadialGradient(x,y,0,x,y,28);
        g.addColorStop(0,`rgba(${col},.10)`);g.addColorStop(1,`rgba(${col},0)`);
        oc.fillStyle=g;oc.beginPath();oc.arc(x,y,28,0,Math.PI*2);oc.fill();
      });
    });
    _heatPosCache=off;
    const koff=new OffscreenCanvas(CW,CH);
    const kc=koff.getContext('2d');
    active.forEach(rc=>{
      rc.kills.forEach(k=>{
        const[kx,ky]=g2p(k.other_x,k.other_y,rc.map);
        const kg=kc.createRadialGradient(kx,ky,0,kx,ky,36);
        kg.addColorStop(0,'rgba(255,60,60,.32)');
        kg.addColorStop(0.4,'rgba(255,120,20,.14)');
        kg.addColorStop(1,'rgba(255,80,0,0)');
        kc.fillStyle=kg;kc.beginPath();kc.arc(kx,ky,36,0,Math.PI*2);kc.fill();
      });
    });
    _heatKillCache=koff;
  }
  ctx.globalCompositeOperation='screen';
  ctx.drawImage(_heatPosCache,0,0);
  ctx.drawImage(_heatKillCache,0,0);
  ctx.globalCompositeOperation='source-over';
}

function filterPlayers(q){
  const lq=q.toLowerCase();
  document.querySelectorAll('.player-card').forEach(c=>{
    c.style.display=(!lq||c.dataset.name.toLowerCase().includes(lq))?'':'none';
  });
}

function calcDist(positions){
  let d=0;
  for(let i=1;i<positions.length;i++){
    const dx=positions[i].x-positions[i-1].x,dy=positions[i].y-positions[i-1].y;
    d+=Math.sqrt(dx*dx+dy*dy);
  }
  return Math.round(d);
}

