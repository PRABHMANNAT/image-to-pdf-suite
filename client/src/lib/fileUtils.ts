// Pure helpers for working with File / Blob / filenames. No React, no DOM.

export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getExtension(filename: string): string {
  const m = /\.([^.\\/]+)$/.exec(filename);
  return m ? `.${m[1].toLowerCase()}` : '';
}

export function stripExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i <= 0 ? filename : filename.slice(0, i);
}

export function sanitiseFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'file';
}

/**
 * Render a filename template like "{name}-{tool}-{date}" using the provided
 * context. Unknown tokens are left untouched so users can spot mistakes.
 */
export function applyNamePattern(
  pattern: string,
  ctx: { name?: string; tool?: string; index?: number; total?: number; ext?: string },
): string {
  const date = new Date();
  const yyyy = date.getFullYear().toString().padStart(4, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const hh = date.getHours().toString().padStart(2, '0');
  const mi = date.getMinutes().toString().padStart(2, '0');
  const tokens: Record<string, string> = {
    name: ctx.name ? stripExtension(ctx.name) : 'output',
    tool: ctx.tool ?? 'tool',
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}-${mi}`,
    datetime: `${yyyy}${mm}${dd}-${hh}${mi}`,
    index: ctx.index !== undefined ? String(ctx.index + 1).padStart(2, '0') : '',
    total: ctx.total !== undefined ? String(ctx.total) : '',
  };
  const base = pattern.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : `{${key}}`,
  );
  const cleaned = sanitiseFilename(base);
  return ctx.ext ? `${cleaned}${ctx.ext.startsWith('.') ? ctx.ext : `.${ctx.ext}`}` : cleaned;
}

export function uniqueId(prefix = 'f'): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

export function readAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function readAsText(file: Blob, encoding = 'utf-8'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file, encoding);
  });
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
