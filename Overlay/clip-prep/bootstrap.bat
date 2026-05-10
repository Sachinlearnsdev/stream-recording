@echo off
setlocal EnableExtensions EnableDelayedExpansion
title clip-prep - bootstrap

rem  bootstrap.bat
rem  Installs clip-prep on this PC. Installs Node/OBS/ffmpeg if missing,
rem  copies clip-prep into %LOCALAPPDATA%\clip-prep\, then runs install.bat
rem  from there. Does NOT import any OBS bundle - that's a one-click op
rem  from the dashboard's Import button after install completes.

set "REPO_CLIPPREP=%~dp0"
set "DASHBOARD_SRC_DIR=!REPO_CLIPPREP!..\sasi-overlays"
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
echo.
echo [2/5] Checking OBS Studio...
if exist "C:\Program Files\obs-studio\bin\64bit\obs64.exe" (
  echo OBS Studio: already installed.
) else (
  echo OBS Studio not found. Installing via winget...
  winget install --id=OBSProject.OBSStudio --silent --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo WARNING: winget OBS install failed or was cancelled.
    echo Install manually from https://obsproject.com/download then re-run bootstrap.
    echo ^(continuing - clip-prep itself doesn't need OBS to run^)
  ) else (
    echo OBS Studio installed.
  )
)

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
rem  %~dp0 always ends with \, but "...\" terminates the quoted string with
rem  an escaped quote and breaks robocopy's arg parsing. Strip trailing slash.
set "_SRC_DIR=!REPO_CLIPPREP!"
if "!_SRC_DIR:~-1!"=="\" set "_SRC_DIR=!_SRC_DIR:~0,-1!"
set "_DASH_DIR=!DASHBOARD_SRC_DIR!"
if "!_DASH_DIR:~-1!"=="\" set "_DASH_DIR=!_DASH_DIR:~0,-1!"

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

rem  Copy dashboard.html and its logo asset (lives in sibling sasi-overlays/)
if exist "!_DASH_DIR!\dashboard.html" (
  copy /Y "!_DASH_DIR!\dashboard.html" "!INSTALL_DIR!\dashboard.html" >nul
  if exist "!_DASH_DIR!\dashboard-old.html" copy /Y "!_DASH_DIR!\dashboard-old.html" "!INSTALL_DIR!\dashboard-old.html" >nul
  if exist "!_DASH_DIR!\dashboard-v2.html" copy /Y "!_DASH_DIR!\dashboard-v2.html" "!INSTALL_DIR!\dashboard-v2.html" >nul
  if exist "!_DASH_DIR!\tokens.css" copy /Y "!_DASH_DIR!\tokens.css" "!INSTALL_DIR!\tokens.css" >nul
  if exist "!_DASH_DIR!\assets" (
    if not exist "!INSTALL_DIR!\assets" mkdir "!INSTALL_DIR!\assets"
    robocopy "!_DASH_DIR!\assets" "!INSTALL_DIR!\assets" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
  )
  rem  Copy overlay scenes/components/lib so dashboard can iframe-preview them
  for %%D in (scenes components lib) do (
    if exist "!_DASH_DIR!\%%D" (
      if not exist "!INSTALL_DIR!\%%D" mkdir "!INSTALL_DIR!\%%D"
      robocopy "!_DASH_DIR!\%%D" "!INSTALL_DIR!\%%D" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
    )
  )
  if exist "!_DASH_DIR!\secrets.example.js" copy /Y "!_DASH_DIR!\secrets.example.js" "!INSTALL_DIR!\secrets.example.js" >nul
  echo   Dashboard + overlays copied to install dir.
) else (
  echo   WARNING: dashboard.html not found at !_DASH_DIR!
)
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
