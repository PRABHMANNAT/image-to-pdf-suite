// Browser-side PDF compression.
//
// Capability notes — the readme/tooltip in the Compress PDF page links here:
//
//   * "Lossless"  — re-saves the PDF through pdf-lib with useObjectStreams:true.
//     Preserves text/vector content. Typical savings: 0 – 25 % depending on
//     how the source was authored.
//
//   * "Rasterise" — renders every page via pdf.js, JPEG-encodes the canvas,
//     and rebuilds the PDF from those JPEGs. The output is image-only (text
//     becomes pixels) but the compression ratio is dramatic and predictable.
//     This is the *best* result achievable without native tools.
//
// Anything beyond this — content-aware image down-sampling, font subsetting,
// stream filter rewrites — needs Ghostscript / qpdf / mutool on a backend.
// That path will be exposed when the optional backend is detected via
// /api/capabilities (Phase 6).

import { PDFDocument } from 'pdf-lib';
import { loadPdfJs, loadPdfLib, savePdfLib } from './pdfUtils';

export type CompressPreset = 'low' | 'medium' | 'high' | 'custom';

export interface CompressOptions {
  preset: CompressPreset;
  /** Force lossless re-save only (ignored when preset is "custom" and rasterise:true). */
  lossless?: boolean;
  /** Used by preset "custom" — render DPI for rasterise mode. */
  customDpi?: number;
  /** Used by preset "custom" — JPEG quality 0–1. */
  customQuality?: number;
}

export interface CompressProgress {
  stage: 'reading' | 'rendering' | 'saving';
  pct: number;
  message?: string;
}

interface RasteriseSettings {
  dpi: number;
  quality: number;
}

export const PRESET_LABEL: Record<CompressPreset, string> = {
  low: 'Low / best quality',
  medium: 'Medium',
  high: 'High / smallest',
  custom: 'Custom',
};

export const PRESET_RASTERISE: Record<Exclude<CompressPreset, 'custom'>, RasteriseSettings> = {
  low: { dpi: 200, quality: 0.92 },
  medium: { dpi: 150, quality: 0.78 },
  high: { dpi: 100, quality: 0.55 },
};

export async function compressLossless(file: Blob): Promise<Blob> {
  const doc = await loadPdfLib(file);
  return savePdfLib(doc);
}

export async function compressByRasterise(
  file: Blob,
  settings: RasteriseSettings,
  onProgress?: (info: CompressProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const pdfjs = await loadPdfJs(file);
  const out = await PDFDocument.create();
  const total = pdfjs.numPages;
  try {
    for (let i = 1; i <= total; i++) {
      if (signal?.aborted) throw new Error('Cancelled');
      const page = await pdfjs.getPage(i);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = settings.dpi / 72;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context not available');
        // Force white background — JPEG cannot encode transparency.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', settings.quality);
        const bin = atob(dataUrl.split(',')[1]);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        const img = await out.embedJpg(bytes);
        const pageOut = out.addPage([base.width, base.height]);
        pageOut.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      } finally {
        page.cleanup();
      }
      onProgress?.({
        stage: 'rendering',
        pct: Math.round((i / total) * 95),
        message: `Page ${i}/${total}`,
      });
    }
    onProgress?.({ stage: 'saving', pct: 100 });
    return savePdfLib(out);
  } finally {
    await pdfjs.destroy();
  }
}

export async function compressPdf(
  file: Blob,
  opts: CompressOptions,
  onProgress?: (info: CompressProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (opts.lossless) return compressLossless(file);
  if (opts.preset === 'custom') {
    return compressByRasterise(
      file,
      { dpi: opts.customDpi ?? 150, quality: opts.customQuality ?? 0.78 },
      onProgress,
      signal,
    );
  }
  return compressByRasterise(file, PRESET_RASTERISE[opts.preset], onProgress, signal);
}
