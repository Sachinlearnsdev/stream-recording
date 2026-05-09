# Removes the Start Menu "clip-prep" shortcut if present.
# Called by uninstall.bat. Always returns 0 (missing shortcut is fine).

param([string]$Name = 'clip-prep')

$lnkDir = [Environment]::GetFolderPath('Programs')
$lnkPath = Join-Path $lnkDir ($Name + '.lnk')

if (Test-Path $lnkPath) {
  try {
    Remove-Item $lnkPath -Force
    Write-Output ('Shortcut removed: ' + $lnkPath)
  } catch {
    Write-Output ('FAILED to remove ' + $lnkPath + ': ' + $_.Exception.Message)
  }
} else {
  Write-Output '(no Start Menu shortcut to remove)'
}
exit 0
