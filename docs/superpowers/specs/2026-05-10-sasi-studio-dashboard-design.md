# Sasi Studio — Dashboard Rebuild

**Status:** Design (awaiting approval)
**Date:** 2026-05-10
**Scope:** This spec covers the dashboard restructure + visual rebrand only. The Overlay editor and API Key vault are listed as future tabs but their implementations are deferred to separate specs.

---

## Summary

Replace the current 2,735-line single-scroll `dashboard.html` with a 6-tab sidebar layout in a "Studio Console" aesthetic (Inter + JetBrains Mono, dark surfaces, broadcast-green status indicators). Extract design tokens to a shared CSS file. Rebrand user-facing strings to "Sasi Studio" while keeping the internal package/install name `clip-prep` so existing installs continue to work.

## Goals

- Cut visual clutter — go from one long scroll to task-organized tabs
- Establish a locked design system (tokens.css + CLAUDE.md) so future UI work stays consistent without re-deciding
- Set up the structural shell for two upcoming features (Overlays, Keys) without building them yet
- Preserve every working feature of the current dashboard — recording status, OBS bundle ops, mix splitter, games editor, settings

## Non-Goals (deferred to future specs)

- Overlay live editor (Starting Soon, BRB, Ending Screen, lower thirds)
- API key vault (Twitch, YouTube, StreamElements, etc.)
- Renaming the watcher's internal package, install dir, registry keys, or repo
- Changing any HTTP API endpoint or any code under `Overlay/clip-prep/` (the Node watcher)

---

## Design Tokens (locked)

Single source of truth: `Overlay/sasi-overlays/tokens.css`. Imported by the dashboard and any future overlay HTML.

### Surfaces
| Token | Value | Use |
|---|---|---|
| `--bg-page` | `#0E1014` | Page background |
| `--bg-card` | `#13161D` | Card / panel background |
| `--bg-divider` | `#1F222A` | Inner dividers, table borders |
| `--bg-border` | `#2A2F3A` | Outer borders on interactive elements |

### Text
| Token | Value | Use |
|---|---|---|
| `--text-primary` | `#FFFFFF` | Headings, primary copy |
| `--text-secondary` | `#9DA5B4` | Body, descriptions |
| `--text-muted` | `#5A6273` | Labels, timestamps, hints |

### State accents
| Token | Value | Use |
|---|---|---|
| `--accent-online` | `#00FF85` | Status dot, success, focus ring |
| `--accent-rec` | `#FF3434` | REC indicator, destructive actions |
| `--accent-warn` | `#FFB020` | Warnings, mix-folder highlights |

### Typography
- **UI font:** `'Inter', 'Segoe UI', sans-serif`
- **Mono font:** `'JetBrains Mono', 'Consolas', monospace` — used for paths, timestamps, numeric readouts only
- **Type scale:**
  - Display 24px / weight 600 / letter-spacing -0.02em
  - Heading 18px / weight 600 / letter-spacing -0.01em
  - Body 13px / weight 400
  - Small 11px / weight 500
  - Small caps label 9px / weight 600 / letter-spacing 0.18em / uppercase
  - Mono readout 12px / weight 400

### Spacing scale
`4 · 8 · 12 · 16 · 20 · 24 · 32 · 48` (px). No arbitrary values.

### Other rules
- **Radii:** 3px (chips), 4px (buttons/inputs), 6–8px (cards). Never > 8px.
- **Borders:** 1px solid `--bg-divider` or `--bg-border`. No double borders, no shadows.
- **Focus state:** 1px solid `--accent-online`. No glow, no ring, no offset.
- **Transitions:** 150ms ease for hover / focus. No springs, no bounces.
- **Icons:** Lucide line-icons at 16/18/20px, stroke 1.5. Never emoji in chrome (chrome = navigation, headers, button labels). Emoji allowed in user-generated content only.

### Banned styles
The CLAUDE.md will explicitly forbid these:
- Linear/radial gradients of any kind
- Glassmorphism / `backdrop-filter: blur`
- Border-radius > 8px (no squircle bubbles)
- Generic blue accent (`#3b82f6` or any tailwind-blue)
- Purple-pink AI-default palettes
- Drop shadows of any kind (focus state is the only "glow" allowed, on the green dot only)

---

## Information Architecture

Sidebar (200px fixed) + main content area. Six tabs:

| # | Tab | Status this slice | Purpose |
|---|---|---|---|
| 1 | **Now** | Built fresh | Landing page. Watcher status, current recording, recent moves, quick actions |
| 2 | **Overlays** | Placeholder card | "Coming soon" + roadmap note. Future: live editor for Starting Soon, BRB, Ending, lower thirds |
| 3 | **Recordings** | Migrated | Per-game folders + mix splitter (combines current `list-recordings` + `list-mix` UIs) |
| 4 | **OBS** | Migrated | Bundle export/import, auto-backups list, "Register Lua" button |
| 5 | **Keys** | Placeholder card | "Coming soon" + roadmap note. Future: encrypted Twitch/YouTube/StreamElements key storage |
| 6 | **Settings** | Migrated | Dump/target paths, games.json editor, advanced config, stop/restart/uninstall |

### Sidebar header
- Logo: 28×28 gradient square (red → gold), "S" mark
- Title: "Sasi Studio" (12px, weight 700)
- Version: pulled from `package.json` (9px, muted, letter-spacing 0.12em)
- Status row: green dot + "Online · 2h 14m" (or red dot + "Offline" when API unreachable)

---

## Tab specs (this slice)

