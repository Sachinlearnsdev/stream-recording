# Restores OBS state from obs-export/ on a new PC. Backs up any existing
# OBS user dir state before overwriting (timestamped backup folder).
#
# Restores:
#   - basic/ tree (scenes, profiles, sasi-overlays, anything else)
#   - plugins/ (user-installed plugins)
#   - global.ini (which collection/profile is current, dock layout)
#   - Registers game-tracker.lua in every imported scene collection's
#     scripts list, so it auto-loads when OBS opens
#
# Does NOT restore system plugins (Program Files\obs-studio\obs-plugins\) -
# those need their original installers. system-plugins.txt lists what was
# installed on the source PC for manual reinstall reference.

param(
  [string]$RepoRoot = '',
  [string]$BundlePath = '',
  [Parameter(Mandatory=$true)][string]$LuaPath
)

$ErrorActionPreference = 'Stop'

# Resolve bundle dir. -BundlePath wins; -RepoRoot fallback for the legacy
# "obs-export sits next to the repo" layout.
$exportDir = if ($BundlePath) { $BundlePath } elseif ($RepoRoot) { Join-Path $RepoRoot 'obs-export' } else { '' }
if (-not $exportDir) {
  Write-Output "ERROR: pass -BundlePath <folder-with-manifest.json+basic/> or -RepoRoot <path>"
  exit 1
}
if (-not (Test-Path $exportDir)) {
  Write-Output "Bundle folder not found: $exportDir"
  Write-Output "  Skipping OBS import."
  exit 0
}

# Validate it actually IS a bundle (has manifest.json + basic/ at root)
$manifestPath = Join-Path $exportDir 'manifest.json'
$bundleBasic  = Join-Path $exportDir 'basic'
if (-not (Test-Path $manifestPath) -or -not (Test-Path $bundleBasic)) {
  Write-Output "ERROR: $exportDir doesn't look like an obs-export bundle."
  Write-Output "  Expected manifest.json + basic/ at the root."
  exit 1
}

# Version check: refuse bundles newer than what we know how to import.
$thisImporterVersion = 1
try {
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  $bundleVer = if ($manifest.manifest_version) { [int]$manifest.manifest_version } else { 1 }
  if ($bundleVer -gt $thisImporterVersion) {
    Write-Output "ERROR: Bundle was created by a newer export script (manifest_version=$bundleVer)."
    Write-Output "  This importer only understands version $thisImporterVersion."
    Write-Output "  Update clip-prep first."
    exit 1
  }
  Write-Output "Bundle: manifest_version=$bundleVer, exported_at=$($manifest.exported_at)"
} catch {
  Write-Output "WARNING: Could not parse manifest.json: $($_.Exception.Message)"
  Write-Output "  Continuing anyway (assuming manifest_version=1)."
}

$obsRoot  = Join-Path $env:APPDATA 'obs-studio'
$obsBasic = Join-Path $obsRoot 'basic'
$obsPlugs = Join-Path $obsRoot 'plugins'

if (-not (Test-Path $obsRoot)) {
  # Fresh OBS install - folder gets created on first launch normally,
  # but we need it now so we can drop config in place.
  Write-Output "OBS data dir not found - creating $obsRoot"
  New-Item -ItemType Directory -Path $obsRoot -Force | Out-Null
}

# Backup current OBS user dir before overwriting
$backupRoot = Join-Path $obsRoot ('_clip-prep-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupRoot | Out-Null
foreach ($leaf in @('basic', 'plugins', 'global.ini', 'user.ini', 'plugin_config', 'plugin_manager')) {
  $src = Join-Path $obsRoot $leaf
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $backupRoot $leaf) -Recurse -Force -ErrorAction SilentlyContinue
  }
}
Write-Output "Backup of current OBS user dir: $backupRoot"

# 1. basic/ tree
$srcBasic = Join-Path $exportDir 'basic'
if (Test-Path $srcBasic) {
  Write-Output ""
  Write-Output "Restoring basic/ ..."
  if (-not (Test-Path $obsBasic)) { New-Item -ItemType Directory -Path $obsBasic | Out-Null }
  $count = 0
  Get-ChildItem $srcBasic -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($srcBasic.Length).TrimStart('\','/')
    $tgt = [System.IO.Path]::Combine($obsBasic, $rel)
    $tgtDir = Split-Path $tgt -Parent
    if (-not (Test-Path $tgtDir)) { New-Item -ItemType Directory -Path $tgtDir -Force | Out-Null }
    Copy-Item $_.FullName $tgt -Force
    $count++
  }
  Write-Output "  $count file(s) restored"
}

