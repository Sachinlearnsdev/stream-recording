# Building a Sasi Studio Theme — Practical Walkthrough

This is a hands-on guide for building a new theme. For the dry contract see [THEME_SPEC.md](THEME_SPEC.md).

**Audience:** humans or AI assistants making a new theme for Sasi Studio.

## TL;DR

A theme is a folder named `sasi-overlays-<your-name>/` containing:

```
theme.json                        ← manifest
scenes/{starting-soon, brb, stream-ending, overlay, just-chatting}.html
components/{subscribe, likes, nametag, webcam}.html
lib/{config.js, alerts.js, chat.js, live-update.js, effects.css, notifications.js, bg-all.js, secrets.js}
assets/Sasi_Streams_logo.png
stingers/  (optional — your transition .webm + generators)
```

The fastest way: copy an existing theme, recolor + rename, ship. The hard way: build from scratch following the contract.

---

## Path 1 — Fork an existing theme (recommended)

1. **Open the dashboard → Overlays tab.**
2. Scroll to **Advanced → Save current as new theme**, type a name (e.g. `cyber-noir`), click Save.
3. The dashboard creates `%LOCALAPPDATA%\clip-prep\sasi-overlays-cyber-noir\` by copying the active theme.
4. Open that folder in your editor.
5. Edit `theme.json`:
   ```json
   {
     "id": "cyber-noir",
     "name": "Cyber Noir",
     "author": "your handle",
     "version": "1.0.0",
     "preview": { "primary": "#00FFC8", "secondary": "#FF00C8", "accent": "#FFFFFF", "bg": "#000000" }
   }
   ```
6. Tweak the brand colors. The default theme uses CSS variables `--red`, `--orange`, `--gold`. Search-and-replace those values across `lib/effects.css` and any inline styles in scenes/components. Match what you put in `preview`.
7. Replace `assets/Sasi_Streams_logo.png` with your logo (same filename, any image).
8. Back in the dashboard → Overlays tab. Your new theme appears in the **Themes** card row. Click it to preview the scenes/components. If they look right, click **Make this theme active** — your active theme is now `cyber-noir` and OBS will pick it up on browser-source refresh.

That's it for a recolor. For deeper changes (different layouts, animations, fonts) keep reading.

---

## Path 2 — Build from scratch

### Step 0. Folder skeleton

```
sasi-overlays-<your-name>/
├── theme.json
├── scenes/
│   ├── starting-soon.html
│   ├── brb.html
│   ├── stream-ending.html
│   ├── overlay.html          ← in-game overlay (super chats, alerts, wheel)
│   └── just-chatting.html
├── components/
│   ├── subscribe.html
│   ├── likes.html
│   ├── nametag.html
│   └── webcam.html
├── lib/                      ← copy from default theme — usually unchanged
│   ├── config.js
│   ├── alerts.js
│   ├── chat.js
│   ├── live-update.js
│   ├── effects.css
│   ├── notifications.js
│   ├── bg-all.js
│   └── secrets.js
├── assets/
│   └── Sasi_Streams_logo.png
└── stingers/                 ← optional
```

The 5 scene files + 4 component files in the lists above are MANDATORY — the dashboard's `/apply-theme` endpoint refuses to swap to a theme that's missing any of them. This keeps OBS browser sources stable across themes (same filenames at the same paths).

### Step 1. Manifest (`theme.json`)

```json
{
  "$schema": "https://raw.githubusercontent.com/Sachinlearnsdev/stream-recording/main/docs/theme-schema.json",
  "name": "Cyber Noir",
  "id": "cyber-noir",
  "author": "your handle",
  "version": "1.0.0",
  "contractVersion": "1.0",
  "description": "Neon green-on-black scanline aesthetic.",
  "preview": {
    "primary":   "#00FFC8",
    "secondary": "#FF00C8",
    "accent":    "#FFFFFF",
    "bg":        "#000000"
  },
  "ships": {
    "scenes":     ["starting-soon.html", "brb.html", "stream-ending.html", "overlay.html", "just-chatting.html"],
    "components": ["subscribe.html", "likes.html", "nametag.html", "webcam.html"],
    "lib":        ["config.js", "alerts.js", "chat.js", "live-update.js", "effects.css", "notifications.js", "bg-all.js", "secrets.js"],
    "assets":     ["Sasi_Streams_logo.png"],
    "stingers":   []
  }
}
```

`id` must be unique across themes — the dashboard uses it to track theme identity across activate/deactivate cycles. Lowercase, alphanumerics + dashes.

`preview` colors show as swatches in the dashboard's theme cards — make them representative of your theme's actual look so you can spot-pick.

### Step 2. Scene HTML pattern

Every scene is a complete `<html>` doc that OBS loads as a 1920×1080 browser source.

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../lib/effects.css">
  <script src="../lib/config.js"></script>
  <script src="../lib/secrets.js"></script>
  <script src="../lib/alerts.js"></script>
  <script src="../lib/live-update.js"></script>
  <style>
    body { width: 1920px; height: 1080px; margin: 0; background: var(--bg); color: white; font-family: 'Inter', sans-serif; overflow: hidden; }
    .badge { color: var(--red); font-size: 32px; letter-spacing: 0.3em; }
    .main  { font-size: 180px; font-weight: 900; letter-spacing: -0.02em; }
  </style>
</head>
<body>
  <div class="badge"  data-bind="ss_badge">STARTING SOON</div>
  <div class="main"   data-bind="ss_mainText">STREAM</div>
  <div class="next"   data-bind="ss_nextStream">FRIDAY · 8PM</div>

  <script>
    // Read defaults from SASI_CONFIG (lib/config.js)
    document.querySelector('[data-bind="ss_badge"]').textContent      = SASI_CONFIG.startingSoon.badge;
    document.querySelector('[data-bind="ss_mainText"]').textContent   = SASI_CONFIG.startingSoon.mainText;
    document.querySelector('[data-bind="ss_nextStream"]').textContent = SASI_CONFIG.startingSoon.nextStream;

    // Wire live-edit so the dashboard can update text without an OBS refresh
    if (window.registerLiveUpdater) {
      registerLiveUpdater('ss_badge',      liveUpdate.text('[data-bind="ss_badge"]'));
      registerLiveUpdater('ss_mainText',   liveUpdate.text('[data-bind="ss_mainText"]'));
      registerLiveUpdater('ss_nextStream', liveUpdate.text('[data-bind="ss_nextStream"]'));
      applyLiveUpdaters();
    }
  </script>
</body>
</html>
```