### Tab 1: Now (built fresh)
**Layout:**
1. Page header: small caps "DASHBOARD" label + "Now" display heading
2. **Hero card** — currently recording:
   - Small caps "RECORDING" label
   - Game name (display 20px) — pulled from `/status` recent moves or sidecar
   - Sub-line: "Started HH:MM:SS · N game capture hooked" (mono)
   - Top-right: REC pill (red dot + "REC" label) when recording active; hidden otherwise
   - Stats grid (3 cols): DUMP file count, QUEUE depth, UPTIME
   - Action row: "OPEN DUMP FOLDER" (primary white button), "RESTART" (secondary outline)
3. **Recent moves card** — last 5 entries from `state.recentMoves`:
   - Small caps "RECENT MOVES" label
   - Mono table: timestamp → basename → target folder
   - Mix-folder targets shown in `--accent-warn`

**API calls:** `GET /status` polled every 3s (existing).

### Tab 2: Overlays (placeholder)
- Single card explaining the upcoming feature
- Bullet list of what's planned: Starting Soon, BRB, Ending Screen, lower thirds
- Note: "Coming in next release"

### Tab 3: Recordings (migrated)
- Reuses existing `/list-recordings` and `/list-mix` API calls
- Per-game folders shown as accordion cards (game name + file count + total size). Collapsed by default; click header to expand.
- Expanded view shows file list with size, mtime, recycle action
- Mix section at bottom: list with split / preview / delete buttons (existing flow)
- Reorganization only — no API or behavior changes

### Tab 4: OBS (migrated)
- "Bundle" section: existing Export / Import buttons + status output area
- "Register Lua" button (existing — added in earlier session)
- "Auto-backups" section: existing list with restore/delete actions
- All existing behavior preserved

### Tab 5: Keys (placeholder)
- Single card explaining the upcoming feature
- Note: "Coming in next release. Will store stream keys encrypted via Windows DPAPI — only your user account can decrypt."

### Tab 6: Settings (migrated)
- Existing config form: dump folder path, target root, recording root convenience picker
- Existing games.json editor (raw JSON mode + structured mode)
- Existing advanced fields (quiet seconds, dominant threshold, keep-mkv toggle)
- Stop / restart / uninstall actions in a "Danger zone" subsection

---

## File layout

### New files
- `Overlay/sasi-overlays/tokens.css` — design tokens as CSS custom properties + utility classes for typography
- `CLAUDE.md` (repo root) — locked tokens summary, banned styles, project-specific UI rules ("overlay theme is locked", etc.)

### Rewritten
- `Overlay/sasi-overlays/dashboard.html` — full rewrite. Existing CSRF header injection (`X-Clip-Prep`) preserved. Existing `escapeHtml` consolidated to one quote-safe version (already done in earlier cleanup).

### Untouched
- All of `Overlay/clip-prep/` (Node watcher, Lua script, PowerShell scripts)
- `package.json`, `bootstrap.bat`, `install.bat`, `install.ps1`
- All existing API endpoints

---

## Naming / branding

**Renamed (user-facing only):**
- Dashboard `<title>`: "Sasi Streams — Dashboard" → "Sasi Studio"
- Sidebar logo text
- Page headers / about copy

**NOT renamed (technical surface stays `clip-prep`):**
- `package.json` name
- Install dir `%LOCALAPPDATA%\clip-prep\`
- Registry auto-start key `ClipPrepWatcher`
- Repo name `stream-recording`
- Internal log file paths
- The Node service's API host (`http://localhost:6789`)

Reason: renaming the technical surface forces every existing user (just you, currently) to re-run the installer with a new path, and breaks the running auto-start entry. Cosmetic rename achieves the goal without that cost.

---

## Acceptance criteria

A reviewer should be able to confirm each of these by opening the rebuilt dashboard:

1. Sidebar renders with 6 tabs in the listed order. Active tab is visually distinct (white left border + bg tint).
2. "Sasi Studio" appears as the window title and sidebar brand.
3. Hero recording card on the Now tab shows a green status dot when watcher is online, red when offline.
4. REC pill appears only when a recording is in progress. Heuristic: `state.queue.length > 0` from the existing `/status` response (i.e., the watcher is currently tracking unmoved files in the dump folder, which means OBS is actively writing). When queue is empty, no pill.
5. All actions on Recordings, OBS, and Settings tabs functionally match the current dashboard (no regressions in API calls).
6. No element on any tab uses a banned style (gradients, blur, border-radius > 8px, generic-blue, drop-shadows, emoji-in-chrome).
7. Inter and JetBrains Mono load via Google Fonts `<link>` tag; if offline (browser cache miss), the system fallbacks (`Segoe UI` for sans, `Consolas` for mono) render correctly without layout shift.
8. All existing tests in `Overlay/clip-prep/test/` still pass (none of them test the dashboard, so this is a smoke check that nothing else broke).
9. CSRF header injection (`X-Clip-Prep: 1` on POST/PUT) still works — verify by reloading the dashboard against a stopped watcher and confirming "Offline" state, then starting watcher and confirming "Online".
10. `tokens.css` exists, is imported by dashboard.html, and contains every token listed in the Design Tokens section.

---

## Open questions

None blocking. Possible follow-ups (not for this slice):

- Should tokens.css also be served from the watcher's HTTP API so future overlays can fetch it? (Currently both files live alongside each other in the install dir.)
- Should `Now` tab's "currently recording" detection be a new dedicated API endpoint, or inferred from the existing `/status` response? (Plan: inferred for this slice; promote to a real endpoint if accuracy issues emerge.)

---

## Implementation flow (reminder, not part of this spec)

After this spec is approved:
1. Invoke `writing-plans` skill to break the rebuild into ordered steps
2. Build tokens.css first (foundation)
3. Build the new dashboard.html in a single rewrite (not incremental — too much structural change)
4. CLAUDE.md last (it documents what was built)

The Overlay editor and Key vault each get their own design spec + plan + implementation cycle, after this one ships.
