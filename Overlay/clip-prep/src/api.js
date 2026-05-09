import express from 'express';
import { promises as fs, existsSync } from 'node:fs';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { splitMixFile } from '../split-mix.js';

const execAsync = promisify(exec);

// Open File Explorer at the given path. Reliable from any process context.
function openInExplorer(targetPath) {
  spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' }).unref();
}

// Spawn the folder-picker PowerShell script with a hidden console window —
// the IFileDialog inside uses GetForegroundWindow() as its parent, so it
// appears modal to the user's browser (or whatever they have focused).
// Result is communicated via temp file (more reliable than stdout capture).
function pickFolderViaTempFile(scriptPath, description, log) {
  const tmpFile = path.join(
    os.tmpdir(),
    `clip-prep-pick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`
  );
  const args = [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-OutFile', tmpFile,
    '-Description', description,
  ];
  if (log) log.info(`pick-folder: spawning hidden -> powershell ${args.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`);

  return new Promise((resolve) => {
    let resolved = false;
    const finish = async (val, reason) => {
      if (resolved) return;
      resolved = true;
      if (log) log.info(`pick-folder: finish (${reason}) val="${val ?? '<null>'}"`);
      try { await fs.unlink(tmpFile); } catch {}
      resolve(val);
    };
    let child;
    try {
      child = spawn('powershell.exe', args, {
        stdio: 'ignore',
        windowsHide: true, // no terminal flash — dialog uses foreground window as parent
      });
    } catch (err) {
      if (log) log.error(`pick-folder: spawn threw: ${err.message}`);
      return finish(null, 'spawn-error');
    }
    child.on('exit', async (code) => {
      if (log) log.info(`pick-folder: child exited code=${code}`);
      try {
        const text = await fs.readFile(tmpFile, 'utf8');
        finish(text.trim() || null, 'exit-with-file');
      } catch {
        finish(null, 'exit-no-file');
      }
    });
    child.on('error', (err) => {
      if (log) log.error(`pick-folder: child error: ${err.message}`);
      finish(null, 'child-error');
    });
    // 60-second failsafe — user might take a moment to find the folder
    setTimeout(() => finish(null, 'timeout-60s'), 60 * 1000);
  });
}

