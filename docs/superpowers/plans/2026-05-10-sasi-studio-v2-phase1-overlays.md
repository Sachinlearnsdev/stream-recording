# Sasi Studio v2 — Phase 1: Overlays Live Editor + Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v2 dashboard shell + the Overlays tab with live in-browser preview, by moving the scene HTML files from the user's OBS bundle into the repo and adding live-update infrastructure.

**Architecture:** New `dashboard-v2.html` built alongside the current `dashboard.html` (no swap until Phase 3). Scene HTML files copied from `New folder/basic/sasi-overlays/` into `Overlay/sasi-overlays/scenes/` and `Overlay/sasi-overlays/lib/`. New `lib/live-update.js` defines `registerLiveUpdater(key, fn)`; each scene calls it at load time for live-updateable fields. Dashboard writes to `localStorage['sasi_<key>']` → browser fires `storage` event in iframe contexts → scene's listener updates DOM. OBS browser sources still require manual refresh (out of Phase 1 scope — would need a watcher broadcast endpoint).

**Tech Stack:** Vanilla HTML/CSS/JS, no framework, no build. Existing `tokens.css` from v1.

**Spec:** [docs/superpowers/specs/2026-05-10-sasi-studio-v2-dashboard.md](../specs/2026-05-10-sasi-studio-v2-dashboard.md)

---

## File map

| Path | Action | Purpose |
|---|---|---|
| `Overlay/sasi-overlays/scenes/{starting-soon,brb,stream-ending,overlay,just-chatting,breaking-news,transition,bg}.html` | Create (8 files copied + modified) | Scene HTMLs with live-update wiring |
| `Overlay/sasi-overlays/components/{likes,nametag,subscribe,terminal-alerts,webcam}.html` | Create (5 files copied as-is) | Scene sub-components |
| `Overlay/sasi-overlays/lib/{config,alerts,chat,bg-all,notifications}.js` | Create (5 files copied as-is) | Existing overlay JS modules |
| `Overlay/sasi-overlays/lib/live-update.js` | Create | New: storage event listener framework |
| `Overlay/sasi-overlays/lib/effects.css` | Create (copied as-is) | Existing effects styles |
| `Overlay/sasi-overlays/secrets.example.js` | Create (copied) | API keys template |
| `Overlay/sasi-overlays/dashboard-v2.html` | Create | New dashboard (does not replace dashboard.html) |
| `.gitignore` | Modify | Allow `Overlay/sasi-overlays/lib/` etc., keep `secrets.js` ignored |
| `Overlay/clip-prep/install.bat` | Modify | Copy `Overlay/sasi-overlays/{scenes,components,lib,assets}` into install dir on install |
| `Overlay/clip-prep/bootstrap.bat` | Modify | Same as install.bat |

---

## Task 1: Copy overlay files into repo

**Files:**
- Create: `Overlay/sasi-overlays/scenes/` (copy from `New folder/basic/sasi-overlays/scenes/`)
- Create: `Overlay/sasi-overlays/components/` (copy from `New folder/basic/sasi-overlays/components/`)
- Create: `Overlay/sasi-overlays/lib/{config.js,alerts.js,chat.js,bg-all.js,notifications.js,effects.css}` (copy from `New folder/basic/sasi-overlays/`)
- Create: `Overlay/sasi-overlays/secrets.example.js` (copy)

The user's bundle at `New folder/basic/sasi-overlays/` has the canonical files. Copy them into the repo — these become the version-controlled source of truth.

- [ ] **Step 1: Verify source files exist**

```bash
ls "New folder/basic/sasi-overlays/scenes/" "New folder/basic/sasi-overlays/components/" "New folder/basic/sasi-overlays/"*.js "New folder/basic/sasi-overlays/effects.css"
```

Expected: 8 scene HTMLs, 5 component HTMLs, 5 .js files, effects.css all present.

- [ ] **Step 2: Create destination directories**

```bash
mkdir -p Overlay/sasi-overlays/scenes Overlay/sasi-overlays/components Overlay/sasi-overlays/lib
```

- [ ] **Step 3: Copy scenes**

```bash
cp "New folder/basic/sasi-overlays/scenes/"*.html Overlay/sasi-overlays/scenes/
ls Overlay/sasi-overlays/scenes/
```

Expected: 8 files (bg.html, brb.html, breaking-news.html, just-chatting.html, overlay.html, starting-soon.html, stream-ending.html, transition.html).

- [ ] **Step 4: Copy components**

```bash
cp "New folder/basic/sasi-overlays/components/"*.html Overlay/sasi-overlays/components/
ls Overlay/sasi-overlays/components/
```

Expected: 5 files (likes.html, nametag.html, subscribe.html, terminal-alerts.html, webcam.html).

- [ ] **Step 5: Copy lib files (.js + effects.css)**

```bash
cp "New folder/basic/sasi-overlays/config.js" \
   "New folder/basic/sasi-overlays/alerts.js" \
   "New folder/basic/sasi-overlays/chat.js" \
   "New folder/basic/sasi-overlays/bg-all.js" \
   "New folder/basic/sasi-overlays/notifications.js" \
   "New folder/basic/sasi-overlays/effects.css" \
   Overlay/sasi-overlays/lib/
ls Overlay/sasi-overlays/lib/
```

Expected: 6 files.

- [ ] **Step 6: Copy secrets.example.js**

```bash
cp "New folder/basic/sasi-overlays/secrets.example.js" Overlay/sasi-overlays/secrets.example.js
```

Do NOT copy `secrets.js` — it has real API keys and stays gitignored.

- [ ] **Step 7: Fix script src paths in scenes (now `lib/...` not `../...`)**

The scene files reference scripts as `<script src="../config.js">` but in the new layout they're at `lib/config.js`. Update each scene:

```bash
for f in Overlay/sasi-overlays/scenes/*.html; do
  sed -i 's|src="\.\./config\.js"|src="../lib/config.js"|g; s|src="\.\./secrets\.js"|src="../lib/secrets.js"|g; s|src="\.\./alerts\.js"|src="../lib/alerts.js"|g; s|src="\.\./chat\.js"|src="../lib/chat.js"|g; s|src="\.\./bg-all\.js"|src="../lib/bg-all.js"|g; s|src="\.\./notifications\.js"|src="../lib/notifications.js"|g; s|href="\.\./effects\.css"|href="../lib/effects.css"|g' "$f"
done
grep -l 'src="\.\./.*\.js"' Overlay/sasi-overlays/scenes/*.html || echo "all paths updated"
```

Expected last line: `all paths updated`.

Also: `lib/config.js` itself injects `chat.js` and `effects.css` via dynamic `<script>` tags (lines 467+). Update those paths too:

```bash
sed -i "s|'\.\./chat\.js'|'./chat.js'|g; s|'\.\./effects\.css'|'./effects.css'|g; s|'chat\.js'|'./chat.js'|g; s|'effects\.css'|'./effects.css'|g" Overlay/sasi-overlays/lib/config.js
grep -n "chat\.js\|effects\.css" Overlay/sasi-overlays/lib/config.js
```

Verify the paths printed are all `./chat.js` or `./effects.css` (relative to lib/).

- [ ] **Step 8: Commit**

```bash
git add Overlay/sasi-overlays/scenes Overlay/sasi-overlays/components Overlay/sasi-overlays/lib Overlay/sasi-overlays/secrets.example.js
git commit -m "feat(overlays): vendor overlay files into repo

Moves scene HTMLs (8), components (5), and lib JS (config/alerts/chat/
bg-all/notifications + effects.css) from the user's OBS bundle export
into the dev repo. These become the version-controlled source of truth
that bootstrap copies into the install dir.

Path adjustments: scenes now use ../lib/config.js etc. (was ../config.js).
config.js dynamic injects use ./chat.js and ./effects.css (relative to lib/)."
```

