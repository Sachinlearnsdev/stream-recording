// ============================================================
//  SASI STUDIO — Live update framework
//  Scenes call registerLiveUpdater(key, fn) at load time.
//  When the dashboard writes to localStorage['sasi_<key>'],
//  the storage event fires here and we call the registered fn.
// ============================================================

(function () {
  const handlers = new Map(); // sasi_key -> [fn, fn, ...]

  // Register a handler for a specific localStorage key (without sasi_ prefix).
  // Multiple handlers can register for the same key.
  window.registerLiveUpdater = function (key, fn) {
    const fullKey = 'sasi_' + key;
    if (!handlers.has(fullKey)) handlers.set(fullKey, []);
    handlers.get(fullKey).push(fn);
  };

  // Apply current localStorage values immediately (so a freshly-loaded scene
  // reflects the dashboard's saved state without waiting for a change event).
  window.applyLiveUpdaters = function () {
    for (const [fullKey, fns] of handlers.entries()) {
      const value = localStorage.getItem(fullKey);
      if (value !== null) {
        for (const fn of fns) {
          try { fn(value); } catch (e) { console.warn('[live-update] handler for ' + fullKey + ' threw:', e); }
        }
      }
    }
  };

  // Internal: dispatch a value to all handlers registered for a key.
  function fireHandlers(key, value) {
    const fns = handlers.get(key);
    if (!fns) return;
    for (const fn of fns) {
      try { fn(value); } catch (err) { console.warn('[live-update] handler for ' + key + ' threw:', err); }
    }
  }

  // Path A: native storage events (fires across same-origin windows on http://).
  window.addEventListener('storage', function (e) {
    if (!e.key) return;
    fireHandlers(e.key, e.newValue);
  });

  // Path B: postMessage from the dashboard. Used because synthetic StorageEvents
  // constructed in the parent realm arrive with null e.key in Chromium, AND
  // because storage events don't fire reliably across file:// iframes. The
  // dashboard's broadcastChange() pushes a message of shape:
  //   { __sasi: true, type: 'sasi-live', key: 'sasi_<name>', newValue: <string> }
  window.addEventListener('message', function (e) {
    const d = e.data;
    if (!d || d.__sasi !== true || d.type !== 'sasi-live') return;
    if (typeof d.key !== 'string') return;
    fireHandlers(d.key, d.newValue);
  });

  // Convenience helpers for common patterns
  window.liveUpdate = {
    text: (selector) => (value) => {
      document.querySelectorAll(selector).forEach(el => { el.textContent = value || ''; });
    },
    cssVar: (varName) => (value) => {
      if (!value) return;
      // 'important' priority so dashboard postMessage palette updates
      // override the server's inject (which also uses !important — see
      // buildPaletteStyleTag in api.js). Without 'important' here, the
      // postMessage path would be silently overridden by the server inject
      // and dashboard live preview would stop reflecting picker changes.
      document.documentElement.style.setProperty(varName, value, 'important');
      // If the value is a 6-digit hex, also emit the `<varName>-rgb` companion
      // as a comma-separated RGB tuple. Theme files use rgba(var(--red-rgb), .55)
      // for semi-transparent palette usage — keeping both vars in sync from a
      // single dashboard picker means changing red updates every red-tinted
      // glow / border / gradient automatically.
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
      if (m) {
        const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
        document.documentElement.style.setProperty(varName + '-rgb', r + ', ' + g + ', ' + b, 'important');
      }
    },
    show: (selector) => (value) => {
      const visible = (value === 'true' || value === true);
      document.querySelectorAll(selector).forEach(el => { el.style.display = visible ? '' : 'none'; });
    },
    attr: (selector, attrName) => (value) => {
      document.querySelectorAll(selector).forEach(el => { el.setAttribute(attrName, value || ''); });
    },
  };

  // Auto-register the standard palette tokens so every scene/component that
  // includes live-update.js gets palette swap for free — no per-file
  // registerLiveUpdater boilerplate. Adding a new palette token below + a
  // matching picker in the dashboard's Common section is the only work
  // needed to expose it to the user.
  const PALETTE_TOKENS = {
    cRed:    '--red',
    cOrange: '--orange',
    cGold:   '--gold',
    cBg:     '--bg',
    cDim:    '--dim',
  };
  for (const key of Object.keys(PALETTE_TOKENS)) {
    window.registerLiveUpdater(key, window.liveUpdate.cssVar(PALETTE_TOKENS[key]));
  }
  // Apply any saved values from localStorage immediately so a freshly-loaded
  // page reflects the dashboard's last palette without waiting for an event.
  window.applyLiveUpdaters();

  // Apply palette from URL query params (?p_red=ffea00&p_orange=58e97c&…).
  // This is how the watcher's /refresh-obs propagates dashboard palette
  // changes into OBS browser sources WITHOUT relying on CEF to re-fetch
  // theme-tokens.css after a navigation. CEF's disk cache for linked CSS
  // outlives most "refresh" gestures, but inline CSS variables set via
  // setProperty() trump anything from a cached stylesheet. So /refresh-obs
  // bakes the current palette into the URL itself; each scene reads the
  // params here on load and overrides --red / --orange / --gold / --bg /
  // --dim (+ their *-rgb companions) directly on <html>. Result: dashboard
  // edit -> /save-palette to disk -> /refresh-obs SetInputSettings with new
  // URL carrying the same palette -> OBS reloads -> palette lands every time.
  try {
    const params = new URLSearchParams(window.location.search);
    const tokenFromParam = { p_red: '--red', p_orange: '--orange', p_gold: '--gold', p_bg: '--bg', p_dim: '--dim' };
    const hexRe = /^[0-9a-fA-F]{6}$/;
    for (const param of Object.keys(tokenFromParam)) {
      const raw = params.get(param);
      if (!raw) continue;
      const cleaned = raw.replace(/^#/, '').trim();
      if (!hexRe.test(cleaned)) continue;
      window.liveUpdate.cssVar(tokenFromParam[param])('#' + cleaned);
    }
  } catch (err) {
    console.warn('[live-update] URL palette params failed:', err);
  }

  console.log('[live-update] framework loaded');
})();
