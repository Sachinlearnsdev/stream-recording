# Generates a "sample-blue" theme by copying the active sasi-overlays/
# folder and recoloring the brand palette. Used by bootstrap.bat to give
# users at least one alternate theme to test the Themes accordion swap.
#
# Idempotent: skips if sasi-overlays-sample-blue/ already exists.
# Returns 0 on success / skip; non-zero only on hard failure.
#
# ASCII-only on purpose. Windows PowerShell 5.1 reads .ps1 files as
# Windows-1252 by default; UTF-8 em-dashes / arrows in this file confuse
# the parser and abort with "string is missing the terminator". Keep
# this script pure ASCII to stay portable across user encodings.

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)] [string]$InstallDir
)

$ErrorActionPreference = 'Continue'

# CMD-to-PowerShell quoting fix: install.bat calls this as
#   powershell -File ... -InstallDir "!SCRIPT_DIR!"
# !SCRIPT_DIR! ends with \, so the trailing \" gets parsed by PowerShell's
# argument splitter as an escaped quote. The arg arrives with a literal "
# at the end, which produces paths like C:\...\clip-prep"\sasi-overlays
# and Test-Path / Join-Path explode with "Illegal characters in path."
$InstallDir = $InstallDir.TrimEnd('"').TrimEnd('\','/')

$source = Join-Path $InstallDir 'sasi-overlays'
$dest   = Join-Path $InstallDir 'sasi-overlays-sample-blue'

if (-not (Test-Path -LiteralPath $source)) {
  Write-Output "  generate-sample-theme: skipped (source $source not found)"
  exit 0
}
if (Test-Path -LiteralPath $dest) {
  Write-Output "  generate-sample-theme: skipped (dest $dest already exists)"
  exit 0
}

try {
  Write-Output "  generate-sample-theme: creating $dest ..."
  # Recursive copy. Skip secrets.js (gitignored - has user keys, lives one level
  # up at install root after the v2 layout refactor; this stub-loader copy is fine to keep).
  Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force

  # Recolor: red -> blue, orange -> cyan, gold -> silver. Apply across all HTML/CSS/JS.
  $colorMap = @{
    '#FF2200' = '#0080FF'   # red -> bright blue
    '#FF7700' = '#00BFFF'   # orange -> cyan
    '#FFD700' = '#C0C0C0'   # gold -> silver
    'STARTING SOON' = 'SAMPLE THEME (BLUE)'  # visible swap-confirmation
  }

  $files = Get-ChildItem -LiteralPath $dest -Recurse -File -Include *.html, *.css, *.js -ErrorAction SilentlyContinue
  foreach ($f in $files) {
    try {
      $text = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction Stop
      $changed = $false
      foreach ($from in $colorMap.Keys) {
        if ($text.Contains($from)) {
          $text = $text.Replace($from, $colorMap[$from])
          $changed = $true
        }
      }
      if ($changed) {
        # Preserve UTF-8 without BOM (many of our files use it)
        [System.IO.File]::WriteAllText($f.FullName, $text, [System.Text.UTF8Encoding]::new($false))
      }
    } catch {
      Write-Output "    (skip $($f.Name): $($_.Exception.Message))"
    }
  }

  # Patch theme.json so the dashboard's Themes dropdown shows it with a distinct
  # name + preview colors. Falls through silently if theme.json is missing.
  $manifestPath = Join-Path $dest 'theme.json'
  if (Test-Path -LiteralPath $manifestPath) {
    try {
      $json = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
      $json.id = 'sasi-blue'
      $json.name = 'Sasi Blue (Sample)'
      $json.description = 'Generated sample theme - recolored copy of the default for testing the Themes swap flow.'
      if ($json.PSObject.Properties.Name -contains 'preview') {
        $json.preview.primary = '#0080FF'
        $json.preview.secondary = '#00BFFF'
        $json.preview.accent = '#C0C0C0'
      }
      ($json | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    } catch {
      Write-Output "    (theme.json patch skipped: $($_.Exception.Message))"
    }
  }

  Write-Output "  generate-sample-theme: done. Apply via dashboard Overlays tab -> 'Sasi Blue (Sample)' -> Make active."
  exit 0
} catch {
  Write-Output ("  generate-sample-theme: FAILED - " + $_.Exception.Message)
  exit 1
}