---

## Task 2: Update .gitignore

**Files:**
- Modify: `.gitignore`

The `New folder/` is gitignored, but now we have a sibling structure at `Overlay/sasi-overlays/scenes` etc. that SHOULD be tracked. Need to add an explicit ignore for `Overlay/sasi-overlays/lib/secrets.js` (in case anyone copies one in).

- [ ] **Step 1: Read current .gitignore**

```bash
cat .gitignore
```

Expected output includes the existing entries (node_modules, config.json, games.json, clip-prep.log, *.bak, .superpowers/, New folder/, etc.).

- [ ] **Step 2: Append the secrets.js ignore + clarification comment**

Use Edit tool to append to `.gitignore`:

OLD (the last lines of the file):
```
# OBS bundles — exported user config, never commit (may contain personal paths/settings)
New folder/
obs-export/
obs-export-*/
*-bundle/
```

NEW:
```
# OBS bundles — exported user config, never commit (may contain personal paths/settings)
New folder/
obs-export/
obs-export-*/
*-bundle/

# Overlay secrets (API keys) — never commit
Overlay/sasi-overlays/secrets.js
Overlay/sasi-overlays/lib/secrets.js
```

- [ ] **Step 3: Verify nothing accidentally ignored**

```bash
git check-ignore -v Overlay/sasi-overlays/scenes/starting-soon.html Overlay/sasi-overlays/lib/config.js
```

Expected: both should print empty (no rule matches them — they're trackable).

```bash
git check-ignore -v Overlay/sasi-overlays/secrets.js
```

Expected: should print a rule match (file is correctly ignored even though it doesn't exist yet).

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore Overlay/sasi-overlays/secrets.js

Real API keys must never enter the repo. Both possible locations
(direct sibling of dashboard, and inside lib/) are now ignored."
```

---

## Task 3: Add `lib/live-update.js` framework

**Files:**
- Create: `Overlay/sasi-overlays/lib/live-update.js`

This is the new infrastructure. Scenes register per-key DOM-update callbacks; the framework dispatches storage events to the right callback.

- [ ] **Step 1: Write the file**

Use Write tool to create `Overlay/sasi-overlays/lib/live-update.js`:

```js
// ============================================================
//  SASI STUDIO — Live update framework
//  Scenes call registerLiveUpdater(key, fn) at load time.
//  When the dashboard writes to localStorage['sasi_<key>'],
//  the storage event fires here and we call the registered fn.
// ============================================================

(function () {
  const handlers = new Map(); // sasi_key -> [fn, fn, ...]

  // Register a handler for a specific localStorage key (without the sasi_ prefix).
  // Multiple handlers can register for the same key (e.g. text + class update).
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

  // Listen for storage changes from other windows/iframes (the dashboard).
  window.addEventListener('storage', function (e) {
    if (!e.key || !handlers.has(e.key)) return;
    const fns = handlers.get(e.key);
    for (const fn of fns) {
      try { fn(e.newValue); } catch (err) { console.warn('[live-update] handler for ' + e.key + ' threw:', err); }
    }
  });

  // Convenience helpers for common patterns
  window.liveUpdate = {
    text: (selector) => (value) => {
      const el = document.querySelector(selector);
      if (el) el.textContent = value || '';
    },
    cssVar: (varName) => (value) => {
      if (value) document.documentElement.style.setProperty(varName, value);
    },
    show: (selector) => (value) => {
      const el = document.querySelector(selector);
      if (el) el.style.display = (value === 'true' || value === true) ? '' : 'none';
    },
    attr: (selector, attrName) => (value) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attrName, value || '');
    },
  };

  console.log('[live-update] framework loaded');
})();
```

- [ ] **Step 2: Quick sanity check (file parses)**

```bash
node --check Overlay/sasi-overlays/lib/live-update.js
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add Overlay/sasi-overlays/lib/live-update.js
git commit -m "feat(overlays): add live-update framework

registerLiveUpdater(key, fn) lets scenes subscribe to dashboard
localStorage changes via the storage event. applyLiveUpdaters()
applies current values on load. Convenience helpers for text/cssVar/
show/attr cover ~90% of update patterns."
```

---

## Task 4: Wire live-update in starting-soon.html

**Files:**
- Modify: `Overlay/sasi-overlays/scenes/starting-soon.html`

Add the live-update.js script tag and registerLiveUpdater calls for the live-editable fields.

- [ ] **Step 1: Add live-update.js script tag**

Find the existing `<script src="../lib/config.js"></script>` line (near top of `<head>`). After the line `<script src="../lib/alerts.js"></script>`, add:

```html
<script src="../lib/live-update.js"></script>
```

- [ ] **Step 2: Identify the elements to live-update**

Read the file to find the elements that render: badge, top text, main text, next stream label. Likely IDs/classes:
- Badge: `.ss-badge` or similar
- Top text: `.ss-top` or `#top-text`
- Main text: `.ss-main` or `#main-text`
- Next stream: `.ss-next` or similar

```bash
grep -n 'startingSoon\.\|ss-\|class="badge"\|class="main' Overlay/sasi-overlays/scenes/starting-soon.html | head -20
```

Note the actual class names from the file.

- [ ] **Step 3: Add registerLiveUpdater calls inside the existing inline `<script>` block**

At the END of the existing inline `<script>` block (before `</script>`), append:

```js
// === Live updates from dashboard ===
if (window.registerLiveUpdater) {
  // Text fields — adjust selectors to match actual DOM
  registerLiveUpdater('ss_badge',     liveUpdate.text('.ss-badge, [data-bind="ss_badge"]'));
  registerLiveUpdater('ss_topText',   liveUpdate.text('.ss-top, [data-bind="ss_topText"]'));
  registerLiveUpdater('ss_mainText',  liveUpdate.text('.ss-main, [data-bind="ss_mainText"]'));
  registerLiveUpdater('ss_nextStream',liveUpdate.text('.ss-next, [data-bind="ss_nextStream"]'));

  // Toggles
  registerLiveUpdater('ss_clock',  liveUpdate.show('.clock-wrap, [data-toggle="clock"]'));
  registerLiveUpdater('ss_ticker', liveUpdate.show('.ticker-wrap, [data-toggle="ticker"]'));

  // Common — colors
  registerLiveUpdater('cRed',    liveUpdate.cssVar('--red'));
  registerLiveUpdater('cOrange', liveUpdate.cssVar('--orange'));
  registerLiveUpdater('cGold',   liveUpdate.cssVar('--gold'));

  // Apply current values on first paint
  applyLiveUpdaters();
}
```

If grep in Step 2 showed different selectors than my guesses, replace the selectors with the real ones.

- [ ] **Step 4: Add `data-bind` attributes to the actual DOM elements**

The `data-bind` attributes provide a stable hook even if the user changes class names. Find the elements in the file and add `data-bind` attributes:

For example, if the badge currently looks like:
```html
<div class="badge">STARTING SOON</div>
```

Change to:
```html
<div class="badge" data-bind="ss_badge">STARTING SOON</div>
```

Apply the same pattern for: top text (`data-bind="ss_topText"`), main text (`data-bind="ss_mainText"`), next stream (`data-bind="ss_nextStream"`).

For the clock and ticker wrappers, add `data-toggle="clock"` and `data-toggle="ticker"` to the wrapper divs.

- [ ] **Step 5: Verify the file still parses (open in browser)**

```bash
# Static parse check via Node (HTML isn't fully validated but JS errors will show)
node -e "const fs=require('fs'); const html=fs.readFileSync('Overlay/sasi-overlays/scenes/starting-soon.html','utf8'); const m=html.match(/<script>([\s\S]*?)<\/script>/g); for (const s of (m||[])) { try { new Function(s.replace(/<\/?script[^>]*>/g,'')); } catch(e) { console.error('SCRIPT PARSE FAIL:', e.message); process.exit(1); } } console.log('all inline scripts parse');"
```

