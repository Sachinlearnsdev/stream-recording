# Moves files to the Windows Recycle Bin (NOT permanent delete).
# Called by the watcher's /delete-mix and /recycle-* endpoints.
#
# Args: -Files is a `|`-separated path list. We use `|` (not `;`) because
# Windows filename rules disallow `|` (one of the invalid characters
# <>:"/\|?*), so splitting can never ambiguously eat part of a real path.
# Semicolons CAN appear in NTFS paths (rare but legal) — they would silently
# split here into two non-existent paths and the actual file would never
# be recycled.

param([Parameter(Mandatory=$true)][string]$Files)

Add-Type -AssemblyName Microsoft.VisualBasic

$paths = $Files -split '\|' | Where-Object { $_ }
$results = @()
foreach ($p in $paths) {
  $path = $p.Trim()
  if (-not (Test-Path -LiteralPath $path)) {
    $results += "MISSING: $path"
    continue
  }
  try {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
      $path,
      [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
      [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
    $results += "RECYCLED: $path"
  } catch {
    $results += "FAILED ($($_.Exception.Message)): $path"
  }
}
$results | ForEach-Object { Write-Output $_ }
exit 0
