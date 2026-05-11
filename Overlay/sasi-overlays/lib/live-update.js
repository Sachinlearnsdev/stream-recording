// ============================================================
//  SASI STUDIO - live-update stub (v2.1)
//
//  The dashboard's in-page live editor was removed because it never
//  propagated to OBS (separate browser, separate localStorage). Scenes
//  still call registerLiveUpdater() / applyLiveUpdaters() from their
//  initialization scripts, so this file provides no-op stubs so they
//  don't error.
//
//  To change overlay text now: edit sasi-overlays/lib/config.js (or the
//  scene HTML directly) in your code editor, then refresh the OBS
//  Browser Source.
// ============================================================

(function () {
  // No-op: scenes register handlers but nothing fires them anymore.
  window.registerLiveUpdater = function (_key, _fn) {};

  // No-op: previously read sasi_<key> values from localStorage and applied
  // them. Now scenes just use SASI_CONFIG defaults directly from config.js.
  window.applyLiveUpdaters = function () {};

  // Convenience helpers kept as identity stubs so any scene that grabs
  // them as variables (e.g. `const t = liveUpdate.text('#x')`) doesn't
  // crash. They return a function that does nothing.
  window.liveUpdate = {
    text:   (_sel) => (_v) => {},
    cssVar: (_var) => (_v) => {},
    show:   (_sel) => (_v) => {},
    attr:   (_sel, _a) => (_v) => {},
  };
})();
