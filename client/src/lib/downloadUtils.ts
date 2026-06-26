import { saveAs } from 'file-saver';
import { sanitiseFilename } from './fileUtils';
import { zipBlobs, ZipEntry } from './zipUtils';

function toBlob(data: ArrayBuffer | Uint8Array | string): Blob {
  if (typeof data === 'string') return new Blob([data]);
  if (data instanceof Uint8Array) {
    // Detach from the original buffer with a copy so the Blob owns ArrayBuffer.
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy.buffer]);
  }
  return new Blob([data]);
}

export function downloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, sanitiseFilename(filename));
}

export async function downloadMany(
  entries: ZipEntry[],
  zipName: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (entries.length === 0) return;
  if (entries.length === 1) {
    const e = entries[0];
    const blob = e.data instanceof Blob ? e.data : toBlob(e.data);
    downloadBlob(blob, e.name);
    return;
  }
  const zip = await zipBlobs(entries, onProgress);
  downloadBlob(zip, zipName.endsWith('.zip') ? zipName : `${zipName}.zip`);
}
