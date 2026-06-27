// qpdf wrapper — provides real PDF encryption / decryption with permissions.
//
// SETUP — install qpdf on the server:
//   * Debian/Ubuntu: apt-get install -y qpdf
//   * macOS:         brew install qpdf
//   * Windows:       https://github.com/qpdf/qpdf/releases  (installer puts
//                    qpdf.exe under Program Files)
//   * Docker:        `RUN apt-get install -y qpdf`
//
// pdf-lib intentionally does NOT support encryption (upstream issue #3) so
// this is the only path to actually password-protect or fully decrypt a PDF
// without rasterisation. The browser tools fall back to a pdf.js rasterise
// rebuild when qpdf is unavailable, with an honest warning to the user.
//
// SECURITY — input + output live in a per-run TEMP_DIR/qpdf-<rand> directory
// that the controller wipes after the response finishes. Passwords arrive in
// the request body and are passed to qpdf via stdin or argv (qpdf accepts
// either; argv is simpler here, and the work directory is private to the
// server process).

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { TEMP_DIR } from '../utils/paths';

const POSIX_CANDIDATES = ['qpdf', '/usr/bin/qpdf', '/usr/local/bin/qpdf', '/opt/homebrew/bin/qpdf'];
const WIN_CANDIDATES = [
  'qpdf',
  'qpdf.exe',
  'C:\\Program Files\\qpdf\\bin\\qpdf.exe',
  'C:\\Program Files (x86)\\qpdf\\bin\\qpdf.exe',
];

export interface QpdfCapability {
  available: boolean;
  binary?: string;
  version?: string;
}

let cached: QpdfCapability | null = null;

function runCmd(
  bin: string,
  args: string[],
  timeoutMs = 10_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export async function checkQpdf(force = false): Promise<QpdfCapability> {
  if (cached && !force) return cached;
  const candidates = process.platform === 'win32' ? WIN_CANDIDATES : POSIX_CANDIDATES;
  for (const bin of candidates) {
    const { code, stdout } = await runCmd(bin, ['--version']);
    if (code === 0 && /qpdf version/i.test(stdout)) {
      cached = { available: true, binary: bin, version: stdout.trim().split('\n')[0] };
      return cached;
    }
  }
  cached = { available: false };
  return cached;
}

export class QpdfMissingError extends Error {
  code = 'QPDF_MISSING' as const;
  constructor() {
    super(
      'qpdf is not installed on this server. See server/src/services/qpdfService.ts for setup instructions.',
    );
  }
}

export class QpdfBadPasswordError extends Error {
  code = 'QPDF_BAD_PASSWORD' as const;
  constructor() {
    super('The provided password is incorrect for this PDF.');
  }
}

export interface ProtectOptions {
  userPassword: string;
  ownerPassword?: string;
  /** When false → --print=none, otherwise --print=full. */
  allowPrint?: boolean;
  /** When false → --modify=none, otherwise --modify=all. */
  allowModify?: boolean;
  /** When false → --extract=n (no copy/text extraction), otherwise --extract=y. */
  allowCopy?: boolean;
}

async function makeWork(prefix: string): Promise<string> {
  const dir = path.join(TEMP_DIR, `${prefix}-${crypto.randomBytes(6).toString('hex')}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function protectPdf(inputPath: string, opts: ProtectOptions): Promise<string> {
  const cap = await checkQpdf();
  if (!cap.available) throw new QpdfMissingError();
  const workDir = await makeWork('qpdf');
  const outPath = path.join(
    workDir,
    path.basename(inputPath, path.extname(inputPath)) + '.protected.pdf',
  );

  const owner = opts.ownerPassword || opts.userPassword;
  const args = [
    '--encrypt',
    opts.userPassword,
    owner,
    '256',
    `--print=${opts.allowPrint === false ? 'none' : 'full'}`,
    `--modify=${opts.allowModify === false ? 'none' : 'all'}`,
    `--extract=${opts.allowCopy === false ? 'n' : 'y'}`,
    '--',
    inputPath,
    outPath,
  ];
  const { code, stderr } = await runCmd(cap.binary!, args, 120_000);
  if (code !== 0) {
    throw new Error(`qpdf encrypt failed (exit ${code}): ${stderr.trim() || 'no stderr output'}`);
  }
  await fs.access(outPath);
  return outPath;
}

export async function unlockPdf(inputPath: string, password: string): Promise<string> {
  const cap = await checkQpdf();
  if (!cap.available) throw new QpdfMissingError();
  const workDir = await makeWork('qpdf');
  const outPath = path.join(
    workDir,
    path.basename(inputPath, path.extname(inputPath)) + '.unlocked.pdf',
  );
  const { code, stderr } = await runCmd(
    cap.binary!,
    ['--decrypt', `--password=${password}`, inputPath, outPath],
    120_000,
  );
  if (code !== 0) {
    // qpdf returns exit code 2 for "PDF could not be opened" which is the
    // wrong-password case. Treat anything mentioning "password" or
    // "incorrect password" as a bad-password error.
    if (/password/i.test(stderr)) throw new QpdfBadPasswordError();
    throw new Error(`qpdf decrypt failed (exit ${code}): ${stderr.trim() || 'no stderr output'}`);
  }
  await fs.access(outPath);
  return outPath;
}
