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

$obsRoot = Join-Path $env:APPDATA 'obs-studio'
$scenesDir = Join-Path $obsRoot 'basic\scenes'

if (-not (Test-Path $scenesDir)) {
  # Fresh OBS install (or OBS never opened). Nothing to register yet — the
  # user will need to launch OBS once and re-run this. Not an error.
  Write-Output "No scene collections found at $scenesDir"
  Write-Output "  (Open OBS once to create the default scene collection, then re-run.)"
  exit 0
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

    # Drop ALL existing game-tracker.lua entries — even ones pointing to a
    # currently-existing path — so we end up with exactly one entry pointing
    # at the canonical install path. Otherwise re-running this with a new
    # install location accumulates duplicates from previous installs.
    $hadOurs = $false
    $collectedScripts = @($collectedScripts | Where-Object {
      if (-not ($_ -and $_.path)) { return $false }
      $entryPath = $_.path -replace '/', '\'
      if ($entryPath -notmatch 'game-tracker\.lua$') { return $true }  # keep unrelated scripts
      if (($_.path -replace '\\','/') -ieq $luaPathNorm) { $hadOurs = $true }
      return $false  # drop every game-tracker.lua entry; canonical one is added below
    })

    # Always add the canonical entry exactly once.
    $collectedScripts = @($collectedScripts + $scriptEntry)
    $alreadyHas = $hadOurs

    # Write back canonical shape.
    $cleanScriptsTool = [PSCustomObject]@{ scripts = $collectedScripts }
    if ($modules.PSObject.Properties.Name -contains 'scripts-tool') {
      $modules.PSObject.Properties.Remove('scripts-tool')
    }
    $modules | Add-Member -NotePropertyName 'scripts-tool' -NotePropertyValue $cleanScriptsTool

    $sc | ConvertTo-Json -Depth 32 | Set-Content $scFile.FullName -Encoding utf8
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
