# Sasi Studio Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing 2,735-line single-scroll `dashboard.html` with a 6-tab Studio Console–styled dashboard. Establish locked design tokens and project UI rules.

**Architecture:** Build the new dashboard alongside the old one as `dashboard-new.html`. Tab-by-tab incremental build keeps the old dashboard fully functional throughout. Final task swaps the two files. Single-page app, vanilla JS, no framework. All HTTP calls go to the existing local watcher API at `http://127.0.0.1:6789` — no API changes.

**Tech Stack:** Vanilla HTML/CSS/JS. Inter + JetBrains Mono via Google Fonts. CSS custom properties for tokens. No build step.

**Spec:** [docs/superpowers/specs/2026-05-10-sasi-studio-dashboard-design.md](../specs/2026-05-10-sasi-studio-dashboard-design.md)

---

## File map

| Path | Action | Purpose |
|---|---|---|
| `Overlay/sasi-overlays/tokens.css` | Create | All design tokens as CSS custom properties + base utility classes |
| `Overlay/sasi-overlays/dashboard-new.html` | Create | New dashboard. Becomes `dashboard.html` in the final swap. |
| `Overlay/sasi-overlays/dashboard.html` | Modify (final task) | Renamed to `dashboard-old.html` after the swap (kept as rollback). |
| `CLAUDE.md` | Create | Project-root rules document. Loaded into every conversation. |

---

## Task 1: Design tokens CSS

**Files:**
- Create: `Overlay/sasi-overlays/tokens.css`

- [ ] **Step 1: Write the tokens file**

```css
/* Sasi Studio — Design tokens
 * Single source of truth for the dashboard + overlay HTML files.
 * Locked per spec: docs/superpowers/specs/2026-05-10-sasi-studio-dashboard-design.md
 */

:root {
  /* Surfaces */
  --bg-page:    #0E1014;
  --bg-card:    #13161D;
  --bg-divider: #1F222A;
  --bg-border:  #2A2F3A;

  /* Text */
  --text-primary:   #FFFFFF;
  --text-secondary: #9DA5B4;
  --text-muted:     #5A6273;

  /* State accents */
  --accent-online: #00FF85;
  --accent-rec:    #FF3434;
  --accent-warn:   #FFB020;

  /* Typography */
  --font-ui:   'Inter', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Consolas', monospace;

  /* Type scale (px) */
  --text-display: 24px;
  --text-heading: 18px;
  --text-body:    13px;
  --text-small:   11px;
  --text-label:   9px;
  --text-mono:    12px;

  /* Spacing scale (px) */
  --sp-1:  4px;
  --sp-2:  8px;
  --sp-3:  12px;
  --sp-4:  16px;
  --sp-5:  20px;
  --sp-6:  24px;
  --sp-7:  32px;
  --sp-8:  48px;

  /* Radii */
  --r-chip:   3px;
  --r-button: 4px;
  --r-card:   6px;
  --r-card-lg: 8px;

  /* Transitions */
  --t-fast: 150ms ease;
}

/* Base reset */
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  line-height: 1.5;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* Typography utilities */
.t-display  { font-size: var(--text-display); font-weight: 600; letter-spacing: -0.02em; }
.t-heading  { font-size: var(--text-heading); font-weight: 600; letter-spacing: -0.01em; }
.t-body     { font-size: var(--text-body); }
.t-small    { font-size: var(--text-small); color: var(--text-secondary); }
.t-label    {
  font-size: var(--text-label);
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.t-mono     { font-family: var(--font-mono); font-size: var(--text-mono); }

/* Surface utilities */
.surface-card {
  background: var(--bg-card);
  border: 1px solid var(--bg-divider);
  border-radius: var(--r-card);
}

/* Focus state — single rule, applies everywhere */
*:focus-visible {
  outline: 1px solid var(--accent-online);
  outline-offset: 1px;
}
```

- [ ] **Step 2: Verify the file parses by opening it in a browser tab**

Open `file:///e:/Code/stream-recording/Overlay/sasi-overlays/tokens.css` in the browser. The file content should display as plain CSS. No browser error.

- [ ] **Step 3: Commit**

```bash
git add Overlay/sasi-overlays/tokens.css
git commit -m "feat(dashboard): add Sasi Studio design tokens

Single source of truth for colors, type, spacing, radii. Imported by
the upcoming dashboard rebuild and any future overlay HTML."
```

---

## Task 2: Dashboard shell — HTML scaffold + sidebar + tab switching

**Files:**
- Create: `Overlay/sasi-overlays/dashboard-new.html`

- [ ] **Step 1: Create the file with full shell HTML and CSS**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sasi Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="tokens.css">
<style>
  /* Layout */
  .shell { display: flex; min-height: 100vh; }
  .sidebar {
    width: 200px; flex-shrink: 0;
    background: #0a0c10;
    border-right: 1px solid var(--bg-divider);
    padding: var(--sp-5) 0;
    position: sticky; top: 0; height: 100vh;
    display: flex; flex-direction: column;
  }
  .main { flex: 1; padding: var(--sp-6) var(--sp-7); max-width: 920px; }

  /* Sidebar header */
  .sb-head { padding: 0 var(--sp-4) var(--sp-4); border-bottom: 1px solid var(--bg-divider); margin-bottom: var(--sp-3); }
  .sb-brand { display: flex; align-items: center; gap: var(--sp-2); }
  .sb-mark {
    width: 28px; height: 28px;
    background: linear-gradient(135deg, var(--accent-rec), var(--accent-warn));
    border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    color: var(--bg-page); font-weight: 900; font-size: 13px;
  }
  /* Note: the gradient on the brand mark is the ONLY allowed gradient — it's the logo, not chrome. */
  .sb-name { color: var(--text-primary); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
  .sb-ver  { color: var(--text-muted); font-size: 9px; letter-spacing: 0.12em; margin-top: 1px; }
  .sb-status { display: flex; align-items: center; gap: var(--sp-1); margin-top: var(--sp-3); }
  .sb-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--text-muted);
    transition: background var(--t-fast);
  }
  .sb-dot.online { background: var(--accent-online); box-shadow: 0 0 6px var(--accent-online); }
  .sb-dot.offline { background: var(--accent-rec); }
  .sb-status-text { color: var(--text-secondary); font-size: 10px; font-weight: 500; }

  /* Sidebar tabs */
  .tabs { flex: 1; }
  .tab-btn {
    display: block; width: 100%;
    padding: 10px var(--sp-4);
    background: transparent; border: none;
    color: var(--text-secondary);
    font-family: inherit; font-size: 12px; font-weight: 500;
    letter-spacing: 0.04em; text-align: left; cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
    border-left: 2px solid transparent;
  }
  .tab-btn:hover { color: var(--text-primary); }
  .tab-btn.active {
    color: var(--text-primary);
    background: rgba(255,255,255,0.03);
    border-left-color: var(--text-primary);
    font-weight: 600;
  }
  .tab-badge {
    background: var(--accent-rec); color: #fff;
    font-size: 9px; font-weight: 700;
    padding: 1px 5px; border-radius: 8px;
    margin-left: var(--sp-1);
  }

  /* Page header */
  .page-head { margin-bottom: var(--sp-6); }
  .page-eyebrow { font-size: 9px; letter-spacing: 0.18em; font-weight: 600; color: var(--text-muted); margin-bottom: var(--sp-1); text-transform: uppercase; }
  .page-title { font-size: var(--text-display); font-weight: 600; letter-spacing: -0.02em; }

  /* Tab panels */
  .panel { display: none; }
  .panel.active { display: block; }
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="sb-head">
      <div class="sb-brand">
        <div class="sb-mark">S</div>
        <div>
          <div class="sb-name">Sasi Studio</div>
          <div class="sb-ver">v0.2.0</div>
        </div>
      </div>
      <div class="sb-status">
        <div class="sb-dot" id="sb-dot"></div>
        <span class="sb-status-text" id="sb-status-text">Connecting...</span>
      </div>
    </div>
    <nav class="tabs">
      <button class="tab-btn active" data-tab="now">● Now</button>
      <button class="tab-btn" data-tab="overlays">Overlays</button>
      <button class="tab-btn" data-tab="recordings">Recordings</button>
      <button class="tab-btn" data-tab="obs">OBS</button>
      <button class="tab-btn" data-tab="keys">Keys</button>
      <button class="tab-btn" data-tab="settings">Settings</button>
    </nav>
  </aside>

  <main class="main">
    <section class="panel active" data-panel="now">
      <div class="page-head">
        <div class="page-eyebrow">Dashboard</div>
        <div class="page-title">Now</div>
      </div>
      <p class="t-small">Now-tab content goes here in Task 3.</p>
    </section>
    <section class="panel" data-panel="overlays">
      <div class="page-head">
        <div class="page-eyebrow">Stream</div>
        <div class="page-title">Overlays</div>
      </div>
      <p class="t-small">Overlays placeholder goes here in Task 7.</p>
    </section>
    <section class="panel" data-panel="recordings">
      <div class="page-head">
        <div class="page-eyebrow">Library</div>
        <div class="page-title">Recordings</div>
      </div>
      <p class="t-small">Recordings content goes here in Task 5.</p>
    </section>
    <section class="panel" data-panel="obs">
      <div class="page-head">
        <div class="page-eyebrow">Studio</div>
        <div class="page-title">OBS</div>
      </div>
      <p class="t-small">OBS content goes here in Task 4.</p>
    </section>
    <section class="panel" data-panel="keys">
      <div class="page-head">
        <div class="page-eyebrow">Stream</div>
        <div class="page-title">Keys</div>
      </div>
      <p class="t-small">Keys placeholder goes here in Task 7.</p>
    </section>
    <section class="panel" data-panel="settings">
      <div class="page-head">
        <div class="page-eyebrow">System</div>
        <div class="page-title">Settings</div>
      </div>
      <p class="t-small">Settings content goes here in Task 6.</p>
    </section>
  </main>
