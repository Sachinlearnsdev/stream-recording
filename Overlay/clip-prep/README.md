# clip-prep

Auto-routes OBS recordings into per-game folders by reading Game Capture hook events from a sidecar JSON.

## What it does

When you record gameplay, OBS produces an `.mkv` and (if auto-remux is on) an `.mp4`. clip-prep notices when both files appear in your dump folder, reads the sidecar JSON written by the OBS Lua script, figures out which game(s) were captured, and moves the files to:

```
<targetRoot>/<Game>/MKV/<basename>.mkv
<targetRoot>/<Game>/MP4/<basename>.mp4
```

Multi-game sessions go to `<targetRoot>/_mix/` with the sidecar preserved for a future splitter tool.

## Install (one time)

1. Edit `config.example.json` with your real `dumpDir` and `targetRoot`, then save it as `config.json` in the same folder.
2. Open OBS → Tools → Scripts → Add → select `game-tracker.lua` from this folder.
3. Double-click `install.bat`. It registers a Task Scheduler entry, starts the watcher, and opens the dashboard.

## Daily use

- Service auto-starts at Windows login. No manual launch needed.
- Open `Overlay/sasi-overlays/dashboard.html` to see status, recent moves, and edit `games.json` live.
- Stop / restart from the dashboard.

## Configuration

`config.json`:
- `dumpDir` — where OBS writes recordings
- `targetRoot` — root of organized output folders
- `httpPort` — dashboard talks to the watcher on this port (default 6789)
- `dominantGameThreshold` — fraction of recording owned by one game to skip the mix folder (default 0.80)
- `orphanWarnMinutes` — log warning if MKV sits without a paired MP4 this long
- `fileQuietSeconds` — wait this long for file size to stabilize before moving

`games.json` is created from `games.default.json` on first run. Edit it freely (or via the dashboard editor) — the watcher hot-reloads when it changes.

## Known limits

- Same-disk moves only (uses `fs.rename`). Cross-disk works but is slow.
- No auto-split during recording. Multi-game sessions land in `_mix/`. See spec for the deferred "P2" mode.
- Windows-only (`tasklist` for FiveM detection, `schtasks` for install).
