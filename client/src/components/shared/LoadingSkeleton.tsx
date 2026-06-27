import { cn } from '../../lib/cn';

interface Props {
  className?: string;
  lines?: number;
}

export function LoadingSkeleton({ className, lines = 3 }: Props) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'h-3 rounded-full bg-[linear-gradient(90deg,rgba(148,163,184,0.16),rgba(148,163,184,0.34),rgba(148,163,184,0.16))] bg-[length:200%_100%] animate-shimmer',
            index === lines - 1 && 'w-2/3',
          )}
        />
      ))}
    </div>
  );
}

export function PreviewSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/80 bg-white/70 p-4 shadow-soft dark:border-white/10 dark:bg-white/[0.03]',
        className,
      )}
      aria-label="Loading preview"
    >
      <div className="aspect-[4/3] rounded-lg bg-[linear-gradient(90deg,rgba(148,163,184,0.12),rgba(148,163,184,0.28),rgba(148,163,184,0.12))] bg-[length:200%_100%] animate-shimmer" />
      <LoadingSkeleton className="mt-3" lines={2} />
    </div>
  );
}
