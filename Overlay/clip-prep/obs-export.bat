@echo off
setlocal EnableExtensions EnableDelayedExpansion
title clip-prep - export OBS config

set "SCRIPT_DIR=%~dp0"
rem Repo root is two levels up from clip-prep/
for %%I in ("!SCRIPT_DIR!..\..") do set "REPO_ROOT=%%~fI"

echo.
echo ========================================
echo   Export OBS scene collections + profiles
echo ========================================
echo   Repo root: !REPO_ROOT!
echo   This bundles your current OBS config into obs-export/ so
echo   bootstrap.bat on a new PC can restore the same setup.
echo.
echo   Make sure OBS is CLOSED before exporting.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!scripts\obs-export.ps1" -RepoRoot "!REPO_ROOT!"

echo.
pause