Expected: `all inline scripts parse`.

- [ ] **Step 6: Commit**

```bash
git add Overlay/sasi-overlays/scenes/starting-soon.html
git commit -m "feat(starting-soon): live-update wiring

Subscribes to dashboard localStorage changes for badge, top text,
main text, next stream label, clock/ticker toggles, and brand colors.
data-bind/data-toggle attrs added for stable DOM hooks."
```

---

## Task 5: Wire live-update in brb.html, stream-ending.html, overlay.html, just-chatting.html

**Files:**
- Modify: `Overlay/sasi-overlays/scenes/brb.html`
- Modify: `Overlay/sasi-overlays/scenes/stream-ending.html`
- Modify: `Overlay/sasi-overlays/scenes/overlay.html`
- Modify: `Overlay/sasi-overlays/scenes/just-chatting.html`

Same pattern as Task 4, applied to four more scenes. Each scene gets:
1. `<script src="../lib/live-update.js"></script>` after the alerts.js line
2. registerLiveUpdater calls at end of inline `<script>` block
3. `data-bind` / `data-toggle` attrs on the relevant DOM elements
4. `applyLiveUpdaters()` call

The keys differ per scene (matching dashboard inputs). Reference table:

| Scene | Live-update keys |
|---|---|
| brb | `brb_badge` (text), `brb_mainText` (text), `brb_subtext` (text), `brb_tagline` (text), `brb_clock` (show), `brb_ticker` (show), colors |
| stream-ending | `end_badge`, `end_tagline`, `end_thanks`, `end_main`, `end_sub`, `end_ticker` (show), colors |
| overlay (in-game) | `sub_items` (text), `likes_items` (text), `nametag` (text), colors |
| just-chatting | `nametag` (text), colors. (Game tile content stays config-driven — re-renders on full reload.) |

- [ ] **Step 1: Wire brb.html**

Read `Overlay/sasi-overlays/scenes/brb.html` to find the actual selectors. Then:

a) Add `<script src="../lib/live-update.js"></script>` after the alerts.js line in `<head>`.

b) At end of inline `<script>` block, append:

```js
if (window.registerLiveUpdater) {
  registerLiveUpdater('brb_badge',    liveUpdate.text('[data-bind="brb_badge"]'));
  registerLiveUpdater('brb_mainText', liveUpdate.text('[data-bind="brb_mainText"]'));
  registerLiveUpdater('brb_subtext',  liveUpdate.text('[data-bind="brb_subtext"]'));
  registerLiveUpdater('brb_tagline',  liveUpdate.text('[data-bind="brb_tagline"]'));
  registerLiveUpdater('brb_clock',    liveUpdate.show('[data-toggle="clock"]'));
  registerLiveUpdater('brb_ticker',   liveUpdate.show('[data-toggle="ticker"]'));
  registerLiveUpdater('cRed',    liveUpdate.cssVar('--red'));
  registerLiveUpdater('cOrange', liveUpdate.cssVar('--orange'));
  registerLiveUpdater('cGold',   liveUpdate.cssVar('--gold'));
  applyLiveUpdaters();
}
```

c) Add `data-bind`/`data-toggle` attrs to the DOM elements (badge, main, subtext, tagline, clock-wrap, ticker-wrap).

- [ ] **Step 2: Wire stream-ending.html**

Same pattern. Append:

```js
if (window.registerLiveUpdater) {
  registerLiveUpdater('end_badge',   liveUpdate.text('[data-bind="end_badge"]'));
  registerLiveUpdater('end_tagline', liveUpdate.text('[data-bind="end_tagline"]'));
  registerLiveUpdater('end_thanks',  liveUpdate.text('[data-bind="end_thanks"]'));
  registerLiveUpdater('end_main',    liveUpdate.text('[data-bind="end_main"]'));
  registerLiveUpdater('end_sub',     liveUpdate.text('[data-bind="end_sub"]'));
  registerLiveUpdater('end_ticker',  liveUpdate.show('[data-toggle="ticker"]'));
  registerLiveUpdater('cRed',    liveUpdate.cssVar('--red'));
  registerLiveUpdater('cOrange', liveUpdate.cssVar('--orange'));
  registerLiveUpdater('cGold',   liveUpdate.cssVar('--gold'));
  applyLiveUpdaters();
}
```

Add corresponding `data-bind` attributes.

- [ ] **Step 3: Wire overlay.html**

Append:

```js
if (window.registerLiveUpdater) {
  registerLiveUpdater('sub_items',   liveUpdate.text('[data-bind="sub_items"]'));
  registerLiveUpdater('likes_items', liveUpdate.text('[data-bind="likes_items"]'));
  registerLiveUpdater('nametag',     liveUpdate.text('[data-bind="nametag"]'));
  registerLiveUpdater('cRed',    liveUpdate.cssVar('--red'));
  registerLiveUpdater('cOrange', liveUpdate.cssVar('--orange'));
  registerLiveUpdater('cGold',   liveUpdate.cssVar('--gold'));
  applyLiveUpdaters();
}
```

Add `data-bind` attributes.

- [ ] **Step 4: Wire just-chatting.html**

Append:

```js
if (window.registerLiveUpdater) {
  registerLiveUpdater('nametag', liveUpdate.text('[data-bind="nametag"]'));
  registerLiveUpdater('cRed',    liveUpdate.cssVar('--red'));
  registerLiveUpdater('cOrange', liveUpdate.cssVar('--orange'));
  registerLiveUpdater('cGold',   liveUpdate.cssVar('--gold'));
  applyLiveUpdaters();
}
```

Add `data-bind="nametag"` to the nametag element.

- [ ] **Step 5: Verify all four files parse**

```bash
for f in brb stream-ending overlay just-chatting; do
  node -e "const fs=require('fs'); const html=fs.readFileSync('Overlay/sasi-overlays/scenes/$f.html','utf8'); const m=html.match(/<script>([\s\S]*?)<\/script>/g); for (const s of (m||[])) { try { new Function(s.replace(/<\/?script[^>]*>/g,'')); } catch(e) { console.error('$f.html SCRIPT PARSE FAIL:', e.message); process.exit(1); } } console.log('$f.html: all inline scripts parse');"
done
```

Expected: 4 lines, each saying "all inline scripts parse".

- [ ] **Step 6: Commit**

```bash
git add Overlay/sasi-overlays/scenes/brb.html Overlay/sasi-overlays/scenes/stream-ending.html Overlay/sasi-overlays/scenes/overlay.html Overlay/sasi-overlays/scenes/just-chatting.html
git commit -m "feat(scenes): live-update wiring for brb/ending/overlay/just-chatting

Same pattern as starting-soon — each scene subscribes to dashboard
localStorage changes for its specific text fields + brand colors.
data-bind attributes added for stable selectors."
```

---

## Task 6: Update install.bat + bootstrap.bat to copy overlays into install dir

**Files:**
- Modify: `Overlay/clip-prep/install.bat`
- Modify: `Overlay/clip-prep/bootstrap.bat`

