export function parseSidecar(text) {
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') return null;
    if (!obj.started_at || !obj.stopped_at || !Array.isArray(obj.events)) return null;
    return obj;
  } catch {
    return null;
  }
}

// Returns Map<exe, durationSeconds>. Idle periods (exe=null) are not counted.
export function computeGameDurations(sidecar) {
  const startMs = Date.parse(sidecar.started_at);
  const endMs = Date.parse(sidecar.stopped_at);
  const durations = new Map();

  const segments = [];
  let currentExe = null;
  let currentStart = startMs;

  for (const ev of sidecar.events) {
    const t = Math.max(Date.parse(ev.wall), startMs);
    if (t > currentStart) {
      segments.push({ exe: currentExe, from: currentStart, to: t });
    }
    currentExe = ev.exe ?? null;
    currentStart = t;
  }
  if (endMs > currentStart) {
    segments.push({ exe: currentExe, from: currentStart, to: endMs });
  }

  for (const seg of segments) {
    if (seg.exe == null) continue;
    const secs = (seg.to - seg.from) / 1000;
    durations.set(seg.exe, (durations.get(seg.exe) ?? 0) + secs);
  }
  return durations;
}

export function pickDominantGame(durations, threshold) {
  const total = [...durations.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return { dominant: null, isMix: false, games: [] };

  let best = null;
  let bestSecs = 0;
  for (const [exe, secs] of durations) {
    if (secs > bestSecs) {
      best = exe;
      bestSecs = secs;
    }
  }
  if (bestSecs / total >= threshold) {
    return { dominant: best, isMix: false, games: [best] };
  }
  return { dominant: null, isMix: true, games: [...durations.keys()] };
}
