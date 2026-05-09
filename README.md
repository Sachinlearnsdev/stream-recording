# clip-prep

Portable installer for the **clip-prep** OBS recording-router watcher. Sets up Node, OBS, ffmpeg, the watcher service, and a dashboard — all from one bootstrap script.

After install, all OBS bundle backup/restore happens **from the dashboard** — point the folder picker at any folder containing your OBS export bundle.

## Install on a new PC

### Option A — One-liner (recommended)

Open PowerShell, paste, hit Enter:

```powershell
irm https://raw.githubusercontent.com/Sachinlearnsdev/stream-recording/main/install.ps1 | iex
```

That fetches the installer, which clones the repo to `%LOCALAPPDATA%\clip-prep-src\` and runs bootstrap. Re-running pulls latest.

### Option B — Manual clone

```powershell
git clone https://github.com/Sachinlearnsdev/stream-recording.git clip-prep
cd clip-prep
.\Overlay\clip-prep\bootstrap.bat
```

### Either way, the bootstrap:

1. Installs **Node.js**, **OBS Studio**, **ffmpeg** via winget if missing
2. Copies clip-prep into `%LOCALAPPDATA%\clip-prep\`
3. Sets up auto-start on Windows login + Start Menu shortcut + `clip-prep://` URL protocol
4. Opens the dashboard in your browser

Total time: 2–10 min depending on what's already installed. Idempotent — safe to re-run after pulling repo updates.

## Restoring an OBS bundle

Once the dashboard is open:

1. Scroll to the **OBS Bundle** section
2. Click **📥 IMPORT BUNDLE**
3. Pick the folder containing your bundle (must have `manifest.json` + `basic/` at its root)
4. Wait for the green "Import complete" message

The script will:
- Auto-back up your current OBS state (you can restore it later from the same section)
- Restore all scenes, profiles, OBS settings (`global.ini`, `user.ini`)
- Restore plugin settings (Advanced Scene Switcher Sub/Like macros etc.)
- Auto-install bundled third-party plugin DLLs into your user-plugins folder
- Register `game-tracker.lua` in every scene collection

A bundle is a regular folder — keep it on a USB drive, OneDrive, a separate backup repo, anywhere.

## Creating a backup of your current OBS setup

Same dashboard section:

1. **Close OBS first** (the script refuses to run while OBS is open — it'd capture inconsistent browser-source state)
2. Click **📤 EXPORT BUNDLE**
3. Pick where to save it (any empty folder)

The bundle includes your scenes, profiles, plugin DLLs, plugin settings — everything except stream keys (deliberately excluded for security).

## Auto-backups

Every Import auto-saves your previous state to `%APPDATA%\obs-studio\_clip-prep-backup-<timestamp>\`. The dashboard lists these and lets you Restore (reverts to that snapshot) or Delete (sends to Recycle Bin).

## After importing a bundle on a new PC

A few Windows-side things won't transfer (per-machine GUIDs, security):

- **Audio devices** — Settings → Audio → re-pick your mic/desktop devices
- **Display capture sources** — re-pick the monitor on each Display Capture source
- **Stream keys** — Settings → Stream → re-enter Twitch/YouTube keys

Confirm the import worked by looking for `CLIPPREP_TEST` in OBS's Scene Collection menu — it's a canary marker baked into every export, with the export timestamp in the scene name.

## Updating

Re-run `bootstrap.bat` after `git pull`. It skips winget steps if Node/OBS/ffmpeg are present, preserves your `config.json` and `games.json`, just refreshes the code and re-registers auto-start.

## Uninstalling

```powershell
%LOCALAPPDATA%\clip-prep\uninstall.bat
```

Removes auto-start, Start Menu shortcut, URL protocol. Files in the install dir stay (delete the folder manually for a full wipe).

## What's in this repo

| Path | Purpose |
|---|---|
| `Overlay\clip-prep\` | The watcher (Node) + scripts + bootstrap |
| `Overlay\sasi-overlays\dashboard.html` | The dashboard (gets copied into the install dir on bootstrap) |
| `README.md` | This file |

The bundle (`obs-export/`) is **not** in this repo — keep it separately and load it via the dashboard's Import button.
