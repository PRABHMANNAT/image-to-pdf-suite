// XHR helper for the qpdf-backed /api/pdf/protect and /api/pdf/unlock routes.
// Same shape as convertOffice / convertPdfBackend — typed error codes so the
// UI can show targeted messages (wrong password vs missing qpdf vs network).

export type SecurityErrorCode =
  | 'QPDF_MISSING'
  | 'QPDF_BAD_PASSWORD'
  | 'OPERATION_FAILED'
  | 'NETWORK'
  | 'UNKNOWN';

export class SecurityError extends Error {
  constructor(message: string, public code: SecurityErrorCode = 'UNKNOWN', public status?: number) {
    super(message);
  }
}

export interface PostOptions {
  signal?: AbortSignal;
  onUploadProgress?: (pct: number) => void;
}

export function postSecurity(
  endpoint: '/api/pdf/protect' | '/api/pdf/unlock',
  file: File,
  fields: Record<string, string>,
  opts: PostOptions = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
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
        const code: SecurityErrorCode =
          body.code === 'QPDF_MISSING'
            ? 'QPDF_MISSING'
            : body.code === 'QPDF_BAD_PASSWORD'
              ? 'QPDF_BAD_PASSWORD'
              : 'OPERATION_FAILED';
        reject(new SecurityError(body.error || `HTTP ${xhr.status}`, code, xhr.status));
      } catch {
        reject(new SecurityError(`HTTP ${xhr.status}`, 'OPERATION_FAILED', xhr.status));
      }
    };
    xhr.onerror = () => reject(new SecurityError('Network error', 'NETWORK'));
    xhr.onabort = () => reject(new SecurityError('Cancelled', 'NETWORK'));
    if (opts.signal) {
      if (opts.signal.aborted) xhr.abort();
      else opts.signal.addEventListener('abort', () => xhr.abort());
    }
    xhr.send(fd);
  });
}
