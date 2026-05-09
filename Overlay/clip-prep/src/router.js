import { promises as fs } from 'node:fs';
import path from 'node:path';
import { computeGameDurations, pickDominantGame } from './sidecar.js';
import { resolveGameFolder } from './resolver.js';

export function decideRoute({ basename, sidecar, gamesMap, runningProcesses, targetRoot, dominantThreshold }) {
  const durations = computeGameDurations(sidecar);
  const dom = pickDominantGame(durations, dominantThreshold);

  if (durations.size === 0) {
    return { kind: 'orphan', reason: 'no game events in sidecar' };
  }

  const root = targetRoot.replaceAll('\\', '/');

  if (!dom.isMix && dom.dominant) {
    const folder = resolveGameFolder(dom.dominant, gamesMap, runningProcesses);
    return {
      kind: 'game',
      gameFolder: folder,
      targets: {
        mkv: path.posix.join(root, folder, 'MKV', `${basename}.mkv`),
        mp4: path.posix.join(root, folder, 'MP4', `${basename}.mp4`),
      },
      deleteSidecarAfter: true,
    };
  }

  // Mix
  const folderNames = dom.games.map((exe) => resolveGameFolder(exe, gamesMap, runningProcesses));
  const mixName = `Mix_${folderNames.join('_')}_${basename}`;
  return {
    kind: 'mix',
    gameFolder: '_mix',
    games: folderNames,
    targets: {
      mkv: path.posix.join(root, '_mix', 'MKV', `${mixName}.mkv`),
      mp4: path.posix.join(root, '_mix', 'MP4', `${mixName}.mp4`),
      sidecar: path.posix.join(root, '_mix', `${mixName}.json`),
    },
    deleteSidecarAfter: false,
  };
}

// opts.keepMkv — when false, the source .mkv is deleted instead of moved
// to the target tree. The .mp4 still moves to its target normally. Sidecar
// handling is unchanged. Used when the user only ever edits MP4s and treats
// the MKV as a transient crash-safe artifact.
export async function executeRoute(plan, opts = {}) {
  if (plan.kind === 'orphan') return;
  const keepMkv = opts.keepMkv !== false; // default true

  for (const fmt of ['mkv', 'mp4']) {
    const src = plan.sources[fmt];
    if (!src) continue;
    if (fmt === 'mkv' && !keepMkv) {
      await fs.unlink(src);
      continue;
    }
    const tgt = plan.targets[fmt];
    await fs.mkdir(path.dirname(tgt), { recursive: true });
    await fs.rename(src, tgt);
  }

  if (plan.kind === 'mix' && plan.targets.sidecar) {
    await fs.mkdir(path.dirname(plan.targets.sidecar), { recursive: true });
    await fs.rename(plan.sources.sidecar, plan.targets.sidecar);
  } else if (plan.deleteSidecarAfter) {
    await fs.unlink(plan.sources.sidecar);
  }
}
