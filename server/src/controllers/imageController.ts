import { Request, Response } from 'express';
import fs from 'fs';
import {
  readMetadata,
  imagesToPdf,
  cropImage,
  rotateImage,
  ImageToPdfOptions,
  PageLayout,
  FitMode,
} from '../services/imageService';
import { removeFiles } from '../services/cleanupService';

export async function metadata(req: Request, res: Response) {
  const files = (req.files as Express.Multer.File[]) || [];
  try {
    const out = await Promise.all(files.map((f) => readMetadata(f.path, f.originalname)));
    res.json({ files: out });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  } finally {
    removeFiles(files.map((f) => f.path));
  }
}

export async function toPdf(req: Request, res: Response) {
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) return res.status(400).json({ error: 'No files uploaded' });
  try {
    const opts: ImageToPdfOptions = {
      layout: (req.body.layout as PageLayout) || 'image',
      customWidth: req.body.customWidth ? Number(req.body.customWidth) : undefined,
      customHeight: req.body.customHeight ? Number(req.body.customHeight) : undefined,
      fit: (req.body.fit as FitMode) || 'fit',
      marginMm: req.body.marginMm ? Number(req.body.marginMm) : 0,
      background: req.body.background || '#ffffff',
      jpegQuality: req.body.jpegQuality ? Number(req.body.jpegQuality) : 100,
    };
    // Honor caller-specified ordering via "order" (comma-separated indices into the uploaded array).
    let ordered = files;
    if (req.body.order) {
      const idx = String(req.body.order).split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
      ordered = idx.map((i) => files[i]).filter(Boolean);
      if (!ordered.length) ordered = files;
    }
    const out = await imagesToPdf(
      ordered.map((f) => ({ path: f.path, originalname: f.originalname })),
      opts,
    );
    res.download(out, 'images.pdf', () => {
      removeFiles([out, ...files.map((f) => f.path)]);
    });
  } catch (e: any) {
    removeFiles(files.map((f) => f.path));
    res.status(500).json({ error: e.message });
  }
}

export async function crop(req: Request, res: Response) {
  const file = (req.file as Express.Multer.File) || (req.files as Express.Multer.File[])?.[0];
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    const region = {
      left: Math.round(Number(req.body.left || 0)),
      top: Math.round(Number(req.body.top || 0)),
      width: Math.round(Number(req.body.width || 0)),
      height: Math.round(Number(req.body.height || 0)),
    };
    if (region.width <= 0 || region.height <= 0) throw new Error('Invalid crop region');
    const output = (req.body.format as 'png' | 'jpeg' | 'webp') || 'png';
    const quality = req.body.quality ? Number(req.body.quality) : 100;
    const { buffer, ext, mime } = await cropImage(file.path, region, output, quality);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="cropped.${ext}"`);
    res.send(buffer);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  } finally {
    removeFiles([file.path]);
  }
}

export async function batchCrop(req: Request, res: Response) {
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) return res.status(400).json({ error: 'No files' });
  try {
    const region = {
      left: Math.round(Number(req.body.left || 0)),
      top: Math.round(Number(req.body.top || 0)),
      width: Math.round(Number(req.body.width || 0)),
      height: Math.round(Number(req.body.height || 0)),
    };
    if (region.width <= 0 || region.height <= 0) throw new Error('Invalid crop region');
    const output = (req.body.format as 'png' | 'jpeg' | 'webp') || 'png';
    const quality = req.body.quality ? Number(req.body.quality) : 100;
    const { zipFiles } = await import('../services/pdfService');
    const fsx = await import('fs');
    const path = await import('path');
    const { OUTPUTS_DIR } = await import('../utils/paths');
    const written: string[] = [];
    for (const f of files) {
      const { buffer, ext } = await cropImage(f.path, region, output, quality);
      const out = path.join(OUTPUTS_DIR, `${path.parse(f.originalname).name}-cropped.${ext}`);
      fsx.writeFileSync(out, buffer);
      written.push(out);
    }
    const zip = await zipFiles(written);
    res.download(zip, 'cropped.zip', () => {
      removeFiles([zip, ...written, ...files.map((f) => f.path)]);
    });
  } catch (e: any) {
    removeFiles(files.map((f) => f.path));
    res.status(400).json({ error: e.message });
  }
}

export async function rotate(req: Request, res: Response) {
  const file = req.file as Express.Multer.File;
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    const angle = Number(req.body.angle || 0);
    const flipH = req.body.flipH === 'true' || req.body.flipH === true;
    const flipV = req.body.flipV === 'true' || req.body.flipV === true;
    const buf = await rotateImage(file.path, angle, flipH, flipV);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'attachment; filename="rotated.png"');
    res.send(buf);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  } finally {
    removeFiles([file.path]);
  }
}
