import { ReactNode } from 'react';
import { Loader2, Play, X, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ProgressBar } from './ProgressBar';
import { ProcessingState, AcceptedFile } from './types';
import { humanSize } from '../../lib/fileUtils';

interface Props {
  /** Selected files (rendered as a count badge — the file queue itself lives in FileDropzone). */
  files?: AcceptedFile[];
  state: ProcessingState;
  progress?: number;
  /** Status text shown next to the progress bar. */
  message?: string;
  /** Detailed error message — only shown when state === 'error'. */
  error?: string;
  /** When false, the cancel button is hidden even while processing. */
  cancelable?: boolean;
  onCancel?: () => void;
  onReset?: () => void;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  /** Optional slot for tool-specific options (rendered above the action row). */
  children?: ReactNode;
  className?: string;
  indeterminate?: boolean;
}

export function ProcessingPanel({
  files,
  state,
  progress = 0,
  message,
  error,
  cancelable = true,
  onCancel,
  onReset,
  actionLabel = 'Run',
  actionDisabled,
  onAction,
  children,
  className,
  indeterminate,
}: Props) {
  const totalSize = files ? files.reduce((n, f) => n + f.file.size, 0) : 0;

  return (
    <section className={cn('card space-y-4', className)}>
      {files && files.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {files.length} {files.length === 1 ? 'file' : 'files'} selected
          </span>
          <span>{humanSize(totalSize)}</span>
        </div>
      )}

      {children && <div className="space-y-3">{children}</div>}

      {state === 'processing' && (
        <div className="space-y-2 animate-fade-in">
          <ProgressBar
            value={progress}
            indeterminate={indeterminate}
            label={message || 'Working…'}
          />
          {cancelable && onCancel && (
            <div className="flex justify-end">
              <button type="button" className="btn-ghost text-red-600" onClick={onCancel}>
                <X size={14} /> Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-start gap-2 rounded-xl border border-red-300/60 bg-red-50/80 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 p-3 text-sm animate-fade-in">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">Something went wrong</div>
            {error && <div className="text-xs mt-0.5 break-words">{error}</div>}
          </div>
        </div>
      )}

      {state === 'success' && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-300/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 p-3 text-sm animate-fade-in">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">Done</div>
            {message && <div className="text-xs mt-0.5">{message}</div>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {onAction && state !== 'processing' && state !== 'success' && (
          <button
            type="button"
            className="btn-primary"
            onClick={onAction}
            disabled={actionDisabled}
          >
            <Play size={14} /> {actionLabel}
          </button>
        )}
        {state === 'processing' && (
          <button type="button" className="btn-primary" disabled>
            <Loader2 size={14} className="animate-spin" /> Working…
          </button>
        )}
        {(state === 'success' || state === 'error') && onReset && (
          <button type="button" className="btn-secondary" onClick={onReset}>
            <RotateCcw size={14} /> Start over
          </button>
        )}
      </div>
    </section>
  );
}
