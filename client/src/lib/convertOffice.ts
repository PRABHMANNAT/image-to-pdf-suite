// Client wrapper for the /api/office/convert endpoint. Uses XHR so we can
// report upload progress; the server processes the file synchronously.

export interface ConvertOptions {
  signal?: AbortSignal;
  /** 0-100 upload progress. */
  onUploadProgress?: (pct: number) => void;
}

export class OfficeConvertError extends Error {
  constructor(
    message: string,
    public code: 'LIBREOFFICE_MISSING' | 'CONVERSION_FAILED' | 'NETWORK' | 'UNKNOWN' = 'UNKNOWN',
    public status?: number,
  ) {
    super(message);
  }
}

export function convertOfficeToPdf(file: File, opts: ConvertOptions = {}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/office/convert');
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
      // Try to parse JSON error from the blob response.
      try {
        const text = await xhr.response.text();
        const body = JSON.parse(text);
        const code = body?.code === 'LIBREOFFICE_MISSING' ? 'LIBREOFFICE_MISSING' : 'CONVERSION_FAILED';
        reject(new OfficeConvertError(body?.error || `HTTP ${xhr.status}`, code, xhr.status));
      } catch {
        reject(new OfficeConvertError(`HTTP ${xhr.status}`, 'CONVERSION_FAILED', xhr.status));
      }
    };
    xhr.onerror = () => reject(new OfficeConvertError('Network error', 'NETWORK'));
    xhr.onabort = () => reject(new OfficeConvertError('Cancelled', 'NETWORK'));
    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
      } else {
        opts.signal.addEventListener('abort', () => xhr.abort());
      }
    }
    xhr.send(fd);
  });
}
