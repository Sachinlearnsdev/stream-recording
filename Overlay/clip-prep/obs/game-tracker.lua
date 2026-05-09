obs           = obslua
script_name   = "clip-prep game tracker"

local hook_log    = {}
local recording   = false
local started_at  = nil
local subscribed  = false
local current_exe   = nil
local current_title = nil

-- Persisted settings (test-mode dump folder for the diagnostic button)
local settings_state = {
  test_dump_dir = ""
}

local function iso_now()
  return os.date("!%Y-%m-%dT%H:%M:%SZ")
end

local function parse_iso(s)
  local Y,M,D,h,m,sec = s:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)Z")
  if not Y then return 0 end
  return os.time({year=tonumber(Y), month=tonumber(M), day=tonumber(D),
                  hour=tonumber(h), min=tonumber(m), sec=tonumber(sec)})
end

local function rec_offset(wall_iso, start_iso)
  local d = parse_iso(wall_iso) - parse_iso(start_iso)
  if d < 0 then d = 0 end
  local hh = math.floor(d / 3600)
  local mm = math.floor((d % 3600) / 60)
  local ss = d % 60
  return string.format("%02d:%02d:%02d", hh, mm, ss)
end

local function escape_str(s)
  return (s:gsub('\\', '\\\\'):gsub('"', '\\"'))
end

local function event_to_json(ev)
  local exe_part = ev.exe and ('"' .. escape_str(ev.exe) .. '"') or 'null'
  local title_part = ev.title and ('"' .. escape_str(ev.title) .. '"') or 'null'
  return string.format(
    '{ "wall": "%s", "rec": "%s", "exe": %s, "title": %s }',
    ev.wall, ev.rec or "00:00:00", exe_part, title_part
  )
end

local function write_sidecar(recording_path)
  if not recording_path or recording_path == "" then return end
  local stopped = iso_now()
  local sidecar_path = recording_path:gsub("%.mkv$", ".json"):gsub("%.mp4$", ".json")
  if sidecar_path == recording_path then
    sidecar_path = recording_path .. ".json"
  end

  local events = {}
  for _, ev in ipairs(hook_log) do
    if started_at and ev.wall >= started_at then
      ev.rec = rec_offset(ev.wall, started_at)
      table.insert(events, event_to_json(ev))
    end
  end

  local body = string.format(
    '{\n  "started_at": "%s",\n  "stopped_at": "%s",\n  "events": [\n    %s\n  ]\n}\n',
    started_at or stopped, stopped, table.concat(events, ",\n    ")
  )

  local f = io.open(sidecar_path, "w")
  if f then
    f:write(body)
    f:close()
    print("[clip-prep] wrote sidecar: " .. sidecar_path)
  else
    print("[clip-prep] FAILED to write sidecar: " .. sidecar_path)
  end
end

local function on_hooked(cd)
  local title = obs.calldata_string(cd, "title") or ""
  local executable = obs.calldata_string(cd, "executable") or ""
  local exe = executable:match("([^\\/]+)$") or executable
  exe = exe:gsub("%.exe$", "")
  current_exe = exe
  current_title = title
  if recording then
    table.insert(hook_log, { wall = iso_now(), exe = exe, title = title })
  end
  print("[clip-prep] hooked: " .. (exe or "?"))
end

local function on_unhooked(cd)
  current_exe = nil
  current_title = nil
  if recording then
    table.insert(hook_log, { wall = iso_now(), exe = nil, title = nil })
  end
  print("[clip-prep] unhooked")
end

local function subscribe_to_game_capture()
  local sources = obs.obs_enum_sources()
  if sources then
    for _, source in ipairs(sources) do
      local id = obs.obs_source_get_id(source)
      if id == "game_capture" then
        local sh = obs.obs_source_get_signal_handler(source)
        obs.signal_handler_connect(sh, "hooked", on_hooked)
        obs.signal_handler_connect(sh, "unhooked", on_unhooked)
        print("[clip-prep] subscribed to Game Capture: " .. obs.obs_source_get_name(source))
        subscribed = true
      end
    end
    obs.source_list_release(sources)
  end
end

local function on_event(event)
  if event == obs.OBS_FRONTEND_EVENT_RECORDING_STARTING then
    -- Last-chance subscribe in case Game Capture was added/loaded after script_load
    if not subscribed then subscribe_to_game_capture() end
    hook_log = {}
    started_at = iso_now()
    recording = true
    if current_exe then
      table.insert(hook_log, { wall = started_at, exe = current_exe, title = current_title })
    end
    print("[clip-prep] recording started")

  elseif event == obs.OBS_FRONTEND_EVENT_RECORDING_STOPPED then
    recording = false
    local path = obs.obs_frontend_get_last_recording()
    write_sidecar(path)

  elseif event == obs.OBS_FRONTEND_EVENT_FINISHED_LOADING then
    if not subscribed then subscribe_to_game_capture() end

  elseif event == obs.OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED
      or event == obs.OBS_FRONTEND_EVENT_PROFILE_CHANGED then
    subscribed = false
    subscribe_to_game_capture()
  end
