// ============================================================
//  ALL BACKGROUNDS — bundled so file:// and OBS both work
//  config.js picks which one runs via SASI_CONFIG.background
// ============================================================

// Convert hex to [r,g,b] — used to make canvas colors follow config theme
function bgHexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return [255, 34, 0];
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
// Read canvas colors from the live CSS variables on :root. Previously this
// read from SASI_CONFIG.colors which is captured at page-load time and never
// re-checked — so palette swaps via the watcher's inject + the dashboard's
// postMessage path didn't reach the canvas background. getComputedStyle on
// document.documentElement always reflects the current CSS var resolution,
// so each call to bgColors() picks up whatever palette is active right now.
function bgColors() {
  const cs = getComputedStyle(document.documentElement);
  const parseRgbTuple = (s) => {
    if (!s) return null;
    const parts = String(s).trim().split(',').map(n => parseInt(n.trim(), 10));
    return (parts.length === 3 && parts.every(n => !isNaN(n))) ? parts : null;
  };
  const fromVar = (rgbVar, hexVar, fallback) => {
    const tup = parseRgbTuple(cs.getPropertyValue(rgbVar));
    if (tup) return tup;
    const hex = (cs.getPropertyValue(hexVar) || '').trim();
    if (hex) return bgHexToRgb(hex);
    // Last-resort fall back to config (legacy path).
    return fallback;
  };
  const c = (window.SASI_CONFIG && SASI_CONFIG.colors) || {};
  return {
    primary:   fromVar('--red-rgb',    '--red',    bgHexToRgb(c.red    || '#FF2200')),
    secondary: fromVar('--orange-rgb', '--orange', bgHexToRgb(c.orange || '#FF7700')),
    accent:    fromVar('--gold-rgb',   '--gold',   bgHexToRgb(c.gold   || '#FFD700')),
  };
}

const BG_THEMES = {};

// ── HEXGRID ─────────────────────────────────────────────────
BG_THEMES.hexgrid = function(bgCanvas, topCanvas, opts) {
  const C = bgColors();
  opts = opts || {};
  const bgX = bgCanvas.getContext('2d');
  const fX  = topCanvas.getContext('2d');
  bgCanvas.width = topCanvas.width = 1920;
  bgCanvas.height = topCanvas.height = 1080;

  const RX = opts.rayOrigin === 'left' ? 90 : 1830, RY = 46;
  const rays = Array.from({length:22}, (_,i) => ({
    a:(i/22)*Math.PI*2, spd:.00022+Math.random()*.00018,
    len:300+Math.random()*500, w:.7+Math.random()*1.5, alf:.025+Math.random()*.035,
  }));
  let hexT = 0;
  function drawHex() {
    const size=36, cols=Math.ceil(1920/(size*1.732))+2, rows=Math.ceil(1080/(size*1.5))+2;
    for (let row=0;row<rows;row++) for (let col=0;col<cols;col++) {
      const x=col*size*1.732+(row%2)*size*0.866, y=row*size*1.5;
      const dist=Math.sqrt((x-960)**2+(y-540)**2);
      if(dist>800) continue;
      const fade=(1-dist/800)*0.14;
      const bright=(Math.sin(col*3.7+row*2.3+hexT*0.8)>0.88)?fade*5:fade;
      bgX.beginPath();
      for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2-Math.PI/6;const px=x+size*0.88*Math.cos(a),py=y+size*0.88*Math.sin(a);i===0?bgX.moveTo(px,py):bgX.lineTo(px,py);}
      bgX.closePath();bgX.strokeStyle=`rgba(${C.primary[0]},${C.primary[1]},${C.primary[2]},${bright})`;bgX.lineWidth=0.5;bgX.stroke();
    }
    hexT+=0.02;
  }
  function drawBg() {
    bgX.clearRect(0,0,1920,1080); drawHex();
    rays.forEach(r=>{r.a+=r.spd;const ex=RX+Math.cos(r.a)*r.len*3,ey=RY+Math.sin(r.a)*r.len*3;const g=bgX.createLinearGradient(RX,RY,ex,ey);g.addColorStop(0,`rgba(${C.primary[0]},${C.primary[1]},${C.primary[2]},${r.alf*2.5})`);g.addColorStop(.3,`rgba(${C.primary[0]},${C.primary[1]},${C.primary[2]},${r.alf})`);g.addColorStop(1,`rgba(${C.primary[0]},${C.primary[1]},${C.primary[2]},0)`);bgX.beginPath();bgX.moveTo(RX,RY);bgX.lineTo(ex,ey);bgX.strokeStyle=g;bgX.lineWidth=r.w;bgX.stroke();});
  }
  const BOKEH=Array.from({length:16},()=>({x:Math.random()*1920,y:Math.random()*1080+100,r:18+Math.random()*55,vy:-(0.1+Math.random()*0.26),vx:(Math.random()-.5)*.1,alpha:.035+Math.random()*.07,col:[C.primary,C.secondary,C.accent,C.primary][Math.floor(Math.random()*4)],ph:Math.random()*Math.PI*2,ps:.007+Math.random()*.011}));
  const SHAPES=Array.from({length:20},()=>({x:Math.random()*1920,y:Math.random()*1080+100,size:5+Math.random()*14,rot:Math.random()*Math.PI*2,rs:(Math.random()-.5)*.02,vy:-(0.15+Math.random()*0.32),vx:(Math.random()-.5)*.14,alpha:.22+Math.random()*.38,type:Math.random()>.5?'d':'t',col:[C.primary,C.secondary,C.accent,C.primary][Math.floor(Math.random()*4)]}));
  function drawTop() {
    fX.clearRect(0,0,1920,1080);
    BOKEH.forEach(b=>{b.ph+=b.ps;b.y+=b.vy;b.x+=b.vx;if(b.y<-120){b.y=1220;b.x=Math.random()*1920;}const p=.7+.3*Math.sin(b.ph);const g=fX.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r*2.2);g.addColorStop(0,`rgba(${b.col[0]},${b.col[1]},${b.col[2]},${b.alpha*p})`);g.addColorStop(.4,`rgba(${b.col[0]},${b.col[1]},${b.col[2]},${b.alpha*p*.25})`);g.addColorStop(1,`rgba(${b.col[0]},${b.col[1]},${b.col[2]},0)`);fX.beginPath();fX.arc(b.x,b.y,b.r*2.2,0,Math.PI*2);fX.fillStyle=g;fX.fill();});
    SHAPES.forEach(s=>{s.y+=s.vy;s.x+=s.vx;s.rot+=s.rs;if(s.y<-30){s.y=1150;s.x=Math.random()*1920;}fX.save();fX.globalAlpha=s.alpha;fX.strokeStyle=`rgb(${s.col[0]},${s.col[1]},${s.col[2]})`;fX.lineWidth=1.6;fX.translate(s.x,s.y);fX.rotate(s.rot);fX.beginPath();if(s.type==='t'){fX.moveTo(0,-s.size);fX.lineTo(s.size*.866,s.size*.5);fX.lineTo(-s.size*.866,s.size*.5);}else{fX.moveTo(0,-s.size);fX.lineTo(s.size,0);fX.lineTo(0,s.size);fX.lineTo(-s.size,0);}fX.closePath();fX.stroke();fX.restore();});
  }
  let skip=false;function loop(){skip=!skip;if(!skip){drawBg();drawTop();}requestAnimationFrame(loop);}loop();
};

