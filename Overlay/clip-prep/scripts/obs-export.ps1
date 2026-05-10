# Bundles the user's full OBS user-data into obs-export/ so a new PC can
# restore everything via bootstrap.bat. Bundles:
#   - %APPDATA%\obs-studio\basic\         (scenes, profiles, anything else
#                                           the user keeps in basic/, e.g.
#                                           sasi-overlays/) MINUS .bak files
#                                           and service.json (stream keys)
#   - %APPDATA%\obs-studio\plugins\       (per-user plugin DLLs)
#   - %APPDATA%\obs-studio\global.ini     (which collection/profile is
#                                           current, dock layout, theme)
#   - system-plugins.txt                  (list of DLLs in Program Files\
#                                           obs-studio\obs-plugins\ - these
#                                           need to be reinstalled manually
#                                           with their original installers)
#   - manifest.json                       (timestamp + what was bundled)

param(
  [string]$RepoRoot = '',
  [string]$OutputDir = ''
)
if (-not $RepoRoot -and -not $OutputDir) {
  Write-Output "ERROR: pass -RepoRoot <path> (writes to <path>\obs-export\) or -OutputDir <path>"
  exit 1
}

$ErrorActionPreference = 'Stop'

# Refuse to run while OBS is open - it locks browser-source state
# (Cookies, IndexedDB) and we'd ship an incomplete bundle. Check for
# both obs64.exe (main process) and obs-browser-page.exe (chromium
# helpers, which can linger 5-10s after the main process exits).
$obsProcs = Get-Process -Name 'obs64', 'obs-browser-page' -ErrorAction SilentlyContinue
if ($obsProcs) {
  Write-Output "ERROR: OBS is still running:"
  $obsProcs | ForEach-Object { Write-Output "  - $($_.ProcessName) (PID $($_.Id))" }
  Write-Output ""
  Write-Output "Close OBS fully and wait ~10s for browser helpers to exit, then re-run."
  exit 1
}

$obsRoot   = Join-Path $env:APPDATA 'obs-studio'
$obsBasic  = Join-Path $obsRoot 'basic'
$obsPlugs  = Join-Path $obsRoot 'plugins'
$obsGlobal = Join-Path $obsRoot 'global.ini'

if (-not (Test-Path $obsBasic)) {
  Write-Output "OBS basic/ not found at $obsBasic"
  Write-Output "  Open OBS once to initialise its config, then re-run."
  exit 1
}

$exportDir = if ($OutputDir) { $OutputDir } else { Join-Path $RepoRoot 'obs-export' }
if (Test-Path $exportDir) {
  # Clear children rather than removing the dir itself - lets us re-run
  # even if a File Explorer window or shell has cwd inside obs-export.
  Get-ChildItem $exportDir -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
} else {
  New-Item -ItemType Directory -Path $exportDir | Out-Null
}

$skipPatterns = @('*.bak', 'service.json')

function Test-ShouldSkip([System.IO.FileInfo]$file) {
  foreach ($p in $skipPatterns) { if ($file.Name -like $p) { return $true } }
  return $false
}

function Test-IsReparsePoint($item) {
  return ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq [IO.FileAttributes]::ReparsePoint
}

