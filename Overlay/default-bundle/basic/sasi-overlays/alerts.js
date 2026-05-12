// ============================================================
//  SASI STREAMS — CROSS-OVERLAY ALERT SYSTEM
//  Polls StreamElements activities every 20s.
//  Dedupes via localStorage so alerts never replay across scenes.
//  Each overlay that loads this file gets a small popup.
// ============================================================

(function() {
  const POLL_INTERVAL = 20000;
  const SHOWN_KEY     = 'sasi_shown_alerts';
  const POPUP_DURATION = 4500;  // ms each alert is visible
  const POPUP_GAP      = 600;   // ms between consecutive popups

  // ── State ──
  let shownIds = new Set();
  let popupQueue = [];
  let isShowing = false;

  try {
    const stored = localStorage.getItem(SHOWN_KEY);
    if (stored) shownIds = new Set(JSON.parse(stored));
  } catch(e) {}

  // ── Tier config ──
  const NEON_COLORS = [
    { neon:'#00ff9c', rgb:'0,255,156' },
    { neon:'#22d3ee', rgb:'34,211,238' },
    { neon:'#a78bfa', rgb:'167,139,250' },
    { neon:'#f472b6', rgb:'244,114,182' },
    { neon:'#ff7700', rgb:'255,119,0' },
    { neon:'#ffd700', rgb:'255,215,0' },
  ];
  let neonIdx = 0;
  function nextNeon() { const t = NEON_COLORS[neonIdx % NEON_COLORS.length]; neonIdx++; return t; }

  // Read from config or use defaults
  const alertCfg = (window.SASI_CONFIG && SASI_CONFIG.alerts) || {};
  const tierCfg  = alertCfg.tiers || { 1:{min:0,max:99}, 2:{min:100,max:499}, 3:{min:500,max:1999}, 4:{min:2000,max:99999} };
  const MAX_DUR  = alertCfg.maxDuration || 7000;
  const BASE_DUR = alertCfg.baseDuration || 2500;

  function getTier(amount) {
    const amt = Number(amount) || 0;
    if (amt >= (tierCfg[4] && tierCfg[4].min || 2000)) return 4;
    if (amt >= (tierCfg[3] && tierCfg[3].min || 500))  return 3;
    if (amt >= (tierCfg[2] && tierCfg[2].min || 100))  return 2;
    return 1;
  }

  // Duration scales logarithmically with amount
  function getAmountDuration(amount) {
    const amt = Math.max(20, Number(amount) || 20);
    const maxExtra = MAX_DUR - BASE_DUR;
    return Math.round(BASE_DUR + Math.min(maxExtra, Math.log10(amt) * (maxExtra / 4)));
  }

  // ── Inject CSS ──
  const css = `
    /* ═══ ALERT CONTAINER ═══ */
    .alert-frame { position:relative; overflow:visible; }
    .alert-frame.sasi-has-alert > *:not(.sasi-alert-popup) { opacity:0 !important; }

    .sasi-alert-popup {
      position:absolute;
      inset:0;
      display:flex; align-items:flex-end; justify-content:var(--alert-align, flex-start);
      opacity:0;
      transform:translateY(12px) scale(.95);
      transition:opacity .35s ease, transform .5s cubic-bezier(.16,1,.3,1);
      z-index:50;
      pointer-events:none;
      font-family:'Inter','Arial Black',sans-serif;
      box-sizing:border-box;
    }
    /* Floating fallback when no .alert-frame exists */
    .sasi-alert-popup.floating {
      position:fixed;
      inset:auto;
      bottom:80px; left:50%;
      transform:translateX(-50%) translateY(20px) scale(.95);
      z-index:9999;
    }
    .sasi-alert-popup.in {
      opacity:1;
      transform:translateY(0) scale(1);
    }
    .sasi-alert-popup.floating.in {
      transform:translateX(-50%) translateY(0) scale(1);
    }
    .sasi-alert-popup.out {
      opacity:0;
      transform:translateY(-8px) scale(.97);
      transition:opacity .3s ease, transform .35s ease;
    }
    .sasi-alert-popup.floating.out {
      transform:translateX(-50%) translateY(-8px) scale(.97);
    }

    /* ═══ SHARED CARD BASE ═══ */
    .sa-card {
      width:500px; height:118px;
      position:relative;
      overflow:hidden;
      border-radius:10px;
      font-family:'Inter','Arial Black',sans-serif;
    }
    .sa-game::after { display:none; }
    .sa-card::after {
      content:''; position:absolute; inset:0;
      background:repeating-linear-gradient(180deg, transparent 0, transparent 2px, rgba(255,255,255,.015) 2px, rgba(255,255,255,.015) 3px);
      pointer-events:none; z-index:10;
      border-radius:10px;
    }

    /* ═══ TIER 1 — neon accent card ═══ */
    .sa-t1 {
      --ac: 0,255,156;
      background:radial-gradient(ellipse at 85% 50%, rgba(var(--ac),.06), transparent 60%),
        linear-gradient(180deg, rgba(10,6,14,.97), rgba(4,2,6,.98));
      border:1.5px solid rgba(var(--ac),.35);
      box-shadow:0 16px 40px rgba(0,0,0,.6), 0 0 30px rgba(var(--ac),.1), inset 0 0 24px rgba(0,0,0,.35);
      padding:14px 22px;
      display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:3px;
    }
    .sa-t1::before {
      content:''; position:absolute; top:0; left:10px; right:10px; height:1px;
      background:linear-gradient(90deg, transparent, rgba(var(--ac),.5), transparent); z-index:11;
    }
    .sa-t1 .sa-label { font-size:8px; font-weight:900; letter-spacing:3px; color:rgba(var(--ac),.9); text-transform:uppercase; text-shadow:0 0 8px rgba(var(--ac),.5); position:relative; z-index:12; font-family:'JetBrains Mono','Consolas',monospace; }
    .sa-t1 .sa-row { display:flex; align-items:baseline; justify-content:space-between; width:100%; gap:12px; position:relative; z-index:12; }
    .sa-t1 .sa-name { font-size:18px; font-weight:900; color:#fff; letter-spacing:-.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; text-shadow:0 0 12px rgba(var(--ac),.2), 0 1px 3px rgba(0,0,0,.8); }
    .sa-t1 .sa-amt { font-family:'JetBrains Mono','Consolas',monospace; font-size:28px; font-weight:900; color:rgba(var(--ac),1); letter-spacing:-1px; line-height:.95; text-shadow:0 0 18px rgba(var(--ac),.6), 0 0 40px rgba(var(--ac),.3), 0 2px 0 rgba(0,0,0,.5); flex-shrink:0; }
    .sa-t1 .sa-msg { font-size:11px; font-style:italic; line-height:1.35; color:rgba(255,255,255,.9); max-height:28px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; position:relative; z-index:12; text-shadow:0 1px 3px rgba(0,0,0,.6); }

    /* ═══ TIER 2 — gold accent + sparkles ═══ */
    .sa-t2 {
      background:radial-gradient(ellipse at 85% 50%, rgba(255,215,0,.06), transparent 60%),
        linear-gradient(180deg, rgba(10,6,14,.97), rgba(4,2,6,.98));
      border:1.5px solid rgba(255,215,0,.35);
      box-shadow:0 16px 40px rgba(0,0,0,.6), 0 0 30px rgba(255,215,0,.1), inset 0 0 24px rgba(0,0,0,.35);
      padding:14px 22px;
      display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:3px;
    }
    .sa-t2::before {
      content:''; position:absolute; top:0; left:10px; right:10px; height:1px;
      background:linear-gradient(90deg, transparent, rgba(255,215,0,.5), transparent); z-index:11;
    }
    .sa-t2 .sa-label { font-size:8px; font-weight:900; letter-spacing:3px; color:rgba(255,215,0,.9); text-transform:uppercase; text-shadow:0 0 8px rgba(255,215,0,.5); position:relative; z-index:12; font-family:'JetBrains Mono','Consolas',monospace; }
    .sa-t2 .sa-row { display:flex; align-items:baseline; justify-content:space-between; width:100%; gap:12px; position:relative; z-index:12; }
    .sa-t2 .sa-name { font-size:18px; font-weight:900; color:#fff; letter-spacing:-.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; text-shadow:0 0 12px rgba(255,215,0,.25), 0 1px 3px rgba(0,0,0,.8); }
    .sa-t2 .sa-amt { font-family:'JetBrains Mono','Consolas',monospace; font-size:28px; font-weight:900; color:#FFD700; letter-spacing:-1px; line-height:.95; text-shadow:0 0 18px rgba(255,215,0,.6), 0 0 40px rgba(255,215,0,.3), 0 2px 0 rgba(0,0,0,.5); flex-shrink:0; }
    .sa-t2 .sa-msg { font-size:11px; font-style:italic; line-height:1.35; color:rgba(255,255,255,.9); max-height:28px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; position:relative; z-index:12; text-shadow:0 1px 3px rgba(0,0,0,.6); }
    .sa-t2 .sa-shimmer { position:absolute; top:0; left:-100%; width:60%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,215,0,.12), rgba(255,255,255,.08), rgba(255,215,0,.12), transparent); pointer-events:none; z-index:11; border-radius:10px; opacity:0; }
    .sasi-alert-popup.in .sa-t2 .sa-shimmer { animation:saShimmer .45s ease .15s forwards; }
    @keyframes saShimmer { 0%{left:-100%;opacity:0} 15%{opacity:1} 85%{opacity:1} 100%{left:150%;opacity:0} }
    .sa-t2 .sa-spark { position:absolute; border-radius:50%; background:rgba(255,215,0,.85); box-shadow:0 0 4px rgba(255,215,0,.9), 0 0 10px rgba(255,180,60,.4); opacity:0; z-index:3; }
    .sasi-alert-popup.in .sa-t2 .sa-spark { animation:saSpark var(--sdur) linear var(--sdelay) infinite; }
    @keyframes saSpark { 0%{opacity:0;transform:translate(0,130px)} 12%{opacity:.7} 88%{opacity:.5} 100%{opacity:0;transform:translate(var(--swind),-20px)} }

    /* ═══ TIER 3 — orange + coin rain ═══ */
    .sa-t3 {
      background:radial-gradient(ellipse 80% 100% at 80% 50%, rgba(255,119,0,.1), transparent 70%),
        linear-gradient(180deg, rgba(12,4,1,.97), rgba(4,1,0,.98));
      border:1px solid rgba(255,119,0,.32);
      box-shadow:0 16px 40px rgba(0,0,0,.6), 0 0 20px rgba(255,119,0,.08), inset 0 0 24px rgba(0,0,0,.35);
      padding:14px 22px;
      display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:3px;
    }
    .sa-t3 .sa-text-bg { position:absolute; inset:0; background:linear-gradient(90deg, rgba(4,1,0,.85) 0%, rgba(4,1,0,.7) 50%, transparent 80%); border-radius:10px; z-index:4; pointer-events:none; }
    .sa-t3 .sa-label { font-size:10px; font-weight:900; letter-spacing:4px; color:rgba(255,119,0,.9); text-transform:uppercase; text-shadow:0 0 10px rgba(255,119,0,.4); position:relative; z-index:5; font-family:'JetBrains Mono','Consolas',monospace; }
    .sa-t3 .sa-row { display:flex; align-items:baseline; justify-content:space-between; width:100%; gap:12px; position:relative; z-index:5; }
    .sa-t3 .sa-name { font-size:18px; font-weight:900; color:#fff; letter-spacing:-.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; text-shadow:0 0 14px rgba(255,119,0,.35), 0 1px 3px rgba(0,0,0,.8); }
    .sa-t3 .sa-amt { font-family:'JetBrains Mono','Consolas',monospace; font-size:28px; font-weight:900; color:#FFD700; letter-spacing:-1px; line-height:.95; text-shadow:0 0 18px rgba(255,215,0,.6), 0 0 40px rgba(255,215,0,.3), 0 2px 0 rgba(0,0,0,.5); flex-shrink:0; }
    .sa-t3 .sa-msg { font-size:13px; font-style:italic; line-height:1.4; color:rgba(255,255,255,.9); text-shadow:0 1px 4px rgba(0,0,0,.8); max-height:28px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; position:relative; z-index:5; }
    .sa-t3 .sa-coin { position:absolute; top:-40px; border-radius:50%; background:radial-gradient(circle at 35% 28%, #fff6b0, #ffe57a 18%, #ffd700 38%, #c89100 65%, #6e4d00); box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5), inset 0 -3px 5px rgba(0,0,0,.4), 0 5px 10px rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; font-weight:900; color:#6e4d00; text-shadow:0 1px 0 rgba(255,255,255,.55); opacity:0; z-index:3; }
    .sasi-alert-popup.in .sa-t3 .sa-coin { animation:saCoinFall var(--gdur) cubic-bezier(.3,.1,.5,1) var(--gdelay) infinite; }
    @keyframes saCoinFall { 0%{opacity:0;transform:translateY(0) rotateY(var(--ry))} 6%{opacity:1} 92%{opacity:1} 100%{opacity:0;transform:translateY(200px) rotateY(calc(var(--ry) + 720deg))} }

    /* ═══ TIER 4 — hero cinematic (3-stage) ═══ */
    .sa-t4 {
      background:radial-gradient(ellipse 60% 100% at 30% 50%, rgba(255,215,0,.12), transparent 60%), rgba(4,0,1,.99);
      border:1px solid rgba(255,215,0,.32);
      border-radius:2px;
      box-shadow:0 20px 50px rgba(0,0,0,.8), 0 0 20px rgba(255,215,0,.08), inset 0 0 40px rgba(0,0,0,.5);
    }
    .sa-t4::before {
      content:''; position:absolute; top:0; left:24px; right:24px; height:1px;
      background:linear-gradient(90deg, transparent, rgba(255,215,0,.5), transparent); box-shadow:0 0 6px rgba(255,215,0,.25); z-index:6;
    }
    .sa-t4 .sa-glow { position:absolute; left:50%; top:50%; width:200px; height:200px; transform:translate(-50%,-50%) scale(.3); background:radial-gradient(circle, rgba(255,215,0,.15), rgba(255,215,0,.06) 30%, transparent 60%); pointer-events:none; z-index:0; filter:blur(6px); opacity:0; }
    .sasi-alert-popup.in .sa-t4 .sa-glow { animation:saGlowBloom .3s ease-out forwards, saGlowSlide .5s ease-in-out 1.1s forwards, saGlowPulse 4s ease-in-out 1.6s infinite; }
    @keyframes saGlowBloom { from{opacity:0;transform:translate(-50%,-50%) scale(.2)} to{opacity:.8;transform:translate(-50%,-50%) scale(1)} }
    @keyframes saGlowSlide { from{left:50%} to{left:18%} }
    @keyframes saGlowPulse { 0%,100%{opacity:.5;transform:translate(-50%,-50%) scale(1)} 50%{opacity:.7;transform:translate(-50%,-50%) scale(1.05)} }

    .sa-t4 .sa-amount { position:absolute; z-index:4; font-family:Georgia,'Times New Roman',serif; font-weight:900; color:#FFD700; text-align:center; white-space:nowrap; left:50%; top:50%; transform:translate(-50%,-50%); font-size:44px; letter-spacing:-1.5px; line-height:1; text-shadow:0 0 16px rgba(255,215,0,.45), 0 0 36px rgba(255,215,0,.2), 0 2px 0 rgba(0,0,0,.5); opacity:0; }
    .sasi-alert-popup.in .sa-t4 .sa-amount { animation:saAmtIn .25s ease-out .15s forwards, saAmtShimmer .4s ease .6s forwards, saAmtSlide .5s ease-in-out 1.1s forwards; }
    @keyframes saAmtIn { from{opacity:0;transform:translate(-50%,-50%) scale(.8)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
    @keyframes saAmtShimmer { 0%{filter:brightness(1)} 50%{filter:brightness(1.5)} 100%{filter:brightness(1)} }
    @keyframes saAmtSlide { from{left:50%;transform:translate(-50%,-50%) scale(1);font-size:44px} to{left:18%;transform:translate(-50%,-50%) scale(.82);font-size:38px} }

    .sa-t4 .sa-divider { position:absolute; left:36%; top:14px; bottom:14px; width:2px; background:linear-gradient(180deg, transparent, rgba(255,215,0,.25) 8%, rgba(255,215,0,.95) 30%, rgba(255,255,255,.9) 50%, rgba(255,215,0,.95) 70%, rgba(255,215,0,.25) 92%, transparent); box-shadow:0 0 14px rgba(255,215,0,.65), 0 0 34px rgba(255,215,0,.35); z-index:4; opacity:0; }
    .sasi-alert-popup.in .sa-t4 .sa-divider { animation:saDivIn .4s ease-out 1.15s forwards, saBeamPulse 3.2s ease-in-out 2s infinite; }
    @keyframes saDivIn { from{opacity:0;transform:scaleY(.3)} to{opacity:1;transform:scaleY(1)} }
    @keyframes saBeamPulse { 0%,100%{box-shadow:0 0 14px rgba(255,215,0,.65), 0 0 34px rgba(255,215,0,.35);filter:brightness(1)} 50%{box-shadow:0 0 22px rgba(255,215,0,.95), 0 0 55px rgba(255,215,0,.55);filter:brightness(1.25)} }

    .sa-t4 .sa-info { position:absolute; left:38%; top:0; bottom:0; right:0; padding:10px 16px; display:flex; flex-direction:column; justify-content:center; gap:2px; z-index:4; background:linear-gradient(270deg, rgba(4,0,1,.7), rgba(4,0,1,.5) 50%, transparent); }
    .sa-t4 .sa-h-label { font-size:9px; font-weight:900; letter-spacing:5px; color:#FFD700; text-transform:uppercase; text-shadow:0 0 10px rgba(255,215,0,.5), 0 1px 3px rgba(0,0,0,.8); opacity:0; display:flex; align-items:center; gap:8px; }
    .sa-t4 .sa-h-label::before { content:''; width:10px; height:1px; background:#FFD700; box-shadow:0 0 6px #FFD700; }
    .sa-t4 .sa-h-name { font-size:17px; font-weight:900; color:#fff; font-style:italic; letter-spacing:-.4px; text-shadow:0 0 14px rgba(255,215,0,.4), 0 1px 4px rgba(0,0,0,.9); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:0; }
    .sa-t4 .sa-h-msg { font-size:11px; font-style:italic; line-height:1.35; color:#fff; text-shadow:0 1px 4px rgba(0,0,0,.9); padding-left:10px; border-left:2px solid rgba(255,215,0,.6); max-height:28px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-top:1px; opacity:0; }
    .sasi-alert-popup.in .sa-t4 .sa-h-label { animation:saTextIn .4s ease-out 1.2s forwards; }
    .sasi-alert-popup.in .sa-t4 .sa-h-name  { animation:saTextIn .4s ease-out 1.3s forwards; }
    .sasi-alert-popup.in .sa-t4 .sa-h-msg   { animation:saTextIn .4s ease-out 1.42s forwards; }
    @keyframes saTextIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }

    .sa-t4 .sa-dust { position:absolute; border-radius:50%; background:rgba(255,215,0,.9); box-shadow:0 0 5px rgba(255,215,0,.9), 0 0 12px rgba(255,180,60,.5); opacity:0; z-index:1; }
    .sasi-alert-popup.in .sa-t4 .sa-dust { animation:saDust var(--ddur) linear var(--ddelay) infinite; }
    @keyframes saDust { 0%{opacity:0;transform:translate(var(--dsx),140px)} 15%{opacity:.6} 85%{opacity:.5} 100%{opacity:0;transform:translate(calc(var(--dsx) + var(--dw)),-30px)} }

    /* ═══ MEMBER CARD ═══ */
    .sa-member {
      background:radial-gradient(ellipse at 12% 50%, rgba(var(--mc),.1), transparent 45%),
        linear-gradient(180deg, rgba(10,6,14,.97), rgba(4,2,6,.99));
      border:1px solid rgba(var(--mc),.25);
      box-shadow:0 18px 44px rgba(0,0,0,.65), 0 0 24px rgba(var(--mc), var(--mg)), inset 0 0 30px rgba(0,0,0,.35);
      display:flex; align-items:center; padding:0;
      --mc:0,210,180; --mg:.15;
    }
    .sa-member .sa-strip { width:4px; height:100%; flex-shrink:0; background:linear-gradient(180deg, transparent 5%, rgba(var(--mc),.9) 20%, rgba(var(--mc),1) 50%, rgba(var(--mc),.9) 80%, transparent 95%); border-radius:10px 0 0 10px; z-index:2; }
    .sa-member .sa-badge { width:48px; height:52px; flex-shrink:0; margin:0 14px 0 18px; position:relative; z-index:2; display:flex; align-items:center; justify-content:center; filter:drop-shadow(0 0 12px rgba(var(--mc),var(--mg))); }
    .sa-member .sa-badge .hex-bg { position:absolute; inset:0; clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%); background:linear-gradient(160deg, rgba(var(--mc),.9), rgba(var(--mc),.4) 50%, rgba(var(--mc),.15)); }
    .sa-member .sa-badge .hex-inner { position:absolute; inset:3px; clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%); background:linear-gradient(160deg, rgba(8,4,12,.9), rgba(4,2,6,.95)); display:flex; align-items:center; justify-content:center; }
    .sa-member .sa-badge svg { width:18px; height:18px; fill:rgba(var(--mc),1); filter:drop-shadow(0 0 4px rgba(var(--mc),.6)); }
    .sa-member .sa-m-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; z-index:2; padding-right:16px; }
    .sa-member .sa-m-label { font-size:7px; font-weight:900; letter-spacing:4px; color:rgba(var(--mc),.8); text-transform:uppercase; font-family:'JetBrains Mono','Consolas',monospace; text-shadow:0 0 6px rgba(var(--mc),.4); }
    .sa-member .sa-m-name { font-size:18px; font-weight:900; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 3px rgba(0,0,0,.8); }
    .sa-member .sa-m-tier { font-size:12px; font-weight:700; color:rgba(var(--mc),.85); display:flex; align-items:center; gap:6px; }
    .sa-member .sa-m-stars { font-size:9px; letter-spacing:2px; color:rgba(var(--mc),1); text-shadow:0 0 6px rgba(var(--mc),.5); }
    .sa-member .sa-m-months { position:absolute; right:16px; top:50%; transform:translateY(-50%); padding:10px 18px 8px; background:rgba(var(--mc),.12); border:1.5px solid rgba(var(--mc),.4); border-radius:6px; z-index:2; text-align:center; box-shadow:0 0 12px rgba(var(--mc),.15); min-width:56px; }
    .sa-member .sa-m-months { display:flex; flex-direction:column; align-items:center; }
    .sa-member .sa-m-months-num { font-family:'JetBrains Mono','Consolas',monospace; font-size:18px; font-weight:900; color:#fff; line-height:1.1; text-shadow:0 0 10px rgba(var(--mc),.5); }
    .sa-member .sa-m-months-unit { font-family:'JetBrains Mono','Consolas',monospace; font-size:7px; font-weight:900; letter-spacing:2px; color:rgba(var(--mc),.8); text-transform:uppercase; margin-top:3px; }

    /* ═══ GIFT CARD ═══ */
    .sa-gift {
      background:radial-gradient(ellipse at 85% 50%, rgba(168,85,247,.06), transparent 50%),
        linear-gradient(180deg, rgba(10,6,14,.97), rgba(4,2,6,.98));
      border:1px solid rgba(168,85,247,.3);
      box-shadow:0 16px 40px rgba(0,0,0,.6), 0 0 20px rgba(168,85,247,.08), inset 0 0 24px rgba(0,0,0,.35);
      display:flex; align-items:center; padding:0;
    }
    .sa-gift .sa-strip { width:4px; height:100%; flex-shrink:0; background:linear-gradient(180deg, #c084fc, #7c3aed, #c084fc); border-radius:10px 0 0 10px; z-index:2; }
    .sa-gift .sa-g-icon { width:48px; height:48px; flex-shrink:0; border-radius:12px; margin:0 14px 0 18px; background:linear-gradient(135deg, #c084fc, #a855f7 50%, #6b21a8); border:2px solid rgba(168,85,247,.5); display:flex; align-items:center; justify-content:center; z-index:2; box-shadow:0 0 20px rgba(168,85,247,.2); }
    .sa-gift .sa-g-icon svg { width:22px; height:22px; fill:#fff; }
    .sa-gift .sa-g-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; z-index:2; }
    .sa-gift .sa-g-label { font-size:8px; font-weight:900; letter-spacing:3px; color:rgba(168,85,247,.65); text-transform:uppercase; font-family:'JetBrains Mono','Consolas',monospace; }
    .sa-gift .sa-g-name { font-size:18px; font-weight:900; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 3px rgba(0,0,0,.8); }
    .sa-gift .sa-g-count { font-size:14px; font-weight:900; color:rgba(168,85,247,1); text-shadow:0 0 10px rgba(168,85,247,.4); }
    .sa-gift .sa-g-badge { position:absolute; right:16px; top:50%; transform:translateY(-50%); padding:8px 14px; background:rgba(168,85,247,.1); border:1.5px solid rgba(168,85,247,.35); border-radius:6px; font-family:'JetBrains Mono','Consolas',monospace; font-size:20px; font-weight:900; color:rgba(168,85,247,1); text-shadow:0 0 12px rgba(168,85,247,.5); z-index:2; text-align:center; line-height:1; }
    .sa-gift .sa-g-badge span { font-size:9px; font-weight:700; letter-spacing:1px; color:rgba(168,85,247,.6); display:block; margin-top:2px; }

    /* ═══ SUPER STICKER — horizontal, thumbnail left + info right ═══ */
    .sa-sticker {
      --stk-rgb: 0,255,156;
      width:auto; max-width:500px;
      background:radial-gradient(ellipse at 8% 50%, rgba(var(--stk-rgb),.1), transparent 45%),
        linear-gradient(180deg, rgba(10,6,14,.97), rgba(4,2,6,.98));
      border:1.5px solid rgba(var(--stk-rgb),.3);
      box-shadow:0 16px 40px rgba(0,0,0,.6), 0 0 24px rgba(var(--stk-rgb),.1), inset 0 0 24px rgba(0,0,0,.35);
      display:inline-flex; align-items:center; padding:0; gap:0;
    }
    .sa-sticker::before { content:''; position:absolute; top:0; left:10px; right:10px; height:1px; background:linear-gradient(90deg, transparent, rgba(var(--stk-rgb),.5), transparent); z-index:11; }
    .sa-sticker .stk-img-wrap {
      width:100px; flex-shrink:0; align-self:stretch;
      display:flex; align-items:center; justify-content:center;
      position:relative;
      background:rgba(var(--stk-rgb),.04);
      border-right:1px solid rgba(var(--stk-rgb),.12);
      border-radius:10px 0 0 10px;
    }
    .sa-sticker .stk-glow { position:absolute; width:70px; height:70px; border-radius:50%; background:radial-gradient(circle, rgba(var(--stk-rgb),.1), transparent 65%); filter:blur(6px); pointer-events:none; }
    .sa-sticker .stk-img { width:72px; height:72px; border-radius:8px; display:flex; align-items:center; justify-content:center; position:relative; z-index:2; overflow:hidden; }
    .sa-sticker .stk-img img { width:100%; height:100%; object-fit:contain; }
    .sa-sticker .stk-img svg { width:36px; height:36px; fill:rgba(var(--stk-rgb),.3); }
    .sa-sticker .stk-info { flex:0 0 auto; min-width:0; padding:12px 16px; display:flex; flex-direction:column; gap:2px; z-index:2; }
    .sa-sticker .stk-label { font-size:7px; font-weight:900; letter-spacing:2px; color:rgba(var(--stk-rgb),.8); text-transform:uppercase; font-family:'JetBrains Mono','Consolas',monospace; text-shadow:0 0 6px rgba(var(--stk-rgb),.4); }
    .sa-sticker .stk-name { font-size:14px; font-weight:900; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 3px rgba(0,0,0,.8); }
    .sa-sticker .stk-price { font-family:'JetBrains Mono','Consolas',monospace; font-size:18px; font-weight:900; color:rgba(var(--stk-rgb),1); text-shadow:0 0 10px rgba(var(--stk-rgb),.5); line-height:1; }

    /* ═══ GAME REDEMPTION — wheel / mystery box / highlight ═══ */
    .sa-game {
      --gc: 255,215,0;
      background:radial-gradient(ellipse at 8% 50%, rgba(var(--gc),.1), transparent 45%),
        linear-gradient(180deg, rgba(10,6,14,.97), rgba(4,2,6,.98));
      border:1.5px solid rgba(var(--gc),.3);
      box-shadow:0 16px 40px rgba(0,0,0,.6), 0 0 24px rgba(var(--gc),.1), inset 0 0 24px rgba(0,0,0,.35);
      display:flex; align-items:center; padding:0; gap:0;
    }
    .sa-game::before { content:''; position:absolute; top:0; left:10px; right:10px; height:1px; background:linear-gradient(90deg, transparent, rgba(var(--gc),.5), transparent); z-index:11; }
    .sa-game .sa-game-icon-wrap {
      width:80px; flex-shrink:0; align-self:stretch;
      display:flex; align-items:center; justify-content:center;
      background:rgba(var(--gc),.06);
      border-right:1px solid rgba(var(--gc),.15);
      border-radius:10px 0 0 10px;
    }
    .sa-game .sa-game-icon { font-size:36px; filter:drop-shadow(0 0 10px rgba(var(--gc),.4)); }
    .sa-game .sa-game-info { flex:1; min-width:0; padding:12px 16px; display:flex; flex-direction:column; gap:2px; z-index:2; }
    .sa-game .sa-game-label { font-size:8px; font-weight:900; letter-spacing:3px; color:rgba(var(--gc),.85); text-transform:uppercase; font-family:'JetBrains Mono','Consolas',monospace; text-shadow:0 0 6px rgba(var(--gc),.4); }
    .sa-game .sa-game-name { font-size:18px; font-weight:900; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 3px rgba(0,0,0,.8); }
    .sa-game .sa-game-msg { font-size:11px; font-style:italic; color:rgba(255,255,255,.7); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
    .sa-game .sa-game-result { font-size:13px; font-weight:900; color:rgba(var(--gc),1); text-shadow:0 0 10px rgba(var(--gc),.5); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .sa-game .sa-game-pts {
      position:absolute; right:16px; top:50%; transform:translateY(-50%);
      padding:8px 14px;
      background:rgba(var(--gc),.08);
      border:1.5px solid rgba(var(--gc),.35);
      border-radius:6px;
      font-family:'JetBrains Mono','Consolas',monospace;
      font-size:12px; font-weight:900; letter-spacing:1px;
      color:rgba(var(--gc),.9);
      text-shadow:0 0 8px rgba(var(--gc),.4);
      z-index:2;
    }

    /* ═══ PROGRESS BAR ═══ */
    .sa-progress { position:absolute; bottom:0; left:0; height:1.5px; width:100%; transform-origin:left; transform:scaleX(0); border-radius:0 0 10px 10px; z-index:20; }
    .sa-t1 .sa-progress { background:linear-gradient(90deg, rgba(var(--ac),1), rgba(var(--ac),.5)); }
    .sa-t2 .sa-progress, .sa-t3 .sa-progress, .sa-t4 .sa-progress { background:linear-gradient(90deg, #FFD700, #FF7700); }
    .sa-member .sa-progress { background:linear-gradient(90deg, rgba(var(--mc),1), rgba(var(--mc),.5)); }
    .sa-gift .sa-progress { background:linear-gradient(90deg, #c084fc, #7c3aed); }
    .sa-game .sa-progress { background:linear-gradient(90deg, rgba(var(--gc),1), rgba(var(--gc),.5)); }
    .sasi-alert-popup.in .sa-progress { animation:saProgress var(--dur) linear forwards; }
    @keyframes saProgress { from{transform:scaleX(0)} to{transform:scaleX(1)} }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // ── SVG Icons ──
  const SVG = {
    star:    '<svg viewBox="0 0 24 24"><path d="M12 2l2.39 7.36H22l-6.19 4.5L18.18 22 12 17.27 5.82 22l2.37-8.14L2 9.36h7.61z"/></svg>',
    gift:    '<svg viewBox="0 0 24 24"><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 12 7.4l3.38 4.6L17 10.83 14.92 8H20v6z"/></svg>',
  };

  // ── Audio: singleton AudioContext, synth tones per tier ──
  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; }
    }
    return audioCtx;
  }
  try { const c = getCtx(); if (c) c.resume(); } catch(e) {}

  function playTone(freq, dur, type, vol, delay) {
    const ctx = getCtx(); if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + (delay||0));
    g.gain.setValueAtTime(0, ctx.currentTime + (delay||0));
    g.gain.linearRampToValueAtTime(vol||.15, ctx.currentTime + (delay||0) + .02);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + (delay||0) + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(ctx.currentTime + (delay||0));
    osc.stop(ctx.currentTime + (delay||0) + dur);
  }

  const TIER_SOUNDS = {
    1() { playTone(880,.15,'sine',.12); playTone(1100,.1,'sine',.06,.08); },
    2() { playTone(660,.2,'sine',.12); playTone(880,.18,'sine',.1,.12); playTone(1100,.15,'sine',.06,.22); },
    3() { playTone(440,.08,'triangle',.1); playTone(880,.06,'triangle',.08,.05); playTone(1320,.12,'sine',.05,.1); playTone(660,.08,'triangle',.06,.18); },
    4() { playTone(220,.4,'sine',.08); playTone(330,.35,'sine',.1,.15); playTone(440,.3,'sine',.12,.3); playTone(550,.28,'sine',.1,.45); playTone(660,.5,'sine',.14,.6); playTone(880,.4,'sine',.08,.7); },
    member() { playTone(523,.2,'sine',.1); playTone(659,.18,'sine',.1,.1); playTone(784,.25,'sine',.12,.2); },
    gift() { playTone(440,.15,'triangle',.1); playTone(660,.12,'triangle',.08,.08); playTone(880,.15,'sine',.1,.16); playTone(1100,.2,'sine',.08,.24); },
    sticker() { playTone(1000,.12,'sine',.1); playTone(1300,.1,'sine',.07,.06); },
    redeem() { playTone(520,.12,'square',.06,.04); playTone(780,.1,'sine',.08,.1); },
  };

  function playAlertSound(key) {
    const ctx = getCtx(); if (!ctx) return;
    ctx.resume().then(() => { if (TIER_SOUNDS[key]) TIER_SOUNDS[key](); }).catch(() => {});
  }

  // ── Renderers — build card HTML per tier/type ──
  const rand = (a,b) => a + Math.random() * (b - a);

  function renderTier1(event, neon) {
    const msgHtml = event.message ? `<div class="sa-msg">${event.message}</div>` : '';
    const amtStr = (event.currency || '₹') + Number(event.amount).toLocaleString('en-IN');
    return `<div class="sa-card sa-t1" style="--ac:${neon.rgb}">
      <div class="sa-label">Super Chat</div>
      <div class="sa-row"><div class="sa-name">@${event.name}</div><div class="sa-amt">${amtStr}</div></div>
      ${msgHtml}<div class="sa-progress"></div></div>`;
  }

  function renderTier2(event) {
    const msgHtml = event.message ? `<div class="sa-msg">${event.message}</div>` : '';
    const amtStr = (event.currency || '₹') + Number(event.amount).toLocaleString('en-IN');
    let sparks = '';
    for (let i = 0; i < 30; i++) {
      const x = rand(-240,240), w = (Math.random()-.5)*40, d = rand(1.5,3), dl = rand(0,1.5), s = rand(1.5,3);
      sparks += `<span class="sa-spark" style="left:calc(50% + ${x.toFixed(0)}px);--swind:${w.toFixed(0)}px;--sdur:${d.toFixed(1)}s;--sdelay:${dl.toFixed(1)}s;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;"></span>`;
    }
    return `<div class="sa-card sa-t2">
      <div class="sa-label">Super Chat</div>
      <div class="sa-row"><div class="sa-name">@${event.name}</div><div class="sa-amt">${amtStr}</div></div>
      ${msgHtml}<div class="sa-shimmer"></div>${sparks}<div class="sa-progress"></div></div>`;
  }

  function renderTier3(event) {
    const msgHtml = event.message ? `<div class="sa-msg">${event.message}</div>` : '';
    const amtStr = (event.currency || '₹') + Number(event.amount).toLocaleString('en-IN');
    let coins = '';
    for (let i = 0; i < 16; i++) {
      const x = rand(-240,240), ry = rand(0,360), d = rand(3,4.5), dl = rand(0,3), sz = rand(18,30);
      coins += `<span class="sa-coin" style="left:calc(50% + ${x.toFixed(0)}px);--ry:${ry.toFixed(0)}deg;--gdur:${d.toFixed(2)}s;--gdelay:${dl.toFixed(2)}s;width:${sz.toFixed(0)}px;height:${sz.toFixed(0)}px;font-size:${(sz*.45).toFixed(0)}px;">₹</span>`;
    }
    return `<div class="sa-card sa-t3">
      <div class="sa-text-bg"></div>
      <div class="sa-label">Super Chat</div>
      <div class="sa-row"><div class="sa-name">@${event.name}</div><div class="sa-amt">${amtStr}</div></div>
      ${msgHtml}${coins}<div class="sa-progress"></div></div>`;
  }

  function renderTier4(event) {
    const amtStr = (event.currency || '₹') + Number(event.amount).toLocaleString('en-IN');
    const msgHtml = event.message ? `<div class="sa-h-msg">${event.message}</div>` : '';
    let dust = '';
    for (let i = 0; i < 20; i++) {
      const sx = rand(-240,240), w = (Math.random()-.5)*40, d = rand(4,9), dl = rand(0,5), s = rand(1,2.5);
      dust += `<span class="sa-dust" style="left:calc(50% + ${sx.toFixed(0)}px);--dsx:0px;--dw:${w.toFixed(0)}px;--ddur:${d.toFixed(1)}s;--ddelay:${dl.toFixed(1)}s;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;"></span>`;
    }
    return `<div class="sa-card sa-t4">
      <div class="sa-glow"></div>${dust}
      <div class="sa-amount">${amtStr}</div>
      <div class="sa-divider"></div>
      <div class="sa-info">
        <div class="sa-h-label">Super Chat · Hero</div>
        <div class="sa-h-name">@${event.name}</div>
        ${msgHtml}
      </div><div class="sa-progress"></div></div>`;
  }

  const MEMBER_COLORS = [
    {rgb:'0,210,180',glow:.15},{rgb:'34,211,238',glow:.2},{rgb:'255,119,0',glow:.25},{rgb:'255,215,0',glow:.35},{rgb:'236,72,153',glow:.45}
  ];
  function renderMember(event) {
    const tierIdx = Math.min((event.tierLevel || 1) - 1, 4);
    const mc = MEMBER_COLORS[tierIdx];
    const stars = '★'.repeat(tierIdx + 1);
    const tierName = event.tierName || ('Level ' + (tierIdx + 1));
    const monthNum = event.months || 0;
    const monthDisplay = monthNum > 0 ? monthNum : 'NEW';
    const monthLabel = monthNum > 0 ? (monthNum === 1 ? 'month' : 'months') : 'member';
    return `<div class="sa-card sa-member" style="--mc:${mc.rgb};--mg:${mc.glow}">
      <div class="sa-strip"></div>
      <div class="sa-badge"><span class="hex-bg"></span><span class="hex-inner">${SVG.star}</span></div>
      <div class="sa-m-info">
        <div class="sa-m-label">Membership</div>
        <div class="sa-m-name">@${event.name}</div>
        <div class="sa-m-tier">${tierName} <span class="sa-m-stars">${stars}</span></div>
      </div>
      <div class="sa-m-months"><span class="sa-m-months-num">${monthDisplay}</span><span class="sa-m-months-unit">${monthLabel}</span></div>
      <div class="sa-progress"></div></div>`;
  }

  function renderGift(event) {
    const count = event.amount || 1;
    const plural = count > 1 ? 'viewers' : 'viewer';
    return `<div class="sa-card sa-gift">
      <div class="sa-strip"></div>
      <div class="sa-g-icon">${SVG.gift}</div>
      <div class="sa-g-info">
        <div class="sa-g-label">Membership Gift</div>
        <div class="sa-g-name">@${event.name}</div>
        <div class="sa-g-count">Gifted to ${count} ${plural}</div>
      </div>
      <div class="sa-g-badge">${count}<span>gifts</span></div>
      <div class="sa-progress"></div></div>`;
  }

  function renderSticker(event, neon) {
    const amtStr = (event.currency || '₹') + Number(event.amount).toLocaleString('en-IN');
    const imgHtml = event.stickerUrl
      ? `<img src="${event.stickerUrl}" alt="">`
      : `<svg viewBox="0 0 24 24"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>`;
    return `<div class="sa-card sa-sticker" style="--stk-rgb:${neon.rgb}">
      <div class="stk-img-wrap">
        <span class="stk-glow"></span>
        <div class="stk-img">${imgHtml}</div>
      </div>
      <div class="stk-info">
        <div class="stk-label">Super Sticker</div>
        <div class="stk-name">@${event.name}</div>
        <div class="stk-price">${amtStr}</div>
      </div>
      <div class="sa-progress"></div></div>`;
  }

  // Game-specific configs
  const GAME_CARDS = {
    'wheel of fortune': { icon:'🎰', color:'255,215,0', label:'Wheel of Fortune', accent:'gold' },
    'mystery box':      { icon:'📦', color:'255,119,0', label:'Mystery Box', accent:'orange' },
    'highlight message':{ icon:'💬', color:'255,34,0',  label:'Highlight Message', accent:'red' },
  };

  function renderRedeem(event) {
    const rewardKey = (event.rewardName || '').toLowerCase();
    const game = GAME_CARDS[rewardKey] || { icon:'⭐', color:'236,72,153', label:event.rewardName || 'Redemption', accent:'pink' };
    const pts = event.amount ? Number(event.amount).toLocaleString('en-IN') + ' PTS' : 'REDEEMED';

    // Game result or user message
    let resultHtml = '';
    if (event.gameResult) {
      resultHtml = `<div class="sa-game-result">Won: ${event.gameResult}</div>`;
    } else if (event.message) {
      resultHtml = `<div class="sa-game-msg">${event.message}</div>`;
    }

    return `<div class="sa-card sa-game" style="--gc:${game.color}">
      <div class="sa-game-icon-wrap">
        <span class="sa-game-icon">${game.icon}</span>
      </div>
      <div class="sa-game-info">
        <div class="sa-game-label">${game.label}</div>
        <div class="sa-game-name">@${event.name}</div>
        ${resultHtml}
      </div>
      <div class="sa-game-pts">${pts}</div>
      <div class="sa-progress"></div></div>`;
  }

  // ── Render and show one popup ──
  function showPopup(event) {
    isShowing = true;

    // Determine card type and duration
    let cardHtml = '';
    let soundKey = 'follow';
    let duration = POPUP_DURATION;

    if ((event.type === 'tip' || event.type === 'cheer') && !event.message && (event.stickerUrl || event.isSticker)) {
      // Super Sticker — tip with no message
      soundKey = 'sticker';
      duration = getAmountDuration(event.amount);
      cardHtml = renderSticker(event, nextNeon());
    } else if (event.type === 'tip' || event.type === 'cheer') {
      // Super Chat — duration scales with amount
      const amt = Number(event.amount) || 0;
      const tier = getTier(amt);
      soundKey = tier;
      duration = getAmountDuration(amt);

      if (tier === 1) cardHtml = renderTier1(event, nextNeon());
      else if (tier === 2) cardHtml = renderTier2(event);
      else if (tier === 3) cardHtml = renderTier3(event);
      else cardHtml = renderTier4(event);
    } else if (event.type === 'redemption') {
      // StreamElements loyalty point redemption
      soundKey = 'redeem';
      duration = alertCfg.redeemDuration || 5000;
      cardHtml = renderRedeem(event);
    } else if (event.type === 'member' || event.type === 'subscriber') {
      soundKey = 'member';
      duration = alertCfg.memberDuration || 6000;
      cardHtml = renderMember(event);
    } else if (event.type === 'gift') {
      soundKey = 'gift';
      const giftCount = Number(event.amount) || 1;
      const giftBase = alertCfg.giftBaseDuration || 3000;
      const giftPer  = alertCfg.giftPerUnit || 400;
      duration = Math.round(Math.min(MAX_DUR, giftBase + giftCount * giftPer));
      cardHtml = renderGift(event);
    } else {
      // YouTube doesn't have followers — skip unknown types
      isShowing = false;
      if (popupQueue.length > 0) setTimeout(processQueue, POPUP_GAP);
      return;
    }

    playAlertSound(soundKey);

    const target = document.querySelector('.alert-frame');
    const isFloating = !target;

    const popup = document.createElement('div');
    popup.className = 'sasi-alert-popup' + (isFloating ? ' floating' : '');
    popup.style.setProperty('--dur', (duration / 1000) + 's');
    popup.innerHTML = cardHtml;

    if (target) {
      target.classList.add('sasi-has-alert');
      target.appendChild(popup);
    } else {
      document.body.appendChild(popup);
    }

    requestAnimationFrame(() => popup.classList.add('in'));

    setTimeout(() => {
      popup.classList.add('out');
      setTimeout(() => {
        popup.remove();
        if (target) target.classList.remove('sasi-has-alert');
        isShowing = false;
        if (popupQueue.length > 0) {
          setTimeout(processQueue, POPUP_GAP);
        }
      }, 500);
    }, duration);
  }

  function processQueue() {
    if (isShowing) return;
    if (popupQueue.length === 0) return;
    const event = popupQueue.shift();
    showPopup(event);
  }

  // ── Save shown IDs ──
  function saveShown() {
    try {
      const arr = Array.from(shownIds).slice(-300);
      localStorage.setItem(SHOWN_KEY, JSON.stringify(arr));
    } catch(e) {}
  }

  // ── SE channel ID resolver ──
  let resolvedChannelId = null;
  function getActiveJWT() {
    const platform = (window.SASI_CONFIG && SASI_CONFIG.activePlatform) || 'youtube';
    const se = window.SASI_SECRETS && window.SASI_SECRETS.streamelements;
    if (!se) return null;
    const acc = se[platform];
    if (!acc || !acc.jwt || acc.jwt.startsWith('PASTE_')) return null;
    return acc.jwt;
  }
  async function getChannelId(jwt) {
    if (resolvedChannelId) return resolvedChannelId;
    try {
      const res = await fetch('https://api.streamelements.com/kappa/v2/channels/me', {
        headers: { 'Authorization': 'Bearer ' + jwt }
      });
      if (!res.ok) return null;
      const data = await res.json();
      resolvedChannelId = data._id;
      return resolvedChannelId;
    } catch(e) { return null; }
  }

  // ── Poll SE for new activities ──
  // On first poll, only mark events OLDER than 2 min as seen.
  // Anything recent should still play (catches events that happened
  // just before the overlay loaded).
  const FIRST_POLL_AGE_LIMIT = 2 * 60 * 1000; // 2 minutes
  let isFirstPoll = true;
  async function pollActivities() {
    const jwt = getActiveJWT();
    if (!jwt) { console.log('[Alerts] No JWT for platform:', SASI_CONFIG.activePlatform); return; }
    const channelId = await getChannelId(jwt);
    if (!channelId) { console.log('[Alerts] No channel ID resolved'); return; }

    try {
      const res = await fetch(`https://api.streamelements.com/kappa/v2/activities/${channelId}?limit=15`, {
        headers: { 'Authorization': 'Bearer ' + jwt }
      });
      if (!res.ok) {
        console.warn('[Alerts] SE API error:', res.status);
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data)) return;

      console.log('[Alerts] Poll fetched ' + data.length + ' events (firstPoll=' + isFirstPoll + ')');

      const now = Date.now();
      const newOnes = [];

      data.forEach(item => {
        const ts = new Date(item.createdAt).getTime();
        const age = now - ts;

        // First poll: skip events older than 2 minutes
        if (isFirstPoll && age > FIRST_POLL_AGE_LIMIT) {
          shownIds.add(item._id);
          return;
        }

        if (shownIds.has(item._id)) return;
        shownIds.add(item._id);

        const event = {
          id:        item._id,
          type:      item.type,
          name:      (item.data && (item.data.username || item.data.displayName)) || 'Anonymous',
          amount:    item.data && (item.data.amount || item.data.tipAmount),
          currency:  item.data && item.data.currency === 'USD' ? '$' : item.data && item.data.currency === 'INR' ? '₹' : item.data && item.data.currency,
          message:    item.data && item.data.message,
          stickerUrl: item.data && item.data.stickerUrl,
          isSticker:  item.data && !!item.data.stickerUrl,
          rewardName: item.data && item.data.rewardName,
          tierLevel:  item.data && item.data.tier,
          months:     item.data && item.data.months,
          timestamp:  ts,
        };
        newOnes.push(event);
      });

      isFirstPoll = false;

      if (newOnes.length > 0) {
        console.log('[Alerts] Queuing ' + newOnes.length + ' new events');
        newOnes.sort((a, b) => a.timestamp - b.timestamp); // oldest first — play in order
        popupQueue.push(...newOnes);
        saveShown();
        processQueue();
      } else {
        saveShown();
      }
    } catch(e) {
      console.warn('[Alerts] Poll failed:', e);
    }
  }

  // ── SE WebSocket (realtime alerts, zero polling) ──
  let seSocket = null;
  function connectWebSocket(jwt) {
    // SE uses socket.io v2 — connect via polling transport first, then upgrade
    // Simplified: use the REST poll as fallback, attempt WS for instant alerts
    const channelId = resolvedChannelId;
    if (!channelId) { console.log('[Alerts] No channel ID for WebSocket'); return; }

    try {
      const wsUrl = 'wss://realtime.streamelements.com/socket.io/?EIO=3&transport=websocket';
      seSocket = new WebSocket(wsUrl);

      seSocket.onopen = function() {
        console.log('[Alerts] WebSocket connected');
      };

      seSocket.onmessage = function(evt) {
        const msg = evt.data;
        // socket.io protocol: messages prefixed with type number
        // 0 = open, 3 = pong, 42 = event
        if (msg === '3') return; // pong
        if (msg.startsWith('0')) {
          // Connection established — authenticate
          seSocket.send('42["authenticate",{"method":"jwt","token":"' + jwt + '"}]');
          return;
        }
        if (msg.startsWith('42')) {
          try {
            const payload = JSON.parse(msg.substring(2));
            const eventName = payload[0];
            const data = payload[1];

            if (eventName === 'authenticated') {
              console.log('[Alerts] WebSocket authenticated — realtime alerts active');
              return;
            }
            if (eventName === 'event' || eventName === 'event:test') {
              handleRealtimeEvent(data);
            }
          } catch(e) {}
        }
      };

      // Heartbeat — socket.io expects ping/pong
      const heartbeat = setInterval(() => {
        if (seSocket && seSocket.readyState === 1) seSocket.send('2');
        else clearInterval(heartbeat);
      }, 25000);

      seSocket.onclose = function() {
        console.log('[Alerts] WebSocket disconnected, falling back to polling');
        seSocket = null;
        // Fall back to polling
        setInterval(pollActivities, POLL_INTERVAL);
      };

      seSocket.onerror = function() {
        console.warn('[Alerts] WebSocket error, using polling fallback');
      };
    } catch(e) {
      console.warn('[Alerts] WebSocket failed, using polling');
      setInterval(pollActivities, POLL_INTERVAL);
    }
  }

  function handleRealtimeEvent(data) {
    if (!data || !data._id) return;
    if (shownIds.has(data._id)) return;
    shownIds.add(data._id);

    const event = {
      id:       data._id,
      type:     data.type,
      name:     (data.data && (data.data.username || data.data.displayName)) || 'Anonymous',
      amount:   data.data && (data.data.amount || data.data.tipAmount),
      currency: data.data && data.data.currency === 'USD' ? '$' : data.data && data.data.currency === 'INR' ? '₹' : data.data && data.data.currency,
      message:    data.data && data.data.message,
      stickerUrl: data.data && data.data.stickerUrl,
      isSticker:  data.data && !!data.data.stickerUrl,
      rewardName: data.data && data.data.rewardName,
      tierLevel:  data.data && data.data.tier,
      months:     data.data && data.data.months,
      timestamp:  Date.now(),
    };

    console.log('[Alerts] Realtime event:', event.type, event.name);
    popupQueue.push(event);
    saveShown();
    processQueue();
  }

  // ── Start — only when stream is live or fake mode ──
  async function startAlerts() {
    const streamLive = localStorage.getItem('sasi_streamLive');
    const isFake = window.SASI_CONFIG && SASI_CONFIG.fakeAlerts;
    if (streamLive === 'false' && !isFake) {
      console.log('[Alerts] Stream not started (dashboard toggle OFF). Waiting...');
      setTimeout(startAlerts, 5000);
      return;
    }

    // Try WebSocket first (instant), fall back to polling (20s delay)
    const jwt = getActiveJWT();
    if (jwt) {
      const channelId = await getChannelId(jwt);
      if (channelId) {
        // Initial poll to catch recent events
        pollActivities();
        // Then connect WebSocket for realtime
        connectWebSocket(jwt);
        return;
      }
    }

    // Fallback: polling only
    pollActivities();
    setInterval(pollActivities, POLL_INTERVAL);
  }
  startAlerts();

  // Expose for manual triggering / testing
  window.SASI_ALERTS = {
    test: function(type, name, amount) {
      popupQueue.push({
        id: 'test-' + Date.now(),
        type: type || 'follower',
        name: name || 'TestUser',
        amount: amount,
        timestamp: Date.now(),
      });
      processQueue();
    },
    // Clear the dedup cache — use if alerts are being filtered incorrectly
    reset: function() {
      shownIds.clear();
      localStorage.removeItem(SHOWN_KEY);
      isFirstPoll = true;
      console.log('[Alerts] Cache cleared');
    },
    // Manually trigger a poll
    poll: function() { pollActivities(); },
  };

  // ── Fake alerts (dev / preview mode) — YouTube-specific ──
  if (window.SASI_CONFIG && SASI_CONFIG.fakeAlerts) {
    const FAKE_NAMES = [
      'NeonViper42', 'KillSwitchX', 'MidnightHawk', 'PixelGoblin',
      'RoninWolf', 'CrimsonAce', 'GlitchPrincess', 'DragonByte',
      'ShadowReaper', 'ZeroDayKid', 'SasiFan_99', 'SuperGamer'
    ];
    const FAKE_MESSAGES = [
      'Love the stream! Keep it up bro 🔥',
      'First time here, this is awesome',
      'GG that was insane',
      'POG POG POG',
      'Greetings from Mumbai!',
      'Bhai stream zabardast hai',
      'Sasi the GOAT',
      'Take this for the channel growth ❤️',
      'Subscribed and notification on 🔔',
      'Whens the next stream',
    ];

    const FAKE_TYPES = [
      // Tier 1 super chats (₹20-99)
      { type:'tip',  amount: () => [20, 40, 60, 85, 99][Math.floor(Math.random()*5)],
                     message: () => Math.random() > .5 ? FAKE_MESSAGES[Math.floor(Math.random()*FAKE_MESSAGES.length)] : null },
      // Tier 2 super chats (₹100-499)
      { type:'tip',  amount: () => [100, 150, 200, 350, 499][Math.floor(Math.random()*5)],
                     message: () => FAKE_MESSAGES[Math.floor(Math.random()*FAKE_MESSAGES.length)] },
      // Tier 3 super chats (₹500-1999)
      { type:'tip',  amount: () => [500, 750, 1000, 1500, 1999][Math.floor(Math.random()*5)],
                     message: () => FAKE_MESSAGES[Math.floor(Math.random()*FAKE_MESSAGES.length)] },
      // Tier 4 hero (₹2000-10000)
      { type:'tip',  amount: () => [2000, 5000, 10000][Math.floor(Math.random()*3)],
                     message: () => FAKE_MESSAGES[Math.floor(Math.random()*FAKE_MESSAGES.length)] },
      // Membership
      { type:'member', tierLevel: () => Math.floor(Math.random()*5)+1, months: () => Math.floor(Math.random()*12)+1 },
      // Gift
      { type:'gift', amount: () => [1, 5, 10, 25][Math.floor(Math.random()*4)] },
      // Super Sticker (tip + no message + isSticker flag)
      { type:'tip', amount: () => [40, 60, 100, 200][Math.floor(Math.random()*4)], isSticker: true },
      // Game redemptions with results
      { type:'redemption', amount: () => 1000000, rewardName: () => 'Wheel of Fortune',
        gameResult: () => ['500K Points','VIP Badge','Custom Emote','Shoutout','1M Points'][Math.floor(Math.random()*5)] },
      { type:'redemption', amount: () => 500000, rewardName: () => 'Mystery Box',
        gameResult: () => ['Rare Emote Pack','200K Points','Secret Role','Nothing 💀','1M Points Jackpot'][Math.floor(Math.random()*5)] },
      { type:'redemption', amount: () => 100000, rewardName: () => 'Highlight Message',
        message: () => FAKE_MESSAGES[Math.floor(Math.random()*FAKE_MESSAGES.length)] },
    ];

    function fireFakeAlert() {
      const tpl = FAKE_TYPES[Math.floor(Math.random() * FAKE_TYPES.length)];
      const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
      popupQueue.push({
        id: 'fake-' + Date.now() + '-' + Math.random(),
        type: tpl.type,
        name: name,
        amount: tpl.amount ? tpl.amount() : null,
        message: tpl.message ? tpl.message() : null,
        currency: '₹',
        tierLevel: tpl.tierLevel ? tpl.tierLevel() : null,
        months: tpl.months ? tpl.months() : null,
        isSticker: tpl.isSticker || false,
        rewardName: tpl.rewardName ? tpl.rewardName() : null,
        gameResult: tpl.gameResult ? tpl.gameResult() : null,
        timestamp: Date.now(),
      });
      processQueue();
    }

    setTimeout(fireFakeAlert, 1500);
    function scheduleNext() {
      const delay = 6000 + Math.random() * 5000;
      setTimeout(() => { fireFakeAlert(); scheduleNext(); }, delay);
    }
    scheduleNext();

    console.log('🔔 SASI fake YouTube alerts enabled');
  }
})();
