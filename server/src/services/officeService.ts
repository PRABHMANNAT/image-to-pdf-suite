// LibreOffice headless wrapper.
//
// SETUP — install LibreOffice on the machine that runs this server:
//   * Debian/Ubuntu: apt-get install -y libreoffice
//   * macOS:         brew install --cask libreoffice
//   * Windows:       https://www.libreoffice.org/download/  (the installer
//                    puts soffice.com under "C:\Program Files\LibreOffice\
//                    program\")
//   * Docker base:   `FROM ubuntu:22.04` + `RUN apt-get update && apt-get
//                    install -y libreoffice fonts-liberation`
//
// Once installed, this service auto-detects it via `soffice --version` (and
// a Windows-specific fallback path). No env vars required.
//
// SECURITY — every conversion uses a freshly-created work directory inside
// TEMP_DIR. Input file, work dir, and output are all deleted by the
// controller after the download completes (or fails). Filenames are
// sanitised at upload time (see routes/office.ts).
//
// NOTE — LibreOffice on Vercel / AWS Lambda is impractical (binary is huge,
// no persistent FS for the unpacked profile). Run this part on a real VM,
// container, or Fly.io machine instead. The frontend gracefully degrades
// via /api/capabilities.

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { TEMP_DIR } from '../utils/paths';

const WIN_CANDIDATES = [
  'soffice',
  'soffice.com',
  'soffice.exe',
  'libreoffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.com',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
];

const POSIX_CANDIDATES = [
  'soffice',
  'libreoffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/opt/libreoffice/program/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
];

export interface OfficeCapability {
  available: boolean;
  binary?: string;
  version?: string;
}

let cached: OfficeCapability | null = null;

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

export async function checkLibreOffice(force = false): Promise<OfficeCapability> {
  if (cached && !force) return cached;
  const candidates = process.platform === 'win32' ? WIN_CANDIDATES : POSIX_CANDIDATES;
  for (const bin of candidates) {
    const { code, stdout } = await runCmd(bin, ['--version']);
    if (code === 0 && /LibreOffice/i.test(stdout)) {
      cached = { available: true, binary: bin, version: stdout.trim() };
      return cached;
    }
  }
  cached = { available: false };
  return cached;
}

export class LibreOfficeMissingError extends Error {
  code = 'LIBREOFFICE_MISSING' as const;
  constructor() {
    super(
      'LibreOffice is not installed on this server. See server/src/services/officeService.ts for setup instructions.',
    );
  }
}

/**
 * Run LibreOffice headless to convert the file at inputPath to PDF. Returns
 * the path of the produced PDF inside a fresh work directory which the caller
 * is responsible for cleaning up (use cleanupService.removeFiles).
 */
export async function convertOfficeToPdf(inputPath: string): Promise<string> {
  const cap = await checkLibreOffice();
  if (!cap.available) throw new LibreOfficeMissingError();

  const workDir = path.join(TEMP_DIR, `office-${crypto.randomBytes(6).toString('hex')}`);
  await fs.mkdir(workDir, { recursive: true });

  // LibreOffice's --headless mode also needs a per-run user profile to avoid
  // conflicting with a desktop instance. Use an isolated profile inside the
  // work directory.
  const userProfile = path.join(workDir, 'profile');
  await fs.mkdir(userProfile, { recursive: true });
  const profileUri = `-env:UserInstallation=file://${userProfile.replace(/\\/g, '/')}`;

  const { code, stderr } = await runCmd(
    cap.binary!,
    [profileUri, '--headless', '--convert-to', 'pdf', '--outdir', workDir, inputPath],
    120_000,
  );
  if (code !== 0) {
    throw new Error(`LibreOffice failed (exit ${code}): ${stderr.trim() || 'no stderr output'}`);
  }

  const baseName = path.basename(inputPath, path.extname(inputPath)) + '.pdf';
  const outPath = path.join(workDir, baseName);
  await fs.access(outPath); // throws if not produced
  return outPath;
}
