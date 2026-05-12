# clip-prep one-liner installer
#
# Usage (paste into PowerShell):
#
#   irm https://raw.githubusercontent.com/<your-user>/<your-repo>/main/install.ps1 | iex
#
# What it does:
#   1. Installs git via winget if missing
#   2. Clones the repo to %LOCALAPPDATA%\clip-prep-src\ (or git-pulls if it
#      already exists, so re-running upgrades to latest)
#   3. Runs bootstrap.bat from inside the clone, which then:
#        - winget-installs Node, OBS, ffmpeg if missing
#        - copies clip-prep into %LOCALAPPDATA%\clip-prep\
#        - registers auto-start, Start Menu shortcut, clip-prep:// protocol
#        - opens the dashboard

param(
  [string]$RepoUrl = '',
  [string]$Branch  = 'main'
)

$ErrorActionPreference = 'Stop'

# Default repo to clone from. Override at invocation with -RepoUrl <url>
# (useful if you want to test a fork or a private mirror).
$DefaultRepoUrl = 'https://github.com/Sachinlearnsdev/stream-recording.git'

if (-not $RepoUrl) { $RepoUrl = $DefaultRepoUrl }

$cloneDir = Join-Path $env:LOCALAPPDATA 'clip-prep-src'

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   clip-prep one-liner installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Repo:     $RepoUrl"
Write-Host "   Branch:   $Branch"
Write-Host "   Clone to: $cloneDir"
Write-Host ""

# ---------- Ensure git is available ----------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "[1/3] git not found - installing via winget..." -ForegroundColor Yellow
  winget install --id Git.Git --silent --accept-source-agreements --accept-package-agreements
  # Refresh PATH for current session
  $env:PATH = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: git installed but not in PATH. Open a NEW PowerShell window and re-run." -ForegroundColor Red
    exit 1
  }
  Write-Host "       git installed."
} else {
  Write-Host "[1/3] git: $((git --version) 2>&1)"
}

# ---------- Clone or update ----------
# DO NOT redirect git's stderr (no 2>&1) - PS 5.1 wraps each stderr line in an
# ErrorRecord and combined with $ErrorActionPreference='Stop' that aborts the
# script on harmless "Cloning into..." progress messages. Let git print straight
# to the console; we check $LASTEXITCODE for real failure.
$isRealGitRepo = (Test-Path $cloneDir) -and (Test-Path (Join-Path $cloneDir '.git'))
if ((Test-Path $cloneDir) -and -not $isRealGitRepo) {
  Write-Host "[2/3] $cloneDir exists but isn't a git repo (previous run aborted?). Wiping..." -ForegroundColor Yellow
  Remove-Item $cloneDir -Recurse -Force
}
if ($isRealGitRepo) {
  Write-Host "[2/3] Existing clone found - updating..." -ForegroundColor Cyan
  Push-Location $cloneDir
  try {
    & git fetch origin $Branch
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: git fetch failed (rc=$LASTEXITCODE)" -ForegroundColor Red; exit 1 }
    & git reset --hard "origin/$Branch"
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: git reset failed (rc=$LASTEXITCODE)" -ForegroundColor Red; exit 1 }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "[2/3] Cloning..." -ForegroundColor Cyan
  & git clone --branch $Branch --depth 1 $RepoUrl $cloneDir
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git clone failed (rc=$LASTEXITCODE)." -ForegroundColor Red
    exit 1
  }
}

# ---------- Run bootstrap ----------
$bootstrap = Join-Path $cloneDir 'Overlay\clip-prep\bootstrap.bat'
if (-not (Test-Path $bootstrap)) {
  Write-Host "ERROR: bootstrap.bat not found at $bootstrap" -ForegroundColor Red
  Write-Host "  (Repo structure may be wrong - expected Overlay\clip-prep\bootstrap.bat)" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "[3/3] Running bootstrap.bat from clone..." -ForegroundColor Cyan
Write-Host ""
& cmd /c "`"$bootstrap`""
$bootRc = $LASTEXITCODE

Write-Host ""
if ($bootRc -eq 0) {
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "   ALL DONE" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "   clip-prep is installed at: $env:LOCALAPPDATA\clip-prep\"
  Write-Host "   The dashboard should be open in your browser."
  Write-Host "   To restore your OBS bundle: dashboard -> Import OBS Bundle."
} else {
  Write-Host "========================================" -ForegroundColor Yellow
  Write-Host "   Bootstrap exited with code $bootRc" -ForegroundColor Yellow
  Write-Host "========================================" -ForegroundColor Yellow
  Write-Host "   Check the output above. To re-run just bootstrap:"
  Write-Host "   & `"$bootstrap`""
}
