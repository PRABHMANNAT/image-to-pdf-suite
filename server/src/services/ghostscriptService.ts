// Ghostscript wrapper — used by the PDF/A conversion route.
//
// SETUP — install Ghostscript on the server:
//   * Debian/Ubuntu: apt-get install -y ghostscript
//   * macOS:         brew install ghostscript
//   * Windows:       https://www.ghostscript.com/releases/gsdnld.html
//                    (the installer places `gswin64c.exe` under Program Files)
//   * Docker:        `RUN apt-get install -y ghostscript`
//
// Just like LibreOffice, this binary is impractical on serverless environments.
// Run on a real VM / container.
//
// SECURITY — every conversion uses a fresh TEMP_DIR/gs-<rand> work directory
// and the controller wipes it after the response finishes.

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { TEMP_DIR } from '../utils/paths';

const POSIX_CANDIDATES = ['gs', '/usr/bin/gs', '/usr/local/bin/gs', '/opt/homebrew/bin/gs'];
const WIN_CANDIDATES = [
  'gswin64c',
  'gswin64c.exe',
  'gswin32c',
  'gswin32c.exe',
  'C:\\Program Files\\gs\\gs10.04.0\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.03.1\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe',
];

export interface GsCapability {
  available: boolean;
  binary?: string;
  version?: string;
}

let cached: GsCapability | null = null;

function runCmd(bin: string, args: string[], timeoutMs = 10_000): Promise<{ code: number; stdout: string; stderr: string }> {
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

export async function checkGhostscript(force = false): Promise<GsCapability> {
  if (cached && !force) return cached;
  const candidates = process.platform === 'win32' ? WIN_CANDIDATES : POSIX_CANDIDATES;
  for (const bin of candidates) {
    const { code, stdout } = await runCmd(bin, ['--version']);
    if (code === 0 && /^\d+\.\d+/.test(stdout.trim())) {
      cached = { available: true, binary: bin, version: stdout.trim() };
      return cached;
    }
  }
  cached = { available: false };
  return cached;
}

export class GhostscriptMissingError extends Error {
  code = 'GHOSTSCRIPT_MISSING' as const;
  constructor() {
    super(
      'Ghostscript is not installed on this server. See server/src/services/ghostscriptService.ts for setup instructions.',
    );
  }
}

export type PdfALevel = '1b' | '2b' | '3b';

const LEVEL_TO_PDFA = { '1b': 1, '2b': 2, '3b': 3 } as const;

/**
 * Convert a regular PDF into a PDF/A using Ghostscript. Returns the produced
 * file path inside a fresh work directory.
 */
export async function convertToPdfA(inputPath: string, level: PdfALevel = '2b'): Promise<string> {
  const cap = await checkGhostscript();
  if (!cap.available) throw new GhostscriptMissingError();

  const workDir = path.join(TEMP_DIR, `gs-${crypto.randomBytes(6).toString('hex')}`);
  await fs.mkdir(workDir, { recursive: true });
  const outPath = path.join(workDir, path.basename(inputPath, path.extname(inputPath)) + `.pdfa.pdf`);

  const { code, stderr } = await runCmd(
    cap.binary!,
    [
      `-dPDFA=${LEVEL_TO_PDFA[level]}`,
      '-dBATCH',
      '-dNOPAUSE',
      '-dNOOUTERSAVE',
      '-sProcessColorModel=DeviceRGB',
      '-sDEVICE=pdfwrite',
      '-sPDFACompatibilityPolicy=1',
      `-sOutputFile=${outPath}`,
      inputPath,
    ],
    180_000,
  );

  if (code !== 0) {
    throw new Error(`Ghostscript failed (exit ${code}): ${stderr.trim() || 'no stderr output'}`);
  }
  await fs.access(outPath);
  return outPath;
}
