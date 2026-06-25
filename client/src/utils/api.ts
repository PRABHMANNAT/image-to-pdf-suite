// Submits a multipart/form-data POST and triggers a browser file download from the response.
export async function postAndDownload(
  url: string,
  form: FormData,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'blob';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response as Blob;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        resolve();
      } else {
        // Server sent JSON error - decode it.
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result as string);
            reject(new Error(data.error || `HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };
        reader.readAsText(xhr.response);
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(form);
  });
}

export async function postJson<T = unknown>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}
