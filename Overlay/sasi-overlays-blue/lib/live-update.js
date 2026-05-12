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
      if (value) document.documentElement.style.setProperty(varName, value);
    },
    show: (selector) => (value) => {
      const visible = (value === 'true' || value === true);
      document.querySelectorAll(selector).forEach(el => { el.style.display = visible ? '' : 'none'; });
    },
    attr: (selector, attrName) => (value) => {
      document.querySelectorAll(selector).forEach(el => { el.setAttribute(attrName, value || ''); });
    },
  };

  console.log('[live-update] framework loaded');
})();
