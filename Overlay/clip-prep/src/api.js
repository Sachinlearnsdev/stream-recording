import express from 'express';
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { splitMixFile } from '../split-mix.js';

const execAsync = promisify(exec);

// Path conversion helpers â€” used in ~30 places to translate between web-style
// (forward slashes, what JSON / browser-facing APIs want) and OS-native (Windows
// backslashes, what Node's fs / path / Windows-CLI consumers want). Node's path
// module accepts both on Windows, so OS-native is mostly cosmetic â€” but it
// matters for shell-style consumers (cmd /c, robocopy, registry strings).
const toOsPath  = (p) => (p == null ? '' : String(p).replace(/\//g, path.sep));
const toWebPath = (p) => (p == null ? '' : String(p).replace(/\\/g, '/'));

// Minimal obs-websocket v5 client used by POST /refresh-obs.
//
// Auth handshake (from the obs-websocket protocol docs):
//   1. Server sends Hello (op=0) with { authentication: { challenge, salt } }
//   2. Client computes:
//        secret       = base64(SHA256(password + salt))
//        authResponse = base64(SHA256(secret + challenge))
//   3. Client sends Identify (op=1) with { authentication: authResponse }
//   4. Server sends Identified (op=2) on success
// Then we issue:
//   GetInputList { inputKind: "browser_source" } -> get every browser source
//   PressInputPropertiesButton { inputName, propertyName: "refreshnocache" }
//     for each — this is what the OBS GUI's "Refresh cache of current page"
//     right-click menu actually triggers.
//
// Relies on Node 21+ native global WebSocket. Throws with a useful `.hint`
// on the common failure modes (port closed, auth wrong) so the dashboard
// can surface concrete next steps.
async function refreshObsBrowserSources({ port = 4455, password = '', log = console, palette = {} } = {}) {
  if (typeof WebSocket !== 'function') {
    const e = new Error('Node global WebSocket not available (need Node 21+).');
    e.hint = 'Upgrade Node — current process lacks native WebSocket.';
    throw e;
  }
  return await new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${port}`;
    let ws;
    try { ws = new WebSocket(url); }
    catch (err) { const e = new Error(`Failed to open ${url}: ${err.message}`); e.code = err.code; reject(e); return; }

    const REFRESHED = [];
    const pending = new Map();        // requestId -> kind
    let inputCount = 0;
    let completed = 0;
    let finalized = false;
    const finalize = (errOrResult) => {
      if (finalized) return; finalized = true;
      try { ws.close(); } catch {}
      if (errOrResult instanceof Error) reject(errOrResult);
      else resolve(errOrResult);
    };
    // 15s overall budget: two-step (about:blank -> real) reload per source
    // plus a 200ms settle delay between the two steps, multiplied by ~13
    // browser sources, lands well under this in practice but the headroom
    // matters when OBS is busy compositing.
    const timer = setTimeout(() => {
      const e = new Error('OBS WebSocket did not complete within 15s.');
      e.hint = 'OBS might be unresponsive — try closing and reopening OBS.';
      finalize(e);
    }, 15000);

    let nextId = 0;
    const send = (op, d) => ws.send(JSON.stringify({ op, d }));

    ws.onerror = () => {
      // ws lib doesn't expose much error detail in the 'error' event payload.
      // ECONNREFUSED surfaces here when port 4455 is closed (OBS off or
      // WebSocket disabled). Caller handler will populate a hint.
      const e = new Error('OBS WebSocket connection failed.');
      e.code = 'ECONNREFUSED';
      e.hint = 'OBS not running, or WebSocket Server is disabled. Open OBS, Tools -> WebSocket Server Settings, enable it, then try again.';
      clearTimeout(timer);
      finalize(e);
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      // op=0 Hello — may include an authentication challenge
      if (msg.op === 0) {
        let authResponse;
        if (msg.d.authentication && msg.d.authentication.challenge) {
          if (!password) {
            const e = new Error('OBS WebSocket requires a password but none configured.');
            e.hint = 'Set config.obsWebSocketPassword to match OBS Tools -> WebSocket Server Settings -> Server Password.';
            clearTimeout(timer); finalize(e); return;
          }
          const { challenge, salt } = msg.d.authentication;
          const secret = crypto.createHash('sha256').update(password + salt).digest('base64');
          authResponse = crypto.createHash('sha256').update(secret + challenge).digest('base64');
        }
        send(1, { rpcVersion: 1, eventSubscriptions: 0, ...(authResponse ? { authentication: authResponse } : {}) });
        return;
      }
      // op=2 Identified — auth ok, ready to issue requests
      if (msg.op === 2) {
        const id = 'list-' + (++nextId);
        pending.set(id, 'list');
        send(6, { requestType: 'GetInputList', requestId: id, requestData: { inputKind: 'browser_source' } });
        return;
      }
      // op=7 RequestResponse
      if (msg.op === 7) {
        const d = msg.d || {};
        const kind = pending.get(d.requestId);
        pending.delete(d.requestId);
        const ok = d.requestStatus && d.requestStatus.result;
        if (kind === 'list') {
          if (!ok) {
            const e = new Error('GetInputList failed: ' + (d.requestStatus?.comment || 'unknown'));
            clearTimeout(timer); finalize(e); return;
          }
          const inputs = (d.responseData && d.responseData.inputs) || [];
          inputCount = inputs.length;
          if (inputCount === 0) {
            clearTimeout(timer);
            finalize({ refreshed: 0, names: [], message: 'No browser_source inputs in OBS.' });
            return;
          }
          // First fetch each input's settings so we can mutate the URL with a
          // cache-bust query and SetInputSettings. PressInputPropertiesButton
          // refreshnocache only reloads the page; CEF caches subresources
          // (theme-tokens.css, lib/*.js) separately and serves the stale ones
          // back, so palette/CSS edits never reach OBS. Changing the URL with
          // a new ?obsBust=<ts> forces CEF to treat the page as a new resource
          // and re-fetch the full subresource tree.
          for (const inp of inputs) {
            const idG = 'getSet-' + (++nextId);
            pending.set(idG, { kind: 'getSet', name: inp.inputName, uuid: inp.inputUuid });
            send(6, {
              requestType: 'GetInputSettings',
              requestId: idG,
              requestData: { inputName: inp.inputName },
            });
          }
          return;
        }
        if (kind && kind.kind === 'getSet') {
          if (!ok) {
            completed++;
            log.warn(`refresh-obs: GetInputSettings ${kind.name} -> ${d.requestStatus?.comment || 'failed'}`);
            if (completed >= inputCount) {
              clearTimeout(timer);
              finalize({ refreshed: REFRESHED.length, attempted: inputCount, names: REFRESHED });
            }
            return;
          }
          const settings = (d.responseData && d.responseData.inputSettings) || {};
          const currentUrl = settings.url || '';
          if (!currentUrl) {
            completed++;
            if (completed >= inputCount) {
              clearTimeout(timer);
              finalize({ refreshed: REFRESHED.length, attempted: inputCount, names: REFRESHED, skipped: 'sources without url' });
            }
            return;
          }
          // Compute the final target URL with a fresh cache-bust.
          // Palette no longer travels through the URL — the watcher's
          // theme-HTML inject middleware splices the current palette
          // into every HTML response, so OBS gets the right colors as
          // long as it re-fetches the page. The obsBust query just
          // forces CEF to treat the page as a new resource and re-fetch.
          const stripped = currentUrl
            .replace(/([?&])obsBust=[^&]*(&|$)/, (_m, pre, post) => post === '&' ? pre : '')
            .replace(/([?&])p_[a-z]+=[^&]*(&|$)/g, (_m, pre, post) => post === '&' ? pre : '')
            .replace(/[?&]$/, '');
          const sep = stripped.includes('?') ? '&' : '?';
          const targetUrl = stripped + sep + 'obsBust=' + Date.now();
          // Two-step reload: blank the URL first, then set the real one.
          // Just changing the URL via SetInputSettings doesn't reliably
          // make OBS re-navigate the CEF page (and PressInputPropertiesButton
          // refreshnocache silently no-ops when called outside the props
          // dialog). Navigating to about:blank tears down CEF's loaded page;
          // navigating to targetUrl on the second step gives CEF nothing to
          // resurrect from cache and forces a fresh fetch of the HTML + all
          // subresources (which the no-store headers on theme-tokens.css
          // guarantee come back fresh).
          const idBlank = 'blank-' + (++nextId);
          pending.set(idBlank, { kind: 'blank', name: kind.name, targetUrl, settings });
          send(6, {
            requestType: 'SetInputSettings',
            requestId: idBlank,
            requestData: {
              inputName: kind.name,
              inputSettings: { ...settings, is_local_file: false, url: 'about:blank' },
              overlay: false,
            },
          });
          return;
        }
        if (kind && kind.kind === 'blank') {
          if (!ok) {
            completed++;
            log.warn(`refresh-obs: SetInputSettings (blank) ${kind.name} -> ${d.requestStatus?.comment || 'failed'}`);
            if (completed >= inputCount) {
              clearTimeout(timer);
              finalize({ refreshed: REFRESHED.length, attempted: inputCount, names: REFRESHED });
            }
            return;
          }
          // Wait for CEF to actually tear down before navigating to the real URL.
          // 200ms is the empirical floor — shorter and OBS sometimes optimizes
          // both SetInputSettings calls into a single Update() with the final URL,
          // skipping the about:blank step.
          setTimeout(() => {
            if (finalized) return;
            const idReal = 'real-' + (++nextId);
            pending.set(idReal, { kind: 'real', name: kind.name });
            send(6, {
              requestType: 'SetInputSettings',
              requestId: idReal,
              requestData: {
                inputName: kind.name,
                inputSettings: { ...kind.settings, is_local_file: false, url: kind.targetUrl },
                overlay: false,
              },
            });
          }, 200);
          return;
        }
        if (kind && kind.kind === 'real') {
          completed++;
          if (ok) REFRESHED.push(kind.name);
          else log.warn(`refresh-obs: SetInputSettings (real) ${kind.name} -> ${d.requestStatus?.comment || 'failed'}`);
          if (completed >= inputCount) {
            clearTimeout(timer);
            finalize({ refreshed: REFRESHED.length, attempted: inputCount, names: REFRESHED });
          }
          return;
        }
        return;
      }
      // op=5 Event — ignore (we subscribed to 0)
    };

    ws.onclose = (ev) => {
      if (!finalized) {
        clearTimeout(timer);
        // 4009 = auth failed in obs-websocket v5
        const e = new Error('OBS WebSocket closed before completing (code ' + ev.code + ').');
        if (ev.code === 4009) {
          e.hint = 'Auth failed. The watcher\'s config.obsWebSocketPassword must match OBS\'s server password. Re-sync them (see config.json + plugin_config/obs-websocket/config.json).';
        } else if (ev.code === 4008) {
          e.hint = 'OBS WebSocket protocol version mismatch — update OBS / the watcher.';
        }
        finalize(e);
      }
    };
  });
}

// Serializer for theme / stinger / channel-switch mutations. These all
// involve atomic-rename operations on disk and can leave the system in a
// broken state if two requests interleave (e.g., double-click on apply-theme
// makes both requests archive the current active in step 1, then the second
// finds no active to swap with in step 2 — net result: no active theme,
// OBS browser sources all 404).
//
// Tasks queue: serialize via a chained Promise. Each caller awaits the
// current `themeOpQueue`, then becomes the new tail. Errors in one task
// don't poison the queue because we always advance after settled.
let themeOpQueue = Promise.resolve();
function withThemeLock(fn) {
  const next = themeOpQueue.then(() => fn(), () => fn());
  themeOpQueue = next.catch(() => {});
  return next;
}

// Run a PowerShell script with an explicit argv. Avoids any shell parsing of
// the path arguments â€” the only correct way to pass user-supplied paths to a
// child process. Returns { code, stdout, stderr }.
function runPowerShell(scriptPath, args = [], { maxBuffer = 32 * 1024 * 1024, log } = {}) {
  return new Promise((resolve) => {
    const argv = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      ...args,
    ];
    if (log) log.info(`spawn powershell ${argv.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`);
    const child = spawn('powershell.exe', argv, { windowsHide: true });
    let out = '';
    let err = '';
    let truncated = false;
    child.stdout.on('data', (d) => {
      if (out.length < maxBuffer) out += d.toString('utf8');
      else truncated = true;
    });
    child.stderr.on('data', (d) => {
      if (err.length < maxBuffer) err += d.toString('utf8');
      else truncated = true;
    });
    child.on('error', (e) => resolve({ code: -1, stdout: out, stderr: (err + '\n' + e.message).trim(), truncated }));
    child.on('exit', (code) => resolve({ code: code ?? -1, stdout: out, stderr: err, truncated }));
  });
}

// Open File Explorer at the given path. Reliable from any process context.
function openInExplorer(targetPath) {
  spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' }).unref();
}

// Spawn the folder-picker PowerShell script with a hidden console window â€”
// the IFileDialog inside uses GetForegroundWindow() as its parent, so it
// appears modal to the user's browser (or whatever they have focused).
// Result is communicated via temp file (more reliable than stdout capture).
function pickFolderViaTempFile(scriptPath, description, log) {
  const tmpFile = path.join(
    os.tmpdir(),
    `clip-prep-pick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`
  );
  const args = [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-OutFile', tmpFile,
    '-Description', description,
  ];
  if (log) log.info(`pick-folder: spawning hidden -> powershell ${args.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`);

  return new Promise((resolve) => {
    let resolved = false;
    const finish = async (val, reason) => {
      if (resolved) return;
      resolved = true;
      if (log) log.info(`pick-folder: finish (${reason}) val="${val ?? '<null>'}"`);
      try { await fs.unlink(tmpFile); } catch {}
      resolve(val);
    };
    let child;
    try {
      child = spawn('powershell.exe', args, {
        stdio: 'ignore',
        windowsHide: true, // no terminal flash â€” dialog uses foreground window as parent
      });
    } catch (err) {
      if (log) log.error(`pick-folder: spawn threw: ${err.message}`);
      return finish(null, 'spawn-error');
    }
    child.on('exit', async (code) => {
      if (log) log.info(`pick-folder: child exited code=${code}`);
      try {
        const text = await fs.readFile(tmpFile, 'utf8');
        finish(text.trim() || null, 'exit-with-file');
      } catch {
        finish(null, 'exit-no-file');
      }
    });
    child.on('error', (err) => {
      if (log) log.error(`pick-folder: child error: ${err.message}`);
      finish(null, 'child-error');
    });
    // 60-second failsafe â€” user might take a moment to find the folder
    setTimeout(() => finish(null, 'timeout-60s'), 60 * 1000);
  });
}

export function createApi({ state, log, config, gamesPath, configPath, installDir, launcherPath, pickFolderScript, logFile }) {
  const app = express();
  app.use(express.json());

  // CORS + CSRF protection.
  //
  // The dashboard is opened from file:// (via the Start Menu shortcut) or from
  // the install dir directly, so the Origin header is "null" for file:// and
  // we can't whitelist a real origin. Instead:
  //   * Echo the requesting origin if it looks like a local dashboard
  //     (file://, http://localhost, http://127.0.0.1) â€” that lets the dashboard
  //     read responses while still blocking arbitrary public web pages from
  //     reading our local data.
  //   * Mutating methods (POST, PUT, DELETE) MUST include the X-Clip-Prep
  //     header. Browsers do not auto-send custom headers cross-origin without
  //     a successful CORS preflight, and our preflight only succeeds for the
  //     local origins above. This blocks the classic "malicious page calls
  //     localhost:6789/uninstall" CSRF.
  function isLocalOrigin(origin) {
    if (!origin || origin === 'null') return true; // file:// renders as null
    try {
      const u = new URL(origin);
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.protocol === 'file:';
    } catch {
      return false;
    }
  }
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isLocalOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || 'null');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Clip-Prep');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    // Require the custom header on state-changing requests.
    const mutating = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE';
    if (mutating && req.headers['x-clip-prep'] !== '1') {
      return res.status(403).json({ error: 'missing X-Clip-Prep header (CSRF guard)' });
    }
    next();
  });

  // Static file serving for the install dir (dashboard.html, tokens.css, the
  // sasi-overlays/ theme tree, sasi-secrets.example.js, etc.).
  //
  // Why: opening dashboard.html via file:// makes every overlay iframe a
  // cross-origin frame in Chromium, which breaks:
  //   - cross-frame DOM access (canvas-capture for HTML stinger auto-record)
  //   - shared localStorage between dashboard + iframes
  //   - some fetch() flows for discovery probes
  // Serving over http://127.0.0.1:6789 makes everything one origin and those
  // problems disappear. The Start-Menu shortcut should open
  // http://127.0.0.1:6789/dashboard.html instead of the file:// path.
  //
  // index:false so /  doesn't accidentally serve a directory listing; the
  // user explicitly hits /dashboard.html. dotfiles:'ignore' so we don't expose
  // .gitignore. We mount AFTER the CSRF middleware on purpose â€” these are
  // GETs only and the static middleware doesn't process mutating methods.
  //
  // BEFORE express.static: theme HTML inject middleware. For every request
  // for sasi-overlays/{scenes,components}/*.html we read the file off disk,
  // splice <style>:root{--red:...;--orange:...;...}</style> right before
  // </head>, and send the modified body. This is the canonical way the
  // dashboard's palette edits reach OBS — inline CSS variables on <html>
  // beat anything CEF has cached from theme-tokens.css. Must be registered
  // BEFORE express.static or the static middleware grabs the request first.

  // ===== Content state hydration (dashboard editor text/toggles -> OBS) =====
  // Mirrors the palette pattern but for the live-update.js localStorage
  // keys (sasi_ss_badge, sasi_brand_name, etc.). Dashboard POSTs each edit
  // to /save-content; we keep it in memory + persist to JSON; the inject
  // middleware emits a <script> that pre-populates localStorage on every
  // theme HTML response so applyLiveUpdaters() picks up the latest values.
  const contentStatePath = path.join(installDir || '', 'content-state.json');
  let _contentState = {};
  try {
    if (existsSync(contentStatePath)) {
      _contentState = JSON.parse(readFileSync(contentStatePath, 'utf8')) || {};
    }
  } catch (err) {
    log.warn(`content-state.json load failed (starting empty): ${err.message}`);
    _contentState = {};
  }
  let _contentSaveTimer = null;
  function persistContentState() {
    if (_contentSaveTimer) clearTimeout(_contentSaveTimer);
    _contentSaveTimer = setTimeout(async () => {
      try {
        await fs.writeFile(contentStatePath, JSON.stringify(_contentState, null, 2), 'utf8');
      } catch (err) {
        log.warn(`content-state.json write failed: ${err.message}`);
      }
    }, 500);
  }
  function buildContentScriptTag(state) {
    if (!state || Object.keys(state).length === 0) return '';
    // Only inject keys that look like our naming convention to avoid
    // accidentally clobbering localStorage set by other code.
    const safe = {};
    for (const [k, v] of Object.entries(state)) {
      if (typeof k !== 'string' || !/^sasi_[a-zA-Z0-9_]+$/.test(k)) continue;
      if (v == null) continue;
      safe[k] = String(v);
    }
    if (Object.keys(safe).length === 0) return '';
    // Safe JSON embed: escape `</` so a value containing "</script>" can't
    // break out of the tag.
    const json = JSON.stringify(safe).replace(/<\//g, '<\\/');
    return `<script id="sasi-content-inject">try{var __s=${json};for(var k in __s){try{localStorage.setItem(k,__s[k]);}catch(e){}}}catch(e){}</script>`;
  }

  let _cachedPalette = null;
  async function readActivePalette() {
    if (_cachedPalette) return _cachedPalette;
    const tokensPath = path.join(installDir || '', 'sasi-overlays', 'lib', 'theme-tokens.css');
    const fallback = { red: '#FF2200', orange: '#FF7700', gold: '#FFD700', bg: '#050005', dim: 'rgba(255, 255, 255, 0.45)' };
    if (!existsSync(tokensPath)) { _cachedPalette = fallback; return fallback; }
    try {
      const text = await fs.readFile(tokensPath, 'utf8');
      const p = { ...fallback };
      for (const name of ['red', 'orange', 'gold', 'bg']) {
        const m = new RegExp('--' + name + '\\s*:\\s*(#[0-9a-fA-F]{6})').exec(text);
        if (m) p[name] = m[1];
      }
      const dm = /--dim\s*:\s*([^;]+);/.exec(text);
      if (dm) p.dim = dm[1].trim();
      _cachedPalette = p;
      return p;
    } catch {
      _cachedPalette = fallback;
      return fallback;
    }
  }
  function invalidatePaletteCache() { _cachedPalette = null; }

  function buildPaletteStyleTag(p) {
    const hexToRgb = (h) => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || '');
      return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : null;
    };
    // !important is critical here. Without it, anything calling
    // documentElement.style.setProperty('--red', X) from JS will win
    // (inline-style specificity beats stylesheet specificity). In OBS,
    // live-update.js's applyLiveUpdaters() can fire AFTER our inject and
    // call setProperty from leftover localStorage values — that's how
    // some elements ended up rendering the old palette while others took
    // the new one. !important forces stylesheet to win unless the JS
    // setProperty call ALSO uses 'important' priority (which we make
    // live-update.js do for the postMessage path so the dashboard's live
    // preview still works).
    const lines = [];
    for (const name of ['red', 'orange', 'gold', 'bg']) {
      if (p[name]) lines.push(`--${name}:${p[name]} !important;`);
    }
    if (p.dim) lines.push(`--dim:${p.dim} !important;`);
    for (const name of ['red', 'orange', 'gold', 'bg']) {
      const rgb = hexToRgb(p[name]);
      if (rgb) lines.push(`--${name}-rgb:${rgb} !important;`);
    }
    return `<style id="sasi-palette-inject">:root{${lines.join('')}}</style>`;
  }

  if (installDir && existsSync(installDir)) {
    const themeHtmlRe = /^\/sasi-overlays(?:-[^/]+)?\/(scenes|components)\/[^/]+\.html$/i;
    app.get(themeHtmlRe, async (req, res, next) => {
      const decoded = decodeURIComponent(req.path);
      if (decoded.includes('..')) return res.status(400).end('bad path');
      const fullPath = path.join(installDir, decoded.replace(/^\//, ''));
      if (!existsSync(fullPath)) return next();
      try {
        const html = await fs.readFile(fullPath, 'utf8');
        const palette = await readActivePalette();
        const styleTag = buildPaletteStyleTag(palette);
        // Content script must come BEFORE <link>s and <script>s in <head>
        // (especially live-update.js) so localStorage is populated by the
        // time applyLiveUpdaters() runs. Inject it right after <head> opens.
        const contentScript = buildContentScriptTag(_contentState);
        const headOpenMatch = html.match(/<head[^>]*>/i);
        let modified;
        if (headOpenMatch) {
          const headOpenEnd = headOpenMatch.index + headOpenMatch[0].length;
          // Order: <head>{contentScript}{rest of head...}{styleTag}</head>
          // contentScript first (so JS hydration is ready before scripts run),
          // styleTag right before </head> so it overrides earlier <link>s.
          const headCloseIdx = html.search(/<\/head>/i);
          if (headCloseIdx > headOpenEnd) {
            modified =
              html.slice(0, headOpenEnd) +
              contentScript +
              html.slice(headOpenEnd, headCloseIdx) +
              styleTag +
              html.slice(headCloseIdx);
          } else {
            modified = html.slice(0, headOpenEnd) + contentScript + styleTag + html.slice(headOpenEnd);
          }
        } else {
          modified = contentScript + styleTag + html;
        }
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(modified);
      } catch (err) {
        log.warn(`palette inject failed for ${req.path}: ${err.message}`);
        next();
      }
    });
  }

  if (installDir && existsSync(installDir)) {
    app.use(express.static(installDir, {
      index: false,
      dotfiles: 'ignore',
      maxAge: 0,
      etag: false,
      // CEF (OBS browser source's embedded Chromium) caches subresources
      // even when the parent page reloads with no-cache. theme-tokens.css
      // is the worst offender — palette updates never reach OBS until the
      // user closes/reopens the source. no-store on theme files forces CEF
      // to fetch a fresh copy every time, so /save-palette + /refresh-obs
      // round-trips actually land in OBS within one reload.
      setHeaders: (res, filePath) => {
        if (/(theme-tokens\.css|live-update\.js|config\.js)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));
  }

  app.get('/status', (_req, res) => {
    res.json({
      running: true,
      startedAt: state.startedAt,
      queue: state.queue,
      recentMoves: state.recentMoves,
      config: {
        dumpDir: config.dumpDir,
        targetRoot: config.targetRoot,
        keepMkv: config.keepMkv !== false,
      },
      installDir: toWebPath(installDir),
      logFile: toWebPath(logFile),
    });
  });

  // POST /open-log â€” opens the log file in the default text editor (notepad).
  app.post('/open-log', (_req, res) => {
    if (!logFile) return res.status(500).json({ error: 'logFile not configured' });
    try {
      spawn('notepad.exe', [logFile], { detached: true, stdio: 'ignore' }).unref();
      res.json({ ok: true, opened: toWebPath(logFile) });
    } catch (err) {
      log.error(`open-log failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /pick-folder?kind=dump|target|bundle|output â€” pop a real folder picker.
  // Spawns powershell with a visible console window so the dialog gets
  // foreground rights. Result is communicated via a temp file (more reliable
  // than capturing stdout from a hidden child process).
  app.post('/pick-folder', async (req, res) => {
    if (!pickFolderScript) {
      return res.status(500).json({ error: 'pickFolderScript not configured' });
    }
    const kind = (req.query.kind || '').toString();
    const desc = kind === 'dump'
      ? 'Select OBS recording dump folder'
      : kind === 'target'
        ? 'Select target root for organized recordings'
        : kind === 'recording-root'
          ? 'Select OBS Recording folder (we will create _dump/ and recording/ inside)'
          : kind === 'bundle'
            ? 'Select OBS bundle folder (must contain manifest.json + basic/)'
            : kind === 'output'
              ? 'Select folder where the OBS bundle will be created'
              : 'Select folder';
    log.info(`pick-folder: launching picker (kind=${kind})`);
    try {
      const picked = await pickFolderViaTempFile(pickFolderScript, desc, log);
      if (!picked) {
        log.info('pick-folder: cancelled or no selection');
        return res.json({ ok: true, cancelled: true });
      }
      log.info(`pick-folder: got "${picked}"`);
      res.json({ ok: true, path: toWebPath(picked) });
    } catch (err) {
      log.error(`pick-folder failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/log', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json(log.recent(limit));
  });

  app.get('/games', async (_req, res) => {
    try {
      const text = await fs.readFile(gamesPath, 'utf8');
      res.type('application/json').send(text);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/games', async (req, res) => {
    try {
      const json = JSON.stringify(req.body, null, 2);
      await fs.writeFile(gamesPath, json, 'utf8');
      log.info(`games.json updated via API (${Object.keys(req.body).length} entries)`);
      res.json({ ok: true });
    } catch (err) {
      log.error(`PUT /games failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /open-folder â€” opens File Explorer at the given path. Body: { path }.
  // If the path doesn't exist, opens the closest existing parent.
  app.post('/open-folder', (req, res) => {
    const target = (req.body && req.body.path) ? String(req.body.path) : '';
    if (!target) return res.status(400).json({ error: 'body.path required' });
    let toOpen = target.replace(/\//g, '\\');
    // Walk up the path until we find an existing directory
    while (toOpen && !existsSync(toOpen)) {
      const parent = toOpen.replace(/\\[^\\]*$/, '');
      if (parent === toOpen || !parent) {
        toOpen = '';
        break;
      }
      toOpen = parent;
    }
    if (!toOpen) toOpen = process.env.USERPROFILE || 'C:\\';
    try {
      openInExplorer(toOpen);
      log.info(`open-folder: opened ${toOpen}`);
      res.json({ ok: true, opened: toOpen });
    } catch (err) {
      log.error(`open-folder failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /config â€” update dumpDir / targetRoot.
  // dumpDir must exist (OBS writes there; the user owns that folder).
  // targetRoot is auto-created if missing (it's our output, we manage it).
  // Writes config.json (UTF-8 no BOM). Client should call /restart after.
  app.put('/config', async (req, res) => {
    try {
      const updates = req.body || {};
      const allowed = ['dumpDir', 'targetRoot'];
      const allowedBool = ['keepMkv'];
      const filtered = {};
      for (const k of allowed) {
        if (typeof updates[k] === 'string' && updates[k].length > 0) {
          filtered[k] = toWebPath(updates[k]);
        }
      }
      for (const k of allowedBool) {
        if (typeof updates[k] === 'boolean') filtered[k] = updates[k];
      }
      if (Object.keys(filtered).length === 0) {
        return res.status(400).json({ error: 'no valid fields to update' });
      }
      // dumpDir: must exist
      if (filtered.dumpDir && !existsSync(filtered.dumpDir)) {
        return res.status(400).json({
          error: `dumpDir does not exist: ${filtered.dumpDir}. Create the folder first â€” this is where OBS writes recordings.`,
        });
      }
      // targetRoot: auto-create
      if (filtered.targetRoot && !existsSync(filtered.targetRoot)) {
        try {
          await fs.mkdir(filtered.targetRoot, { recursive: true });
          log.info(`PUT /config: auto-created targetRoot ${filtered.targetRoot}`);
        } catch (mkErr) {
          return res.status(400).json({
            error: `could not create targetRoot ${filtered.targetRoot}: ${mkErr.message}`,
          });
        }
      }
      const current = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const merged = { ...current, ...filtered };
      await fs.writeFile(configPath, JSON.stringify(merged, null, 2), { encoding: 'utf8' });
      log.info(`config.json updated via API: ${Object.keys(filtered).join(', ')}`);
      res.json({ ok: true, config: merged, restartRequired: true });
    } catch (err) {
      log.error(`PUT /config failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /uninstall â€” remove the auto-start entry (registry Run key + any
  // stale Task Scheduler entry from older installs), then exit cleanly.
  // Does NOT delete files (config.json, games.json, node_modules, etc).
  app.post('/uninstall', async (_req, res) => {
    try {
      const cmds = [
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "ClipPrepWatcher" /f',
        'schtasks /Delete /F /TN "ClipPrepWatcher"',
      ];
      for (const c of cmds) {
        await execAsync(c).catch((e) => log.warn(`${c.split(' ')[0]}: ${e.message}`));
      }
      log.warn('Uninstall requested via API; auto-start removed; exiting');
      res.json({ ok: true });
      setTimeout(() => process.exit(0), 200);
    } catch (err) {
      log.error(`uninstall failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Track in-progress splits in memory so dashboard refreshes don't lose
  // visibility of ongoing work. Keyed by basename.
  const splitsInProgress = new Set();

  // GET /list-mix â€” list all .mkv files in <targetRoot>/_mix/MKV plus whether
  // each has been split (via _split-record.json) or is currently being split.
  app.get('/list-mix', async (_req, res) => {
    try {
      const mixDir = path.join(toOsPath(config.targetRoot), '_mix');
      const mkvDir = path.join(mixDir, 'MKV');
      if (!existsSync(mkvDir)) return res.json({ files: [] });
      const files = (await fs.readdir(mkvDir)).filter(f => f.toLowerCase().endsWith('.mkv'));

      let splitRecord = {};
      const recordPath = path.join(mixDir, '_split-record.json');
      try { splitRecord = JSON.parse(await fs.readFile(recordPath, 'utf8')); } catch {}

      const result = [];
      for (const f of files) {
        const basename = f.replace(/\.mkv$/i, '');
        const sidecarPath = path.join(mixDir, basename + '.json');
        const mkvPath = path.join(mkvDir, f);
        let games = [];
        let durationSec = 0;
        let started_at = null;
        try {
          const sc = JSON.parse(await fs.readFile(sidecarPath, 'utf8'));
          started_at = sc.started_at;
          durationSec = (Date.parse(sc.stopped_at) - Date.parse(sc.started_at)) / 1000;
          const exes = new Set();
          for (const ev of (sc.events || [])) if (ev.exe) exes.add(ev.exe);
          games = [...exes];
        } catch {}
        const stat = await fs.stat(mkvPath).catch(() => null);
        result.push({
          basename,
          mkv: toWebPath(mkvPath),
          size_bytes: stat ? stat.size : 0,
          duration_sec: durationSec,
          started_at,
          games,
          split: !!splitRecord[basename],
          split_at: splitRecord[basename] ? splitRecord[basename].split_at : null,
          in_progress: splitsInProgress.has(basename),
        });
      }
      result.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
      res.json({ files: result });
    } catch (err) {
      log.error(`/list-mix failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /list-recordings â€” walks targetRoot, returns one entry per top-level
  // game folder with that folder's files (mkv + mp4 in MKV/ and MP4/ subdirs,
  // plus any direct files like sidecars). Skips _mix (handled separately).
  app.get('/list-recordings', async (_req, res) => {
    try {
      const root = toOsPath(config.targetRoot);
      if (!existsSync(root)) return res.json({ games: [] });
      const entries = await fs.readdir(root, { withFileTypes: true });
      const games = [];
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name.startsWith('_')) continue; // skip _mix, _orphans, etc.
        const gameDir = path.join(root, ent.name);
        const files = [];
        // Walk one level (MKV/, MP4/) plus any files at game-folder root
        const collect = async (dir, format) => {
          if (!existsSync(dir)) return;
          const items = await fs.readdir(dir, { withFileTypes: true });
          for (const it of items) {
            if (!it.isFile()) continue;
            const full = path.join(dir, it.name);
            const stat = await fs.stat(full).catch(() => null);
            if (!stat) continue;
            files.push({
              name: it.name,
              path: toWebPath(full),
              size: stat.size,
              mtime: stat.mtimeMs,
              format,
            });
          }
        };
        await collect(path.join(gameDir, 'MKV'), 'mkv');
        await collect(path.join(gameDir, 'MP4'), 'mp4');
        await collect(gameDir, 'other'); // catches any direct files (legacy/manual)
        files.sort((a, b) => b.mtime - a.mtime);
        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        games.push({ name: ent.name, totalSize, fileCount: files.length, files });
      }
      games.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      res.json({ games });
    } catch (err) {
      log.error(`/list-recordings failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /recycle-file  body: { path }
  // Sends a single file (under targetRoot only â€” for safety) to the Recycle
  // Bin. Path is validated to live inside config.targetRoot to prevent any
  // accidental or malicious recycling of files outside the recording tree.
  app.post('/recycle-file', async (req, res) => {
    const target = (req.body && req.body.path) ? String(req.body.path) : '';
    if (!target) return res.status(400).json({ error: 'body.path required' });
    const targetNorm = toOsPath(path.resolve(target));
    const rootNorm = toOsPath(path.resolve(config.targetRoot));
    if (!targetNorm.toLowerCase().startsWith(rootNorm.toLowerCase() + path.sep) && targetNorm.toLowerCase() !== rootNorm.toLowerCase()) {
      return res.status(400).json({ error: 'refusing â€” path is not inside targetRoot: ' + targetNorm });
    }
    if (!existsSync(targetNorm)) return res.status(404).json({ error: 'file not found: ' + targetNorm });
    try {
      const psScript = path.join(installDir || '', 'scripts', 'recycle.ps1');
      log.info(`recycle-file: ${targetNorm}`);
      const r = await runPowerShell(psScript, ['-Files', targetNorm], { maxBuffer: 1024 * 1024, log });
      if (r.code !== 0) return res.status(500).json({ error: 'recycle.ps1 failed', stdout: r.stdout, stderr: r.stderr });
      res.json({ ok: true, output: r.stdout.trim() });
    } catch (err) {
      log.error(`recycle-file failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /recycle-all-mkvs â€” walks targetRoot recursively and sends every
  // .mkv file to the Recycle Bin. Useful for cleaning up after switching
  // keepMkv off (so existing MKVs from before don't sit around).
  app.post('/recycle-all-mkvs', async (_req, res) => {
    try {
      const root = toOsPath(config.targetRoot);
      if (!existsSync(root)) return res.status(400).json({ error: 'targetRoot does not exist: ' + root });
      // Walk the tree and collect .mkv paths
      const found = [];
      async function walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) await walk(full);
          else if (ent.isFile() && ent.name.toLowerCase().endsWith('.mkv')) found.push(full);
        }
      }
      await walk(root);
      // Skip any MKV currently being split — recycling the source mid-split
      // leaves partial segment files and breaks the in-flight ffmpeg run.
      // splitsInProgress is keyed by basename without extension.
      const skipped = [];
      const safe = found.filter(f => {
        const base = path.basename(f, path.extname(f));
        if (splitsInProgress.has(base)) { skipped.push(base); return false; }
        return true;
      });
      if (safe.length === 0) return res.json({ ok: true, recycled: 0, skipped, message: skipped.length ? 'all .mkv files are mid-split; try again after splits finish' : 'no .mkv files in targetRoot' });
      const psScript = path.join(installDir || '', 'scripts', 'recycle.ps1');
      log.warn(`recycle-all-mkvs: sending ${safe.length} files to Recycle Bin${skipped.length ? ` (skipped ${skipped.length} mid-split)` : ''}`);
      // recycle.ps1 splits its -Files argument on '|' (an invalid filename
      // character on Windows, so splitting is unambiguous); pass the joined
      // list through the arg-array path so the outer process call doesn't get
      // shell-parsed (an outer shell would mishandle a path containing ').
      const r = await runPowerShell(psScript, ['-Files', safe.join('|')], { maxBuffer: 16 * 1024 * 1024, log });
      if (r.code !== 0) return res.status(500).json({ error: 'recycle.ps1 failed', stdout: r.stdout, stderr: r.stderr });
      log.info(`recycle-all-mkvs done`);
      res.json({ ok: true, recycled: safe.length, skipped, output: r.stdout.trim().split('\n').slice(0, 10).join('\n') });
    } catch (err) {
      log.error(`recycle-all-mkvs failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /delete-mix  body: { basename }
  // Moves the mix recording's .mkv, .mp4, and .json sidecar to the Windows
  // Recycle Bin (not permanent delete â€” user can restore from Recycle Bin).
  // Only allowed if the file has actually been split (per _split-record.json),
  // so segments exist before we trash the source.
  app.post('/delete-mix', async (req, res) => {
    const { basename } = req.body || {};
    if (!basename) return res.status(400).json({ error: 'body.basename required' });
    // Path-traversal guard: basename gets used in path.join with mixDir, so a
    // value like '../../foo' would resolve OUTSIDE the mix folder and recycle
    // unrelated files. isSafeFilename rejects /, \, .., control chars, and
    // Windows-reserved <>:"|?*. The CSRF guard already blocks cross-origin
    // callers but this is the right depth of defense for a destructive op.
    if (!isSafeFilename(basename)) return res.status(400).json({ error: 'invalid basename (no path separators, .., or control chars)' });
    if (splitsInProgress.has(basename)) {
      return res.status(409).json({ error: 'split in progress; wait until it completes' });
    }
    const mixDir = path.join(toOsPath(config.targetRoot), '_mix');
    const recordPath = path.join(mixDir, '_split-record.json');
    let record = {};
    try { record = JSON.parse(await fs.readFile(recordPath, 'utf8')); } catch {}
    if (!record[basename]) {
      return res.status(400).json({ error: 'this mix has not been split yet â€” split first, then delete the original' });
    }
    const targets = [
      path.join(mixDir, 'MKV', basename + '.mkv'),
      path.join(mixDir, 'MP4', basename + '.mp4'),
      path.join(mixDir, basename + '.json'),
    ].filter(p => existsSync(p));
    if (targets.length === 0) {
      return res.status(404).json({ error: 'no files found to delete (already removed?)' });
    }
    try {
      const psScript = path.join(installDir || '', 'scripts', 'recycle.ps1');
      log.info(`delete-mix: ${basename} â†’ recycle bin (${targets.length} files)`);
      const r = await runPowerShell(psScript, ['-Files', targets.join('|')], { maxBuffer: 1024 * 1024, log });
      if (r.code !== 0) return res.status(500).json({ error: 'recycle.ps1 failed', stdout: r.stdout, stderr: r.stderr });
      log.info(`delete-mix output: ${r.stdout.trim()}`);
      res.json({ ok: true, recycled: targets.length, output: r.stdout.trim() });
    } catch (err) {
      log.error(`delete-mix failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /split-mix  body: { basename, precise? }
  // Splits a single mix file into per-game segments via the split-mix.js helper.
  // Tracks in-progress state so dashboard refreshes remain accurate.
  app.post('/split-mix', async (req, res) => {
    const { basename, precise } = req.body || {};
    if (!basename) return res.status(400).json({ error: 'body.basename required' });
    // Path-traversal guard — same reason as /delete-mix above.
    if (!isSafeFilename(basename)) return res.status(400).json({ error: 'invalid basename (no path separators, .., or control chars)' });
    if (splitsInProgress.has(basename)) {
      return res.status(409).json({ error: 'split already in progress for this file' });
    }
    const mixDir = path.join(toOsPath(config.targetRoot), '_mix');
    const mkvPath = path.join(mixDir, 'MKV', basename + '.mkv');
    if (!existsSync(mkvPath)) return res.status(404).json({ error: 'mix file not found: ' + mkvPath });
    splitsInProgress.add(basename);
    log.info(`split-mix start: ${basename} precise=${!!precise}`);
    try {
      const result = await splitMixFile(mkvPath, { precise: !!precise, gamesPath, log, keepMkv: config.keepMkv !== false });
      log.info(`split-mix done: ${basename} â†’ ${result.segments.length} segment(s)`);
      res.json({ ok: true, ...result });
    } catch (err) {
      log.error(`split-mix failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    } finally {
      splitsInProgress.delete(basename);
    }
  });

  // POST /restart â€” relaunch: kick off a new watcher via the launcher VBS,
  // detached via cmd /c start (the canonical Windows detach pattern), then
  // exit ourselves. The launcher VBS sleeps 1 second before starting node,
  // so the new instance binds port 6789 only after this one has freed it.
  app.post('/restart', (_req, res) => {
    res.json({ ok: true });
    log.warn('Restart requested via API; launching new instance via cmd /c start');
    if (launcherPath) {
      try {
        // Array-form spawn (no shell:true) â€” even though launcherPath is set at
        // service init from a trusted source, treating any string-interpolated
        // command line as untrusted is the right default. cmd.exe's `start`
        // detaches the child so this process can exit cleanly.
        spawn('cmd.exe', ['/c', 'start', '""', '/B', 'wscript.exe', launcherPath], {
          shell: false,
          stdio: 'ignore',
          windowsHide: true,
          detached: true,
        });
      } catch (e) {
        log.error(`failed to spawn launcher: ${e.message}`);
      }
    }
    // Give cmd time to actually fire `start` before this process exits.
    setTimeout(() => process.exit(0), 600);
  });

  // POST /set-recording-root  body: { root }
  // Single-folder convenience: takes one parent path, creates <root>/_dump and
  // <root>/recording, updates config, restart picks up new paths.
  app.post('/set-recording-root', async (req, res) => {
    const root = (req.body && req.body.root) ? toOsPath(String(req.body.root)) : '';
    if (!root) return res.status(400).json({ error: 'body.root required' });
    if (!existsSync(root)) {
      try {
        await fs.mkdir(root, { recursive: true });
      } catch (e) {
        return res.status(400).json({ error: `could not create ${root}: ${e.message}` });
      }
    }
    const dumpDir = path.join(root, '_dump');
    const targetRoot = path.join(root, 'recording');
    try {
      if (!existsSync(dumpDir)) await fs.mkdir(dumpDir, { recursive: true });
      if (!existsSync(targetRoot)) await fs.mkdir(targetRoot, { recursive: true });
      const current = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const merged = {
        ...current,
        dumpDir: toWebPath(dumpDir),
        targetRoot: toWebPath(targetRoot),
      };
      await fs.writeFile(configPath, JSON.stringify(merged, null, 2), { encoding: 'utf8' });
      log.info(`set-recording-root: ${root} -> dump=${merged.dumpDir}, target=${merged.targetRoot}`);
      res.json({ ok: true, config: merged, restartRequired: true });
    } catch (err) {
      log.error(`set-recording-root failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== OBS BUNDLE: export / import / backup-restore =====
  // Long-running PS scripts are spawned with maxBuffer=32MB so output isn't truncated.

  const obsRoot = path.join(process.env.APPDATA || '', 'obs-studio');
  const exportScript = installDir ? path.join(installDir, 'scripts', 'obs-export.ps1') : '';
  const importScript = installDir ? path.join(installDir, 'scripts', 'obs-import.ps1') : '';
  const luaPath = installDir ? path.join(installDir, 'obs', 'game-tracker.lua') : '';

  // Validate a folder looks like an obs-export bundle.
  function validateBundle(folder) {
    if (!folder) return { ok: false, error: 'no path provided' };
    if (!existsSync(folder)) return { ok: false, error: `folder does not exist: ${folder}` };
    const manifest = path.join(folder, 'manifest.json');
    const basic = path.join(folder, 'basic');
    if (!existsSync(manifest)) return { ok: false, error: 'not a bundle (missing manifest.json)' };
    if (!existsSync(basic)) return { ok: false, error: 'not a bundle (missing basic/)' };
    return { ok: true };
  }

  // POST /export-obs-bundle  body: { outputDir }
  // Runs obs-export.ps1 -OutputDir <outputDir>. Returns full stdout/stderr.
  app.post('/export-obs-bundle', async (req, res) => {
    const pickedDir = (req.body && req.body.outputDir) ? toOsPath(String(req.body.outputDir)) : '';
    if (!pickedDir) return res.status(400).json({ error: 'body.outputDir required' });
    if (!exportScript || !existsSync(exportScript)) {
      return res.status(500).json({ error: 'export script not found at ' + exportScript });
    }
    // Auto-create a timestamped subfolder so bundle files never leak into a
    // non-empty picked folder (which has happened â€” users pick their recordings
    // root and end up with manifest.json / global.ini sitting alongside videos).
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const outputDir = path.join(pickedDir, 'bundle-' + stamp);
    try {
      if (!existsSync(outputDir)) await fs.mkdir(outputDir, { recursive: true });
      log.info(`export-obs-bundle: ${outputDir}`);
      const r = await runPowerShell(exportScript, ['-OutputDir', outputDir], { log });
      const combined = (r.stdout + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '')).trim();
      const failed = r.code !== 0 || /^ERROR:/m.test(combined);
      if (failed) {
        log.warn(`export-obs-bundle reported error (code=${r.code})`);
        return res.status(500).json({ ok: false, output: combined });
      }
      log.info(`export-obs-bundle done -> ${outputDir}`);
      res.json({ ok: true, outputDir: toWebPath(outputDir), output: combined });
    } catch (err) {
      log.error(`export-obs-bundle failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /import-obs-bundle  body: { bundlePath }
  app.post('/import-obs-bundle', async (req, res) => {
    const bundlePath = (req.body && req.body.bundlePath) ? toOsPath(String(req.body.bundlePath)) : '';
    const v = validateBundle(bundlePath);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (!importScript || !existsSync(importScript)) {
      return res.status(500).json({ error: 'import script not found at ' + importScript });
    }
    if (!luaPath || !existsSync(luaPath)) {
      return res.status(500).json({ error: 'game-tracker.lua not found at ' + luaPath });
    }
    try {
      log.info(`import-obs-bundle: from ${bundlePath}`);
      const r = await runPowerShell(importScript,
        ['-BundlePath', bundlePath, '-LuaPath', luaPath], { log });
      const combined = (r.stdout + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '')).trim();
      const failed = r.code !== 0 || /^ERROR:/m.test(combined);
      if (failed) {
        log.warn(`import-obs-bundle reported error (code=${r.code})`);
        return res.status(500).json({ ok: false, output: combined });
      }
      log.info(`import-obs-bundle done`);
      res.json({ ok: true, output: combined });
    } catch (err) {
      log.error(`import-obs-bundle failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /register-lua
  // Walks every OBS scene-collection JSON in %APPDATA%\obs-studio\basic\scenes
  // and ensures game-tracker.lua is registered under modules.scripts-tool.
  // Idempotent â€” running it twice is a no-op. Mirrors what obs-import.ps1
  // does at the end of a bundle restore, but standalone so the user doesn't
  // need to import a bundle to get the script registered on a fresh install.
  app.post('/register-lua', async (_req, res) => {
    const registerScript = installDir ? path.join(installDir, 'scripts', 'register-lua.ps1') : '';
    if (!registerScript || !existsSync(registerScript)) {
      return res.status(500).json({ error: 'register-lua.ps1 not found at ' + registerScript });
    }
    if (!luaPath || !existsSync(luaPath)) {
      return res.status(500).json({ error: 'game-tracker.lua not found at ' + luaPath });
    }
    try {
      log.info('register-lua: registering game-tracker.lua in all scene collections');
      const r = await runPowerShell(registerScript, ['-LuaPath', luaPath], { log });
      const combined = (r.stdout + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '')).trim();
      if (r.code !== 0) {
        log.warn(`register-lua reported error (code=${r.code})`);
        return res.status(500).json({ ok: false, output: combined });
      }
      log.info('register-lua done');
      res.json({ ok: true, output: combined });
    } catch (err) {
      log.error(`register-lua failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /list-obs-backups - finds %APPDATA%\obs-studio\_clip-prep-backup-*
  app.get('/list-obs-backups', async (_req, res) => {
    if (!existsSync(obsRoot)) return res.json({ backups: [] });
    try {
      const entries = await fs.readdir(obsRoot, { withFileTypes: true });
      const backups = [];
      for (const ent of entries) {
        if (!ent.isDirectory() || !ent.name.startsWith('_clip-prep-backup-')) continue;
        const full = path.join(obsRoot, ent.name);
        const stat = await fs.stat(full);
        let sizeBytes = 0;
        let fileCount = 0;
        try {
          const stack = [full];
          while (stack.length) {
            const dir = stack.pop();
            const items = await fs.readdir(dir, { withFileTypes: true });
            for (const i of items) {
              const p = path.join(dir, i.name);
              if (i.isDirectory()) stack.push(p);
              else if (i.isFile()) { sizeBytes += (await fs.stat(p)).size; fileCount++; }
            }
          }
        } catch {}
        backups.push({
          name: ent.name,
          path: toWebPath(full),
          modified: stat.mtime.toISOString(),
          sizeBytes,
          fileCount,
        });
      }
      backups.sort((a, b) => b.modified.localeCompare(a.modified));
      res.json({ backups });
    } catch (err) {
      log.error(`list-obs-backups failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Reject any backup name that's not a single, simple folder under obsRoot.
  // The startsWith() prefix check alone is not enough: '_clip-prep-backup-/../foo'
  // passes prefix but escapes obsRoot via path traversal.
  function isSafeBackupName(name) {
    if (!name || typeof name !== 'string') return false;
    if (!name.startsWith('_clip-prep-backup-')) return false;
    if (name.includes('/') || name.includes('\\')) return false;
    if (name === '.' || name === '..' || name.includes('..')) return false;
    if (/[\x00-\x1f]/.test(name)) return false; // no control chars
    return true;
  }

  // POST /restore-obs-backup  body: { name }
  // Copies leaves of the backup back into %APPDATA%\obs-studio\, after first
  // saving the current state to a new safety-backup folder. Reversible.
  app.post('/restore-obs-backup', async (req, res) => {
    const name = (req.body && req.body.name) ? String(req.body.name) : '';
    if (!isSafeBackupName(name)) {
      return res.status(400).json({ error: 'invalid backup name' });
    }
    const backupDir = path.join(obsRoot, name);
    if (!existsSync(backupDir)) return res.status(404).json({ error: 'backup not found: ' + name });

    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
      const safetyDir = path.join(obsRoot, `_clip-prep-backup-${stamp}-pre-restore`);
      await fs.mkdir(safetyDir);
      const leaves = ['basic', 'plugins', 'plugin_config', 'plugin_manager', 'global.ini', 'user.ini'];
      for (const leaf of leaves) {
        const src = path.join(obsRoot, leaf);
        if (existsSync(src)) {
          await fs.cp(src, path.join(safetyDir, leaf), { recursive: true, force: true });
        }
      }
      log.info(`restore-obs-backup: safety snapshot at ${safetyDir}`);

      // Now copy backup back over obs-studio
      let restored = 0;
      for (const leaf of leaves) {
        const src = path.join(backupDir, leaf);
        if (!existsSync(src)) continue;
        const dst = path.join(obsRoot, leaf);
        await fs.cp(src, dst, { recursive: true, force: true });
        restored++;
      }
      log.info(`restore-obs-backup: restored ${restored} leaf(s) from ${name}`);
      res.json({ ok: true, restored, safetyBackup: path.basename(safetyDir) });
    } catch (err) {
      log.error(`restore-obs-backup failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /delete-obs-backup  body: { name }
  // Sends backup folder to Recycle Bin (recoverable, not permanent).
  app.post('/delete-obs-backup', async (req, res) => {
    const name = (req.body && req.body.name) ? String(req.body.name) : '';
    if (!isSafeBackupName(name)) {
      return res.status(400).json({ error: 'invalid backup name' });
    }
    const target = path.join(obsRoot, name);
    if (!existsSync(target)) return res.status(404).json({ error: 'backup not found' });
    try {
      const psScript = path.join(installDir || '', 'scripts', 'recycle.ps1');
      log.info(`delete-obs-backup: ${name} -> recycle bin`);
      const r = await runPowerShell(psScript, ['-Files', target], { maxBuffer: 1024 * 1024, log });
      if (r.code !== 0) return res.status(500).json({ error: 'recycle.ps1 failed', stdout: r.stdout, stderr: r.stderr });
      res.json({ ok: true, output: r.stdout.trim() });
    } catch (err) {
      log.error(`delete-obs-backup failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== ASSET / SCENE UPLOAD (Sasi Studio v2 Overlays tab) =====
  // Accepts base64-encoded payloads via JSON (no multer dependency). Strict
  // filename validation (no path traversal). Writes into install dir's
  // sasi-overlays/{assets,scenes}/.
  const overlaysRoot = installDir ? path.join(installDir, 'sasi-overlays') : '';

  function isSafeFilename(name) {
    if (!name || typeof name !== 'string') return false;
    if (name.includes('/') || name.includes('\\')) return false;
    if (name === '.' || name === '..' || name.includes('..')) return false;
    if (/[\x00-\x1f<>:"|?*]/.test(name)) return false;
    if (name.length > 200) return false;
    return true;
  }

  // POST /upload-asset â€” body: { filename, dataBase64 }
  // Image (PNG/JPG/SVG/WebP) â†’ install dir's sasi-overlays/assets/<filename>.
  app.post('/upload-asset', async (req, res) => {
    if (!overlaysRoot) return res.status(500).json({ error: 'overlaysRoot not configured' });
    const { filename, dataBase64 } = req.body || {};
    if (!isSafeFilename(filename)) return res.status(400).json({ error: 'invalid filename' });
    if (!dataBase64 || typeof dataBase64 !== 'string') return res.status(400).json({ error: 'dataBase64 required' });
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) {
      return res.status(400).json({ error: 'only PNG/JPG/GIF/WebP/SVG allowed' });
    }
    try {
      const buf = Buffer.from(dataBase64, 'base64');
      if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'asset too large (max 10MB)' });
      const assetsDir = path.join(overlaysRoot, 'assets');
      if (!existsSync(assetsDir)) await fs.mkdir(assetsDir, { recursive: true });
      const dest = path.join(assetsDir, filename);
      await fs.writeFile(dest, buf);
      log.info(`upload-asset: ${dest} (${buf.length} bytes)`);
      res.json({ ok: true, path: toWebPath(dest), url: 'assets/' + filename });
    } catch (err) {
      log.error(`upload-asset failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /upload-scene â€” body: { filename, html }
  // Custom overlay HTML â†’ install dir's sasi-overlays/scenes/<filename>.
  // Returns the file:// URL the user can paste into OBS browser source.
  app.post('/upload-scene', async (req, res) => {
    if (!overlaysRoot) return res.status(500).json({ error: 'overlaysRoot not configured' });
    const { filename, html } = req.body || {};
    if (!isSafeFilename(filename)) return res.status(400).json({ error: 'invalid filename' });
    if (!html || typeof html !== 'string') return res.status(400).json({ error: 'html (string) required' });
    if (!/\.html?$/i.test(filename)) return res.status(400).json({ error: 'only .html files allowed' });
    if (html.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'scene too large (max 2MB)' });
    try {
      const scenesDir = path.join(overlaysRoot, 'scenes');
      if (!existsSync(scenesDir)) await fs.mkdir(scenesDir, { recursive: true });
      const dest = path.join(scenesDir, filename);
      await fs.writeFile(dest, html, { encoding: 'utf8' });
      const fileUrl = 'file:///' + toWebPath(dest);
      log.info(`upload-scene: ${dest} (${html.length} chars)`);
      res.json({ ok: true, path: toWebPath(dest), fileUrl });
    } catch (err) {
      log.error(`upload-scene failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Resolve a theme folder argument to an absolute path under installDir.
  // ?theme=sasi-overlays           â†’ active theme
  // ?theme=sasi-overlays-<name>   â†’ inactive theme (must exist in installDir)
  // (missing/empty)                â†’ active theme
  function resolveThemeRoot(theme) {
    if (!installDir) return null;
    const t = (theme || 'sasi-overlays').trim();
    if (!/^sasi-overlays(-[a-zA-Z0-9_-]{1,40})?$/.test(t)) return null;
    return path.join(installDir, t);
  }

  async function listOverlayFiles(subdir, themeFolder) {
    const root = resolveThemeRoot(themeFolder);
    if (!root) return null;
    const dir = path.join(root, subdir);
    if (!existsSync(dir)) return [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const items = [];
    for (const ent of entries) {
      if (!ent.isFile() || !/\.html?$/i.test(ent.name)) continue;
      const full = path.join(dir, ent.name);
      const stat = await fs.stat(full);
      items.push({
        name: ent.name,
        path: toWebPath(full),
        fileUrl: 'file:///' + toWebPath(full),
        size: stat.size,
        mtime: stat.mtimeMs,
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }

  // GET /list-scenes?theme=<folder> â€” defaults to active theme.
  app.get('/list-scenes', async (req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    try {
      const items = await listOverlayFiles('scenes', req.query.theme);
      if (items === null) return res.status(400).json({ error: 'invalid theme name' });
      res.json({ scenes: items });
    } catch (err) {
      log.error(`list-scenes failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /list-components?theme=<folder> â€” defaults to active theme.
  app.get('/list-components', async (req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    try {
      const items = await listOverlayFiles('components', req.query.theme);
      if (items === null) return res.status(400).json({ error: 'invalid theme name' });
      res.json({ components: items });
    } catch (err) {
      log.error(`list-components failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== THEME SYSTEM (Sasi Studio v2) =====
  // Each theme is a fully self-contained folder under installDir, named
  // sasi-overlays[-<suffix>]. The folder named exactly "sasi-overlays" is
  // ACTIVE â€” that's where OBS browser-source paths point. Swap by atomic
  // rename: active â†’ sasi-overlays-<old>/, target â†’ sasi-overlays/.

  function isSafeThemeName(name) {
    // Theme suffix: alphanumerics + dash + underscore, 1-40 chars.
    if (!name || typeof name !== 'string') return false;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) return false;
    return true;
  }

  // Theme contract â€” files every theme MUST have for OBS browser sources to keep working
  // when themes are swapped. Themes can ADD more files; they cannot REMOVE these.
  const THEME_REQUIRED_SCENES = ['starting-soon.html', 'brb.html', 'stream-ending.html', 'overlay.html', 'just-chatting.html'];
  // terminal-alerts.html is optional (not part of the contract) â€” user reserves
  // it for an unrelated project. Themes can include it but don't have to.
  const THEME_REQUIRED_COMPONENTS = ['subscribe.html', 'likes.html', 'nametag.html', 'webcam.html'];

  function validateTheme(themeFolder) {
    // Returns { valid: bool, missing: [...] }
    const missing = [];
    const scenesDir = path.join(themeFolder, 'scenes');
    const compsDir = path.join(themeFolder, 'components');
    if (!existsSync(scenesDir)) missing.push('scenes/');
    if (!existsSync(compsDir)) missing.push('components/');
    for (const name of THEME_REQUIRED_SCENES) {
      if (!existsSync(path.join(scenesDir, name))) missing.push('scenes/' + name);
    }
    for (const name of THEME_REQUIRED_COMPONENTS) {
      if (!existsSync(path.join(compsDir, name))) missing.push('components/' + name);
    }
    return { valid: missing.length === 0, missing };
  }

  // Read theme.json#id (canonical identity) so we can preserve a theme's name
  // across activation/deactivation. Returns null if missing/invalid.
  function readThemeId(themeFolder) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(themeFolder, 'theme.json'), 'utf8'));
      if (manifest && typeof manifest.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(manifest.id)) return manifest.id;
    } catch {}
    return null;
  }

  // Read full theme.json manifest â€” used by /list-themes to surface preview colors.
  // Strips UTF-8 BOM before parse: PowerShell 5.1's `Set-Content -Encoding UTF8`
  // (used by any user-edited theme.json that's been round-tripped through
  // Notepad / Set-Content / older bundled tooling) writes a 0xEF 0xBB 0xBF BOM,
  // which Node's JSON.parse rejects with "Unexpected token". Silent null here
  // would cascade into the dashboard showing themes with no id/preview/name
  // and the apply-theme button having nothing to send.
  function readThemeManifest(themeFolder) {
    try {
      let text = readFileSync(path.join(themeFolder, 'theme.json'), 'utf8');
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      return JSON.parse(text);
    } catch {}
    return null;
  }

  // GET /list-themes â€” returns all sasi-overlays* folders in installDir.
  app.get('/list-themes', async (_req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    try {
      const entries = await fs.readdir(installDir, { withFileTypes: true });
      const themes = [];
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (!ent.name.startsWith('sasi-overlays')) continue;
        const isActive = ent.name === 'sasi-overlays';
        const suffix = isActive ? '' : ent.name.replace(/^sasi-overlays-?/, '');
        const full = path.join(installDir, ent.name);
        const v = validateTheme(full);
        if (!v.valid && !isActive) continue; // Hide invalid sibling folders, but always show active so user can see what's broken
        const stat = await fs.stat(full);
        const manifest = readThemeManifest(full);
        // Sanitize manifest.preview color values to strict hex strings before
        // returning to the dashboard. The dashboard interpolates these into
        // an inline `style="background:${preview.primary}"` attribute, and
        // theme folders can come from anywhere (zip download, third-party
        // contributor). Without sanitization a malicious theme.json could
        // break out of the style attribute and execute arbitrary JS in the
        // dashboard origin — which has full /uninstall + /delete-backup
        // access. Drop any value that doesn't match #RRGGBB or #RRGGBBAA.
        let safePreview = null;
        if (manifest && typeof manifest.preview === 'object' && manifest.preview !== null) {
          const hexRe = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
          safePreview = {};
          for (const k of ['primary', 'secondary', 'accent', 'bg']) {
            const v = manifest.preview[k];
            if (typeof v === 'string' && hexRe.test(v)) safePreview[k] = v;
          }
        }
        themes.push({
          folder: ent.name,
          name: isActive ? 'active' : suffix,
          id: (manifest && typeof manifest.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(manifest.id)) ? manifest.id : null,
          displayName: (manifest && typeof manifest.name === 'string') ? manifest.name.slice(0, 80) : null,
          author: (manifest && typeof manifest.author === 'string') ? manifest.author.slice(0, 80) : null,
          preview: safePreview,
          active: isActive,
          path: toWebPath(full),
          mtime: stat.mtimeMs,
          valid: v.valid,
          missing: v.missing,
        });
      }
      themes.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || a.name.localeCompare(b.name));
      res.json({ themes });
    } catch (err) {
      log.error(`list-themes failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Internal helper used by both /apply-theme and /switch-channel.
  // Activates theme at sasi-overlays-<name>/ via atomic rename. The previous
  // active theme is renamed to sasi-overlays-<its-id>/ so its identity is preserved
  // (falls back to a timestamped archive when theme.json#id is missing).
  // Throws on validation failure or rename error.
  async function applyThemeByName(name) {
    if (!isSafeThemeName(name)) throw Object.assign(new Error('invalid theme name (alphanumerics + dash/underscore, 1-40 chars)'), { status: 400 });
    const targetFolder = path.join(installDir, 'sasi-overlays-' + name);
    const activeFolder = path.join(installDir, 'sasi-overlays');
    if (!existsSync(targetFolder)) throw Object.assign(new Error('theme folder not found: sasi-overlays-' + name), { status: 404 });
    const v = validateTheme(targetFolder);
    if (!v.valid) {
      throw Object.assign(new Error('theme is missing required files'), {
        status: 400,
        missing: v.missing,
        hint: 'Every theme must contain the standardized scene + component filenames so OBS browser sources stay stable across themes.',
      });
    }
    let archived = null;
    if (existsSync(activeFolder)) {
      // Prefer renaming by theme id so identity persists (sasi-overlays/ â†’ sasi-overlays-<id>/).
      // If theme.json#id is missing or collides with an existing folder, fall back to timestamp.
      const id = readThemeId(activeFolder);
      const proposed = id ? path.join(installDir, 'sasi-overlays-' + id) : null;
      if (proposed && !existsSync(proposed)) {
        archived = proposed;
      } else {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
        archived = path.join(installDir, 'sasi-overlays-archived-' + stamp);
      }
      await fs.rename(activeFolder, archived);
    }
    try {
      await fs.rename(targetFolder, activeFolder);
    } catch (renameErr) {
      // Rollback so we don't end up with no active theme.
      if (archived && existsSync(archived) && !existsSync(activeFolder)) {
        await fs.rename(archived, activeFolder).catch(() => {});
      }
      throw renameErr;
    }
    return { active: name, archivedAs: archived ? path.basename(archived) : null };
  }

  // POST /apply-theme  body: { name }
  app.post('/apply-theme', async (req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    const name = (req.body && req.body.name) ? String(req.body.name).trim() : '';
    try {
      // withThemeLock serializes concurrent /apply-theme + /save-theme + etc.
      // so a double-click can't archive the active twice and lose it.
      const result = await withThemeLock(() => applyThemeByName(name));
      log.info(`apply-theme: ${name} now active${result.archivedAs ? ' (previous -> ' + result.archivedAs + ')' : ''}`);
      res.json({ ok: true, ...result });
    } catch (err) {
      const status = err.status || 500;
      log.error(`apply-theme failed: ${err.message}`);
      const body = { error: err.message };
      if (err.missing) body.missing = err.missing;
      if (err.hint) body.hint = err.hint;
      res.status(status).json(body);
    }
  });

  // POST /save-palette  body: { red, orange, gold, bg, dim }
  // Overwrites the active theme's lib/theme-tokens.css with a freshly-
  // generated palette. Companion to the dashboard's color pickers — they
  // update localStorage (dashboard live preview), but OBS browser sources
  // read the .css from disk, so palette changes never reached OBS until
  // they were flushed here. Called by the "Refresh OBS sources" button
  // BEFORE the obs-websocket reload signal, so OBS picks up the new file
  // on the same refresh round-trip.
  app.post('/save-palette', async (req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    const body = req.body || {};
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    const palette = {};
    for (const key of ['red', 'orange', 'gold', 'bg']) {
      if (typeof body[key] === 'string' && hexRe.test(body[key])) palette[key] = body[key];
    }
    // dim: accept hex (from picker) OR rgba (legacy default)
    if (typeof body.dim === 'string' && (hexRe.test(body.dim) || /^rgba?\([^)]+\)$/i.test(body.dim))) {
      palette.dim = body.dim;
    }
    if (Object.keys(palette).length === 0) {
      return res.status(400).json({ error: 'no valid palette tokens in body (expected hex strings for red/orange/gold/bg/dim)' });
    }
    const hexToRgb = (h) => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
      return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : null;
    };
    const red    = palette.red    || '#FF2200';
    const orange = palette.orange || '#FF7700';
    const gold   = palette.gold   || '#FFD700';
    const bg     = palette.bg     || '#050005';
    const dim    = palette.dim    || 'rgba(255, 255, 255, 0.45)';
    const css = `/* ============================================================
   SASI STUDIO — theme tokens (single source of truth for palette)
   AUTO-GENERATED by POST /save-palette via the dashboard's Refresh
   OBS sources button. Hand-edits are overwritten on the next save.
   To capture a custom palette permanently, use "Save current as theme"
   below the palette pickers (creates a sasi-overlays-<name>/ folder).
   ============================================================ */
:root {
  --red:    ${red};
  --orange: ${orange};
  --gold:   ${gold};
  --bg:     ${bg};
  --red-rgb:    ${hexToRgb(red)};
  --orange-rgb: ${hexToRgb(orange)};
  --gold-rgb:   ${hexToRgb(gold)};
  --bg-rgb:     ${hexToRgb(bg)};
  --dim: ${dim};
}
`;
    const activeTokensPath = path.join(installDir, 'sasi-overlays', 'lib', 'theme-tokens.css');
    try {
      // Best-effort ensure dir exists (it should — install ships it).
      await fs.mkdir(path.dirname(activeTokensPath), { recursive: true });
      await fs.writeFile(activeTokensPath, css, { encoding: 'utf8' });
      // Invalidate the in-memory palette cache so the next theme-HTML
      // request reads the updated file. Without this, /refresh-obs would
      // tell OBS to reload but the watcher would inject the OLD palette.
      invalidatePaletteCache();
      log.info(`save-palette: wrote ${activeTokensPath} (${Object.keys(palette).join(', ')})`);
      res.json({ ok: true, path: toWebPath(activeTokensPath), tokens: palette });
    } catch (err) {
      log.error(`save-palette failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /save-content  body: { key, value }  -or-  body: { entries: { k: v, ... } }
  // Updates the in-memory content state that the inject middleware pre-populates
  // into each theme HTML's localStorage. Persisted to content-state.json.
  app.post('/save-content', async (req, res) => {
    const body = req.body || {};
    const keyRe = /^sasi_[a-zA-Z0-9_]+$/;
    let changes = 0;
    const entries = body.entries && typeof body.entries === 'object'
      ? body.entries
      : (typeof body.key === 'string' ? { [body.key]: body.value } : {});
    for (const [k, v] of Object.entries(entries)) {
      if (!keyRe.test(k)) continue;
      if (v == null || v === '') {
        if (k in _contentState) { delete _contentState[k]; changes++; }
      } else {
        const str = String(v).slice(0, 4000); // hard cap per value
        if (_contentState[k] !== str) { _contentState[k] = str; changes++; }
      }
    }
    if (changes > 0) persistContentState();
    res.json({ ok: true, changes, total: Object.keys(_contentState).length });
  });

  // GET /content-state — returns the full in-memory content map, useful for
  // dashboard rehydration on cold reload (next session).
  app.get('/content-state', (_req, res) => {
    res.json({ state: _contentState });
  });

  // POST /refresh-obs
  // Refreshes every browser_source input in OBS via obs-websocket v5 so the
  // user sees the active theme without right-clicking each source.
  //
  // Why this is needed: theme swaps rename folders in the install dir, the
  // watcher serves new HTML at the same URL, but OBS caches browser source
  // pages aggressively in its embedded CEF. Without an explicit refresh
  // signal, OBS keeps showing the previous theme's render until the user
  // either restarts OBS or right-clicks every browser source.
  //
  // Requires obs-websocket enabled in OBS (Tools -> WebSocket Server Settings,
  // or via the plugin_config/obs-websocket/config.json bundled with our
  // default-bundle). Auth uses the password persisted in config.json's
  // obsWebSocketPassword (set when the bundle was imported or by hand).
  app.post('/refresh-obs', async (_req, res) => {
    const port = Number(config.obsWebSocketPort) || 4455;
    const password = config.obsWebSocketPassword || '';
    try {
      const palette = await readActivePalette();
      const out = await refreshObsBrowserSources({ port, password, log, palette });
      res.json({ ok: true, palette, ...out });
    } catch (err) {
      log.error(`refresh-obs failed: ${err.message}`);
      const hint = err.hint || (err.code === 'ECONNREFUSED'
        ? 'OBS not running, or WebSocket not enabled. Open OBS -> Tools -> WebSocket Server Settings and enable it, then try again.'
        : null);
      res.status(502).json({ error: err.message, hint });
    }
  });

  // POST /save-theme  body: { name }
  // Copies the currently active sasi-overlays/ folder to sasi-overlays-<name>/.
  // Refuses to overwrite an existing folder of the same name.
  app.post('/save-theme', async (req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    const name = (req.body && req.body.name) ? String(req.body.name).trim() : '';
    if (!isSafeThemeName(name)) return res.status(400).json({ error: 'invalid theme name (alphanumerics + dash/underscore, 1-40 chars)' });
    if (name === 'archived' || name === 'active') return res.status(400).json({ error: 'reserved name' });
    const activeFolder = path.join(installDir, 'sasi-overlays');
    const dest = path.join(installDir, 'sasi-overlays-' + name);
    if (!existsSync(activeFolder)) return res.status(400).json({ error: 'no active theme to save' });
    if (existsSync(dest)) return res.status(409).json({ error: 'theme already exists: sasi-overlays-' + name + ' (delete it first or pick another name)' });
    try {
      // Serialize with apply/delete-theme so a concurrent /apply-theme can't
      // rename the active folder out from under us while fs.cp is mid-copy.
      await withThemeLock(() => fs.cp(activeFolder, dest, { recursive: true, force: false }));
      log.info(`save-theme: copied active -> sasi-overlays-${name}`);
      res.json({ ok: true, savedAs: 'sasi-overlays-' + name });
    } catch (err) {
      log.error(`save-theme failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /delete-theme  body: { name }
  // Removes a non-active theme folder.
  app.post('/delete-theme', async (req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    const name = (req.body && req.body.name) ? String(req.body.name).trim() : '';
    if (!isSafeThemeName(name)) return res.status(400).json({ error: 'invalid theme name' });
    const target = path.join(installDir, 'sasi-overlays-' + name);
    if (!existsSync(target)) return res.status(404).json({ error: 'theme not found' });
    try {
      // Serialize with apply/save-theme — concurrent /apply-theme could be
      // mid-rename of the same folder we're about to delete.
      await withThemeLock(() => fs.rm(target, { recursive: true, force: true }));
      log.info(`delete-theme: removed sasi-overlays-${name}`);
      res.json({ ok: true });
    } catch (err) {
      log.error(`delete-theme failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== STINGERS =====
  // OBS Stinger transition points at a single filename: stinger-active.webm
  // (in the active theme's stingers/ folder). Picker = atomic rename:
  //   target.webm        â†’ stinger-active.webm
  //   stinger-active.webm â†’ stinger-active-archived-<timestamp>.webm
  // OBS keeps working because the path it points at didn't change.

  app.get('/list-stingers', async (_req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    const stingersDir = path.join(installDir, 'sasi-overlays', 'stingers');
    try {
      if (!existsSync(stingersDir)) return res.json({ stingers: [], active: null });
      const entries = await fs.readdir(stingersDir, { withFileTypes: true });
      const stingers = [];
      let active = null;
      for (const ent of entries) {
        if (!ent.isFile() || !/\.webm$/i.test(ent.name)) continue;
        const full = path.join(stingersDir, ent.name);
        const stat = await fs.stat(full);
        const isActive = ent.name === 'stinger-active.webm';
        const isArchived = ent.name.startsWith('stinger-active-archived-');
        const item = {
          name: ent.name,
          size: stat.size,
          mtime: stat.mtimeMs,
          fileUrl: 'file:///' + toWebPath(full),
          isActive,
          isArchived,
        };
        if (isActive) active = item;
        stingers.push(item);
      }
      stingers.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
      res.json({ stingers, active });
    } catch (err) {
      log.error(`list-stingers failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /list-stinger-generators â€” *.html files in the active theme's stingers/
  // folder. These are TOOLS users open in their browser to record a webm; they
  // aren't stingers themselves.
  app.get('/list-stinger-generators', async (_req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    const stingersDir = path.join(installDir, 'sasi-overlays', 'stingers');
    try {
      if (!existsSync(stingersDir)) return res.json({ generators: [] });
      const entries = await fs.readdir(stingersDir, { withFileTypes: true });
      const generators = [];
      for (const ent of entries) {
        if (!ent.isFile() || !/\.html?$/i.test(ent.name)) continue;
        const full = path.join(stingersDir, ent.name);
        const stat = await fs.stat(full);
        generators.push({
          name: ent.name,
          size: stat.size,
          mtime: stat.mtimeMs,
          fileUrl: 'file:///' + toWebPath(full),
        });
      }
      generators.sort((a, b) => a.name.localeCompare(b.name));
      res.json({ generators });
    } catch (err) {
      log.error(`list-stinger-generators failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /upload-stinger  body: { filename, dataBase64, activate? }
  // Writes the decoded webm into the active theme's stingers/ folder. If
  // activate=true, also renames it to stinger-active.webm (archiving previous).
  // Used by the dashboard's "Generate webm + Make active" flow on HTML stingers.
  app.post('/upload-stinger', async (req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    const { filename, dataBase64, activate } = req.body || {};
    if (!filename || typeof filename !== 'string') return res.status(400).json({ error: 'filename required' });
    if (!/^[a-zA-Z0-9._-]+\.webm$/i.test(filename)) return res.status(400).json({ error: 'filename must end .webm and be alphanumerics + dash/underscore/dot' });
    if (filename === 'stinger-active.webm') return res.status(400).json({ error: 'use a generator-derived name like stinger-generated-<ts>.webm; the dashboard will activate it for you' });
    if (!dataBase64 || typeof dataBase64 !== 'string') return res.status(400).json({ error: 'dataBase64 required' });

    const stingersDir = path.join(installDir, 'sasi-overlays', 'stingers');
    try {
      if (!existsSync(stingersDir)) await fs.mkdir(stingersDir, { recursive: true });
      // Strip data: URL prefix if the client sent one
      const clean = dataBase64.replace(/^data:[^,]+,/, '');
      const buf = Buffer.from(clean, 'base64');
      if (buf.length === 0) return res.status(400).json({ error: 'decoded data is empty' });
      if (buf.length > 50 * 1024 * 1024) return res.status(413).json({ error: 'stinger > 50 MB - keep it under 5 seconds' });
      const dest = path.join(stingersDir, filename);

      // Serialize the activate step with the other theme/stinger ops to prevent
      // a concurrent /apply-stinger from racing with our rename + copyFile.
      const result = await withThemeLock(async () => {
        await fs.writeFile(dest, buf);
        log.info(`upload-stinger: ${dest} (${buf.length} bytes)`);
        let archivedAs = null;
        let activated = false;
        if (activate) {
          const active = path.join(stingersDir, 'stinger-active.webm');
          if (existsSync(active)) {
            const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
            const archive = path.join(stingersDir, 'stinger-active-archived-' + stamp + '.webm');
            await fs.rename(active, archive);
            archivedAs = path.basename(archive);
          }
          // We copy (not rename) so the original generated file is preserved in the
          // grid as the "source webm" and stinger-active.webm becomes a duplicate
          // pointing at the same content. Lets the user swap back later.
          await fs.copyFile(dest, active);
          activated = true;
        }
        return { archivedAs, activated };
      });
      res.json({ ok: true, filename, bytes: buf.length, activated: result.activated, archivedAs: result.archivedAs });
    } catch (err) {
      log.error(`upload-stinger failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /apply-stinger  body: { file }  â€” file is the filename to promote.
  app.post('/apply-stinger', async (req, res) => {
    if (!installDir) return res.status(500).json({ error: 'installDir not configured' });
    const file = (req.body && req.body.file) ? String(req.body.file).trim() : '';
    if (!file || !/^[a-zA-Z0-9._-]+\.webm$/i.test(file)) return res.status(400).json({ error: 'invalid stinger filename' });
    if (file === 'stinger-active.webm') return res.status(400).json({ error: 'already active' });
    const stingersDir = path.join(installDir, 'sasi-overlays', 'stingers');
    const target = path.join(stingersDir, file);
    const active = path.join(stingersDir, 'stinger-active.webm');
    if (!existsSync(target)) return res.status(404).json({ error: 'stinger file not found: ' + file });
    try {
      const archivedAs = await withThemeLock(async () => {
        let archivedAs = null;
        if (existsSync(active)) {
          const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
          const archive = path.join(stingersDir, 'stinger-active-archived-' + stamp + '.webm');
          await fs.rename(active, archive);
          archivedAs = path.basename(archive);
        }
        try {
          await fs.rename(target, active);
        } catch (renameErr) {
          // Rollback archive
          if (archivedAs && !existsSync(active)) {
            await fs.rename(path.join(stingersDir, archivedAs), active).catch(() => {});
          }
          throw renameErr;
        }
        return archivedAs;
      });
      log.info(`apply-stinger: ${file} now active${archivedAs ? ' (previous -> ' + archivedAs + ')' : ''}`);
      res.json({ ok: true, active: 'stinger-active.webm', archivedAs });
    } catch (err) {
      log.error(`apply-stinger failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== CHANNELS =====
  // Channels live in sasi-secrets.js under `channels: { <key>: {brand, theme, youtube, twitch} }`.
  // The active channel is `activeChannel`. Switching = update activeChannel, write secrets back,
  // and apply that channel's theme via the same atomic-rename flow as /apply-theme.

  // GET /list-channels â€” returns [{ key, name, tagline, theme, active }, ...]
  app.get('/list-channels', async (_req, res) => {
    if (!secretsPath) return res.status(500).json({ error: 'secretsPath not configured' });
    try {
      let parsed = null;
      if (existsSync(secretsPath)) {
        parsed = parseSecretsFile(await fs.readFile(secretsPath, 'utf8'));
      }
      if (!parsed && existsSync(secretsExamplePath)) {
        parsed = parseSecretsFile(await fs.readFile(secretsExamplePath, 'utf8'));
      }
      if (!parsed || !parsed.channels) return res.json({ channels: [], activeChannel: '' });
      const channels = Object.entries(parsed.channels).map(([key, c]) => ({
        key,
        name: c.brand?.name || key,
        tagline: c.brand?.tagline || '',
        theme: c.theme || 'sasi-overlays',
        active: key === parsed.activeChannel,
      }));
      res.json({ channels, activeChannel: parsed.activeChannel || '' });
    } catch (err) {
      log.error(`list-channels failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /switch-channel  body: { key }
  // Updates activeChannel + applies the channel's theme. Returns { ok, key, theme, archivedAs }.
  app.post('/switch-channel', async (req, res) => {
    if (!secretsPath) return res.status(500).json({ error: 'secretsPath not configured' });
    const key = (req.body && req.body.key) ? String(req.body.key).trim() : '';
    if (!key || !/^[a-zA-Z0-9_-]{1,40}$/.test(key)) return res.status(400).json({ error: 'invalid channel key' });
    try {
      // Whole switch is serialized: applyThemeByName + secrets write must
      // happen as a single unit so a concurrent /apply-theme can't race the
      // rename, and a concurrent /switch-channel can't write a stale
      // activeChannel value over a fresh one.
      const result = await withThemeLock(async () => {
        let parsed = null;
        if (existsSync(secretsPath)) parsed = parseSecretsFile(await fs.readFile(secretsPath, 'utf8'));
        if (!parsed) parsed = defaultSecrets();
        if (!parsed.channels || !parsed.channels[key]) {
          throw Object.assign(new Error('channel not found: ' + key), { status: 404 });
        }
        const channel = parsed.channels[key];
        const themeFolder = channel.theme || 'sasi-overlays';
        let archivedAs = null;
        if (themeFolder === 'sasi-overlays') {
          // Already the active folder name — no swap needed.
        } else if (themeFolder.startsWith('sasi-overlays-')) {
          const suffix = themeFolder.slice('sasi-overlays-'.length);
          const r = await applyThemeByName(suffix);
          archivedAs = r.archivedAs;
        } else {
          throw Object.assign(new Error('channel.theme must be sasi-overlays or sasi-overlays-<name>'), { status: 400 });
        }
        parsed.activeChannel = key;
        await fs.writeFile(secretsPath, serializeSecretsFile(parsed), { encoding: 'utf8' });
        return { themeFolder, archivedAs };
      });
      log.info(`switch-channel: ${key} (theme ${result.themeFolder}${result.archivedAs ? ', previous -> ' + result.archivedAs : ''})`);
      res.json({ ok: true, key, theme: result.themeFolder, archivedAs: result.archivedAs });
    } catch (err) {
      const status = err.status || 500;
      log.error(`switch-channel failed: ${err.message}`);
      res.status(status).json({ error: err.message });
    }
  });

  // POST /stop â€” exit without respawning. Dashboard offers START hint after.
  app.post('/stop', (_req, res) => {
    res.json({ ok: true });
    log.warn('Stop requested via API; exiting (no auto-relaunch)');
    setTimeout(() => process.exit(0), 200);
  });

  // ===== SECRETS (sasi-studio v2 Keys tab) =====
  // sasi-secrets.js lives at install dir root (one level above the active
  // theme's sasi-overlays/ folder). Reason: themes get swapped via folder
  // rename, and we don't want secrets to ride along into the archive.
  // Format: a JS file that assigns window.SASI_SECRETS = {...}.
  const secretsPath = installDir ? path.join(installDir, 'sasi-secrets.js') : '';
  const secretsExamplePath = installDir ? path.join(installDir, 'sasi-secrets.example.js') : '';

  function defaultSecrets() {
    return {
      activeChannel: 'sasi-streams',
      streamelements: { youtube: { jwt: '' }, twitch: { jwt: '' } },
      channels: {
        'sasi-streams': {
          brand: { name: 'SASI STREAMS', tagline: 'LIVE STREAM', logo: 'assets/Sasi_Streams_logo.png' },
          theme: 'sasi-overlays',
          youtube: { apiKeys: [], channelId: '' },
          // username = IRC chat. clientId/clientSecret reserved for future
          // Twitch API features (followers, channel points). Optional â€” blank is fine.
          twitch: { username: '', clientId: '', clientSecret: '' },
        },
      },
    };
  }

  // Parse secrets.js by extracting the assigned object. Tolerates either
  // `window.SASI_SECRETS = {...}` or `const SASI_SECRETS = {...};`.
  //
  // The pattern must be GREEDY (`[\s\S]*` not `[\s\S]*?`). The previous lazy
  // form stopped at the first `}` it found — which for the multi-channel
  // shape is the inner `streamelements.youtube` block — so the captured
  // string was a truncated, syntactically incomplete fragment and the
  // Function() eval threw. Result: every call to GET /secrets silently
  // returned the example defaults, /switch-channel 404'd on every valid key.
  // Greedy match runs to the LAST `}` before the trailing `;` at end-of-file,
  // which is what we want.
  function parseSecretsFile(text) {
    const m = text.match(/SASI_SECRETS\s*=\s*(\{[\s\S]*\})\s*;?\s*(?:\n|$)/);
    if (!m) return null;
    try {
      // eval-ish but safe: it's a JS literal we just wrote. Use Function so
      // the {...} expression evaluates as an object (not a code block).
      return new Function('return ' + m[1])();
    } catch {
      return null;
    }
  }

  function serializeSecretsFile(obj) {
    const json = JSON.stringify(obj, null, 2);
    // Backwards-compat shim: older overlay code reads s.youtube / s.twitch
    // directly (single-channel shape). Project active channel up so nothing breaks.
    return `// AUTO-GENERATED by Sasi Studio dashboard. Hand-edits are preserved AS LONG
// AS you don't click Save in the dashboard's Keys tab — Save overwrites this
// file entirely (comments + extra top-level keys are lost on re-serialize).
// To make permanent additions, edit this file AND save via the dashboard so
// the round-trip is consistent. Loaded by every overlay scene via
// lib/secrets.js stub loader. Never commit this file.
window.SASI_SECRETS = ${json};

(function () {
  const s = window.SASI_SECRETS;
  if (!s || !s.channels) return;
  const active = s.channels[s.activeChannel];
  if (!active) return;
  if (!s.youtube) s.youtube = active.youtube;
  if (!s.twitch)  s.twitch  = active.twitch;
})();
`;
  }

  app.get('/secrets', async (_req, res) => {
    if (!secretsPath) return res.status(500).json({ error: 'secretsPath not configured' });
    try {
      let parsed = null;
      if (existsSync(secretsPath)) {
        const text = await fs.readFile(secretsPath, 'utf8');
        parsed = parseSecretsFile(text);
      }
      if (!parsed && existsSync(secretsExamplePath)) {
        const text = await fs.readFile(secretsExamplePath, 'utf8');
        parsed = parseSecretsFile(text);
      }
      res.json(parsed || defaultSecrets());
    } catch (err) {
      log.error(`GET /secrets failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/secrets', async (req, res) => {
    if (!secretsPath) return res.status(500).json({ error: 'secretsPath not configured' });
    const incoming = req.body || {};
    // Validate shape â€” must have at least the top-level keys
    if (typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ error: 'body must be an object' });
    }
    // Multi-channel shape: trust whatever the dashboard sends (the Keys/Channels
    // tab owns the schema). Only fill in top-level defaults that are always required.
    const merged = {
      ...defaultSecrets(),
      ...incoming,
      streamelements: {
        youtube: { ...(defaultSecrets().streamelements.youtube), ...(incoming.streamelements?.youtube || {}) },
        twitch: { ...(defaultSecrets().streamelements.twitch), ...(incoming.streamelements?.twitch || {}) },
      },
      channels: incoming.channels || defaultSecrets().channels,
    };
    try {
      const text = serializeSecretsFile(merged);
      // Ensure parent dir exists
      const dir = path.dirname(secretsPath);
      if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(secretsPath, text, { encoding: 'utf8' });
      log.info('secrets.js updated via API');
      res.json({ ok: true });
    } catch (err) {
      log.error(`PUT /secrets failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
