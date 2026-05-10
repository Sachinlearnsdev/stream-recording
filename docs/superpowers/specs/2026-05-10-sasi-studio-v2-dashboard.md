# Sasi Studio v2 — Full Dashboard Rebuild

**Status:** Design (awaiting approval)
**Date:** 2026-05-10
**Supersedes:** [2026-05-10-sasi-studio-dashboard-design.md](2026-05-10-sasi-studio-dashboard-design.md) — that earlier spec only rebuilt the recorder portion. This one covers everything.
**Scope:** Full dashboard rebuild covering all functionality from the original `dashboard-old.html` — Go Live, Overlays (live editor), Alerts, Games (with bug fix), Stream/Recorder (user/system split), and a new Keys vault. Plus the architecture changes to make it work end-to-end.

---

## Summary

Replace the current limited dashboard (`Overlay/sasi-overlays/dashboard.html` — only recorder + bundle ops) with a full 6-tab Sasi Studio dashboard that covers every feature the streamer actually uses, in the Studio Console aesthetic. Includes:

- A live overlay editor (scene-grid + per-scene editor + common controls, with iframe previews that update as you type)
- A user-friendly Alerts editor with test buttons that fire into the live preview
- A Games tab whose Wheel/Mystery/Highlight redemptions actually trigger the in-scene wheel spin (bug fix)
- A Stream (was Recorder) tab split into user-facing top + system/advanced collapsed below
- A Keys vault for YouTube API keys, Twitch IRC user, and StreamElements JWTs (`secrets.js` editor via watcher API)