The install needs to copy `Overlay/sasi-overlays/{scenes,components,lib,assets}` into `%LOCALAPPDATA%\clip-prep\sasi-overlays\` so the dashboard's iframe previews can find them via relative path `./sasi-overlays/scenes/starting-soon.html`.

- [ ] **Step 1: Modify bootstrap.bat to copy overlay subfolders**

Read `Overlay/clip-prep/bootstrap.bat` to find the existing dashboard.html copy block (around lines 130-140 in the current file).

Find:

```bat
if exist "!_DASH_DIR!\dashboard.html" (
  copy /Y "!_DASH_DIR!\dashboard.html" "!INSTALL_DIR!\dashboard.html" >nul
  if exist "!_DASH_DIR!\assets" (
    if not exist "!INSTALL_DIR!\assets" mkdir "!INSTALL_DIR!\assets"
    robocopy "!_DASH_DIR!\assets" "!INSTALL_DIR!\assets" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
  )
  echo   Dashboard copied to install dir.
)
```

Replace with:

```bat
if exist "!_DASH_DIR!\dashboard.html" (
  copy /Y "!_DASH_DIR!\dashboard.html" "!INSTALL_DIR!\dashboard.html" >nul
  if exist "!_DASH_DIR!\dashboard-old.html" copy /Y "!_DASH_DIR!\dashboard-old.html" "!INSTALL_DIR!\dashboard-old.html" >nul
  if exist "!_DASH_DIR!\dashboard-v2.html" copy /Y "!_DASH_DIR!\dashboard-v2.html" "!INSTALL_DIR!\dashboard-v2.html" >nul
  if exist "!_DASH_DIR!\tokens.css" copy /Y "!_DASH_DIR!\tokens.css" "!INSTALL_DIR!\tokens.css" >nul
  if exist "!_DASH_DIR!\assets" (
    if not exist "!INSTALL_DIR!\assets" mkdir "!INSTALL_DIR!\assets"
    robocopy "!_DASH_DIR!\assets" "!INSTALL_DIR!\assets" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
  )
  rem  Copy overlay scenes/components/lib so dashboard can iframe-preview them
  if not exist "!INSTALL_DIR!\sasi-overlays" mkdir "!INSTALL_DIR!\sasi-overlays"
  for %%D in (scenes components lib) do (
    if exist "!_DASH_DIR!\%%D" (
      if not exist "!INSTALL_DIR!\sasi-overlays\%%D" mkdir "!INSTALL_DIR!\sasi-overlays\%%D"
      robocopy "!_DASH_DIR!\%%D" "!INSTALL_DIR!\sasi-overlays\%%D" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
    )
  )
  if exist "!_DASH_DIR!\secrets.example.js" copy /Y "!_DASH_DIR!\secrets.example.js" "!INSTALL_DIR!\sasi-overlays\secrets.example.js" >nul
  echo   Dashboard + overlays copied to install dir.
) else (
  echo   WARNING: dashboard.html not found at !_DASH_DIR!
)
```

- [ ] **Step 2: Verify install.bat doesn't need parallel changes**

```bash
grep -n "sasi-overlays\|dashboard\.html" Overlay/clip-prep/install.bat
```

`install.bat` runs after `bootstrap.bat` already copied the files, so it just runs npm install + sets up auto-start. No copy logic there. If grep shows references — print them, but they're likely just user-facing path strings.

- [ ] **Step 3: Commit**

```bash
git add Overlay/clip-prep/bootstrap.bat
git commit -m "chore(install): copy sasi-overlays/scenes,components,lib to install dir

Bootstrap now copies the version-controlled overlay files
(scenes/, components/, lib/) into %LOCALAPPDATA%\\clip-prep\\sasi-overlays\\
so the dashboard can iframe-preview them via relative path."
```

---

## Task 7: Create dashboard-v2.html shell

**Files:**
- Create: `Overlay/sasi-overlays/dashboard-v2.html`

Build the v2 dashboard shell with sidebar (6 tabs), tab switching, status poller, CSRF wrapper. Reuse the patterns from the existing `dashboard.html`.

- [ ] **Step 1: Write the shell HTML**

Use Write tool to create `Overlay/sasi-overlays/dashboard-v2.html`:

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
    background: var(--bg-sidebar);
    border-right: 1px solid var(--bg-divider);
    padding: var(--sp-5) 0;
    position: sticky; top: 0; height: 100vh;
    display: flex; flex-direction: column;
  }
  .main { flex: 1; padding: var(--sp-6) var(--sp-7); max-width: 1080px; }

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
  .sb-name { color: var(--text-primary); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
  .sb-ver  { color: var(--text-muted); font-size: 9px; letter-spacing: 0.12em; margin-top: 1px; }
  .sb-status { display: flex; align-items: center; gap: var(--sp-1); margin-top: var(--sp-3); }
  .sb-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); transition: background var(--t-fast); }
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

  /* Page header */
  .page-head { margin-bottom: var(--sp-6); }
  .page-eyebrow { font-size: 9px; letter-spacing: 0.18em; font-weight: 600; color: var(--text-muted); margin-bottom: var(--sp-1); text-transform: uppercase; }
  .page-title { font-size: var(--text-display); font-weight: 600; letter-spacing: -0.02em; }

  /* Tab panels */
  .panel { display: none; }
  .panel.active { display: block; }

  /* Placeholder card */
  .placeholder-card {
    background: var(--bg-card);
    border: 1px dashed var(--bg-border);
    border-radius: var(--r-card);
    padding: var(--sp-7);
    text-align: center;
  }
  .placeholder-title { font-size: var(--text-heading); font-weight: 600; margin-bottom: var(--sp-2); }
  .placeholder-desc { color: var(--text-secondary); max-width: 480px; margin: 0 auto; line-height: 1.6; }
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
          <div class="sb-ver">v2 · Phase 1</div>
        </div>
      </div>
      <div class="sb-status">
        <div class="sb-dot" id="sb-dot"></div>
        <span class="sb-status-text" id="sb-status-text">Connecting...</span>
      </div>
    </div>
    <nav class="tabs">
      <button class="tab-btn" data-tab="golive">● Go Live</button>
      <button class="tab-btn active" data-tab="overlays">Overlays</button>
      <button class="tab-btn" data-tab="alerts">Alerts</button>
      <button class="tab-btn" data-tab="games">Games</button>
      <button class="tab-btn" data-tab="stream">Stream</button>
      <button class="tab-btn" data-tab="keys">Keys</button>
    </nav>
  </aside>

  <main class="main">
    <section class="panel" data-panel="golive">
      <div class="page-head"><div class="page-eyebrow">Stream</div><div class="page-title">Go Live</div></div>
      <div class="placeholder-card">
        <div class="placeholder-title">Coming in Phase 4</div>
        <div class="placeholder-desc">Pre-stream prep — platform select, video ID, GO LIVE button, status panel, today's topic, fake mode toggle, notifications queue.</div>
      </div>
    </section>

    <section class="panel active" data-panel="overlays">
      <div class="page-head"><div class="page-eyebrow">Stream</div><div class="page-title">Overlays</div></div>
      <div id="overlays-content"><p style="color:var(--text-muted)">Building...</p></div>
    </section>

    <section class="panel" data-panel="alerts">
      <div class="page-head"><div class="page-eyebrow">Stream</div><div class="page-title">Alerts</div></div>
      <div class="placeholder-card">
        <div class="placeholder-title">Coming in Phase 5</div>
        <div class="placeholder-desc">Tier editor with 4 visual cards (₹ thresholds + duration sliders) + test buttons that fire fake alerts into the live preview.</div>
      </div>
    </section>

    <section class="panel" data-panel="games">
      <div class="page-head"><div class="page-eyebrow">Stream</div><div class="page-title">Games</div></div>
      <div class="placeholder-card">
        <div class="placeholder-title">Coming in Phase 5</div>
        <div class="placeholder-desc">Wheel of Fortune / Mystery Box / Highlight cost+rewards editor. <strong>Bug fix:</strong> SE redemptions will actually trigger the wheel-spin animation on stream.</div>
      </div>
    </section>

    <section class="panel" data-panel="stream">
      <div class="page-head"><div class="page-eyebrow">System</div><div class="page-title">Stream</div></div>
      <div class="placeholder-card">
        <div class="placeholder-title">Coming in Phase 2</div>
        <div class="placeholder-desc">User-facing top (recording status, REC pill, recordings list, mix splitter) + collapsed system accordion (paths, MKV browser, live log, games editor, lua install, bundle ops, danger zone).</div>
      </div>
    </section>

    <section class="panel" data-panel="keys">
      <div class="page-head"><div class="page-eyebrow">System</div><div class="page-title">Keys</div></div>
      <div class="placeholder-card">
        <div class="placeholder-title">Coming in Phase 6</div>
        <div class="placeholder-desc">YouTube API keys (multi-key with quota counter), Twitch IRC username, StreamElements JWTs (YT + Twitch). Edits secrets.js via watcher API.</div>
      </div>
    </section>
  </main>
</div>

<script>
  const API = 'http://127.0.0.1:6789';

  // CSRF wrapper
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
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    if (history.replaceState) history.replaceState(null, '', '#' + name);
  }
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab)));
  const hashTab = (location.hash || '').replace('#', '');
  if (hashTab && document.querySelector(`[data-tab="${hashTab}"]`)) activateTab(hashTab);

  // Status poller
  const sbDot = document.getElementById('sb-dot');
  const sbStatusText = document.getElementById('sb-status-text');
  function fmtUptime(startedAt) {
    if (!startedAt) return '';
    const ms = Date.now() - new Date(startedAt).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  let pollStatus = async function () {
    try {
      const r = await fetch(API + '/status');
      if (!r.ok) throw new Error('http ' + r.status);
      const s = await r.json();
      sbDot.className = 'sb-dot online';
      sbStatusText.textContent = `Online · ${fmtUptime(s.startedAt)}`;
      window.__sasiStatus = s;
    } catch {
      sbDot.className = 'sb-dot offline';
      sbStatusText.textContent = 'Offline';
      window.__sasiStatus = null;
    }
  };
  pollStatus();
  setInterval(() => pollStatus(), 3000);
</script>
</body>
</html>
```

