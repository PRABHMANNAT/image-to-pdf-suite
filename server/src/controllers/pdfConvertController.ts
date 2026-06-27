import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  LibreOfficeMissingError,
  convertWithLibreOffice,
} from '../services/officeService';
import {
  GhostscriptMissingError,
  PdfALevel,
  convertToPdfA,
} from '../services/ghostscriptService';
import { removeFiles } from '../services/cleanupService';

const LIBRE_TARGETS = new Set(['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'rtf']);

function downloadAndCleanup(
  res: Response,
  filePath: string,
  downloadName: string,
  uploadPath: string,
): void {
  const workDir = path.dirname(filePath);
  res.download(filePath, downloadName, () => {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    removeFiles([uploadPath]);
  });
}

export async function convert(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  const target = String(req.params.target || '').toLowerCase();
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    if (target === 'pdfa') {
      const level = (String(req.body?.level || '2b') as PdfALevel);
      const out = await convertToPdfA(file.path, level);
      const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.pdfa.pdf';
      return downloadAndCleanup(res, out, downloadName, file.path);
    }
    if (LIBRE_TARGETS.has(target)) {
      const out = await convertWithLibreOffice(file.path, target);
      const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.' + target;
      return downloadAndCleanup(res, out, downloadName, file.path);
    }
    removeFiles([file.path]);
    return res.status(400).json({ error: `Unsupported conversion target: ${target}` });
  } catch (e: unknown) {
    removeFiles([file.path]);
    if (e instanceof LibreOfficeMissingError) {
      return res.status(503).json({ error: e.message, code: 'LIBREOFFICE_MISSING' });
    }
    if (e instanceof GhostscriptMissingError) {
      return res.status(503).json({ error: e.message, code: 'GHOSTSCRIPT_MISSING' });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg, code: 'CONVERSION_FAILED' });
  }
}
