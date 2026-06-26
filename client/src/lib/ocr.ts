// Thin wrapper around tesseract.js. Keeps worker lifecycle + page rendering
// logic in one place so the OCR page only does presentation.

import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { loadPdfJs, savePdfLib } from './pdfUtils';

export interface OcrWord {
  text: string;
  confidence: number;
  /** Bounding box in CANVAS pixel coordinates of the rendered page. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrPage {
  pageNumber: number;
  text: string;
  words: OcrWord[];
  /** Image dimensions used during OCR — needed to rescale bboxes to PT later. */
  pixelWidth: number;
  pixelHeight: number;
  /** Native page dimensions in PT (scale=1 viewport). */
  pageWidthPt: number;
  pageHeightPt: number;
  /** Rendered page as data URL so we can embed it in a searchable PDF. */
  imageDataUrl: string;
}

export interface OcrProgress {
  stage: 'init' | 'rendering' | 'recognising' | 'finalising';
  currentPage: number;
  totalPages: number;
  pct: number;
  message?: string;
}

export interface OcrOptions {
  language: string;
  /** Render DPI. 200 is a good speed/accuracy compromise. */
  dpi?: number;
  signal?: AbortSignal;
  onProgress?: (info: OcrProgress) => void;
}

let cachedWorker: TesseractWorker | null = null;
let cachedLang: string | null = null;

async function getWorker(language: string): Promise<TesseractWorker> {
  if (cachedWorker && cachedLang === language) return cachedWorker;
  if (cachedWorker) {
    await cachedWorker.terminate();
    cachedWorker = null;
    cachedLang = null;
  }
  const worker = await createWorker(language);
  cachedWorker = worker;
  cachedLang = language;
  return worker;
}

export async function disposeOcrWorker(): Promise<void> {
  if (cachedWorker) {
    await cachedWorker.terminate();
    cachedWorker = null;
    cachedLang = null;
  }
}

export async function ocrPdf(file: Blob, opts: OcrOptions): Promise<OcrPage[]> {
  const dpi = opts.dpi ?? 200;
  const { signal, onProgress, language } = opts;

  onProgress?.({ stage: 'init', currentPage: 0, totalPages: 0, pct: 0, message: 'Loading PDF…' });
  const pdfjs = await loadPdfJs(file);
  const total = pdfjs.numPages;
  const worker = await getWorker(language);
  const results: OcrPage[] = [];

  try {
    for (let i = 1; i <= total; i++) {
      if (signal?.aborted) throw new Error('Cancelled');
      onProgress?.({
        stage: 'rendering',
        currentPage: i,
        totalPages: total,
        pct: Math.round(((i - 1) / total) * 100),
        message: `Rendering page ${i}/${total}`,
      });
      const page = await pdfjs.getPage(i);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = dpi / 72;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context not available');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        onProgress?.({
          stage: 'recognising',
          currentPage: i,
          totalPages: total,
          pct: Math.round(((i - 0.5) / total) * 100),
          message: `Recognising page ${i}/${total}`,
        });
        const recog = await worker.recognize(canvas);
        const data = recog.data as { text?: string; words?: OcrWord[] };
        results.push({
          pageNumber: i,
          text: data.text || '',
          words: (data.words || []) as OcrWord[],
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
          pageWidthPt: base.width,
          pageHeightPt: base.height,
          imageDataUrl: canvas.toDataURL('image/jpeg', 0.85),
        });
      } finally {
        page.cleanup();
      }
      onProgress?.({
        stage: 'recognising',
        currentPage: i,
        totalPages: total,
        pct: Math.round((i / total) * 100),
      });
    }
    onProgress?.({ stage: 'finalising', currentPage: total, totalPages: total, pct: 100 });
    return results;
  } finally {
    await pdfjs.destroy();
  }
}

export function joinTextWithBreaks(pages: OcrPage[]): string {
  return pages
    .map((p) => `--- Page ${p.pageNumber} ---\n${p.text.trim()}`)
    .join('\n\n');
}

/**
 * Build a searchable PDF: each page is the rendered image with an invisible
 * text layer placed at each recognised word's bbox. Most viewers will let
 * users select and search the text even though it isn't visible.
 *
 * Coordinate translation: tesseract bboxes are in canvas pixels with origin
 * at the TOP-LEFT, pdf-lib's drawText uses PT with origin at the BOTTOM-LEFT.
 */
export async function buildSearchablePdf(pages: OcrPage[]): Promise<Blob> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  for (const page of pages) {
    const dataUrl = page.imageDataUrl;
    const bin = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const img = await out.embedJpg(bytes);
    const pdfPage = out.addPage([page.pageWidthPt, page.pageHeightPt]);
    pdfPage.drawImage(img, { x: 0, y: 0, width: page.pageWidthPt, height: page.pageHeightPt });

    const scaleX = page.pageWidthPt / page.pixelWidth;
    const scaleY = page.pageHeightPt / page.pixelHeight;
    for (const w of page.words) {
      if (!w.text || w.text.trim().length === 0) continue;
      if ((w.confidence ?? 0) < 30) continue;
      const x = w.bbox.x0 * scaleX;
      // Flip Y: pdf-lib draws from baseline, so we use the bottom of the bbox
      // mapped from the canvas top-down coordinate space.
      const yBottom = page.pageHeightPt - w.bbox.y1 * scaleY;
      const heightPt = (w.bbox.y1 - w.bbox.y0) * scaleY;
      const widthPt = (w.bbox.x1 - w.bbox.x0) * scaleX;
      const size = Math.max(2, heightPt * 0.9);
      // Tweak size so the text width roughly matches the bbox — improves
      // selection rectangles in viewers.
      let drawSize = size;
      try {
        const measured = font.widthOfTextAtSize(w.text, size);
        if (measured > 0 && widthPt > 0) {
          drawSize = Math.max(2, size * (widthPt / measured));
        }
      } catch {
        /* font may not include glyph — fall back to size */
      }
      pdfPage.drawText(w.text, {
        x,
        y: yBottom,
        size: drawSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0, // invisible but searchable / selectable
      });
    }
  }
  return savePdfLib(out);
}
