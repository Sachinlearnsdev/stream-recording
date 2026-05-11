# Creates Start Menu + Desktop shortcuts for Sasi Studio.
# Called by install.bat. Returns 0 on success, non-zero on failure.

param(
  [Parameter(Mandatory=$true)][string]$LauncherPath,
  [Parameter(Mandatory=$true)][string]$WorkingDir,
  [string]$Name = 'clip-prep'
)

$ws = New-Object -ComObject WScript.Shell

try {
  # 1. Start Menu shortcut: launches the watcher service via launcher VBS.
  $startMenuDir = [Environment]::GetFolderPath('Programs')
  $startMenuLnk = Join-Path $startMenuDir ($Name + '.lnk')
  $lnk = $ws.CreateShortcut($startMenuLnk)
  $lnk.TargetPath       = 'wscript.exe'
  $lnk.Arguments        = '"' + $LauncherPath + '"'
  $lnk.WorkingDirectory = $WorkingDir
  $lnk.IconLocation     = 'shell32.dll,15'
  $lnk.Description      = 'Start the clip-prep watcher'
  $lnk.Save()
  Write-Output ('Start Menu shortcut: ' + $startMenuLnk)

  # 2. Desktop shortcut: opens the dashboard URL in the default browser.
  # We point at http://127.0.0.1:6789/dashboard.html (served by the watcher's
  # express.static middleware) instead of the file:// path. Reason: file://
  # iframes are cross-origin in Chromium and that breaks canvas access for
  # HTML stinger auto-record + several other live-edit features.
  # The watcher auto-starts at Windows login; if it's offline the URL just
  # fails to load and the user can hit the Start Menu shortcut to launch it.
  $desktopDir = [Environment]::GetFolderPath('Desktop')
  $desktopLnk = Join-Path $desktopDir 'Sasi Studio.lnk'
  $dlnk = $ws.CreateShortcut($desktopLnk)
  $dlnk.TargetPath       = "$env:windir\System32\cmd.exe"
  $dlnk.Arguments        = '/c start "" "http://127.0.0.1:6789/dashboard.html"'
  $dlnk.WorkingDirectory = $WorkingDir
  $dlnk.IconLocation     = 'shell32.dll,14'
  $dlnk.Description      = 'Open the Sasi Studio dashboard'
  $dlnk.WindowStyle      = 7  # minimized — the cmd window flashes briefly only
  $dlnk.Save()
  Write-Output ('Desktop shortcut: ' + $desktopLnk)

  exit 0
} catch {
  Write-Output ('FAILED: ' + $_.Exception.Message)
  exit 1
}
