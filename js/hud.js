'use strict';
function drawKillBorderFlash(){
  if(!_borderFlash) return;
  const age=currentTick-_borderFlash.born;
  if(age>=20){_borderFlash=null;return;}
  const frac=age/20;
  const alpha=(1-frac)*0.38;
  const r=parseInt(_borderFlash.color.slice(1,3),16);
  const g2=parseInt(_borderFlash.color.slice(3,5),16);
  const b=parseInt(_borderFlash.color.slice(5,7),16);
  ctx.save();
  // Brief white frame flash at moment of kill (first 3 ticks)
  if(age<4){
    const wf=(1-age/4)*0.18;
    ctx.fillStyle=`rgba(255,255,255,${wf})`;ctx.fillRect(0,0,CW,CH);
  }
  // Outer border glow (radial from edges)
  const grad=ctx.createRadialGradient(CW/2,CH/2,CW*.35,CW/2,CH/2,CW*.72);
  grad.addColorStop(0,'rgba(0,0,0,0)');
  grad.addColorStop(1,`rgba(${r},${g2},${b},${alpha*1.6})`);
  ctx.fillStyle=grad;ctx.fillRect(0,0,CW,CH);
  // Hard edge stroke
  ctx.strokeStyle=`rgba(${r},${g2},${b},${alpha})`;
  ctx.lineWidth=6;ctx.strokeRect(0,0,CW,CH);
  ctx.restore();
}

function drawFlashBlind(active){
  if(!show.nades) return;
  const FLIGHT=18;
  let maxBlind=0;
  active.forEach(rc=>{
    rc.flashes.forEach(f=>{
      const age=currentTick-f.tick;
      if(age<FLIGHT||age>FLIGHT+28) return;
      const ba=age-FLIGHT;
      const b=ba<5?(ba/5):Math.max(0,1-(ba-5)/23);
      if(b>maxBlind) maxBlind=b;
    });
  });
  if(maxBlind<=0.01) return;
  ctx.save();
  ctx.globalAlpha=maxBlind*0.32;
  ctx.fillStyle='rgba(215,230,255,1)';
  ctx.fillRect(0,0,CW,CH);
  ctx.restore();
}

