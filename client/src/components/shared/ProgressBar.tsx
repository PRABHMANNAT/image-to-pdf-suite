import { cn } from '../../lib/cn';

interface Props {
  value: number; // 0-100
  label?: string;
  indeterminate?: boolean;
  className?: string;
}

// Shared progress bar — replaces the older src/components/ProgressBar.tsx for
// new tools. Supports an indeterminate animated mode via the shimmer keyframe.
export function ProgressBar({ value, label, indeterminate, className }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="text-xs text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between">
          <span>{label}</span>
          {!indeterminate && <span className="tabular-nums">{clamped}%</span>}
        </div>
      )}
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        {indeterminate ? (
          <div
            className="h-full w-1/3 rounded-full animate-shimmer"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(59,130,246,0.9), transparent)',
              backgroundSize: '200% 100%',
            }}
          />
        ) : (
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{
              width: `${clamped}%`,
              background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
            }}
          />
        )}
      </div>
    </div>
  );
}