The pattern is always:
1. Head loads the 4 mandatory scripts in order: `config.js`, `secrets.js`, `alerts.js`, `live-update.js`.
2. Body uses `data-bind="<key>"` on each editable element.
3. JS reads initial values from `SASI_CONFIG.<scene>.<field>`.
4. JS calls `registerLiveUpdater(key, fn)` for each editable element so dashboard edits propagate live.

The standardized localStorage keys for each scene are listed in [THEME_SPEC.md](THEME_SPEC.md#standardized-localstorage-keys). Use the same keys so the dashboard's existing edit fields work with your theme.

### Step 3. Components

Components are smaller standalone OBS browser sources (typically anchored to a corner of the canvas). Same scripting pattern as scenes — load the 4 lib scripts, register live-updaters on each editable element. Common live-edit keys:

| Component | Keys |
|---|---|
| subscribe.html | `sub_items` |
| likes.html | `likes_items` |
| nametag.html | `nametag` |
| webcam.html | `webcam_label`, `cam_position`, `cam_width`, `cam_height` |

### Step 4. Brand colors (live-switchable)

Use CSS variables for any color that should switch with theme/channel:

```css
:root {
  --red:    #FF2200;
  --orange: #FF7700;
  --gold:   #FFD700;
  --bg:     #050005;
}
```

The dashboard's color pickers write to `localStorage.sasi_cRed/cOrange/cGold` and a script in `lib/live-update.js` updates the matching CSS variables on every browser source. So if your theme uses `var(--red)` for accents, the user can recolor without editing your CSS.

### Step 5. Logo

`assets/Sasi_Streams_logo.png` is the conventional path. Reference it in scenes via `assets/Sasi_Streams_logo.png` (relative to the scene file, scenes go up one level so it's `../assets/...`). The active channel's `brand.logo` field in `sasi-secrets.js` lets the user override the path per-channel.

### Step 6. Stingers (optional)

Stingers are `.webm` videos that play as scene transitions in OBS. Each theme can ship its own at `stingers/stinger-active.webm`. The dashboard's stinger picker renames any other `.webm` in that folder to `stinger-active.webm` so OBS keeps working without re-pointing.

If you ship a `.html` generator (a self-recording stinger animation), drop it in `stingers/` too. The dashboard surfaces it as a "GENERATOR" tile — clicking it opens it in a new tab where you click record, download the resulting `.webm`, and drop it back into the folder.

---

## How users install your theme

1. Zip the folder (`sasi-overlays-<your-name>.zip` containing the `sasi-overlays-<your-name>/` directory at root).
2. User unzips into their install dir (`%LOCALAPPDATA%\clip-prep\`).
3. User opens dashboard → Overlays tab → your theme appears in the cards row → clicks **Make this theme active**.
4. OBS picks it up on browser-source refresh.

(Future: a `/upload-theme` endpoint will accept the zip via the dashboard. Until then, manual unzip.)

---

## Cheat sheet for AI assistants

If you're being asked to generate a theme, do exactly this:

1. **Read** [THEME_SPEC.md](THEME_SPEC.md) for the contract (mandatory filenames, manifest schema, scene HTML pattern).
2. **Open** an existing theme as your reference (`Overlay/sasi-overlays/scenes/starting-soon.html` is the canonical pattern).
3. **Generate** all 5 mandatory scenes + 4 mandatory components with:
   - Complete `<!doctype html>` documents (not fragments).
   - The 4 mandatory script tags from `../lib/`.
   - `data-bind="<key>"` on every editable element.
   - `registerLiveUpdater(key, fn)` calls + `applyLiveUpdaters()` for each.
   - CSS variables for brand colors (`--red`, `--orange`, `--gold`, `--bg`), no hardcoded hex.
4. **Copy** the `lib/` folder verbatim from the reference theme. You almost never want to modify it — it's the framework, not the theme.
5. **Generate** `theme.json` with valid `id`, `name`, `preview` (colors that match what you actually used), `ships` listing every file you created.
6. **Validate** locally: open the active dashboard's Overlays tab → your theme should show as a card with a green "VALID" state. If it shows "⚠ INVALID" with a missing-files list, fix and reload.
