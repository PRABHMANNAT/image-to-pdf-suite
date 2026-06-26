import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  CompressionLevel,
  DEFAULT_NAME_PATTERN,
  PageOrientation,
  PageSizeId,
  PREVIEW_ZOOM_DEFAULT,
} from './constants';

export interface ToolkitSettings {
  // PDF defaults
  pdfPageSize: PageSizeId;
  pdfOrientation: PageOrientation;
  pdfCustomWidthMm: number;
  pdfCustomHeightMm: number;
  pdfMarginMm: number;

  // Image / quality defaults
  imageQuality: number; // 1-100
  compressionLevel: CompressionLevel;

  // Output naming
  outputNamePattern: string; // "{name}-{tool}-{date}"

  // Preview
  previewZoom: number;

  // OCR
  ocrLanguage: string; // BCP-style code expected by Tesseract.js (e.g. "eng")
}

export const DEFAULT_SETTINGS: ToolkitSettings = {
  pdfPageSize: 'image',
  pdfOrientation: 'portrait',
  pdfCustomWidthMm: 210,
  pdfCustomHeightMm: 297,
  pdfMarginMm: 0,
  imageQuality: 100,
  compressionLevel: 'medium',
  outputNamePattern: DEFAULT_NAME_PATTERN,
  previewZoom: PREVIEW_ZOOM_DEFAULT,
  ocrLanguage: 'eng',
};

const STORAGE_KEY = 'ultra-pdf:settings';

interface SettingsCtx {
  settings: ToolkitSettings;
  set: <K extends keyof ToolkitSettings>(key: K, value: ToolkitSettings[K]) => void;
  update: (patch: Partial<ToolkitSettings>) => void;
  reset: () => void;
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  set: () => {},
  update: () => {},
  reset: () => {},
});

function readStored(): ToolkitSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ToolkitSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ToolkitSettings>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* quota or private-mode — ignore */
    }
  }, [settings]);

  const set = useCallback(<K extends keyof ToolkitSettings>(key: K, value: ToolkitSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const update = useCallback((patch: Partial<ToolkitSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(() => ({ settings, set, update, reset }), [settings, set, update, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}
