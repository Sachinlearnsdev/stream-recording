import { readFileSync, existsSync } from 'node:fs';

const DEFAULTS = {
  httpPort: 6789,
  dominantGameThreshold: 0.95,
  orphanWarnMinutes: 10,
  fileQuietSeconds: 2,
  logCapacity: 200,
  keepMkv: true,
};

export function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(
      `config.json not found at ${configPath}. Copy config.example.json to config.json and edit it.`
    );
  }
  const raw = JSON.parse(readFileSync(configPath, 'utf8'));
  const cfg = { ...DEFAULTS, ...raw };

  if (!cfg.dumpDir || !cfg.targetRoot) {
    throw new Error('config.json must define both "dumpDir" and "targetRoot".');
  }
  cfg.dumpDir = cfg.dumpDir.replaceAll('\\', '/');
  cfg.targetRoot = cfg.targetRoot.replaceAll('\\', '/');

  return Object.freeze(cfg);
}