end

-- ─── Diagnostic helpers (Tools → Scripts buttons) ───────────────────────────

local function show_status()
  print("[clip-prep] === STATUS ===")
  print("  subscribed to Game Capture: " .. tostring(subscribed))
  print("  current hooked exe:         " .. tostring(current_exe))
  print("  current hooked title:       " .. tostring(current_title))
  print("  recording active:           " .. tostring(recording))
  print("  hook events buffered:       " .. tostring(#hook_log))
  print("  test_dump_dir setting:      \"" .. tostring(settings_state.test_dump_dir) .. "\"")
  print("[clip-prep] === END STATUS ===")
end

local function write_test_sidecar()
  local dir = settings_state.test_dump_dir
  if not dir or dir == "" then
    print("[clip-prep] TEST: set the 'Test dump folder' field above first")
    return
  end
  -- Normalize (Lua io.open accepts forward slashes on Windows)
  dir = dir:gsub("\\", "/"):gsub("/$", "")
  local timestamp = os.date("!%Y-%m-%d_%H-%M-%S")
  local base = "TEST_" .. timestamp
  local now = iso_now()

  local files_written = 0
  local function write_file(path, content)
    local f = io.open(path, "w")
    if f then
      f:write(content); f:close()
      files_written = files_written + 1
    else
      print("[clip-prep] TEST: FAILED to open for write: " .. path)
    end
  end

  write_file(dir .. "/" .. base .. ".mkv", "test mkv")
  write_file(dir .. "/" .. base .. ".mp4", "test mp4")

  local sidecar = string.format(
    '{\n  "started_at": "%s",\n  "stopped_at": "%s",\n  "events": [\n    { "wall": "%s", "rec": "00:00:00", "exe": "VALORANT-Win64-Shipping", "title": "VALORANT (test)" }\n  ]\n}\n',
    now, now, now
  )
  write_file(dir .. "/" .. base .. ".json", sidecar)

  if files_written == 3 then
    print("[clip-prep] TEST: dropped " .. base .. ".{mkv,mp4,json} into " .. dir)
    print("[clip-prep] TEST: if the watcher is running, these should route to Valorant/MKV and Valorant/MP4 within ~3 seconds.")
    print("[clip-prep] TEST: check the dashboard's log panel or Recorder tab to confirm.")
  else
    print("[clip-prep] TEST: only wrote " .. files_written .. "/3 files. Check folder permissions.")
  end
end

-- ─── Script lifecycle ──────────────────────────────────────────────────────

function script_load(_settings)
  obs.obs_frontend_add_event_callback(on_event)
  -- FINISHED_LOADING fires once at OBS startup; if this script is loaded
  -- afterward (Tools → Scripts → Add), that event won't re-fire. Subscribe now.
  subscribe_to_game_capture()
  if not subscribed then
    print("[clip-prep] no Game Capture source found at load. Will retry on scene/profile change.")
  end
end

function script_defaults(s)
  obs.obs_data_set_default_string(s, "test_dump_dir", "")
end

function script_update(s)
  settings_state.test_dump_dir = obs.obs_data_get_string(s, "test_dump_dir")
end

function script_properties()
  local props = obs.obs_properties_create()
  obs.obs_properties_add_path(
    props, "test_dump_dir", "Test dump folder",
    obs.OBS_PATH_DIRECTORY, "", ""
  )
  obs.obs_properties_add_button(
    props, "test_btn", "▶ Write test sidecar (drops 3 files)",
    function() write_test_sidecar(); return false end
  )
  obs.obs_properties_add_button(
    props, "status_btn", "Show status (prints to Script Log)",
    function() show_status(); return false end
  )
  return props
end

function script_description()
  return [[<b>[clip-prep] Game tracker</b><br/>
Watches Game Capture hook events during recordings and writes a sidecar JSON next to each finalized recording. Companion to the clip-prep Node service.<br/><br/>
<b>Diagnostics:</b><br/>
1. Set <i>Test dump folder</i> to the same path as the watcher's <code>dumpDir</code>.<br/>
2. Click <i>Write test sidecar</i> — drops 3 fake files into the dump folder. The watcher should route them within ~3 seconds.<br/>
3. Click <i>Show status</i> — prints subscription state to the Script Log dock.]]
end
