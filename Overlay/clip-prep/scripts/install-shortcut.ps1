# Creates Start Menu + Desktop shortcuts for Sasi Studio.
# Called by install.bat. Returns 0 on success, non-zero on failure.
#
# Both user-facing shortcuts target clip-prep-dashboard.vbs (next to
# the launcher VBS in the install dir). That script ensures the watcher
# is running, then opens the dashboard URL in the default browser.
# Run-key auto-start keeps using clip-prep-launcher.vbs directly so
# logins don't open a browser tab.

param(
  [Parameter(Mandatory=$true)][string]$LauncherPath,
  [Parameter(Mandatory=$true)][string]$WorkingDir,
  [string]$Name = 'Sasi Studio'
)

$ws = New-Object -ComObject WScript.Shell

# Derive the dashboard-opener VBS path from the launcher path (same dir).
$installDir = Split-Path -Parent $LauncherPath
$dashboardVbs = Join-Path $installDir 'clip-prep-dashboard.vbs'

try {
  # Remove the legacy "clip-prep.lnk" Start Menu entry from older installs
  # so users don't see two shortcuts side-by-side after upgrade.
  $startMenuDir = [Environment]::GetFolderPath('Programs')
  $legacyLnk = Join-Path $startMenuDir 'clip-prep.lnk'
  if (Test-Path -LiteralPath $legacyLnk) {
    try { Remove-Item -LiteralPath $legacyLnk -Force; Write-Output ('Removed legacy: ' + $legacyLnk) } catch {}
  }

  # 1. Start Menu shortcut: opens the dashboard (and starts watcher if needed).
  $startMenuLnk = Join-Path $startMenuDir ($Name + '.lnk')
  $lnk = $ws.CreateShortcut($startMenuLnk)
  $lnk.TargetPath       = 'wscript.exe'
  $lnk.Arguments        = '"' + $dashboardVbs + '"'
  $lnk.WorkingDirectory = $WorkingDir
  $lnk.IconLocation     = 'shell32.dll,15'
  $lnk.Description      = 'Open Sasi Studio dashboard'
  $lnk.Save()
  Write-Output ('Start Menu shortcut: ' + $startMenuLnk)

  # 2. Desktop shortcut: same behavior (ensure watcher + open dashboard).
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
      $s.TargetPath       = 'wscript.exe'
      $s.Arguments        = '"' + $dashboardVbs + '"'
      $s.WorkingDirectory = $WorkingDir
      $s.IconLocation     = 'shell32.dll,14'
      $s.Description      = 'Open Sasi Studio dashboard'
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

  # 3. OBS Studio shortcut: winget --silent installs OBS to Program Files but
  # doesn't create Start Menu / Desktop shortcuts. Result: user can't find OBS
  # via Win+search and has nothing to click. Detect obs64.exe at the canonical
  # paths and create our own shortcut alongside the Sasi Studio one.
  $obsCandidates = @(
    'C:\Program Files\obs-studio\bin\64bit\obs64.exe',
    'C:\Program Files (x86)\obs-studio\bin\64bit\obs64.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\obs-studio\bin\64bit\obs64.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ }

  if ($obsCandidates.Count -gt 0) {
    $obsExe = $obsCandidates[0]
    $obsDir = Split-Path -Parent $obsExe
    function Write-ObsShortcut($targetDir) {
      if (-not $targetDir -or -not (Test-Path -LiteralPath $targetDir)) { return $null }
      $lnkPath = Join-Path $targetDir 'OBS Studio.lnk'
      try {
        $s = $ws.CreateShortcut($lnkPath)
        $s.TargetPath       = $obsExe
        $s.WorkingDirectory = $obsDir
        $s.IconLocation     = $obsExe + ',0'
        $s.Description      = 'OBS Studio'
        $s.Save()
        return $lnkPath
      } catch {
        Write-Output ('  (OBS shortcut skip ' + $lnkPath + ': ' + $_.Exception.Message + ')')
        return $null
      }
    }
    # Start Menu OBS shortcut
    $obsSm = Write-ObsShortcut $startMenuDir
    if ($obsSm) { Write-Output ('OBS Start Menu shortcut: ' + $obsSm) }
    # Desktop OBS shortcuts (every Desktop path, same coverage as Sasi Studio shortcut)
    foreach ($d in $candidates) {
      $obsDk = Write-ObsShortcut $d
      if ($obsDk) { Write-Output ('OBS Desktop shortcut: ' + $obsDk) }
    }
  } else {
    Write-Output 'OBS Studio not found at any known path - skipping OBS shortcut creation.'
  }

  exit 0
} catch {
  Write-Output ('FAILED: ' + $_.Exception.Message)
  exit 1
}
