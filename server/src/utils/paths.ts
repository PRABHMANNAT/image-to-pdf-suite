import path from 'path';
import fs from 'fs';

export const ROOT = path.resolve(__dirname, '..', '..');
export const UPLOADS_DIR = path.join(ROOT, 'uploads');
export const OUTPUTS_DIR = path.join(ROOT, 'outputs');
export const TEMP_DIR = path.join(ROOT, 'temp');

export function ensureDirs() {
  for (const d of [UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

// Prevent path traversal: resolve and ensure the path stays inside base.
export function safeJoin(base: string, name: string): string {
  const resolved = path.resolve(base, path.basename(name));
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error('Invalid path');
  }
  return resolved;
}
