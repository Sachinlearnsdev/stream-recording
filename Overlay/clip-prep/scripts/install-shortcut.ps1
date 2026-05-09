# Creates a Start Menu shortcut named "clip-prep" that runs the launcher VBS.
# Called by install.bat. Returns 0 on success, non-zero on failure.

param(
  [Parameter(Mandatory=$true)][string]$LauncherPath,
  [Parameter(Mandatory=$true)][string]$WorkingDir,
  [string]$Name = 'clip-prep'
)

try {
  $ws = New-Object -ComObject WScript.Shell
  $lnkDir = [Environment]::GetFolderPath('Programs')
  $lnkPath = Join-Path $lnkDir ($Name + '.lnk')

  $lnk = $ws.CreateShortcut($lnkPath)
  $lnk.TargetPath       = 'wscript.exe'
  $lnk.Arguments        = '"' + $LauncherPath + '"'
  $lnk.WorkingDirectory = $WorkingDir
  $lnk.IconLocation     = 'shell32.dll,15'
  $lnk.Description      = 'Start the clip-prep watcher'
  $lnk.Save()

  Write-Output ('Shortcut created at: ' + $lnkPath)
  exit 0
} catch {
  Write-Output ('FAILED: ' + $_.Exception.Message)
  exit 1
}