- [ ] **Step 2: Open in browser to verify shell renders**

Open `file:///e:/Code/stream-recording/Overlay/sasi-overlays/dashboard-v2.html`. Verify:
- Sidebar with brand "Sasi Studio" + "v2 · Phase 1"
- 6 tabs: Go Live / Overlays (active by default) / Alerts / Games / Stream / Keys
- Click each tab → corresponding panel shows
- Each non-Overlays tab shows "Coming in Phase N" placeholder
- Overlays tab shows "Building..." (we'll fill it in Tasks 8-10)

- [ ] **Step 3: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-v2.html
git commit -m "feat(dashboard-v2): shell with 6 tabs + status poller

Sidebar (Go Live / Overlays / Alerts / Games / Stream / Keys),
tab switching with hash deep-linking, CSRF fetch wrapper, status
poller. Overlays is the active default; other tabs show 'Coming
in Phase N' placeholder cards. Overlays content stubbed for now."
```

---

## Task 8: Build Overlays tab — scene grid + iframe previews

**Files:**
- Modify: `Overlay/sasi-overlays/dashboard-v2.html`

Replace the `<div id="overlays-content">` placeholder with a 5-scene grid where each scene is a scaled iframe preview.

- [ ] **Step 1: Add CSS for scene grid + iframe-scaling pattern**

In `dashboard-v2.html`'s `<style>` block (just before `</style>`), append:

```css
  /* Scene grid */
  .scene-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-6); }
  .scene-card {
    background: var(--bg-card); border: 1px solid var(--bg-divider); border-radius: var(--r-card);
    overflow: hidden; cursor: pointer;
    transition: border-color var(--t-fast);
  }
  .scene-card:hover { border-color: var(--text-muted); }
  .scene-card.active { border-color: var(--accent-online); }
  .scene-card.active .scene-label { color: var(--accent-online); }
  /* The iframe is 1920x1080; we scale-and-clip to fit a 320x180 (16:9) thumbnail. */
  .scene-thumb { position: relative; width: 100%; aspect-ratio: 16/9; overflow: hidden; background: #050005; }
  .scene-thumb iframe {
    width: 1920px; height: 1080px;
    border: 0;
    transform-origin: 0 0;
    pointer-events: none; /* don't capture clicks — let the card handle it */
  }
  .scene-label {
    background: var(--bg-divider); padding: 6px 10px;
    color: var(--text-secondary); font-size: 10px;
    font-weight: 600; text-align: center;
  }
  .scene-card.active .scene-label { background: rgba(0,255,133,0.08); color: var(--accent-online); }
```

- [ ] **Step 2: Replace the Overlays panel content placeholder with scene grid HTML**

Find:

```html
    <section class="panel active" data-panel="overlays">
      <div class="page-head"><div class="page-eyebrow">Stream</div><div class="page-title">Overlays</div></div>
      <div id="overlays-content"><p style="color:var(--text-muted)">Building...</p></div>
    </section>
```

Replace with:

```html
    <section class="panel active" data-panel="overlays">
      <div class="page-head"><div class="page-eyebrow">Stream</div><div class="page-title">Overlays</div></div>

      <div class="scene-grid" id="scene-grid">
        <div class="scene-card active" data-scene="starting-soon">
          <div class="scene-thumb"><iframe data-src="scenes/starting-soon.html"></iframe></div>
          <div class="scene-label">Starting Soon</div>
        </div>
        <div class="scene-card" data-scene="brb">
          <div class="scene-thumb"><iframe data-src="scenes/brb.html"></iframe></div>
          <div class="scene-label">BRB</div>
        </div>
        <div class="scene-card" data-scene="stream-ending">
          <div class="scene-thumb"><iframe data-src="scenes/stream-ending.html"></iframe></div>
          <div class="scene-label">Stream Ending</div>
        </div>
        <div class="scene-card" data-scene="overlay">
          <div class="scene-thumb"><iframe data-src="scenes/overlay.html"></iframe></div>
          <div class="scene-label">In-Game</div>
        </div>
        <div class="scene-card" data-scene="just-chatting">
          <div class="scene-thumb"><iframe data-src="scenes/just-chatting.html"></iframe></div>
          <div class="scene-label">Just Chatting</div>
        </div>
      </div>

      <div id="overlay-editor"><p style="color:var(--text-muted)">Click a scene above to edit it.</p></div>
    </section>
```

- [ ] **Step 3: Add JS to scale iframes + handle scene-card clicks**

In the `<script>` block (after the status poller), append:

```js
  // === Overlays: iframe scaling + scene selection ===
  function scaleSceneThumbs() {
    document.querySelectorAll('.scene-thumb').forEach(thumb => {
      const iframe = thumb.querySelector('iframe');
      if (!iframe) return;
      const w = thumb.clientWidth;
      const scale = w / 1920;
      iframe.style.transform = `scale(${scale})`;
      // Set the iframe's src lazily so it loads (and only once)
      if (!iframe.src && iframe.dataset.src) iframe.src = iframe.dataset.src;
    });
  }
  // Defer initial scale-and-load to the next paint so layout is settled
  requestAnimationFrame(scaleSceneThumbs);
  window.addEventListener('resize', scaleSceneThumbs);

  // Active scene tracking — the editor (Task 9) reads window.__activeScene
  window.__activeScene = 'starting-soon';
  document.querySelectorAll('.scene-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      window.__activeScene = card.dataset.scene;
      window.dispatchEvent(new CustomEvent('sasi-scene-change', { detail: card.dataset.scene }));
    });
  });
