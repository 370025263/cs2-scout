'use strict';
// ── Render a single round ──
function drawRound(rc){
  const tc=rc.color;
  const isDead=rc.deaths.some(d=>d.tick<=currentTick);

  // ── Full-round ghost route (entire path walked so far, single faint stroke) ──
  if(show.trails&&rc.positions.length>1){
    const allVis=rc.positions.filter(p=>p.tick<=currentTick);
    if(allVis.length>=2){
      ctx.save();
      const aPts=allVis.map(p=>g2p(p.x,p.y,rc.map));
      ctx.globalAlpha=isDead?0.032:0.055;ctx.strokeStyle=tc;ctx.lineWidth=0.85;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(aPts[0][0],aPts[0][1]);
      for(let i=1;i<aPts.length;i++) ctx.lineTo(aPts[i][0],aPts[i][1]);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Trail ribbon — per-segment alpha+width gradient (recent 260 ticks) ──
  if(show.trails&&rc.positions.length>1){
    const TLEN=260;
    const vis=rc.positions.filter(p=>p.tick<=currentTick&&p.tick>=currentTick-TLEN);
    if(vis.length>=2){
      ctx.save();
      const pts=vis.map(p=>g2p(p.x,p.y,rc.map));
      const N=pts.length;
      // ── Glow pass (wide + faint, last 24 segments only for perf) ──
      if(!isDead&&N>2){
        const gStart=Math.max(0,N-24);
        const gPts=pts.slice(gStart);const GN=gPts.length;
        ctx.lineCap='round';
        for(let i=1;i<GN;i++){
          const t=i/GN;
          ctx.globalAlpha=t*0.055;ctx.strokeStyle=tc;ctx.lineWidth=8+t*10;
          ctx.beginPath();ctx.moveTo(gPts[i-1][0],gPts[i-1][1]);ctx.lineTo(gPts[i][0],gPts[i][1]);
          ctx.stroke();
        }
      }
      // ── Sharp ribbon pass ──
      for(let i=1;i<N;i++){
        const t=i/N;
        const alpha=isDead?0.04+t*.11:0.04+t*.88;
        const lw=isDead?0.7:0.4+t*3.2;
        ctx.globalAlpha=alpha; ctx.strokeStyle=tc; ctx.lineWidth=lw; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(pts[i-1][0],pts[i-1][1]);
        if(i<N-1){
          const cp1x=pts[i][0]+(pts[i+1][0]-pts[i-1][0])*0.25;
          const cp1y=pts[i][1]+(pts[i+1][1]-pts[i-1][1])*0.25;
          ctx.quadraticCurveTo(cp1x,cp1y,pts[i][0],pts[i][1]);
        } else {
          ctx.lineTo(pts[i][0],pts[i][1]);
        }
        ctx.stroke();
      }
      // Speed glow pass — orange/red highlight on fast-moving segments
      if(!isDead){
        for(let i=1;i<N;i++){
          const dt=vis[i].tick-vis[i-1].tick;if(dt<=0) continue;
          const dx=pts[i][0]-pts[i-1][0],dy=pts[i][1]-pts[i-1][1];
          const spd=Math.sqrt(dx*dx+dy*dy)/dt; // canvas px per tick
          if(spd<2.2) continue; // only highlight above jog threshold
          const t=i/N;
          const intensity=Math.min(1,(spd-2.2)/4);
          ctx.globalAlpha=(0.06+t*0.45)*intensity;
          ctx.strokeStyle=spd>5?'#ff3040':'#ff9040';
          ctx.lineWidth=(1+t*3.5)*1.5;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(pts[i-1][0],pts[i-1][1]);ctx.lineTo(pts[i][0],pts[i][1]);ctx.stroke();
        }
      }
      // Soft glow halo on the last 6 segments (trail head)
      if(!isDead&&N>6){
        ctx.globalAlpha=0.22; ctx.strokeStyle=tc; ctx.lineWidth=9; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(pts[N-6][0],pts[N-6][1]);
        for(let i=N-5;i<N;i++) ctx.lineTo(pts[i][0],pts[i][1]);
        ctx.stroke();
      }
      ctx.globalAlpha=1; ctx.restore();
    }
  }

  // ── Position dot / death ghost ──
  if(!isDead){
    const raw=lerpPos(rc.positions,currentTick);
    if(raw){
      const[px,py]=g2p(raw[0],raw[1],rc.map);
      const prev=lerpPos(rc.positions,currentTick-10);
      let vdx=0,vdy=0;
      if(prev){const[ppx,ppy]=g2p(prev[0],prev[1],rc.map);vdx=px-ppx;vdy=py-ppy;}
      // Movement trail — fading polyline of recent path (CS2 broadcast ghost trail)
      {const TN=20,TS=3,trPts=[];for(let s=0;s<=TN;s++){const tP=lerpPos(rc.positions,currentTick-s*TS);if(!tP)break;trPts.push(g2p(tP[0],tP[1],rc.map));}
      if(trPts.length>=2){ctx.save();for(let s=0;s<trPts.length-1;s++){const a=(1-s/TN)*0.24;ctx.globalAlpha=a;ctx.strokeStyle=tc;ctx.lineWidth=Math.max(0.5,1.6*(1-s/TN));ctx.lineCap='round';ctx.beginPath();ctx.moveTo(trPts[s][0],trPts[s][1]);ctx.lineTo(trPts[s+1][0],trPts[s+1][1]);ctx.stroke();}ctx.restore();}}
      // Motion smear ghosts (drawn before main dot)
      const spd=Math.sqrt(vdx*vdx+vdy*vdy);
      if(spd>1.5){
        ctx.save();
        for(let lag=6;lag<=20;lag+=7){
          const gRaw=lerpPos(rc.positions,currentTick-lag);
          if(!gRaw) continue;
          const[gx,gy]=g2p(gRaw[0],gRaw[1],rc.map);
          const t=1-(lag/20);
          ctx.fillStyle=tc;ctx.globalAlpha=t*0.18;
          ctx.beginPath();ctx.arc(gx,gy,4.5*t,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      }
      const teamColor=teamHex(rc.team);
      // Aim cone — faint wedge showing facing direction when player is holding angle
      if(spd<10){
        const facePrev=lerpPos(rc.positions,currentTick-38);
        if(facePrev){
          const[fpx_,fpy_]=g2p(facePrev[0],facePrev[1],rc.map);
          const fdx=px-fpx_,fdy=py-fpy_;
          const flen=Math.sqrt(fdx*fdx+fdy*fdy);
          if(flen>5){
            const ang=Math.atan2(fdy,fdx);
            const CR=52,CS=Math.PI*0.28;
            ctx.save();
            ctx.globalAlpha=0.09;ctx.fillStyle=tc;
            ctx.beginPath();ctx.moveTo(px,py);
            ctx.arc(px,py,CR,ang-CS,ang+CS);
            ctx.closePath();ctx.fill();
            ctx.globalAlpha=0.16;ctx.strokeStyle=tc;ctx.lineWidth=0.65;
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      // Per-round kill count (used by both aura and badge)
      const _rkills=rc.kills.filter(k=>k.tick<=currentTick).length;
      // Kill streak aura ring — drawn under dot so it frames the player
      if(_rkills>=1){
        const _kPulse=0.62+0.38*Math.abs(Math.sin(currentTick*0.09));
        const _kColor=_rkills>=3?'#ffd060':_rkills>=2?'#30d890':tc;
        const _kR=14+(_rkills>=3?2:0);
        ctx.save();
        ctx.globalAlpha=0.30*_kPulse;ctx.strokeStyle=_kColor;ctx.lineWidth=_rkills>=3?2.4:1.5;
        ctx.beginPath();ctx.arc(px,py,_kR,0,Math.PI*2);ctx.stroke();
        if(_rkills>=2){
          ctx.globalAlpha=0.13*_kPulse;ctx.lineWidth=0.9;
          ctx.beginPath();ctx.arc(px,py,_kR+6,0,Math.PI*2);ctx.stroke();
        }
        if(_rkills>=3){
          // Gold outer halo for triple+ — hot streak indicator
          ctx.globalAlpha=0.07*_kPulse;ctx.strokeStyle='#ffd060';ctx.lineWidth=4;
          ctx.beginPath();ctx.arc(px,py,_kR+12,0,Math.PI*2);ctx.stroke();
        }
        ctx.restore();
      }
      drawPlayerDot(px,py,tc,teamColor,vdx,vdy);
      // Per-round kill count badge (upper-right of dot)
      if(_rkills>0){
        const _bx=px+9,_by=py-9;
        ctx.save();
        ctx.globalAlpha=0.95;
        ctx.fillStyle='#ff3050';
        ctx.beginPath();ctx.arc(_bx,_by,4.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.font='bold 6px "Inter",sans-serif';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(_rkills,_bx,_by);
        ctx.textBaseline='alphabetic';
        ctx.restore();
      }
      // Prediction ghost — faint outline at future position (+40 ticks)
      const _fRaw=lerpPos(rc.positions,currentTick+40);
      if(_fRaw){
        const[fpx,fpy]=g2p(_fRaw[0],_fRaw[1],rc.map);
        const _fd=Math.sqrt((fpx-px)**2+(fpy-py)**2);
        if(_fd>4){
          ctx.save();
          ctx.globalAlpha=0.14;
          ctx.strokeStyle=tc;ctx.lineWidth=0.9;ctx.setLineDash([2,3]);
          ctx.beginPath();ctx.arc(fpx,fpy,6.5,0,Math.PI*2);ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha=0.07;ctx.strokeStyle=tc;ctx.lineWidth=0.7;
          ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(fpx,fpy);ctx.stroke();
          ctx.restore();
        }
      }
    }
  } else {
    const d=rc.deaths.find(dd=>dd.tick<=currentTick);
    if(d){
      const[px,py]=g2p(d.x,d.y,rc.map);
      const teamColor=teamHex(rc.team);
      drawDeathMark(px,py,teamColor,tc,0.5);
      // Fresh death burst — expanding concentric rings for 32 ticks
      const dAge=currentTick-d.tick;
      if(dAge>=0&&dAge<32){
        const df=1-dAge/32;
        ctx.save();
        ctx.globalAlpha=df*0.7;ctx.strokeStyle=teamColor;ctx.lineWidth=2.2*df;
        ctx.beginPath();ctx.arc(px,py,10+dAge*2.6,0,Math.PI*2);ctx.stroke();
        ctx.globalAlpha=df*0.38;ctx.strokeStyle='#ffd060';ctx.lineWidth=1.2*df;
        ctx.beginPath();ctx.arc(px,py,6+dAge*1.5,0,Math.PI*2);ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ── Nades ──
  if(show.nades){drawSmokes(rc);drawFlashes(rc);drawHEs(rc);}

  // ── Fires (molotov/incendiary) — procedural flame field + a real CS2 molotov icon at the centre ──
  if(show.fires){
    ctx.save();
    const tiles=rc.fires.filter(f=>f.weapon==='Incendiary Grenade'||f.weapon==='Molotov');
    let cx=0,cy=0,cn=0,cMaxAge=-1;
    tiles.forEach(f=>{
      const age=currentTick-f.tick;
      if(age<0||age>160) return;
      const[px,py]=g2p(f.x,f.y,rc.map);
      const fade=Math.max(.05,age<20?age/20:age>120?(160-age)/40:1);
      const flick=0.80+0.20*Math.sin(currentTick*0.23+f.x*0.04+f.y*0.03);
      // Flame blob: orange glow + brighter yellow core (no cartoon sprite)
      const gl=ctx.createRadialGradient(px,py,0,px,py,18);
      gl.addColorStop(0,`rgba(255,210,70,${fade*0.85*flick})`);
      gl.addColorStop(0.45,`rgba(255,110,20,${fade*0.6*flick})`);
      gl.addColorStop(1,'rgba(200,40,0,0)');
      ctx.globalAlpha=1;ctx.fillStyle=gl;
      ctx.beginPath();ctx.arc(px,py,18,0,Math.PI*2);ctx.fill();
      cx+=px;cy+=py;cn++;cMaxAge=Math.max(cMaxAge,age);
    });
    if(cn){
      const lx=cx/cn,ly=cy/cn;
      const cFade=cMaxAge<140?1:Math.max(0,(160-cMaxAge)/20);
      // real CS2 molotov icon marks the burn
      _drawNadeIcon(lx,ly-10,'molotov',26,cFade*0.95,0);
      if(cMaxAge<420){
        const rem=Math.max(0,(448-cMaxAge)/64);
        ctx.globalAlpha=0.95;ctx.fillStyle='#ffb060';
        ctx.font='bold 9px "JetBrains Mono",monospace';ctx.textAlign='center';
        ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=2.5;
        ctx.strokeText(`${rem.toFixed(0)}s`,lx,ly+16);ctx.fillText(`${rem.toFixed(0)}s`,lx,ly+16);
      }
    }
    ctx.restore();
  }

  // ── Kill engagement beams (persistent — visible when scrubbing and during playback) ──
  if(show.kills){
    const beamCol=teamHex(rc.team);
    rc.kills.forEach(k=>{
      const age=currentTick-k.tick;
      if(age<0||age>90) return;
      const fade=age<8?(age/8):Math.max(0,1-(age-8)/82);
      const raw=lerpPos(rc.positions,k.tick);if(!raw) return;
      const[kpx,kpy]=g2p(raw[0],raw[1],rc.map);
      const[vx,vy]=g2p(k.other_x,k.other_y,rc.map);
      ctx.save();
      // White glow backing
      ctx.globalAlpha=fade*0.12;ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(kpx,kpy);ctx.lineTo(vx,vy);ctx.stroke();
      // Team-colored dashed beam
      ctx.globalAlpha=fade*0.72;ctx.strokeStyle=beamCol;ctx.lineWidth=1.7;
      ctx.setLineDash([5,4]);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(kpx,kpy);ctx.lineTo(vx,vy);ctx.stroke();ctx.setLineDash([]);
      // Arrowhead at victim
      const ang=Math.atan2(vy-kpy,vx-kpx);
      ctx.globalAlpha=fade*0.9;ctx.fillStyle=beamCol;
      ctx.beginPath();ctx.moveTo(vx,vy);
      ctx.lineTo(vx-8*Math.cos(ang-.42),vy-8*Math.sin(ang-.42));
      ctx.lineTo(vx-8*Math.cos(ang+.42),vy-8*Math.sin(ang+.42));
      ctx.closePath();ctx.fill();
      // Distance label at beam midpoint
      const gDist=Math.round(Math.sqrt((k.other_x-raw[0])**2+(k.other_y-raw[1])**2)/39.37);
      if(gDist>0){
        const mx=(kpx+vx)/2,my=(kpy+vy)/2;
        ctx.globalAlpha=fade*0.78;
        ctx.font='bold 7px "JetBrains Mono",monospace';ctx.textAlign='center';
        ctx.strokeStyle='rgba(0,0,0,.9)';ctx.lineWidth=2.5;
        ctx.strokeText(`${gDist}m`,mx,my-3);
        ctx.fillStyle=beamCol;ctx.fillText(`${gDist}m`,mx,my-3);
      }
      ctx.restore();
    });
  }

  // ── Kill markers (weapon-color coded X at victim position) ──
  if(show.kills){
    rc.kills.forEach(k=>{
      if(k.tick>currentTick) return;
      const[vx,vy]=g2p(k.other_x,k.other_y,rc.map);
      const wc=weaponColor(k.weapon);
      const age=currentTick-k.tick;
      const alpha=age<60?0.55+0.27*(1-age/60):0.82;
      ctx.save();ctx.globalAlpha=alpha;drawX(vx,vy,6,wc,2);ctx.restore();
    });
  }

  // ── Death markers (circle+X — distinct from kill X) ──
  if(show.deaths){
    const teamColor=teamHex(rc.team);
    rc.deaths.forEach(d=>{
      if(d.tick>currentTick) return;
      const[px,py]=g2p(d.x,d.y,rc.map);
      const wc=weaponColor(d.weapon);
      drawDeathMark(px,py,teamColor,wc,0.75);
    });
  }
}

function drawLabel(rc){
  if(rc.deaths.some(d=>d.tick<=currentTick)) return;
  const raw=lerpPos(rc.positions,currentTick);if(!raw) return;
  const[px,py]=g2p(raw[0],raw[1],rc.map);
  const K=rc.kills.filter(k=>k.tick<=currentTick).length;
  const D=rc.deaths.filter(d=>d.tick<=currentTick).length;
  const name=rc.playerName.length>10?rc.playerName.slice(0,9)+'…':rc.playerName;
  const teamColor=teamHex(rc.team);
  // Last weapon used (shown as a third line if player has kills)
  const _lastKill=K>0?rc.kills.filter(k=>k.tick<=currentTick).sort((a,b)=>b.tick-a.tick)[0]:null;
  const _wpn=_lastKill?(_lastKill.weapon||'')
    .replace('AK-47','AK47').replace('M4A1-S','M4A1S')
    .replace('Desert Eagle','DEAGLE').replace('SSG 08','SSG08')
    .replace('AWP','AWP').slice(0,7):'';
  ctx.save();ctx.textAlign='center';
  ctx.font='600 10px "Inter",sans-serif';
  const tw=ctx.measureText(name).width;
  ctx.font='600 8.5px "JetBrains Mono",monospace';
  const statsStr=`${K}K  ${D}D`;
  const sw=ctx.measureText(statsStr).width;
  ctx.font='600 7.5px "JetBrains Mono",monospace';
  const ww=_wpn?ctx.measureText(_wpn).width:0;
  const W=Math.max(tw,sw,ww);
  const lx=px,ly=py-22;
  const PAD=5,BAR=2.5,H=_wpn?38:26;
  // Background panel
  ctx.fillStyle='rgba(5,7,14,.90)';
  ctx.beginPath();ctx.roundRect(lx-W/2-PAD-BAR,ly-2,W+PAD*2+BAR,H,3);ctx.fill();
  // Team-color left bar
  ctx.fillStyle=teamColor;ctx.globalAlpha=0.9;
  ctx.beginPath();ctx.roundRect(lx-W/2-PAD-BAR,ly-2,BAR,H,[3,0,0,3]);ctx.fill();
  // Name line
  ctx.font='600 10px "Inter",sans-serif';ctx.fillStyle=rc.color;ctx.globalAlpha=.95;
  ctx.textAlign='center';ctx.fillText(name,lx+BAR/2,ly+9);
  // Stats line — K in green, D in dim
  ctx.globalAlpha=.8;
  ctx.font='600 8.5px "JetBrains Mono",monospace';
  ctx.fillStyle=K>0?'#30d890':'rgba(120,140,180,.6)';
  ctx.textAlign='right';ctx.fillText(`${K}K`,lx+BAR/2-2,ly+21);
  ctx.fillStyle='rgba(120,140,180,.55)';ctx.textAlign='left';
  ctx.fillText(`  ${D}D`,lx+BAR/2-2,ly+21);
  // Weapon line — weapon-color coded abbreviation
  if(_wpn){
    const _wc=weaponColor(_lastKill.weapon||'');
    ctx.globalAlpha=0.72;ctx.fillStyle=_wc;
    ctx.font='600 7.5px "JetBrains Mono",monospace';ctx.textAlign='center';
    ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=2;
    ctx.strokeText(_wpn,lx+BAR/2,ly+33);
    ctx.fillText(_wpn,lx+BAR/2,ly+33);
  }
  ctx.restore();
}

// tc=player identity color (PALETTE); teamColor=CT blue or T orange for ring
function drawPlayerDot(px,py,tc,teamColor,vdx,vdy){
  ctx.save();
  // Pulse ring (team-colored, subtle)
  const pulse=Math.sin(currentTick/14)*0.3+0.7;
  const pr=9+pulse*2.5;
  ctx.strokeStyle=teamColor;ctx.lineWidth=1;ctx.globalAlpha=0.16*(1-pulse*0.4);
  ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.stroke();
  // Outer glow (identity color)
  const g=ctx.createRadialGradient(px,py,0,px,py,16);
  g.addColorStop(0,tc+'44');g.addColorStop(1,tc+'00');
  ctx.globalAlpha=0.75;ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,16,0,Math.PI*2);ctx.fill();
  // Main ring — team color (CT=blue, T=orange), broadcast-standard side indicator
  ctx.strokeStyle=teamColor;ctx.lineWidth=2.8;ctx.globalAlpha=.95;
  ctx.beginPath();ctx.arc(px,py,8,0,Math.PI*2);ctx.stroke();
  // Dark fill
  ctx.fillStyle='rgba(6,9,18,.90)';ctx.globalAlpha=1;
  ctx.beginPath();ctx.arc(px,py,5.8,0,Math.PI*2);ctx.fill();
  // Center dot — player identity (PALETTE)
  ctx.fillStyle=tc;ctx.globalAlpha=1;
  ctx.beginPath();ctx.arc(px,py,2.8,0,Math.PI*2);ctx.fill();
  // Sprint ring — orange outer ring when moving fast
  // Hold ring — dim dotted ring when stationary (holding an angle)
  if(vdx!==undefined&&vdy!==undefined){
    const spd10=Math.sqrt(vdx*vdx+vdy*vdy); // px over 10 ticks
    if(spd10>18){
      const intensity=Math.min(1,(spd10-18)/24);
      ctx.strokeStyle=spd10>38?'#ff3040':'#ff9040';ctx.lineWidth=1.8;ctx.globalAlpha=intensity*0.5;
      ctx.beginPath();ctx.arc(px,py,12+intensity*2,0,Math.PI*2);ctx.stroke();
    } else if(spd10<3){
      const holdPulse=0.3+0.18*Math.sin(currentTick*0.045);
      ctx.strokeStyle='rgba(160,180,240,.55)';ctx.lineWidth=1;ctx.globalAlpha=holdPulse;
      ctx.setLineDash([1.5,3.5]);
      ctx.beginPath();ctx.arc(px,py,14,0,Math.PI*2);ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // Velocity arrow (team color)
  if(vdx!==undefined&&vdy!==undefined){
    const spd=Math.sqrt(vdx*vdx+vdy*vdy);
    if(spd>1.2){
      const nx=vdx/spd,ny=vdy/spd;
      const aLen=8+Math.min(10,spd*1.5);
      const tipX=px+nx*(9+aLen),tipY=py+ny*(9+aLen);
      const ang=Math.atan2(ny,nx);
      ctx.globalAlpha=0.72;ctx.strokeStyle=teamColor;ctx.fillStyle=teamColor;
      ctx.lineWidth=1.8;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(px+nx*9,py+ny*9);ctx.lineTo(tipX,tipY);ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tipX,tipY);
      ctx.lineTo(tipX-5*Math.cos(ang-.5),tipY-5*Math.sin(ang-.5));
      ctx.lineTo(tipX-5*Math.cos(ang+.5),tipY-5*Math.sin(ang+.5));
      ctx.closePath();ctx.fill();
    }
  }
  ctx.restore();
}

// Circle-with-X death marker — visually distinct from kill X
function drawDeathMark(x,y,ringColor,xColor,alpha){
  ctx.save();ctx.globalAlpha=alpha;
  ctx.strokeStyle=ringColor;ctx.lineWidth=1.8;
  ctx.beginPath();ctx.arc(x,y,7.5,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=ringColor+'22';
  ctx.beginPath();ctx.arc(x,y,7.5,0,Math.PI*2);ctx.fill();
  const d=4;
  ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineWidth=3.2;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x-d,y-d);ctx.lineTo(x+d,y+d);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x+d,y-d);ctx.lineTo(x-d,y+d);ctx.stroke();
  ctx.strokeStyle=xColor;ctx.lineWidth=1.8;
  ctx.beginPath();ctx.moveTo(x-d,y-d);ctx.lineTo(x+d,y+d);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x+d,y-d);ctx.lineTo(x-d,y+d);ctx.stroke();
  ctx.restore();
}

function drawX(x,y,r,color,lw){
  const d=r*.68;
  // Shadow
  ctx.save();ctx.strokeStyle='rgba(0,0,0,.75)';ctx.lineWidth=lw+2.5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x-d,y-d);ctx.lineTo(x+d,y+d);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x+d,y-d);ctx.lineTo(x-d,y+d);ctx.stroke();
  // Color
  ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x-d,y-d);ctx.lineTo(x+d,y+d);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x+d,y-d);ctx.lineTo(x-d,y+d);ctx.stroke();
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  NADE ANIMATION SYSTEM v20
// ══════════════════════════════════════════════════════

// Parabolic arc position (world coords → canvas position already handled by caller)
function _arcPos(tx,ty,lx,ly,t){
  return[tx+(lx-tx)*t, ty+(ly-ty)*t - 62*Math.sin(Math.PI*t)];
}

// Estimate throw landing using player velocity at throw tick
function _estimateLand(throwX,throwY,rc,throwTick,dist){
  const raw=lerpPos(rc.positions,throwTick);
  const raw2=lerpPos(rc.positions,throwTick-8);
  let ex=throwX,ey=throwY;
  if(raw&&raw2){
    const vx=raw[0]-raw2[0],vy=raw[1]-raw2[1];
    const len=Math.sqrt(vx*vx+vy*vy);
    if(len>0.4){ex=throwX+(vx/len)*dist;ey=throwY+(vy/len)*dist;}
    else{ex=throwX;ey=throwY-dist*0.6;}
  }
  return g2p(ex,ey,rc.map);
}

// Flight time (in ticks) scaled to throw distance, so long lineups visibly arc.
function _flightTicks(tx,ty,lx,ly){
  return Math.round(Math.min(60,Math.max(22,Math.hypot(lx-tx,ly-ty)*0.16)));
}

// Draw the full parabolic arc guide: soft glow underlay + crisp dashed line on top.
function _drawArcGuide(tx,ty,lx,ly,color,alpha){
  const mx=(tx+lx)/2,my=(ty+ly)/2-62;
  ctx.save();ctx.lineCap='round';
  // soft glow underlay — makes the path readable over a busy radar
  ctx.globalAlpha=alpha*0.45;ctx.strokeStyle=color;ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(tx,ty);ctx.quadraticCurveTo(mx,my,lx,ly);ctx.stroke();
  // crisp dashed flight line
  ctx.globalAlpha=Math.min(1,alpha*1.6);ctx.lineWidth=1.8;ctx.setLineDash([5,5]);
  ctx.beginPath();ctx.moveTo(tx,ty);ctx.quadraticCurveTo(mx,my,lx,ly);ctx.stroke();
  ctx.setLineDash([]);
  // throw origin marker (the lineup spot)
  ctx.globalAlpha=alpha*1.2;ctx.fillStyle=color;
  ctx.beginPath();ctx.arc(tx,ty,3.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// Landing reticle — a target at the destination that tightens as the nade nears it.
function _drawLandReticle(lx,ly,color,t){
  const r=7+(1-t)*9;
  ctx.save();
  ctx.globalAlpha=0.35+0.45*t;ctx.strokeStyle=color;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.arc(lx,ly,r,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lx-r-3,ly);ctx.lineTo(lx-r+2,ly); ctx.moveTo(lx+r-2,ly);ctx.lineTo(lx+r+3,ly);
  ctx.moveTo(lx,ly-r-3);ctx.lineTo(lx,ly-r+2); ctx.moveTo(lx,ly+r-2);ctx.lineTo(lx,ly+r+3);
  ctx.stroke();
  ctx.restore();
}

// Draw the flying grenade: bright glowing orb with a comet trail along the arc.
// Draw the authentic CS2 grenade icon (item render) centred at x,y, fit to `size` wide.
function _drawNadeIcon(x,y,type,size,alpha,rot){
  const img=NADE_IMG[type];
  if(!img||!img.complete||!img.naturalWidth) return false;
  const w=size,h=size*(img.naturalHeight/img.naturalWidth);
  ctx.save();
  ctx.globalAlpha=alpha;ctx.translate(x,y);if(rot)ctx.rotate(rot);
  ctx.drawImage(img,-w/2,-h/2,w,h);
  ctx.restore();
  return true;
}

// The flying grenade: comet trail + glow, with the real CS2 grenade tumbling along the arc.
function _drawProjectile(tx,ty,lx,ly,t,color,sz,type){
  const[cx,cy]=_arcPos(tx,ty,lx,ly,t);
  ctx.save();
  for(let lag=1;lag<=8;lag++){
    const lt=Math.max(0,t-lag*0.05);
    const[lc,lcy]=_arcPos(tx,ty,lx,ly,lt);
    ctx.globalAlpha=(1-lag/9)*0.42;ctx.fillStyle=color;
    ctx.beginPath();ctx.arc(lc,lcy,sz*(1-lag/9),0,Math.PI*2);ctx.fill();
  }
  const g=ctx.createRadialGradient(cx,cy,0,cx,cy,sz*3.4);
  g.addColorStop(0,color+'cc');g.addColorStop(1,color+'00');
  ctx.globalAlpha=1;ctx.fillStyle=g;
  ctx.beginPath();ctx.arc(cx,cy,sz*3.4,0,Math.PI*2);ctx.fill();
  ctx.restore();
  // the real grenade, tumbling as it flies
  if(!_drawNadeIcon(cx,cy,type,sz*5,1,(t*7)%(Math.PI*2))){
    ctx.save();ctx.globalAlpha=1;ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(cx,cy,sz*0.7,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  return[cx,cy];
}

function drawSmokes(rc){
  const sc=(MAP_META[rc.map]||MAP_META.de_dust2).s;
  const R=Math.max(26,145/sc); // real CS2 smoke radius (~144u) → px for this map
  rc.smokes.forEach(s=>{
    const age=currentTick-s.tick;if(age<0||age>1216) return;
    const[tx,ty]=g2p(s.throw_x,s.throw_y,rc.map);
    const[lx,ly]=g2p(s.land_x,s.land_y,rc.map);
    const FLIGHT=_flightTicks(tx,ty,lx,ly),DEPLOY=1152; // CS2 smokes last 18s = 1152 ticks at 64hz
    ctx.save();

    if(age<=FLIGHT){
      const t=age/FLIGHT;
      _drawArcGuide(tx,ty,lx,ly,'#9fb0c0',0.5);
      _drawLandReticle(lx,ly,'#bcd4ff',t);
      _drawProjectile(tx,ty,lx,ly,t,'#dbe6f5',4.5,'smoke');
    } else {
      const sa=age-FLIGHT;if(sa>DEPLOY){ctx.restore();return;}
      // Faint lineup line back to the throw origin, so the throw spot stays discoverable.
      ctx.save();
      ctx.globalAlpha=Math.max(0,(1-sa/DEPLOY))*0.18;ctx.strokeStyle='#9fb0c0';ctx.lineWidth=1;ctx.setLineDash([3,7]);
      ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(lx,ly);ctx.stroke();ctx.setLineDash([]);
      ctx.restore();
      const fadeIn=Math.min(1,sa/22);
      const fadeOut=sa>DEPLOY-90?(DEPLOY-sa)/90:1;
      const fade=Math.min(fadeIn,fadeOut);
      const _breathe=1+0.025*Math.sin(currentTick*0.038+s.land_x*0.007);
      const r=R*Math.min(1,0.55+sa/22*0.45)*_breathe; // bloom + subtle breath

      // Light body so the cloud reads on the darkened radar
      const grd=ctx.createRadialGradient(lx,ly,r*0.1,lx,ly,r);
      grd.addColorStop(0,`rgba(176,184,198,${fade*0.92})`);
      grd.addColorStop(0.7,`rgba(140,148,162,${fade*0.82})`);
      grd.addColorStop(1,`rgba(96,104,118,0)`);
      ctx.globalAlpha=1;ctx.fillStyle=grd;
      ctx.beginPath();ctx.arc(lx,ly,r,0,Math.PI*2);ctx.fill();
      // Quiet edge so the radius is legible for analysis
      const _edgeA=fade*(0.42+0.14*Math.sin(currentTick*0.05+s.land_x*0.009));
      ctx.globalAlpha=_edgeA;ctx.strokeStyle='rgba(214,222,236,.65)';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.arc(lx,ly,r*0.94,0,Math.PI*2);ctx.stroke();

      // Real CS2 smoke-grenade icon marks the deploy spot, with the countdown beneath it.
      if(fade>0.4){
        _drawNadeIcon(lx,ly-r*0.34,'smoke',Math.min(34,r*0.95),fade*0.95,0);
        const rem=Math.max(0,(DEPLOY-sa)/64);
        if(rem>0.5){
          ctx.globalAlpha=fade*0.95;
          ctx.fillStyle='#11161f';ctx.font='bold 10px "JetBrains Mono",monospace';ctx.textAlign='center';
          ctx.strokeStyle='rgba(235,240,248,.9)';ctx.lineWidth=2.5;
          ctx.strokeText(`${rem.toFixed(0)}s`,lx,ly+r*0.5);
          ctx.fillText(`${rem.toFixed(0)}s`,lx,ly+r*0.5);
        }
      }
    }
    ctx.restore();
  });
}

function drawFlashes(rc){
  rc.flashes.forEach(f=>{
    const[tx,ty]=g2p(f.throw_x,f.throw_y,rc.map);
    // Use the real detonation point if the data has one; else estimate from throw velocity.
    const[lx,ly]=(f.land_x!==undefined&&(f.land_x!==f.throw_x||f.land_y!==f.throw_y))
      ? g2p(f.land_x,f.land_y,rc.map) : _estimateLand(f.throw_x,f.throw_y,rc,f.tick,260);
    const FLIGHT=_flightTicks(tx,ty,lx,ly),BURST=50;
    const age=currentTick-f.tick;if(age<0||age>FLIGHT+BURST+18) return;
    ctx.save();

    if(age<=FLIGHT){
      const t=age/FLIGHT;
      _drawArcGuide(tx,ty,lx,ly,'#ffe060',0.42);
      _drawLandReticle(lx,ly,'#ffe87a',t);
      _drawProjectile(tx,ty,lx,ly,t,'#ffe87a',4,'flashbang');
    } else {
      const ba=age-FLIGHT;
      const fade=Math.max(0,1-ba/BURST);
      const r=Math.min(34,12+ba*3.2);
      // Procedural flash bloom (no cartoon sprite)
      const bg=ctx.createRadialGradient(lx,ly,0,lx,ly,r);
      bg.addColorStop(0,`rgba(255,255,240,${fade})`);
      bg.addColorStop(0.5,`rgba(255,248,190,${fade*0.7})`);
      bg.addColorStop(1,'rgba(255,240,150,0)');
      ctx.globalAlpha=1;ctx.fillStyle=bg;
      ctx.beginPath();ctx.arc(lx,ly,r,0,Math.PI*2);ctx.fill();
      // Real CS2 flashbang icon at the detonation spot
      if(ba<26) _drawNadeIcon(lx,ly,'flashbang',24,Math.min(1,fade*1.3),0);
    }
    ctx.restore();
  });
}

function drawHEs(rc){
  rc.hes.forEach(h=>{
    const[tx,ty]=g2p(h.throw_x,h.throw_y,rc.map);
    const[lx,ly]=(h.land_x!==undefined&&(h.land_x!==h.throw_x||h.land_y!==h.throw_y))
      ? g2p(h.land_x,h.land_y,rc.map) : _estimateLand(h.throw_x,h.throw_y,rc,h.tick,200);
    const FLIGHT=_flightTicks(tx,ty,lx,ly),BLAST=72;
    const age=currentTick-h.tick;if(age<0||age>FLIGHT+BLAST+18) return;
    ctx.save();

    if(age<=FLIGHT){
      const t=age/FLIGHT;
      _drawArcGuide(tx,ty,lx,ly,'#ff8020',0.46);
      _drawLandReticle(lx,ly,'#ffb060',t);
      _drawProjectile(tx,ty,lx,ly,t,'#ffb340',4,'he');
    } else {
      const ea=age-FLIGHT;
      const fade=Math.max(0,1-ea/BLAST);
      const r=Math.min(40,14+ea*3.6); // contained blast — no expanding sonar rings
      // Procedural fire core (contained)
      const cg=ctx.createRadialGradient(lx,ly,0,lx,ly,r);
      cg.addColorStop(0,`rgba(255,255,200,${fade})`);
      cg.addColorStop(0.4,`rgba(255,140,10,${fade*0.85})`);
      cg.addColorStop(1,'rgba(200,50,0,0)');
      ctx.globalAlpha=1;ctx.fillStyle=cg;
      ctx.beginPath();ctx.arc(lx,ly,r,0,Math.PI*2);ctx.fill();
      // Real CS2 HE-grenade icon at the detonation spot
      if(ea<26) _drawNadeIcon(lx,ly,'he',24,Math.min(1,fade*1.3),0);
    }
    ctx.restore();
  });
}

