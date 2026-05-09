# clip-prep — Setup

## On the source PC (one-time)

Export your OBS state so it can be restored on a new machine:

```
Overlay/clip-prep/obs-export.bat
```

This bundles into `obs-export/` in the repo:

| What | From | Notes |
|---|---|---|
| `basic/` (full tree) | `%APPDATA%\obs-studio\basic\` | scenes, profiles, anything else you keep there (e.g. `sasi-overlays/`). Skips `*.bak` and `service.json` (stream keys) |
| `plugins/` (user) | `%APPDATA%\obs-studio\plugins\` | per-user plugins if any |
| `plugin_config/` | `%APPDATA%\obs-studio\plugin_config\` | **per-plugin settings** — Advanced Scene Switcher macros (Sub/Like triggers etc.), browser-source localStorage, and other plugin data. Skips `obs-browser/Cache/` and other browser caches |
| `plugin_manager/` | `%APPDATA%\obs-studio\plugin_manager\` | which plugins are enabled/disabled |
| `global.ini` | `%APPDATA%\obs-studio\global.ini` | which collection/profile is current, dock layout, theme |
| `user.ini` | `%APPDATA%\obs-studio\user.ini` | user-level OBS settings |
| `program-plugins/` | `C:\Program Files\obs-studio\obs-plugins\64bit\` (non-stock DLLs) + matching `data\obs-plugins\<name>\` | **bundled plugin binaries** — copied into the new PC's user-plugin folder by import, no manual installer needed |
| `third-party-plugins.txt` | filtered from system DLLs | reference list of what got bundled (stock OBS DLLs filtered out) |
| `system-plugins.txt` | `C:\Program Files\obs-studio\obs-plugins\` | raw DLL inventory (full list, including stock) |
| `safe_mode_module_blocklist.txt` | `%APPDATA%\obs-studio\safe_mode_module_blocklist.txt` | if you've blocked any modules, that list is preserved |
| `manifest.json` | (generated) | timestamp + what was bundled |

Stream keys are deliberately excluded — re-enter them in OBS Settings → Stream after import.

Commit / sync the repo so the new PC has it.

## On a new PC (1-click + manual plugin reinstall)

```
Overlay/clip-prep/bootstrap.bat
```

That's it. The script:

1. **Installs Node.js** via winget if missing
2. **Installs OBS Studio** via winget if missing
3. **Installs ffmpeg** via winget if missing (used by mix-recording splitter)
4. **Runs `install.bat`** — npm deps, registry auto-start, Start Menu shortcut, `clip-prep://` URL protocol
5. **Imports OBS user data** — full `basic/` tree, user plugins, `plugin_config/` (Advanced Scene Switcher macros etc.), `plugin_manager/`, `global.ini`, `user.ini` into `%APPDATA%\obs-studio\` (with a timestamped backup of any existing config)
6. **Auto-installs third-party plugins** — drops the bundled DLLs + data dirs from `program-plugins/` into `%APPDATA%\obs-studio\plugins\<name>\bin\64bit\` where OBS auto-discovers them on next launch. No installer downloads, no admin required.
7. **Registers `game-tracker.lua`** in every imported scene collection's scripts list, so it auto-loads when OBS opens
8. **Opens the dashboard**

**Things that DON'T transfer automatically** (Windows-side, not solvable by export):

- **Audio devices** — OBS pins these by per-machine GUID. Open OBS Settings → Audio and re-pick your mic/desktop devices.
- **Display capture** — same GUID issue. Re-pick the monitor on each Display Capture source.
- **Stream keys** — deliberately excluded for security. Re-enter in OBS Settings → Stream.

The bundled plugin list is logged to `obs-export/third-party-plugins.txt` for reference. The full raw DLL inventory is in `system-plugins.txt` if you want to compare against a fresh OBS install.

Requirements:
- Windows 10 / 11 with `winget` available
- Internet connection (for winget downloads of Node, OBS, ffmpeg)
- If OBS is already installed, it must be **closed** during bootstrap (we modify its config files)

## Verifying it worked

After bootstrap completes:

1. Dashboard auto-opens — Recorder tab should show 🟢 Running
2. Open OBS — your scenes/sources should match the source PC
3. OBS → Tools → Scripts — `game-tracker.lua` should be in the Loaded Scripts list, with "subscribed to Game Capture" in the Script Log
4. Try a 30-second test recording — output should land in the right game folder under your `targetRoot`

## Manual fallbacks (if any step fails)

| If this fails | Do this manually |
|---|---|
| Node.js install | Download from https://nodejs.org/en/download — run installer — re-run bootstrap |
| `install.bat` | See its console output. Common cause: `&` or special chars in install path — repo lives in a path Windows can't quote cleanly |
| OBS scene import | Manually: OBS → Scene Collection → Import → pick a JSON from `obs-export/scenes/` |
| OBS profile import | Manually: OBS → Profile → Import → pick the folder from `obs-export/profiles/<name>/` |
| Lua script registration | OBS → Tools → Scripts → `+` → pick `Overlay/clip-prep/game-tracker.lua` |

## Uninstall

```
Overlay/clip-prep/uninstall.bat
```

Removes registry Run-key entry, Start Menu shortcut, `clip-prep://` URL protocol, and any stale Task Scheduler entry. Files in `Overlay/clip-prep/` (config.json, games.json, node_modules, logs) are NOT deleted — re-run install.bat to reinstall.

## What's in this folder

| File | What it does |
|---|---|
| `bootstrap.bat` | 1-click new-PC setup (you'll use this most) |
| `install.bat` | Per-machine install (auto-start, shortcut, protocol). Called by bootstrap |
| `uninstall.bat` | Reverses install.bat |
| `obs-export.bat` | Bundles current OBS config into `obs-export/` (one-time, source PC) |
| `start.bat` | Manual foreground launch (for seeing live logs in cmd) |
| `clip-prep-launcher.vbs` | Hidden launcher (used by Run-key + URL protocol) |
| `watcher.js` | The Node service |
| `game-tracker.lua` | OBS script — subscribes to Game Capture hooks |
| `pick-folder.ps1` | Modern Windows folder picker (called by dashboard) |
| `split-mix.js` | CLI tool — splits `_mix/` recordings into per-game segments |
| `games.json` | exe → folder name mapping (live, hot-reloaded by watcher) |
| `games.default.json` | Pre-seeded mappings, copied to `games.json` on first run |
| `config.json` | Watcher config (paths, port, thresholds) |
| `clip-prep.log` | Rolling log file |

## Splitting mix recordings

Multi-game sessions land in `<targetRoot>/_mix/`. To split into per-game segments via ffmpeg + the sidecar timeline:

**From dashboard:** Recorder tab → Mix recordings section → click SPLIT on a row.

**From CLI:**
```
node split-mix.js <path-to-mix.mkv>     # one file
node split-mix.js --all                 # everything in _mix/
add --precise                           # frame-accurate (slow re-encode)
add --force                             # re-split files already split
```

Default: stream copy (fast, lossless, ±2s keyframe snap). Output lands in `<targetRoot>/<Game>/MKV/` and `<targetRoot>/<Game>/MP4/` with `_<exe>_<offset>s` suffix. A `_split-record.json` in `_mix/` tracks what's been split.

Requires `ffmpeg` in PATH:
```
winget install Gyan.FFmpeg
```
