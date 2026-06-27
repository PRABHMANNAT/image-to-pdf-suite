import { TOOLS } from './tools';

const STORAGE_KEY = 'ultra-pdf:recent-files';
const MAX_RECENTS = 18;

export interface RecentFile {
  id: string;
  name: string;
  size: number;
  type: string;
  toolId?: string;
  toolName?: string;
  route?: string;
  lastOpened: number;
}

export function readRecentFiles(): RecentFile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentFile[]) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.name === 'string' && typeof item.lastOpened === 'number')
          .sort((a, b) => b.lastOpened - a.lastOpened)
      : [];
  } catch {
    return [];
  }
}

export function writeRecentFiles(items: RecentFile[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
  window.dispatchEvent(new Event('recent-files:change'));
}

export function clearRecentFiles(): void {
  writeRecentFiles([]);
}

export function recordRecentFiles(files: File[], route?: string): RecentFile[] {
  const tool = route ? TOOLS.find((item) => item.route === route) : undefined;
  const existing = readRecentFiles();
  const now = Date.now();
  const additions = files.map((file, index) => ({
    id: `${file.name}:${file.size}:${file.lastModified || now}`,
    name: file.name,
    size: file.size,
    type: file.type || 'Unknown',
    toolId: tool?.id,
    toolName: tool?.name,
    route: tool?.route,
    lastOpened: now + index,
  }));

  const byId = new Map<string, RecentFile>();
  for (const item of [...additions, ...existing]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const next = Array.from(byId.values()).sort((a, b) => b.lastOpened - a.lastOpened);
  writeRecentFiles(next);
  return next;
}

export function subscribeRecentFiles(callback: () => void): () => void {
  window.addEventListener('recent-files:change', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('recent-files:change', callback);
    window.removeEventListener('storage', callback);
  };
}