// ── PARTICLES ───────────────────────────────────────────────
BG_THEMES.particles = function(bgCanvas, topCanvas, opts) {
  const C = bgColors();
  const bgX=bgCanvas.getContext('2d'),fX=topCanvas.getContext('2d');
  bgCanvas.width=topCanvas.width=1920;bgCanvas.height=topCanvas.height=1080;
  const particles=Array.from({length:60},()=>({x:Math.random()*1920,y:Math.random()*1080,vx:(Math.random()-.5)*0.4,vy:(Math.random()-.5)*0.4,r:2+Math.random()*3,alpha:.15+Math.random()*.35,col:[C.primary,C.secondary,C.accent,C.primary][Math.floor(Math.random()*4)]}));
  const BOKEH=Array.from({length:10},()=>({x:Math.random()*1920,y:Math.random()*1080+100,r:30+Math.random()*80,vy:-(0.05+Math.random()*0.15),vx:(Math.random()-.5)*.06,alpha:.02+Math.random()*.04,col:[C.primary,C.secondary,C.accent][Math.floor(Math.random()*3)],ph:Math.random()*Math.PI*2,ps:.005+Math.random()*.008}));
  function drawBg(){
    bgX.clearRect(0,0,1920,1080);
    for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){const dx=particles[i].x-particles[j].x,dy=particles[i].y-particles[j].y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<180){bgX.beginPath();bgX.moveTo(particles[i].x,particles[i].y);bgX.lineTo(particles[j].x,particles[j].y);bgX.strokeStyle=`rgba(${C.primary[0]},${C.primary[1]},${C.primary[2]},${(1-dist/180)*0.08})`;bgX.lineWidth=0.5;bgX.stroke();}}
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=1920;if(p.x>1920)p.x=0;if(p.y<0)p.y=1080;if(p.y>1080)p.y=0;bgX.beginPath();bgX.arc(p.x,p.y,p.r,0,Math.PI*2);bgX.fillStyle=`rgba(${p.col[0]},${p.col[1]},${p.col[2]},${p.alpha})`;bgX.fill();const g=bgX.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);g.addColorStop(0,`rgba(${p.col[0]},${p.col[1]},${p.col[2]},${p.alpha*0.3})`);g.addColorStop(1,`rgba(${p.col[0]},${p.col[1]},${p.col[2]},0)`);bgX.beginPath();bgX.arc(p.x,p.y,p.r*4,0,Math.PI*2);bgX.fillStyle=g;bgX.fill();});
  }
  function drawTop(){
    fX.clearRect(0,0,1920,1080);
    BOKEH.forEach(b=>{b.ph+=b.ps;b.y+=b.vy;b.x+=b.vx;if(b.y<-120){b.y=1220;b.x=Math.random()*1920;}const p=.7+.3*Math.sin(b.ph);const g=fX.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r*2);g.addColorStop(0,`rgba(${b.col[0]},${b.col[1]},${b.col[2]},${b.alpha*p})`);g.addColorStop(.5,`rgba(${b.col[0]},${b.col[1]},${b.col[2]},${b.alpha*p*.2})`);g.addColorStop(1,`rgba(${b.col[0]},${b.col[1]},${b.col[2]},0)`);fX.beginPath();fX.arc(b.x,b.y,b.r*2,0,Math.PI*2);fX.fillStyle=g;fX.fill();});
  }
  let skip=false;function loop(){skip=!skip;if(!skip){drawBg();drawTop();}requestAnimationFrame(loop);}loop();
};

