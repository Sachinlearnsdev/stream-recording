// ============================================================
//  SASI STUDIO — secrets stub loader (theme-local)
//
//  This file is a STUB. The real keys live at the install dir's
//  parent of the active theme:  Overlay/sasi-secrets.js
//
//  Why: a theme is a self-contained folder that can be swapped
//  via rename. Real secrets must NOT move on theme swap (you'd lose
//  them in archived folders). So we load secrets from one level up.
//
//  This stub gets vendored into every theme so scenes/components
//  can keep their plain `<script src="../lib/secrets.js">` tags.
//  Resolution: lib/secrets.js → ../../sasi-secrets.js (parent of theme).
// ============================================================

(function () {
  // synchronous-ish load via XHR so SASI_SECRETS is set before subsequent
  // <script> tags (which expect window.SASI_SECRETS to exist) execute.
  const url = '../../sasi-secrets.js';
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
      // eval in global scope so `window.SASI_SECRETS = {...}` assignment works
      (0, eval)(xhr.responseText);
    } else {
      console.warn('[secrets stub] could not load', url, '(status', xhr.status, ')');
      window.SASI_SECRETS = window.SASI_SECRETS || { activeChannel: '', channels: {}, streamelements: { youtube: { jwt: '' }, twitch: { jwt: '' } } };
    }
  } catch (e) {
    console.warn('[secrets stub] load failed:', e.message);
    window.SASI_SECRETS = window.SASI_SECRETS || { activeChannel: '', channels: {}, streamelements: { youtube: { jwt: '' }, twitch: { jwt: '' } } };
  }
})();