</div>

<script>
  const API = 'http://127.0.0.1:6789';

  // CSRF wrapper — required for POST/PUT/DELETE to the watcher.
  // The watcher rejects mutating requests without X-Clip-Prep: 1.
  if (!window.__sasiFetchWrapped) {
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const isLocal = url.startsWith(API);
      const method = ((init && init.method) || 'GET').toUpperCase();
      const mutating = method === 'POST' || method === 'PUT' || method === 'DELETE';
      if (isLocal && mutating) {
        const merged = { ...(init || {}) };
        merged.headers = { ...(merged.headers || {}), 'X-Clip-Prep': '1' };
        return orig(input, merged);
      }
      return orig(input, init);
    };
    window.__sasiFetchWrapped = true;
  }

  // Tab switching
  function activateTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.toggle('active', p.dataset.panel === name);
    });
    if (history.replaceState) history.replaceState(null, '', '#' + name);
  }
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => activateTab(b.dataset.tab));
  });
  // Honor #hash on load
  const hashTab = (location.hash || '').replace('#', '');
  if (hashTab && document.querySelector(`[data-tab="${hashTab}"]`)) activateTab(hashTab);

  // Status poller — drives the sidebar online dot + uptime
  const sbDot = document.getElementById('sb-dot');
  const sbStatusText = document.getElementById('sb-status-text');
  function fmtUptime(startedAt) {
    if (!startedAt) return '';
    const ms = Date.now() - new Date(startedAt).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  async function pollStatus() {
    try {
      const r = await fetch(API + '/status');
      if (!r.ok) throw new Error('http ' + r.status);
      const s = await r.json();
      sbDot.className = 'sb-dot online';
      sbStatusText.textContent = `Online · ${fmtUptime(s.startedAt)}`;
      window.__sasiStatus = s;
    } catch (e) {
      sbDot.className = 'sb-dot offline';
      sbStatusText.textContent = 'Offline';
      window.__sasiStatus = null;
    }
  }
  pollStatus();
  setInterval(pollStatus, 3000);
</script>
</body>
</html>
```

- [ ] **Step 2: Open in a browser to verify**

Open `file:///e:/Code/stream-recording/Overlay/sasi-overlays/dashboard-new.html`. Verify:
- Sidebar appears on the left (200px wide, dark)
- Brand "Sasi Studio" + version visible
- Six tab buttons; clicking each switches the visible panel
- Status dot is grey "Connecting..." then turns green "Online · Xm" if the watcher is running, or red "Offline" if it isn't
- No console errors

- [ ] **Step 3: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-new.html
git commit -m "feat(dashboard): add Sasi Studio shell + tab switching

Sidebar with 6 tabs, status indicator, hash-based deep linking.
Empty placeholders in each panel — content lands in tasks 3-7."
```

---

## Task 3: Now tab — recording hero card + recent moves

**Files:**
- Modify: `Overlay/sasi-overlays/dashboard-new.html` (replace the Now panel placeholder + add CSS for hero card / stats grid / log table)

- [ ] **Step 1: Add CSS for hero card, stats grid, recent moves table**

In the `<style>` block of dashboard-new.html, append:

```css
  /* Hero recording card */
  .hero-card { padding: var(--sp-5); margin-bottom: var(--sp-3); }
  .hero-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--sp-4); }
  .hero-label { font-size: 9px; letter-spacing: 0.18em; font-weight: 600; color: var(--text-muted); margin-bottom: var(--sp-1); text-transform: uppercase; }
  .hero-game { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  .hero-sub { color: var(--text-secondary); font-size: var(--text-mono); margin-top: 2px; font-family: var(--font-mono); }
  .rec-pill {
    display: none; /* hidden by default — JS toggles when recording */
    align-items: center; gap: var(--sp-2);
    background: rgba(255,52,52,0.08); border: 1px solid rgba(255,52,52,0.4);
    border-radius: var(--r-button); padding: 8px 12px;
  }
  .rec-pill.active { display: flex; }
  .rec-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-rec); }
  .rec-pill .label { color: var(--accent-rec); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; }

  /* Stats grid */
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--bg-divider); border-radius: var(--r-button); overflow: hidden; }
  .stat { background: var(--bg-page); padding: 10px 12px; }
  .stat-label { color: var(--text-muted); font-size: 9px; font-weight: 600; letter-spacing: 0.15em; }
  .stat-value { color: var(--text-primary); font-family: var(--font-mono); font-size: var(--text-body); margin-top: 2px; }

  /* Action row */
  .actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-4); }
  .btn {
    padding: 10px var(--sp-4);
    border-radius: var(--r-button);
    font-family: inherit; font-size: 11px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    cursor: pointer; border: 1px solid transparent;
    transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
  }
  .btn-primary { background: var(--text-primary); color: var(--bg-page); border-color: var(--text-primary); flex: 1; }
  .btn-primary:hover { background: #ddd; border-color: #ddd; }
  .btn-secondary { background: transparent; color: var(--text-secondary); border-color: var(--bg-border); }
  .btn-secondary:hover { color: var(--text-primary); border-color: var(--text-secondary); }
  .btn-destructive {
    background: rgba(255,52,52,0.08); color: var(--accent-rec);
    border-color: rgba(255,52,52,0.4);
  }
  .btn-destructive:hover { background: rgba(255,52,52,0.15); }

  /* Recent moves table */
  .moves-card { padding: var(--sp-4) var(--sp-5); }
  .moves-list { font-family: var(--font-mono); font-size: var(--text-mono); color: var(--text-secondary); margin-top: var(--sp-3); }
  .moves-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--bg-divider); }
  .moves-row:last-child { border-bottom: none; }
  .moves-row .target { color: var(--text-primary); }
  .moves-row .target.mix { color: var(--accent-warn); }
  .moves-empty { color: var(--text-muted); font-style: italic; padding: var(--sp-2) 0; }
