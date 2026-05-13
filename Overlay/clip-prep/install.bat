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

rem  Per-install warning log. Each step that hits a soft failure ("non-fatal")
rem  also appends a line here so the final summary can surface them all at
rem  once instead of the user scrolling back through console output.
set "WARN_LOG=!SCRIPT_DIR!install-warnings.log"
del "!WARN_LOG!" 2>nul

rem ---------- Step 1: Bootstrap config.json if missing ----------
if not exist "!SCRIPT_DIR!config.json" (
  echo [1/9] config.json not found - creating with defaults...
  call :BootstrapConfig
  if errorlevel 1 goto :Failed
) else (
  echo [1/9] config.json exists - keeping yours.
)

rem ---------- Step 2: npm install (always — handles upgrades) ----------
rem  Previously gated on `if not exist node_modules` which silently skipped
rem  the install on upgrade — new deps added to package.json wouldn't land
rem  until a manual cleanup. npm install is idempotent and fast on no-op
rem  (~1s when nothing changed), so just always run it.
echo.
echo [2/9] Running npm install (idempotent — fast if nothing changed)...
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

rem ---------- Step 3: Register registry Run-key auto-start ----------
echo.
echo [3/9] Registering auto-start in registry as "!RUN_NAME!"...
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
echo [4/9] Creating Start Menu + Desktop shortcuts ("Sasi Studio")...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\install-shortcut.ps1" -LauncherPath "!LAUNCHER!" -WorkingDir "!SCRIPT_DIR!"
if errorlevel 1 (
  echo Note: could not create shortcuts ^(non-fatal^).
) else (
  echo You can now press Win key, type "Sasi Studio", press Enter to open the dashboard.
)

echo.
echo [5/9] Registering "clip-prep://" URL protocol...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\install-protocol.ps1" -LauncherPath "!LAUNCHER!"
if errorlevel 1 (
  echo Note: could not register URL protocol ^(non-fatal^).
) else (
  echo Setup page's START button will now launch the watcher directly.
)

rem ---------- Step 6: Auto-register game-tracker.lua in OBS scenes ----------
rem  Best-effort: if OBS has been opened at least once, scene-collection JSONs
rem  exist and we can register the script automatically. On fresh installs
rem  the bundle import (step 8) handles Lua registration for the imported
rem  collections, so we can short-circuit if no scenes folder exists yet.
echo.
echo [6/9] Registering game-tracker.lua in OBS scene collections...
if not exist "%APPDATA%\obs-studio\basic\scenes" (
  echo   No %%APPDATA%%\obs-studio\basic\scenes yet ^(fresh OBS^) - step 8's bundle import will register Lua there.
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\register-lua.ps1" -LuaPath "!SCRIPT_DIR!obs\game-tracker.lua"
  if errorlevel 1 (
    echo Note: register-lua.ps1 failed ^(non-fatal^). Use the dashboard's "Register Lua" button after opening OBS once.
    echo [step 6] register-lua.ps1 failed - use dashboard's Register Lua button after opening OBS once. >> "!WARN_LOG!"
  )
)

rem ---------- Step 7: Generate sample-blue theme so user has 2 themes to test swap ----------
echo.
echo [7/9] Generating sample-blue theme (alternate to test theme-swap UI)...
powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\generate-sample-theme.ps1" -InstallDir "!SCRIPT_DIR!"
if errorlevel 1 (
  echo Note: generate-sample-theme.ps1 failed ^(non-fatal^). You'll start with one theme.
  echo [step 7] generate-sample-theme failed - you'll only have the default theme; not a real problem. >> "!WARN_LOG!"
)

rem ---------- Step 8: Auto-import default OBS bundle on truly-fresh OBS ----------
rem  If the user has NO existing OBS scene collections (truly first run) AND
rem  the repo vendored a default-bundle, import it so they start with working
rem  scenes instead of an empty OBS. Flat goto-based flow — nested parens with
rem  delayed expansion misparse on some CMD versions ("." was unexpected ...).
echo.
echo [8/9] Checking for default OBS bundle auto-import...
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
rem  Strip the trailing \ from SCRIPT_DIR so the powershell call's quoted
rem  arg "...\\" doesn't get parsed as escaped quote — that mangles the
rem  remaining args and PowerShell prompts for the missing -LuaPath.
set "_SD_NB=!SCRIPT_DIR!"
if "!_SD_NB:~-1!"=="\" set "_SD_NB=!_SD_NB:~0,-1!"
powershell -NoProfile -ExecutionPolicy Bypass -File "!_SD_NB!\scripts\obs-import.ps1" -RepoRoot "!_SD_NB!" -BundleSubdir "default-bundle" -LuaPath "!_SD_NB!\obs\game-tracker.lua"
if errorlevel 1 (
  echo Note: default bundle import failed ^(non-fatal^). Use the dashboard's Import OBS Bundle button manually.
  echo [step 8] default-bundle import failed - use Import OBS Bundle button in the dashboard. >> "!WARN_LOG!"
)
goto :_bundle_done

:_bundle_skip_none
echo   No vendored default-bundle in install dir; skipping auto-import.

:_bundle_done

rem ---------- Step 9: Start it now + open dashboard ----------
echo.
echo [9/9] Starting watcher (hidden) and opening dashboard...
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
echo   Dashboard:    http://127.0.0.1:6789/dashboard.html ^(opening now^)
echo   Install dir:  !SCRIPT_DIR!
echo   Auto-start:   on every Windows login ^(hidden in background^)
echo   Open later:   Win key -^> "Sasi Studio" -^> Enter ^(or click Desktop shortcut^)
echo   Live logs:    run start.bat in a cmd window
echo ========================================

rem  Surface every non-fatal warning collected during the run as a single
rem  summary block so the user doesn't need to scroll back through the
rem  scattered "Note: ... (non-fatal)" lines.
if exist "!WARN_LOG!" (
  echo.
  echo ========================================
  echo   WARNINGS during install ^(non-fatal^)
  echo ========================================
  type "!WARN_LOG!"
  echo.
  echo Full log: !WARN_LOG!
  echo ========================================
) else (
  echo.
  echo All steps clean - no warnings.
)
echo.
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