```

- [ ] **Step 4: Open in browser, verify previews render**

Reload `dashboard-v2.html`. Confirm:
- 5 scene preview tiles in a row
- Each tile shows the actual scene rendered (scaled-down to ~320x180)
- Click a tile → green border switches to it
- Editor stub shows "Click a scene above to edit it" (will be filled in Task 9)
- Browser DevTools console shows `[live-update] framework loaded` 5 times (once per iframe)

If iframes show blank: check console for path errors. The scene HTMLs reference `../lib/config.js` etc. — when loaded in iframe at `scenes/starting-soon.html`, the parent of `scenes/` is `Overlay/sasi-overlays/`, which contains `lib/`. Should resolve correctly.

- [ ] **Step 5: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-v2.html
git commit -m "feat(dashboard-v2): Overlays scene grid with iframe previews

5 scene tiles (Starting Soon / BRB / Ending / In-Game / Just Chatting).
Each is a 1920x1080 iframe scaled down via CSS transform to ~320x180
thumbnail. Clicking a tile switches the active-scene marker (used by
Task 9 editor). Lazy-loads iframe src after first paint to avoid
blocking initial render."
```

---

## Task 9: Build Overlays tab — selected scene editor + bigger live preview

**Files:**
- Modify: `Overlay/sasi-overlays/dashboard-v2.html`

When a scene is selected in the grid, show form fields on the left and a bigger preview iframe on the right. Typing in fields updates the preview live via the `sasi_*` localStorage flow.

- [ ] **Step 1: Add CSS for the editor layout**

In the `<style>` block, append:

```css
  /* Scene editor */
  .editor-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); margin-bottom: var(--sp-6); }
  .editor-form { background: var(--bg-card); border: 1px solid var(--bg-divider); border-radius: var(--r-card); padding: var(--sp-4); }
  .editor-form .editor-eyebrow { font-size: 9px; letter-spacing: 0.18em; font-weight: 600; color: var(--text-muted); margin-bottom: var(--sp-3); text-transform: uppercase; }
  .editor-form .field { margin-bottom: var(--sp-3); }
  .editor-form label { display: block; font-size: 10px; color: var(--text-muted); margin-bottom: var(--sp-1); text-transform: uppercase; letter-spacing: 0.08em; }
  .editor-form input[type=text], .editor-form input[type=number] {
    width: 100%; padding: 8px 10px;
    background: var(--bg-page); border: 1px solid var(--bg-divider);
    border-radius: var(--r-button); color: var(--text-primary);
    font-family: inherit; font-size: var(--text-body);
    transition: border-color var(--t-fast);
  }
  .editor-form input:focus { outline: none; border-color: var(--accent-online); }
  .editor-form .field-row { display: flex; gap: var(--sp-2); }
  .editor-form .field-row .field { flex: 1; }
  .toggle-row {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: 8px 10px; background: var(--bg-page);
    border: 1px solid var(--bg-divider); border-radius: var(--r-button);
    cursor: pointer; user-select: none;
  }
  .toggle-row input[type=checkbox] { margin: 0; cursor: pointer; }
  .toggle-row span { font-size: var(--text-small); color: var(--text-secondary); }

  /* Editor preview pane */
  .editor-preview {
    background: #050005; border: 1px solid var(--bg-divider);
    border-radius: var(--r-card); overflow: hidden;
    aspect-ratio: 16/9; position: relative;
  }
  .editor-preview iframe {
    width: 1920px; height: 1080px; border: 0;
    transform-origin: 0 0;
  }
  .preview-toolbar {
    position: absolute; top: var(--sp-2); right: var(--sp-2); z-index: 2;
    display: flex; gap: var(--sp-1);
  }
  .preview-btn {
    padding: 4px 10px; background: rgba(0,0,0,0.7);
    border: 1px solid var(--bg-border); border-radius: var(--r-button);
    color: var(--text-secondary); font-family: inherit; font-size: 10px;
    font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    cursor: pointer;
  }
  .preview-btn:hover { color: var(--text-primary); border-color: var(--text-secondary); }
```

- [ ] **Step 2: Replace the editor stub with the real container**

Find:

```html
      <div id="overlay-editor"><p style="color:var(--text-muted)">Click a scene above to edit it.</p></div>
```

Replace with:

```html
      <div id="overlay-editor" class="editor-row">
        <div class="editor-form">
          <div class="editor-eyebrow" id="editor-title">SELECTED · STARTING SOON</div>
          <div id="editor-fields"></div>
        </div>
        <div class="editor-preview">
          <div class="preview-toolbar">
            <button class="preview-btn" id="preview-reload" title="Reload preview (needed for color/theme/font changes)">↻ Reload</button>
          </div>
          <iframe id="editor-preview-iframe" src="scenes/starting-soon.html"></iframe>
        </div>
      </div>
```

- [ ] **Step 3: Add per-scene field definitions + dynamic form rendering**

In the `<script>` block (after the scene-grid logic), append:

