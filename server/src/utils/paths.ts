import path from 'path';
import fs from 'fs';

// On Vercel (and other read-only serverless environments) the only writable
// location is /tmp.  Locally we keep files next to the server root.
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const FILE_ROOT = IS_SERVERLESS ? '/tmp' : path.resolve(__dirname, '..', '..');

export const ROOT = FILE_ROOT;
export const UPLOADS_DIR = path.join(FILE_ROOT, 'uploads');
export const OUTPUTS_DIR = path.join(FILE_ROOT, 'outputs');
export const TEMP_DIR = path.join(FILE_ROOT, 'temp');

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