// ── EMBER ───────────────────────────────────────────────────
BG_THEMES.ember = function(bgCanvas, topCanvas, opts) {
  const bgX=bgCanvas.getContext('2d'),fX=topCanvas.getContext('2d');
  bgCanvas.width=topCanvas.width=1920;bgCanvas.height=topCanvas.height=1080;
  const C=SASI_CONFIG.colors;
  function h2r(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
  const cR=h2r(C.red),cO=h2r(C.orange),cG=h2r(C.gold);
  const embers=Array.from({length:50},()=>({x:Math.random()*1920,y:1080+Math.random()*200,vx:(Math.random()-.5)*0.6,vy:-(0.5+Math.random()*1.5),size:1+Math.random()*3,alpha:.3+Math.random()*.7,col:[cR,cO,cG][Math.floor(Math.random()*3)],flicker:Math.random()*Math.PI*2,flickerSpd:.03+Math.random()*.06,drift:Math.random()*Math.PI*2}));
  const wisps=Array.from({length:8},()=>({x:Math.random()*1920,y:800+Math.random()*280,vx:(Math.random()-.5)*0.2,vy:-(0.1+Math.random()*0.3),r:60+Math.random()*120,alpha:.01+Math.random()*.03,col:cR,ph:Math.random()*Math.PI*2}));
  function drawBg(){
    bgX.clearRect(0,0,1920,1080);
    const glow=bgX.createRadialGradient(960,1100,100,960,1100,800);glow.addColorStop(0,`rgba(${cR[0]},${cR[1]},${cR[2]},.06)`);glow.addColorStop(1,'transparent');bgX.fillStyle=glow;bgX.fillRect(0,0,1920,1080);
    wisps.forEach(w=>{w.ph+=.008;w.y+=w.vy;w.x+=w.vx+Math.sin(w.ph)*0.3;if(w.y<-w.r*2){w.y=1080+w.r;w.x=Math.random()*1920;}const g=bgX.createRadialGradient(w.x,w.y,0,w.x,w.y,w.r);g.addColorStop(0,`rgba(${w.col[0]},${w.col[1]},${w.col[2]},${w.alpha})`);g.addColorStop(1,'transparent');bgX.fillStyle=g;bgX.beginPath();bgX.arc(w.x,w.y,w.r,0,Math.PI*2);bgX.fill();});
  }
  function drawTop(){
    fX.clearRect(0,0,1920,1080);
    embers.forEach(e=>{e.flicker+=e.flickerSpd;e.drift+=.01;e.y+=e.vy;e.x+=e.vx+Math.sin(e.drift)*0.5;if(e.y<-20){e.y=1080+Math.random()*100;e.x=Math.random()*1920;e.alpha=.3+Math.random()*.7;}const fl=.5+.5*Math.sin(e.flicker);const a=e.alpha*fl;fX.beginPath();fX.arc(e.x,e.y,e.size,0,Math.PI*2);fX.fillStyle=`rgba(${e.col[0]},${e.col[1]},${e.col[2]},${a})`;fX.fill();const g=fX.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*6);g.addColorStop(0,`rgba(${e.col[0]},${e.col[1]},${e.col[2]},${a*0.4})`);g.addColorStop(1,'transparent');fX.fillStyle=g;fX.beginPath();fX.arc(e.x,e.y,e.size*6,0,Math.PI*2);fX.fill();});
  }
  let skip=false;function loop(){skip=!skip;if(!skip){drawBg();drawTop();}requestAnimationFrame(loop);}loop();
};

