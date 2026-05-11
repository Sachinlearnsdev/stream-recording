@echo off
setlocal EnableExtensions EnableDelayedExpansion
title clip-prep - bootstrap

rem  bootstrap.bat
rem  Installs clip-prep on this PC. Installs Node/OBS/ffmpeg if missing,
rem  copies clip-prep into %LOCALAPPDATA%\clip-prep\, then runs install.bat
rem  from there. Does NOT import any OBS bundle - that's a one-click op
rem  from the dashboard's Import button after install completes.

set "REPO_CLIPPREP=%~dp0"
rem  Overlay/ is one level above clip-prep/. Holds dashboard.html, tokens.css,
rem  sasi-secrets.example.js, plus the active theme folder sasi-overlays/.
set "OVERLAY_SRC_DIR=!REPO_CLIPPREP!.."
set "INSTALL_DIR=%LOCALAPPDATA%\clip-prep"

echo.
echo ========================================
echo   clip-prep bootstrap
echo ========================================
echo   Source:  !REPO_CLIPPREP!
echo   Install: !INSTALL_DIR!
echo.
echo This will:
echo   1. Install Node.js if missing (winget)
echo   2. Install OBS Studio if missing (winget)
echo   3. Install ffmpeg if missing (winget)
echo   4. Copy clip-prep source to !INSTALL_DIR!
echo   5. Run install.bat from there (npm deps, auto-start, shortcut, protocol)
echo   6. Open the dashboard
echo.
echo   To restore an OBS bundle afterward: dashboard -^> Import OBS Bundle.
echo   IMPORTANT: Close OBS before continuing if you'll be importing a bundle.
echo.
pause

rem ---------- Step 1: Node.js ----------
echo.
echo [1/5] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Installing via winget...
  winget install --id=OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo ERROR: winget install failed.
    echo Install Node.js manually from https://nodejs.org/en/download then re-run this script.
    pause
    exit /b 1
  )
  rem Refresh PATH for this session so subsequent calls find node
  for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| find "REG_"') do set "MACHINE_PATH=%%B"
  for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul ^| find "REG_"') do set "USER_PATH=%%B"
  set "PATH=!MACHINE_PATH!;!USER_PATH!"
  where node >nul 2>&1
  if errorlevel 1 (
    echo.
    echo Node.js installed but not yet in PATH for this shell.
    echo Open a NEW cmd window and re-run bootstrap.bat.
    pause
    exit /b 0
  )
  echo Node.js installed.
) else (
  for /f %%V in ('node --version') do echo Node.js: %%V
)

rem ---------- Step 2: OBS Studio ----------
rem  Detection looks at multiple paths because OBS can land in any of them
rem  depending on machine arch + how it was installed (msi/portable/winget).
echo.
echo [2/5] Checking OBS Studio...
set "_OBS_FOUND="
if exist "C:\Program Files\obs-studio\bin\64bit\obs64.exe"          set "_OBS_FOUND=C:\Program Files\obs-studio\bin\64bit\obs64.exe"
if not defined _OBS_FOUND if exist "C:\Program Files (x86)\obs-studio\bin\64bit\obs64.exe" set "_OBS_FOUND=C:\Program Files (x86)\obs-studio\bin\64bit\obs64.exe"
if not defined _OBS_FOUND if exist "%LOCALAPPDATA%\Programs\obs-studio\bin\64bit\obs64.exe" set "_OBS_FOUND=%LOCALAPPDATA%\Programs\obs-studio\bin\64bit\obs64.exe"
if defined _OBS_FOUND goto :_obs_done

echo OBS Studio not found. Trying winget first...
winget install --id=OBSProject.OBSStudio --silent --accept-source-agreements --accept-package-agreements
rem  winget's exit code doesn't always reflect inner installer success
rem  (NSIS exit code 6 = "files in use" gets swallowed). Trust the file
rem  system instead: if obs64.exe exists at the canonical path now, win.
if exist "C:\Program Files\obs-studio\bin\64bit\obs64.exe" (
  echo OBS Studio installed via winget.
  set "_OBS_FOUND=C:\Program Files\obs-studio\bin\64bit\obs64.exe"
  goto :_obs_done
)

