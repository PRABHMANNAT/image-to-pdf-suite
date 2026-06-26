// Centralised constants shared by every tool. Keep values that vary at
// runtime in SettingsProvider; this file is for hard, never-changing data.

export const MIME_PDF = 'application/pdf' as const;

export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.gif'] as const;
export const PDF_EXTS = ['.pdf'] as const;
export const OFFICE_EXTS = ['.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls'] as const;

export const ACCEPT_IMAGE = { 'image/*': [...IMAGE_EXTS] } as const;
export const ACCEPT_PDF = { [MIME_PDF]: [...PDF_EXTS] } as const;
export const ACCEPT_IMAGE_OR_PDF = {
  'image/*': [...IMAGE_EXTS],
  [MIME_PDF]: [...PDF_EXTS],
} as const;
export const ACCEPT_OFFICE = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
} as const;

export type AcceptMap = Record<string, readonly string[]>;

export const MAX_FILE_SIZE_DEFAULT = 500 * 1024 * 1024; // 500 MB
export const MAX_IMAGE_SIZE_DEFAULT = 200 * 1024 * 1024; // 200 MB

// PDF page sizes in millimetres. Conversion to points happens at render time.
export const PAGE_SIZES_MM = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  a3: { width: 297, height: 420 },
  a5: { width: 148, height: 210 },
} as const;

export type PageSizeId = keyof typeof PAGE_SIZES_MM | 'image' | 'custom';
export type PageOrientation = 'portrait' | 'landscape';
export type CompressionLevel = 'low' | 'medium' | 'high' | 'maximum';

export const MM_TO_PT = 72 / 25.4;
export const PT_TO_MM = 25.4 / 72;

export const PREVIEW_ZOOM_MIN = 0.25;
export const PREVIEW_ZOOM_MAX = 6;
export const PREVIEW_ZOOM_STEP = 0.25;
export const PREVIEW_ZOOM_DEFAULT = 1;

export const DEFAULT_NAME_PATTERN = '{name}-{tool}';

// Tesseract language codes — a curated default list, not exhaustive.
export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'rus', label: 'Russian' },
  { code: 'ara', label: 'Arabic' },
  { code: 'hin', label: 'Hindi' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'chi_tra', label: 'Chinese (Traditional)' },
];
