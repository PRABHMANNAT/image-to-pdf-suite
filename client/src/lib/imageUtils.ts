// Browser image helpers. Server-side cropping/resizing lives in
// server/src/services/imageService.ts (sharp). Anything done here runs entirely
// in the tab against canvases.

export interface ImageDimensions {
  width: number;
  height: number;
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

export async function readImageDimensions(file: Blob): Promise<ImageDimensions> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function imageFileToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      type,
      quality,
    );
  });
}

export async function cropImageOnCanvas(
  file: Blob,
  region: { left: number; top: number; width: number; height: number },
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.95,
): Promise<Blob> {
  const source = await imageFileToCanvas(file);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.width));
  canvas.height = Math.max(1, Math.round(region.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(
    source,
    region.left,
    region.top,
    region.width,
    region.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvasToBlob(canvas, format, quality);
}

export async function rotateImageOnCanvas(
  file: Blob,
  angleDeg: number,
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.95,
): Promise<Blob> {
  const source = await imageFileToCanvas(file);
  const rad = (angleDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = source.width * cos + source.height * sin;
  const h = source.width * sin + source.height * cos;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvasToBlob(canvas, format, quality);
}