# 2. plugins/
$srcPlugs = Join-Path $exportDir 'plugins'
if (Test-Path $srcPlugs) {
  Write-Output ""
  Write-Output "Restoring user plugins ..."
  if (-not (Test-Path $obsPlugs)) { New-Item -ItemType Directory -Path $obsPlugs | Out-Null }
  $count = 0
  Get-ChildItem $srcPlugs -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($srcPlugs.Length).TrimStart('\','/')
    $tgt = [System.IO.Path]::Combine($obsPlugs, $rel)
    $tgtDir = Split-Path $tgt -Parent
    if (-not (Test-Path $tgtDir)) { New-Item -ItemType Directory -Path $tgtDir -Force | Out-Null }
    Copy-Item $_.FullName $tgt -Force
    $count++
  }
  Write-Output "  $count file(s) restored"
}

# 3. global.ini
$srcGlobal = Join-Path $exportDir 'global.ini'
if (Test-Path $srcGlobal) {
  Write-Output ""
  Write-Output "Restoring global.ini ..."
  Copy-Item $srcGlobal (Join-Path $obsRoot 'global.ini') -Force
  Write-Output "  Done"
}

# 3b. user.ini
$srcUserIni = Join-Path $exportDir 'user.ini'
if (Test-Path $srcUserIni) {
  Copy-Item $srcUserIni (Join-Path $obsRoot 'user.ini') -Force
  Write-Output "  Restored user.ini"
}

# 3c. plugin_config/ - per-plugin settings (e.g. Advanced Scene Switcher
#     macros, browser-source localStorage). Backed up first, then merged on top.
$srcPluginCfg = Join-Path $exportDir 'plugin_config'
if (Test-Path $srcPluginCfg) {
  Write-Output ""
  Write-Output "Restoring plugin_config/ ..."
  $dstPluginCfg = Join-Path $obsRoot 'plugin_config'
  if (-not (Test-Path $dstPluginCfg)) { New-Item -ItemType Directory -Path $dstPluginCfg | Out-Null }
  $count = 0
  Get-ChildItem $srcPluginCfg -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($srcPluginCfg.Length).TrimStart('\','/')
    $tgt = [System.IO.Path]::Combine($dstPluginCfg, $rel)
    $tgtDir = Split-Path $tgt -Parent
    if (-not (Test-Path $tgtDir)) { New-Item -ItemType Directory -Path $tgtDir -Force | Out-Null }
    Copy-Item $_.FullName $tgt -Force
    $count++
  }
  Write-Output "  $count file(s) restored"
}

