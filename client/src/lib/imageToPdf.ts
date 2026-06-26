// Browser-side Image → PDF generator built on pdf-lib. Used by both the
// "Image to PDF" / "JPG to PDF" tool and the "Scan to PDF" pipeline.

import { PDFDocument, PDFImage, rgb } from 'pdf-lib';
import {
  MM_TO_PT,
  PageOrientation,
  PageSizeId,
  PAGE_SIZES_MM,
} from './constants';
import { imageFileToCanvas, readImageDimensions } from './imageUtils';

export type FitMode = 'contain' | 'cover' | 'stretch' | 'actual';

export type LayoutMode = 'single' | '2x1' | '1x2' | '2x2' | '3x3';

export interface ImageToPdfOptions {
  pageSize: PageSizeId;
  orientation: PageOrientation | 'auto';
  customWidthMm?: number;
  customHeightMm?: number;
  marginMm: number;
  fit: FitMode;
  backgroundHex: string;
  /** 1-100. Used only when an image must be re-encoded (e.g. WEBP/TIFF). */
  jpegQuality: number;
  layout: LayoutMode;
}

export interface ProgressInfo {
  stage: 'reading' | 'embedding' | 'saving';
  pct: number;
  message?: string;
}

interface NormalisedImage {
  bytes: Uint8Array;
  kind: 'jpg' | 'png';
  width: number;
  height: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return { r: 1, g: 1, b: 1 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function layoutDims(layout: LayoutMode): { cols: number; rows: number } {
  switch (layout) {
    case '2x1':
      return { cols: 2, rows: 1 };
    case '1x2':
      return { cols: 1, rows: 2 };
    case '2x2':
      return { cols: 2, rows: 2 };
    case '3x3':
      return { cols: 3, rows: 3 };
    default:
      return { cols: 1, rows: 1 };
  }
}

async function normaliseImage(file: File, jpegQuality: number): Promise<NormalisedImage> {
  // Use raw bytes for formats pdf-lib supports natively — preserves quality.
  if (file.type === 'image/jpeg') {
    const buf = await file.arrayBuffer();
    const dims = await readImageDimensions(file);
    return { bytes: new Uint8Array(buf), kind: 'jpg', width: dims.width, height: dims.height };
  }
  if (file.type === 'image/png') {
    const buf = await file.arrayBuffer();
    const dims = await readImageDimensions(file);
    return { bytes: new Uint8Array(buf), kind: 'png', width: dims.width, height: dims.height };
  }
  // Everything else (webp/tiff/bmp/gif) is re-encoded via canvas.
  const canvas = await imageFileToCanvas(file);
  const url = canvas.toDataURL('image/jpeg', Math.max(0.1, Math.min(1, jpegQuality / 100)));
  const base64 = url.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, kind: 'jpg', width: canvas.width, height: canvas.height };
}

function resolvedPageSizePt(
  opts: ImageToPdfOptions,
  firstImage: { width: number; height: number },
): { width: number; height: number } {
  let widthMm: number;
  let heightMm: number;
  if (opts.pageSize === 'image') {
    // 1 px = 1 pt for image-size pages (preserves dimensions).
    const auto = opts.orientation === 'auto';
    const portrait = auto ? firstImage.height >= firstImage.width : opts.orientation === 'portrait';
    return portrait
      ? { width: firstImage.width, height: firstImage.height }
      : { width: firstImage.height, height: firstImage.width };
  }
  if (opts.pageSize === 'custom') {
    widthMm = opts.customWidthMm || 210;
    heightMm = opts.customHeightMm || 297;
  } else {
    const dims = PAGE_SIZES_MM[opts.pageSize];
    widthMm = dims.width;
    heightMm = dims.height;
  }
  const portrait =
    opts.orientation === 'portrait' ||
    (opts.orientation === 'auto' && firstImage.height >= firstImage.width);
  const wPt = widthMm * MM_TO_PT;
  const hPt = heightMm * MM_TO_PT;
  return portrait ? { width: wPt, height: hPt } : { width: hPt, height: wPt };
}

function fitInside(
  imgW: number,
  imgH: number,
  cellW: number,
  cellH: number,
  fit: FitMode,
): { width: number; height: number } {
  if (fit === 'stretch') return { width: cellW, height: cellH };
  if (fit === 'actual') return { width: imgW, height: imgH };
  const scale =
    fit === 'cover'
      ? Math.max(cellW / imgW, cellH / imgH)
      : Math.min(cellW / imgW, cellH / imgH);
  return { width: imgW * scale, height: imgH * scale };
}

export async function generatePdfFromImages(
  files: File[],
  opts: ImageToPdfOptions,
  onProgress?: (info: ProgressInfo) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!files.length) throw new Error('No images provided');
  const pdf = await PDFDocument.create();
  const bg = hexToRgb(opts.backgroundHex);
  const { cols, rows } = layoutDims(opts.layout);
  const perPage = cols * rows;

  // Normalise all images up-front so resolvedPageSizePt has true dimensions.
  const normalised: NormalisedImage[] = [];
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    onProgress?.({ stage: 'reading', pct: Math.round((i / files.length) * 50), message: `Reading ${i + 1}/${files.length}` });
    normalised.push(await normaliseImage(files[i], opts.jpegQuality));
  }

  const marginPt = opts.marginMm * MM_TO_PT;
  const pageDims = resolvedPageSizePt(opts, normalised[0]);

  for (let pageStart = 0; pageStart < normalised.length; pageStart += perPage) {
    if (signal?.aborted) throw new Error('Cancelled');
    const page = pdf.addPage([pageDims.width, pageDims.height]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageDims.width,
      height: pageDims.height,
      color: rgb(bg.r, bg.g, bg.b),
    });

    const innerW = Math.max(1, pageDims.width - marginPt * 2);
    const innerH = Math.max(1, pageDims.height - marginPt * 2);
    const cellW = innerW / cols;
    const cellH = innerH / rows;

    for (let slot = 0; slot < perPage; slot++) {
      const idx = pageStart + slot;
      if (idx >= normalised.length) break;
      const item = normalised[idx];
      onProgress?.({
        stage: 'embedding',
        pct: 50 + Math.round(((idx + 1) / normalised.length) * 50),
        message: `Placing image ${idx + 1}/${normalised.length}`,
      });
      let embedded: PDFImage;
      if (item.kind === 'jpg') embedded = await pdf.embedJpg(item.bytes);
      else embedded = await pdf.embedPng(item.bytes);

      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const cellX = marginPt + col * cellW;
      // PDF coordinates origin is bottom-left.
      const cellY = pageDims.height - marginPt - (row + 1) * cellH;

      const { width: drawW, height: drawH } = fitInside(item.width, item.height, cellW, cellH, opts.fit);
      const x = cellX + (cellW - drawW) / 2;
      const y = cellY + (cellH - drawH) / 2;
      page.drawImage(embedded, { x, y, width: drawW, height: drawH });
    }
  }

  onProgress?.({ stage: 'saving', pct: 100, message: 'Finalising PDF' });
  const bytes = await pdf.save({ useObjectStreams: true });
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}
