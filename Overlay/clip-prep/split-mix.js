// split-mix.js
// Splits a mix-folder recording into per-game segments using the sidecar
// timeline. Default mode: stream copy via ffmpeg (fast, lossless, snaps cuts
// to the nearest keyframe — typically ±2s).
//
// CLI usage:
//   node split-mix.js <path-to-mix.mkv>            # split one file
//   node split-mix.js --all                        # split every mix in <targetRoot>/_mix/
//   node split-mix.js <path> --precise             # frame-accurate (re-encode, slow)
//
// Programmatic usage:
//   import { splitMixFile } from './split-mix.js';
//   await splitMixFile(mkvPath, { precise: false, log: console });

import { promises as fs, existsSync, readdirSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGameFolder } from './src/resolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIN_SEGMENT_SECONDS = 5; // skip segments shorter than this
const SPLIT_RECORD_FILE = '_split-record.json';

// Cache the resolved ffmpeg location so we don't re-search every call.
let _ffmpegPath = null;

// Resolve ffmpeg.exe robustly. The watcher process inherits its parent's
// env at launch time, so a freshly winget-installed ffmpeg won't be in
// process.env.PATH until the watcher restarts. We refresh PATH from the
// registry, then fall back to common winget install locations.
function resolveFfmpegPath() {
  if (_ffmpegPath && existsSync(_ffmpegPath)) return _ffmpegPath;

  // 1. PATH as we have it
  try {
    const out = execSync('where ffmpeg', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).find(l => l.trim());
    if (first && existsSync(first.trim())) {
      _ffmpegPath = first.trim();
      return _ffmpegPath;
    }
  } catch {}

  // 2. Re-read PATH from registry (catches recently-installed tools)
  try {
    const userPath = execSync('reg query "HKCU\\Environment" /v Path', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const machinePath = execSync('reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const extract = (s) => {
      const m = s.match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m);
      return m ? m[1] : '';
    };
    const fresh = `${extract(machinePath)};${extract(userPath)}`;
    for (const dir of fresh.split(';')) {
      if (!dir) continue;
      const expanded = dir.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
      const candidate = path.join(expanded, 'ffmpeg.exe');
      if (existsSync(candidate)) {
        _ffmpegPath = candidate;
        // Also update our PATH so subsequent spawns find it
        process.env.PATH = fresh + ';' + (process.env.PATH || '');
        return _ffmpegPath;
      }
    }
  } catch {}

  // 3. Common winget install locations (Gyan.FFmpeg)
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'ffmpeg', 'bin', 'ffmpeg.exe'),
  ];
  // Also search the winget Packages dir for any Gyan.FFmpeg* folder
  try {
    const pkgRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(pkgRoot)) {
      const subs = readdirSync(pkgRoot).filter(n => n.toLowerCase().startsWith('gyan.ffmpeg'));
      for (const sub of subs) {
        // Recurse one level for ffmpeg-N.N-full_build/bin/ffmpeg.exe
        const inner = path.join(pkgRoot, sub);
        const innerSubs = readdirSync(inner);
        for (const dir of innerSubs) {
          candidates.push(path.join(inner, dir, 'bin', 'ffmpeg.exe'));
        }
      }
    }
  } catch {}
  for (const c of candidates) {
    if (existsSync(c)) {
      _ffmpegPath = c;
      return _ffmpegPath;
    }
  }
  return null;
}