```

- [ ] **Step 2: Replace the Now-panel placeholder content**

In the body, replace:

```html
    <section class="panel active" data-panel="now">
      <div class="page-head">
        <div class="page-eyebrow">Dashboard</div>
        <div class="page-title">Now</div>
      </div>
      <p class="t-small">Now-tab content goes here in Task 3.</p>
    </section>
```

with:

```html
    <section class="panel active" data-panel="now">
      <div class="page-head">
        <div class="page-eyebrow">Dashboard</div>
        <div class="page-title">Now</div>
      </div>

      <div class="surface-card hero-card">
        <div class="hero-row">
          <div>
            <div class="hero-label">Recording</div>
            <div class="hero-game" id="now-game">—</div>
            <div class="hero-sub" id="now-sub">Watcher offline</div>
          </div>
          <div class="rec-pill" id="now-rec-pill">
            <div class="dot"></div>
            <div class="label">REC</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-label">DUMP</div><div class="stat-value" id="now-dump">—</div></div>
          <div class="stat"><div class="stat-label">QUEUE</div><div class="stat-value" id="now-queue">—</div></div>
          <div class="stat"><div class="stat-label">UPTIME</div><div class="stat-value" id="now-uptime">—</div></div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" id="now-open-dump">Open Dump Folder</button>
          <button class="btn btn-secondary" id="now-restart">Restart</button>
        </div>
      </div>

      <div class="surface-card moves-card">
        <div class="hero-label">Recent moves</div>
        <div class="moves-list" id="now-moves">
          <div class="moves-empty">No recent moves</div>
        </div>
      </div>
    </section>
```

- [ ] **Step 3: Add the rendering + action handlers in the `<script>` block**

Append to the existing `<script>` block (after the `pollStatus` definition, before `pollStatus()` is called):

```js
  // === Now tab rendering ===
  const $ = (id) => document.getElementById(id);
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function renderNow(s) {
    if (!s) {
      $('now-game').textContent = '—';
      $('now-sub').textContent = 'Watcher offline';
      $('now-dump').textContent = '—';
      $('now-queue').textContent = '—';
      $('now-uptime').textContent = '—';
      $('now-rec-pill').classList.remove('active');
      return;
    }
    const queueLen = (s.queue || []).length;
    const lastMove = (s.recentMoves || [])[0];
    const game = lastMove ? lastMove.target : null;

    $('now-game').textContent = game || 'Idle';
    $('now-sub').textContent = lastMove
      ? `Last route ${(lastMove.ts || '').slice(11,19)} → ${lastMove.kind === 'mix' ? '_mix/' : (lastMove.target || '') + '/'}`
      : 'No recordings yet';
    $('now-dump').textContent = queueLen + ' files';
    $('now-queue').textContent = queueLen;
    $('now-uptime').textContent = fmtUptime(s.startedAt);
    $('now-rec-pill').classList.toggle('active', queueLen > 0);

    // Recent moves
    const moves = (s.recentMoves || []).slice(0, 5);
    const movesEl = $('now-moves');
    if (moves.length === 0) {
      movesEl.innerHTML = '<div class="moves-empty">No recent moves</div>';
    } else {
      movesEl.innerHTML = moves.map(m => {
        const ts = escapeHtml(String(m.ts || '').slice(11, 19));
        const base = escapeHtml(m.basename || '');
        const targetText = m.kind === 'mix' ? '_mix/' : escapeHtml(m.target || '') + '/';
        const targetClass = m.kind === 'mix' ? 'target mix' : 'target';
        return `<div class="moves-row"><span>${ts} · ${base}</span><span class="${targetClass}">${targetText}</span></div>`;
      }).join('');
    }
  }

  // Hook renderNow into the existing pollStatus
  const _origPoll = pollStatus;
  pollStatus = async function() {
    await _origPoll();
    renderNow(window.__sasiStatus);
  };

  // Action handlers
  $('now-open-dump').addEventListener('click', async () => {
    const dump = window.__sasiStatus?.config?.dumpDir;
    if (!dump) return;
    await fetch(API + '/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dump }),
    });
  });
  $('now-restart').addEventListener('click', async () => {
    if (!confirm('Restart the watcher?')) return;
    try { await fetch(API + '/restart', { method: 'POST' }); } catch {}
  });
```

- [ ] **Step 4: Verify in browser**

Reload `dashboard-new.html`. With watcher online:
- Hero card shows last-routed game name + timestamp
- DUMP / QUEUE / UPTIME populated
- "Open Dump Folder" opens File Explorer
- "Restart" prompts for confirmation, then watcher restarts within ~1s
- Recent moves shows up to 5 entries from `/status`

- [ ] **Step 5: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-new.html
git commit -m "feat(dashboard): build Now tab — recording hero + recent moves

Polls /status every 3s, displays current routing target as the hero
game, REC pill when queue > 0, last 5 moves in a mono table.
Open-dump-folder + restart actions wired to existing endpoints."
```

---

## Task 4: OBS tab — bundle export/import + register Lua + auto-backups

**Files:**
- Modify: `Overlay/sasi-overlays/dashboard-new.html`

- [ ] **Step 1: Add CSS for the OBS-tab sections (output box, backup row)**

Append to `<style>`:

```css
  /* Sections — used in OBS, Recordings, Settings */
  .section { margin-bottom: var(--sp-6); }
  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
  .section-title { font-size: 9px; letter-spacing: 0.18em; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
  .section-hint { color: var(--text-muted); font-size: var(--text-small); margin-bottom: var(--sp-3); line-height: 1.6; }

  /* Output box for long-running script results */
  .output-box {
    background: var(--bg-page);
    border: 1px solid var(--bg-divider);
    border-radius: var(--r-button);
    padding: var(--sp-3);
    font-family: var(--font-mono); font-size: var(--text-mono);
    color: var(--text-secondary);
    white-space: pre-wrap;
    max-height: 320px; overflow: auto;
    display: none;
  }
  .output-box.show { display: block; }
  .output-box.err { color: var(--accent-rec); }
  .output-box.ok { color: var(--accent-online); }

  /* Backup list rows */
  .backup-list { display: flex; flex-direction: column; gap: var(--sp-1); }
  .backup-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--sp-3);
    align-items: center;
    padding: 10px 12px;
    background: var(--bg-page);
    border: 1px solid var(--bg-divider);
    border-radius: var(--r-button);
    font-size: var(--text-small);
  }
  .backup-name { color: var(--text-primary); font-family: var(--font-mono); font-size: var(--text-mono); }
  .backup-meta { color: var(--text-muted); font-size: 10px; margin-top: 2px; }
  .backup-empty { color: var(--text-muted); padding: var(--sp-3); text-align: center; }

  .row { display: flex; gap: var(--sp-2); }
```

