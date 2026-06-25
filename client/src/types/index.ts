export interface SelectedFile {
  id: string;
  file: File;
  url: string;
  width?: number;
  height?: number;
}

export type PageLayout =
  | 'image'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'letter-portrait'
  | 'letter-landscape'
  | 'custom';

export type FitMode = 'fit' | 'fill' | 'stretch' | 'original';
