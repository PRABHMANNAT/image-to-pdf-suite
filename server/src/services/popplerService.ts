import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import fsSync from 'fs';
import {
  EngineCapability,
  assertFile,
  detectBinary,
  makeEngineWorkDir,
  runEngineCommand,
} from './backendEngine';

const POPPLER_IMAGE_POSIX = ['pdftoppm', '/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm', '/opt/homebrew/bin/pdftoppm'];
const POPPLER_TEXT_POSIX = ['pdftotext', '/usr/bin/pdftotext', '/usr/local/bin/pdftotext', '/opt/homebrew/bin/pdftotext'];
const POPPLER_IMAGE_WIN = [
  'pdftoppm',
  'pdftoppm.exe',
  'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
  'C:\\Program Files\\poppler\\bin\\pdftoppm.exe',
];
const POPPLER_TEXT_WIN = [
  'pdftotext',
  'pdftotext.exe',
  'C:\\Program Files\\poppler\\Library\\bin\\pdftotext.exe',
  'C:\\Program Files\\poppler\\bin\\pdftotext.exe',
];

export interface PopplerCapability extends EngineCapability {
  textBinary?: string;
  imageBinary?: string;
}

let cached: PopplerCapability | null = null;

export async function checkPoppler(force = false): Promise<PopplerCapability> {
  if (cached && !force) return cached;
  const isWin = process.platform === 'win32';
  const image = await detectBinary(
    isWin ? POPPLER_IMAGE_WIN : POPPLER_IMAGE_POSIX,
    ['-v'],
    (_stdout, stderr) => /pdftoppm/i.test(stderr),
  );
  const text = await detectBinary(
    isWin ? POPPLER_TEXT_WIN : POPPLER_TEXT_POSIX,
    ['-v'],
    (_stdout, stderr) => /pdftotext/i.test(stderr),
  );
  cached = {
    available: Boolean(image.available && text.available),
    binary: image.binary || text.binary,
    imageBinary: image.binary,
    textBinary: text.binary,
    version: image.version || text.version,
  };
  return cached;
}

export class PopplerMissingError extends Error {
  code = 'POPPLER_MISSING' as const;
  constructor() {
    super('Poppler is not installed on this server. Install poppler-utils and retry.');
  }
}

export type PopplerImageFormat = 'png' | 'jpg' | 'tiff';

async function zipDir(files: string[], zipPath: string): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const output = fsSync.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    for (const file of files) archive.file(file, { name: path.basename(file) });
    archive.finalize().catch(reject);
  });
  return zipPath;
}

export async function pdfToImagesWithPoppler(
  inputPath: string,
  opts: { format: PopplerImageFormat; dpi: number; firstPage?: number; lastPage?: number },
): Promise<string> {
  const cap = await checkPoppler();
  if (!cap.imageBinary) throw new PopplerMissingError();
  const workDir = await makeEngineWorkDir('poppler-img');
  const prefix = path.join(workDir, path.basename(inputPath, path.extname(inputPath)));
  const args = [
    `-r`,
    String(Math.max(36, Math.min(600, opts.dpi || 150))),
    `-${opts.format === 'jpg' ? 'jpeg' : opts.format}`,
  ];
  if (opts.firstPage) args.push('-f', String(opts.firstPage));
  if (opts.lastPage) args.push('-l', String(opts.lastPage));
  args.push(inputPath, prefix);

  const { code, stderr } = await runEngineCommand(cap.imageBinary, args, 180_000);
  if (code !== 0) throw new Error(`Poppler image export failed (exit ${code}): ${stderr.trim() || 'no stderr output'}`);
  const files = (await fs.readdir(workDir))
    .filter((name) => /\.(png|jpe?g|tiff?)$/i.test(name))
    .map((name) => path.join(workDir, name))
    .sort();
  if (!files.length) throw new Error('Poppler did not produce any images.');
  return zipDir(files, path.join(workDir, 'pdf-images.zip'));
}

export async function extractTextWithPoppler(inputPath: string, layout = true): Promise<string> {
  const cap = await checkPoppler();
  if (!cap.textBinary) throw new PopplerMissingError();
  const workDir = await makeEngineWorkDir('poppler-text');
  const outPath = path.join(workDir, path.basename(inputPath, path.extname(inputPath)) + '.txt');
  const args = ['-enc', 'UTF-8'];
  if (layout) args.push('-layout');
  args.push(inputPath, outPath);
  const { code, stderr } = await runEngineCommand(cap.textBinary, args, 120_000);
  if (code !== 0) throw new Error(`Poppler text extraction failed (exit ${code}): ${stderr.trim() || 'no stderr output'}`);
  await assertFile(outPath);
  return outPath;
}
