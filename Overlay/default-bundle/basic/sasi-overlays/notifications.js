// ============================================================
//  SASI STREAMS — UNIFIED NOTIFICATIONS
//  Cross-scene floating cards (bottom-left)
//  Persists in localStorage, syncs across all scenes/sources
//
//  Public API:
//    SASI_NOTIFY.add({ type, title, user, body, duration })
//    SASI_NOTIFY.clear()
//    SASI_NOTIFY.dismiss(id)
//    SASI_NOTIFY.getQueue()
// ============================================================

(function() {
  const QUEUE_KEY = 'sasi_notifications_queue';
  const MAX_VISIBLE = 2;           // max 2 cards visible at once
  const DEFAULT_DURATION = 60000;  // 60 seconds default
  const POLL_INTERVAL = 1000;      // 1s fallback poll for cross-scene sync

  let container = null;
  const renderedIds = new Set();

  // ── CSS injection ──
  const css = `
    .sasi-notify-stack {
      position:fixed;
      top:100px; left:50%;
      transform:translateX(-50%);
      display:flex; flex-direction:column;
      gap:10px;
      z-index:99999;
      pointer-events:none;
      font-family:'Inter','Arial Black',sans-serif;
      width:560px;
      max-width:92vw;
      align-items:center;
    }
    .sasi-notify-card {
      width:100%;
      background:rgba(8,0,2,.96);
      border:1px solid rgba(255,34,0,.4);
      border-radius:10px;
      padding:0;
      box-shadow:0 12px 40px rgba(0,0,0,.8), 0 0 30px rgba(255,34,0,.25);
      overflow:hidden;
      position:relative;
      opacity:0;
      transform:translateY(-30px) scale(.96);
      transition:opacity .4s ease, transform .5s cubic-bezier(.16,1,.3,1);
    }
    .sasi-notify-card.in {
      opacity:1;
      transform:translateY(0) scale(1);
    }
    .sasi-notify-card.out {
      opacity:0;
      transform:translateY(-12px) scale(.97);
    }
    .sasi-notify-card::before {
      content:''; position:absolute; top:0; left:8px; right:8px; height:1px;
      background:linear-gradient(90deg, transparent, rgba(255,34,0,.6), transparent);
    }
    /* Wheel/jackpot variant — gold accent */
    .sasi-notify-card.wheel {
      border-color:rgba(255,215,0,.55);
      box-shadow:0 8px 32px rgba(0,0,0,.7), 0 0 32px rgba(255,215,0,.25);
    }
    .sasi-notify-card.wheel::before {
      background:linear-gradient(90deg, transparent, rgba(255,215,0,.7), transparent);
    }

    .sasi-notify-header {
      display:flex; align-items:center; gap:8px;
      padding:8px 14px;
      background:rgba(0,0,0,.4);
      border-bottom:1px solid rgba(255,34,0,.18);
    }
    .sasi-notify-card.wheel .sasi-notify-header {
      border-bottom-color:rgba(255,215,0,.25);
    }
    .sasi-notify-dot {
      width:6px; height:6px; border-radius:50%;
      background:var(--red, #FF2200);
      box-shadow:0 0 6px var(--red, #FF2200);
      animation:notifyPulse 1.6s ease-in-out infinite;
    }
    .sasi-notify-card.wheel .sasi-notify-dot {
      background:var(--gold, #FFD700);
      box-shadow:0 0 6px var(--gold, #FFD700);
    }
    @keyframes notifyPulse {
      0%,100% { opacity:1; }
      50% { opacity:.35; }
    }
    .sasi-notify-title {
      font-size:9px; font-weight:900; letter-spacing:4px;
      color:rgba(255,119,0,.8);
      text-transform:uppercase;
      flex:1;
    }
    .sasi-notify-card.wheel .sasi-notify-title {
      color:rgba(255,215,0,.9);
    }
    .sasi-notify-time {
      font-size:8px; font-weight:700; letter-spacing:1px;
      color:rgba(255,255,255,.3);
      font-variant-numeric:tabular-nums;
    }

    .sasi-notify-body {
      padding:18px 28px;
      display:flex; flex-direction:row; align-items:center; gap:18px;
    }
    .sasi-notify-user {
      font-size:15px; font-weight:800; letter-spacing:.5px;
      color:rgba(255,119,0,.85);
      flex-shrink:0;
      max-width:200px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .sasi-notify-card.wheel .sasi-notify-user {
      color:rgba(255,215,0,.85);
    }
    .sasi-notify-action {
      font-size:22px; font-weight:900; letter-spacing:1.5px;
      color:#fff;
      text-shadow:0 0 14px rgba(255,34,0,.45);
      text-transform:uppercase;
      flex:1;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .sasi-notify-card.wheel .sasi-notify-action {
      color:#fff;
      text-shadow:0 0 14px rgba(255,215,0,.5);
    }

    /* Progress bar showing time until auto-dismiss */
    .sasi-notify-progress {
      position:absolute; bottom:0; left:0; height:2px;
      background:linear-gradient(90deg, var(--red, #FF2200), var(--orange, #FF7700));
      width:100%;
      transform-origin:left;
      transform:scaleX(1);
      transition:transform linear;
    }
    .sasi-notify-card.wheel .sasi-notify-progress {
      background:linear-gradient(90deg, var(--gold, #FFD700), var(--orange, #FF7700));
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // ── Queue management (localStorage-backed) ──
  function loadQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }
  function saveQueue(queue) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch(e) {}
  }
  function pruneExpired(queue) {
    const now = Date.now();
    return queue.filter(n => (n.ts + (n.duration || DEFAULT_DURATION)) > now);
  }

  // ── Container setup ──
  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.className = 'sasi-notify-stack';
    container.id = 'sasi-notify-stack';
    document.body.appendChild(container);
    return container;
  }

  // ── Render a single notification ──
  function renderCard(notif) {
    if (renderedIds.has(notif.id)) return;
    renderedIds.add(notif.id);

    ensureContainer();
    if (container.children.length >= MAX_VISIBLE) {
      // Skip rendering if too many visible — they'll appear when others fade
      renderedIds.delete(notif.id);
      return;
    }

    const card = document.createElement('div');
    card.className = 'sasi-notify-card' + (notif.type ? ' ' + notif.type : '');
    card.dataset.id = notif.id;

    const remaining = (notif.ts + (notif.duration || DEFAULT_DURATION)) - Date.now();
    if (remaining <= 0) { renderedIds.delete(notif.id); return; }

    card.innerHTML =
      '<div class="sasi-notify-header">' +
        '<div class="sasi-notify-dot"></div>' +
        '<span class="sasi-notify-title">' + escapeHtml(notif.title || 'Notification') + '</span>' +
      '</div>' +
      '<div class="sasi-notify-body">' +
        (notif.user ? '<div class="sasi-notify-user">' + escapeHtml(notif.user) + '</div>' : '') +
        (notif.body ? '<div class="sasi-notify-action">' + escapeHtml(notif.body) + '</div>' : '') +
      '</div>' +
      '<div class="sasi-notify-progress" style="transform:scaleX(1);"></div>';

    container.appendChild(card);

    // Animate in
    requestAnimationFrame(() => card.classList.add('in'));

    // Start progress bar countdown
    const progress = card.querySelector('.sasi-notify-progress');
    progress.style.transition = 'transform ' + (remaining / 1000) + 's linear';
    requestAnimationFrame(() => { progress.style.transform = 'scaleX(0)'; });

    // Auto-remove when expired
    setTimeout(() => removeCard(card, notif.id), remaining);
  }

  function removeCard(card, id) {
    if (!card || !card.parentNode) return;
    card.classList.remove('in');
    card.classList.add('out');
    setTimeout(() => {
      if (card.parentNode) card.remove();
      renderedIds.delete(id);
      // Also remove from queue
      const queue = loadQueue().filter(n => n.id !== id);
      saveQueue(queue);
      // Re-render in case more notifications are pending
      renderQueue();
    }, 500);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Render queue (called on load + on storage events) ──
  function renderQueue() {
    let queue = loadQueue();
    queue = pruneExpired(queue);
    saveQueue(queue);

    queue.forEach(notif => {
      if (!renderedIds.has(notif.id)) renderCard(notif);
    });
  }

  // ── Cross-scene sync via storage event + polling fallback ──
  window.addEventListener('storage', function(e) {
    if (e.key === QUEUE_KEY) renderQueue();
  });
  setInterval(renderQueue, POLL_INTERVAL);

  // ── Public API ──
  window.SASI_NOTIFY = {
    add: function(notif) {
      const item = {
        id: notif.id || ('notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
        type: notif.type || 'default',
        title: notif.title || 'NOTIFICATION',
        user: notif.user || '',
        body: notif.body || '',
        ts: Date.now(),
        duration: notif.duration || DEFAULT_DURATION,
      };
      const queue = pruneExpired(loadQueue());
      queue.push(item);
      saveQueue(queue);
      renderCard(item);
      return item.id;
    },
    clear: function() {
      saveQueue([]);
      if (container) {
        Array.from(container.children).forEach(c => removeCard(c, c.dataset.id));
      }
      renderedIds.clear();
    },
    dismiss: function(id) {
      const queue = loadQueue().filter(n => n.id !== id);
      saveQueue(queue);
      if (container) {
        const card = container.querySelector('[data-id="' + id + '"]');
        if (card) removeCard(card, id);
      }
    },
    getQueue: function() { return loadQueue(); },
  };

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderQueue);
  } else {
    renderQueue();
  }
})();
