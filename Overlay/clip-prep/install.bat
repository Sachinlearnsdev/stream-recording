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

rem ---------- Step 4c: Auto-register game-tracker.lua in OBS scenes ----------
rem  Best-effort: if OBS has been opened at least once, scene-collection JSONs
rem  exist and we can register the script automatically. If not (fresh OBS),
rem  the script prints a "no scenes yet" message and exits 0.
echo.
echo [4c/5] Registering game-tracker.lua in existing OBS scene collections...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\register-lua.ps1" -LuaPath "!SCRIPT_DIR!obs\game-tracker.lua"
if errorlevel 1 (
  echo Note: register-lua.ps1 failed ^(non-fatal^). Use the dashboard's "Register Lua" button after opening OBS once.
)

rem ---------- Step 4d: Generate sample-blue theme so user has 2 themes to test swap ----------
echo.
echo [4d/5] Generating sample-blue theme (so dashboard Themes section has alternates to test)...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\generate-sample-theme.ps1" -InstallDir "!SCRIPT_DIR!"
if errorlevel 1 (
  echo Note: generate-sample-theme.ps1 failed ^(non-fatal^). You'll start with one theme.
)

rem ---------- Step 4e: Auto-import default OBS bundle on truly-fresh OBS ----------
rem  If the user has NO existing OBS scene collections (truly first run) AND
rem  the repo vendored a default-bundle, import it so they start with working
rem  scenes instead of an empty OBS. Flat goto-based flow — nested parens with
rem  delayed expansion misparse on some CMD versions ("." was unexpected ...).
echo.
echo [4e/5] Checking for default OBS bundle auto-import...
set "_OBS_SCENES_DIR=%APPDATA%\obs-studio\basic\scenes"
if not exist "!SCRIPT_DIR!default-bundle" goto :_bundle_skip_none
rem  Bundle is vendored. Decide whether to import based on existing OBS state.
if not exist "!_OBS_SCENES_DIR!"        goto :_bundle_do_import
dir /b /a-d "!_OBS_SCENES_DIR!\*.json" 2>nul | findstr "." >nul
if errorlevel 1 goto :_bundle_do_import
echo   Existing OBS scene collections detected — skipping auto-import to preserve your setup.
echo   To replace with the default bundle, use the dashboard's Import OBS Bundle button.
goto :_bundle_done

:_bundle_do_import
echo   No existing OBS scene collections — importing vendored default bundle...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\obs-import.ps1" -RepoRoot "!SCRIPT_DIR!" -BundleSubdir "default-bundle" -LuaPath "!SCRIPT_DIR!obs\game-tracker.lua"
if errorlevel 1 echo Note: default bundle import failed ^(non-fatal^). Use the dashboard's Import OBS Bundle button manually.
goto :_bundle_done

:_bundle_skip_none
echo   No vendored default-bundle in install dir; skipping auto-import.

:_bundle_done

rem ---------- Step 5: Start it now + open dashboard ----------
echo.
echo [5/5] Starting watcher (hidden) and opening dashboard...
wscript.exe "!LAUNCHER!"

rem Open the dashboard via http://127.0.0.1:6789 so every overlay iframe is
rem same-origin with the dashboard. Required for HTML stinger auto-record
rem (canvas access from a hidden iframe) and reliable cross-iframe localStorage.
rem Brief delay so the watcher's listener is up before the browser hits it.
echo Dashboard: http://127.0.0.1:6789/dashboard.html
timeout /t 2 /nobreak >nul 2>&1
start "" "http://127.0.0.1:6789/dashboard.html"

echo.
echo ========================================
echo   INSTALL COMPLETE
echo ========================================
echo   - Watcher auto-starts on every Windows login (hidden in background).
echo   - If it crashes or gets stopped: Win key -^> type "clip-prep" -^> Enter.
echo   - Setup/Dashboard pages let you change paths and edit game folders.
echo   - To see live logs at any time, run start.bat in a cmd window.
echo.
echo   The clip-prep Lua script was auto-registered in your OBS scene
echo   collections. If OBS was open during install, restart it for the
echo   change to take effect. If you add a new scene collection later,
echo   use the dashboard's "Register Lua" button to wire it up.
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