function drawScanLine(){
  if(!selectedPlayers.length||currentTick<=0||currentTick>=36) return;
  const frac=currentTick/36;
  const y=frac*CH;
  ctx.save();
  const g=ctx.createLinearGradient(0,y-28,0,y+28);
  g.addColorStop(0,'rgba(77,158,255,0)');
  g.addColorStop(0.42,`rgba(77,158,255,${0.28*(1-frac)})`);
  g.addColorStop(0.5,`rgba(180,210,255,${0.4*(1-frac)})`);
  g.addColorStop(0.58,`rgba(77,158,255,${0.28*(1-frac)})`);
  g.addColorStop(1,'rgba(77,158,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,y-28,CW,56);
  ctx.restore();
}

function drawBroadcastHeader(active){
  if(!active.length) return;
  const hasCT=active.some(r=>r.team==='CT'), hasT=active.some(r=>r.team==='T');
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const ALL=[
    {team:'CT',color:'#4d9eff',bg:'rgba(18,50,115,.82)',ax:8,has:hasCT},
    {team:'T', color:'#ff8c1a',bg:'rgba(110,48,5,.82)', ax:CW-54,has:hasT},
  ];
  // Only render chips for sides that have players
  ALL.filter(c=>c.has).forEach(c=>{
    const players=active.filter(r=>r.team===c.team);
    const alive=players.filter(r=>!r.deaths.some(d=>d.tick<=currentTick)).length;
    const W=46,H=22;
    ctx.globalAlpha=0.9;
    ctx.fillStyle=c.bg;
    ctx.beginPath();ctx.roundRect(c.ax,8,W,H,4);ctx.fill();
    ctx.strokeStyle=c.color+'44';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.roundRect(c.ax,8,W,H,4);ctx.stroke();
    ctx.globalAlpha=0.65;ctx.fillStyle=c.color;
    ctx.font='600 8px "Inter",sans-serif';ctx.textAlign='left';
    ctx.fillText(c.team,c.ax+5,19);
    ctx.globalAlpha=1;ctx.fillStyle=alive>0?c.color:'rgba(255,255,255,.22)';
    ctx.font='700 12px "JetBrains Mono",monospace';
    ctx.fillText(alive,c.ax+27,21);
  });
  // Center VS kill score
  if(active.length){
    const ctK=active.filter(r=>r.team==='CT').reduce((s,r)=>s+r.kills.filter(k=>k.tick<=currentTick).length,0);
    const tK=active.filter(r=>r.team==='T').reduce((s,r)=>s+r.kills.filter(k=>k.tick<=currentTick).length,0);
    const SW=68,SH=22,BX=CW/2,BY=8;
    ctx.globalAlpha=0.85;ctx.fillStyle='rgba(7,9,18,.92)';
    ctx.strokeStyle='rgba(55,70,120,.7)';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.roundRect(BX-SW/2,BY,SW,SH,4);ctx.fill();ctx.stroke();
    ctx.globalAlpha=1;
    ctx.fillStyle='#4d9eff';ctx.font='700 13px "JetBrains Mono",monospace';ctx.textAlign='right';
    ctx.fillText(ctK,BX-7,BY+16);
    ctx.fillStyle='rgba(120,140,185,.45)';ctx.font='700 10px "JetBrains Mono",monospace';ctx.textAlign='center';
    ctx.fillText('|',BX,BY+15);
    ctx.fillStyle='#ff8c1a';ctx.font='700 13px "JetBrains Mono",monospace';ctx.textAlign='left';
    ctx.fillText(tK,BX+7,BY+16);
  }
  ctx.restore();
}

function drawRoundStatsHUD(active){
  if(!active.length||currentTick>=maxRoundTick) return;
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  const N=active.length;
  const EW=162,EH=24,GAP=5;
  const TW=N*(EW+GAP)-GAP;
  const sx=(CW-TW)/2,sy=CH-50;
  active.forEach((rc,i)=>{
    const ex=sx+i*(EW+GAP);
    const isDead=rc.deaths.some(d=>d.tick<=currentTick);
    const K=rc.kills.filter(k=>k.tick<=currentTick).length;
    const D=rc.deaths.filter(d=>d.tick<=currentTick).length;
    const teamColor=teamHex(rc.team);
    const a=isDead?.35:.85;
    ctx.globalAlpha=a;
    // Panel
    ctx.fillStyle='rgba(4,6,12,.90)';
    ctx.strokeStyle=isDead?'rgba(255,208,96,.15)':teamColor+'33';ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(ex,sy,EW,EH,4);ctx.fill();ctx.stroke();
    // Team-color left bar
    const barColor=isDead?'#ffd060':teamColor;
    ctx.fillStyle=barColor;ctx.globalAlpha=isDead?.18:a*0.9;
    ctx.beginPath();ctx.roundRect(ex,sy,3,EH,[4,0,0,4]);ctx.fill();
    ctx.globalAlpha=1;
    // Player identity dot
    ctx.fillStyle=rc.color;ctx.globalAlpha=isDead?.25:.9;
    ctx.beginPath();ctx.arc(ex+12,sy+EH/2,3.5,0,Math.PI*2);ctx.fill();
    // Name
    const nm=rc.playerName.length>10?rc.playerName.slice(0,9)+'…':rc.playerName;
    ctx.fillStyle=isDead?'rgba(100,110,135,.5)':rc.color;
    ctx.font='600 9px "Inter",sans-serif';ctx.textAlign='left';
    ctx.globalAlpha=isDead?.35:.9;
    if(isDead){ctx.fillStyle='rgba(255,208,96,.5)';ctx.fillText('✝',ex+22,sy+15);}
    ctx.fillStyle=isDead?'rgba(100,110,135,.5)':rc.color;
    ctx.fillText(nm,isDead?ex+32:ex+22,sy+15);
    // K/D
    ctx.fillStyle=isDead?'rgba(120,130,150,.3)':'rgba(185,198,230,.9)';
    ctx.font='600 9px "JetBrains Mono",monospace';ctx.textAlign='right';
    ctx.globalAlpha=isDead?.25:.9;
    ctx.fillText(`${K}K ${D}D`,ex+EW-7,sy+15);
  });
  ctx.globalAlpha=1;ctx.restore();
}

function drawClutchBanner(active){
  if(!active.length||currentTick<=0||currentTick>=maxRoundTick) return;
  // Count alive players per team
  const aliveCT=active.filter(r=>r.team==='CT'&&!r.deaths.some(d=>d.tick<=currentTick)).length;
  const aliveT =active.filter(r=>r.team==='T' &&!r.deaths.some(d=>d.tick<=currentTick)).length;
  let clutcher=null,vs=null,clutchCol=null;
  if(aliveCT===1&&aliveT>=2){clutcher='CT';vs=aliveT;clutchCol='#4d9eff';}
  else if(aliveT===1&&aliveCT>=2){clutcher='T';vs=aliveCT;clutchCol='#ff8c1a';}
  if(!clutcher) return;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const pulse=0.7+0.3*Math.abs(Math.sin(currentTick*0.09));
  const label=`CLUTCH 1v${vs}`;
  const BX=CW/2,BY=60;
  ctx.globalAlpha=0.88*pulse;
  ctx.fillStyle='rgba(8,10,20,.9)';
  ctx.strokeStyle=clutchCol+'66';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(BX-42,BY-8,84,16,6);ctx.fill();ctx.stroke();
  ctx.globalAlpha=pulse;
  ctx.fillStyle=clutchCol;
  ctx.font='700 9px "JetBrains Mono",monospace';ctx.textAlign='center';
  ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=2;
  ctx.strokeText(label,BX,BY+4);
  ctx.fillText(label,BX,BY+4);
  ctx.restore();
}

function drawLiveBadge(){
  if(!selectedPlayers.length||currentTick<=0) return;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const isLive=playing&&currentTick<maxRoundTick;
  const pulse=isLive?(0.65+0.35*Math.abs(Math.sin(currentTick*0.07))):0.75;
  const BX=CW/2,BY=38;
  ctx.globalAlpha=0.85*pulse;
  ctx.fillStyle='rgba(8,10,20,.88)';
  ctx.strokeStyle=isLive?'rgba(255,50,70,.4)':'rgba(80,100,160,.3)';ctx.lineWidth=0.8;
  ctx.beginPath();ctx.roundRect(BX-28,BY-8,56,15,6);ctx.fill();ctx.stroke();
  if(isLive){
    ctx.globalAlpha=pulse;
    ctx.fillStyle='#ff3040';
    ctx.beginPath();ctx.arc(BX-16,BY,3.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(230,235,255,.9)';ctx.font='700 9px "JetBrains Mono",monospace';
    ctx.textAlign='left';ctx.fillText('LIVE',BX-9,BY+4);
  } else {
    ctx.globalAlpha=0.65;
    ctx.fillStyle='rgba(160,180,220,.7)';ctx.font='700 9px "JetBrains Mono",monospace';
    ctx.textAlign='center';ctx.fillText('PAUSED',BX,BY+4);
  }
  ctx.restore();
}

function drawRoundBadge(active){
  if(!active.length||currentTick<=0) return;
  const fr=document.getElementById('roundFilter')?.value;
  const rIdx=fr||active[0]?.roundIdx;
  if(!rIdx&&rIdx!==0) return;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const label=`R${rIdx}`;
  const BX=108,BY=18;
  ctx.globalAlpha=0.75;
  ctx.fillStyle='rgba(8,10,20,.88)';
  ctx.strokeStyle='rgba(80,100,160,.3)';ctx.lineWidth=0.8;
  ctx.beginPath();ctx.roundRect(BX-18,BY-8,36,15,6);ctx.fill();ctx.stroke();
  ctx.globalAlpha=0.85;
  ctx.fillStyle='rgba(160,185,230,.85)';ctx.font='700 9px "JetBrains Mono",monospace';
  ctx.textAlign='center';ctx.fillText(label,BX,BY+4);
  // PISTOL phase chip for round 1 and round 13 (half-time restart)
  const _rNum=parseInt(rIdx);
  if(_rNum===1||_rNum===13){
    const _pulse=0.7+0.3*Math.abs(Math.sin(currentTick*0.06));
    ctx.globalAlpha=0.78*_pulse;
    ctx.fillStyle='rgba(255,140,20,.10)';
    ctx.strokeStyle='rgba(255,140,20,.50)';ctx.lineWidth=0.9;
    ctx.beginPath();ctx.roundRect(BX-24,BY+9,48,13,5);ctx.fill();ctx.stroke();
    ctx.globalAlpha=0.88*_pulse;
    ctx.fillStyle='#ff9c28';ctx.font='700 7px "JetBrains Mono",monospace';
    ctx.textAlign='center';ctx.fillText('PISTOL',BX,BY+19);
  }
  ctx.restore();
}

function drawVignette(){
  const cx=CW/2,cy=CH/2;
  const g=ctx.createRadialGradient(cx,cy,CW*0.3,cx,cy,CW*0.72);
  g.addColorStop(0,'rgba(0,0,0,0)');
  g.addColorStop(1,'rgba(0,0,0,0.38)');
  ctx.save();ctx.fillStyle=g;ctx.fillRect(0,0,CW,CH);ctx.restore();
}

function drawRoundProgressBar(){
  if(!selectedPlayers.length||maxRoundTick<=0||currentTick<=0) return;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const frac=Math.min(1,currentTick/maxRoundTick);
  const W=CW*frac;
  // Track bg
  ctx.globalAlpha=0.20;ctx.fillStyle='rgba(70,90,140,1)';ctx.fillRect(0,0,CW,3);
  // Gradient fill
  const grd=ctx.createLinearGradient(0,0,CW,0);
  grd.addColorStop(0,'#4d9eff');grd.addColorStop(0.5,'#8850d0');grd.addColorStop(1,'#ff8c1a');
  ctx.globalAlpha=0.78;ctx.fillStyle=grd;ctx.fillRect(0,0,W,3);
  // Leading edge glow
  if(frac<0.999&&W>6){
    const eg=ctx.createLinearGradient(W-10,0,W+2,0);
    eg.addColorStop(0,'rgba(255,255,255,0)');eg.addColorStop(1,'rgba(255,255,255,.9)');
    ctx.globalAlpha=0.85;ctx.fillStyle=eg;ctx.fillRect(W-10,0,12,3);
  }
  ctx.restore();
}

function drawMiniMap(active){
  if(camZoom<=1.25) return;
  const MX=CW-160,MY=10,MW=150,MH=150;
  ctx.save();
  // Panel bg
  ctx.globalAlpha=0.88;
  ctx.fillStyle='rgba(7,9,15,.9)';
  ctx.strokeStyle='rgba(40,55,90,.9)';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(MX,MY,MW,MH,6);ctx.fill();ctx.stroke();
  // Map thumbnail
  if(RADAR.complete&&RADAR.naturalWidth>0){
    ctx.globalAlpha=0.7;
    ctx.drawImage(RADAR,MX,MY,MW,MH);
    ctx.fillStyle='rgba(0,0,0,0.32)';
    ctx.beginPath();ctx.roundRect(MX,MY,MW,MH,6);ctx.fill();
  }
  // Viewport rectangle
  ctx.globalAlpha=1;
  const vpX=-camX/camZoom,vpY=-camY/camZoom;
  const vpW=CW/camZoom,vpH=CH/camZoom;
  const rx=MX+vpX*MW/CW,ry=MY+vpY*MH/CH;
  const rw=vpW*MW/CW,rh=vpH*MH/CH;
  ctx.fillStyle='rgba(255,255,255,.07)';ctx.fillRect(rx,ry,rw,rh);
  ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.5;
  ctx.setLineDash([]);ctx.strokeRect(rx,ry,rw,rh);
  // Player dots + initials
  if(active){
    active.forEach(rc=>{
      const raw=lerpPos(rc.positions,currentTick);if(!raw) return;
      const[ppx,ppy]=g2p(raw[0],raw[1],rc.map);
      const mmx=MX+ppx*MW/CW,mmy=MY+ppy*MH/CH;
      const isDead=rc.deaths.some(d=>d.tick<=currentTick);
      const tc=teamHex(rc.team);
      ctx.globalAlpha=isDead?0.2:0.92;
      ctx.fillStyle=rc.color;
      ctx.beginPath();ctx.arc(mmx,mmy,2.2,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=tc;ctx.lineWidth=0.9;
      ctx.beginPath();ctx.arc(mmx,mmy,3.2,0,Math.PI*2);ctx.stroke();
      // Initials label (avoid dead players cluttering minimap)
      if(!isDead){
        const init=rc.playerName.slice(0,2).toUpperCase();
        ctx.globalAlpha=0.78;
        ctx.font='500 5px "Inter",sans-serif';ctx.textAlign='left';
        ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=1.5;
        ctx.strokeText(init,mmx+4,mmy+2);
        ctx.fillStyle=rc.color;ctx.fillText(init,mmx+4,mmy+2);
      }
    });
  }
  // Zoom label
  ctx.globalAlpha=1;
  ctx.fillStyle='rgba(180,190,220,.8)';ctx.font='700 9px "JetBrains Mono",monospace';
  ctx.textAlign='right';ctx.textBaseline='bottom';
  ctx.fillText(`${camZoom.toFixed(1)}×`,MX+MW-4,MY+MH-4);
  ctx.textBaseline='alphabetic';
  ctx.restore();
}

function drawOffscreenArrows(active){
  if(camZoom<=1.1) return;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const EDGE=24;
  active.forEach(rc=>{
    const raw=lerpPos(rc.positions,currentTick);if(!raw) return;
    const isDead=rc.deaths.some(d=>d.tick<=currentTick);if(isDead) return;
    const[ppx,ppy]=g2p(raw[0],raw[1],rc.map);
    const sx=ppx*camZoom+camX,sy=ppy*camZoom+camY;
    if(sx>=EDGE&&sx<=CW-EDGE&&sy>=EDGE&&sy<=CH-EDGE) return;
    const cx=CW/2,cy=CH/2;
    const dx=sx-cx,dy=sy-cy;
    const ang=Math.atan2(dy,dx);
    const tx=dx>0?(CW-EDGE-cx)/dx:(dx<0?(EDGE-cx)/dx:1e9);
    const ty=dy>0?(CH-EDGE-cy)/dy:(dy<0?(EDGE-cy)/dy:1e9);
    const t=Math.min(tx,ty);
    const ax=cx+dx*t,ay=cy+dy*t;
    const tc=teamHex(rc.team);
    ctx.save();
    ctx.translate(ax,ay);ctx.rotate(ang);
    // Dark backing circle
    ctx.globalAlpha=0.5;ctx.fillStyle='rgba(0,0,0,.7)';
    ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();
    // Team ring
    ctx.globalAlpha=0.65;ctx.strokeStyle=tc;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.stroke();
    // Arrow triangle pointing toward player
    ctx.globalAlpha=0.9;
    ctx.fillStyle=rc.color;
    ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,5.5);ctx.lineTo(-5,-5.5);ctx.closePath();
    ctx.stroke();ctx.fill();
    ctx.restore();
    // Player name tag offset inward from the arrow
    const name=rc.playerName.slice(0,7);
    const nx=ax+Math.cos(ang+Math.PI)*20,ny=ay+Math.sin(ang+Math.PI)*20;
    ctx.save();
    ctx.globalAlpha=0.78;ctx.font='600 7px "Inter",sans-serif';ctx.textAlign='center';
    ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineWidth=2.5;
    ctx.strokeText(name,nx,ny);
    ctx.fillStyle=rc.color;ctx.fillText(name,nx,ny);
    ctx.restore();
  });
  ctx.restore();
}

function drawNadeLegend(){
  if(!show.nades) return;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const items=[
    {color:'#7fc4e0',label:'Smoke',shape:'circle'},
    {color:'#ffe060',label:'Flash',shape:'star'},
    {color:'#ff9900',label:'HE',shape:'burst'},
    {color:'#ff5500',label:'Fire',shape:'flame'},
  ];
  const W=64,ROW=16,PAD=6;
  const X=CW-W-8,Y=CH-items.length*ROW-PAD*2-8;
  ctx.fillStyle='rgba(5,7,13,.78)';
  ctx.beginPath();ctx.roundRect(X,Y,W+PAD,items.length*ROW+PAD*2,4);ctx.fill();
  ctx.strokeStyle='rgba(80,100,140,.35)';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(X,Y,W+PAD,items.length*ROW+PAD*2,4);ctx.stroke();
  ctx.font='600 8.5px "Inter",sans-serif';ctx.textAlign='left';
  items.forEach((it,i)=>{
    const cy=Y+PAD+i*ROW+ROW/2;
    const cx=X+PAD+5;
    ctx.globalAlpha=0.88;
    if(it.shape==='circle'){
      ctx.strokeStyle=it.color;ctx.lineWidth=1.6;
      ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=it.color+'44';ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fill();
    } else if(it.shape==='star'){
      const R=4.5;ctx.fillStyle=it.color;
      for(let k=0;k<5;k++){
        const a=k*Math.PI*2/5-Math.PI/2;
        const bx=cx+Math.cos(a)*R,by=cy+Math.sin(a)*R;
        const ba=a+Math.PI*2/10;
        const bx2=cx+Math.cos(ba)*R*0.42,by2=cy+Math.sin(ba)*R*0.42;
        if(k===0){ctx.beginPath();ctx.moveTo(bx,by);}
        else{ctx.lineTo(bx,by);}
        ctx.lineTo(bx2,by2);
      }
      ctx.closePath();ctx.fill();
    } else if(it.shape==='burst'){
      for(let k=0;k<8;k++){
        const a=k*Math.PI/4;
        ctx.strokeStyle=it.color;ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*1.5,cy+Math.sin(a)*1.5);
        ctx.lineTo(cx+Math.cos(a)*4.5,cy+Math.sin(a)*4.5);ctx.stroke();
      }
      ctx.fillStyle=it.color;ctx.beginPath();ctx.arc(cx,cy,2,0,Math.PI*2);ctx.fill();
    } else {
      // flame triangle
      ctx.fillStyle=it.color;ctx.globalAlpha=0.85;
      ctx.beginPath();ctx.moveTo(cx,cy-4.5);ctx.lineTo(cx-3,cy+3);ctx.lineTo(cx+3,cy+3);ctx.closePath();ctx.fill();
    }
    ctx.globalAlpha=0.8;ctx.fillStyle='rgba(185,198,225,.85)';
    ctx.fillText(it.label,cx+10,cy+3);
  });
  ctx.restore();
}

function drawEndCard(active){
  if(!active.length||currentTick<maxRoundTick) return;
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  // Dim overlay
  ctx.fillStyle='rgba(5,8,14,.30)';ctx.fillRect(0,0,CW,CH);
  const PW=400,RH=54,rows=active.length;
  const PH=56+rows*RH+28;
  const px=(CW-PW)/2,py=(CH-PH)/2;
  // Winner detection — CT wins if CTs alive and Ts all dead (and vice versa)
  const _ctAE=active.filter(r=>r.team==='CT'&&!r.deaths.some(d=>d.tick<=maxRoundTick)).length;
  const _tAE=active.filter(r=>r.team==='T'&&!r.deaths.some(d=>d.tick<=maxRoundTick)).length;
  const _hasBoth=active.some(r=>r.team==='CT')&&active.some(r=>r.team==='T');
  const _ewT=_hasBoth?(_ctAE>0&&_tAE===0?'CT':_tAE>0&&_ctAE===0?'T':null):null;
  const _ewC=_ewT==='CT'?'#4d9eff':_ewT==='T'?'#ff8c1a':'#ff4060';
  // Panel — border color reflects winner
  ctx.fillStyle='rgba(10,13,22,.96)';ctx.strokeStyle=_ewC+'88';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.roundRect(px,py,PW,PH,10);ctx.fill();ctx.stroke();
  // Header accent line — winner team color
  ctx.fillStyle=_ewC+'cc';ctx.fillRect(px+20,py+38,PW-40,2);
  // Title
  ctx.fillStyle='#dde2f0';ctx.font='700 13px "Inter",sans-serif';ctx.textAlign='center';ctx.letterSpacing='.1em';
  ctx.fillText('ROUND COMPLETE',CW/2,py+26);
  // Winner chip — sits in the 18px gap between accent line and first player row
  if(_ewT){
    ctx.globalAlpha=0.88;ctx.fillStyle=_ewC+'1a';ctx.strokeStyle=_ewC+'55';ctx.lineWidth=0.9;
    ctx.beginPath();ctx.roundRect(CW/2-32,py+41,64,13,4);ctx.fill();ctx.stroke();
    ctx.globalAlpha=1;ctx.fillStyle=_ewC;
    ctx.font='700 8px "JetBrains Mono",monospace';ctx.textAlign='center';ctx.letterSpacing='.08em';
    ctx.fillText(`${_ewT} WINS`,CW/2,py+51);ctx.letterSpacing='0';
  }
  // MVP detection — highest kill count this round
  const _mvpIdx=active.reduce((mi,r,i,a)=>r.kills.length>a[mi].kills.length?i:mi,0);
  const _isMvp=active[_mvpIdx].kills.length>0;
  // Player rows
  active.forEach((rc,i)=>{
    const K=rc.kills.length,D=rc.deaths.length;
    const dist=(calcDist(rc.positions)/100).toFixed(1)+'m';
    const ry=py+56+i*RH;
    // Color bar
    ctx.fillStyle=rc.color;ctx.globalAlpha=0.9;ctx.fillRect(px,ry,3,RH-4);
    ctx.globalAlpha=1;
    // MVP gold highlight row
    if(i===_mvpIdx&&_isMvp){
      ctx.globalAlpha=0.06;ctx.fillStyle='#ffd060';ctx.fillRect(px,ry,PW,RH-4);ctx.globalAlpha=1;
      ctx.strokeStyle='rgba(255,208,96,.4)';ctx.lineWidth=0.8;
      ctx.beginPath();ctx.rect(px,ry,PW,RH-4);ctx.stroke();
      ctx.fillStyle='#ffd060';ctx.font='bold 7px "JetBrains Mono",monospace';ctx.textAlign='right';ctx.letterSpacing='.06em';
      ctx.fillText('MVP',px+PW-12,ry+11);ctx.letterSpacing='0';
    }
    // Name
    ctx.fillStyle=rc.color;ctx.font='700 12px "Inter",sans-serif';ctx.textAlign='left';
    ctx.fillText(rc.playerName,px+14,ry+18);
    // Team badge
    ctx.fillStyle=rc.team==='CT'?'rgba(77,158,255,.15)':'rgba(255,140,26,.15)';
    ctx.strokeStyle=rc.team==='CT'?'var(--ct)':'var(--t)';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.roundRect(px+14,ry+24,28,11,3);ctx.fill();ctx.stroke();
    ctx.fillStyle=teamHex(rc.team);
    ctx.font='600 8px "JetBrains Mono",monospace';ctx.textAlign='center';
    ctx.fillText(rc.team,px+28,ry+33);
    // Stats
    ctx.fillStyle='#b8bdd0';ctx.font='12px "JetBrains Mono",monospace';ctx.textAlign='right';
    ctx.fillText(`${K}K ${D}D`,px+PW-16,ry+18);
    ctx.fillStyle='rgba(100,115,145,.65)';ctx.font='10px "JetBrains Mono",monospace';
    ctx.fillText(dist,px+PW-16,ry+34);
    // Top weapon + utility stats on same row
    const ws=rc.kills.map(k=>k.weapon).filter(Boolean);
    if(ws.length){
      const freq={};ws.forEach(w=>{freq[w]=(freq[w]||0)+1;});
      const top=Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
      ctx.fillStyle=weaponColor(top);ctx.font='10px "JetBrains Mono",monospace';ctx.textAlign='left';
      ctx.fillText(top,px+50,ry+34);
    }
    // Utility usage
    const us=`S:${rc.smokes.length} F:${rc.flashes.length} H:${rc.hes.length}`;
    ctx.fillStyle='rgba(130,155,200,.55)';ctx.font='8.5px "JetBrains Mono",monospace';ctx.textAlign='right';
    ctx.fillText(us,px+PW-16,ry+34);
    // K/D ratio bar — fills proportionally: green=kill-favored, amber=even, red=death-favored
    if(K+D>0){
      const _kdr=K/(K+D);
      const _bx=px+14,_bw=PW-28,_by=ry+42;
      const _bfCol=K>D?'#30d890':K===D?'#ffa030':'#ff4060';
      ctx.globalAlpha=isDead?0.18:0.45;ctx.fillStyle='rgba(255,255,255,.06)';
      ctx.beginPath();ctx.roundRect(_bx,_by,_bw,3,2);ctx.fill();
      ctx.globalAlpha=isDead?0.18:0.68;ctx.fillStyle=_bfCol;
      ctx.beginPath();ctx.roundRect(_bx,_by,_bw*_kdr,3,[2,0,0,2]);ctx.fill();
      ctx.globalAlpha=isDead?0.15:0.55;ctx.fillStyle=_bfCol;
      ctx.font='600 7px "JetBrains Mono",monospace';ctx.textAlign='right';
      ctx.fillText((K/(D||1)).toFixed(2),px+PW-8,_by+2);
    }
    // Divider
    if(i<active.length-1){ctx.fillStyle='rgba(255,255,255,.06)';ctx.fillRect(px+8,ry+RH-4,PW-16,1);}
  });
  // Footer
  ctx.fillStyle='rgba(80,90,120,.5)';ctx.font='10px "Inter",sans-serif';ctx.textAlign='center';ctx.letterSpacing='0';
  ctx.fillText('Space to replay  ·  ← to scrub back  ·  J/K to review kills',CW/2,py+PH-10);
  ctx.restore();
}

function weaponColor(w){
  if(!w) return '#e05080';
  const s=w.toLowerCase();
  if(/knife|karambit|m9|flip|gut|bowie|butterfly|shadow|falchion|ursus|navaja|stiletto|talon|survival/.test(s)) return '#c084fc';
  if(/awp|ssg|scar|g3sg|scout/.test(s)) return '#ffd060';
  if(/deagle|desert eagle|r8|revolver/.test(s)) return '#ff8c1a';
  if(/glock|usp|p2000|p250|five.seven|cz75|tec.dc9|cz-75/.test(s)) return '#ff9940';
  if(/ak.?47|ak47|m4a1|m4a4|famas|galil|aug|sg.?553|sg553/.test(s)) return '#ff5060';
  if(/mp9|mp5|mac.?10|ump|p90|mp7|bizon|pp.?bizon/.test(s)) return '#b060e0';
  if(/nova|xm1014|mag.?7|sawed.?off|negev|m249/.test(s)) return '#a07040';
  if(/he.?grenade|molotov|incendiary|c4|bomb/.test(s)) return '#30d890';
  if(/flashbang|flash/.test(s)) return '#e0d060';
  if(/smoke/.test(s)) return '#7fc4e0';
  return '#e05080';
}

function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

// Cinematic black letterbox bars — appear on quad-kill / ACE
function drawLetterbox(){
  if(currentTick>_letterboxUntil||_letterboxUntil<=0) return;
  const DUR=90;
  const age=Math.max(0,currentTick-(_letterboxUntil-DUR));
  const f=age<12?(age/12):age>72?Math.max(0,(DUR-age)/18):1;
  if(f<=0) return;
  const H=Math.round(CH*0.072*f);
  ctx.save();ctx.globalAlpha=0.85;ctx.fillStyle='#000';
  ctx.fillRect(0,0,CW,H);ctx.fillRect(0,CH-H,CW,H);
  ctx.restore();
}

