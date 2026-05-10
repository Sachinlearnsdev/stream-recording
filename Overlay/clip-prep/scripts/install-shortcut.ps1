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

  # 2. Desktop shortcut: opens the dashboard in the default browser.
  # The watcher auto-starts at Windows login; if it's offline the dashboard's
  # hero card has a Start button.
  $dashboardPath = Join-Path $WorkingDir 'dashboard.html'
  if (Test-Path -LiteralPath $dashboardPath) {
    $desktopDir = [Environment]::GetFolderPath('Desktop')
    $desktopLnk = Join-Path $desktopDir 'Sasi Studio.lnk'
    $dlnk = $ws.CreateShortcut($desktopLnk)
    # Open via cmd /c start so default-browser association is honored.
    $dlnk.TargetPath       = "$env:windir\System32\cmd.exe"
    $dlnk.Arguments        = '/c start "" "' + $dashboardPath + '"'
    $dlnk.WorkingDirectory = $WorkingDir
    $dlnk.IconLocation     = 'shell32.dll,14'
    $dlnk.Description      = 'Open the Sasi Studio dashboard'
    $dlnk.WindowStyle      = 7  # minimized — the cmd window flashes briefly only
    $dlnk.Save()
    Write-Output ('Desktop shortcut: ' + $desktopLnk)
  } else {
    Write-Output ('Skipped Desktop shortcut: dashboard.html not found at ' + $dashboardPath)
  }

  exit 0
} catch {
  Write-Output ('FAILED: ' + $_.Exception.Message)
  exit 1
}
