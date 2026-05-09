import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { decideRoute, executeRoute } from '../src/router.js';

const games = {
  'VALORANT-Win64-Shipping': 'Valorant',
  'GTA5': {
    default: 'GTA 5',
    if_running: [{ process: 'FiveM.exe', name: 'GTA 5 RP' }],
  },
};

const baseSidecar = (events, started = '2026-05-07T14:00:00Z', stopped = '2026-05-07T15:00:00Z') => ({
  started_at: started,
  stopped_at: stopped,
  events,
});

test('decideRoute: dominant single game routes to <Game>/<Format>/', () => {
  const sc = baseSidecar([{ wall: '2026-05-07T14:00:00Z', exe: 'VALORANT-Win64-Shipping' }]);
  const plan = decideRoute({
    basename: '2026-05-07_14-00-00',
    sidecar: sc,
    gamesMap: games,
    runningProcesses: new Set(),
    targetRoot: 'C:/recs',
    dominantThreshold: 0.80,
  });
  assert.equal(plan.kind, 'game');
  assert.equal(plan.gameFolder, 'Valorant');
  assert.equal(plan.targets.mkv, 'C:/recs/Valorant/MKV/2026-05-07_14-00-00.mkv');
  assert.equal(plan.targets.mp4, 'C:/recs/Valorant/MP4/2026-05-07_14-00-00.mp4');
  assert.equal(plan.deleteSidecarAfter, true);
});

test('decideRoute: multi-game below threshold routes to _mix/', () => {
  const sc = baseSidecar([
    { wall: '2026-05-07T14:00:00Z', exe: 'VALORANT-Win64-Shipping' },
    { wall: '2026-05-07T14:30:00Z', exe: 'GTA5' },
  ]);
  const plan = decideRoute({
    basename: 'rec',
    sidecar: sc,
    gamesMap: games,
    runningProcesses: new Set(),
    targetRoot: 'C:/recs',
    dominantThreshold: 0.80,
  });
  assert.equal(plan.kind, 'mix');
  assert.equal(plan.targets.mkv, 'C:/recs/_mix/MKV/Mix_Valorant_GTA 5_rec.mkv');
  assert.equal(plan.targets.mp4, 'C:/recs/_mix/MP4/Mix_Valorant_GTA 5_rec.mp4');
  assert.equal(plan.deleteSidecarAfter, false);
  assert.equal(plan.targets.sidecar, 'C:/recs/_mix/Mix_Valorant_GTA 5_rec.json');
});

test('decideRoute: empty events => orphan (no route)', () => {
  const sc = baseSidecar([]);
  const plan = decideRoute({
    basename: 'rec',
    sidecar: sc,
    gamesMap: games,
    runningProcesses: new Set(),
    targetRoot: 'C:/recs',
    dominantThreshold: 0.80,
  });
  assert.equal(plan.kind, 'orphan');
});

test('decideRoute: GTA5 with FiveM running routes to GTA 5 RP', () => {
  const sc = baseSidecar([{ wall: '2026-05-07T14:00:00Z', exe: 'GTA5' }]);
  const plan = decideRoute({
    basename: 'rec',
    sidecar: sc,
    gamesMap: games,
    runningProcesses: new Set(['fivem.exe']),
    targetRoot: 'C:/recs',
    dominantThreshold: 0.80,
  });
  assert.equal(plan.kind, 'game');
  assert.equal(plan.gameFolder, 'GTA 5 RP');
});

test('executeRoute moves files into target dirs', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-prep-'));
  const dump = path.join(tmp, 'dump');
  const root = path.join(tmp, 'recs');
  await fs.mkdir(dump, { recursive: true });

  await fs.writeFile(path.join(dump, 'rec.mkv'), 'mkv');
  await fs.writeFile(path.join(dump, 'rec.mp4'), 'mp4');
  await fs.writeFile(path.join(dump, 'rec.json'), '{}');

  const plan = {
    kind: 'game',
    gameFolder: 'Valorant',
    sources: {
      mkv: path.join(dump, 'rec.mkv'),
      mp4: path.join(dump, 'rec.mp4'),
      sidecar: path.join(dump, 'rec.json'),
    },
    targets: {
      mkv: path.join(root, 'Valorant/MKV/rec.mkv'),
      mp4: path.join(root, 'Valorant/MP4/rec.mp4'),
    },
    deleteSidecarAfter: true,
  };

  await executeRoute(plan);

  assert.equal(await fs.readFile(plan.targets.mkv, 'utf8'), 'mkv');
  assert.equal(await fs.readFile(plan.targets.mp4, 'utf8'), 'mp4');
  await assert.rejects(() => fs.access(plan.sources.sidecar));

  await fs.rm(tmp, { recursive: true, force: true });
});

test('executeRoute with keepMkv=false: deletes mkv source, only moves mp4', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-prep-'));
  const dump = path.join(tmp, 'dump');
  const root = path.join(tmp, 'recs');
  await fs.mkdir(dump, { recursive: true });

  await fs.writeFile(path.join(dump, 'rec.mkv'), 'mkv');
  await fs.writeFile(path.join(dump, 'rec.mp4'), 'mp4');
  await fs.writeFile(path.join(dump, 'rec.json'), '{}');

  const plan = {
    kind: 'game',
    gameFolder: 'Valorant',
    sources: {
      mkv: path.join(dump, 'rec.mkv'),
      mp4: path.join(dump, 'rec.mp4'),
      sidecar: path.join(dump, 'rec.json'),
    },
    targets: {
      mkv: path.join(root, 'Valorant/MKV/rec.mkv'),
      mp4: path.join(root, 'Valorant/MP4/rec.mp4'),
    },
    deleteSidecarAfter: true,
  };

  await executeRoute(plan, { keepMkv: false });

  // MP4 moved
  assert.equal(await fs.readFile(plan.targets.mp4, 'utf8'), 'mp4');
  // Source MKV deleted
  await assert.rejects(() => fs.access(plan.sources.mkv));
  // MKV target NEVER created
  await assert.rejects(() => fs.access(plan.targets.mkv));
  // Sidecar deleted (deleteSidecarAfter: true)
  await assert.rejects(() => fs.access(plan.sources.sidecar));

  await fs.rm(tmp, { recursive: true, force: true });
});