Architecturally: the overlay HTML + JS files (currently only inside the user's OBS bundle export) are moved into the dev repo at `Overlay/sasi-overlays/scenes/` and `Overlay/sasi-overlays/lib/`. The bootstrap installer copies them into the OBS bundle path on install. Each scene gets a small storage-event listener so live-preview updates without reload.

## Goals

- Restore every working feature from `dashboard-old.html` — no regressions
- Add live in-dashboard preview for the overlay scenes (the user's #1 ask)
- Fix the Games wiring bug so loyalty-point redemptions actually trigger the wheel spin
- Split the Recorder tab so streamers don't see system-admin clutter while doing normal work
- Add a Keys vault so the user can manage API keys without editing `secrets.js` by hand
- Preserve the Studio Console aesthetic from v1 (tokens.css stays as-is, with a few additions)

## Non-Goals

- Rewriting the Node watcher service (only Phase 6 adds two `/secrets` endpoints)
- Changing the OBS bundle export/import format
- Building a true WYSIWYG layout editor (text/color/toggle changes only — moving an element by 5px requires editing scene CSS)
- Implementing new alert types or game types beyond what already exists
- Renaming the technical surface (`clip-prep` stays as install dir / package name)

---

## Architecture

### File layout

| Path | Status | Purpose |
|---|---|---|
| `Overlay/sasi-overlays/dashboard.html` | Rewrite | Full v2 dashboard |
| `Overlay/sasi-overlays/tokens.css` | Keep + extend | Add: `--bg-sidebar` (already added), `--accent-warn-soft` (rgba 8%), `--preview-frame` (1px solid var(--bg-border) + var(--r-card)), `--accordion-pad` (var(--sp-3) var(--sp-4)) |
| `Overlay/sasi-overlays/scenes/` | **NEW** | Copy of all 8 scene HTMLs from user's bundle, modified for live updates |
| `Overlay/sasi-overlays/lib/` | **NEW** | Copy of `config.js`, `alerts.js`, `chat.js`, `bg-all.js`, `notifications.js` (with games-wiring fix) |
| `Overlay/sasi-overlays/secrets.example.js` | NEW | Template, committed |
| `Overlay/sasi-overlays/secrets.js` | gitignored | Real keys, never committed |
| `Overlay/clip-prep/src/api.js` | Phase 6 | Add `GET /secrets`, `PUT /secrets` endpoints |
| `Overlay/clip-prep/install.bat` | Phase 1 | After current copy, also copy `Overlay/sasi-overlays/scenes/` and `Overlay/sasi-overlays/lib/` to OBS bundle target path |
| `Overlay/clip-prep/bootstrap.bat` | Phase 1 | Same |

### Live-preview mechanism

Each scene preview is an `<iframe>` of the actual scene HTML, scaled via CSS `transform: scale(N)` to fit a small preview window (e.g., 320×180 from 1920×1080 = scale 0.167).

**Update flow when user edits a field in the dashboard:**
1. Dashboard sets `localStorage['sasi_<key>'] = value`
2. Browser fires `storage` event in every other window/iframe on the same origin (NOT in the originating window — but iframes count as separate contexts)
3. Each scene's storage listener inspects the changed key and runs the matching DOM updater

**Per-field categorization** (every scene config field falls into one bucket):

| Category | Update mechanism | Examples |
|---|---|---|
| **Live text** | `element.textContent = value` | Badge, main text, sub text, tagline, today, nametag |
| **Live CSS var** | `document.documentElement.style.setProperty('--red', value)` | Colors (red, orange, gold, bg) |
| **Live attribute / toggle** | `element.style.display`, `element.classList.toggle()` | Show clock, show ticker, fake-mode |
| **Re-render component** | Call dedicated rebuild function in scene | Socials list, stream-info items, ticker extras |
| **Reload required** | Show "Reload preview" button, full iframe `src` reset | Background theme, animation speed, font, countdown duration mid-tick, webcam dimensions |

**Implementation:** A new file `lib/live-update.js` exports a `registerLiveUpdater(key, fn)` API. Each scene's inline `<script>` block calls `registerLiveUpdater('ss_badge', v => $('.badge').textContent = v)` etc. A single `storage` event listener in `live-update.js` dispatches to the registered handler.

### Tab structure

6 tabs in the sidebar, in this order:

| # | Tab | Default landing | Phase |
|---|---|---|---|
| 1 | **Go Live** | ● First page on dashboard open. Pre-stream prep is the most-used flow. | 4 |
| 2 | **Overlays** | Scene grid + selected editor + common controls | **1** |
| 3 | **Alerts** | Tier editor + duration controls + test buttons | 5 |
| 4 | **Games** | Wheel/Mystery/Highlight cost+rewards editor + spin animation duration | 5 |
| 5 | **Stream** (was Recorder) | User-facing controls top, system accordion bottom | 2 |
| 6 | **Keys** | secrets.js editor with quota counter | 6 |

---

## Per-tab specs

### Tab 1: Go Live

**Purpose:** pre-stream setup; what you set right before going live every session.

**Layout (top to bottom):**

1. **Connection** section
   - Platform select (`<select>`): YouTube / Twitch — writes `sasi_activePlatform`
   - YouTube fields (visible when platform=youtube):
     - YouTube Video ID or URL — writes `sasi_liveVideoId` (auto-extracts ID via regex from full URL)
     - Hint: "Saves 100x API quota vs auto-search"
   - Twitch fields (visible when platform=twitch):
     - Twitch Channel (read-only, pulled from `secrets.js` Twitch username)
     - Hint: "IRC WebSocket — free, no quota"

2. **Stream Control** section — two big buttons
   - **GO LIVE** (primary, fills width when watcher offline) — writes `sasi_streamLive = 'true'`. Disables itself, enables STOP.
   - **STOP** (destructive style, disabled until live) — writes `sasi_streamLive = 'false'`
   - Status text below: "Chat polling started" / "Chat polling stopped"

3. **Notifications Queue** section
   - Pending count (badge)
   - List of active SASI_NOTIFY items (game results — wheel wins, mystery box, highlight messages)
   - Each row: type icon + viewer name + result + time + dismiss button
   - "Clear All" button at bottom
   - Polls `localStorage.sasi_notifications_queue` every 2 seconds
   - Empty state: "No pending notifications. Wheel/Mystery/Highlight results show here."

4. **Quick Settings** section
   - Countdown (min, 1-60) — writes `sasi_countdown`
   - Today's Topic — writes `sasi_today`
   - Test Mode toggle — writes `sasi_fakeAlerts` (when on, fake chat + alerts + game triggers fire on a loop)

5. **Status** section (read-only display)
   - Platform · Chat Source · Video ID · API Keys (count + estimated hours coverage) · SE Alerts JWT (✓/✗) · Test Mode
   - Auto-refreshes every 5 seconds

### Tab 2: Overlays (the big one)

**Purpose:** edit overlay scenes with live preview. The user's "scene grid + click to expand + common controls below" pattern.

**Layout:**

1. **Scene grid** (top)
   - 5 preview cards in a row: Starting Soon · BRB · Stream Ending · In-Game (overlay.html) · Just Chatting
   - Each card: scaled iframe preview (16:9 aspect, ~320×180), scene name label, "EDIT" button
   - Active scene has Studio Console green border + filled label

2. **Selected scene editor** (middle, appears below grid when a scene is selected)
   - Two-column layout: left = form fields, right = larger live preview iframe (~640×360)
   - Form fields are scene-specific (see field map below)
   - Each field updates live preview as you type (debounced 200ms for text, instant for toggles)
   - "Reload Preview" button at top of preview pane (for fields that require reload — countdown, background theme, etc.)

3. **Common controls** (bottom, always visible)
   - **Brand:** channel name, tagline, font (dropdown: Arial Black / Impact / system)
   - **Colors:** red / orange / gold / bg color pickers (live updates via CSS vars)
   - **Background theme:** dropdown — hexgrid / particles / ember / matrix / minimal / random (requires preview reload)
   - **Effects:** glitch toggle, animation speed (0.5x/1x/1.5x/2x — requires preview reload)
   - **Ticker:** speed seconds (10-60), per-scene show toggles (Starting Soon / BRB / Ending)
   - **Clock:** show on / off (Starting Soon + BRB)
   - **Socials:** list of {platform, handle} rows with add/remove
   - **Stream Info Panel** (in-game overlay only): list of typed items (text / youtube-goal / discord-qr / social / stream-time) with reorder

**Per-scene field map:**

| Scene | Fields |
|---|---|
| Starting Soon | Badge, Top text, Main text, Countdown (min), Next stream label, Show clock, Show ticker |
| BRB | Badge, Main text (\n for line break), Subtext, Tagline, Show clock, Show ticker |
| Stream Ending | Badge, Tagline, Thanks text, Main text, Sub text, Show ticker |
| In-Game (overlay.html) | Subscribe strip text, Likes strip text, Webcam frame {width, height, position, margin, label}, Name tag |
| Just Chatting | Stream info panel items (drag-reorder, typed) |

### Tab 3: Alerts

**Purpose:** edit alert tier thresholds and durations with friendly wording and test buttons.

**Layout:**

1. **Tier cards** (4 stacked cards, one per tier)
   - Each card visually demonstrates the tier style (mini preview of the actual alert card)
   - Card content:
     - Tier name + amount range (e.g., "Tier 2 — Gold Card · ₹100 to ₹499")
     - "Starts at" input (₹) — Tier 1 starts at 0 (read-only); Tiers 2-4 are editable
     - Friendly description: "Gold card with shimmer sweep + floating sparkles"
     - "Test this tier" button → fires fake alert at midpoint of range. Target: the currently-selected overlay preview iframe (if Overlays tab is open with a scene selected). If no scene is selected, defaults to the In-Game scene preview (since `overlay.html` is the most common scene to host alerts). Switches the user to the Overlays tab automatically so they can see it fire.
   - Visual cue: amount range updates as you change the next tier's start

2. **Durations** section (smaller, below tier cards)
   - Sliders with friendly labels:
     - Super Chat base duration (1-10s) — "How long a small Super Chat stays on screen"
     - Super Chat max duration (3-15s) — "Cap for the biggest Super Chats"
     - Membership duration (1-15s) — "How long a new member alert stays"
     - Gift base + per-unit (1-10s + 100-1000ms) — "Base + per-gift extension"
     - Redemption / game duration (1-10s) — "Wheel/Mystery alert hold time"
   - Each slider shows live ms value next to it

3. **Audio** section (NEW — hooks into existing alert sound system)
   - Master volume slider
   - Per-tier sound dropdown (use built-in or custom)

### Tab 4: Games

**Purpose:** edit the Wheel of Fortune / Mystery Box / Highlight Message redemption-rewards. **Plus fix the wiring** so SE redemptions actually trigger the visual spin animation in `just-chatting.html`.

**Bug fix wiring (architecture change):**

Current state: when a viewer redeems a "Wheel of Fortune" reward, StreamElements pushes a `redemption` event. `alerts.js` matches the reward name against `GAME_CARDS` and shows an alert card. The visual wheel SVG in `just-chatting.html` only fires when someone clicks the test button on the game tile.

Fix: in `alerts.js` `renderRedeem()`, after rendering the alert card, also call `SASI_NOTIFY.add({ type: 'wheel', viewer, cost })`. The existing `SASI_NOTIFY` queue is already cross-window via storage events. Add a listener in `just-chatting.html` that watches the queue and triggers the corresponding spin/box/highlight animation. This means the dashboard's Notifications panel and the on-stream visual will both fire from the same trigger.

**Layout (one section per game):**

1. **🎰 Wheel of Fortune**
   - Cost (loyalty points) — number input
   - Spin animation duration (seconds) — slider
   - Rewards table — editable rows of {name, weight}; "Add reward" button; live "winning chance %" computed from weights
   - "Test spin" button — fires a fake spin in the just-chatting preview iframe

2. **📦 Mystery Box** — same shape (cost, animation duration, rewards weights, test)

3. **💬 Highlight Message** — cost only (it's just a "highlight viewer's chat message" reward, no animation)

**Common section:**
- "On-stream visibility" — toggle: show game tiles in just-chatting.html / hide
- "How games work" expandable help text — explains the loyalty-point flow + the bug fix we just shipped

### Tab 5: Stream (was Recorder)

**Purpose:** clip-prep watcher controls + recordings library, with user/system split.

**Layout — user section (always visible, top):**

1. **Recording status** card (same hero card from v1 Now tab)
   - Game name (or "Idle"), REC pill when active, dump/queue/uptime stats
   - Start / Stop / Restart buttons (Start was missing in v1, restored)
   - "Open Dump Folder" + "Open Recordings Folder" quick actions

2. **Recent moves** card (last 10 entries, mono table)

3. **Recordings by game** accordion
   - Per-game folder cards, click to expand file list
   - Per-file: name, size, mtime, recycle button

4. **Mix recordings** section
   - List with status pill (SPLIT / UNSPLIT / SPLITTING)
   - "Precise cuts (re-encode)" toggle — restored from v1
   - Per-row: Split + Delete buttons

**Layout — system section (collapsed accordion at bottom, header reads "Advanced / System"):**

1. **Folders** — one-folder picker (recommended), advanced two-folder split below
2. **Keep MKV** toggle
3. **Existing MKV browser** with multi-select (ALL/NONE/RECYCLE SELECTED) — restored from v1
4. **Live log viewer** — last 30 watcher log entries, refreshes every 3s, "Open log file" button — restored from v1
5. **Game folders editor** — filter + ADD ENTRY + EXPORT/IMPORT JSON + RAW JSON toggle + inline edit per row + format reference accordion — restored from v1
6. **Lua install panel** — gold-bordered, copy path button, open folder button, instructions — restored from v1
7. **OBS Bundle** — Export / Import / Register Lua / Auto-backups list (Restore/Delete per entry)
8. **Danger Zone** — Stop / Uninstall

### Tab 6: Keys

**Purpose:** manage API keys via dashboard instead of editing `secrets.js` by hand.

**Backend support:** new endpoints in the watcher service:
- `GET /secrets` → returns redacted version (key counts, last-4 chars only) — never returns full keys to the dashboard
- `PUT /secrets` body `{ section, index?, value }` → writes a single field; reads current `secrets.js`, modifies in memory, writes back atomically; rejects non-localhost requests (existing CSRF guard applies)
- `DELETE /secrets` body `{ section, index }` → removes one entry

**Encryption note:** v2 keeps `secrets.js` as plaintext on disk in user's profile (existing behavior). DPAPI encryption is a future enhancement, not in scope. Document clearly in the Keys tab UI.

**Layout:**

1. **YouTube API Keys** section
   - List of keys (showing only last 4 chars: `…AbC1`)
   - Per-row: status (✓ valid / ✗ quota exhausted), last-used timestamp
   - "Add key" → text input + paste → calls PUT
   - Quota counter at top: "3 keys · ~36 hours daily coverage"
   - Help text: link to Google Cloud Console with steps

2. **Channel ID** field (single value)

3. **Twitch** section
   - IRC username (text input)
   - Note: "Twitch IRC is anonymous; clientId/clientSecret unused by current code"

4. **StreamElements JWTs** section (two fields)
   - YouTube account JWT (password-style input, show/hide toggle)
   - Twitch account JWT (password-style input, show/hide toggle)
   - "Test connection" button per JWT — calls SE API with the token, shows ✓/✗

---

## Implementation phases

| Phase | Scope | What user sees after this phase ships | Tasks |
|---|---|---|---|
| 1 | Architecture (overlay files into repo + install.bat copies them out + `live-update.js` framework + per-scene listeners) **+ Overlays tab** built. Dashboard shell with all 6 tabs in sidebar; Overlays tab is fully functional; other tabs render the **existing v1 content** (Now, Recordings, OBS, Settings — i.e. limited recorder + bundle stuff) so nothing is broken. v2 work does NOT replace dashboard.html yet — it builds at `dashboard-v2.html` alongside. | Overlays live editing works. Old recorder UI still accessible at `dashboard.html`. v2 preview at `dashboard-v2.html`. | ~12 |
| 2 | **Stream tab built** — user/system split, restoring all lost recorder features (one-folder picker, MKV multi-select, live log, full games editor, lua install panel, etc.). | Overlays + Stream both functional in `dashboard-v2.html`. | ~8 |
| 3 | **Swap:** `dashboard-v2.html` → `dashboard.html`, current `dashboard.html` (v1 limited) → `dashboard-v1.html`. Original `dashboard-old.html` stays as deeper rollback. Default landing tab still **Go Live** but placeholder ("Phase 4 builds this"). | v2 dashboard live; user has working Overlays + Stream. Go Live / Alerts / Games / Keys show "coming in Phase N" cards. | ~2 |
| 4 | **Go Live tab built** — port existing JS, restyle, add improved UX. | Default landing tab now functional. | ~6 |
| 5 | **Alerts + Games tabs built** — Alerts UI redesign + Games wiring fix in `lib/alerts.js` and `scenes/just-chatting.html`. Both ship together because they share `alerts.js`. | Loyalty-point redemptions actually trigger wheel spin on stream. | ~8 |
| 6 | **Keys tab built** + watcher `/secrets` endpoints. Full v2 complete. | Full v2 dashboard. `dashboard-v1.html` and `dashboard-old.html` can be deleted in a cleanup commit. | ~6 |

Each phase ships a working dashboard. No phase leaves the user with a broken state — placeholder cards explain what's coming when a tab isn't built yet.

---

## Acceptance criteria

A reviewer should be able to confirm each by opening the dashboard:

1. Six tabs in the listed order. Active tab visually distinct.
2. **Go Live tab:** every field from old dashboard's Go Live works (platform, video ID, start/stop, countdown, today, fake mode, status panel, notifications queue).
3. **Overlays tab:** clicking a scene tile expands an editor below with live preview iframe. Typing in a text field updates the iframe within 300ms. Color picker changes apply to iframe immediately. Background theme change requires "Reload Preview" click.
4. **Alerts tab:** four tier cards display; clicking "Test this tier" fires a fake alert in the currently-selected Overlay preview iframe.
5. **Games tab:** firing a fake redemption (via fake-alerts mode in Go Live) shows the alert card AND triggers the wheel spin animation in the just-chatting preview iframe. Both fire from one trigger.
6. **Stream tab user section:** every recorder feature from old dashboard is present (status, controls, mix splitter, recent moves, per-game accordion).
7. **Stream tab system accordion:** every advanced feature from old dashboard is present (one-folder picker, MKV browser with multi-select, live log, games editor with filter/add/export/import/raw, lua install panel, bundle ops, auto-backups, danger zone).
8. **Keys tab:** YouTube API keys list shows existing keys (redacted), can add a new one, can delete one. Test buttons work for both SE JWTs.
9. **No banned styles** anywhere (gradients except brand mark, glassmorphism, border-radius >8px, generic blue, drop shadows).
10. All existing watcher tests still pass.

---

## Migration

- Current `Overlay/sasi-overlays/dashboard.html` (the limited v1 rebuild) is **renamed to `dashboard-v1.html`** during Phase 3 swap.
- Original `dashboard-old.html` (renamed during v1 swap) **stays in place as `dashboard-old.html`** for one more release as ultimate rollback.
- After v2 is proven (one release), both `dashboard-v1.html` and `dashboard-old.html` get deleted in a cleanup commit.
- User's existing `secrets.js` content is preserved across the v2 install (Phase 6 reads it before any edits).
- User's existing `sasi_*` localStorage values survive the swap (same keys, same shape).

---

## Open questions

None blocking. Possible follow-ups:

- **DPAPI encryption for `secrets.js`** — defer to a separate spec after v2 lands. Plaintext-on-disk is the existing behavior; v2 doesn't change the security posture.
- **Overlay editor: drag-to-reposition elements** — out of scope. Field-based editing only. If user wants visual layout editing, that's a future "WYSIWYG mode" spec.
- **Notification sounds in Alerts tab** — basic master volume + per-tier sound included. Custom-sound upload UI is a future enhancement.
