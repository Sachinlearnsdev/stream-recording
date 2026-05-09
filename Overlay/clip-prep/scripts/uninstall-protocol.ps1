# Removes the `clip-prep://` URL protocol handler. Called by uninstall.bat.
# Always exits 0 — missing key is fine.

$root = 'HKCU:\Software\Classes\clip-prep'
if (Test-Path $root) {
  try {
    Remove-Item -Path $root -Recurse -Force
    Write-Output ('URL protocol removed: ' + $root)
  } catch {
    Write-Output ('FAILED to remove ' + $root + ': ' + $_.Exception.Message)
  }
} else {
  Write-Output '(no clip-prep:// URL protocol registered)'
}
exit 0
