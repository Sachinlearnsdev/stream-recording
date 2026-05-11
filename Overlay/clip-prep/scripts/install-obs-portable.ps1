# Fallback OBS Studio installer used by bootstrap.bat when winget can't
# install (commonly because another Chromium/CEF process - Brave, Chrome,
# Edge, Electron apps - has CEF DLLs locked, which OBS's NSIS installer
# refuses to work around).
#
# Downloads the official OBS portable .zip from GitHub releases and extracts
# it into C:\Program Files\obs-studio\ - the same path bootstrap's
# "OBS already installed" check looks at. No installer dialog, no NSIS
# "files in use" check, no file locks to fight.
#
# Returns 0 on success, non-zero on hard failure.
#
# ASCII-only. See generate-sample-theme.ps1 for the encoding rationale.

[CmdletBinding()]
param(
  [string]$Version = '32.1.2',
  [string]$InstallRoot = 'C:\Program Files\obs-studio'
)

$ErrorActionPreference = 'Stop'

$obs64 = Join-Path $InstallRoot 'bin\64bit\obs64.exe'
if (Test-Path -LiteralPath $obs64) {
  Write-Output "  install-obs-portable: OBS already at $obs64 - skipping."
  exit 0
}

$url = "https://github.com/obsproject/obs-studio/releases/download/$Version/OBS-Studio-$Version-Windows-x64.zip"
$zip = Join-Path $env:TEMP "obs-portable-$Version.zip"

Write-Output "  install-obs-portable: downloading $url ..."
try {
  # Use Invoke-WebRequest with explicit TLS 1.2 (some PS 5.1 setups still default to TLS 1.0)
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
} catch {
  Write-Output ("  install-obs-portable: download FAILED - " + $_.Exception.Message)
  exit 1
}

$sizeMb = [Math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Output "  install-obs-portable: downloaded $sizeMb MB. Extracting..."

try {
  if (-not (Test-Path -LiteralPath $InstallRoot)) {
    New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
  }
  # -Force overwrites existing files (idempotent on re-run)
  Expand-Archive -Path $zip -DestinationPath $InstallRoot -Force
} catch {
  Write-Output ("  install-obs-portable: extract FAILED - " + $_.Exception.Message)
  Write-Output "  (If the error mentions 'Access denied', re-run bootstrap in an elevated PowerShell.)"
  exit 1
}

Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $obs64) {
  Write-Output "  install-obs-portable: done. OBS at $obs64"
  exit 0
} else {
  Write-Output "  install-obs-portable: extract succeeded but obs64.exe not at expected path. Check $InstallRoot."
  exit 1
}
