// ============================================================
//  SASI STREAMS — GLOBAL CONFIG
//  Edit this file to update ALL overlay scenes at once.
//  Just save this file and refresh browser sources in OBS.
// ============================================================

const SASI_CONFIG = {

  // ── Brand ─────────────────────────────────────────────────
  brand: {
    name:    'SASI STREAMS',
    tagline: 'LIVE STREAM',
    logo:    './assets/Sasi_Streams_logo.png',
    font:    "'Arial Black', Impact, Arial, sans-serif",  // change font across all overlays
  },

  // ── Color Scheme ──────────────────────────────────────────
  // Changes apply everywhere — overlays, tickers, badges, effects.
  colors: {
    red:    '#FF2200',
    orange: '#FF7700',
    gold:   '#FFD700',
    bg:     '#050005',
  },

  // ── Social Handles ────────────────────────────────────────
  // Used in tickers, bottom bars, and follow sections.
  socials: {
    twitch:    { platform: 'TWITCH',      handle: '@ONLY_SASI'    },
    youtube:   { platform: 'YOUTUBE',     handle: '@SASI_STREAMS' },
    instagram: { platform: 'INSTAGRAM',   handle: '@SASI_PLAYS'   },
    twitter:   { platform: 'X / TWITTER', handle: '@SASI_PLAYS'   },
  },

  // ── Background Theme ───────────────────────────────────────
  // Options: 'hexgrid', 'particles', 'ember', 'matrix', 'minimal'
  // Change this one value to swap background on ALL scenes.
  background: 'random',    // 'hexgrid', 'particles', 'ember', 'matrix', 'minimal', or 'random'

  // ── Animations ────────────────────────────────────────────
  animations: {
    glitch: true,           // true = glitch effects on, false = off (all scenes)
    speed:  1,              // 1 = normal, 0.5 = slow, 2 = fast (affects CSS durations)
  },

  // ── Ticker ────────────────────────────────────────────────
  ticker: {
    speed: 28,              // seconds for one full scroll (lower = faster)
    show: {
      startingSoon: true,
      brb:          true,
      ending:       true,
    },
  },

  // ── Clock / Date ──────────────────────────────────────────
  clock: {
    show: true,             // show date on starting-soon / brb
  },

  // ── Starting Soon ─────────────────────────────────────────
  startingSoon: {
    badge:      'STARTING SOON',
    mainText:   'STARTING',         // the big center text
    topText:    'Stream',           // italic text above main
    countdown:  5,                  // minutes — set before going live
    nextStream: 'FRIDAY • 8PM',
  },

  // ── BRB ───────────────────────────────────────────────────
  brb: {
    badge:    'BRB',
    mainText: 'BE RIGHT\nBACK',    // use \n for line break
    subtext:  'grabbing something, back in a moment',
    tagline:  'BE RIGHT BACK',     // shown in brand area
  },

  // ── Stream Ending ─────────────────────────────────────────
  ending: {
    badge:   'OFFLINE',
    tagline: 'SEE YOU NEXT TIME',
    thanks:  'Thanks for',
    main:    'WATCHING',
    sub:     'SEE YOU SOON',
  },

  // ── Live Overlay ──────────────────────────────────────────
  live: {
    defaultScene: 0,        // index of the default scene (0 = first)
    scenes: [
      { label: 'GAMING',        color: '#FF7700' },
      { label: 'JUST CHATTING', color: '#FF2200' },
      { label: 'TECH BUILD',    color: '#FFD700' },
      { label: 'REACTS',        color: '#FF2200' },
      { label: 'IRL',           color: '#FF7700' },
      { label: 'GAME SHOW',     color: '#FFD700' },
    ],
  },

  // ── Subscribe Strip (scroll strip component) ───────────────
  // First item in tickerItems is shown on the scrolling strip.
  subscribe: {
    tickerItems: ['SUBSCRIBE'],   // text shown on the scroll strip
  },

  // ── Likes Strip (scroll strip component) ──────────────────
  likes: {
    tickerItems: ['LIKE'],        // text shown on the scroll strip
  },

  // ── Stream Info Panel (just-chatting) ─────────────────────
  // Rolls through items one at a time. Goal items can fetch live
  // data from YouTube/Twitch (API keys in secrets.js).
  // ── Dev / Test ─────────────────────────────────────────────
  // Set to true to spam fake alerts every few seconds (preview only).
  // ALWAYS set to false before going live!
  fakeAlerts: false,

  // ── Active Streaming Platform ──────────────────────────────
  // Which platform you're streaming on right now.
  // Affects which StreamElements account is queried for activity.
  // Options: 'youtube' | 'twitch'
  activePlatform: 'youtube',

  // ── Live Video ID (optional) ──────────────────────────────
  // Paste your YouTube video ID here to connect chat directly.
  // Required for unlisted streams (auto-search can't find them).
  // Leave empty ('') for public streams — auto-detected.
  // Example: 'dQw4w9WgXcQ' (the part after youtube.com/watch?v=)
  liveVideoId: '',

  // ── Locale ─────────────────────────────────────────────────
  // Used for number formatting and default currency display.
  locale: {
    region:          'en-IN',  // affects number formatting (commas: 10,000 vs 10.000)
    defaultCurrency: '₹',      // shown when currency is unknown
  },

  // ── Stream Info Panel (just-chatting screen) ─────────────
  // Shows a rolling info card cycling through items.
  // Available item types — see examples below:
  //
  //   text         — simple label + value
  //                  { type:'text', label:'NEXT STREAM', value:'FRIDAY · 8PM' }
  //
  //   youtube-goal — live sub count from YouTube API, milestone-based
  //                  Auto-rolls: 1K → 10K → 50K → 100K → 500K → 1M
  //                  Requires: youtube apiKey + channelId in secrets.js
  //                  { type:'youtube-goal', label:'YOUTUBE SUBS', color:'red' }
  //                  color: 'red' | 'orange' | 'gold' (or any hex)
  //
  //   discord-qr   — Discord server invite with QR code
  //                  { type:'discord-qr', label:'JOIN DISCORD',
  //                    server:"SASI's Hub", url:'https://discord.gg/...',
  //                    sub:'SCAN TO JOIN' }
  //
  //   stream-time  — live stream duration counter (HH:MM:SS)
  //                  Set start time when going live (or leave 'auto' to count from page load)
  //                  { type:'stream-time', label:'LIVE FOR', start:'auto' }
  //
  //   social       — pulls one social handle from config.socials
  //                  { type:'social', label:'FOLLOW ME', platform:'twitch' }
  //                  platform: 'twitch' | 'youtube' | 'instagram' | 'twitter'
  //
  streamInfo: {
    cycleInterval: 6,              // seconds per item
    pollInterval:  60,             // seconds between API fetches (for live data)
    items: [
      { type:'youtube-goal', label:'YOUTUBE SUBS', color:'red' },
      { type:'discord-qr',   label:'JOIN DISCORD', server:"SASI's Hub", url:'https://discord.gg/ZSzGcup8Vn', sub:'SCAN TO JOIN' },
      { type:'text',         label:'NEXT STREAM',  value:'FRIDAY · 8PM' },
      { type:'text',         label:'SCHEDULE',     value:'MON · WED · FRI @ 8PM' },
      { type:'text',         label:'TODAY',        value:'REACT VIDEOS' },
      // Examples of additional types you can add:
      // { type:'stream-time', label:'LIVE FOR', start:'auto' },
      // { type:'social',      label:'FOLLOW ON',  platform:'twitch' },
    ],
  },

  // ── Viewer Games (just-chatting) ────────────────────────────
  // Redeemed via StreamElements loyalty points.
  // Each game fires a 'redemption' event; alerts.js renders
  // a game-specific card using the rewardName field.
  games: {
    wheel: {
      name:   'Wheel of Fortune',
      icon:   '🎰',
      cost:   1000000,       // loyalty points
      rewards: [
        { name:'500K Points',    weight:40 },
        { name:'VIP Badge',      weight:20 },
        { name:'Custom Emote',   weight:15 },
        { name:'Shoutout',       weight:15 },
        { name:'1M Points',      weight:8  },
        { name:'Nothing 💀',     weight:2  },
      ],
    },
    mystery: {
      name:   'Mystery Box',
      icon:   '📦',
      cost:   500000,
      rewards: [
        { name:'Rare Emote Pack',     weight:30 },
        { name:'200K Points',         weight:30 },
        { name:'Secret Role',         weight:15 },
        { name:'Nothing 💀',          weight:15 },
        { name:'1M Points Jackpot',   weight:10 },
      ],
    },
    highlight: {
      name:   'Highlight Message',
      icon:   '💬',
      cost:   100000,
    },
  },

  // ── Alert System ──────────────────────────────────────────
  // Tier thresholds (INR) for Super Chat visual escalation.
  // Duration scales logarithmically — max 7s at ₹10,000.
  alerts: {
    tiers: {
      1: { min:0,    max:99,   label:'Tier 1' },
      2: { min:100,  max:499,  label:'Tier 2' },
      3: { min:500,  max:1999, label:'Tier 3' },
      4: { min:2000, max:99999,label:'Tier 4 · Hero' },
    },
    maxDuration: 7000,           // ms — cap for highest amounts
    baseDuration: 2500,          // ms — minimum alert time
    memberDuration: 6000,
    giftBaseDuration: 3000,
    giftPerUnit: 400,            // ms added per gift count
    redeemDuration: 5000,
  },

  // ── Webcam Frame ──────────────────────────────────────────
  webcam: {
    width:    480,
    height:   270,
    position: 'bottom-left',  // bottom-left, bottom-right, top-left, top-right
    margin:   20,
    label:    '',              // text under frame (empty = hidden)
  },

  // ── Name Tag ──────────────────────────────────────────────
  nametag: {
    text: '',                 // leave empty to use brand.name automatically
  },

  // ── Effects ────────────────────────────────────────────────
  // Assign effects to any element by CSS selector.
  // Available: glitch, shimmer, pulse, neonFlicker, rgbSplit,
  //            scanLine, fadeInUp, fadeInLeft, fadeInRight,
  //            stampIn, float, glowPulse
  // Use array for multiple effects on one element.
  // Set to '' or [] to disable.
  effects: {
    '.t-starting':    'glitch',           // "STARTING" text
    '.t-stream':      'neonFlicker',      // "Stream" text
    '.t-main':        '',                 // BRB "BE RIGHT BACK"
    '.t-watching':    'glowPulse',        // Ending "WATCHING"
    '.t-thanks':      'shimmer',          // Ending "Thanks for"
    '.t-seeyou':      'pulse',            // Ending "SEE YOU SOON"
    '.scene-name':    'glitch',           // Live overlay scene label
    '.tag-name':      'glitch',           // Name tag text
    '.clock-date':    'scanLine',         // Date display
    '.brand-l1':      '',                 // Brand name (no effect)
    '.live-text':     '',                 // LIVE / BRB badge
    '.countdown-time':'',                 // Countdown timer
  },

  // ── Ticker Extras ─────────────────────────────────────────
  // Last item in ticker for each scene.
  tickerExtras: [
    { text: 'Stream Starting Soon', handle: 'STAY TUNED'   },
    { text: 'Be Right Back',        handle: 'STAY TUNED'   },
    { text: 'Stream Ended',         handle: 'SEE YOU SOON' },
  ],

};

