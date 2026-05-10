# Sasi Studio (clip-prep) — Project Guide

## What this repo is

Windows-only OBS recording-router and dashboard. The Node service watches OBS's recording dump folder, reads sidecar JSON written by an OBS Lua script, and routes `.mkv`/`.mp4` pairs into per-game folders. The dashboard (single HTML page) talks to the service over `http://127.0.0.1:6789`.

User-facing brand: **Sasi Studio**. Internal package name remains `clip-prep` — do not rename install dirs, registry keys, or repo paths.

## UI rules (load these whenever editing dashboard.html or any overlay HTML)

**Single source of truth:** `Overlay/sasi-overlays/tokens.css`. Always reference token variables (`var(--bg-page)`, `var(--accent-online)`, etc.) — never hard-code colors.

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

**Locked overlay rule:** overlay HTML files (Starting Soon, BRB, Ending, lower thirds — coming in future releases) use the same tokens.css. Per-screen edits are limited to text content, animation choice, timer duration, and image swap. Never edit colors, fonts, or layout positions per-screen — that would break brand consistency.

## Code rules

- Watcher service code: `Overlay/clip-prep/`. ESM Node 18+. Vanilla — no TypeScript.
- All HTTP endpoints have a CSRF guard: POST/PUT/DELETE require `X-Clip-Prep: 1` header. The dashboard's fetch wrapper adds this automatically; tests do too.
- All PowerShell child-process calls go through `runPowerShell(script, [args…])` in `src/api.js` — never interpolate user paths into a shell-string command.
- Existing tests live in `Overlay/clip-prep/test/*.test.js`. Run with `npm test` from `Overlay/clip-prep/`.

## Deploying

Live install lives at `%LOCALAPPDATA%\clip-prep\` (path stays `clip-prep` — internal name unchanged). Update by re-running `bootstrap.bat` from the repo or the `irm | iex` one-liner from the README. Do not write directly into the install dir during development.
