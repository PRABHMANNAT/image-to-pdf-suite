export type BackendPdfEndpoint =
  | '/api/backend/pdf/compress'
  | '/api/backend/pdf/repair'
  | '/api/backend/pdf/to-images'
  | '/api/backend/pdf/extract-text'
  | '/api/backend/pdf/ocr';

export type BackendPdfErrorCode =
  | 'GHOSTSCRIPT_MISSING'
  | 'QPDF_MISSING'
  | 'POPPLER_MISSING'
  | 'OCR_BACKEND_MISSING'
  | 'BACKEND_ENGINE_FAILED'
  | 'NETWORK'
  | 'UNKNOWN';

export class BackendPdfError extends Error {
  constructor(message: string, public code: BackendPdfErrorCode = 'UNKNOWN', public status?: number, public jobId?: string) {
    super(message);
  }
}

export interface BackendPdfOptions {
  signal?: AbortSignal;
  fields?: Record<string, string>;
  onUploadProgress?: (pct: number) => void;
  onJobId?: (jobId: string) => void;
}

export function postBackendPdf(
  endpoint: BackendPdfEndpoint,
  file: File,
  opts: BackendPdfOptions = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    for (const [key, value] of Object.entries(opts.fields || {})) fd.append(key, value);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.responseType = 'blob';
    if (opts.onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onUploadProgress!(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = async () => {
      const jobId = xhr.getResponseHeader('X-Job-Id') || undefined;
      if (jobId) opts.onJobId?.(jobId);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
        return;
      }
      try {
        const text = await xhr.response.text();
        const body = JSON.parse(text) as { error?: string; code?: BackendPdfErrorCode; jobId?: string };
        reject(new BackendPdfError(body.error || `HTTP ${xhr.status}`, body.code || 'BACKEND_ENGINE_FAILED', xhr.status, body.jobId || jobId));
      } catch {
        reject(new BackendPdfError(`HTTP ${xhr.status}`, 'BACKEND_ENGINE_FAILED', xhr.status, jobId));
      }
    };
    xhr.onerror = () => reject(new BackendPdfError('Network error', 'NETWORK'));
    xhr.onabort = () => reject(new BackendPdfError('Cancelled', 'NETWORK'));
    if (opts.signal) {
      if (opts.signal.aborted) xhr.abort();
      else opts.signal.addEventListener('abort', () => xhr.abort());
    }
    xhr.send(fd);
  });
}
