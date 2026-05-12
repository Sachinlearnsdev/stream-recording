# register-lua.ps1
# Registers clip-prep's game-tracker.lua in every OBS scene collection so
# the user doesn't have to add it manually via Tools -> Scripts.
#
# Idempotent: re-running is a no-op when the script is already present.
# Safe to call from install.bat and from the dashboard's "Register Lua" button.
#
# Returns exit code 0 on success (including when there are no scene
# collections yet — fresh OBS install). Non-zero only on hard failures.

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)] [string]$LuaPath
)

$ErrorActionPreference = 'Continue'

if (-not (Test-Path -LiteralPath $LuaPath)) {
  Write-Output "ERROR: game-tracker.lua not found at $LuaPath"
  exit 1
}

# OBS-running check. If OBS is open, it holds scene-collection JSONs in memory
# and overwrites them on next save — meaning our writes here get silently
# clobbered as soon as the user clicks "Save" or switches collections. The
# user always has to close OBS before re-registering. Detect + abort early
# with a clear message instead of writing files that vanish.
$obsProcs = Get-Process -Name obs64,obs -ErrorAction SilentlyContinue
if ($obsProcs) {
  Write-Output "ERROR: OBS Studio is currently running."
  Write-Output "  Close OBS completely (taskbar -> right-click -> Quit), then re-run."
  Write-Output "  Reason: OBS keeps scene-collection JSONs in memory and overwrites"
  Write-Output "  them on save/switch, which would silently undo this script's edits."
  exit 2
}

$obsRoot = Join-Path $env:APPDATA 'obs-studio'
$scenesDir = Join-Path $obsRoot 'basic\scenes'

if (-not (Test-Path $scenesDir)) {
  # Fresh OBS install (or OBS never opened). Nothing to register yet — the
  # user will need to launch OBS once and re-run this. Not an error.
  Write-Output "No scene collections found at $scenesDir"
  Write-Output "  (Open OBS once to create the default scene collection, then re-run.)"
  exit 0
}

# Retry-with-backoff write helper. OBS sometimes briefly holds a write-lock
# right after creating a scene collection JSON (the file is on disk but the
# OBS process hasn't released its handle). Plain Set-Content fails with a
# sharing violation in that window — we catch + retry a few times.
function Write-SceneJsonWithRetry($path, $json, $attempts = 5) {
  for ($i = 1; $i -le $attempts; $i++) {
    try {
      $json | Set-Content -LiteralPath $path -Encoding utf8 -ErrorAction Stop
      return $true
    } catch [System.IO.IOException] {
      if ($i -eq $attempts) { throw }
      Start-Sleep -Milliseconds (150 * $i)  # 150ms, 300ms, 450ms, 600ms
    }
  }
  return $false
}

$luaPathNorm = $LuaPath -replace '\\', '/'
$scriptEntry = [PSCustomObject]@{ path = $luaPathNorm; settings = @{} }

$registered = 0
$alreadyOk = 0
$skipped = 0

foreach ($scFile in (Get-ChildItem $scenesDir -Filter '*.json' -ErrorAction SilentlyContinue)) {
  try {
    $sc = Get-Content $scFile.FullName -Raw | ConvertFrom-Json

    # Some scene-collection files may legitimately not have .modules; create it.
    if (-not ($sc.PSObject.Properties.Name -contains 'modules')) {
      $sc | Add-Member -NotePropertyName modules -NotePropertyValue (New-Object PSObject)
    }
    $modules = $sc.modules

    # The "scripts-tool" property has been observed in four shapes in the wild:
    #   (a) absent
    #   (b) array  (corrupted, but seen in some bundles)
    #   (c) object with .scripts array (correct OBS format)
    #   (d) object with inline path/settings (corrupted)
    # Collect script entries from any shape, then write back the canonical
    # {scripts: [...]} object.
    $rawScriptsTool = if ($modules.PSObject.Properties.Name -contains 'scripts-tool') { $modules.'scripts-tool' } else { $null }

    $collectedScripts = @()
    if ($rawScriptsTool -is [System.Array] -or $rawScriptsTool -is [System.Collections.IList]) {
      $collectedScripts = @($rawScriptsTool)
    } elseif ($null -ne $rawScriptsTool) {
      $stProps = @($rawScriptsTool.PSObject.Properties.Name)
      if ($stProps -contains 'scripts' -and $rawScriptsTool.scripts) {
        $collectedScripts = @($rawScriptsTool.scripts)
      } elseif ($stProps -contains 'path' -and $rawScriptsTool.path) {
        $collectedScripts = @([PSCustomObject]@{ path = $rawScriptsTool.path; settings = $rawScriptsTool.settings })
      }
    }

    # Detect whether the canonical entry already exists BEFORE filtering.
    # (Earlier version assigned $hadOurs inside the Where-Object scriptblock,
    # which created a local in that scope — outer $hadOurs stayed unset and
    # $alreadyHas was always false. Cosmetic bug; the file write still
    # happened. Doing the check up front avoids the scope trap entirely.)
    $alreadyHas = [bool]@($collectedScripts | Where-Object {
      $_ -and $_.path -and (($_.path -replace '\\','/') -ieq $luaPathNorm)
    }).Count

    # Drop ALL existing game-tracker.lua entries (any path) so we end up
    # with exactly one canonical entry. Avoids accumulating duplicates from
    # previous installs at different paths.
    $collectedScripts = @($collectedScripts | Where-Object {
      if (-not ($_ -and $_.path)) { return $false }
      ($_.path -replace '/','\') -notmatch 'game-tracker\.lua$'
    })

    # Always add the canonical entry exactly once.
    $collectedScripts = @($collectedScripts + $scriptEntry)

    # Write back canonical shape.
    $cleanScriptsTool = [PSCustomObject]@{ scripts = $collectedScripts }
    if ($modules.PSObject.Properties.Name -contains 'scripts-tool') {
      $modules.PSObject.Properties.Remove('scripts-tool')
    }
    $modules | Add-Member -NotePropertyName 'scripts-tool' -NotePropertyValue $cleanScriptsTool

    $jsonOut = $sc | ConvertTo-Json -Depth 32
    Write-SceneJsonWithRetry -path $scFile.FullName -json $jsonOut | Out-Null
    if ($alreadyHas) {
      Write-Output "  Already registered in: $($scFile.BaseName)"
      $alreadyOk++
    } else {
      Write-Output "  Registered in: $($scFile.BaseName)"
      $registered++
    }
  } catch {
    Write-Output "  WARNING: could not edit $($scFile.Name): $($_.Exception.Message)"
    $skipped++
  }
}

Write-Output ""
Write-Output "Done. Registered in $registered new collection(s); $alreadyOk already had it; $skipped skipped."
if ($registered -gt 0) {
  Write-Output "Restart OBS for the changes to take effect."
}
exit 0