// ── MATRIX ──────────────────────────────────────────────────
BG_THEMES.matrix = function(bgCanvas, topCanvas, opts) {
  const bgX=bgCanvas.getContext('2d'),fX=topCanvas.getContext('2d');
  bgCanvas.width=topCanvas.width=1920;bgCanvas.height=topCanvas.height=1080;
  const C=SASI_CONFIG.colors;
  function h2r(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
  const cR=h2r(C.red),cO=h2r(C.orange);
  const CHARS='ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオ01234567890<>{}#$@';
  const FS=16,COLS=Math.ceil(1920/FS);
  // Only use every 3rd column — sparser rain
  const activeCols=Array.from({length:COLS},(_,i)=>i%3===0);
  const drops=Array.from({length:COLS},()=>Math.random()*-100);
  const speeds=Array.from({length:COLS},()=>0.2+Math.random()*0.5);
  bgX.fillStyle=C.bg;bgX.fillRect(0,0,1920,1080);
  function drawBg(){
    bgX.fillStyle=`rgba(${h2r(C.bg).join(',')},0.08)`;bgX.fillRect(0,0,1920,1080);bgX.font=FS+'px monospace';
    for(let i=0;i<COLS;i++){if(!activeCols[i])continue;const x=i*FS,y=drops[i]*FS;const ch=CHARS[Math.floor(Math.random()*CHARS.length)];const hc=Math.random()>0.7?cO:cR;bgX.fillStyle=`rgba(${hc[0]},${hc[1]},${hc[2]},0.35)`;bgX.fillText(ch,x,y);bgX.fillStyle=`rgba(${cR[0]},${cR[1]},${cR[2]},0.06)`;bgX.fillText(CHARS[Math.floor(Math.random()*CHARS.length)],x,y-FS);drops[i]+=speeds[i];if(drops[i]*FS>1080&&Math.random()>0.98)drops[i]=0;}
  }
  const BOKEH=Array.from({length:8},()=>({x:Math.random()*1920,y:Math.random()*1080+100,r:25+Math.random()*50,vy:-(0.08+Math.random()*0.15),vx:(Math.random()-.5)*.08,alpha:.02+Math.random()*.04,col:Math.random()>0.5?cR:cO,ph:Math.random()*Math.PI*2,ps:.006+Math.random()*.01}));
  function drawTop(){
    fX.clearRect(0,0,1920,1080);
    BOKEH.forEach(b=>{b.ph+=b.ps;b.y+=b.vy;b.x+=b.vx;if(b.y<-120){b.y=1220;b.x=Math.random()*1920;}const p=.7+.3*Math.sin(b.ph);const g=fX.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r*2);g.addColorStop(0,`rgba(${b.col[0]},${b.col[1]},${b.col[2]},${b.alpha*p})`);g.addColorStop(1,'transparent');fX.beginPath();fX.arc(b.x,b.y,b.r*2,0,Math.PI*2);fX.fillStyle=g;fX.fill();});
  }
  let skip=false;function loop(){skip=!skip;if(!skip){drawBg();drawTop();}requestAnimationFrame(loop);}loop();
};

// ── MINIMAL ─────────────────────────────────────────────────
BG_THEMES.minimal = function(bgCanvas, topCanvas, opts) {
  const C = bgColors();
  bgCanvas.width=topCanvas.width=1920;bgCanvas.height=topCanvas.height=1080;
};

// ── INIT — called by each overlay's waitForBg() ─────────────
// opts.scene: scene key for per-scene bg override (e.g. 'startingSoon', 'brb', 'ending')
function initBg(bgCanvas, topCanvas, opts) {
  let theme = SASI_CONFIG.background || 'hexgrid';
  // Per-scene override from dashboard
  if (opts && opts.scene) {
    try {
      const sceneBg = localStorage.getItem('sasi_bg_' + opts.scene);
      if (sceneBg) theme = sceneBg;
    } catch(e) {}
  }
  if (theme === 'random') {
    const keys = Object.keys(BG_THEMES).filter(k => k !== 'minimal');
    theme = keys[Math.floor(Math.random() * keys.length)];
  }
  const fn = BG_THEMES[theme] || BG_THEMES.hexgrid;
  fn(bgCanvas, topCanvas, opts);
}
