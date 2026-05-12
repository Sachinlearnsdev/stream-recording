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
  #
  # OneDrive: on accounts with OneDrive enabled, [Environment]::GetFolderPath
  # returns the redirected OneDrive\Desktop path. The .lnk sometimes never
  # shows up on the actual desktop because of OneDrive sync state. Create the
  # shortcut at BOTH the OS-canonical Desktop AND the raw %USERPROFILE%\Desktop
  # so at least one is visible regardless of OneDrive state.

  function Write-DesktopShortcut($targetDir) {
    if (-not $targetDir) { return $null }
    if (-not (Test-Path -LiteralPath $targetDir)) {
      try { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
      catch { Write-Output ('  (skip ' + $targetDir + ': cannot create — ' + $_.Exception.Message + ')'); return $null }
    }
    $lnkPath = Join-Path $targetDir 'Sasi Studio.lnk'
    try {
      $s = $ws.CreateShortcut($lnkPath)
      $s.TargetPath       = "$env:windir\System32\cmd.exe"
      $s.Arguments        = '/c start "" "http://127.0.0.1:6789/dashboard.html"'
      $s.WorkingDirectory = $WorkingDir
      $s.IconLocation     = 'shell32.dll,14'
      $s.Description      = 'Open the Sasi Studio dashboard'
      $s.WindowStyle      = 7  # minimized — the cmd window flashes briefly only
      $s.Save()
      return $lnkPath
    } catch {
      Write-Output ('  (skip ' + $lnkPath + ': ' + $_.Exception.Message + ')')
      return $null
    }
  }

  $candidates = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:USERPROFILE 'Desktop'),
    (Join-Path $env:USERPROFILE 'OneDrive\Desktop')
  ) | Where-Object { $_ } | Sort-Object -Unique

  $created = @()
  foreach ($d in $candidates) {
    $made = Write-DesktopShortcut $d
    if ($made) { $created += $made }
  }
  if ($created.Count -gt 0) {
    foreach ($p in $created) { Write-Output ('Desktop shortcut: ' + $p) }
  } else {
    Write-Output 'WARNING: No Desktop shortcut created. Paste this URL into your browser to open the dashboard:'
    Write-Output '  http://127.0.0.1:6789/dashboard.html'
  }

  exit 0
} catch {
  Write-Output ('FAILED: ' + $_.Exception.Message)
  exit 1
}