- [ ] **Step 2: Replace the OBS panel placeholder**

Replace:

```html
    <section class="panel" data-panel="obs">
      <div class="page-head">
        <div class="page-eyebrow">Studio</div>
        <div class="page-title">OBS</div>
      </div>
      <p class="t-small">OBS content goes here in Task 4.</p>
    </section>
```

with:

```html
    <section class="panel" data-panel="obs">
      <div class="page-head">
        <div class="page-eyebrow">Studio</div>
        <div class="page-title">OBS</div>
      </div>

      <div class="section">
        <div class="section-title">Bundle</div>
        <div class="section-hint"><strong>Close OBS</strong> before either operation — it locks browser-source state.</div>
        <div class="row" style="margin-bottom: var(--sp-3)">
          <button class="btn btn-secondary" id="obs-export" style="flex:1">Export Bundle</button>
          <button class="btn btn-secondary" id="obs-import" style="flex:1">Import Bundle</button>
        </div>
        <div class="row" style="margin-bottom: var(--sp-3); align-items: center">
          <button class="btn btn-secondary" id="obs-register-lua">Register Lua in OBS</button>
          <span class="t-small" style="color: var(--text-muted)">Wires game-tracker.lua into every scene collection. Re-run after creating a new collection.</span>
        </div>
        <div class="output-box" id="obs-output"></div>
      </div>

      <div class="section">
        <div class="section-head">
          <div class="section-title">Auto-backups</div>
          <button class="btn btn-secondary" id="obs-refresh-backups" style="font-size: 10px; padding: 6px 12px">Refresh</button>
        </div>
        <div class="section-hint">Each Import auto-saves your current OBS state here first. Restore to undo a previous import.</div>
        <div class="backup-list" id="obs-backups">
          <div class="backup-empty">Loading...</div>
        </div>
      </div>
    </section>
```

- [ ] **Step 3: Add the OBS-tab JavaScript**

Append to `<script>`:

```js
  // === OBS tab ===
  const obsOutput = $('obs-output');
  function setObsOutput(text, kind) {
    obsOutput.classList.remove('err', 'ok');
    if (kind) obsOutput.classList.add(kind);
    obsOutput.textContent = text;
    obsOutput.classList.add('show');
  }
  async function pickFolder(kind) {
    const r = await fetch(API + '/pick-folder?kind=' + kind, { method: 'POST' });
    const j = await r.json();
    return j.cancelled ? null : j.path;
  }
  $('obs-export').addEventListener('click', async () => {
    const out = await pickFolder('output');
    if (!out) return;
    setObsOutput('Exporting bundle to ' + out + '...', null);
    try {
      const r = await fetch(API + '/export-obs-bundle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputDir: out }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) setObsOutput(j.output || j.error || 'Export failed', 'err');
      else { setObsOutput(j.output || 'Done.', 'ok'); refreshBackups(); }
    } catch (e) { setObsOutput('Export failed: ' + e.message, 'err'); }
  });
  $('obs-import').addEventListener('click', async () => {
    const bundle = await pickFolder('bundle');
    if (!bundle) return;
    setObsOutput('Importing bundle from ' + bundle + '...', null);
    try {
      const r = await fetch(API + '/import-obs-bundle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundlePath: bundle }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) setObsOutput(j.output || j.error || 'Import failed', 'err');
      else { setObsOutput(j.output || 'Done.', 'ok'); refreshBackups(); }
    } catch (e) { setObsOutput('Import failed: ' + e.message, 'err'); }
  });
  $('obs-register-lua').addEventListener('click', async () => {
    setObsOutput('Registering game-tracker.lua...', null);
    try {
      const r = await fetch(API + '/register-lua', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) setObsOutput(j.output || j.error || 'Register failed', 'err');
      else setObsOutput(j.output || 'Done.', 'ok');
    } catch (e) { setObsOutput('Register failed: ' + e.message, 'err'); }
  });

  function fmtBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  async function refreshBackups() {
    const target = $('obs-backups');
    try {
      const r = await fetch(API + '/list-obs-backups');
      const j = await r.json();
      const backups = j.backups || [];
      if (backups.length === 0) {
        target.innerHTML = '<div class="backup-empty">No auto-backups yet. They appear after each Import.</div>';
        return;
      }
      target.innerHTML = backups.map(b => {
        const ts = escapeHtml(String(b.modified || '').replace('T', ' ').replace(/\..+/, ''));
        const safeName = escapeHtml(b.name || '');
        return `<div class="backup-row">
          <div>
            <div class="backup-name">${safeName}</div>
            <div class="backup-meta">${ts} · ${b.fileCount || 0} files · ${escapeHtml(fmtBytes(b.sizeBytes))}</div>
          </div>
          <button class="btn btn-secondary" data-restore="${safeName}" style="font-size: 10px; padding: 6px 12px">Restore</button>
          <button class="btn btn-destructive" data-recycle="${safeName}" style="font-size: 10px; padding: 6px 12px">Delete</button>
        </div>`;
      }).join('');
      target.querySelectorAll('[data-restore]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.restore;
          if (!confirm('Restore from ' + name + '?\n\nYour current OBS state will be saved as a new pre-restore backup first.')) return;
          setObsOutput('Restoring from ' + name + '...', null);
          try {
            const r = await fetch(API + '/restore-obs-backup', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            const j = await r.json();
            if (!r.ok) setObsOutput('Restore failed: ' + (j.error || 'unknown'), 'err');
            else { setObsOutput('Restored. Safety backup: ' + j.safetyBackup, 'ok'); refreshBackups(); }
          } catch (e) { setObsOutput('Restore failed: ' + e.message, 'err'); }
        });
      });
      target.querySelectorAll('[data-recycle]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.recycle;
          if (!confirm('Send ' + name + ' to the Recycle Bin?')) return;
          try {
            const r = await fetch(API + '/delete-obs-backup', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            const j = await r.json();
            if (!r.ok) setObsOutput('Delete failed: ' + (j.error || 'unknown'), 'err');
            else refreshBackups();
          } catch (e) { setObsOutput('Delete failed: ' + e.message, 'err'); }
        });
      });
    } catch (e) {
      target.innerHTML = `<div class="backup-empty">Failed to load: ${escapeHtml(e.message)}</div>`;
    }
  }
  $('obs-refresh-backups').addEventListener('click', refreshBackups);
  refreshBackups();
```

- [ ] **Step 4: Verify in browser**

Open dashboard-new.html, click OBS tab. Verify:
- Three buttons: Export, Import, Register Lua. Each opens a file picker (Export/Import) or runs immediately (Register Lua)
- Auto-backups list loads (or shows "No auto-backups yet")
- Restore + Delete actions on each backup work
- Output box appears below buttons after any action runs

- [ ] **Step 5: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-new.html
git commit -m "feat(dashboard): build OBS tab — bundle ops + register-lua + backups

