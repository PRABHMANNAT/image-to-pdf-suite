import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFImage, rgb } from 'pdf-lib';
import { OUTPUTS_DIR } from '../utils/paths';
import crypto from 'crypto';

// Page sizes in PDF points (72 dpi).
const A4 = { w: 595.28, h: 841.89 };
const LETTER = { w: 612, h: 792 };
const MM_TO_PT = 72 / 25.4;

export type PageLayout =
  | 'image'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'letter-portrait'
  | 'letter-landscape'
  | 'custom';

export type FitMode = 'fit' | 'fill' | 'stretch' | 'original';

export interface ImageToPdfOptions {
  layout: PageLayout;
  customWidth?: number; // mm
  customHeight?: number; // mm
  fit: FitMode;
  marginMm: number;
  background: string; // hex like #ffffff
  jpegQuality?: number; // 1-100
}

function hexToRgb(hex: string) {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return { r: 1, g: 1, b: 1 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function pageSize(layout: PageLayout, imgW: number, imgH: number, opts: ImageToPdfOptions) {
  switch (layout) {
    case 'a4-portrait':
      return { w: A4.w, h: A4.h };
    case 'a4-landscape':
      return { w: A4.h, h: A4.w };
    case 'letter-portrait':
      return { w: LETTER.w, h: LETTER.h };
    case 'letter-landscape':
      return { w: LETTER.h, h: LETTER.w };
    case 'custom':
      return {
        w: (opts.customWidth || 210) * MM_TO_PT,
        h: (opts.customHeight || 297) * MM_TO_PT,
      };
    case 'image':
    default:
      // Use image's pixel dimensions as points so resolution is preserved 1:1.
      return { w: imgW, h: imgH };
  }
}

// Normalize an image file to a buffer pdf-lib can embed (PNG or JPEG),
// applying EXIF auto-rotation. Returns the buffer + which kind to embed.
export async function prepareImage(filePath: string, jpegQuality = 100):
  Promise<{ buffer: Buffer; kind: 'png' | 'jpg'; width: number; height: number }>
{
  const img = sharp(filePath, { failOn: 'none' }).rotate(); // EXIF auto-rotate
  const meta = await img.metadata();
  const ext = (meta.format || '').toLowerCase();
  if (ext === 'jpeg' || ext === 'jpg') {
    const buffer = await img.jpeg({ quality: jpegQuality, mozjpeg: false }).toBuffer();
    const m = await sharp(buffer).metadata();
    return { buffer, kind: 'jpg', width: m.width || 0, height: m.height || 0 };
  }
  if (ext === 'png') {
    const buffer = await img.png({ compressionLevel: 9 }).toBuffer();
    const m = await sharp(buffer).metadata();
    return { buffer, kind: 'png', width: m.width || 0, height: m.height || 0 };
  }
  // For webp/tiff/bmp/gif/etc convert to high-quality JPEG (or PNG if alpha).
  if (meta.hasAlpha) {
    const buffer = await img.png({ compressionLevel: 9 }).toBuffer();
    const m = await sharp(buffer).metadata();
    return { buffer, kind: 'png', width: m.width || 0, height: m.height || 0 };
  } else {
    const buffer = await img.jpeg({ quality: jpegQuality }).toBuffer();
    const m = await sharp(buffer).metadata();
    return { buffer, kind: 'jpg', width: m.width || 0, height: m.height || 0 };
  }
}

export async function imagesToPdf(files: { path: string; originalname: string }[], opts: ImageToPdfOptions): Promise<string> {
  const pdf = await PDFDocument.create();
  const bg = hexToRgb(opts.background || '#ffffff');
  const margin = (opts.marginMm || 0) * MM_TO_PT;

  for (const file of files) {
    const { buffer, kind, width: iw, height: ih } = await prepareImage(file.path, opts.jpegQuality ?? 100);
    let embedded: PDFImage;
    if (kind === 'jpg') embedded = await pdf.embedJpg(buffer);
    else embedded = await pdf.embedPng(buffer);

    const { w: pw, h: ph } = pageSize(opts.layout, iw, ih, opts);
    const page = pdf.addPage([pw, ph]);
    page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: rgb(bg.r, bg.g, bg.b) });

    const availW = Math.max(1, pw - margin * 2);
    const availH = Math.max(1, ph - margin * 2);

    let drawW = availW;
    let drawH = availH;
    if (opts.fit === 'fit' || opts.layout === 'image') {
      const scale = Math.min(availW / iw, availH / ih);
      drawW = iw * scale;
      drawH = ih * scale;
    } else if (opts.fit === 'fill') {
      const scale = Math.max(availW / iw, availH / ih);
      drawW = iw * scale;
      drawH = ih * scale;
    } else if (opts.fit === 'stretch') {
      drawW = availW;
      drawH = availH;
    } else if (opts.fit === 'original') {
      drawW = iw;
      drawH = ih;
    }

    const x = (pw - drawW) / 2;
    const y = (ph - drawH) / 2;
    page.drawImage(embedded, { x, y, width: drawW, height: drawH });
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  const out = path.join(OUTPUTS_DIR, `images-${crypto.randomBytes(6).toString('hex')}.pdf`);
  fs.writeFileSync(out, bytes);
  return out;
}

export async function readMetadata(filePath: string, originalname: string) {
  const stat = fs.statSync(filePath);
  const meta = await sharp(filePath, { failOn: 'none' }).rotate().metadata();
  return {
    name: originalname,
    size: stat.size,
    width: meta.width || 0,
    height: meta.height || 0,
    type: meta.format || path.extname(originalname).slice(1),
    orientation: meta.orientation,
  };
}

export async function cropImage(
  filePath: string,
  region: { left: number; top: number; width: number; height: number },
  output: 'png' | 'jpeg' | 'webp',
  quality = 100,
): Promise<{ buffer: Buffer; ext: string; mime: string }> {
  let pipeline = sharp(filePath, { failOn: 'none' }).rotate().extract(region);
  if (output === 'png') {
    return { buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(), ext: 'png', mime: 'image/png' };
  } else if (output === 'webp') {
    return { buffer: await pipeline.webp({ quality }).toBuffer(), ext: 'webp', mime: 'image/webp' };
  } else {
    return { buffer: await pipeline.jpeg({ quality }).toBuffer(), ext: 'jpg', mime: 'image/jpeg' };
  }
}

export async function rotateImage(filePath: string, angle: number, flipH = false, flipV = false): Promise<Buffer> {
  let pipeline = sharp(filePath, { failOn: 'none' }).rotate(angle, { background: '#ffffff' });
  if (flipH) pipeline = pipeline.flop();
  if (flipV) pipeline = pipeline.flip();
  return pipeline.toBuffer();
}
