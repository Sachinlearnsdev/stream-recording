@echo off
setlocal EnableExtensions EnableDelayedExpansion
title clip-prep - import OBS config

set "SCRIPT_DIR=%~dp0"
rem Repo root is two levels up from clip-prep/
for %%I in ("!SCRIPT_DIR!..\..") do set "REPO_ROOT=%%~fI"
set "LUA_PATH=!SCRIPT_DIR!obs\game-tracker.lua"

echo.
echo ========================================
echo   Import OBS config from obs-export/
echo ========================================
echo   Repo root:    !REPO_ROOT!
echo   Bundle:       !REPO_ROOT!\obs-export\
echo   Lua path:     !LUA_PATH!
echo.
echo   This will:
echo     - Back up your current %%APPDATA%%\obs-studio\ state
echo     - Restore basic/, plugins/, plugin_config/, plugin_manager/
echo     - Restore global.ini, user.ini, safe_mode_module_blocklist.txt
echo     - Auto-install third-party plugin DLLs (program-plugins/)
echo     - Register game-tracker.lua in every imported scene collection
echo.
echo   IMPORTANT: Close OBS before continuing.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\obs-import.ps1" -RepoRoot "!REPO_ROOT!" -LuaPath "!LUA_PATH!"

echo.
echo ========================================
echo   To verify import worked, open OBS and look for:
echo     - Scene Collection menu: CLIPPREP_TEST
echo     - Profile menu: an entry starting "CLIPPREP Import OK"
echo   If both show up, the round-trip worked.
echo ========================================
echo.
pause