```js
  // === Overlays: per-scene field definitions ===
  // Each field maps a localStorage key to a control type + label.
  // Types: 'text', 'number', 'toggle'
  const SCENE_FIELDS = {
    'starting-soon': [
      { key: 'ss_badge',     type: 'text',   label: 'Badge',           placeholder: 'STARTING SOON' },
      { key: 'ss_topText',   type: 'text',   label: 'Top text',        placeholder: 'Stream' },
      { key: 'ss_mainText',  type: 'text',   label: 'Main text',       placeholder: 'STARTING' },
      { key: 'ss_countdown', type: 'number', label: 'Countdown (min)', placeholder: '5', requiresReload: true },
      { key: 'ss_nextStream',type: 'text',   label: 'Next stream',     placeholder: 'FRIDAY · 8PM' },
      { key: 'ss_clock',     type: 'toggle', label: 'Show clock' },
      { key: 'ss_ticker',    type: 'toggle', label: 'Show ticker' },
    ],
    'brb': [
      { key: 'brb_badge',    type: 'text',   label: 'Badge',                       placeholder: 'BRB' },
      { key: 'brb_mainText', type: 'text',   label: 'Main text (use \\n for line)',placeholder: 'BE RIGHT\\nBACK' },
      { key: 'brb_subtext',  type: 'text',   label: 'Subtext',                     placeholder: 'grabbing something, back in a moment' },
      { key: 'brb_tagline',  type: 'text',   label: 'Tagline',                     placeholder: 'BE RIGHT BACK' },
      { key: 'brb_clock',    type: 'toggle', label: 'Show clock' },
      { key: 'brb_ticker',   type: 'toggle', label: 'Show ticker' },
    ],
    'stream-ending': [
      { key: 'end_badge',   type: 'text',   label: 'Badge',     placeholder: 'OFFLINE' },
      { key: 'end_tagline', type: 'text',   label: 'Tagline',   placeholder: 'SEE YOU NEXT TIME' },
      { key: 'end_thanks',  type: 'text',   label: 'Thanks',    placeholder: 'Thanks for' },
      { key: 'end_main',    type: 'text',   label: 'Main text', placeholder: 'WATCHING' },
      { key: 'end_sub',     type: 'text',   label: 'Sub text',  placeholder: 'SEE YOU SOON' },
      { key: 'end_ticker',  type: 'toggle', label: 'Show ticker' },
    ],
    'overlay': [
      { key: 'sub_items',   type: 'text', label: 'Subscribe strip text', placeholder: 'SUBSCRIBE' },
      { key: 'likes_items', type: 'text', label: 'Likes strip text',     placeholder: 'LIKE' },
      { key: 'nametag',     type: 'text', label: 'Name tag',             placeholder: '(empty = uses brand name)' },
    ],
    'just-chatting': [
      { key: 'nametag', type: 'text', label: 'Name tag', placeholder: '(empty = uses brand name)' },
    ],
  };

  function renderEditor(sceneName) {
    const fields = SCENE_FIELDS[sceneName] || [];
    const container = document.getElementById('editor-fields');
    document.getElementById('editor-title').textContent = 'SELECTED · ' + sceneName.toUpperCase().replace('-', ' ');

    container.innerHTML = fields.map(f => {
      const stored = localStorage.getItem('sasi_' + f.key) || '';
      if (f.type === 'toggle') {
        const checked = stored === 'true' ? 'checked' : '';
        return `<div class="field"><label class="toggle-row">
          <input type="checkbox" data-key="${f.key}" ${checked}>
          <span>${f.label}</span>
        </label></div>`;
      }
      const inputType = f.type === 'number' ? 'number' : 'text';
      const reload = f.requiresReload ? ' data-reload="1"' : '';
      return `<div class="field">
        <label>${f.label}${f.requiresReload ? ' <span style="color:var(--accent-warn);text-transform:none;font-size:9px">· reload preview after change</span>' : ''}</label>
        <input type="${inputType}" data-key="${f.key}"${reload} value="${stored.replace(/"/g, '&quot;')}" placeholder="${f.placeholder.replace(/"/g, '&quot;')}">
      </div>`;
    }).join('');

    // Wire each input to write to localStorage on change (debounced for text)
    container.querySelectorAll('[data-key]').forEach(input => {
      const key = input.dataset.key;
      const isToggle = input.type === 'checkbox';
      const debounceMs = isToggle ? 0 : 200;
      let t;
      const writeValue = () => {
        const value = isToggle ? String(input.checked) : input.value;
        localStorage.setItem('sasi_' + key, value);
        // Manually fire storage event for the editor preview iframe (same window
        // doesn't get storage events natively — we use postMessage as fallback).
        const iframe = document.getElementById('editor-preview-iframe');
        if (iframe && iframe.contentWindow) {
          try { iframe.contentWindow.dispatchEvent(new StorageEvent('storage', { key: 'sasi_' + key, newValue: value, storageArea: localStorage })); } catch {}
        }
        // Also re-scale + notify all grid thumbs (they ARE separate windows)
      };
      input.addEventListener(isToggle ? 'change' : 'input', () => {
        clearTimeout(t);
        t = setTimeout(writeValue, debounceMs);
      });
    });
  }

  // Render on load + re-render on scene change
  renderEditor(window.__activeScene);
  window.addEventListener('sasi-scene-change', (e) => {
    renderEditor(e.detail);
    // Switch the editor preview iframe
    document.getElementById('editor-preview-iframe').src = 'scenes/' + e.detail + '.html';
  });

  // Reload preview button
  document.getElementById('preview-reload').addEventListener('click', () => {
    const iframe = document.getElementById('editor-preview-iframe');
    iframe.src = iframe.src;
  });

  // Scale the editor preview iframe to fit its container (similar to grid thumbs)
  function scaleEditorPreview() {
    const container = document.querySelector('.editor-preview');
    const iframe = document.getElementById('editor-preview-iframe');
    if (!container || !iframe) return;
    const w = container.clientWidth;
    iframe.style.transform = `scale(${w / 1920})`;
  }
  requestAnimationFrame(scaleEditorPreview);
  window.addEventListener('resize', scaleEditorPreview);
```

- [ ] **Step 4: Verify editor renders + types update preview**

Reload `dashboard-v2.html`. Click on the "Starting Soon" scene tile (it's already selected by default). Verify:
- Form fields appear on left: Badge, Top text, Main text, Countdown (with "reload preview after change" warning), Next stream, Show clock, Show ticker
- Bigger preview iframe on right (~16:9 aspect, scaled-down 1920x1080)
- Type into Badge field → preview updates within ~300ms
- Toggle "Show clock" off → clock element hides in preview
- Click a different scene tile → form fields and preview iframe both swap
- Click "Reload" button → iframe reloads (useful after color/theme changes)

If text changes don't appear: check browser DevTools console. Likely the `data-bind` attrs from Task 4/5 don't match the actual scene DOM. Inspect the iframe DOM and verify the bindings. (This is the "selectors might need adjusting per scene" caveat.)

- [ ] **Step 5: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-v2.html
git commit -m "feat(dashboard-v2): scene editor with live preview

Per-scene field definitions (text/number/toggle controls) drive a
dynamic form. Inputs write to localStorage with sasi_ prefix and
fire a synthetic storage event into the editor preview iframe (same-
window storage events don't propagate natively). Reload button for
fields that require full re-render (countdown, etc.). Switching
scenes via grid click swaps both form + preview src."
```

---

## Task 10: Build Overlays tab — common controls (colors, theme, effects, ticker, clock)

**Files:**
- Modify: `Overlay/sasi-overlays/dashboard-v2.html`

Add a "Common controls" section below the per-scene editor. These apply to ALL scenes (write to keys like `cRed`, `background`, `glitchToggle`, etc.) and update all 5 grid iframes + the editor preview.

- [ ] **Step 1: Add CSS for the common controls section**

In `<style>`, append:

```css
  /* Common controls */
  .common-section {
    background: var(--bg-card); border: 1px solid var(--bg-divider);
    border-radius: var(--r-card); padding: var(--sp-4);
    margin-bottom: var(--sp-6);
  }
  .common-section .editor-eyebrow { font-size: 9px; letter-spacing: 0.18em; font-weight: 600; color: var(--text-muted); margin-bottom: var(--sp-3); text-transform: uppercase; }
  .common-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-3); }
  .common-tile {
    background: var(--bg-page); border: 1px solid var(--bg-divider);
    border-radius: var(--r-button); padding: var(--sp-3);
  }
  .common-tile-label { color: var(--text-muted); font-size: 9px; letter-spacing: 0.15em; font-weight: 600; margin-bottom: var(--sp-2); text-transform: uppercase; }
  .color-row { display: flex; gap: var(--sp-1); align-items: center; }
  .color-row input[type=color] { width: 28px; height: 28px; padding: 2px; border: 1px solid var(--bg-divider); border-radius: var(--r-chip); background: transparent; cursor: pointer; }
  .common-tile select, .common-tile input[type=text], .common-tile input[type=number] {
    width: 100%; padding: 6px 8px; background: var(--bg-page);
    border: 1px solid var(--bg-divider); border-radius: var(--r-button);
    color: var(--text-primary); font-family: inherit; font-size: var(--text-body);
  }
```

- [ ] **Step 2: Add the common controls HTML below the editor row**

Find:

```html
      <div id="overlay-editor" class="editor-row">
```

The `</div>` for this `<div id="overlay-editor">` is just before `</section>`. After that closing `</div>` (i.e., immediately before `</section>` for the overlays panel), add:

```html
      <div class="common-section">
        <div class="editor-eyebrow">Common · applies to all scenes</div>
        <div class="common-grid">
          <div class="common-tile">
            <div class="common-tile-label">Colors</div>
            <div class="color-row">
              <input type="color" data-key="cRed"    value="#FF2200" title="Red (primary)">
              <input type="color" data-key="cOrange" value="#FF7700" title="Orange (secondary)">
              <input type="color" data-key="cGold"   value="#FFD700" title="Gold (accent)">
            </div>
          </div>
          <div class="common-tile">
            <div class="common-tile-label">Background</div>
            <select data-key="background" data-reload="1">
              <option value="hexgrid">hexgrid</option>
              <option value="particles">particles</option>
              <option value="ember">ember</option>
              <option value="matrix">matrix</option>
              <option value="minimal">minimal</option>
              <option value="random" selected>random</option>
            </select>
          </div>
          <div class="common-tile">
            <div class="common-tile-label">Glitch effect</div>
            <label class="toggle-row" style="padding:4px 8px"><input type="checkbox" data-key="glitchToggle"><span>Enabled</span></label>
          </div>
          <div class="common-tile">
            <div class="common-tile-label">Ticker speed (s)</div>
            <input type="number" data-key="tickerSpeed" min="10" max="60" value="28" data-reload="1">
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Add JS to wire common controls**

In `<script>`, after the editor wiring code, append:

```js
  // === Overlays: common controls wiring ===
  function broadcastChange(key, value) {
    localStorage.setItem('sasi_' + key, value);
    // Tell editor preview iframe (same-origin, but same-window storage events
    // don't propagate from the originating window — we manually dispatch).
    const editorIframe = document.getElementById('editor-preview-iframe');
    if (editorIframe && editorIframe.contentWindow) {
      try { editorIframe.contentWindow.dispatchEvent(new StorageEvent('storage', { key: 'sasi_' + key, newValue: value, storageArea: localStorage })); } catch {}
    }
    // Tell every grid thumbnail iframe too
    document.querySelectorAll('.scene-thumb iframe').forEach(iframe => {
      if (iframe && iframe.contentWindow) {
        try { iframe.contentWindow.dispatchEvent(new StorageEvent('storage', { key: 'sasi_' + key, newValue: value, storageArea: localStorage })); } catch {}
      }
    });
  }

  document.querySelectorAll('.common-section [data-key]').forEach(input => {
    const key = input.dataset.key;
    const stored = localStorage.getItem('sasi_' + key);
    // Pre-fill from saved value
    if (stored !== null) {
      if (input.type === 'checkbox') input.checked = stored === 'true';
      else input.value = stored;
    }
    const isToggle = input.type === 'checkbox';
    const isColor = input.type === 'color';
    const debounceMs = isColor ? 50 : (isToggle ? 0 : 200);
    let t;
    const fire = () => {
      const value = isToggle ? String(input.checked) : input.value;
      broadcastChange(key, value);
    };
    input.addEventListener(isToggle ? 'change' : 'input', () => {
      clearTimeout(t);
      t = setTimeout(fire, debounceMs);
    });
  });

  // Also have the per-scene editor input handler (Task 9) broadcast to all
  // grid thumbs so changes show across the whole page. Patch it here:
  // (The Task 9 writeValue already targets editor-preview-iframe; we just
  // also broadcast to grid thumbs.)
```

Then update the per-scene `writeValue` from Task 9 — find:

```js
      const writeValue = () => {
        const value = isToggle ? String(input.checked) : input.value;
        localStorage.setItem('sasi_' + key, value);
        // Manually fire storage event for the editor preview iframe (same window
        // doesn't get storage events natively — we use postMessage as fallback).
        const iframe = document.getElementById('editor-preview-iframe');
        if (iframe && iframe.contentWindow) {
          try { iframe.contentWindow.dispatchEvent(new StorageEvent('storage', { key: 'sasi_' + key, newValue: value, storageArea: localStorage })); } catch {}
        }
        // Also re-scale + notify all grid thumbs (they ARE separate windows)
      };
```

Replace with:

```js
      const writeValue = () => {
        const value = isToggle ? String(input.checked) : input.value;
        broadcastChange(key, value);
      };
```

(Now both per-scene and common-controls go through `broadcastChange`.)

- [ ] **Step 4: Verify common controls update all previews**

Reload `dashboard-v2.html`. Verify:
- "Common · applies to all scenes" section shows below the editor
- 4 tiles: Colors (3 color pickers), Background (dropdown), Glitch effect (toggle), Ticker speed
- Change Red color → all 5 grid thumb previews + the bigger editor preview update their `--red` CSS var
- Change Background → "reload preview after change" indicator (the `data-reload="1"` attribute is set; full reload is triggered by user clicking the editor preview Reload button)
- Toggle Glitch → applies to all previews

Note: Changes to background/glitch/ticker-speed actually need a reload to take effect because the scene's `initBg()` runs once at page load. The "Reload" button in the editor preview handles that. The grid thumbs won't update until the user reloads the whole dashboard. This is acceptable for Phase 1 — we'll add a "reload all thumbs" button if it becomes painful.

- [ ] **Step 5: Commit**

```bash
git add Overlay/sasi-overlays/dashboard-v2.html
git commit -m "feat(dashboard-v2): common controls (colors, bg, effects, ticker)

Below the per-scene editor — colors (3 color pickers), background
theme dropdown, glitch toggle, ticker speed. Changes broadcast to
both the editor preview iframe AND all 5 grid thumbnails so the
whole page reflects edits immediately. data-reload markers for
fields that require full iframe re-render (theme, font, etc.)."
```

---

## Task 11: Phase 1 acceptance walkthrough

**Files:** none modified — verification only

- [ ] **Step 1: Run existing watcher tests**

```bash
cd Overlay/clip-prep && npm test 2>&1 | tail -10
```

Expected: 26 tests passing.

- [ ] **Step 2: Open dashboard-v2.html and walk through**

Open `file:///e:/Code/stream-recording/Overlay/sasi-overlays/dashboard-v2.html`. Verify each:

1. Sidebar has 6 tabs in order: Go Live / Overlays (active) / Alerts / Games / Stream / Keys
2. Brand reads "Sasi Studio" + "v2 · Phase 1"
3. Status dot turns green when watcher is running, red when stopped
4. Click each non-Overlays tab → "Coming in Phase N" placeholder card visible
5. **Overlays tab default state:** 5 scene tiles visible with rendered previews (give it a few seconds for iframes to load)
6. Starting Soon tile is selected (green border)
7. Editor below shows fields: Badge, Top text, Main text, Countdown, Next stream, Show clock, Show ticker
8. Editor preview iframe (right side) shows the bigger Starting Soon scene
9. Type in the Badge field → preview updates within ~300ms
10. Toggle Show clock off → clock hides in preview
11. Click BRB tile → grid switches active border, editor form swaps to BRB fields, editor preview iframe loads brb.html
12. Common controls below: change Red color → all 5 grid thumbs + editor preview update
13. Click "Reload" on editor preview → iframe reloads (useful after background/theme change)
14. No banned styles introduced (linear-gradient only on `.sb-mark`, no backdrop-filter, no border-radius >8px outside chrome, no generic blue, no box-shadow outside `.sb-dot.online` and `.scene-card.active` if any).

- [ ] **Step 3: If any criterion fails, fix in the relevant task and re-verify. Otherwise nothing to commit.**

---

## Self-Review (writer-side)

**Spec coverage (Phase 1 only — other phases are separate plans):**
- ✅ Architecture: scenes/lib/components in repo → Tasks 1, 6
- ✅ live-update.js framework → Task 3
- ✅ Per-scene wiring → Tasks 4, 5
- ✅ Dashboard shell with 6 tabs + status poller + CSRF wrapper → Task 7
- ✅ Other tabs as placeholders for now → Task 7 (placeholder cards)
- ✅ Overlays tab: scene grid → Task 8
- ✅ Overlays tab: per-scene editor + bigger preview → Task 9
- ✅ Overlays tab: common controls → Task 10
- ✅ Acceptance walkthrough → Task 11

**Placeholder scan:** No "TBD". Every code block is complete. Every command shows expected output.

**Type / API consistency:**
- `registerLiveUpdater(key, fn)` defined in Task 3, used in Tasks 4 + 5. ✓
- `liveUpdate.text/cssVar/show` helpers defined in Task 3, referenced in Tasks 4 + 5. ✓
- `window.__activeScene` set in Task 8, read by `renderEditor` in Task 9. ✓
- `broadcastChange(key, value)` defined in Task 10, also called by per-scene `writeValue` (Task 9 patched in Task 10). ✓
- `SCENE_FIELDS` keys (`ss_badge`, `brb_badge`, etc.) match `registerLiveUpdater` keys in Tasks 4 + 5. ✓
- `data-reload="1"` attribute set on countdown / background / ticker speed; used as a marker (currently informational only — Reload button handles it). Consistent.

No unresolved references. Plan is implementable.