Migrates existing /export-obs-bundle, /import-obs-bundle, /register-lua,
/list-obs-backups, /restore-obs-backup, /delete-obs-backup endpoints
into the new tab structure. No API changes."
```

---

## Task 5: Recordings tab — per-game folders + mix splitter

**Files:**
- Modify: `Overlay/sasi-overlays/dashboard-new.html`

- [ ] **Step 1: Add CSS for the per-game accordion + file list + mix list**

Append to `<style>`:

```css
  /* Per-game accordion */
  .game-card {
    background: var(--bg-card);
    border: 1px solid var(--bg-divider);
    border-radius: var(--r-card);
    margin-bottom: var(--sp-2);
    overflow: hidden;
  }
  .game-head {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-3) var(--sp-4);
    cursor: pointer;
    user-select: none;
    transition: background var(--t-fast);
  }
  .game-head:hover { background: rgba(255,255,255,0.02); }
  .game-name { color: var(--text-primary); font-weight: 600; font-size: var(--text-body); }
  .game-meta { color: var(--text-muted); font-size: 10px; font-family: var(--font-mono); }
  .game-caret { color: var(--text-muted); transition: transform var(--t-fast); font-size: 10px; }
  .game-card.open .game-caret { transform: rotate(90deg); }

  .game-files { display: none; padding: 0 var(--sp-4) var(--sp-3); }
  .game-card.open .game-files { display: block; }
  .file-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--sp-3);
    align-items: center;
    padding: 6px 0;
    border-top: 1px solid var(--bg-divider);
    font-family: var(--font-mono); font-size: var(--text-mono);
    color: var(--text-secondary);
  }
  .file-row .name { color: var(--text-primary); }
  .file-row .size { color: var(--text-muted); font-size: 10px; }
  .file-recycle { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px 6px; font-size: 11px; }
  .file-recycle:hover { color: var(--accent-rec); }

  /* Mix list rows */
  .mix-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: var(--sp-2);
    align-items: center;
    padding: var(--sp-3);
    background: var(--bg-card);
    border: 1px solid var(--bg-divider);
    border-radius: var(--r-card);
    margin-bottom: var(--sp-2);
  }
  .mix-name { color: var(--text-primary); font-family: var(--font-mono); font-size: var(--text-mono); }
  .mix-meta { color: var(--text-muted); font-size: 10px; margin-top: 2px; }
  .mix-status {
    font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
    padding: 3px 6px; border-radius: var(--r-chip);
  }
  .mix-status.split { background: rgba(0,255,133,0.1); color: var(--accent-online); }
  .mix-status.unsplit { background: rgba(255,176,32,0.1); color: var(--accent-warn); }
  .mix-status.in-progress { background: rgba(255,255,255,0.05); color: var(--text-secondary); }
```

- [ ] **Step 2: Replace the Recordings panel placeholder**

Replace:

```html
    <section class="panel" data-panel="recordings">
      <div class="page-head">
        <div class="page-eyebrow">Library</div>
        <div class="page-title">Recordings</div>
      </div>
      <p class="t-small">Recordings content goes here in Task 5.</p>
    </section>
```

with:

```html
    <section class="panel" data-panel="recordings">
      <div class="page-head">
        <div class="page-eyebrow">Library</div>
        <div class="page-title">Recordings</div>
      </div>

      <div class="section">
        <div class="section-head">
          <div class="section-title">By game</div>
          <button class="btn btn-secondary" id="rec-refresh" style="font-size: 10px; padding: 6px 12px">Refresh</button>
        </div>
        <div id="rec-games"><div class="backup-empty">Loading...</div></div>
      </div>

      <div class="section">
        <div class="section-title">Mix recordings</div>
        <div class="section-hint">Multi-game sessions land here. Split into per-game segments via ffmpeg — original is preserved until you delete it.</div>
        <div id="rec-mix"><div class="backup-empty">Loading...</div></div>
      </div>
    </section>
