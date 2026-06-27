import path from 'path';
import {
  EngineCapability,
  assertFile,
  detectBinary,
  makeEngineWorkDir,
  runEngineCommand,
} from './backendEngine';

const OCRMY_PDF_POSIX = ['ocrmypdf', '/usr/bin/ocrmypdf', '/usr/local/bin/ocrmypdf', '/opt/homebrew/bin/ocrmypdf'];
const OCRMY_PDF_WIN = ['ocrmypdf', 'ocrmypdf.exe'];
const TESSERACT_POSIX = ['tesseract', '/usr/bin/tesseract', '/usr/local/bin/tesseract', '/opt/homebrew/bin/tesseract'];
const TESSERACT_WIN = [
  'tesseract',
  'tesseract.exe',
  'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
];

export interface OcrCapability extends EngineCapability {
  ocrmypdf?: EngineCapability;
  tesseract?: EngineCapability;
}

let cached: OcrCapability | null = null;

export async function checkOcrBackend(force = false): Promise<OcrCapability> {
  if (cached && !force) return cached;
  const isWin = process.platform === 'win32';
  const ocrmypdf = await detectBinary(
    isWin ? OCRMY_PDF_WIN : OCRMY_PDF_POSIX,
    ['--version'],
    (stdout) => /\d+\.\d+/.test(stdout.trim()),
  );
  const tesseract = await detectBinary(
    isWin ? TESSERACT_WIN : TESSERACT_POSIX,
    ['--version'],
    (stdout) => /tesseract/i.test(stdout),
  );
  cached = {
    available: Boolean(ocrmypdf.available),
    binary: ocrmypdf.binary || tesseract.binary,
    version: ocrmypdf.version || tesseract.version,
    ocrmypdf,
    tesseract,
  };
  return cached;
}

export class OcrBackendMissingError extends Error {
  code = 'OCR_BACKEND_MISSING' as const;
  constructor() {
    super('OCRmyPDF is not installed on this server. Install ocrmypdf and tesseract language packs.');
  }
}

export async function makeSearchablePdfWithOcrmyPdf(
  inputPath: string,
  opts: { language?: string; deskew?: boolean; forceOcr?: boolean },
): Promise<string> {
  const cap = await checkOcrBackend();
  if (!cap.ocrmypdf?.binary) throw new OcrBackendMissingError();
  const workDir = await makeEngineWorkDir('ocrmypdf');
  const outPath = path.join(workDir, path.basename(inputPath, path.extname(inputPath)) + '.ocr.pdf');
  const args = [
    '--skip-text',
    '--optimize',
    '1',
    '--language',
    opts.language || 'eng',
  ];
  if (opts.deskew !== false) args.push('--deskew');
  if (opts.forceOcr) {
    const idx = args.indexOf('--skip-text');
    if (idx >= 0) args.splice(idx, 1, '--force-ocr');
  }
  args.push(inputPath, outPath);
  const { code, stderr } = await runEngineCommand(cap.ocrmypdf.binary, args, 600_000);
  if (code !== 0) throw new Error(`OCRmyPDF failed (exit ${code}): ${stderr.trim() || 'no stderr output'}`);
  await assertFile(outPath);
  return outPath;
}
