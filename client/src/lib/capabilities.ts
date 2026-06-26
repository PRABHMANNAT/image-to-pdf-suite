// Single source of truth for "what can the backend do right now".
// Tools that depend on native binaries call useCapabilities() and either
// light up or show setup instructions accordingly.

import { useEffect, useState } from 'react';

export interface CapabilityInfo {
  available: boolean;
  binary?: string;
  version?: string;
}

export interface ServerCapabilities {
  libreoffice: CapabilityInfo;
  ghostscript: CapabilityInfo;
  qpdf: CapabilityInfo;
  poppler: CapabilityInfo;
  tesseract: CapabilityInfo;
}

export const UNKNOWN_CAPABILITIES: ServerCapabilities = {
  libreoffice: { available: false },
  ghostscript: { available: false },
  qpdf: { available: false },
  poppler: { available: false },
  tesseract: { available: false },
};

export type CapabilityState =
  | { status: 'loading' }
  | { status: 'unreachable' }
  | { status: 'ready'; caps: ServerCapabilities };

export async function fetchCapabilities(signal?: AbortSignal): Promise<ServerCapabilities | null> {
  try {
    const r = await fetch('/api/capabilities', { signal });
    if (!r.ok) return null;
    return (await r.json()) as ServerCapabilities;
  } catch {
    return null;
  }
}

let cachePromise: Promise<ServerCapabilities | null> | null = null;
function getCachedCapabilities(): Promise<ServerCapabilities | null> {
  if (!cachePromise) cachePromise = fetchCapabilities();
  return cachePromise;
}

export function useCapabilities(): CapabilityState {
  const [state, setState] = useState<CapabilityState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    void getCachedCapabilities().then((caps) => {
      if (cancelled) return;
      if (!caps) setState({ status: 'unreachable' });
      else setState({ status: 'ready', caps });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
