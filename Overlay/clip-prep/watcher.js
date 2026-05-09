import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, promises as fs, appendFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import chokidar from 'chokidar';

import { loadConfig } from './src/config.js';
import { createLogger } from './src/log.js';
import { createState, addRecentMove } from './src/state.js';
import { createApi } from './src/api.js';
import { parseSidecar } from './src/sidecar.js';
import { decideRoute, executeRoute } from './src/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);
const logFile = path.join(__dirname, 'clip-prep.log');

// Write fatal errors to the log file before dying so we can diagnose
// the next time the watcher refuses to come back online.
process.on('uncaughtException', (err) => {
  try {
    appendFileSync(
      logFile,
      `${new Date().toISOString()} [fatal] uncaughtException: ${err.stack || err}\n`,
      { encoding: 'utf8' }
    );
  } catch {}
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  try {
    appendFileSync(
      logFile,
      `${new Date().toISOString()} [fatal] unhandledRejection: ${err && err.stack ? err.stack : err}\n`,
      { encoding: 'utf8' }
    );
  } catch {}
});

const configPath = path.join(__dirname, 'config.json');
const config = loadConfig(configPath);
const log = createLogger({ capacity: config.logCapacity, file: logFile });
const state = createState();
const gamesPath = path.join(__dirname, 'games.json');

if (!existsSync(gamesPath)) {
  await fs.copyFile(path.join(__dirname, 'games.default.json'), gamesPath);
  log.info('Created games.json from games.default.json');
}

let gamesMap = JSON.parse(await fs.readFile(gamesPath, 'utf8'));

chokidar.watch(gamesPath, { ignoreInitial: true }).on('change', async () => {
  try {
    gamesMap = JSON.parse(await fs.readFile(gamesPath, 'utf8'));
    log.info('Reloaded games.json');
  } catch (e) {
    log.error(`Failed to reload games.json: ${e.message}`);
  }
});

async function getRunningProcesses() {
  try {
    const { stdout } = await execAsync('tasklist /fo csv /nh', { maxBuffer: 8 * 1024 * 1024 });
    const set = new Set();
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)"/);
      if (m) set.add(m[1].toLowerCase());
    }
    return set;
  } catch (e) {
    log.warn(`tasklist failed: ${e.message}`);
    return new Set();
  }
}

async function isFileQuiet(p, seconds) {
  try {
    const a = (await fs.stat(p)).size;
    await new Promise((r) => setTimeout(r, seconds * 1000));
    const b = (await fs.stat(p)).size;
    return a === b && a > 0;
  } catch {
    return false;
  }
}

const tripleSeen = new Map();

function noteFile(basename, ext, fullPath) {
  const entry = tripleSeen.get(basename) ?? { firstSeen: Date.now() };
  entry[ext] = fullPath;
  tripleSeen.set(basename, entry);
  return entry;
}

async function tryProcess(basename) {
  const entry = tripleSeen.get(basename);
  if (!entry || !entry.mkv || !entry.mp4 || !entry.json) return;

  const quiet = await Promise.all([
    isFileQuiet(entry.mkv, config.fileQuietSeconds),
    isFileQuiet(entry.mp4, config.fileQuietSeconds),
  ]);
  if (!quiet.every(Boolean)) {
    log.info(`${basename}: still being written, will retry`);
    return;
  }

  let sidecarText;
  try {
    sidecarText = await fs.readFile(entry.json, 'utf8');
  } catch (e) {
    log.error(`${basename}: cannot read sidecar: ${e.message}`);
    return;
  }
  const sidecar = parseSidecar(sidecarText);
  if (!sidecar) {
    log.error(`${basename}: invalid sidecar JSON`);
    return;
  }

  const running = await getRunningProcesses();
  const plan = decideRoute({
    basename,
    sidecar,
    gamesMap,
    runningProcesses: running,
    targetRoot: config.targetRoot,
    dominantThreshold: config.dominantGameThreshold,
  });
  plan.sources = { mkv: entry.mkv, mp4: entry.mp4, sidecar: entry.json };

  if (plan.kind === 'orphan') {
    log.warn(`${basename}: orphan (no game events)`);
    return;
  }

  try {
    await executeRoute(plan, { keepMkv: config.keepMkv !== false });
    log.info(`${basename}: routed to ${plan.kind === 'mix' ? '_mix/' : plan.gameFolder + '/'}${config.keepMkv === false ? ' (MKV discarded)' : ''}`);
    addRecentMove(state, { basename, kind: plan.kind, target: plan.gameFolder });
    tripleSeen.delete(basename);
    state.queue = [...tripleSeen.keys()];
  } catch (e) {
    log.error(`${basename}: move failed: ${e.message}`);
  }
}

const watcher = chokidar.watch(config.dumpDir, {
  ignoreInitial: false,
  awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 500 },
});

watcher.on('add', (p) => {
  const ext = path.extname(p).slice(1).toLowerCase();
  const base = path.basename(p, path.extname(p));
  if (!['mkv', 'mp4', 'json'].includes(ext)) return;
  noteFile(base, ext, p);
  state.queue = [...tripleSeen.keys()];
  log.info(`${base}.${ext} appeared`);
  tryProcess(base);
});

setInterval(() => {
  const cutoff = Date.now() - config.orphanWarnMinutes * 60 * 1000;
  for (const [base, entry] of tripleSeen) {
    if (entry.firstSeen < cutoff && (!entry.mp4 || !entry.json) && !entry.warned) {
      log.warn(`${base}: orphan (no MP4 or sidecar after ${config.orphanWarnMinutes}m)`);
      entry.warned = true; // one-shot — don't spam every minute
    }
  }
}, 60 * 1000).unref();

const launcherPath = path.join(__dirname, 'clip-prep-launcher.vbs');
const pickFolderScript = path.join(__dirname, 'scripts', 'pick-folder.ps1');
const app = createApi({
  state, log, config, gamesPath, configPath,
  installDir: __dirname,
  launcherPath, pickFolderScript, logFile,
});
const server = app.listen(config.httpPort, '127.0.0.1', () => {
  log.info(`HTTP API listening on http://127.0.0.1:${config.httpPort}`);
});

const shutdown = (sig) => {
  log.warn(`Received ${sig}, shutting down`);
  server.close();
  watcher.close();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log.info(`clip-prep watching ${config.dumpDir} → ${config.targetRoot}`);
