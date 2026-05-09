@echo off
setlocal EnableExtensions EnableDelayedExpansion
title clip-prep installer

set "SCRIPT_DIR=%~dp0"
set "RUN_NAME=ClipPrepWatcher"
set "RUN_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "LAUNCHER=!SCRIPT_DIR!clip-prep-launcher.vbs"

echo.
echo ========================================
echo   clip-prep installer
echo ========================================
echo   Install dir: !SCRIPT_DIR!
echo ========================================
echo.

rem ---------- Step 1: Bootstrap config.json if missing ----------
if not exist "!SCRIPT_DIR!config.json" (
  echo [1/4] config.json not found - creating with defaults...
  call :BootstrapConfig
  if errorlevel 1 goto :Failed
) else (
  echo [1/4] config.json exists - keeping yours.
)

rem ---------- Step 2: npm install if node_modules missing ----------
if not exist "!SCRIPT_DIR!node_modules" (
  echo.
  echo [2/4] Installing npm dependencies...
  pushd "!SCRIPT_DIR!"
  call npm install
  set "NPM_RC=!ERRORLEVEL!"
  popd
  if not "!NPM_RC!"=="0" (
    echo.
    echo ERROR: npm install failed with exit code !NPM_RC!
    echo Hint: open a fresh cmd window and run: node --version
    echo If that fails, Node.js is not installed or not in PATH.
    goto :Failed
  )
) else (
  echo [2/4] node_modules exists - skipping npm install.
)

rem ---------- Step 3: Register registry Run-key auto-start ----------
echo.
echo [3/4] Registering auto-start in registry as "!RUN_NAME!"...
reg add "!RUN_KEY!" /v "!RUN_NAME!" /t REG_SZ /d "wscript.exe \"!LAUNCHER!\"" /f
if errorlevel 1 (
  echo.
  echo ERROR: reg add failed.
  goto :Failed
)
echo Auto-start registered. The watcher will run hidden on every login.

rem Clean up any stale Task Scheduler entry from earlier installer attempts
schtasks /Delete /F /TN "!RUN_NAME!" >nul 2>&1

rem ---------- Step 4: Create Start Menu shortcut ----------
echo.
echo [4/5] Creating Start Menu shortcut "clip-prep"...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\install-shortcut.ps1" -LauncherPath "!LAUNCHER!" -WorkingDir "!SCRIPT_DIR!"
if errorlevel 1 (
  echo Note: could not create Start Menu shortcut ^(non-fatal^).
) else (
  echo You can now press Win key, type "clip-prep", press Enter to start the watcher.
)

echo.
echo [4b/5] Registering "clip-prep://" URL protocol...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\install-protocol.ps1" -LauncherPath "!LAUNCHER!"
if errorlevel 1 (
  echo Note: could not register URL protocol ^(non-fatal^).
) else (
  echo Setup page's START button will now launch the watcher directly.
)

rem ---------- Step 5: Start it now + open dashboard ----------
echo.
echo [5/5] Starting watcher (hidden) and opening dashboard...
wscript.exe "!LAUNCHER!"

rem Look for dashboard.html in two locations: alongside install (preferred,
rem after bootstrap copies it here) or sibling-folder (legacy, when running
rem install.bat directly from the repo without bootstrap).
set "DASHBOARD=!SCRIPT_DIR!dashboard.html"
if not exist "!DASHBOARD!" set "DASHBOARD=!SCRIPT_DIR!..\sasi-overlays\dashboard.html"
echo Dashboard: !DASHBOARD!
start "" "!DASHBOARD!"

echo.
echo ========================================
echo   INSTALL COMPLETE
echo ========================================
echo   - Watcher auto-starts on every Windows login (hidden in background).
echo   - If it crashes or gets stopped: Win key -^> type "clip-prep" -^> Enter.
echo   - Setup/Dashboard pages let you change paths and edit game folders.
echo   - To see live logs at any time, run start.bat in a cmd window.
echo.
echo   ONE-TIME OBS STEP: in OBS, Tools -^> Scripts -^> + -^>
echo     paste this FOLDER into address bar, select game-tracker.lua:
echo     !SCRIPT_DIR!obs
echo ========================================
echo.
pause
exit /b 0

:BootstrapConfig
  set "DEFAULT_DUMP=!USERPROFILE!\Videos\_incoming"
  set "DEFAULT_ROOT=!USERPROFILE!\Videos"
  if not exist "!DEFAULT_DUMP!" mkdir "!DEFAULT_DUMP!" 2>nul
  set "DUMP_FWD=!DEFAULT_DUMP:\=/!"
  set "ROOT_FWD=!DEFAULT_ROOT:\=/!"
  > "!SCRIPT_DIR!config.json" (
    echo {
    echo   "dumpDir": "!DUMP_FWD!",
    echo   "targetRoot": "!ROOT_FWD!",
    echo   "httpPort": 6789,
    echo   "dominantGameThreshold": 0.95,
    echo   "orphanWarnMinutes": 10,
    echo   "fileQuietSeconds": 2,
    echo   "logCapacity": 200,
    echo   "keepMkv": true
    echo }
  )
  echo       dumpDir:    !DEFAULT_DUMP!
  echo       targetRoot: !DEFAULT_ROOT!
  echo       Edit later via the dashboard's BROWSE buttons.
  exit /b 0

:Failed
  echo.
  echo ========================================
  echo   INSTALL FAILED
  echo ========================================
  echo.
  pause
  exit /b 1
