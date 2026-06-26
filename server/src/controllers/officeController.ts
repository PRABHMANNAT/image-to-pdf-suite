import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  LibreOfficeMissingError,
  convertOfficeToPdf,
} from '../services/officeService';
import { removeFiles } from '../services/cleanupService';

export async function convert(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  let outPath: string | null = null;
  let workDir: string | null = null;
  try {
    outPath = await convertOfficeToPdf(file.path);
    workDir = path.dirname(outPath);
    const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.pdf';
    res.download(outPath, downloadName, () => {
      // Cleanup after the response finishes streaming.
      try {
        if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      removeFiles([file.path]);
    });
  } catch (e: unknown) {
    if (workDir) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    removeFiles([file.path]);
    if (e instanceof LibreOfficeMissingError) {
      return res
        .status(503)
        .json({ error: e.message, code: 'LIBREOFFICE_MISSING' });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg, code: 'CONVERSION_FAILED' });
  }
}
