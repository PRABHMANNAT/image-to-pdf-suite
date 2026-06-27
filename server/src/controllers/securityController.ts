import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  QpdfBadPasswordError,
  QpdfMissingError,
  protectPdf,
  unlockPdf,
} from '../services/qpdfService';
import { removeFiles } from '../services/cleanupService';

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

function statusForError(e: unknown): { status: number; code: string; message: string } {
  if (e instanceof QpdfMissingError) return { status: 503, code: 'QPDF_MISSING', message: e.message };
  if (e instanceof QpdfBadPasswordError) return { status: 400, code: 'QPDF_BAD_PASSWORD', message: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  return { status: 500, code: 'OPERATION_FAILED', message: msg };
}

export async function protect(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const userPassword = String(req.body?.userPassword || '');
  if (!userPassword) {
    removeFiles([file.path]);
    return res.status(400).json({ error: 'userPassword is required' });
  }
  const ownerPassword = req.body?.ownerPassword ? String(req.body.ownerPassword) : undefined;
  const allowPrint = req.body?.allowPrint !== 'false';
  const allowModify = req.body?.allowModify !== 'false';
  const allowCopy = req.body?.allowCopy !== 'false';

  try {
    const out = await protectPdf(file.path, {
      userPassword,
      ownerPassword,
      allowPrint,
      allowModify,
      allowCopy,
    });
    const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.protected.pdf';
    return downloadAndCleanup(res, out, downloadName, file.path);
  } catch (e: unknown) {
    removeFiles([file.path]);
    const info = statusForError(e);
    return res.status(info.status).json({ error: info.message, code: info.code });
  }
}

export async function unlock(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const password = String(req.body?.password || '');

  try {
    const out = await unlockPdf(file.path, password);
    const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.unlocked.pdf';
    return downloadAndCleanup(res, out, downloadName, file.path);
  } catch (e: unknown) {
    removeFiles([file.path]);
    const info = statusForError(e);
    return res.status(info.status).json({ error: info.message, code: info.code });
  }
}
