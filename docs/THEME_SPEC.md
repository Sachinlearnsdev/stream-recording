# Sasi Studio Theme Spec (contract v1.0)

A **theme** is a self-contained folder of overlay HTML / CSS / JS / image / video files that an OBS Studio user loads as Browser Source URLs. The Sasi Studio dashboard can swap between themes by atomically renaming the active folder, so OBS browser sources keep working without re-pointing.

**Audience:** humans or AI assistants building a new theme.

> **For a hands-on walkthrough** with code patterns, recommended starting point, and an AI cheat sheet, see [THEME_BUILDING.md](THEME_BUILDING.md). This doc is the dry contract.

---

## Folder layout

```
sasi-overlays-<your-theme-name>/
├── theme.json                 ← manifest (REQUIRED — see schema below)
├── scenes/                    ← full-screen OBS browser sources (1920×1080 each)
│   ├── starting-soon.html      (REQUIRED)
│   ├── brb.html                (REQUIRED)
│   ├── stream-ending.html      (REQUIRED)
│   ├── overlay.html            (REQUIRED — in-game overlay)
│   ├── just-chatting.html      (REQUIRED)
│   └── *.html                  (any extras — breaking-news, transition, etc.)
├── components/                ← standalone OBS browser sources (any aspect)
│   ├── subscribe.html          (REQUIRED)
│   ├── likes.html              (REQUIRED)
│   ├── nametag.html            (REQUIRED)
│   ├── webcam.html             (REQUIRED)
│   └── *.html                  (any extras — terminal-alerts, etc.)
├── lib/                       ← shared JS/CSS that every scene loads
│   ├── config.js               (REQUIRED — defines window.SASI_CONFIG)
│   ├── alerts.js               (REQUIRED — StreamElements alert rendering)
│   ├── chat.js                 (REQUIRED — YouTube API / Twitch IRC)
│   ├── live-update.js          (REQUIRED — dashboard ↔ overlay communication)
│   ├── effects.css             (REQUIRED — glitch/animation styles)
│   ├── notifications.js        (REQUIRED — SASI_NOTIFY queue)
│   ├── bg-all.js               (REQUIRED — animated backgrounds)
│   └── secrets.js              (REQUIRED — stub loader for global secrets)
├── assets/                    ← images, fonts, etc.
│   └── Sasi_Streams_logo.png   (REQUIRED — brand logo path)
└── stingers/                  ← scene transition videos + generators
    ├── stinger-active.webm     (RECOMMENDED — OBS Stinger transition source)
    └── *.html or *.webm        (any alternates + generators)
```

The folder name follows the pattern `sasi-overlays-<your-theme-name>`. The currently-active theme is whichever folder is named exactly `sasi-overlays/` (no suffix).

---

## theme.json schema

```json
{
  "name":            "Human-readable theme name",
  "id":              "kebab-case-id",
  "author":          "Your name or handle",
  "version":         "semver, e.g. 1.0.0",
  "contractVersion": "1.0",
  "description":     "One-paragraph summary",
  "preview": {
    "primary":   "#RRGGBB",   // brand color 1 (used for major accents)
    "secondary": "#RRGGBB",   // brand color 2
    "accent":    "#RRGGBB",   // tertiary highlight
    "bg":        "#RRGGBB"    // dark background
  },
  "ships": {
    "scenes":     ["filename.html", ...],
    "components": ["filename.html", ...],
    "lib":        ["filename.js",  ...],
    "assets":     ["filename.png", ...],
    "stingers":   ["filename.webm", ...]
  }
}
```

The `preview.primary/secondary/accent` colors are shown in the dashboard's theme picker so the user can pick visually. They should match the dominant colors used in the theme's CSS.

---

## Scene HTML contract

Every scene MUST:

1. **Be full-screen 1920×1080.** OBS captures the whole document at that resolution. Use `body { width: 1920px; height: 1080px; }` or equivalent.

2. **Load these scripts in `<head>`** in this order (config.js auto-injects chat.js + effects.css):
   ```html
   <script src="../lib/config.js"></script>
   <script src="../lib/secrets.js"></script>
   <script src="../lib/alerts.js"></script>
   <script src="../lib/live-update.js"></script>
   ```

3. **Read content from `window.SASI_CONFIG`** rather than hard-coding text. Example:
   ```js
   document.getElementById('badge').textContent = SASI_CONFIG.startingSoon.badge;
   ```

