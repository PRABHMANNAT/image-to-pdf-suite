import React, { createContext, useCallback, useContext, useState } from 'react';

type Toast = { id: number; msg: string; kind: 'info' | 'error' | 'success' };

const ToastContext = createContext<(msg: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'px-4 py-2 rounded shadow text-sm text-white ' +
              (t.kind === 'error' ? 'bg-red-600' : t.kind === 'success' ? 'bg-green-600' : 'bg-slate-800')
            }
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