export function createApi({ state, log, config, gamesPath, configPath, installDir, launcherPath, pickFolderScript, logFile }) {
  const app = express();
  app.use(express.json());

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.get('/status', (_req, res) => {
    res.json({
      running: true,
      startedAt: state.startedAt,
      queue: state.queue,
      recentMoves: state.recentMoves,
      config: {
        dumpDir: config.dumpDir,
        targetRoot: config.targetRoot,
        keepMkv: config.keepMkv !== false,
      },
      installDir: (installDir || '').replace(/\\/g, '/'),
      logFile: (logFile || '').replace(/\\/g, '/'),
    });
  });

  // POST /open-log — opens the log file in the default text editor (notepad).
  app.post('/open-log', (_req, res) => {
    if (!logFile) return res.status(500).json({ error: 'logFile not configured' });
    try {
      spawn('notepad.exe', [logFile], { detached: true, stdio: 'ignore' }).unref();
      res.json({ ok: true, opened: logFile.replace(/\\/g, '/') });
    } catch (err) {
      log.error(`open-log failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /pick-folder?kind=dump|target|bundle|output — pop a real folder picker.
  // Spawns powershell with a visible console window so the dialog gets
  // foreground rights. Result is communicated via a temp file (more reliable
  // than capturing stdout from a hidden child process).
  app.post('/pick-folder', async (req, res) => {
    if (!pickFolderScript) {
      return res.status(500).json({ error: 'pickFolderScript not configured' });
    }
    const kind = (req.query.kind || '').toString();
    const desc = kind === 'dump'
      ? 'Select OBS recording dump folder'
      : kind === 'target'
        ? 'Select target root for organized recordings'
        : kind === 'recording-root'
          ? 'Select OBS Recording folder (we will create _dump/ and recording/ inside)'
          : kind === 'bundle'
            ? 'Select OBS bundle folder (must contain manifest.json + basic/)'
            : kind === 'output'
              ? 'Select folder where the OBS bundle will be created'
              : 'Select folder';
    log.info(`pick-folder: launching picker (kind=${kind})`);
    try {
      const picked = await pickFolderViaTempFile(pickFolderScript, desc, log);
      if (!picked) {
        log.info('pick-folder: cancelled or no selection');
        return res.json({ ok: true, cancelled: true });
      }
      log.info(`pick-folder: got "${picked}"`);
      res.json({ ok: true, path: picked.replace(/\\/g, '/') });
    } catch (err) {
      log.error(`pick-folder failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/log', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json(log.recent(limit));
  });

  app.get('/games', async (_req, res) => {
    try {
      const text = await fs.readFile(gamesPath, 'utf8');
      res.type('application/json').send(text);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/games', async (req, res) => {
    try {
      const json = JSON.stringify(req.body, null, 2);
      await fs.writeFile(gamesPath, json, 'utf8');
      log.info(`games.json updated via API (${Object.keys(req.body).length} entries)`);
      res.json({ ok: true });
    } catch (err) {
      log.error(`PUT /games failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /open-folder — opens File Explorer at the given path. Body: { path }.
  // If the path doesn't exist, opens the closest existing parent.
  app.post('/open-folder', (req, res) => {
    const target = (req.body && req.body.path) ? String(req.body.path) : '';
    if (!target) return res.status(400).json({ error: 'body.path required' });
    let toOpen = target.replace(/\//g, '\\');
    // Walk up the path until we find an existing directory
    while (toOpen && !existsSync(toOpen)) {
      const parent = toOpen.replace(/\\[^\\]*$/, '');
      if (parent === toOpen || !parent) {
        toOpen = '';
        break;
      }
      toOpen = parent;
    }
    if (!toOpen) toOpen = process.env.USERPROFILE || 'C:\\';
    try {
      openInExplorer(toOpen);
      log.info(`open-folder: opened ${toOpen}`);
      res.json({ ok: true, opened: toOpen });
    } catch (err) {
      log.error(`open-folder failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /config — update dumpDir / targetRoot.
  // dumpDir must exist (OBS writes there; the user owns that folder).
  // targetRoot is auto-created if missing (it's our output, we manage it).
  // Writes config.json (UTF-8 no BOM). Client should call /restart after.
  app.put('/config', async (req, res) => {
    try {
      const updates = req.body || {};
      const allowed = ['dumpDir', 'targetRoot'];
      const allowedBool = ['keepMkv'];
      const filtered = {};
      for (const k of allowed) {
        if (typeof updates[k] === 'string' && updates[k].length > 0) {
          filtered[k] = updates[k].replace(/\\/g, '/');
        }
      }
      for (const k of allowedBool) {
        if (typeof updates[k] === 'boolean') filtered[k] = updates[k];
      }
      if (Object.keys(filtered).length === 0) {
        return res.status(400).json({ error: 'no valid fields to update' });
      }
      // dumpDir: must exist
      if (filtered.dumpDir && !existsSync(filtered.dumpDir)) {
        return res.status(400).json({
          error: `dumpDir does not exist: ${filtered.dumpDir}. Create the folder first — this is where OBS writes recordings.`,
        });
      }
      // targetRoot: auto-create
      if (filtered.targetRoot && !existsSync(filtered.targetRoot)) {
        try {
          await fs.mkdir(filtered.targetRoot, { recursive: true });
          log.info(`PUT /config: auto-created targetRoot ${filtered.targetRoot}`);
        } catch (mkErr) {
          return res.status(400).json({
            error: `could not create targetRoot ${filtered.targetRoot}: ${mkErr.message}`,
          });
        }
      }
      const current = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const merged = { ...current, ...filtered };
      await fs.writeFile(configPath, JSON.stringify(merged, null, 2), { encoding: 'utf8' });
      log.info(`config.json updated via API: ${Object.keys(filtered).join(', ')}`);
      res.json({ ok: true, config: merged, restartRequired: true });
    } catch (err) {
      log.error(`PUT /config failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /uninstall — remove the auto-start entry (registry Run key + any
  // stale Task Scheduler entry from older installs), then exit cleanly.
  // Does NOT delete files (config.json, games.json, node_modules, etc).
  app.post('/uninstall', async (_req, res) => {
    try {
      const cmds = [
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "ClipPrepWatcher" /f',
        'schtasks /Delete /F /TN "ClipPrepWatcher"',
      ];
      for (const c of cmds) {
        await execAsync(c).catch((e) => log.warn(`${c.split(' ')[0]}: ${e.message}`));
      }
      log.warn('Uninstall requested via API; auto-start removed; exiting');
      res.json({ ok: true });
      setTimeout(() => process.exit(0), 200);
    } catch (err) {
      log.error(`uninstall failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Track in-progress splits in memory so dashboard refreshes don't lose
  // visibility of ongoing work. Keyed by basename.
  const splitsInProgress = new Set();

  // GET /list-mix — list all .mkv files in <targetRoot>/_mix/MKV plus whether
  // each has been split (via _split-record.json) or is currently being split.
  app.get('/list-mix', async (_req, res) => {
    try {
      const mixDir = path.join(config.targetRoot.replace(/\//g, path.sep), '_mix');
      const mkvDir = path.join(mixDir, 'MKV');
      if (!existsSync(mkvDir)) return res.json({ files: [] });
      const files = (await fs.readdir(mkvDir)).filter(f => f.toLowerCase().endsWith('.mkv'));

      let splitRecord = {};
      const recordPath = path.join(mixDir, '_split-record.json');
      try { splitRecord = JSON.parse(await fs.readFile(recordPath, 'utf8')); } catch {}

      const result = [];
      for (const f of files) {
        const basename = f.replace(/\.mkv$/i, '');
        const sidecarPath = path.join(mixDir, basename + '.json');
        const mkvPath = path.join(mkvDir, f);
        let games = [];
        let durationSec = 0;
        let started_at = null;
        try {
          const sc = JSON.parse(await fs.readFile(sidecarPath, 'utf8'));
          started_at = sc.started_at;
          durationSec = (Date.parse(sc.stopped_at) - Date.parse(sc.started_at)) / 1000;
          const exes = new Set();
          for (const ev of (sc.events || [])) if (ev.exe) exes.add(ev.exe);
          games = [...exes];
        } catch {}
        const stat = await fs.stat(mkvPath).catch(() => null);
        result.push({
          basename,
          mkv: mkvPath.replace(/\\/g, '/'),
          size_bytes: stat ? stat.size : 0,
          duration_sec: durationSec,
          started_at,
          games,
          split: !!splitRecord[basename],
          split_at: splitRecord[basename] ? splitRecord[basename].split_at : null,
          in_progress: splitsInProgress.has(basename),
        });
      }
      result.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
      res.json({ files: result });
    } catch (err) {
      log.error(`/list-mix failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /list-recordings — walks targetRoot, returns one entry per top-level
  // game folder with that folder's files (mkv + mp4 in MKV/ and MP4/ subdirs,
  // plus any direct files like sidecars). Skips _mix (handled separately).
  app.get('/list-recordings', async (_req, res) => {
    try {
      const root = config.targetRoot.replace(/\//g, path.sep);
      if (!existsSync(root)) return res.json({ games: [] });
      const entries = await fs.readdir(root, { withFileTypes: true });
      const games = [];
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name.startsWith('_')) continue; // skip _mix, _orphans, etc.
        const gameDir = path.join(root, ent.name);
        const files = [];
        // Walk one level (MKV/, MP4/) plus any files at game-folder root
        const collect = async (dir, format) => {
          if (!existsSync(dir)) return;
          const items = await fs.readdir(dir, { withFileTypes: true });
          for (const it of items) {
            if (!it.isFile()) continue;
            const full = path.join(dir, it.name);
            const stat = await fs.stat(full).catch(() => null);
            if (!stat) continue;
            files.push({
              name: it.name,
              path: full.replace(/\\/g, '/'),
              size: stat.size,
              mtime: stat.mtimeMs,
              format,
            });
          }
        };
        await collect(path.join(gameDir, 'MKV'), 'mkv');
        await collect(path.join(gameDir, 'MP4'), 'mp4');
        await collect(gameDir, 'other'); // catches any direct files (legacy/manual)
        files.sort((a, b) => b.mtime - a.mtime);
        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        games.push({ name: ent.name, totalSize, fileCount: files.length, files });
      }
      games.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      res.json({ games });
    } catch (err) {
      log.error(`/list-recordings failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /recycle-file  body: { path }
  // Sends a single file (under targetRoot only — for safety) to the Recycle
  // Bin. Path is validated to live inside config.targetRoot to prevent any
  // accidental or malicious recycling of files outside the recording tree.
  app.post('/recycle-file', async (req, res) => {
    const target = (req.body && req.body.path) ? String(req.body.path) : '';
    if (!target) return res.status(400).json({ error: 'body.path required' });
    const targetNorm = path.resolve(target.replace(/\//g, path.sep));
    const rootNorm = path.resolve(config.targetRoot.replace(/\//g, path.sep));
    if (!targetNorm.toLowerCase().startsWith(rootNorm.toLowerCase() + path.sep) && targetNorm.toLowerCase() !== rootNorm.toLowerCase()) {
      return res.status(400).json({ error: 'refusing — path is not inside targetRoot: ' + targetNorm });
    }
    if (!existsSync(targetNorm)) return res.status(404).json({ error: 'file not found: ' + targetNorm });
    try {
      const psScript = path.join(installDir || '', 'scripts', 'recycle.ps1');
      const cmdline = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -Files "${targetNorm}"`;
      log.info(`recycle-file: ${targetNorm}`);
      const { stdout } = await execAsync(cmdline, { maxBuffer: 1024 * 1024 });
      res.json({ ok: true, output: stdout.trim() });
    } catch (err) {
      log.error(`recycle-file failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /recycle-all-mkvs — walks targetRoot recursively and sends every
  // .mkv file to the Recycle Bin. Useful for cleaning up after switching
  // keepMkv off (so existing MKVs from before don't sit around).
  app.post('/recycle-all-mkvs', async (_req, res) => {
    try {
      const root = config.targetRoot.replace(/\//g, path.sep);
      if (!existsSync(root)) return res.status(400).json({ error: 'targetRoot does not exist: ' + root });
      // Walk the tree and collect .mkv paths
      const found = [];
      async function walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) await walk(full);
          else if (ent.isFile() && ent.name.toLowerCase().endsWith('.mkv')) found.push(full);
        }
      }
      await walk(root);
      if (found.length === 0) return res.json({ ok: true, recycled: 0, message: 'no .mkv files in targetRoot' });
      const psScript = path.join(installDir || '', 'scripts', 'recycle.ps1');
      const cmdline = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -Files "${found.join(';')}"`;
      log.warn(`recycle-all-mkvs: sending ${found.length} files to Recycle Bin`);
      const { stdout } = await execAsync(cmdline, { maxBuffer: 16 * 1024 * 1024 });
      log.info(`recycle-all-mkvs done`);
      res.json({ ok: true, recycled: found.length, output: stdout.trim().split('\n').slice(0, 10).join('\n') });
    } catch (err) {
      log.error(`recycle-all-mkvs failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /delete-mix  body: { basename }
  // Moves the mix recording's .mkv, .mp4, and .json sidecar to the Windows
  // Recycle Bin (not permanent delete — user can restore from Recycle Bin).
  // Only allowed if the file has actually been split (per _split-record.json),
  // so segments exist before we trash the source.
  app.post('/delete-mix', async (req, res) => {
    const { basename } = req.body || {};
    if (!basename) return res.status(400).json({ error: 'body.basename required' });
    if (splitsInProgress.has(basename)) {
      return res.status(409).json({ error: 'split in progress; wait until it completes' });
    }
    const mixDir = path.join(config.targetRoot.replace(/\//g, path.sep), '_mix');
    const recordPath = path.join(mixDir, '_split-record.json');
    let record = {};
    try { record = JSON.parse(await fs.readFile(recordPath, 'utf8')); } catch {}
    if (!record[basename]) {
      return res.status(400).json({ error: 'this mix has not been split yet — split first, then delete the original' });
    }
    const targets = [
      path.join(mixDir, 'MKV', basename + '.mkv'),
      path.join(mixDir, 'MP4', basename + '.mp4'),
      path.join(mixDir, basename + '.json'),
    ].filter(p => existsSync(p));
    if (targets.length === 0) {
      return res.status(404).json({ error: 'no files found to delete (already removed?)' });
    }
    try {
      const psScript = path.join(installDir || '', 'scripts', 'recycle.ps1');
      const cmdline = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -Files "${targets.join(';')}"`;
      log.info(`delete-mix: ${basename} → recycle bin (${targets.length} files)`);
      const { stdout } = await execAsync(cmdline, { maxBuffer: 1024 * 1024 });
      log.info(`delete-mix output: ${stdout.trim()}`);
      res.json({ ok: true, recycled: targets.length, output: stdout.trim() });
    } catch (err) {
      log.error(`delete-mix failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /split-mix  body: { basename, precise? }
  // Splits a single mix file into per-game segments via the split-mix.js helper.
  // Tracks in-progress state so dashboard refreshes remain accurate.
  app.post('/split-mix', async (req, res) => {
    const { basename, precise } = req.body || {};
    if (!basename) return res.status(400).json({ error: 'body.basename required' });
    if (splitsInProgress.has(basename)) {
      return res.status(409).json({ error: 'split already in progress for this file' });
    }
    const mixDir = path.join(config.targetRoot.replace(/\//g, path.sep), '_mix');
    const mkvPath = path.join(mixDir, 'MKV', basename + '.mkv');
    if (!existsSync(mkvPath)) return res.status(404).json({ error: 'mix file not found: ' + mkvPath });
    splitsInProgress.add(basename);
    log.info(`split-mix start: ${basename} precise=${!!precise}`);
    try {
      const result = await splitMixFile(mkvPath, { precise: !!precise, gamesPath, log, keepMkv: config.keepMkv !== false });
      log.info(`split-mix done: ${basename} → ${result.segments.length} segment(s)`);
      res.json({ ok: true, ...result });
    } catch (err) {
      log.error(`split-mix failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    } finally {
      splitsInProgress.delete(basename);
    }
  });

  // POST /restart — relaunch: kick off a new watcher via the launcher VBS,
  // detached via cmd /c start (the canonical Windows detach pattern), then
  // exit ourselves. The launcher VBS sleeps 1 second before starting node,
  // so the new instance binds port 6789 only after this one has freed it.
  app.post('/restart', (_req, res) => {
    res.json({ ok: true });
    log.warn('Restart requested via API; launching new instance via cmd /c start');
    if (launcherPath) {
      try {
        const cmdline = `start "" /B wscript.exe "${launcherPath}"`;
        spawn(cmdline, {
          shell: true,
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch (e) {
        log.error(`failed to spawn launcher: ${e.message}`);
      }
    }
    // Give cmd time to actually fire `start` before this process exits.
    setTimeout(() => process.exit(0), 600);
  });

  // POST /set-recording-root  body: { root }
  // Single-folder convenience: takes one parent path, creates <root>/_dump and
  // <root>/recording, updates config, restart picks up new paths.
  app.post('/set-recording-root', async (req, res) => {
    const root = (req.body && req.body.root) ? String(req.body.root).replace(/\//g, path.sep) : '';
    if (!root) return res.status(400).json({ error: 'body.root required' });
    if (!existsSync(root)) {
      try {
        await fs.mkdir(root, { recursive: true });
      } catch (e) {
        return res.status(400).json({ error: `could not create ${root}: ${e.message}` });
      }
    }
    const dumpDir = path.join(root, '_dump');
    const targetRoot = path.join(root, 'recording');
    try {
      if (!existsSync(dumpDir)) await fs.mkdir(dumpDir, { recursive: true });
      if (!existsSync(targetRoot)) await fs.mkdir(targetRoot, { recursive: true });
      const current = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const merged = {
        ...current,
        dumpDir: dumpDir.replace(/\\/g, '/'),
        targetRoot: targetRoot.replace(/\\/g, '/'),
      };
      await fs.writeFile(configPath, JSON.stringify(merged, null, 2), { encoding: 'utf8' });
      log.info(`set-recording-root: ${root} -> dump=${merged.dumpDir}, target=${merged.targetRoot}`);
      res.json({ ok: true, config: merged, restartRequired: true });
    } catch (err) {
      log.error(`set-recording-root failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== OBS BUNDLE: export / import / backup-restore =====
  // Long-running PS scripts are spawned with maxBuffer=32MB so output isn't truncated.

  const obsRoot = path.join(process.env.APPDATA || '', 'obs-studio');
  const exportScript = installDir ? path.join(installDir, 'scripts', 'obs-export.ps1') : '';
  const importScript = installDir ? path.join(installDir, 'scripts', 'obs-import.ps1') : '';
  const luaPath = installDir ? path.join(installDir, 'obs', 'game-tracker.lua') : '';

  // Validate a folder looks like an obs-export bundle.
  function validateBundle(folder) {
    if (!folder) return { ok: false, error: 'no path provided' };
    if (!existsSync(folder)) return { ok: false, error: `folder does not exist: ${folder}` };
    const manifest = path.join(folder, 'manifest.json');
    const basic = path.join(folder, 'basic');
    if (!existsSync(manifest)) return { ok: false, error: 'not a bundle (missing manifest.json)' };
    if (!existsSync(basic)) return { ok: false, error: 'not a bundle (missing basic/)' };
    return { ok: true };
  }

  // POST /export-obs-bundle  body: { outputDir }
  // Runs obs-export.ps1 -OutputDir <outputDir>. Returns full stdout/stderr.
  app.post('/export-obs-bundle', async (req, res) => {
    const outputDir = (req.body && req.body.outputDir) ? String(req.body.outputDir).replace(/\//g, path.sep) : '';
    if (!outputDir) return res.status(400).json({ error: 'body.outputDir required' });
    if (!exportScript || !existsSync(exportScript)) {
      return res.status(500).json({ error: 'export script not found at ' + exportScript });
    }
    try {
      const cmdline = `powershell -NoProfile -ExecutionPolicy Bypass -File "${exportScript}" -OutputDir "${outputDir}"`;
      log.info(`export-obs-bundle: ${outputDir}`);
      const { stdout, stderr } = await execAsync(cmdline, { maxBuffer: 32 * 1024 * 1024 });
      const combined = (stdout + (stderr ? '\n--- stderr ---\n' + stderr : '')).trim();
      const failed = /^ERROR:/m.test(combined);
      if (failed) {
        log.warn(`export-obs-bundle reported error`);
        return res.status(500).json({ ok: false, output: combined });
      }
      log.info(`export-obs-bundle done -> ${outputDir}`);
      res.json({ ok: true, outputDir: outputDir.replace(/\\/g, '/'), output: combined });
    } catch (err) {
      log.error(`export-obs-bundle failed: ${err.message}`);
      res.status(500).json({ error: err.message, stdout: err.stdout, stderr: err.stderr });
    }
  });

  // POST /import-obs-bundle  body: { bundlePath }
  app.post('/import-obs-bundle', async (req, res) => {
    const bundlePath = (req.body && req.body.bundlePath) ? String(req.body.bundlePath).replace(/\//g, path.sep) : '';
    const v = validateBundle(bundlePath);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (!importScript || !existsSync(importScript)) {
      return res.status(500).json({ error: 'import script not found at ' + importScript });
    }
    if (!luaPath || !existsSync(luaPath)) {
      return res.status(500).json({ error: 'game-tracker.lua not found at ' + luaPath });
    }
    try {
      const cmdline = `powershell -NoProfile -ExecutionPolicy Bypass -File "${importScript}" -BundlePath "${bundlePath}" -LuaPath "${luaPath}"`;
      log.info(`import-obs-bundle: from ${bundlePath}`);
      const { stdout, stderr } = await execAsync(cmdline, { maxBuffer: 32 * 1024 * 1024 });
      const combined = (stdout + (stderr ? '\n--- stderr ---\n' + stderr : '')).trim();
      const failed = /^ERROR:/m.test(combined);
      if (failed) {
        log.warn(`import-obs-bundle reported error`);
        return res.status(500).json({ ok: false, output: combined });
      }
      log.info(`import-obs-bundle done`);
      res.json({ ok: true, output: combined });
    } catch (err) {
      log.error(`import-obs-bundle failed: ${err.message}`);
      res.status(500).json({ error: err.message, stdout: err.stdout, stderr: err.stderr });
    }
  });

  // GET /list-obs-backups - finds %APPDATA%\obs-studio\_clip-prep-backup-*
  app.get('/list-obs-backups', async (_req, res) => {
    if (!existsSync(obsRoot)) return res.json({ backups: [] });
    try {
      const entries = await fs.readdir(obsRoot, { withFileTypes: true });
      const backups = [];
      for (const ent of entries) {
        if (!ent.isDirectory() || !ent.name.startsWith('_clip-prep-backup-')) continue;
        const full = path.join(obsRoot, ent.name);
        const stat = await fs.stat(full);
        let sizeBytes = 0;
        let fileCount = 0;
        try {
          const stack = [full];
          while (stack.length) {
            const dir = stack.pop();
            const items = await fs.readdir(dir, { withFileTypes: true });
            for (const i of items) {
              const p = path.join(dir, i.name);
              if (i.isDirectory()) stack.push(p);
              else if (i.isFile()) { sizeBytes += (await fs.stat(p)).size; fileCount++; }
            }
          }
        } catch {}
        backups.push({
          name: ent.name,
          path: full.replace(/\\/g, '/'),
          modified: stat.mtime.toISOString(),
          sizeBytes,
          fileCount,
        });
      }
      backups.sort((a, b) => b.modified.localeCompare(a.modified));
      res.json({ backups });
    } catch (err) {
      log.error(`list-obs-backups failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /restore-obs-backup  body: { name }
  // Copies leaves of the backup back into %APPDATA%\obs-studio\, after first
  // saving the current state to a new safety-backup folder. Reversible.
  app.post('/restore-obs-backup', async (req, res) => {
    const name = (req.body && req.body.name) ? String(req.body.name) : '';
    if (!name || !name.startsWith('_clip-prep-backup-')) {
      return res.status(400).json({ error: 'invalid backup name' });
    }
    const backupDir = path.join(obsRoot, name);
    if (!existsSync(backupDir)) return res.status(404).json({ error: 'backup not found: ' + name });

    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
      const safetyDir = path.join(obsRoot, `_clip-prep-backup-${stamp}-pre-restore`);
      await fs.mkdir(safetyDir);
      const leaves = ['basic', 'plugins', 'plugin_config', 'plugin_manager', 'global.ini', 'user.ini'];
      for (const leaf of leaves) {
        const src = path.join(obsRoot, leaf);
        if (existsSync(src)) {
          await fs.cp(src, path.join(safetyDir, leaf), { recursive: true, force: true });
        }
      }
      log.info(`restore-obs-backup: safety snapshot at ${safetyDir}`);

      // Now copy backup back over obs-studio
      let restored = 0;
      for (const leaf of leaves) {
        const src = path.join(backupDir, leaf);
        if (!existsSync(src)) continue;
        const dst = path.join(obsRoot, leaf);
        await fs.cp(src, dst, { recursive: true, force: true });
        restored++;
      }
      log.info(`restore-obs-backup: restored ${restored} leaf(s) from ${name}`);
      res.json({ ok: true, restored, safetyBackup: path.basename(safetyDir) });
    } catch (err) {
      log.error(`restore-obs-backup failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /delete-obs-backup  body: { name }
  // Sends backup folder to Recycle Bin (recoverable, not permanent).
  app.post('/delete-obs-backup', async (req, res) => {
    const name = (req.body && req.body.name) ? String(req.body.name) : '';
    if (!name || !name.startsWith('_clip-prep-backup-')) {
      return res.status(400).json({ error: 'invalid backup name' });
    }
    const target = path.join(obsRoot, name);
    if (!existsSync(target)) return res.status(404).json({ error: 'backup not found' });
    try {
      const psScript = path.join(installDir || '', 'scripts', 'recycle.ps1');
      const cmdline = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -Files "${target}"`;
      log.info(`delete-obs-backup: ${name} -> recycle bin`);
      const { stdout } = await execAsync(cmdline, { maxBuffer: 1024 * 1024 });
      res.json({ ok: true, output: stdout.trim() });
    } catch (err) {
      log.error(`delete-obs-backup failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /stop — exit without respawning. Dashboard offers START hint after.
  app.post('/stop', (_req, res) => {
    res.json({ ok: true });
    log.warn('Stop requested via API; exiting (no auto-relaunch)');
    setTimeout(() => process.exit(0), 200);
  });

  return app;
}
