# Registers a `clip-prep://` URL protocol handler so the browser-based
# setup page can launch the watcher with one click. Called by install.bat.
#
# When the user clicks `<a href="clip-prep://start">` in setup.html, Windows
# prompts "Open clip-prep?" and (on confirm) runs:
#   wscript.exe "<launcher path>" "clip-prep://start"
# The launcher VBS ignores the extra argument; it just spawns start.bat.

param(
  [Parameter(Mandatory=$true)][string]$LauncherPath
)

try {
  $root = 'HKCU:\Software\Classes\clip-prep'
  if (-not (Test-Path $root)) { New-Item -Path $root -Force | Out-Null }
  Set-ItemProperty -Path $root -Name '(default)'    -Value 'URL:clip-prep launcher'
  Set-ItemProperty -Path $root -Name 'URL Protocol' -Value ''

  $cmdKey = "$root\shell\open\command"
  if (-not (Test-Path $cmdKey)) { New-Item -Path $cmdKey -Force | Out-Null }
  $cmdLine = '"wscript.exe" "' + $LauncherPath + '" "%1"'
  Set-ItemProperty -Path $cmdKey -Name '(default)' -Value $cmdLine

  Write-Output ('URL protocol registered: clip-prep:// -> ' + $cmdLine)
  exit 0
} catch {
  Write-Output ('FAILED to register URL protocol: ' + $_.Exception.Message)
  exit 1
}
