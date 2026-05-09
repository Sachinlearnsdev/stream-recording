# Moves files to the Windows Recycle Bin (NOT permanent delete).
# Called by the watcher's /delete-mix endpoint.
# Args: paths to delete, one per line via -Files (semicolon-separated string).

param([Parameter(Mandatory=$true)][string]$Files)

Add-Type -AssemblyName Microsoft.VisualBasic

$paths = $Files -split ';' | Where-Object { $_ }
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
