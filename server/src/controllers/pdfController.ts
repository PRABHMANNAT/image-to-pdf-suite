import { Request, Response } from 'express';
import {
  pdfMetadata,
  mergePdfs,
  splitPdf,
  extractPages,
  removePages,
  reorderPages,
  rotatePages,
  zipFiles,
  SplitMode,
} from '../services/pdfService';
import { parsePageRange } from '../utils/pageRange';
import { removeFiles } from '../services/cleanupService';

export async function metadata(req: Request, res: Response) {
  const files = (req.files as Express.Multer.File[]) || [];
  try {
    const out = await Promise.all(files.map((f) => pdfMetadata(f.path, f.originalname)));
    res.json({ files: out });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  } finally {
    removeFiles(files.map((f) => f.path));
  }
}

export async function merge(req: Request, res: Response) {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length < 2) return res.status(400).json({ error: 'Need at least 2 PDFs' });
  try {
    let ordered = files;
    if (req.body.order) {
      const idx = String(req.body.order).split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
      ordered = idx.map((i) => files[i]).filter(Boolean);
      if (!ordered.length) ordered = files;
    }
    const out = await mergePdfs(ordered.map((f) => f.path));
    res.download(out, 'merged.pdf', () => removeFiles([out, ...files.map((f) => f.path)]));
  } catch (e: any) {
    removeFiles(files.map((f) => f.path));
    res.status(500).json({ error: e.message });
  }
}

export async function split(req: Request, res: Response) {
  const file = req.file as Express.Multer.File;
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    const kind = (req.body.kind as string) || 'each';
    const { pdfMetadata } = await import('../services/pdfService');
    const info = await pdfMetadata(file.path, file.originalname);
    let mode: SplitMode;
    if (kind === 'each') mode = { kind: 'each' };
    else if (kind === 'range') mode = { kind: 'range', pages: parsePageRange(req.body.range || '', info.pageCount) };
    else if (kind === 'chunks') mode = { kind: 'chunks', size: Math.max(1, Number(req.body.size || 1)) };
    else throw new Error('Unknown split kind');

    const outs = await splitPdf(file.path, mode);
    if (outs.length === 1) {
      res.download(outs[0], 'split.pdf', () => removeFiles([...outs, file.path]));
    } else {
      const zip = await zipFiles(outs);
      res.download(zip, 'split.zip', () => removeFiles([zip, ...outs, file.path]));
    }
  } catch (e: any) {
    removeFiles([file.path]);
    res.status(400).json({ error: e.message });
  }
}

export async function extract(req: Request, res: Response) {
  const file = req.file as Express.Multer.File;
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    const info = await pdfMetadata(file.path, file.originalname);
    const pages = parsePageRange(req.body.range || '', info.pageCount);
    if (!pages.length) throw new Error('No valid pages');
    const out = await extractPages(file.path, pages);
    res.download(out, 'extracted.pdf', () => removeFiles([out, file.path]));
  } catch (e: any) {
    removeFiles([file.path]);
    res.status(400).json({ error: e.message });
  }
}

export async function removePagesCtrl(req: Request, res: Response) {
  const file = req.file as Express.Multer.File;
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    const info = await pdfMetadata(file.path, file.originalname);
    const pages = parsePageRange(req.body.range || '', info.pageCount);
    const out = await removePages(file.path, pages);
    res.download(out, 'edited.pdf', () => removeFiles([out, file.path]));
  } catch (e: any) {
    removeFiles([file.path]);
    res.status(400).json({ error: e.message });
  }
}

export async function reorder(req: Request, res: Response) {
  const file = req.file as Express.Multer.File;
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    const order = String(req.body.order || '')
      .split(',')
      .map((n) => parseInt(n, 10) - 1)
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (!order.length) throw new Error('Order required');
    const out = await reorderPages(file.path, order);
    res.download(out, 'reordered.pdf', () => removeFiles([out, file.path]));
  } catch (e: any) {
    removeFiles([file.path]);
    res.status(400).json({ error: e.message });
  }
}

export async function rotateCtrl(req: Request, res: Response) {
  const file = req.file as Express.Multer.File;
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    const info = await pdfMetadata(file.path, file.originalname);
    const pages = req.body.range
      ? parsePageRange(req.body.range, info.pageCount)
      : Array.from({ length: info.pageCount }, (_, i) => i);
    const angle = Number(req.body.angle || 90);
    const out = await rotatePages(file.path, pages, angle);
    res.download(out, 'rotated.pdf', () => removeFiles([out, file.path]));
  } catch (e: any) {
    removeFiles([file.path]);
    res.status(400).json({ error: e.message });
  }
}
