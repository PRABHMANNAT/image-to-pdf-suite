// XHR-based POST /api/pdf/convert/:target. Mirrors convertOffice.ts so every
// backend-driven conversion in the app has the same shape.

export type PdfConvertTarget = 'docx' | 'pptx' | 'xlsx' | 'odt' | 'odp' | 'ods' | 'rtf' | 'pdfa';

export type PdfConvertErrorCode =
  | 'LIBREOFFICE_MISSING'
  | 'GHOSTSCRIPT_MISSING'
  | 'CONVERSION_FAILED'
  | 'NETWORK'
  | 'UNKNOWN';

export class PdfConvertError extends Error {
  constructor(
    message: string,
    public code: PdfConvertErrorCode = 'UNKNOWN',
    public status?: number,
  ) {
    super(message);
  }
}

export interface ConvertOptions {
  signal?: AbortSignal;
  onUploadProgress?: (pct: number) => void;
  /** Extra form fields, e.g. { level: '2b' } for PDF/A. */
  extra?: Record<string, string>;
}

export function convertPdfBackend(
  file: File,
  target: PdfConvertTarget,
  opts: ConvertOptions = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    if (opts.extra) {
      for (const [k, v] of Object.entries(opts.extra)) fd.append(k, v);
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/pdf/convert/${target}`);
    xhr.responseType = 'blob';
    if (opts.onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onUploadProgress!(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
        return;
      }
      try {
        const text = await xhr.response.text();
        const body = JSON.parse(text) as { error?: string; code?: string };
        const code: PdfConvertErrorCode =
          body.code === 'LIBREOFFICE_MISSING'
            ? 'LIBREOFFICE_MISSING'
            : body.code === 'GHOSTSCRIPT_MISSING'
              ? 'GHOSTSCRIPT_MISSING'
              : 'CONVERSION_FAILED';
        reject(new PdfConvertError(body.error || `HTTP ${xhr.status}`, code, xhr.status));
      } catch {
        reject(new PdfConvertError(`HTTP ${xhr.status}`, 'CONVERSION_FAILED', xhr.status));
      }
    };
    xhr.onerror = () => reject(new PdfConvertError('Network error', 'NETWORK'));
    xhr.onabort = () => reject(new PdfConvertError('Cancelled', 'NETWORK'));
    if (opts.signal) {
      if (opts.signal.aborted) xhr.abort();
      else opts.signal.addEventListener('abort', () => xhr.abort());
    }
    xhr.send(fd);
  });
}
