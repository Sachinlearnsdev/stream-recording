// ============================================================
//  SASI STREAMS — LIVE CHAT (YouTube + Twitch)
//  YouTube: Polls Data API v3 with smart detection + multi-key
//  Twitch:  IRC WebSocket (free, zero API quota)
//  Renders inside .chat-frame .chat-body of any overlay.
// ============================================================

(function() {
  const MAX_MESSAGES      = 40;
  const POLL_INTERVAL_MIN = 3000;
  const BOT_NAMES = [
    'nightbot', 'streamelements', 'streamlabs', 'moobot',
    'sery_bot', 'wizebot', 'fossabot', 'phantombot'
  ];

  // Smart detection timing (YouTube only)
  const DETECT_FAST_INTERVAL = 2000;   // 2s for first 2 min
  const DETECT_FAST_DURATION = 120000; // 2 min
  const DETECT_SLOW_INTERVAL = 30000;  // 30s after
  const SEARCH_INTERVAL      = 120000;
  const MAX_SEARCH_TRIES     = 10;

  let liveChatId    = null;
  let nextPageToken = null;
  let seenIds       = new Set();
  let searchTries   = 0;
  let detectStartTime = 0;
  let twitchWs      = null;

  // ── Multi-key rotation (YouTube) ──
  let apiKeyIndex = 0;
  function getApiKeys() {
    const yt = window.SASI_SECRETS && window.SASI_SECRETS.youtube;
    if (!yt) return [];
    const keys = yt.apiKeys || (yt.apiKey ? [yt.apiKey] : []);
    return keys.filter(k => k && !k.startsWith('PASTE_'));
  }
  function getApiKey() {
    const keys = getApiKeys();
    return keys.length ? keys[apiKeyIndex % keys.length] : null;
  }
  function rotateKey(reason) {
    const keys = getApiKeys();
    if (keys.length <= 1) { console.warn('[Chat] No more API keys. ' + reason); return false; }
    apiKeyIndex = (apiKeyIndex + 1) % keys.length;
    if (apiKeyIndex === 0) { console.warn('[Chat] All API keys exhausted. ' + reason); return false; }
    console.log('[Chat] Rotated to key ' + (apiKeyIndex + 1) + '/' + keys.length + ' — ' + reason);
    return true;
  }

  // ── Helpers — batch localStorage reads ──
  function getDashboardConfig() {
    const keys = ['activePlatform','liveVideoId','streamLive','fakeAlerts'];
    const result = {};
    keys.forEach(k => { result[k] = localStorage.getItem('sasi_' + k); });
    return result;
  }
  function getPlatform() {
    return localStorage.getItem('sasi_activePlatform') ||
           (window.SASI_CONFIG && SASI_CONFIG.activePlatform) || 'youtube';
  }
  function getVideoId() {
    return localStorage.getItem('sasi_liveVideoId') ||
           (window.SASI_CONFIG && SASI_CONFIG.liveVideoId) || '';
  }
  function getTwitchChannel() {
    const tw = window.SASI_SECRETS && window.SASI_SECRETS.twitch;
    return (tw && tw.username) || '';
  }

  // ── CSS injection ──
  // Flat-row style: "username: message" on one line, subtle red divider between rows,
  // no bubble. Matches the brand chat-frame pattern across all scenes.
  const css = `
    .sasi-yt-chat {
      width:100%; height:100%;
      overflow-y:auto;
      padding:4px 8px 4px 10px;
      display:flex; flex-direction:column;
      justify-content:flex-end;
      gap:0;
      scrollbar-width:none;
    }
    .sasi-yt-chat::-webkit-scrollbar { display:none;
      box-sizing:border-box;
      font-family:'Inter','Segoe UI',Arial,sans-serif;
    }
    .yt-msg {
      padding:8px 0;
      background:transparent;
      border:none;
      border-bottom:1px solid rgba(255,34,0,.08);
      flex-shrink:0;
      font-size:13px;
      line-height:1.45;
      color:rgba(255,255,255,.88);
      font-weight:400;
      word-wrap:break-word; word-break:break-word;
      opacity:0;
      transform:translateY(8px);
      animation:ytMsgIn .3s cubic-bezier(.16,1,.3,1) forwards;
    }
    .yt-msg:last-child { border-bottom:none; }
    .yt-msg.superchat {
      background:rgba(255,215,0,.06);
      border-left:2px solid rgba(255,215,0,.6);
      border-bottom-color:rgba(255,215,0,.18);
      padding:8px 10px;
      border-radius:3px;
      margin:2px 0;
    }
    @keyframes ytMsgIn {
      from { opacity:0; transform:translateY(8px); }
      to   { opacity:1; transform:translateY(0); }
    }
    .yt-msg.fade-out { animation:ytMsgOut .3s ease forwards; }
    @keyframes ytMsgOut {
      from { opacity:1; transform:translateY(0); }
      to   { opacity:0; transform:translateY(-6px); }
    }
    .yt-msg-head {
      display:inline;
      margin:0;
    }
    .yt-msg-name {
      display:inline;
      font-size:13px; font-weight:800; letter-spacing:.2px;
      color:var(--orange, #FF7700);
    }
    .yt-msg-name::after {
      content:':\\00a0';
      color:var(--orange, #FF7700);
      font-weight:800;
    }
    .yt-badge {
      display:inline-block;
      padding:1px 5px;
      margin-right:5px;
      font-size:8px; font-weight:900; letter-spacing:1px;
      color:#fff; background:var(--red, #FF2200);
      border-radius:2px; text-transform:uppercase;
      vertical-align:1px;
    }
    .yt-badge.owner    { background:#FFD700; color:#000; }
    .yt-badge.mod      { background:#00a86b; }
    .yt-badge.member   { background:#00b2ff; }
    .yt-badge.vip      { background:#e005b9; }
    .yt-badge.sub      { background:var(--orange, #FF7700); }
    .yt-msg-amount {
      display:inline-block;
      margin:0 0 0 6px;
      padding:1px 6px;
      font-size:10px; font-weight:900; letter-spacing:.3px;
      color:#FFD700; background:rgba(255,215,0,.1);
      border:1px solid rgba(255,215,0,.4);
      border-radius:3px;
      vertical-align:1px;
    }
    .yt-msg-body {
      display:inline;
      color:rgba(255,255,255,.88);
      font-weight:400;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // ════════════════════════════════════════════════════════════
  //  SHARED — render a chat message (used by both YT and Twitch)
  // ════════════════════════════════════════════════════════════
  // Cache chat container ref
  let chatEl = null;

  // Bot name Set for O(1) lookup
  const BOT_SET = new Set(BOT_NAMES);

  function renderMessage(opts) {
    if (seenIds.has(opts.id)) return;
    seenIds.add(opts.id);
    if (seenIds.size > 500) seenIds = new Set(Array.from(seenIds).slice(-250));

    // Filter bots (O(1) Set lookup)
    if (BOT_SET.has((opts.name || '').toLowerCase())) return;
    // Filter commands + empty
    if (!opts.text || opts.text.charAt(0) === '!' || opts.text.charAt(0) === '?') return;

    if (!chatEl) chatEl = document.getElementById('sasi-yt-chat');
    if (!chatEl) return;

    // Build message with innerHTML (single DOM write instead of 6+ createElement calls)
    const msg = document.createElement('div');
    msg.className = opts.isSuper ? 'yt-msg superchat' : 'yt-msg';

    let html = '<div class="yt-msg-head">';
    if (opts.badge) html += '<span class="yt-badge ' + (opts.badgeClass || '') + '">' + opts.badge + '</span>';
    html += '<span class="yt-msg-name">' + escapeHtml(opts.name || 'User') + '</span>';
    if (opts.amount) html += '<span class="yt-msg-amount">' + escapeHtml(opts.amount) + '</span>';
    html += '</div><div class="yt-msg-body">' + escapeHtml(opts.text) + '</div>';
    msg.innerHTML = html;

    chatEl.appendChild(msg);

    // Remove oldest — direct remove, no animation wait (faster GC)
    while (chatEl.children.length > MAX_MESSAGES) {
      chatEl.firstChild.remove();
    }

    // Auto-scroll to bottom
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ════════════════════════════════════════════════════════════
  //  YOUTUBE — API polling
  // ════════════════════════════════════════════════════════════
  function addYouTubeMessage(item) {
    const author = item.authorDetails || {};
    const snippet = item.snippet || {};
    const type = snippet.type;
    if (type !== 'textMessageEvent' && type !== 'superChatEvent' && type !== 'superStickerEvent') return;

    let badge = null, badgeClass = null;
    if (author.isChatOwner)          { badge = 'OWNER';  badgeClass = 'owner'; }
    else if (author.isChatModerator) { badge = 'MOD';    badgeClass = 'mod'; }
    else if (author.isChatSponsor)   { badge = 'MEMBER'; badgeClass = 'member'; }

    const isSuperChat = (type === 'superChatEvent' || type === 'superStickerEvent');
    let amount = null;
    if (isSuperChat) {
      const sc = snippet.superChatDetails || snippet.superStickerDetails;
      if (sc && sc.amountDisplayString) amount = sc.amountDisplayString;
    }

    renderMessage({
      id: item.id,
      name: author.displayName,
      text: snippet.displayMessage || (type === 'superStickerEvent' ? '[Sticker]' : ''),
      badge, badgeClass, amount,
      isSuper: isSuperChat,
    });
  }

  async function ytDetectByVideoId(videoId) {
    const key = getApiKey();
    if (!key) return;
    try {
      const res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=' + videoId + '&key=' + key);
      const data = await res.json();
      if (data.error) {
        if (data.error.code === 403 && rotateKey('quota during detect')) { ytScheduleDetect(videoId); return; }
        console.warn('[Chat/YT] Videos API error:', data.error);
        ytScheduleDetect(videoId); return;
      }
      if (data.items && data.items[0] && data.items[0].liveStreamingDetails) {
        const chatId = data.items[0].liveStreamingDetails.activeLiveChatId;
        if (chatId) {
          liveChatId = chatId;
          console.log('[Chat/YT] Stream live! Chat ID:', chatId);
          ytPollMessages(); return;
        }
      }
      console.log('[Chat/YT] Not live yet, waiting...');
      ytScheduleDetect(videoId);
    } catch (e) { console.warn('[Chat/YT] detect failed:', e); ytScheduleDetect(videoId); }
  }

  function ytScheduleDetect(videoId) {
    const elapsed = Date.now() - detectStartTime;
    const interval = elapsed < DETECT_FAST_DURATION ? DETECT_FAST_INTERVAL : DETECT_SLOW_INTERVAL;
    setTimeout(() => ytDetectByVideoId(videoId), interval);
  }

  async function ytSearchForStream() {
    const yt = window.SASI_SECRETS && window.SASI_SECRETS.youtube;
    const key = getApiKey();
    if (!key || !yt || !yt.channelId) return;
    searchTries++;
    if (searchTries > MAX_SEARCH_TRIES) {
      console.warn('[Chat/YT] Gave up searching. Set video ID in dashboard.');
      return;
    }
    try {
      const res = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=' + yt.channelId + '&eventType=live&type=video&key=' + key);
      const data = await res.json();
      if (data.error) {
        if (data.error.code === 403 && rotateKey('quota during search')) { setTimeout(ytSearchForStream, SEARCH_INTERVAL); return; }
        setTimeout(ytSearchForStream, SEARCH_INTERVAL); return;
      }
      if (data.items && data.items.length > 0) {
        console.log('[Chat/YT] Found live video:', data.items[0].id.videoId);
        detectStartTime = Date.now();
        ytDetectByVideoId(data.items[0].id.videoId); return;
      }
      console.log('[Chat/YT] No stream found, retry ' + searchTries + '/' + MAX_SEARCH_TRIES);
      setTimeout(ytSearchForStream, SEARCH_INTERVAL);
    } catch (e) { setTimeout(ytSearchForStream, SEARCH_INTERVAL); }
  }

  async function ytPollMessages() {
    if (!liveChatId) return;
    const key = getApiKey();
    if (!key) return;
    try {
      let url = 'https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=' + liveChatId + '&part=snippet,authorDetails&key=' + key;
      if (nextPageToken) url += '&pageToken=' + nextPageToken;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        if (data.error.code === 403) {
          if (rotateKey('quota during poll')) { setTimeout(ytPollMessages, POLL_INTERVAL_MIN); return; }
          return;
        }
        if (data.error.code === 404) { console.log('[Chat/YT] Chat ended'); liveChatId = null; return; }
      } else {
        nextPageToken = data.nextPageToken;
        if (data.items) data.items.forEach(addYouTubeMessage);
      }
      const next = Math.max(POLL_INTERVAL_MIN, data.pollingIntervalMillis || POLL_INTERVAL_MIN);
      setTimeout(ytPollMessages, next);
    } catch (e) { setTimeout(ytPollMessages, POLL_INTERVAL_MIN); }
  }

  function startYouTube() {
    const videoId = getVideoId();
    if (videoId) {
      console.log('[Chat/YT] Video ID:', videoId, '— smart detection (1 unit/check)');
      detectStartTime = Date.now();
      ytDetectByVideoId(videoId);
    } else {
      console.log('[Chat/YT] No video ID — search fallback (100 units/check)');
      ytSearchForStream();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  TWITCH — IRC WebSocket (free, no API quota)
  // ════════════════════════════════════════════════════════════
  const TWITCH_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';
  let twitchReconnectDelay = 1000;

  function startTwitch() {
    const channel = getTwitchChannel();
    if (!channel) {
      console.warn('[Chat/TW] No twitch username in secrets.js');
      return;
    }
    console.log('[Chat/TW] Connecting to #' + channel + ' (IRC WebSocket, free)');
    connectTwitch(channel);
  }

  function connectTwitch(channel) {
    if (twitchWs) { try { twitchWs.close(); } catch(e) {} }

    const ws = new WebSocket(TWITCH_WS_URL);
    twitchWs = ws;

    ws.onopen = function() {
      console.log('[Chat/TW] Connected');
      twitchReconnectDelay = 1000;
      // Request tags for badges
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      // Anonymous login
      ws.send('NICK justinfan' + Math.floor(10000 + Math.random() * 90000));
      ws.send('JOIN #' + channel.toLowerCase());
    };

    ws.onmessage = function(event) {
      const lines = event.data.split('\r\n');
      lines.forEach(function(line) {
        if (!line) return;
        // Respond to PING
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); return; }
        // Parse PRIVMSG
        if (line.indexOf('PRIVMSG') === -1) return;
        parseTwitchMessage(line);
      });
    };

    ws.onclose = function() {
      console.log('[Chat/TW] Disconnected, reconnecting in ' + (twitchReconnectDelay/1000) + 's');
      setTimeout(() => connectTwitch(channel), twitchReconnectDelay);
      twitchReconnectDelay = Math.min(twitchReconnectDelay * 2, 30000);
    };

    ws.onerror = function(e) {
      console.warn('[Chat/TW] WebSocket error:', e);
    };
  }

  function parseTwitchMessage(raw) {
    // Format: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
    let tags = {};
    let rest = raw;

    // Extract tags
    if (rest.charAt(0) === '@') {
      const spaceIdx = rest.indexOf(' ');
      const tagStr = rest.substring(1, spaceIdx);
      rest = rest.substring(spaceIdx + 1);
      tagStr.split(';').forEach(function(t) {
        const eq = t.indexOf('=');
        if (eq !== -1) tags[t.substring(0, eq)] = t.substring(eq + 1);
      });
    }

    // Extract username
    const userMatch = rest.match(/^:([^!]+)!/);
    if (!userMatch) return;
    const username = userMatch[1];

    // Extract message text
    const msgIdx = rest.indexOf(' :');
    // Find the second ' :' (after PRIVMSG #channel)
    const privmsgIdx = rest.indexOf('PRIVMSG');
    if (privmsgIdx === -1) return;
    const textStart = rest.indexOf(' :', privmsgIdx);
    if (textStart === -1) return;
    const text = rest.substring(textStart + 2);

    // Parse badges
    const displayName = tags['display-name'] || username;
    const badgesStr = tags['badges'] || '';
    let badge = null, badgeClass = null;

    if (badgesStr.indexOf('broadcaster/') !== -1)      { badge = 'OWNER'; badgeClass = 'owner'; }
    else if (badgesStr.indexOf('moderator/') !== -1)    { badge = 'MOD'; badgeClass = 'mod'; }
    else if (badgesStr.indexOf('vip/') !== -1)          { badge = 'VIP'; badgeClass = 'vip'; }
    else if (badgesStr.indexOf('subscriber/') !== -1)   { badge = 'SUB'; badgeClass = 'sub'; }

    // Check for cheer (bits)
    const bits = tags['bits'] ? parseInt(tags['bits']) : 0;

    renderMessage({
      id: 'tw-' + (tags['id'] || Date.now() + '-' + Math.random()),
      name: displayName,
      text: text,
      badge: badge,
      badgeClass: badgeClass,
      amount: bits ? bits + ' BITS' : null,
      isSuper: bits > 0,
    });
  }

  // ════════════════════════════════════════════════════════════
  //  FAKE CHAT (dev/preview)
  // ════════════════════════════════════════════════════════════
  function startFakeChat() {
    const NAMES = [
      'NeonViper42', 'KillSwitchX', 'MidnightHawk', 'PixelGoblin',
      'RoninWolf', 'CrimsonAce', 'GlitchPrincess', 'DragonByte',
      'ShadowReaper', 'ZeroDayKid', 'SasiFan_99', 'SuperGamer',
      'sachinsingh-z6z', 'TechNinja', 'StreamSniper01'
    ];
    const MSGS = [
      'yo whats up', 'lets gooo', 'first time here!', 'GG',
      'POG POG POG', 'greetings from Mumbai!', 'bhai stream zabardast hai',
      'Sasi the GOAT', 'love the overlays', 'when is the next stream?',
      'hi everyone', 'this is so cool', 'subbed!', 'notification gang',
      'lol', 'nice one', 'can you play valorant?', 'hello from India',
      'W stream', 'L take', 'gg ez', 'haha that was insane',
    ];
    const BADGES = [
      null, null, null, null, null,
      { badge:'MOD', badgeClass:'mod' },
      { badge:'SUB', badgeClass:'sub' },
      { badge:'VIP', badgeClass:'vip' },
      null, null
    ];
    let fakeId = 0;
    function sendFake() {
      const b = BADGES[Math.floor(Math.random() * BADGES.length)];
      renderMessage({
        id: 'fake-' + (fakeId++),
        name: NAMES[Math.floor(Math.random() * NAMES.length)],
        text: MSGS[Math.floor(Math.random() * MSGS.length)],
        badge: b ? b.badge : null,
        badgeClass: b ? b.badgeClass : null,
      });
      setTimeout(sendFake, 2000 + Math.random() * 4000);
    }
    setTimeout(sendFake, 1000);
    console.log('[Chat] Fake chat mode enabled');
  }

  // ════════════════════════════════════════════════════════════
  //  BOOT
  // ════════════════════════════════════════════════════════════
  function boot() {
    const container = document.querySelector('.chat-frame .chat-body') ||
                      document.querySelector('.chat-frame .frame-body') ||
                      document.querySelector('.chat-frame');
    if (!container) {
      console.log('[Chat] No .chat-frame found, skipping');
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'sasi-yt-chat';
    wrap.id = 'sasi-yt-chat';
    container.appendChild(wrap);

    // Check fake mode
    const fakeLs = localStorage.getItem('sasi_fakeAlerts');
    const isFake = fakeLs !== null ? fakeLs === 'true' : (window.SASI_CONFIG && SASI_CONFIG.fakeAlerts);
    if (isFake) { startFakeChat(); return; }

    // Check if stream is live (dashboard toggle)
    const streamLive = localStorage.getItem('sasi_streamLive');
    if (streamLive === 'false') {
      console.log('[Chat] Stream not started (dashboard toggle OFF). Waiting...');
      // Poll every 5s until toggled on
      setTimeout(boot, 5000);
      return;
    }

    // Route by platform
    const platform = getPlatform();
    console.log('[Chat] Platform:', platform);

    if (platform === 'twitch') {
      startTwitch();
    } else {
      startYouTube();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
