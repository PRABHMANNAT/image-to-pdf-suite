import fs from 'fs';
import path from 'path';
import { UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR } from '../utils/paths';

// Files older than this many ms are removed by the periodic sweep.
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function sweep(dir: string) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > MAX_AGE_MS) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  }
}

export function startCleanupTimer() {
  const tick = () => {
    [UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR].forEach(sweep);
  };
  tick();
  setInterval(tick, 10 * 60 * 1000).unref();
}

export function cleanupAll() {
  for (const d of [UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR]) {
    if (!fs.existsSync(d)) continue;
    for (const name of fs.readdirSync(d)) {
      try {
        fs.rmSync(path.join(d, name), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

export function removeFiles(files: string[]) {
  for (const f of files) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }
}
