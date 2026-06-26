// Thin wrappers around pdfjs-dist (rendering/preview) and pdf-lib (mutation).
// Everything here runs in the browser.

import * as pdfjsLib from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist/types/src/display/api';
// Vite-specific: bundles the worker as a static asset and gives us its URL.
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';

// Configure the worker exactly once.
let workerConfigured = false;
function ensureWorker(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  workerConfigured = true;
}

export type { PDFDocumentProxy, PDFPageProxy, RenderTask };

export interface RenderPageOptions {
  scale?: number;
  rotation?: 0 | 90 | 180 | 270;
  background?: string;
}

export async function loadPdfJs(
  source: ArrayBuffer | Uint8Array | Blob,
  password?: string,
): Promise<PDFDocumentProxy> {
  ensureWorker();
  let data: ArrayBuffer;
  if (source instanceof Blob) {
    data = await source.arrayBuffer();
  } else if (source instanceof Uint8Array) {
    // Copy into a fresh ArrayBuffer because pdfjs takes ownership.
    const buf = new ArrayBuffer(source.byteLength);
    new Uint8Array(buf).set(source);
    data = buf;
  } else {
    data = source;
  }
  const task = pdfjsLib.getDocument({ data, password });
  return task.promise;
}

export async function getPdfPageCount(source: Blob | ArrayBuffer | Uint8Array): Promise<number> {
  const doc = await loadPdfJs(source);
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  opts: RenderPageOptions = {},
): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: opts.scale ?? 1.5, rotation: opts.rotation ?? 0 });
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    if (opts.background) {
      ctx.fillStyle = opts.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
    const task = page.render({ canvasContext: ctx, viewport, transform });
    await task.promise;
    return { width: viewport.width, height: viewport.height };
  } finally {
    page.cleanup();
  }
}

/**
 * Render the first page of a PDF as a data URL thumbnail. Used by FileDropzone
 * to show PDF previews alongside images.
 */
export async function renderPdfFirstPageDataUrl(
  source: Blob | ArrayBuffer | Uint8Array,
  maxEdge = 192,
): Promise<string> {
  const doc = await loadPdfJs(source);
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = maxEdge / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    return canvas.toDataURL('image/png');
  } finally {
    await doc.destroy();
  }
}

// pdf-lib helpers for mutating PDFs in the browser.
export async function loadPdfLib(source: Blob | ArrayBuffer | Uint8Array): Promise<PDFDocument> {
  const data =
    source instanceof Blob ? await source.arrayBuffer() : source instanceof Uint8Array ? source : new Uint8Array(source);
  return PDFDocument.load(data, { ignoreEncryption: true });
}

export async function savePdfLib(doc: PDFDocument): Promise<Blob> {
  const bytes = await doc.save({ useObjectStreams: true });
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}