# 3d. plugin_manager/ - INTENTIONALLY NOT RESTORED.
# plugin_manager/modules.json tracks plugin enable/disable state with
# fields (id, version, display_name) that OBS populates AFTER it loads
# each plugin. Restoring stale data from the source PC makes Manage
# Plugins UI show our plugins as "missing" even though they loaded
# fine. Cleaner: let OBS rebuild plugin_manager from a current scan.
$dstPluginMgr = Join-Path $obsRoot 'plugin_manager'
if (Test-Path $dstPluginMgr) {
  Remove-Item $dstPluginMgr -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "  Skipped plugin_manager/ (OBS will rebuild it from a fresh plugin scan)"

# 3e. safe_mode_module_blocklist.txt
$srcBlocklist = Join-Path $exportDir 'safe_mode_module_blocklist.txt'
if (Test-Path $srcBlocklist) {
  Copy-Item $srcBlocklist (Join-Path $obsRoot 'safe_mode_module_blocklist.txt') -Force
  Write-Output "  Restored safe_mode_module_blocklist.txt"
}

# 4. Auto-install third-party plugins to OBS install dir. Modern OBS Studio
#    DOES NOT scan %APPDATA%\obs-studio\plugins\ - we need to drop DLLs into
#    the same Program Files location ASS's installer would have used. That
#    requires admin, so we batch all the copies into one elevated child
#    (single UAC prompt for the user).
$srcTpFiles = Join-Path $exportDir 'program-plugins'
if (Test-Path $srcTpFiles) {
  Write-Output ""
  Write-Output "Auto-installing third-party plugins to OBS install dir..."
  $obsInstall = "C:\Program Files\obs-studio"
  $obsBinDir  = Join-Path $obsInstall "obs-plugins\64bit"
  $obsDataDir = Join-Path $obsInstall "data\obs-plugins"

  if (-not (Test-Path $obsInstall)) {
    Write-Output "  WARNING: OBS install dir not found at $obsInstall - skipping plugin install"
  } else {
    # Build a deferred-execution script that does all copies at once.
    # Then run it elevated if we're not already admin (single UAC prompt).
    $copyOps = @()
    foreach ($pluginDir in (Get-ChildItem $srcTpFiles -Directory -ErrorAction SilentlyContinue)) {
      $name = $pluginDir.Name
      $binSrc = Join-Path $pluginDir.FullName "bin\64bit"
      $dataSrc = Join-Path $pluginDir.FullName "data"
      if (Test-Path $binSrc) {
        $copyOps += @{ Type = 'tree'; Src = $binSrc; Dst = $obsBinDir }
      }
      if (Test-Path $dataSrc) {
        $dataDst = Join-Path $obsDataDir $name
        $copyOps += @{ Type = 'replace'; Src = $dataSrc; Dst = $dataDst }
      }
      Write-Output "  Queued: $name (-> Program Files\obs-studio\)"
    }

    # Serialize ops to a temp script that runs elevated.
    $tempScript = "$env:TEMP\clip-prep-install-plugins-$([guid]::NewGuid()).ps1"
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("`$ErrorActionPreference = 'Continue'")
    [void]$sb.AppendLine("Write-Host '[clip-prep] elevated plugin install starting' -ForegroundColor Cyan")
    foreach ($op in $copyOps) {
      $src = $op.Src.Replace("'", "''")
      $dst = $op.Dst.Replace("'", "''")
      if ($op.Type -eq 'tree') {
        # Recursive merge-copy: walk source files and write each to dest, creating dirs as needed.
        [void]$sb.AppendLine(@"
Get-ChildItem -LiteralPath '$src' -Recurse -File | ForEach-Object {
  `$rel = `$_.FullName.Substring('$src'.Length).TrimStart('\','/')
  `$tgt = Join-Path '$dst' `$rel
  `$tgtDir = Split-Path `$tgt -Parent
  if (-not (Test-Path `$tgtDir)) { New-Item -ItemType Directory -Path `$tgtDir -Force | Out-Null }
  Copy-Item `$_.FullName `$tgt -Force
}
"@)
      } else {
        # Replace: remove existing, then full copy.
        [void]$sb.AppendLine("if (Test-Path '$dst') { Remove-Item '$dst' -Recurse -Force }")
        [void]$sb.AppendLine("Copy-Item -LiteralPath '$src' '$dst' -Recurse -Force")
      }
    }
    [void]$sb.AppendLine("Write-Host '[clip-prep] plugin install complete' -ForegroundColor Green")
    [void]$sb.AppendLine("Start-Sleep -Seconds 2")
    [System.IO.File]::WriteAllText($tempScript, $sb.ToString(), [System.Text.UTF8Encoding]::new($true))

    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
      & $tempScript
    } else {
      Write-Output "  Triggering UAC prompt - approve to install plugins to Program Files..."
      $proc = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tempScript
      )
      if ($proc.ExitCode -ne 0) {
        Write-Output "  Plugin install elevated process exited with code $($proc.ExitCode)"
      }
    }
    Remove-Item $tempScript -ErrorAction SilentlyContinue
    Write-Output "  Plugin install done. OBS will pick them up next launch."
  }
  Write-Output "  Plugin settings (Advanced Scene Switcher macros etc.) were restored"
  Write-Output "  above via plugin_config/ - they'll pick up where they left off."
} else {
  # Fallback: no bundled binaries - just point at the list
  $tpList = Join-Path $exportDir 'third-party-plugins.txt'
  $sysPlugList = Join-Path $exportDir 'system-plugins.txt'
  if (Test-Path $tpList) {
    $tpLines = Get-Content $tpList | Where-Object { $_ -match '^- ' }
    Write-Output ""
    Write-Output "No bundled plugin binaries found. See $tpList for $($tpLines.Count) plugin(s) to install manually."
  } elseif (Test-Path $sysPlugList) {
    $sysCount = (Get-Content $sysPlugList | Measure-Object -Line).Lines
    Write-Output ""
    Write-Output "System plugins on the source PC: $sysCount DLL(s) - see $sysPlugList"
  }
}

# 5. Register game-tracker.lua in every imported scene collection
$dstScenes = Join-Path $obsBasic 'scenes'
if (Test-Path $dstScenes) {
  Write-Output ""
  Write-Output "Registering game-tracker.lua in scene collections ..."
  $luaPathNorm = $LuaPath -replace '\\', '/'
  $scriptEntry = [PSCustomObject]@{ path = $luaPathNorm; settings = @{} }
  foreach ($scFile in (Get-ChildItem $dstScenes -Filter '*.json' -ErrorAction SilentlyContinue)) {
    try {
      $sc = Get-Content $scFile.FullName -Raw | ConvertFrom-Json

      # Build up the path .modules.'scripts-tool'.scripts using intermediate
      # variables, since chained `.X.Y.Z = value` assignment on PSCustomObject
      # in PS 5.1 is unreliable for nested levels with hyphenated keys.
      if (-not ($sc.PSObject.Properties.Name -contains 'modules')) {
        $sc | Add-Member -NotePropertyName modules -NotePropertyValue (New-Object PSObject)
      }
      $modules = $sc.modules

      # Read whatever scripts-tool currently is. Could be:
      #   (a) absent
      #   (b) an array of script entries (corrupted but seen in the wild)
      #   (c) an object with a `scripts` array (correct OBS format)
      #   (d) an object with inline `path`/`settings` (also corrupted)
      # We collect script entries from any of these shapes, then REPLACE the
      # whole property with a clean {scripts: [...]} object.
      $rawScriptsTool = if ($modules.PSObject.Properties.Name -contains 'scripts-tool') { $modules.'scripts-tool' } else { $null }

      $collectedScripts = @()
      if ($rawScriptsTool -is [System.Array] -or $rawScriptsTool -is [System.Collections.IList]) {
        # Shape (b): array IS the script list. Each element is an entry.
        $collectedScripts = @($rawScriptsTool)
      } elseif ($null -ne $rawScriptsTool) {
        $stProps = @($rawScriptsTool.PSObject.Properties.Name)
        if ($stProps -contains 'scripts' -and $rawScriptsTool.scripts) {
          # Shape (c): proper format
          $collectedScripts = @($rawScriptsTool.scripts)
        } elseif ($stProps -contains 'path' -and $rawScriptsTool.path) {
          # Shape (d): inline single-script entry
          $collectedScripts = @([PSCustomObject]@{ path = $rawScriptsTool.path; settings = $rawScriptsTool.settings })
        }
      }

      # Prune game-tracker.lua entries that no longer exist; keep all other
      # plugins' script entries unchanged.
      $collectedScripts = @($collectedScripts | Where-Object {
        if (-not ($_ -and $_.path)) { return $false }
        $entryPath = $_.path -replace '/', '\'
        if ($entryPath -notmatch 'game-tracker\.lua$') { return $true }
        return (Test-Path -LiteralPath $entryPath)
      })

      # Add the canonical install-dir lua entry if not already present.
      $alreadyHas = $false
      foreach ($entry in $collectedScripts) {
        if ($entry.path -and ($entry.path -replace '\\','/') -ieq $luaPathNorm) { $alreadyHas = $true; break }
      }
      if (-not $alreadyHas) {
        $collectedScripts = @($collectedScripts + $scriptEntry)
      }

      # Replace the scripts-tool property entirely with a fresh, properly-shaped
      # object. Direct assignment to a hyphenated NoteProperty works in PS 5.1
      # when the property exists; Add-Member is the fallback for the absent case.
      $cleanScriptsTool = [PSCustomObject]@{ scripts = $collectedScripts }
      if ($modules.PSObject.Properties.Name -contains 'scripts-tool') {
        $modules.PSObject.Properties.Remove('scripts-tool')
      }
      $modules | Add-Member -NotePropertyName 'scripts-tool' -NotePropertyValue $cleanScriptsTool

      $sc | ConvertTo-Json -Depth 32 | Set-Content $scFile.FullName -Encoding utf8
      if ($alreadyHas) {
        Write-Output "  Lua already registered in: $($scFile.BaseName) (cleaned scripts-tool shape)"
      } else {
        Write-Output "  Registered Lua in: $($scFile.BaseName)"
      }
    } catch {
      Write-Output "  WARNING: could not edit $($scFile.Name): $($_.Exception.Message)"
    }
  }
}

Write-Output ""
Write-Output "OBS import complete. Open OBS - your scenes, profile, plugins, and"
Write-Output "clip-prep Lua script should all be in place. Stream keys (service.json)"
Write-Output "are NOT restored - re-enter them in OBS Settings -> Stream."
exit 0
