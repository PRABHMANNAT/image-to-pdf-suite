import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { removeFiles } from '../services/cleanupService';
import {
  createBackendJob,
  getBackendJob,
  listBackendJobs,
  updateBackendJob,
} from '../services/backendEngine';
import { checkLibreOffice } from '../services/officeService';
import { checkGhostscript, compressPdfWithGhostscript, GhostscriptMissingError, GsCompressionPreset } from '../services/ghostscriptService';
import { checkQpdf, QpdfMissingError, repairPdfWithQpdf } from '../services/qpdfService';
import { checkPoppler, extractTextWithPoppler, pdfToImagesWithPoppler, PopplerImageFormat, PopplerMissingError } from '../services/popplerService';
import { checkOcrBackend, makeSearchablePdfWithOcrmyPdf, OcrBackendMissingError } from '../services/ocrBackendService';

function cleanWorkDir(filePath: string): void {
  try {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function sendDownload(res: Response, outPath: string, downloadName: string, uploadPath: string, jobId: string): void {
  updateBackendJob(jobId, { status: 'success', progress: 100, message: 'Streaming result' });
  res.setHeader('X-Job-Id', jobId);
  res.download(outPath, downloadName, () => {
    cleanWorkDir(outPath);
    removeFiles([uploadPath]);
  });
}

function fail(res: Response, e: unknown, uploadPath: string | undefined, jobId: string): Response {
  if (uploadPath) removeFiles([uploadPath]);
  const msg = e instanceof Error ? e.message : String(e);
  let status = 500;
  let code = 'BACKEND_ENGINE_FAILED';
  if (e instanceof GhostscriptMissingError) {
    status = 503;
    code = 'GHOSTSCRIPT_MISSING';
  } else if (e instanceof QpdfMissingError) {
    status = 503;
    code = 'QPDF_MISSING';
  } else if (e instanceof PopplerMissingError) {
    status = 503;
    code = 'POPPLER_MISSING';
  } else if (e instanceof OcrBackendMissingError) {
    status = 503;
    code = 'OCR_BACKEND_MISSING';
  }
  updateBackendJob(jobId, { status: 'error', progress: 100, message: 'Failed', error: msg });
  return res.status(status).json({ error: msg, code, jobId });
}

export async function capabilities(_req: Request, res: Response) {
  const [libreoffice, ghostscript, qpdf, poppler, ocr] = await Promise.all([
    checkLibreOffice(true),
    checkGhostscript(true),
    checkQpdf(true),
    checkPoppler(true),
    checkOcrBackend(true),
  ]);
  res.json({ libreoffice, ghostscript, qpdf, poppler, tesseract: ocr.tesseract || { available: false }, ocr });
}

export function jobStatus(req: Request, res: Response) {
  const job = getBackendJob(String(req.params.id || ''));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json(job);
}

export function jobs(_req: Request, res: Response) {
  res.json({ jobs: listBackendJobs().slice(0, 50) });
}

export async function compress(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  const job = createBackendJob('ghostscript-compress');
  if (!file) return res.status(400).json({ error: 'No file uploaded', jobId: job.id });
  try {
    updateBackendJob(job.id, { status: 'processing', progress: 15, message: 'Compressing with Ghostscript' });
    const preset = String(req.body?.preset || 'ebook') as GsCompressionPreset;
    const out = await compressPdfWithGhostscript(file.path, preset);
    const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.compressed.pdf';
    return sendDownload(res, out, downloadName, file.path, job.id);
  } catch (e) {
    return fail(res, e, file.path, job.id);
  }
}

export async function repair(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  const job = createBackendJob('qpdf-repair');
  if (!file) return res.status(400).json({ error: 'No file uploaded', jobId: job.id });
  try {
    updateBackendJob(job.id, { status: 'processing', progress: 20, message: 'Repairing with qpdf' });
    const out = await repairPdfWithQpdf(file.path);
    const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.repaired.pdf';
    return sendDownload(res, out, downloadName, file.path, job.id);
  } catch (e) {
    return fail(res, e, file.path, job.id);
  }
}

export async function toImages(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  const job = createBackendJob('poppler-images');
  if (!file) return res.status(400).json({ error: 'No file uploaded', jobId: job.id });
  try {
    updateBackendJob(job.id, { status: 'processing', progress: 15, message: 'Rendering pages with Poppler' });
    const format = String(req.body?.format || 'png') as PopplerImageFormat;
    const dpi = Number(req.body?.dpi || 200);
    const firstPage = req.body?.firstPage ? Number(req.body.firstPage) : undefined;
    const lastPage = req.body?.lastPage ? Number(req.body.lastPage) : undefined;
    const out = await pdfToImagesWithPoppler(file.path, { format, dpi, firstPage, lastPage });
    const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.images.zip';
    return sendDownload(res, out, downloadName, file.path, job.id);
  } catch (e) {
    return fail(res, e, file.path, job.id);
  }
}

export async function extractText(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  const job = createBackendJob('poppler-text');
  if (!file) return res.status(400).json({ error: 'No file uploaded', jobId: job.id });
  try {
    updateBackendJob(job.id, { status: 'processing', progress: 20, message: 'Extracting text with Poppler' });
    const out = await extractTextWithPoppler(file.path, req.body?.layout !== 'false');
    const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.txt';
    return sendDownload(res, out, downloadName, file.path, job.id);
  } catch (e) {
    return fail(res, e, file.path, job.id);
  }
}

export async function ocr(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  const job = createBackendJob('ocrmypdf');
  if (!file) return res.status(400).json({ error: 'No file uploaded', jobId: job.id });
  try {
    updateBackendJob(job.id, { status: 'processing', progress: 10, message: 'Running OCRmyPDF' });
    const out = await makeSearchablePdfWithOcrmyPdf(file.path, {
      language: String(req.body?.language || 'eng'),
      deskew: req.body?.deskew !== 'false',
      forceOcr: req.body?.forceOcr === 'true',
    });
    const downloadName = (file.originalname || 'document').replace(/\.[^.]+$/, '') + '.ocr.pdf';
    return sendDownload(res, out, downloadName, file.path, job.id);
  } catch (e) {
    return fail(res, e, file.path, job.id);
  }
}