function runFfmpeg(args, log) {
  return new Promise((resolve, reject) => {
    const ffmpegBin = resolveFfmpegPath();
    if (!ffmpegBin) {
      return reject(new Error(
        'ffmpeg not found. Install via: winget install Gyan.FFmpeg, ' +
        'then RESTART the watcher (dashboard RESTART or uninstall.bat → install.bat) ' +
        'so it picks up the new PATH.'
      ));
    }
    if (log && log.info) log.info(`ffmpeg(${ffmpegBin}) ${args.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`);
    const proc = spawn(ffmpegBin, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`ffmpeg spawn failed: ${err.message}`)));
    proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 500)}`)));
  });
}

function buildSegments(sidecar) {
  const startMs = Date.parse(sidecar.started_at);
  const stopMs = Date.parse(sidecar.stopped_at);
  const events = sidecar.events || [];
  const segments = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.exe) continue; // skip idle gaps
    const fromMs = Math.max(Date.parse(ev.wall), startMs);
    const next = events[i + 1];
    const toMs = next ? Math.min(Date.parse(next.wall), stopMs) : stopMs;
    const fromSec = (fromMs - startMs) / 1000;
    const toSec = (toMs - startMs) / 1000;
    if (toSec - fromSec < MIN_SEGMENT_SECONDS) continue;
    segments.push({
      exe: ev.exe,
      title: ev.title || null,
      fromSec: Math.max(0, fromSec),
      toSec,
      durationSec: toSec - fromSec,
    });
  }
  return segments;
}

// targetRoot = parent of _mix/ directory. Mix files live at:
//   <targetRoot>/_mix/MKV/<basename>.mkv
//   <targetRoot>/_mix/MP4/<basename>.mp4
//   <targetRoot>/_mix/<basename>.json
function deriveLayout(mkvPath) {
  const mkvDir = path.dirname(mkvPath);                  // <targetRoot>/_mix/MKV
  const mixDir = path.dirname(mkvDir);                   // <targetRoot>/_mix
  const targetRoot = path.dirname(mixDir);               // <targetRoot>
  const basename = path.basename(mkvPath, path.extname(mkvPath));
  const sidecarPath = path.join(mixDir, `${basename}.json`);
  const mp4Path = path.join(mixDir, 'MP4', `${basename}.mp4`);
  return { mkvDir, mixDir, targetRoot, basename, sidecarPath, mp4Path };
}

export async function splitMixFile(mkvPath, opts = {}) {
  const log = opts.log || console;
  const precise = !!opts.precise;
  const keepMkv = opts.keepMkv !== false; // default true
  const gamesPath = opts.gamesPath || path.join(__dirname, 'games.json');

  const layout = deriveLayout(mkvPath);
  if (!existsSync(layout.sidecarPath)) {
    throw new Error(`sidecar not found: ${layout.sidecarPath}`);
  }
  if (!existsSync(gamesPath)) {
    throw new Error(`games.json not found: ${gamesPath}`);
  }

  const sidecar = JSON.parse(await fs.readFile(layout.sidecarPath, 'utf8'));
  const gamesMap = JSON.parse(await fs.readFile(gamesPath, 'utf8'));
  const segments = buildSegments(sidecar);

  if (segments.length === 0) {
    log.info(`${layout.basename}: no game segments to split (sidecar has no exe events ≥${MIN_SEGMENT_SECONDS}s)`);
    return { basename: layout.basename, segments: [] };
  }

  log.info(`${layout.basename}: ${segments.length} segment(s) to split`);

  const hasMp4 = existsSync(layout.mp4Path);
  const splitOutputs = [];

  for (const seg of segments) {
    const folder = resolveGameFolder(seg.exe, gamesMap, new Set());
    const outBase = `${layout.basename}__${seg.exe}__${Math.floor(seg.fromSec)}s`;
    const mkvOut = path.join(layout.targetRoot, folder, 'MKV', `${outBase}.mkv`);
    const mp4Out = path.join(layout.targetRoot, folder, 'MP4', `${outBase}.mp4`);

    // Common ffmpeg args for stream copy
    // Input-side seek (-ss before -i) is FAST (uses index) but snaps to keyframe.
    // Precise mode uses output-side seek (-ss after -i) + re-encode = slow + frame-accurate.
    const cutArgs = precise
      ? ['-i', mkvPath, '-ss', String(seg.fromSec), '-t', String(seg.durationSec), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'copy', '-y']
      : ['-ss', String(seg.fromSec), '-i', mkvPath, '-t', String(seg.durationSec), '-c', 'copy', '-y'];

    if (keepMkv) {
      log.info(`  → ${folder}/MKV/${outBase}.mkv  (${seg.fromSec.toFixed(1)}s + ${seg.durationSec.toFixed(1)}s)`);
      await fs.mkdir(path.dirname(mkvOut), { recursive: true });
      await runFfmpeg([...cutArgs, mkvOut], log);
    } else {
      log.info(`  (skipping MKV cut — keepMkv=false)`);
    }

    if (hasMp4) {
      const mp4CutArgs = precise
        ? ['-i', layout.mp4Path, '-ss', String(seg.fromSec), '-t', String(seg.durationSec), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'copy', '-y']
        : ['-ss', String(seg.fromSec), '-i', layout.mp4Path, '-t', String(seg.durationSec), '-c', 'copy', '-y'];
      log.info(`  → ${folder}/MP4/${outBase}.mp4`);
      await fs.mkdir(path.dirname(mp4Out), { recursive: true });
      await runFfmpeg([...mp4CutArgs, mp4Out], log);
    }

    splitOutputs.push({
      exe: seg.exe,
      title: seg.title,
      folder,
      mkv: keepMkv ? path.relative(layout.targetRoot, mkvOut).replace(/\\/g, '/') : null,
      mp4: hasMp4 ? path.relative(layout.targetRoot, mp4Out).replace(/\\/g, '/') : null,
      from_sec: seg.fromSec,
      to_sec: seg.toSec,
      duration_sec: seg.durationSec,
    });
  }

  // Write/update split-record.json so we know what's been split (and from where).
  // Store in <targetRoot>/_mix/_split-record.json.
  const recordPath = path.join(layout.mixDir, SPLIT_RECORD_FILE);
  let record = {};
  try { record = JSON.parse(await fs.readFile(recordPath, 'utf8')); } catch {}
  record[layout.basename] = {
    split_at: new Date().toISOString(),
    precise,
    parent_mkv: path.relative(layout.targetRoot, mkvPath).replace(/\\/g, '/'),
    parent_mp4: hasMp4 ? path.relative(layout.targetRoot, layout.mp4Path).replace(/\\/g, '/') : null,
    segments: splitOutputs,
  };
  await fs.writeFile(recordPath, JSON.stringify(record, null, 2), 'utf8');
  log.info(`${layout.basename}: split-record updated at ${recordPath}`);

  return { basename: layout.basename, segments: splitOutputs };
}

export async function splitAllMixes(mixDir, opts = {}) {
  const log = opts.log || console;
  if (!existsSync(mixDir)) {
    log.info(`mix dir does not exist: ${mixDir}`);
    return [];
  }
  const mkvDir = path.join(mixDir, 'MKV');
  if (!existsSync(mkvDir)) return [];
  const files = (await fs.readdir(mkvDir)).filter(f => f.endsWith('.mkv'));
  const results = [];
  // Skip already-split files
  const recordPath = path.join(mixDir, SPLIT_RECORD_FILE);
  let record = {};
  try { record = JSON.parse(await fs.readFile(recordPath, 'utf8')); } catch {}
  for (const f of files) {
    const basename = f.replace(/\.mkv$/, '');
    if (record[basename] && !opts.force) {
      log.info(`${basename}: already split, skipping (use --force to redo)`);
      continue;
    }
    const result = await splitMixFile(path.join(mkvDir, f), opts);
    results.push(result);
  }
  return results;
}

// CLI entry point
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const precise = args.includes('--precise');
  const force = args.includes('--force');
  const all = args.includes('--all');
  const filtered = args.filter(a => !a.startsWith('--'));

  (async () => {
    try {
      if (all) {
        // Resolve mixDir from config.json
        const configPath = path.join(__dirname, 'config.json');
        const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
        const mixDir = path.join(cfg.targetRoot.replace(/\//g, path.sep), '_mix');
        await splitAllMixes(mixDir, { precise, force });
      } else if (filtered.length === 1) {
        await splitMixFile(filtered[0], { precise, force });
      } else {
        console.log('Usage:');
        console.log('  node split-mix.js <path-to-mix.mkv>           split one mix file');
        console.log('  node split-mix.js --all                       split every mix in <targetRoot>/_mix/');
        console.log('  add --precise   for frame-accurate cuts (slow re-encode)');
        console.log('  add --force     to re-split files already in the split-record');
        process.exit(1);
      }
      console.log('done');
    } catch (err) {
      console.error('ERROR:', err.message);
      process.exit(1);
    }
  })();
}
