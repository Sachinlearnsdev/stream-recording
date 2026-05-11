# Sasi Studio (clip-prep) — Project Guide

## What this repo is

Windows-only OBS recording-router and dashboard. The Node service watches OBS's recording dump folder, reads sidecar JSON written by an OBS Lua script, and routes `.mkv`/`.mp4` pairs into per-game folders. The dashboard (single HTML page) talks to the service over `http://127.0.0.1:6789`.

User-facing brand: **Sasi Studio**. Internal package name remains `clip-prep` — do not rename install dirs, registry keys, or repo paths.

## Repo layout (after the multi-theme refactor)

```
Overlay/
├── dashboard.html              ← engine — Sasi Studio dashboard, NOT theme-owned
├── tokens.css                  ← engine — single source of truth for design tokens
├── sasi-secrets.example.js     ← template (multi-channel shape) — commit this
├── sasi-secrets.js             ← real keys, GITIGNORED, lives next to themes
├── sasi-overlays/              ← THE active theme (folder name is contract)
│   ├── theme.json              ← manifest (name, id, ships{...}, preview colors)
│   ├── scenes/                 ← OBS browser sources (1920×1080)
│   ├── components/             ← standalone OBS components (any aspect)
│   ├── lib/                    ← config.js, alerts.js, chat.js, live-update.js, secrets.js (stub), …
│   ├── assets/                 ← logo, etc.
│   └── stingers/               ← stinger-active.webm + generators
├── sasi-overlays-<name>/       ← inactive themes (apply via folder rename)
└── clip-prep/                  ← Node watcher service (NOT a theme — engine code)
```

**Active-theme contract:** the folder named exactly `sasi-overlays/` is the active theme. Swap = atomic rename (`sasi-overlays/` → `sasi-overlays-archived-<ts>/`, target → `sasi-overlays/`). The dashboard's iframes + OBS browser sources hard-code the path `…/sasi-overlays/scenes/<file>.html`, which keeps working across swaps.

**Why secrets live one level up:** if `sasi-secrets.js` lived inside the theme folder, theme swap would archive it and the user would lose their keys. The stub at `sasi-overlays/lib/secrets.js` resolves `../../sasi-secrets.js` so scenes can keep their plain `<script src="../lib/secrets.js">` tags.

## UI rules (load these whenever editing dashboard.html or any overlay HTML)

**Single source of truth:** `Overlay/tokens.css`. Always reference token variables (`var(--bg-page)`, `var(--accent-online)`, etc.) — never hard-code colors.

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

**Locked overlay rule:** overlay HTML files use the same tokens.css. Per-screen edits are limited to text content, animation choice, timer duration, and image swap via the dashboard's live-edit fields. Never edit colors, fonts, or layout positions per-screen — that would break brand consistency.

## Theme system contract

Each theme is a self-contained folder named `sasi-overlays[-<name>]`. Canonical contract: `docs/THEME_SPEC.md`. Hands-on walkthrough for new themes: `docs/THEME_BUILDING.md`. The summary below is the load-bearing slice.

**Mandatory files every theme must contain** (validated by `/list-themes` and `/apply-theme`):

- **Scenes** (`scenes/`):
  - `starting-soon.html`
  - `brb.html`
  - `stream-ending.html`
  - `overlay.html` (in-game)
  - `just-chatting.html`
- **Components** (`components/`):
  - `subscribe.html`
  - `likes.html`
  - `nametag.html`
  - `webcam.html`
- **Manifest:** `theme.json` (see `docs/THEME_SPEC.md` for schema).

**Optional (a theme can include but doesn't have to):**
- `components/terminal-alerts.html` — reserved for unrelated project; not enforced by validator.
- `stingers/stinger-active.webm` — generic name OBS Stinger transition points at; each theme can ship its own video at this filename.
- `assets/Sasi_Streams_logo.png` — generic logo path.
- `lib/` — each theme can include its own config.js / alerts.js / etc. if it needs different behavior.

A theme can ADD files (extra scenes, extra assets) — but the mandatory set must always be present, otherwise `/apply-theme` rejects the swap to prevent breaking OBS browser sources.

**Live-update wiring:** every editable element in scenes + components MUST register via `window.registerLiveUpdater(key, fn)` from `lib/live-update.js` so dashboard edits propagate without page reload. See `scenes/starting-soon.html` and `components/subscribe.html` for the pattern.

## Channels (multi-channel secrets)

`sasi-secrets.js` follows a multi-channel shape (see `Overlay/sasi-secrets.example.js`):

```js
window.SASI_SECRETS = {
  activeChannel: 'sasi-streams',
  streamelements: { youtube: { jwt }, twitch: { jwt } },  // shared
  channels: {
    'sasi-streams': { brand:{name,tagline,logo}, theme, youtube:{apiKeys,channelId}, twitch:{username} },
    'sasi-labs':    { ... },
  },
};
```

A backwards-compat shim at the bottom of the file projects `channels[activeChannel].youtube/twitch` up to top-level `s.youtube` / `s.twitch` so older overlay code keeps working. Switching channels = update `activeChannel` + apply that channel's `theme` (folder rename swap) + push brand to localStorage.

## Code rules

- Watcher service code: `Overlay/clip-prep/`. ESM Node 18+. Vanilla — no TypeScript.
- All HTTP endpoints have a CSRF guard: POST/PUT/DELETE require `X-Clip-Prep: 1` header. The dashboard's fetch wrapper adds this automatically; tests do too.
- All PowerShell child-process calls go through `runPowerShell(script, [args…])` in `src/api.js` — never interpolate user paths into a shell-string command.
- Existing tests live in `Overlay/clip-prep/test/*.test.js`. Run with `npm test` from `Overlay/clip-prep/`.

## Deploying

Live install lives at `%LOCALAPPDATA%\clip-prep\` (path stays `clip-prep` — internal name unchanged). Update by re-running `bootstrap.bat` from the repo or the `irm | iex` one-liner from the README. Do not write directly into the install dir during development.
