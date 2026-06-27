import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { ProcessingState } from '../components/shared/types';

export interface BatchQueueItem {
  id: string;
  label: string;
  route: string;
  fileCount: number;
  totalSize: number;
  state: ProcessingState;
  progress: number;
  message?: string;
  createdAt: number;
  updatedAt: number;
}

interface BatchQueueContextValue {
  items: BatchQueueItem[];
  enqueue: (item: Omit<BatchQueueItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  update: (id: string, patch: Partial<Omit<BatchQueueItem, 'id' | 'createdAt'>>) => void;
  clearDone: () => void;
  clearAll: () => void;
}

const BatchQueueContext = createContext<BatchQueueContextValue | null>(null);

function makeId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function BatchQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BatchQueueItem[]>([]);

  const enqueue = useCallback<BatchQueueContextValue['enqueue']>((item) => {
    const id = makeId();
    const now = Date.now();
    setItems((prev) => [{ ...item, id, createdAt: now, updatedAt: now }, ...prev].slice(0, 30));
    return id;
  }, []);

  const update = useCallback<BatchQueueContextValue['update']>((id, patch) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item)),
    );
  }, []);

  const clearDone = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.state === 'processing'));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, enqueue, update, clearDone, clearAll }),
    [clearAll, clearDone, enqueue, items, update],
  );

  return <BatchQueueContext.Provider value={value}>{children}</BatchQueueContext.Provider>;
}

export function useBatchQueue(): BatchQueueContextValue {
  const ctx = useContext(BatchQueueContext);
  if (!ctx) {
    return {
      items: [],
      enqueue: () => '',
      update: () => {},
      clearDone: () => {},
      clearAll: () => {},
    };
  }
  return ctx;
}
