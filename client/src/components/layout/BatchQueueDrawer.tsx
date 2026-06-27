import { CheckCircle2, Clock3, ListChecks, Trash2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBatchQueue } from '../../lib/batchQueue';
import { humanSize } from '../../lib/fileUtils';
import { cn } from '../../lib/cn';
import { EmptyState } from '../shared/EmptyState';
import { ProgressBar } from '../shared/ProgressBar';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BatchQueueDrawer({ open, onClose }: Props) {
  const { items, clearAll, clearDone } = useBatchQueue();
  const navigate = useNavigate();

  return (
    <div className={cn('fixed inset-0 z-[70]', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={cn('absolute inset-0 bg-slate-900/35 backdrop-blur-sm transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute right-0 top-0 h-full w-full max-w-md border-l border-white/60 bg-white/90 p-4 shadow-2xl backdrop-blur-xl transition-transform dark:border-white/10 dark:bg-slate-950/90',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-label="Batch queue"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <ListChecks size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Batch queue</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{items.length} tracked jobs this session</p>
          </div>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={clearDone}>
            Clear done
          </button>
        </div>

        <div className="mt-4 h-px bg-slate-200 dark:bg-white/10" />

        <div className="mt-4 max-h-[calc(100vh-130px)] overflow-y-auto thin-scroll pr-1">
          {!items.length ? (
            <EmptyState
              icon={Clock3}
              title="No queued work yet"
              description="Run any tool and its progress will appear here while you keep navigating."
            />
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const isDone = item.state === 'success';
                const isError = item.state === 'error';
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-slate-200/80 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 grid h-8 w-8 place-items-center rounded-lg',
                          isDone && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
                          isError && 'bg-red-500/10 text-red-600 dark:text-red-300',
                          !isDone && !isError && 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
                        )}
                      >
                        {isDone ? <CheckCircle2 size={16} /> : isError ? <XCircle size={16} /> : <Clock3 size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-300"
                          onClick={() => {
                            navigate(item.route);
                            onClose();
                          }}
                        >
                          {item.label}
                        </button>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {item.fileCount} {item.fileCount === 1 ? 'file' : 'files'} · {humanSize(item.totalSize)}
                        </div>
                        {item.state === 'processing' ? (
                          <ProgressBar value={item.progress} label={item.message || 'Working...'} className="mt-2" />
                        ) : (
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {item.message || (isDone ? 'Completed' : isError ? 'Failed' : 'Waiting')}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <button type="button" className="btn-ghost mt-3 w-full justify-center text-red-600 dark:text-red-300" onClick={clearAll}>
            <Trash2 size={14} /> Clear queue
          </button>
        )}
      </aside>
    </div>
  );
}