```

- [ ] **Step 3: Add Recordings-tab JavaScript**

Append to `<script>`:

```js
  // === Recordings tab ===
  async function refreshRecordings() {
    const target = $('rec-games');
    try {
      const r = await fetch(API + '/list-recordings');
      const j = await r.json();
      const games = j.games || [];
      if (games.length === 0) {
        target.innerHTML = '<div class="backup-empty">No recordings yet.</div>';
        return;
      }
      target.innerHTML = games.map(g => {
        const safeName = escapeHtml(g.name);
        return `<div class="game-card" data-game="${safeName}">
          <div class="game-head">
            <div>
              <div class="game-name">${safeName}</div>
              <div class="game-meta">${g.fileCount} files · ${escapeHtml(fmtBytes(g.totalSize))}</div>
            </div>
            <div class="game-caret">▶</div>
          </div>
          <div class="game-files">
            ${(g.files || []).map(f => `
              <div class="file-row">
                <span class="name">${escapeHtml(f.name)}</span>
                <span class="size">${escapeHtml(fmtBytes(f.size))}</span>
                <button class="file-recycle" data-recycle="${escapeHtml(f.path)}" title="Recycle">🗑</button>
              </div>
            `).join('')}
          </div>
        </div>`;
      }).join('');
      target.querySelectorAll('.game-head').forEach(h => {
        h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
      });
      target.querySelectorAll('[data-recycle]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Send to Recycle Bin?\n' + btn.dataset.recycle)) return;
          await fetch(API + '/recycle-file', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: btn.dataset.recycle }),
          });
          refreshRecordings();
        });
      });
    } catch (e) {
      target.innerHTML = `<div class="backup-empty">Failed to load: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function refreshMix() {
    const target = $('rec-mix');
    try {
      const r = await fetch(API + '/list-mix');
      const j = await r.json();
      const files = j.files || [];
      if (files.length === 0) {
        target.innerHTML = '<div class="backup-empty">No mix recordings.</div>';
        return;
      }
      target.innerHTML = files.map(f => {
        const safeBase = escapeHtml(f.basename);
        const dur = Math.round(f.duration_sec || 0);
        const mins = Math.floor(dur / 60);
        const secs = dur % 60;
        const games = (f.games || []).map(escapeHtml).join(', ');
        let statusBadge;
        if (f.in_progress) statusBadge = '<span class="mix-status in-progress">SPLITTING</span>';
        else if (f.split) statusBadge = '<span class="mix-status split">SPLIT</span>';
        else statusBadge = '<span class="mix-status unsplit">UNSPLIT</span>';
        return `<div class="mix-row">
          <div>
            <div class="mix-name">${safeBase}</div>
            <div class="mix-meta">${mins}m ${secs}s · ${games || '—'} · ${escapeHtml(fmtBytes(f.size_bytes))}</div>
          </div>
          ${statusBadge}
          <button class="btn btn-secondary" data-split="${safeBase}" style="font-size: 10px; padding: 6px 12px" ${f.split || f.in_progress ? 'disabled' : ''}>Split</button>
          <button class="btn btn-destructive" data-delmix="${safeBase}" style="font-size: 10px; padding: 6px 12px" ${f.split ? '' : 'disabled'}>Delete</button>
        </div>`;
      }).join('');
      target.querySelectorAll('[data-split]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (btn.disabled) return;
          btn.disabled = true; btn.textContent = '...';
          try {
            const r = await fetch(API + '/split-mix', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ basename: btn.dataset.split }),
            });
            const j = await r.json();
            if (!r.ok) alert('Split failed: ' + (j.error || 'unknown'));
          } catch (e) { alert('Split failed: ' + e.message); }
          refreshMix();
        });
      });
      target.querySelectorAll('[data-delmix]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (btn.disabled) return;
          if (!confirm('Send original mix file to Recycle Bin?')) return;
          await fetch(API + '/delete-mix', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ basename: btn.dataset.delmix }),
          });
          refreshMix();
        });
      });
    } catch (e) {
      target.innerHTML = `<div class="backup-empty">Failed to load: ${escapeHtml(e.message)}</div>`;
    }
  }

  $('rec-refresh').addEventListener('click', () => { refreshRecordings(); refreshMix(); });
  refreshRecordings();
  refreshMix();
  setInterval(refreshMix, 8000); // mix list updates faster — splits resolve mid-session
```

- [ ] **Step 4: Verify in browser**

Click Recordings tab. Verify:
- Per-game accordion shows for each game folder under targetRoot
- Click a game header → expands to file list
- Recycle button per file (with confirm prompt)
- Mix section: lists `_mix/MKV/*.mkv`, with SPLIT/UNSPLIT/SPLITTING status pill, Split + Delete buttons enabled correctly

- [ ] **Step 5: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-new.html
git commit -m "feat(dashboard): build Recordings tab — per-game accordion + mix list

Reuses /list-recordings, /list-mix, /recycle-file, /split-mix,
/delete-mix endpoints. Accordion collapsed by default; status badge
(SPLIT / UNSPLIT / SPLITTING) on each mix file."
```

---

## Task 6: Settings tab — paths, games editor, danger zone

**Files:**
- Modify: `Overlay/sasi-overlays/dashboard-new.html`

- [ ] **Step 1: Add CSS for form fields + the danger zone**

Append to `<style>`:

```css
  /* Forms */
  .field { margin-bottom: var(--sp-3); }
  .field label { display: block; font-size: 10px; font-weight: 600; letter-spacing: 0.12em; color: var(--text-muted); margin-bottom: var(--sp-1); text-transform: uppercase; }
  .field input, .field textarea {
    width: 100%; padding: 10px 12px;
    background: var(--bg-page);
    border: 1px solid var(--bg-divider);
    border-radius: var(--r-button);
    color: var(--text-primary);
    font-family: inherit; font-size: var(--text-body);
    transition: border-color var(--t-fast);
  }
  .field input:focus, .field textarea:focus { outline: none; border-color: var(--accent-online); }
  .field textarea { font-family: var(--font-mono); font-size: var(--text-mono); min-height: 200px; resize: vertical; }
  .field-hint { color: var(--text-muted); font-size: 10px; margin-top: var(--sp-1); }
  .field-row { display: flex; gap: var(--sp-2); align-items: stretch; }
  .field-row .field { flex: 1; }
  .field-row input { flex: 1; }

  /* Danger zone */
  .danger-zone {
    background: rgba(255,52,52,0.04);
    border: 1px solid rgba(255,52,52,0.25);
    border-radius: var(--r-card);
    padding: var(--sp-4);
  }
  .danger-zone .section-title { color: var(--accent-rec); }
```

- [ ] **Step 2: Replace the Settings panel placeholder**

Replace:

```html
    <section class="panel" data-panel="settings">
      <div class="page-head">
        <div class="page-eyebrow">System</div>
        <div class="page-title">Settings</div>
      </div>
      <p class="t-small">Settings content goes here in Task 6.</p>
    </section>
```

with:

```html
    <section class="panel" data-panel="settings">
      <div class="page-head">
        <div class="page-eyebrow">System</div>
        <div class="page-title">Settings</div>
      </div>

      <div class="section">
        <div class="section-title">Folders</div>
        <div class="field">
          <label>Dump folder</label>
          <div class="field-row">
            <input type="text" id="cfg-dump" placeholder="C:\Users\…\Videos\_dump" readonly>
            <button class="btn btn-secondary" id="cfg-dump-pick">Pick</button>
          </div>
          <div class="field-hint">OBS writes recordings here. The watcher moves them out into per-game folders under the target root.</div>
        </div>
        <div class="field">
          <label>Target root</label>
          <div class="field-row">
            <input type="text" id="cfg-target" placeholder="C:\Users\…\Videos" readonly>
            <button class="btn btn-secondary" id="cfg-target-pick">Pick</button>
          </div>
          <div class="field-hint">Per-game folders (Valorant/, GTA 5/, _mix/) get created here.</div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" id="cfg-save">Save</button>
          <span class="t-small" id="cfg-status" style="color: var(--text-muted); align-self: center"></span>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <div class="section-title">Games</div>
          <button class="btn btn-secondary" id="games-save" style="font-size: 10px; padding: 6px 12px">Save</button>
        </div>
        <div class="section-hint">Maps OBS Game Capture exe names → per-game folder name. Edit JSON directly. Watcher hot-reloads on save.</div>
        <div class="field">
          <textarea id="games-text" spellcheck="false"></textarea>
          <div class="field-hint" id="games-status"></div>
        </div>
      </div>

      <div class="section">
        <div class="danger-zone">
          <div class="section-title">Danger zone</div>
          <div class="section-hint">Stop / restart the watcher, or remove auto-start entirely.</div>
          <div class="row">
            <button class="btn btn-secondary" id="cfg-restart">Restart</button>
            <button class="btn btn-secondary" id="cfg-stop">Stop</button>
            <button class="btn btn-destructive" id="cfg-uninstall">Uninstall</button>
          </div>
        </div>
      </div>
    </section>
```

- [ ] **Step 3: Add Settings-tab JavaScript**

Append to `<script>`:

```js
  // === Settings tab ===
  function setCfgStatus(text, kind) {
    const el = $('cfg-status');
    el.textContent = text;
    el.style.color = kind === 'err' ? 'var(--accent-rec)' : kind === 'ok' ? 'var(--accent-online)' : 'var(--text-muted)';
  }
  // Populate paths from poll results
  function renderSettings(s) {
    if (!s) return;
    $('cfg-dump').value = s.config?.dumpDir || '';
    $('cfg-target').value = s.config?.targetRoot || '';
  }
  // Hook into poll
  const _origPoll2 = pollStatus;
  pollStatus = async function() {
    await _origPoll2();
    renderSettings(window.__sasiStatus);
  };

  $('cfg-dump-pick').addEventListener('click', async () => {
    const p = await pickFolder('dump');
    if (p) $('cfg-dump').value = p;
  });
  $('cfg-target-pick').addEventListener('click', async () => {
    const p = await pickFolder('target');
    if (p) $('cfg-target').value = p;
  });
  $('cfg-save').addEventListener('click', async () => {
    const dump = $('cfg-dump').value.trim();
    const target = $('cfg-target').value.trim();
    if (!dump || !target) { setCfgStatus('Both folders required', 'err'); return; }
    setCfgStatus('Saving...', null);
    try {
      const r = await fetch(API + '/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dumpDir: dump, targetRoot: target }),
      });
      const j = await r.json();
      if (!r.ok) { setCfgStatus(j.error || 'Save failed', 'err'); return; }
      setCfgStatus('Saved. Restarting watcher to apply...', 'ok');
      await fetch(API + '/restart', { method: 'POST' });
    } catch (e) { setCfgStatus('Save failed: ' + e.message, 'err'); }
  });

  // Games editor
  async function loadGames() {
    try {
      const r = await fetch(API + '/games');
      $('games-text').value = await r.text();
      $('games-status').textContent = '';
    } catch (e) {
      $('games-status').textContent = 'Failed to load: ' + e.message;
    }
  }
  $('games-save').addEventListener('click', async () => {
    let parsed;
    try { parsed = JSON.parse($('games-text').value); }
    catch (e) { $('games-status').textContent = 'Invalid JSON: ' + e.message; $('games-status').style.color = 'var(--accent-rec)'; return; }
    try {
      const r = await fetch(API + '/games', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (!r.ok) throw new Error('http ' + r.status);
      $('games-status').textContent = 'Saved.';
      $('games-status').style.color = 'var(--accent-online)';
    } catch (e) {
      $('games-status').textContent = 'Save failed: ' + e.message;
      $('games-status').style.color = 'var(--accent-rec)';
    }
  });
  loadGames();

  // Danger zone
  $('cfg-restart').addEventListener('click', async () => {
    if (!confirm('Restart the watcher?')) return;
    try { await fetch(API + '/restart', { method: 'POST' }); } catch {}
  });
  $('cfg-stop').addEventListener('click', async () => {
    if (!confirm('Stop the watcher? It will not auto-restart until you launch it again.')) return;
    try { await fetch(API + '/stop', { method: 'POST' }); } catch {}
  });
  $('cfg-uninstall').addEventListener('click', async () => {
    if (!confirm('Remove auto-start entirely? Files stay; only the Windows login auto-start is removed.')) return;
    try {
      const r = await fetch(API + '/uninstall', { method: 'POST' });
      if (r.ok) alert('Uninstalled. The watcher will not auto-start on next login.');
    } catch (e) { alert('Uninstall failed: ' + e.message); }
  });
```

- [ ] **Step 4: Verify in browser**

Click Settings tab. Verify:
- Dump folder + Target root populated from current config
- Pick buttons open folder dialog
- Save button sends config + triggers watcher restart
- Games editor shows current games.json text; Save validates JSON before sending
- Danger-zone buttons each prompt for confirmation

- [ ] **Step 5: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-new.html
git commit -m "feat(dashboard): build Settings tab — paths, games editor, danger zone

Reuses /config (PUT), /games (PUT), /pick-folder, /restart, /stop,
/uninstall endpoints. Games editor validates JSON client-side before
sending. Danger-zone actions all behind confirm dialogs."
```

---

## Task 7: Overlays + Keys placeholder tabs

**Files:**
- Modify: `Overlay/sasi-overlays/dashboard-new.html`

- [ ] **Step 1: Add CSS for the placeholder card**

Append to `<style>`:

```css
  /* Placeholder card for upcoming features */
  .placeholder-card {
    background: var(--bg-card);
    border: 1px dashed var(--bg-border);
    border-radius: var(--r-card);
    padding: var(--sp-7);
    text-align: center;
  }
  .placeholder-icon { font-size: 32px; margin-bottom: var(--sp-3); opacity: 0.5; }
  .placeholder-title { font-size: var(--text-heading); font-weight: 600; margin-bottom: var(--sp-2); }
  .placeholder-desc { color: var(--text-secondary); max-width: 480px; margin: 0 auto var(--sp-4); line-height: 1.6; }
  .placeholder-list { text-align: left; max-width: 320px; margin: 0 auto; color: var(--text-muted); font-size: var(--text-small); }
  .placeholder-list li { padding: 4px 0; border-bottom: 1px solid var(--bg-divider); list-style: none; }
  .placeholder-list li:last-child { border-bottom: none; }
  .placeholder-list li::before { content: '·  '; color: var(--text-muted); }
```

- [ ] **Step 2: Replace the Overlays panel placeholder**

Replace:

```html
    <section class="panel" data-panel="overlays">
      <div class="page-head">
        <div class="page-eyebrow">Stream</div>
        <div class="page-title">Overlays</div>
      </div>
      <p class="t-small">Overlays placeholder goes here in Task 7.</p>
    </section>
```

with:

```html
    <section class="panel" data-panel="overlays">
      <div class="page-head">
        <div class="page-eyebrow">Stream</div>
        <div class="page-title">Overlays</div>
      </div>
      <div class="placeholder-card">
        <div class="placeholder-title">Live overlay editor — coming soon</div>
        <div class="placeholder-desc">Click any overlay to preview it as it'll look in OBS, then edit screen-specific content (text, animation, timer, image swap). Theme is locked — colors and fonts come from the design system.</div>
        <ul class="placeholder-list">
          <li>Starting Soon</li>
          <li>Be Right Back</li>
          <li>Ending Screen</li>
          <li>Lower Thirds</li>
        </ul>
      </div>
    </section>
```

- [ ] **Step 3: Replace the Keys panel placeholder**

Replace:

```html
    <section class="panel" data-panel="keys">
      <div class="page-head">
        <div class="page-eyebrow">Stream</div>
        <div class="page-title">Keys</div>
      </div>
      <p class="t-small">Keys placeholder goes here in Task 7.</p>
    </section>
```

with:

```html
    <section class="panel" data-panel="keys">
      <div class="page-head">
        <div class="page-eyebrow">Stream</div>
        <div class="page-title">Keys</div>
      </div>
      <div class="placeholder-card">
        <div class="placeholder-title">API key vault — coming soon</div>
        <div class="placeholder-desc">Stream keys and tokens will be encrypted via Windows DPAPI — only your user account can decrypt them. Push-to-OBS button writes the key directly into your stream profile.</div>
        <ul class="placeholder-list">
          <li>Twitch stream key</li>
          <li>YouTube stream key</li>
          <li>StreamElements / StreamLabs tokens</li>
          <li>RTMP custom-server credentials</li>
        </ul>
      </div>
    </section>
```

- [ ] **Step 4: Verify in browser**

Click Overlays tab → see "Live overlay editor — coming soon" card with the bullet list. Click Keys tab → see "API key vault — coming soon" card.

- [ ] **Step 5: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-new.html
git commit -m "feat(dashboard): add Overlays + Keys placeholder tabs

Both tabs render a single 'coming soon' card with a roadmap bullet
list. Real implementations land in separate specs."
```

---

## Task 8: Acceptance walkthrough

**Files:** none modified — verification only

- [ ] **Step 1: Run the existing test suite to confirm no Node-side regressions**

```bash
cd Overlay/clip-prep && npm test
```

Expected: 26 tests pass.

- [ ] **Step 2: Open dashboard-new.html and walk every acceptance criterion from the spec**

Open `file:///e:/Code/stream-recording/Overlay/sasi-overlays/dashboard-new.html`. Confirm each item from the spec's Acceptance Criteria:

1. Sidebar renders with 6 tabs in order: Now, Overlays, Recordings, OBS, Keys, Settings. Active tab has white left border + bg tint.
2. Window title is "Sasi Studio". Sidebar brand text is "Sasi Studio".
3. Hero card on Now tab shows green dot when watcher online, red when offline (test by stopping watcher mid-session).
4. REC pill appears only when `state.queue.length > 0` (test by dropping a file in the dump folder).
5. Recordings tab: every game folder under targetRoot appears as an accordion. OBS tab: bundle export/import works. Settings tab: dump/target paths editable.
6. View source — confirm no `linear-gradient` (except the brand mark), no `backdrop-filter`, no `border-radius` > 8px outside chrome, no `#3b82f6` blue, no `box-shadow` outside the green dot.
7. Disable network (DevTools → Offline) and reload. Inter/Mono fall back to Segoe UI / Consolas without layout shift.
8. (Already verified by Step 1.)
9. Stop watcher — sidebar shows red "Offline". Start watcher — flips to green "Online · Xm" within 3s.
10. View source — confirm `<link rel="stylesheet" href="tokens.css">` is present and tokens.css contains all listed tokens.

If any item fails, fix in the relevant task and re-verify.

- [ ] **Step 3: Commit (if any fixes were applied in step 2)**

If fixes were needed:

```bash
git add Overlay/sasi-overlays/dashboard-new.html Overlay/sasi-overlays/tokens.css
git commit -m "fix(dashboard): acceptance-walkthrough adjustments"
```

---

## Task 9: Swap dashboard.html → new

**Files:**
- Rename: `Overlay/sasi-overlays/dashboard.html` → `Overlay/sasi-overlays/dashboard-old.html`
- Rename: `Overlay/sasi-overlays/dashboard-new.html` → `Overlay/sasi-overlays/dashboard.html`

- [ ] **Step 1: Rename the old dashboard out of the way**

```bash
git mv Overlay/sasi-overlays/dashboard.html Overlay/sasi-overlays/dashboard-old.html
```

- [ ] **Step 2: Rename the new dashboard into place**

```bash
git mv Overlay/sasi-overlays/dashboard-new.html Overlay/sasi-overlays/dashboard.html
```

- [ ] **Step 3: Verify the install dir copy step in install.bat still finds dashboard.html**

Read `Overlay/clip-prep/install.bat` lines 80-95 and confirm it references `dashboard.html` (not `dashboard-new.html`). Read `Overlay/clip-prep/bootstrap.bat` lines 130-140 — same check.

Expected: both reference `dashboard.html` only. Nothing to change.

- [ ] **Step 4: Open the swapped file in the browser to confirm it loads as the live dashboard**

Open `file:///e:/Code/stream-recording/Overlay/sasi-overlays/dashboard.html`. Confirm: shows the new Sasi Studio UI.

- [ ] **Step 5: Commit the swap**

```bash
git add Overlay/sasi-overlays/dashboard.html Overlay/sasi-overlays/dashboard-old.html
git commit -m "feat(dashboard): swap in Sasi Studio dashboard

Old dashboard preserved as dashboard-old.html for one release as
rollback safety. Delete in next release once the rebuild is proven."
```

---

## Task 10: CLAUDE.md — project UI rules document

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write CLAUDE.md at the repo root**

```markdown
# Sasi Studio (clip-prep) — Project Guide

## What this repo is

Windows-only OBS recording-router and dashboard. The Node service watches OBS's recording dump folder, reads sidecar JSON written by an OBS Lua script, and routes `.mkv`/`.mp4` pairs into per-game folders. The dashboard (single HTML page) talks to the service over `http://127.0.0.1:6789`.

User-facing brand: **Sasi Studio**. Internal package name remains `clip-prep` — do not rename install dirs, registry keys, or repo paths.

## UI rules (load these whenever editing dashboard.html or any overlay HTML)

**Single source of truth:** `Overlay/sasi-overlays/tokens.css`. Always reference token variables (`var(--bg-page)`, `var(--accent-online)`, etc.) — never hard-code colors.

**Locked design tokens:** see `tokens.css`. Summary:
- Surfaces: `#0E1014` page, `#13161D` card, `#1F222A` divider, `#2A2F3A` border
- Text: `#FFFFFF` / `#9DA5B4` / `#5A6273`
- Accents: `#00FF85` online, `#FF3434` REC/destructive, `#FFB020` warn
- Fonts: Inter (UI), JetBrains Mono (paths/timestamps/numbers)

**Banned styles** — refuse to use these even if asked unless the user explicitly overrides:
- Linear/radial gradients (the brand mark in the sidebar is the only exception)
- Glassmorphism / `backdrop-filter`
- Border-radius > 8px (no squircle bubbles)
- Generic blue accent (`#3b82f6` and tailwind blues)
- Purple-pink AI-default palettes
- Drop shadows (the green status dot's glow is the only exception)
- Emoji in chrome (nav, headers, button labels). Emoji allowed in user-generated content.

**Locked overlay rule:** overlay HTML files (Starting Soon, BRB, Ending, lower thirds — coming in future releases) use the same tokens.css. Per-screen edits are limited to text content, animation choice, timer duration, and image swap. Never edit colors, fonts, or layout positions per-screen — that would break brand consistency.

## Code rules

- Watcher service code: `Overlay/clip-prep/`. ESM Node 18+. Vanilla — no TypeScript.
- All HTTP endpoints have a CSRF guard: POST/PUT/DELETE require `X-Clip-Prep: 1` header. The dashboard's fetch wrapper adds this automatically; tests do too.
- All PowerShell child-process calls go through `runPowerShell(script, [args…])` in `src/api.js` — never interpolate user paths into a shell-string command.
- Existing tests live in `Overlay/clip-prep/test/*.test.js`. Run with `npm test` from `Overlay/clip-prep/`.

## Deploying

Live install lives at `%LOCALAPPDATA%\clip-prep\` (path stays `clip-prep` — internal name unchanged). Update by re-running `bootstrap.bat` from the repo or the `irm | iex` one-liner from the README. Do not write directly into the install dir during development.
```

- [ ] **Step 2: Verify the file exists and contains the locked-overlay rule**

```bash
grep -c "Locked overlay rule" CLAUDE.md
```

Expected output: `1`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with locked design tokens + UI rules

Loaded into every Claude Code conversation in this repo. Documents
the design tokens, banned styles, locked overlay rule, code rules,
and deploy flow."
```

---

## Self-review (writer-side, after generating the plan)

**Spec coverage:**
- ✅ tokens.css → Task 1
- ✅ CLAUDE.md → Task 10
- ✅ Sidebar + 6 tabs → Task 2
- ✅ Now tab (status, REC pill, queue heuristic, recent moves) → Task 3
- ✅ Overlays placeholder → Task 7
- ✅ Recordings (per-game accordion + mix) → Task 5
- ✅ OBS (bundle + register-lua + backups) → Task 4
- ✅ Keys placeholder → Task 7
- ✅ Settings (paths + games + danger zone) → Task 6
- ✅ Acceptance walkthrough → Task 8
- ✅ Swap (preserve old as rollback) → Task 9
- ✅ CSRF wrapper preservation → Task 2 (in shell script block)
- ✅ Brand naming (user-facing only, technical surface unchanged) → Tasks 2 + 10

**Placeholder scan:** No "TBD", "TODO", "implement appropriate X". Every code block contains complete code. Every command shows the expected outcome.

**Type / API consistency:**
- `pollStatus` defined in Task 2, extended (not replaced) in Tasks 3 + 6 via the `_origPoll`/`_origPoll2` capture-and-replace pattern. Consistent.
- `escapeHtml`, `fmtBytes`, `pickFolder` defined once and reused. ✓
- All API endpoint paths match what's in `Overlay/clip-prep/src/api.js` (verified against earlier reads).

No issues found.
