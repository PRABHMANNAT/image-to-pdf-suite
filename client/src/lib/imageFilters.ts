// Pure canvas-based image enhancement filters used by the Scan to PDF tool.

import { imageFileToCanvas, canvasToBlob } from './imageUtils';

export interface FilterOptions {
  grayscale: boolean;
  /** Hard black/white threshold; implies grayscale. */
  blackAndWhite: boolean;
  /** 0-255, only used when blackAndWhite is on. */
  threshold: number;
  /** -100..100 */
  contrast: number;
  /** -100..100 */
  brightness: number;
  sharpen: boolean;
}

export const DEFAULT_FILTERS: FilterOptions = {
  grayscale: false,
  blackAndWhite: false,
  threshold: 160,
  contrast: 0,
  brightness: 0,
  sharpen: false,
};

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function applyPixelOps(data: Uint8ClampedArray, opts: FilterOptions): void {
  const contrastFactor = (259 * (opts.contrast + 255)) / (255 * (259 - opts.contrast));
  const bright = opts.brightness * 2.55;
  const wantGray = opts.grayscale || opts.blackAndWhite;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (opts.brightness !== 0 || opts.contrast !== 0) {
      r = clamp(contrastFactor * (r - 128) + 128 + bright);
      g = clamp(contrastFactor * (g - 128) + 128 + bright);
      b = clamp(contrastFactor * (b - 128) + 128 + bright);
    }
    if (wantGray) {
      const y = r * 0.299 + g * 0.587 + b * 0.114;
      r = g = b = y;
    }
    if (opts.blackAndWhite) {
      const v = r > opts.threshold ? 255 : 0;
      r = g = b = v;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

function sharpen3x3(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const d = out.data;
  // Kernel: 0 -1 0 / -1 5 -1 / 0 -1 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p = (y * w + x) * 4 + c;
        const up = ((Math.max(0, y - 1)) * w + x) * 4 + c;
        const dn = ((Math.min(h - 1, y + 1)) * w + x) * 4 + c;
        const lf = (y * w + Math.max(0, x - 1)) * 4 + c;
        const rt = (y * w + Math.min(w - 1, x + 1)) * 4 + c;
        d[p] = clamp(5 * s[p] - s[up] - s[dn] - s[lf] - s[rt]);
      }
      d[idx + 3] = s[idx + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

export async function applyFiltersToBlob(
  file: Blob,
  opts: FilterOptions,
  output: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.95,
): Promise<Blob> {
  const canvas = await imageFileToCanvas(file);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyPixelOps(img.data, opts);
  ctx.putImageData(img, 0, 0);
  if (opts.sharpen) sharpen3x3(canvas);
  return canvasToBlob(canvas, output, quality);
}

export async function applyFiltersToCanvas(
  source: HTMLCanvasElement,
  opts: FilterOptions,
): Promise<HTMLCanvasElement> {
  const target = document.createElement('canvas');
  target.width = source.width;
  target.height = source.height;
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, target.width, target.height);
  applyPixelOps(img.data, opts);
  ctx.putImageData(img, 0, 0);
  if (opts.sharpen) sharpen3x3(target);
  return target;
}
