// Browser-side text extraction from a PDF using pdf.js. Used as a fallback for
// PDF→Word when the backend isn't available, and as the primary path for
// PDF→Excel's CSV output.

import { loadPdfJs } from './pdfUtils';

export interface ExtractedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedPage {
  pageNumber: number;
  items: ExtractedTextItem[];
  width: number;
  height: number;
}

export interface ExtractProgress {
  current: number;
  total: number;
  pct: number;
}

export async function extractPdfText(
  file: Blob,
  onProgress?: (info: ExtractProgress) => void,
  signal?: AbortSignal,
): Promise<ExtractedPage[]> {
  const doc = await loadPdfJs(file);
  const total = doc.numPages;
  const out: ExtractedPage[] = [];
  try {
    for (let i = 1; i <= total; i++) {
      if (signal?.aborted) throw new Error('Cancelled');
      const page = await doc.getPage(i);
      try {
        const vp = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: ExtractedTextItem[] = [];
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const txt = (item as { str: string }).str;
          if (!txt) continue;
          // pdf.js transform: [scaleX, skewY, skewX, scaleY, x, y]
          const t = (item as { transform: number[]; width: number; height: number }).transform;
          items.push({
            str: txt,
            x: t[4],
            y: t[5],
            width: (item as { width?: number }).width ?? 0,
            height: (item as { height?: number }).height ?? Math.abs(t[3] || 12),
          });
        }
        out.push({ pageNumber: i, items, width: vp.width, height: vp.height });
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

export function joinExtractedAsText(pages: ExtractedPage[]): string {
  const out: string[] = [];
  for (const page of pages) {
    out.push(`--- Page ${page.pageNumber} ---`);
    // Sort top-to-bottom (PDF y grows upward) then left-to-right, then group
    // items with very close y into single lines.
    const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
    let currentY: number | null = null;
    let line: string[] = [];
    const tolerance = 3;
    for (const item of sorted) {
      if (currentY === null || Math.abs(item.y - currentY) <= tolerance) {
        currentY = currentY ?? item.y;
        line.push(item.str);
      } else {
        out.push(line.join(' ').trim());
        line = [item.str];
        currentY = item.y;
      }
    }
    if (line.length) out.push(line.join(' ').trim());
    out.push('');
  }
  return out.join('\n');
}

/** Encode a 2D array as CSV with RFC-4180 quoting. */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
          return cell;
        })
        .join(','),
    )
    .join('\n');
}

/**
 * Heuristic table extraction: group items into rows by Y proximity, then
 * cluster X positions into columns. Returns one CSV per page joined with a
 * blank line between pages.
 */
export function pagesToCsv(pages: ExtractedPage[], rowTolerance = 4, colTolerance = 8): string {
  const all: string[] = [];
  for (const page of pages) {
    // Group by row (close Y).
    const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; items: ExtractedTextItem[] }[] = [];
    for (const item of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - item.y) <= rowTolerance) {
        last.items.push(item);
      } else {
        rows.push({ y: item.y, items: [item] });
      }
    }

    // Determine column boundaries by clustering all item X positions.
    const xs = sorted.map((s) => s.x).sort((a, b) => a - b);
    const cols: number[] = [];
    for (const x of xs) {
      if (!cols.length || x - cols[cols.length - 1] > colTolerance) cols.push(x);
    }
    if (!cols.length) cols.push(0);

    const csvRows: string[][] = rows.map((row) => {
      const cells: string[] = cols.map(() => '');
      const sortedRow = [...row.items].sort((a, b) => a.x - b.x);
      for (const item of sortedRow) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < cols.length; i++) {
          const d = Math.abs(item.x - cols[i]);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        cells[bestIdx] = cells[bestIdx] ? `${cells[bestIdx]} ${item.str}` : item.str;
      }
      return cells.map((c) => c.trim());
    });

    all.push(`# Page ${page.pageNumber}`);
    all.push(toCsv(csvRows));
    all.push('');
  }
  return all.join('\n');
}