function Copy-TreeFiltered([string]$src, [string]$dst) {
  if (-not (Test-Path $src)) { return @{ files = 0; bytes = 0; skipped = @() } }
  New-Item -ItemType Directory -Path $dst -Force | Out-Null
  $stats = @{ files = 0; bytes = 0; skipped = @() }
  # -Recurse follows directory junctions/symlinks by default. We don't want
  # the export to silently vacuum up files from outside the OBS config tree
  # (some plugin installers create junctions inside plugins/), so filter
  # reparse points here and one level up via -Attributes.
  Get-ChildItem $src -Recurse -File -Attributes !ReparsePoint -ErrorAction SilentlyContinue | ForEach-Object {
    if (Test-IsReparsePoint $_) { return }
    if (Test-ShouldSkip $_) {
      $stats.skipped += $_.FullName.Substring($src.Length).TrimStart('\','/')
      return
    }
    $rel = $_.FullName.Substring($src.Length).TrimStart('\','/')
    $tgt = [System.IO.Path]::Combine($dst, $rel)
    $tgtDir = Split-Path $tgt -Parent
    if (-not (Test-Path $tgtDir)) { New-Item -ItemType Directory -Path $tgtDir -Force | Out-Null }
    Copy-Item $_.FullName $tgt -Force
    $stats.files++
    $stats.bytes += $_.Length
  }
  return $stats
}

# 1. basic/ tree (full, filtered)
Write-Output "Bundling basic/ ..."
$basicStats = Copy-TreeFiltered $obsBasic (Join-Path $exportDir 'basic')
Write-Output ("  $($basicStats.files) files, $([math]::Round($basicStats.bytes / 1MB, 1)) MB")

# 1b. Inject canary scene collection + profile so the new PC has visible
#     proof the import worked. Both names show up in OBS's Scene Collection
#     and Profile menus - if you see them, the bundle round-tripped cleanly.
$exportStamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
$canarySceneName = "CLIPPREP IMPORT OK - bundle $exportStamp"
$canaryGuid = [guid]::NewGuid().ToString()

$canaryScene = [PSCustomObject]@{
  name                  = 'CLIPPREP_TEST'
  current_scene         = $canarySceneName
  current_program_scene = $canarySceneName
  scene_order           = @(@{ name = $canarySceneName })
  sources               = @(
    [PSCustomObject]@{
      name          = $canarySceneName
      uuid          = $canaryGuid
      id            = 'scene'
      versioned_id  = 'scene'
      settings      = @{ id_counter = 0; custom_size = $false; items = @() }
      mixers        = 0
      sync          = 0
      flags         = 0
      volume        = 1.0
      balance       = 0.5
      enabled       = $true
      muted         = $false
      private_settings = @{}
      hotkeys       = @{}
    }
  )
  transitions       = @()
  groups            = @()
  quick_transitions = @()
  preview_locked    = $false
  scaling_enabled   = $false
  scaling_level     = 0
  scaling_off_x     = 0.0
  scaling_off_y     = 0.0
  modules           = @{}
  resolution        = @{ x = 1920; y = 1080 }
  version           = 2
}
$canarySceneJson = $canaryScene | ConvertTo-Json -Depth 32
$scenesDir = Join-Path $exportDir 'basic\scenes'
if (-not (Test-Path $scenesDir)) { New-Item -ItemType Directory -Path $scenesDir -Force | Out-Null }
# Real OBS scene JSONs are written without BOM - match that.
[System.IO.File]::WriteAllText(
  (Join-Path $scenesDir 'CLIPPREP_TEST.json'),
  $canarySceneJson,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "  Canary scene collection: CLIPPREP_TEST (scene name: $canarySceneName)"

$canaryProfileDir = Join-Path $exportDir 'basic\profiles\CLIPPREP_TEST_PROFILE'
New-Item -ItemType Directory -Path $canaryProfileDir -Force | Out-Null
@(
  '[General]'
  "Name=CLIPPREP Import OK - $exportStamp"
  ''
  '[Output]'
  'Mode=Simple'
  ''
) | Set-Content (Join-Path $canaryProfileDir 'basic.ini') -Encoding utf8
Write-Output "  Canary profile: CLIPPREP_TEST_PROFILE"
if ($basicStats.skipped.Count -gt 0) {
  Write-Output ("  Skipped " + $basicStats.skipped.Count + " file(s) matching $($skipPatterns -join ', '): ")
  $basicStats.skipped | Select-Object -First 8 | ForEach-Object { Write-Output "    - $_" }
  if ($basicStats.skipped.Count -gt 8) { Write-Output "    ... ($($basicStats.skipped.Count - 8) more)" }
}

# 2. plugins/ (user-installed, no filter - these are DLLs)
Write-Output ""
Write-Output "Bundling plugins/ ..."
if (Test-Path $obsPlugs) {
  $pluginStats = Copy-TreeFiltered $obsPlugs (Join-Path $exportDir 'plugins')
  Write-Output ("  $($pluginStats.files) files, $([math]::Round($pluginStats.bytes / 1MB, 1)) MB")
} else {
  Write-Output "  (no per-user plugins folder)"
}

# 3. global.ini (which collection/profile is current, panel layout)
Write-Output ""
Write-Output "Bundling global.ini ..."
if (Test-Path $obsGlobal) {
  Copy-Item $obsGlobal (Join-Path $exportDir 'global.ini') -Force
  Write-Output "  Copied"
} else {
  Write-Output "  (no global.ini found)"
}

# 3b. user.ini (user-level OBS settings)
$obsUserIni = Join-Path $obsRoot 'user.ini'
if (Test-Path $obsUserIni) {
  Copy-Item $obsUserIni (Join-Path $exportDir 'user.ini') -Force
  Write-Output "  Copied user.ini"
}

# 3c. plugin_config/ - per-plugin data dirs. Many plugins (incl. Advanced
#     Scene Switcher) store extra settings here in addition to whatever
#     they put in the scene collection JSON. obs-browser/ inside is browser-
#     source cache (cookies/localStorage); we keep small files but skip the
#     big Cache/ subdir to avoid bundling hundreds of MB.
Write-Output ""
Write-Output "Bundling plugin_config/ ..."
$pluginCfgSrc = Join-Path $obsRoot 'plugin_config'
if (Test-Path $pluginCfgSrc) {
  $pluginCfgDst = Join-Path $exportDir 'plugin_config'
  $cfgFiles = 0; $cfgBytes = 0; $cfgSkipped = 0; $cfgLocked = 0
  Get-ChildItem $pluginCfgSrc -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($pluginCfgSrc.Length).TrimStart('\','/')
    # Skip obs-browser cache subdirs (huge, regenerable)
    if ($rel -match '^obs-browser[\\/]Cache[\\/]' -or
        $rel -match '^obs-browser[\\/]Code Cache[\\/]' -or
        $rel -match '^obs-browser[\\/]GPUCache[\\/]') {
      $cfgSkipped++
      return
    }
    # Skip very large files in obs-browser (likely caches we missed above)
    if ($rel -match '^obs-browser[\\/]' -and $_.Length -gt 5MB) {
      $cfgSkipped++
      return
    }
    $tgt = [System.IO.Path]::Combine($pluginCfgDst, $rel)
    $tgtDir = Split-Path $tgt -Parent
    if (-not (Test-Path $tgtDir)) { New-Item -ItemType Directory -Path $tgtDir -Force | Out-Null }
    try {
      Copy-Item $_.FullName $tgt -Force -ErrorAction Stop
      $cfgFiles++
      $cfgBytes += $_.Length
    } catch {
      # Common cause: obs-browser still has Cookies / Network state locked
      # because the chromium child process from a browser source persists
      # briefly after OBS closes. Safe to skip - they regenerate on next run.
      $cfgLocked++
    }
  }
  $msg = "  $cfgFiles file(s), $([math]::Round($cfgBytes/1KB,0)) KB (skipped $cfgSkipped cache file(s)"
  if ($cfgLocked -gt 0) { $msg += ", $cfgLocked locked file(s)" }
  $msg += ")"
  Write-Output $msg
}

# 3d. plugin_manager/ - which plugins enabled/disabled
$pluginMgrSrc = Join-Path $obsRoot 'plugin_manager'
if (Test-Path $pluginMgrSrc) {
  $pluginMgrDst = Join-Path $exportDir 'plugin_manager'
  Copy-Item $pluginMgrSrc $pluginMgrDst -Recurse -Force
  Write-Output "  Copied plugin_manager/"
}

# 4. System plugins inventory (Program Files)
Write-Output ""
Write-Output "Inventorying system plugins ..."
$sysPlugInventory = @()
foreach ($candidate in @(
    'C:\Program Files\obs-studio\obs-plugins\64bit',
    'C:\Program Files\obs-studio\obs-plugins\32bit'
)) {
  if (Test-Path $candidate) {
    Get-ChildItem $candidate -Filter '*.dll' -ErrorAction SilentlyContinue | ForEach-Object {
      $info = $_.VersionInfo
      $sysPlugInventory += [PSCustomObject]@{
        Name           = $_.Name
        Path           = $_.FullName
        FileVersion    = $info.FileVersion
        ProductVersion = $info.ProductVersion
        ProductName    = $info.ProductName
        Description    = $info.FileDescription
      }
    }
  }
}
$sysPlugInventory | Sort-Object Name | ForEach-Object {
  $line = "$($_.Name)`t$($_.FileVersion)`t$($_.Description)"
  $line
} | Set-Content (Join-Path $exportDir 'system-plugins.txt') -Encoding utf8
Write-Output "  $($sysPlugInventory.Count) DLL(s) listed in system-plugins.txt"

# 4b. Third-party plugin shortlist - filter out stock OBS DLLs so the user
#     gets a clean "things to reinstall" list. Stock list is conservative;
#     anything we can't classify falls into the third-party bucket.
$stockObsDlls = @(
  # Functional plugins shipped with OBS Studio installer
  'aja.dll', 'aja-output-ui.dll',
  'coreaudio-encoder.dll',
  'decklink.dll', 'decklink-captions.dll', 'decklink-output-ui.dll',
  'enc-amf.dll',
  'frontend-tools.dll', 'image-source.dll',
  'nv-filters.dll',
  'obs-browser.dll', 'obs-ffmpeg.dll', 'obs-filters.dll', 'obs-libfdk.dll',
  'obs-nvenc.dll',
  'obs-outputs.dll', 'obs-qsv11.dll', 'obs-text.dll', 'obs-transitions.dll',
  'obs-vst.dll', 'obs-webrtc.dll', 'obs-websocket.dll', 'obs-x264.dll',
  'rtmp-services.dll', 'text-freetype2.dll',
  'vlc-video.dll', 'win-capture.dll', 'win-dshow.dll', 'win-mf.dll',
  'win-wasapi.dll',
  # Chromium / CEF support DLLs shipped with obs-browser
  'chrome_elf.dll', 'libcef.dll', 'libegl.dll', 'libglesv2.dll'
)
$thirdParty = $sysPlugInventory | Where-Object {
  $stockObsDlls -notcontains $_.Name.ToLower()
} | Sort-Object Name

# third-party-plugins.txt is generated after bundling so it can reflect
# the real plugin/sidecar classification.
$tpPath = Join-Path $exportDir 'third-party-plugins.txt'

# 4c. Bundle the actual plugin binaries + data dirs so the new PC can
#     drop them into %APPDATA%\obs-studio\plugins\ and have OBS auto-load
#     them on next launch. No installer needed - these are the same DLLs
#     the source PC is running right now. Skips 32-bit (modern OBS is
#     64-bit only). Sidecar DLLs (e.g. advanced-scene-switcher-lib.dll)
#     and subfolders (e.g. advanced-scene-switcher-plugins/) get bundled
#     inside the main plugin's folder, not as separate plugins.
Write-Output ""
Write-Output "Bundling third-party plugin binaries ..."
$tpFilesDir = Join-Path $exportDir 'program-plugins'
$pluginsRoot = 'C:\Program Files\obs-studio\obs-plugins\64bit'

# Sort by basename length so shorter names process first - this way
# "advanced-scene-switcher" gets registered as a plugin before
# "advanced-scene-switcher-lib" is encountered, and the latter is recognised
# as a sidecar.
$tpAt64 = $thirdParty | Where-Object { $_.Path -match '\\64bit\\' } |
  Sort-Object { $_.Name.Length }

$bundled = @{}
$tpBundled = 0
$sidecarCount = 0

foreach ($p in $tpAt64) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($p.Name)

  # Is this DLL a sidecar of an already-bundled plugin?
  $sidecarOf = $null
  foreach ($b in $bundled.Keys) {
    if ($base.StartsWith("$b-")) { $sidecarOf = $b; break }
  }

  if ($sidecarOf) {
    $sidecarBin = Join-Path (Join-Path $tpFilesDir $sidecarOf) 'bin\64bit'
    Copy-Item $p.Path (Join-Path $sidecarBin $p.Name) -Force
    Write-Output "  Sidecar: $($p.Name) -> $sidecarOf"
    $bundled[$sidecarOf].Sidecars += $p.Name
    $sidecarCount++
    continue
  }

  # New top-level plugin. Bundle DLL + matching subfolders + data dir.
  $bundleDir = Join-Path $tpFilesDir $base
  $binDir = Join-Path $bundleDir 'bin\64bit'
  $dataDir = Join-Path $bundleDir 'data'
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
  Copy-Item $p.Path (Join-Path $binDir $p.Name) -Force
  $bundled[$base] = [PSCustomObject]@{
    Name = $p.Name
    Version = $p.FileVersion
    Description = $p.Description
    ProductName = $p.ProductName
    Sidecars = @()
    SubfolderDlls = 0
    HasData = $false
  }

  # Subfolders matching <base>-* (e.g. advanced-scene-switcher-plugins/).
  # Skip *.pdb (debug symbols, not needed at runtime).
  $subfolderCount = 0
  Get-ChildItem $pluginsRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name.StartsWith("$base-") } | ForEach-Object {
      $subSrc = $_.FullName
      $subDst = Join-Path $binDir $_.Name
      Get-ChildItem $subSrc -Recurse -File | Where-Object { $_.Extension -ne '.pdb' } | ForEach-Object {
        $rel = $_.FullName.Substring($subSrc.Length).TrimStart('\','/')
        $tgt = [System.IO.Path]::Combine($subDst, $rel)
        $tgtDir = Split-Path $tgt -Parent
        if (-not (Test-Path $tgtDir)) { New-Item -ItemType Directory -Path $tgtDir -Force | Out-Null }
        Copy-Item $_.FullName $tgt -Force
        $subfolderCount++
      }
    }
  $bundled[$base].SubfolderDlls = $subfolderCount

  # Matching data dir
  $dataSrc = "C:\Program Files\obs-studio\data\obs-plugins\$base"
  if (Test-Path $dataSrc) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Get-ChildItem $dataSrc -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($dataSrc.Length).TrimStart('\','/')
      $tgt = [System.IO.Path]::Combine($dataDir, $rel)
      $tgtDir = Split-Path $tgt -Parent
      if (-not (Test-Path $tgtDir)) { New-Item -ItemType Directory -Path $tgtDir -Force | Out-Null }
      Copy-Item $_.FullName $tgt -Force
    }
    $bundled[$base].HasData = $true
  }

  $tpBundled++
  $parts = @()
  if ($bundled[$base].HasData) { $parts += 'data' }
  if ($subfolderCount -gt 0) { $parts += "$subfolderCount subfolder DLL(s)" }
  $suffix = if ($parts.Count -gt 0) { ' (+ ' + ($parts -join ', ') + ')' } else { ' (DLL only)' }
  Write-Output "  Bundled: $base$suffix"
}
Write-Output "  $tpBundled plugin(s) + $sidecarCount sidecar(s) bundled in program-plugins/"

# Pick a friendly display name for a plugin without a hardcoded mapping:
#   1. If ProductName has both upper- and lower-case AND a space, use it
#      (e.g. "Advanced Scene Switcher" - the dev set a proper name).
#   2. Otherwise, title-case the basename: replace - and _ with space, capitalize
#      each word, and uppercase short tokens (<=4 chars) since they're usually
#      acronyms (obs, ui, rtmp, ndi, midi, mqtt, vst).
function Get-FriendlyPluginName {
  param([string]$Basename, [string]$ProductName)
  if ($ProductName) {
    $hasUpper = $ProductName -cmatch '[A-Z]'
    $hasLower = $ProductName -cmatch '[a-z]'
    $hasSpace = $ProductName.Contains(' ')
    if ($hasUpper -and $hasLower -and $hasSpace) { return $ProductName }
  }
  $words = $Basename -split '[-_]' | Where-Object { $_ }
  $titled = foreach ($w in $words) {
    if ($w -match '^v?\d') { $w }
    elseif ($w.Length -le 4 -and $w -cmatch '^[a-z]+$') { $w.ToUpper() }
    else { [char]::ToUpper($w[0]) + $w.Substring(1).ToLower() }
  }
  return ($titled -join ' ')
}

# Write third-party-plugins.txt now that we know plugin/sidecar structure
$tpLines = @()
$tpLines += "# Third-party OBS plugins detected on the source PC."
$tpLines += "# Plugin BINARIES are bundled in program-plugins/ and auto-installed"
$tpLines += "# by _obs-import.ps1 - no manual download needed on the new PC."
$tpLines += "# (Stock OBS DLLs are filtered out - see system-plugins.txt for raw list.)"
$tpLines += ""
if ($bundled.Count -eq 0) {
  $tpLines += "(none - only stock OBS DLLs detected)"
} else {
  foreach ($name in ($bundled.Keys | Sort-Object)) {
    $info = $bundled[$name]
    $friendly = Get-FriendlyPluginName -Basename $name -ProductName $info.ProductName
    $ver  = if ($info.Version) { $info.Version } else { '?' }
    $extras = @()
    if ($info.HasData) { $extras += 'data dir' }
    if ($info.SubfolderDlls -gt 0) { $extras += "$($info.SubfolderDlls) subfolder DLL(s)" }
    if ($info.Sidecars.Count -gt 0) { $extras += "sidecars: $($info.Sidecars -join ', ')" }
    $extraStr = if ($extras.Count -gt 0) { '  [' + ($extras -join '; ') + ']' } else { '' }
    $tpLines += "- $friendly  v$ver$extraStr"
    $tpLines += "    folder: $name"
  }
}
$tpLines | Set-Content $tpPath -Encoding utf8

# 4d. safe_mode_module_blocklist.txt (if user blocked any modules)
$blocklistSrc = Join-Path $obsRoot 'safe_mode_module_blocklist.txt'
if (Test-Path $blocklistSrc) {
  Copy-Item $blocklistSrc (Join-Path $exportDir 'safe_mode_module_blocklist.txt') -Force
  Write-Output "  Bundled safe_mode_module_blocklist.txt"
}

# 5. Manifest
$manifest = [PSCustomObject]@{
  manifest_version    = 1
  exported_at         = (Get-Date).ToUniversalTime().ToString('o')
  exported_from       = $env:COMPUTERNAME
  obs_user_dir        = $obsRoot
  basic_files         = $basicStats.files
  basic_bytes         = $basicStats.bytes
  basic_skipped_count = $basicStats.skipped.Count
  user_plugin_files   = if (Test-Path $obsPlugs) { (Get-ChildItem $obsPlugs -Recurse -File).Count } else { 0 }
  system_plugin_count = $sysPlugInventory.Count
  third_party_count   = $thirdParty.Count
  bundled_plugin_count = $tpBundled
  bundled_sidecar_count = $sidecarCount
  notes               = 'program-plugins/ contains the actual third-party plugin DLLs + data dirs from Program Files. _obs-import.ps1 drops them into the user-plugin folder so OBS auto-loads them - no installer download needed. plugin_config/ holds per-plugin settings (e.g. Advanced Scene Switcher) which are restored alongside. service.json (stream keys) and *.bak files are deliberately skipped.'
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $exportDir 'manifest.json') -Encoding utf8

Write-Output ""
Write-Output "========================================"
Write-Output "  Export complete: $exportDir"
Write-Output "========================================"
Write-Output "On a new PC: copy this entire repo, then double-click"
Write-Output "Overlay/clip-prep/bootstrap.bat to restore everything."
exit 0
