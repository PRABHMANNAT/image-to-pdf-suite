// Types shared across the toolkit engine. Importing from one place keeps the
// component APIs consistent and avoids structural-mismatch surprises.

export type ProcessingState = 'idle' | 'processing' | 'success' | 'error';

export interface AcceptedFile {
  id: string;
  file: File;
  /** Object URL pointing at the original bytes; revoked on remove/unmount. */
  url?: string;
  /** Thumbnail URL — for PDFs this is a rendered first-page data URL. */
  thumbUrl?: string;
  /** Set when validation or thumbnail generation fails. */
  error?: string;
  width?: number;
  height?: number;
  pageCount?: number;
}

export interface DropError {
  file?: File;
  reason: string;
}

export type SingleResult = {
  kind: 'single';
  blob: Blob;
  suggestedName: string;
};

export type ManyResult = {
  kind: 'many';
  /** Entries to bundle into a zip. */
  entries: { name: string; data: Blob | ArrayBuffer | Uint8Array | string }[];
  suggestedZipName: string;
};

export type ToolResult = SingleResult | ManyResult;
