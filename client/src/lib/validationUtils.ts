import {
  AcceptMap,
  IMAGE_EXTS,
  PDF_EXTS,
  OFFICE_EXTS,
  MAX_FILE_SIZE_DEFAULT,
} from './constants';
import { getExtension } from './fileUtils';

export type AcceptKind = 'image' | 'pdf' | 'image+pdf' | 'office' | 'any' | AcceptMap;

const KIND_TO_EXTS: Record<Exclude<AcceptKind, AcceptMap | 'any'>, readonly string[]> = {
  image: IMAGE_EXTS,
  pdf: PDF_EXTS,
  'image+pdf': [...IMAGE_EXTS, ...PDF_EXTS],
  office: OFFICE_EXTS,
};

export function isImage(file: File): boolean {
  return file.type.startsWith('image/') || (IMAGE_EXTS as readonly string[]).includes(getExtension(file.name));
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || getExtension(file.name) === '.pdf';
}

export function isOffice(file: File): boolean {
  return (OFFICE_EXTS as readonly string[]).includes(getExtension(file.name));
}

/** Build the `accept` map react-dropzone expects from a friendly kind. */
export function acceptToMap(kind: AcceptKind): AcceptMap | undefined {
  if (kind === 'any') return undefined;
  if (typeof kind === 'object') return kind;
  if (kind === 'image') return { 'image/*': [...IMAGE_EXTS] };
  if (kind === 'pdf') return { 'application/pdf': [...PDF_EXTS] };
  if (kind === 'image+pdf') {
    return { 'image/*': [...IMAGE_EXTS], 'application/pdf': [...PDF_EXTS] };
  }
  if (kind === 'office') {
    return {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    };
  }
  return undefined;
}

export interface ValidateOptions {
  accept?: AcceptKind;
  maxSize?: number;
  /** Hard cap on total file count after this file is added. */
  maxFiles?: number;
  currentCount?: number;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateFile(file: File, opts: ValidateOptions = {}): ValidationResult {
  const max = opts.maxSize ?? MAX_FILE_SIZE_DEFAULT;
  if (file.size > max) {
    return { ok: false, error: `${file.name} is larger than the allowed ${Math.round(max / (1024 * 1024))} MB.` };
  }
  if (opts.accept && opts.accept !== 'any') {
    const ext = getExtension(file.name);
    let allowed: readonly string[] | undefined;
    if (typeof opts.accept === 'object') {
      allowed = Object.values(opts.accept).flat();
    } else {
      allowed = KIND_TO_EXTS[opts.accept];
    }
    if (allowed && !allowed.includes(ext)) {
      return { ok: false, error: `${file.name} is not a supported file type.` };
    }
  }
  return { ok: true };
}

export function validateBatch(
  files: File[],
  opts: ValidateOptions = {},
): { accepted: File[]; rejected: { file: File; reason: string }[] } {
  const accepted: File[] = [];
  const rejected: { file: File; reason: string }[] = [];
  let count = opts.currentCount ?? 0;
  for (const f of files) {
    if (opts.maxFiles !== undefined && count >= opts.maxFiles) {
      rejected.push({ file: f, reason: `Limit of ${opts.maxFiles} files reached.` });
      continue;
    }
    const r = validateFile(f, opts);
    if (r.ok) {
      accepted.push(f);
      count++;
    } else {
      rejected.push({ file: f, reason: r.error || 'Rejected' });
    }
  }
  return { accepted, rejected };
}