echo.
echo winget install did not produce obs64.exe (likely a Chromium/CEF process
echo locked CEF DLLs - Brave, Chrome, Edge, Discord, VSCode, etc.).
echo Falling back to the official portable .zip download...
powershell -NoProfile -ExecutionPolicy Bypass -File "!REPO_CLIPPREP!scripts\install-obs-portable.ps1"
if exist "C:\Program Files\obs-studio\bin\64bit\obs64.exe" (
  set "_OBS_FOUND=C:\Program Files\obs-studio\bin\64bit\obs64.exe"
  goto :_obs_done
)

echo.
echo WARNING: OBS Studio could not be installed automatically.
echo Install manually from https://obsproject.com/download then re-run bootstrap.
echo ^(continuing - clip-prep itself doesn't need OBS to run^)
goto :_obs_after

:_obs_done
echo OBS Studio: !_OBS_FOUND!

:_obs_after

rem ---------- Step 3: ffmpeg ----------
echo.
echo [3/5] Checking ffmpeg...
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo ffmpeg not found. Installing via winget...
  winget install --id=Gyan.FFmpeg --silent --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo WARNING: winget ffmpeg install failed.
    echo Mix-recording splitter will fall back to its own PATH lookup. Manual install:
    echo   winget install Gyan.FFmpeg
    echo ^(continuing^)
  ) else (
    rem Refresh PATH so split-mix.js finds it without a relog
    for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| find "REG_"') do set "MACHINE_PATH=%%B"
    for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul ^| find "REG_"') do set "USER_PATH=%%B"
    set "PATH=!MACHINE_PATH!;!USER_PATH!"
    echo ffmpeg installed.
  )
) else (
  for /f "tokens=3" %%V in ('ffmpeg -version 2^>^&1 ^| findstr /b "ffmpeg version"') do echo ffmpeg: %%V
)

rem ---------- Step 4: Copy clip-prep into install dir ----------
echo.
echo [4/5] Copying clip-prep into !INSTALL_DIR!...
if not exist "!INSTALL_DIR!" mkdir "!INSTALL_DIR!"
rem  %~dp0 always ends with \. Strip it so robocopy doesn't see "...\\".
set "_SRC_DIR=!REPO_CLIPPREP!"
if "!_SRC_DIR:~-1!"=="\" set "_SRC_DIR=!_SRC_DIR:~0,-1!"

rem  Resolve OVERLAY_SRC_DIR to an absolute path (eliminates the trailing
rem  \.. that REPO_CLIPPREP/.. produces). Using `for %%I in ("...") do
rem  set "_OVL_DIR=%%~fI"` is the canonical CMD way to normalize a path.
for %%I in ("!OVERLAY_SRC_DIR!") do set "_OVL_DIR=%%~fI"

robocopy "!_SRC_DIR!" "!INSTALL_DIR!" /E ^
  /XD node_modules .git ^
  /XF clip-prep.log config.json games.json bootstrap.bat ^
  /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP
if !ERRORLEVEL! GEQ 8 (
  echo.
  echo ERROR: robocopy failed with code !ERRORLEVEL!
  pause
  exit /b 1
)

rem  Copy Sasi Studio engine files + theme. We use flat goto-based flow (not
rem  nested parenthesized if-blocks) because CMD's parser was misreading the
rem  nested delayed-expansion + substring + paren structure on a fresh install
rem  and aborting step 4 with ". was unexpected at this time."
if not exist "!_OVL_DIR!\dashboard.html" goto :_step4_warn

copy /Y "!_OVL_DIR!\dashboard.html" "!INSTALL_DIR!\dashboard.html" >nul
if exist "!_OVL_DIR!\dashboard-old.html" copy /Y "!_OVL_DIR!\dashboard-old.html" "!INSTALL_DIR!\dashboard-old.html" >nul
if exist "!_OVL_DIR!\dashboard-v1.html" copy /Y "!_OVL_DIR!\dashboard-v1.html" "!INSTALL_DIR!\dashboard-v1.html" >nul
if exist "!_OVL_DIR!\tokens.css" copy /Y "!_OVL_DIR!\tokens.css" "!INSTALL_DIR!\tokens.css" >nul
if exist "!_OVL_DIR!\sasi-secrets.example.js" copy /Y "!_OVL_DIR!\sasi-secrets.example.js" "!INSTALL_DIR!\sasi-secrets.example.js" >nul

