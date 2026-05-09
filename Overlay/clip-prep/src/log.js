import { appendFileSync } from 'node:fs';

export function createLogger({ capacity = 200, silent = false, file = null } = {}) {
  const buf = [];

  function push(level, message) {
    const entry = { ts: new Date().toISOString(), level, message };
    buf.push(entry);
    while (buf.length > capacity) buf.shift();
    if (!silent) {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(`[${level}] ${message}`);
    }
    if (file) {
      try {
        appendFileSync(file, `${entry.ts} [${level}] ${message}\n`, { encoding: 'utf8' });
      } catch {
        // can't fail logging on disk error
      }
    }
  }

  return {
    info: (m) => push('info', m),
    warn: (m) => push('warn', m),
    error: (m) => push('error', m),
    recent: (n) => buf.slice(-n),
  };
}
