// Renders the pages of a PDF into thumbnail data URLs. Used by every "visual"
// PDF tool — Split, Remove, Extract, Organize, etc.

import { loadPdfJs } from './pdfUtils';

export interface RenderedPage {
  pageNumber: number; // 1-based
  width: number;
  height: number;
  dataUrl: string;
}

export interface RenderProgress {
  current: number;
  total: number;
  pct: number;
}

export async function renderAllPagesToDataUrl(
  file: Blob,
  maxEdge = 220,
  onProgress?: (info: RenderProgress) => void,
  signal?: AbortSignal,
  password?: string,
): Promise<RenderedPage[]> {
  const doc = await loadPdfJs(file, password);
  try {
    const total = doc.numPages;
    const out: RenderedPage[] = [];
    for (let i = 1; i <= total; i++) {
      if (signal?.aborted) throw new Error('Cancelled');
      const page = await doc.getPage(i);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = maxEdge / Math.max(base.width, base.height);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context not available');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        out.push({
          pageNumber: i,
          width: vp.width,
          height: vp.height,
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        });
      } finally {
        page.cleanup();
      }
      onProgress?.({ current: i, total, pct: Math.round((i / total) * 100) });
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

export async function getPageCountSafe(file: Blob, password?: string): Promise<number> {
  const doc = await loadPdfJs(file, password);
  try {
    return doc.numPages;
  } finally {
    await doc.destroy();
  }
}
