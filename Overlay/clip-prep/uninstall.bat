@echo off
setlocal EnableExtensions EnableDelayedExpansion
title clip-prep uninstaller

set "RUN_NAME=ClipPrepWatcher"
set "RUN_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"

echo.
echo ========================================
echo   clip-prep uninstaller
echo ========================================
echo.
echo This removes the auto-start entry and stops the running watcher.
echo Files in this folder are NOT deleted.
echo.
echo Current state:
reg query "!RUN_KEY!" /v "!RUN_NAME!" 2>nul
if errorlevel 1 echo   (no Run-key auto-start registered)
echo.

echo Press Ctrl+C to cancel, or any key to continue...
pause >nul

set "SCRIPT_DIR=%~dp0"

echo.
echo [1/5] Asking running watcher to exit (via /stop endpoint)...
rem  IMPORTANT: must be /stop, NOT /restart.
rem  /restart calls launcherPath and re-spawns a new watcher instance — uninstall would
rem  leave the watcher still listening on 127.0.0.1:6789 until reboot.
rem  /stop exits the process without respawn (api.js POST /stop, see app.post('/stop')).
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:6789/stop' -Method Post -Headers @{'X-Clip-Prep'='1'} -TimeoutSec 2 | Out-Null; Write-Host '  Watcher acknowledged - exiting' } catch { Write-Host '  Watcher not reachable (may already be stopped)' }"

echo.
echo [2/5] Removing auto-start registry entry...
reg delete "!RUN_KEY!" /v "!RUN_NAME!" /f >nul 2>&1
if errorlevel 1 (
  echo   Note: registry entry could not be deleted ^(may not exist^).
) else (
  echo   Registry entry removed.
)

echo.
echo [3/5] Removing Start Menu + Desktop shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\uninstall-shortcut.ps1"

echo.
echo [4/5] Removing "clip-prep://" URL protocol...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\uninstall-protocol.ps1"

echo.
echo [5/5] Cleaning up any stale Task Scheduler entry from older installs...
schtasks /Delete /F /TN "!RUN_NAME!" >nul 2>&1
if errorlevel 1 (
  echo   ^(no stale schtasks entry^)
) else (
  echo   Stale schtasks entry removed.
)

echo.
echo ========================================
echo   UNINSTALL COMPLETE
echo ========================================
echo.
echo Files in this folder ^(node_modules, config.json, games.json, logs^)
echo were NOT deleted. Delete them manually if desired, or just re-run
echo install.bat to reinstall later.
echo.
pause
exit /b 0
