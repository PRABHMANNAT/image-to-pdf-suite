// Browser-side HTML → PDF using html2canvas + pdf-lib.
//
// Capability ceiling — the inline notice in HtmlToPdf.tsx links here:
//   * Cross-origin images / fonts may load tainted and fail to render unless
//     they ship CORS headers. There is no way around this from a sandbox'd
//     iframe in pure JS.
//   * Complex CSS (CSS Grid + flex + transforms) renders as html2canvas
//     interprets it — not as Chromium's print engine would.
//   * For pixel-perfect output, use the optional Puppeteer-based backend
//     route (sketched in server/src/routes — TODO for a later phase).

import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { MM_TO_PT, PageSizeId, PAGE_SIZES_MM } from './constants';
import { savePdfLib } from './pdfUtils';

export interface HtmlToPdfOptions {
  pageSize: PageSizeId;
  orientation: 'portrait' | 'landscape';
  customWidthMm?: number;
  customHeightMm?: number;
  marginMm: number;
  /** html2canvas scale factor — 2 is a good default for hi-DPI output. */
  scale?: number;
  backgroundHex?: string;
}

export interface HtmlProgress {
  pct: number;
  message?: string;
}

const CSS_PX_PER_MM = 96 / 25.4;
const CSS_PX_TO_PT = 72 / 96; // 0.75

function pageDimsMm(opts: HtmlToPdfOptions): { w: number; h: number } {
  if (opts.pageSize === 'custom') {
    return { w: opts.customWidthMm || 210, h: opts.customHeightMm || 297 };
  }
  if (opts.pageSize === 'image') return { w: 210, h: 297 }; // fall back to A4 — image-size makes no sense for HTML
  const d = PAGE_SIZES_MM[opts.pageSize];
  return opts.orientation === 'landscape'
    ? { w: d.height, h: d.width }
    : { w: d.width, h: d.height };
}

async function injectIframe(html: string, widthCss: number, signal?: AbortSignal): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe');
  // sandbox without allow-scripts blocks any <script> in the user HTML while
  // still letting the parent read the rendered DOM (needed by html2canvas).
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.position = 'fixed';
  iframe.style.left = '-99999px';
  iframe.style.top = '0';
  iframe.style.border = '0';
  iframe.style.width = widthCss + 'px';
  iframe.style.height = '0px';
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const onLoad = () => {
      iframe.removeEventListener('load', onLoad);
      resolve();
    };
    const onAbort = () => {
      iframe.removeEventListener('load', onLoad);
      reject(new Error('Cancelled'));
    };
    iframe.addEventListener('load', onLoad);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; padding: 0; }
      body { width: ${widthCss}px; box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; word-wrap: break-word; line-height: 1.5; }
      img, table { max-width: 100%; }
    </style></head><body>${html}</body></html>`;
  });
  return iframe;
}

export async function renderHtmlToPdf(
  html: string,
  opts: HtmlToPdfOptions,
  onProgress?: (info: HtmlProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const dims = pageDimsMm(opts);
  const printableWidthMm = Math.max(10, dims.w - opts.marginMm * 2);
  const printableHeightMm = Math.max(10, dims.h - opts.marginMm * 2);
  const printableWidthCss = Math.max(50, Math.round(printableWidthMm * CSS_PX_PER_MM));
  const scale = opts.scale ?? 2;
  const bg = opts.backgroundHex ?? '#ffffff';

  onProgress?.({ pct: 5, message: 'Mounting iframe…' });
  const iframe = await injectIframe(html, printableWidthCss, signal);

  try {
    if (signal?.aborted) throw new Error('Cancelled');
    onProgress?.({ pct: 20, message: 'Rasterising HTML…' });
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error('Could not access iframe document');

    const canvas = await html2canvas(body, {
      backgroundColor: bg,
      scale,
      useCORS: true,
      logging: false,
      width: printableWidthCss,
      windowWidth: printableWidthCss,
    });

    onProgress?.({ pct: 60, message: 'Paginating…' });
    if (signal?.aborted) throw new Error('Cancelled');

    const pdf = await PDFDocument.create();
    const pageWidthPt = dims.w * MM_TO_PT;
    const pageHeightPt = dims.h * MM_TO_PT;
    const printableWidthPt = printableWidthMm * MM_TO_PT;
    const printableHeightPt = printableHeightMm * MM_TO_PT;
    const marginPt = opts.marginMm * MM_TO_PT;

    // Convert printable PT height back to canvas px (canvas px = CSS px * scale
    // and 1 CSS px = 0.75 PT).
    const chunkHeightPx = Math.max(1, Math.floor((printableHeightPt / CSS_PX_TO_PT) * scale));
    const totalChunks = Math.max(1, Math.ceil(canvas.height / chunkHeightPx));

    let yOffset = 0;
    let pageIndex = 0;
    while (yOffset < canvas.height) {
      if (signal?.aborted) throw new Error('Cancelled');
      const sliceH = Math.min(chunkHeightPx, canvas.height - yOffset);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const dataUrl = slice.toDataURL('image/jpeg', 0.92);
      const bin = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      const img = await pdf.embedJpg(bytes);
      const page = pdf.addPage([pageWidthPt, pageHeightPt]);
      const sliceHeightPt = (sliceH / scale) * CSS_PX_TO_PT;
      page.drawImage(img, {
        x: marginPt,
        y: pageHeightPt - marginPt - sliceHeightPt,
        width: printableWidthPt,
        height: sliceHeightPt,
      });
      yOffset += sliceH;
      pageIndex++;
      onProgress?.({
        pct: 60 + Math.round((pageIndex / totalChunks) * 35),
        message: `Page ${pageIndex}/${totalChunks}`,
      });
    }

    onProgress?.({ pct: 100, message: 'Saving…' });
    return savePdfLib(pdf);
  } finally {
    document.body.removeChild(iframe);
  }
}