// Expose globally for other scripts (alerts.js, bg-all.js, etc.)
window.SASI_CONFIG = SASI_CONFIG;

// ════════════════════════════════════════════════════════════
//  DASHBOARD OVERRIDES — localStorage values from dashboard.html
//  These take priority over the values above.
// ════════════════════════════════════════════════════════════
(function applyDashboardOverrides() {
  try {
    const g = (k) => localStorage.getItem('sasi_' + k);
    const apply = (k, fn) => { const v = g(k); if (v !== null) fn(v); };

    // ── Go Live ──
    apply('liveVideoId',    v => SASI_CONFIG.liveVideoId = v);
    apply('activePlatform', v => SASI_CONFIG.activePlatform = v);
    apply('fakeAlerts',     v => SASI_CONFIG.fakeAlerts = v === 'true');
    apply('countdown',      v => SASI_CONFIG.startingSoon.countdown = parseInt(v) || 5);
    apply('today',          v => {
      const item = SASI_CONFIG.streamInfo.items.find(i => i.label === 'TODAY');
      if (item) item.value = v;
    });

    // ── Brand ──
    apply('brand_name',    v => SASI_CONFIG.brand.name = v);
    apply('brand_tagline', v => SASI_CONFIG.brand.tagline = v);

    // ── Locale ──
    apply('locale_region',   v => { if (!SASI_CONFIG.locale) SASI_CONFIG.locale = {}; SASI_CONFIG.locale.region = v; });
    apply('locale_currency', v => { if (!SASI_CONFIG.locale) SASI_CONFIG.locale = {}; SASI_CONFIG.locale.defaultCurrency = v; });

    // ── Ticker Extras ──
    apply('ticker_ss',  v => { const parts = v.split('—').map(s=>s.trim()); SASI_CONFIG.tickerExtras[0] = { text: parts[0]||v, handle: parts[1]||'STAY TUNED' }; });
    apply('ticker_brb', v => { const parts = v.split('—').map(s=>s.trim()); SASI_CONFIG.tickerExtras[1] = { text: parts[0]||v, handle: parts[1]||'STAY TUNED' }; });
    apply('ticker_end', v => { const parts = v.split('—').map(s=>s.trim()); SASI_CONFIG.tickerExtras[2] = { text: parts[0]||v, handle: parts[1]||'SEE YOU SOON' }; });

    // ── Starting Soon ──
    apply('ss_badge',      v => SASI_CONFIG.startingSoon.badge = v);
    apply('ss_topText',    v => SASI_CONFIG.startingSoon.topText = v);
    apply('ss_mainText',   v => SASI_CONFIG.startingSoon.mainText = v);
    apply('ss_countdown',  v => SASI_CONFIG.startingSoon.countdown = parseInt(v) || 5);
    apply('ss_nextStream', v => SASI_CONFIG.startingSoon.nextStream = v);
    apply('ss_clock',      v => { if (!SASI_CONFIG.startingSoon._clock) SASI_CONFIG.startingSoon._clock = {}; SASI_CONFIG.startingSoon._clock.show = v === 'true'; });
    apply('ss_ticker',     v => SASI_CONFIG.ticker.show.startingSoon = v === 'true');

    // ── BRB ──
    apply('brb_badge',    v => SASI_CONFIG.brb.badge = v);
    apply('brb_mainText', v => SASI_CONFIG.brb.mainText = v);
    apply('brb_subtext',  v => SASI_CONFIG.brb.subtext = v);
    apply('brb_tagline',  v => SASI_CONFIG.brb.tagline = v);
    apply('brb_clock',    v => { if (!SASI_CONFIG.brb._clock) SASI_CONFIG.brb._clock = {}; SASI_CONFIG.brb._clock.show = v === 'true'; });
    apply('brb_ticker',   v => SASI_CONFIG.ticker.show.brb = v === 'true');

    // ── Stream Ending ──
    apply('end_badge',   v => SASI_CONFIG.ending.badge = v);
    apply('end_tagline', v => SASI_CONFIG.ending.tagline = v);
    apply('end_thanks',  v => SASI_CONFIG.ending.thanks = v);
    apply('end_main',    v => SASI_CONFIG.ending.main = v);
    apply('end_sub',     v => SASI_CONFIG.ending.sub = v);
    apply('end_ticker',  v => SASI_CONFIG.ticker.show.ending = v === 'true');

    // ── Live Overlay ──
    apply('sub_items',     v => SASI_CONFIG.subscribe.tickerItems = v.split(',').map(s => s.trim()).filter(Boolean));
    apply('likes_items',   v => SASI_CONFIG.likes.tickerItems = v.split(',').map(s => s.trim()).filter(Boolean));
    apply('cam_width',    v => SASI_CONFIG.webcam.width = parseInt(v) || 480);
    apply('cam_height',   v => SASI_CONFIG.webcam.height = parseInt(v) || 270);
    apply('cam_position', v => SASI_CONFIG.webcam.position = v);
    apply('cam_margin',   v => SASI_CONFIG.webcam.margin = parseInt(v) || 20);
    apply('cam_label',    v => SASI_CONFIG.webcam.label = v);
    apply('nametag',      v => SASI_CONFIG.nametag.text = v);

    // ── Socials ──
    apply('socials', v => {
      try {
        const arr = JSON.parse(v);
        if (Array.isArray(arr) && arr.length) {
          SASI_CONFIG.socials = {};
          arr.forEach((s, i) => {
            const key = s.platform.toLowerCase().replace(/[^a-z]/g, '') || ('social' + i);
            SASI_CONFIG.socials[key] = { platform: s.platform, handle: s.handle };
          });
        }
      } catch(e) {}
    });

    // ── Stream Info ──
    apply('streamInfo', v => {
      try {
        const items = JSON.parse(v);
        if (Array.isArray(items) && items.length) SASI_CONFIG.streamInfo.items = items;
      } catch(e) {}
    });

    // ── Effects ──
    apply('effects', v => {
      try {
        const efx = JSON.parse(v);
        if (efx && typeof efx === 'object') SASI_CONFIG.effects = efx;
      } catch(e) {}
    });

    // ── Alerts ──
    apply('alert_t2_min',     v => { if (!SASI_CONFIG.alerts.tiers[2]) SASI_CONFIG.alerts.tiers[2] = {}; SASI_CONFIG.alerts.tiers[2].min = parseInt(v) || 100; });
    apply('alert_t3_min',     v => { if (!SASI_CONFIG.alerts.tiers[3]) SASI_CONFIG.alerts.tiers[3] = {}; SASI_CONFIG.alerts.tiers[3].min = parseInt(v) || 500; });
    apply('alert_t4_min',     v => { if (!SASI_CONFIG.alerts.tiers[4]) SASI_CONFIG.alerts.tiers[4] = {}; SASI_CONFIG.alerts.tiers[4].min = parseInt(v) || 2000; });
    apply('alert_baseDur',    v => SASI_CONFIG.alerts.baseDuration = parseInt(v) || 2500);
    apply('alert_maxDur',     v => SASI_CONFIG.alerts.maxDuration = parseInt(v) || 7000);
    apply('alert_memberDur',  v => SASI_CONFIG.alerts.memberDuration = parseInt(v) || 6000);
    apply('alert_giftBaseDur',v => SASI_CONFIG.alerts.giftBaseDuration = parseInt(v) || 3000);
    apply('alert_giftPerUnit',v => SASI_CONFIG.alerts.giftPerUnit = parseInt(v) || 400);
    apply('alert_redeemDur',  v => SASI_CONFIG.alerts.redeemDuration = parseInt(v) || 5000);

    // ── Games ──
    apply('game_wheel_cost',     v => SASI_CONFIG.games.wheel.cost = parseInt(v) || 1000000);
    apply('game_mystery_cost',   v => SASI_CONFIG.games.mystery.cost = parseInt(v) || 500000);
    apply('game_highlight_cost', v => SASI_CONFIG.games.highlight.cost = parseInt(v) || 100000);
    apply('game_wheel_rewards',  v => {
      try { SASI_CONFIG.games.wheel.rewards = v.split('\n').filter(l => l.includes(':')).map(l => { const [n,w] = l.split(':'); return { name:n.trim(), weight:parseInt(w)||1 }; }); } catch(e) {}
    });
    apply('game_mystery_rewards', v => {
      try { SASI_CONFIG.games.mystery.rewards = v.split('\n').filter(l => l.includes(':')).map(l => { const [n,w] = l.split(':'); return { name:n.trim(), weight:parseInt(w)||1 }; }); } catch(e) {}
    });

    // ── Theme ──
    apply('background',  v => SASI_CONFIG.background = v);
    apply('colorRed',    v => SASI_CONFIG.colors.red = v);
    apply('colorOrange', v => SASI_CONFIG.colors.orange = v);
    apply('colorGold',   v => SASI_CONFIG.colors.gold = v);
    apply('glitch',      v => SASI_CONFIG.animations.glitch = v === 'true');
    apply('animSpeed',   v => SASI_CONFIG.animations.speed = parseFloat(v) || 1);
    apply('tickerSpeed', v => SASI_CONFIG.ticker.speed = parseInt(v) || 28);
  } catch(e) {}
})();