rem  Active theme folder (sasi-overlays/). /XF excludes secrets.js so we
rem  don't overwrite the user's real keys on re-install.
if not exist "!_OVL_DIR!\sasi-overlays" goto :_step4_after_active_theme
if not exist "!INSTALL_DIR!\sasi-overlays" mkdir "!INSTALL_DIR!\sasi-overlays"
robocopy "!_OVL_DIR!\sasi-overlays" "!INSTALL_DIR!\sasi-overlays" /E /XF secrets.js /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
:_step4_after_active_theme

rem  Vendor sibling sample themes (sasi-overlays-blue/purple/minimal/etc.)
rem  pushd so the for-loop pattern is relative — %%T resolves to a bare name.
pushd "!_OVL_DIR!" >nul
for /d %%T in (sasi-overlays-*) do (
  if not exist "!INSTALL_DIR!\%%T" mkdir "!INSTALL_DIR!\%%T"
  robocopy "%%T" "!INSTALL_DIR!\%%T" /E /XF secrets.js /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
)
popd >nul

rem  Preserve real keys: if the repo has a local Overlay/sasi-secrets.js
rem  (gitignored — dev-machine only, NOT on iex fresh clones), vendor it
rem  UNLESS one already exists in install dir.
if not exist "!_OVL_DIR!\sasi-secrets.js" goto :_step4_after_secrets
if exist "!INSTALL_DIR!\sasi-secrets.js" goto :_step4_after_secrets
copy /Y "!_OVL_DIR!\sasi-secrets.js" "!INSTALL_DIR!\sasi-secrets.js" >nul
echo   sasi-secrets.js vendored from local repo (one-time on fresh install).
:_step4_after_secrets

rem  Vendor the default OBS bundle if shipped. install.bat auto-imports
rem  it iff the user has no existing OBS scene collections.
if not exist "!_OVL_DIR!\default-bundle" goto :_step4_after_bundle
if not exist "!INSTALL_DIR!\default-bundle" mkdir "!INSTALL_DIR!\default-bundle"
robocopy "!_OVL_DIR!\default-bundle" "!INSTALL_DIR!\default-bundle" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
echo   Default OBS bundle copied (install.bat will auto-import if fresh OBS).
:_step4_after_bundle

echo   Engine + active theme + sibling themes copied to install dir.
goto :_step4_done

:_step4_warn
echo   WARNING: dashboard.html not found at !_OVL_DIR!

:_step4_done
echo   Source files copied.

rem ---------- Step 5: Run install.bat from install dir ----------
echo.
echo [5/5] Running install.bat from install dir...
echo.
call "!INSTALL_DIR!\install.bat"
if errorlevel 1 (
  echo install.bat failed. Bootstrap aborted.
  pause
  exit /b 1
)

echo.
echo ========================================
echo   BOOTSTRAP COMPLETE
echo ========================================
echo   Install dir: !INSTALL_DIR!
echo   The watcher is running, dashboard is open in your browser.
echo   Win key - "clip-prep" - Enter launches the watcher anytime.
echo.
echo ========================================
echo   OBS LUA SCRIPT - AUTO-REGISTERED
echo ========================================
echo   The clip-prep Lua script was auto-registered in your existing OBS
echo   scene collections. If OBS was open, restart it for the change to
echo   take effect. You should see "[clip-prep] subscribed to Game Capture"
echo   in the Script Log dock.
echo.
echo   If you create a NEW scene collection later, click the "Register Lua"
echo   button in the dashboard to wire it up too.
echo ========================================
echo.
echo   Bundle ops are in the dashboard:
echo     - Restore an OBS bundle: Import OBS Bundle button
echo     - Back up current setup:  Export OBS Bundle button
echo.
pause
