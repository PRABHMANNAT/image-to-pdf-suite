import { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface Props {
  label: string;
  side?: 'right' | 'top' | 'bottom';
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

// Lightweight CSS-only tooltip — appears on hover/focus, no portal, no overlay.
export function Tooltip({ label, side = 'right', children, disabled, className }: Props) {
  if (disabled) return <>{children}</>;
  const pos =
    side === 'right'
      ? 'left-full top-1/2 -translate-y-1/2 ml-2'
      : side === 'top'
        ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
        : 'top-full left-1/2 -translate-x-1/2 mt-2';
  return (
    <span className={cn('relative group inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium',
          'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-soft',
          'opacity-0 scale-95 translate-x-1 transition duration-150',
          'group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0',
          'group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:translate-x-0',
          pos,
        )}
      >
        {label}
      </span>
    </span>
  );
}