4. **Wire editable elements via `registerLiveUpdater(key, fn)`** so the dashboard can edit the scene without OBS reload. Pattern:
   ```html
   <div class="badge" data-bind="ss_badge">STARTING SOON</div>
   <script>
     if (window.registerLiveUpdater) {
       registerLiveUpdater('ss_badge', liveUpdate.text('[data-bind="ss_badge"]'));
       applyLiveUpdaters();
     }
   </script>
   ```

5. **Color via CSS variables `--red`, `--orange`, `--gold`, `--bg`** (or override them in your theme's tokens). Don't hard-code hex codes for branding colors — the dashboard switches them via `liveUpdate.cssVar('--red')`.

---

## Standardized localStorage keys (the live-update contract)

The dashboard writes to `localStorage` with these keys; scene/component HTMLs read them and update DOM via the live-update framework.

### Scene keys

| Scene | Keys |
|---|---|
| starting-soon | `ss_badge`, `ss_topText`, `ss_mainText`, `ss_nextStream`, `ss_countdown`, `ss_clock`, `ss_ticker` |
| brb | `brb_badge`, `brb_mainText`, `brb_subtext`, `brb_tagline`, `brb_clock`, `brb_ticker` |
| stream-ending | `end_badge`, `end_tagline`, `end_thanks`, `end_main`, `end_sub`, `end_ticker` |
| overlay (in-game) | `sub_items`, `likes_items`, `nametag` (and per-config webcam fields) |
| just-chatting | `nametag` |

### Component keys

| Component | Keys |
|---|---|
| subscribe | `sub_items` |
| likes | `likes_items` |
| nametag | `nametag` |
| webcam | `webcam_label`, `cam_position`, `cam_width`, `cam_height` |
| terminal-alerts | `term_title` |

### Common keys (apply to all scenes)

| Key | Effect |
|---|---|
| `cRed` / `cOrange` / `cGold` | CSS color variable values (live) |
| `background` | Canvas background theme name (requires reload) |
| `glitchToggle` | Enable/disable glitch effects (requires reload) |
| `tickerSpeed` | Ticker scroll speed in seconds (requires reload) |
| `brand_name` / `brand_tagline` | Brand text |

A new theme MUST honor all keys it claims to support. Ignored keys silently no-op, which is fine.

---

## Stinger contract

OBS Stinger transition expects ONE filename to point at. By convention, that's `stingers/stinger-active.webm`. The dashboard's stinger picker lets the user pick from any `*.webm` in `stingers/` and renames the chosen one to `stinger-active.webm` (the previous active gets archived as `stinger-active-archived-<timestamp>.webm`).

`*.html` files in `stingers/` are GENERATOR tools — open in browser → click record → download `.webm`. They're not stingers themselves.

---

## How a theme gets activated

1. User drops theme zip into dashboard → server unzips into install dir as `sasi-overlays-<name>/`
2. Dashboard validates `theme.json` + checks all REQUIRED files exist
3. User clicks "Apply" → server atomically renames:
   - Current `sasi-overlays/` → `sasi-overlays-archived-<timestamp>/`
   - `sasi-overlays-<name>/` → `sasi-overlays/`
4. OBS browser sources point at `…/sasi-overlays/scenes/...` so they auto-pick up new content (refresh sources to be safe)

---

## Don'ts

- **Don't hard-code paths to the active folder name** in scene scripts. Always use relative paths (`../lib/`, `../assets/`, etc.). They resolve correctly regardless of which folder is active.
- **Don't ship `secrets.js` with real keys** in the theme. The `lib/secrets.js` stub loader fetches keys from the global `Overlay/sasi-secrets.js` outside the theme.
- **Don't depend on filenames OUTSIDE the standardized list** in OBS browser sources. If you ship `scenes/cool-extra.html`, the user has to add a Browser Source for it manually after import.
- **Don't break the live-update keys.** Even if your theme doesn't use a key, ignore it gracefully (don't error).

---

## Quick checklist for AI builders

When asked to build a new theme, generate exactly this structure:

```
✓ theme.json (with all required fields)
✓ scenes/{starting-soon, brb, stream-ending, overlay, just-chatting}.html
✓ components/{subscribe, likes, nametag, webcam}.html
✓ lib/* (you can copy from an existing theme — these are mostly the same)
✓ assets/Sasi_Streams_logo.png (placeholder OK if user will replace)
```

Each scene/component file must:
- Be a complete, valid HTML document
- Load the 4 mandatory scripts from `../lib/`
- Use CSS variables for brand colors
- Wire editable text via `data-bind` + `registerLiveUpdater`

If unsure about a specific HTML pattern, copy from the default theme at `Overlay/sasi-overlays/scenes/starting-soon.html` and modify visuals only.
