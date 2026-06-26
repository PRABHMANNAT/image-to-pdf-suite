import JSZip from 'jszip';

export interface ZipEntry {
  name: string;
  data: Blob | ArrayBuffer | Uint8Array | string;
}

/**
 * Build a single ZIP Blob from the given entries. Entry names should already
 * be unique — duplicates inside the zip get a numeric suffix appended.
 */
export async function zipBlobs(
  entries: ZipEntry[],
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const zip = new JSZip();
  const seen = new Map<string, number>();
  for (const entry of entries) {
    let name = entry.name;
    const count = seen.get(name) ?? 0;
    if (count > 0) {
      const dot = name.lastIndexOf('.');
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      name = `${base} (${count})${ext}`;
    }
    seen.set(entry.name, count + 1);
    zip.file(name, entry.data);
  }
  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => onProgress?.(Math.round(meta.percent)),
  );
}
