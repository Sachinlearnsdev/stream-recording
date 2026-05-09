const COMMON_SUFFIXES = [
  /-Win64-Shipping$/i,
  /_Win64-Shipping$/i,
  /-Shipping$/i,
  /_x64$/i,
  /-x64$/i,
  /\.exe$/i,
];

export function cleanExeName(exe) {
  let name = exe;
  for (const re of COMMON_SUFFIXES) {
    name = name.replace(re, '');
  }
  return name;
}

// Look up a games.json entry for `exe`. Tries exact match first, then a
// case-insensitive scan — handles the same game launching with different
// casing across Steam/Epic/Game Pass versions.
function lookupEntry(exe, gamesMap) {
  if (Object.prototype.hasOwnProperty.call(gamesMap, exe)) return gamesMap[exe];
  const lower = exe.toLowerCase();
  for (const key of Object.keys(gamesMap)) {
    if (key.toLowerCase() === lower) return gamesMap[key];
  }
  return undefined;
}

// runningProcessNames: Set<string> of basenames (case-insensitive matched).
export function resolveGameFolder(exe, gamesMap, runningProcessNames) {
  const entry = lookupEntry(exe, gamesMap);

  if (typeof entry === 'string') {
    return entry;
  }

  if (entry && typeof entry === 'object') {
    const lowered = new Set([...runningProcessNames].map((p) => p.toLowerCase()));
    if (Array.isArray(entry.if_running)) {
      for (const rule of entry.if_running) {
        if (lowered.has(rule.process.toLowerCase())) {
          return rule.name;
        }
      }
    }
    return entry.default;
  }

  return cleanExeName(exe);
}
