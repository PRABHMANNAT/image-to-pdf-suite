export interface ImageMetadata {
  name: string;
  size: number;
  width: number;
  height: number;
  type: string;
  orientation?: number;
}

export interface PdfMetadata {
  name: string;
  size: number;
  pageCount: number;
}

export type PageLayout =
  | 'image'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'letter-portrait'
  | 'letter-landscape'
  | 'custom';

export type FitMode = 'fit' | 'fill' | 'stretch' | 'original';

export interface ImageToPdfOptions {
  layout: PageLayout;
  customWidth?: number;
  customHeight?: number;
  fit: FitMode;
  marginMm: number;
  background: string;
  order?: number[];
  jpegQuality?: number;
}