// ════════════════════════════════════════════════════════════
//  AUTO-APPLY — do not edit below this line
// ════════════════════════════════════════════════════════════
(function apply() {
  const s = document.documentElement.style;
  const c = SASI_CONFIG.colors;
  s.setProperty('--red',    c.red);
  s.setProperty('--orange', c.orange);
  s.setProperty('--gold',   c.gold);
  if (c.bg) s.setProperty('--bg', c.bg);

  // Apply font (defer until body exists — config.js loads in <head>)
  if (SASI_CONFIG.brand.font) {
    if (document.body) {
      document.body.style.fontFamily = SASI_CONFIG.brand.font;
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.style.fontFamily = SASI_CONFIG.brand.font;
      });
    }
  }

  // Apply animation speed
  const speed = SASI_CONFIG.animations.speed || 1;
  if (speed !== 1) {
    s.setProperty('--anim-speed', (1 / speed));
  }

  // Disable all glitch if master toggle is off
  if (!SASI_CONFIG.animations.glitch) {
    const style = document.createElement('style');
    style.textContent = `
      .fx-glitch, .fx-neonFlicker, .fx-rgbSplit,
      .t-starting, .t-stream, .scene-name, .tag-name,
      [class*="glitch"], [class*="Glitch"] {
        animation-name: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Detect base path — config.js is always at root, HTML may be in subfolders
  const configScript = document.querySelector('script[src*="config.js"]');
  const basePath = configScript ? configScript.src.replace(/config\.js.*$/, '') : './';

  // Load effects.css
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = basePath + 'effects.css';
  document.head.appendChild(link);

  // Load chat.js — auto-injects into any overlay with .chat-frame
  const chatScript = document.createElement('script');
  chatScript.src = basePath + 'chat.js';
  document.head.appendChild(chatScript);

  // notifications.js removed — alerts.js handles all alert rendering now

  // Apply effects from config to elements
  const fx = SASI_CONFIG.effects || {};
  // Wait for DOM to be ready
  function applyEffects() {
    Object.entries(fx).forEach(([selector, effects]) => {
      if (!effects) return;
      const els = document.querySelectorAll(selector);
      const fxList = Array.isArray(effects) ? effects : [effects];
      els.forEach(el => {
        fxList.forEach(f => { if (f) el.classList.add('fx-' + f); });
      });
    });
  }
  // Delay so entry animations (fadeIn, bigIn, etc.) finish before effects take over
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(applyEffects, 2000));
  } else {
    setTimeout(applyEffects, 2000);
  }
})();
