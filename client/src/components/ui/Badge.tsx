import { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'browser' | 'backend' | 'hybrid' | 'ready' | 'coming-soon' | 'beta' | 'muted';

interface Props {
  variant: Variant;
  children: ReactNode;
  className?: string;
}

const STYLES: Record<Variant, string> = {
  browser:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 ring-1 ring-emerald-500/20',
  backend:
    'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 ring-1 ring-amber-500/20',
  hybrid:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 ring-1 ring-indigo-500/20',
  ready:
    'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 ring-1 ring-brand-500/20',
  'coming-soon':
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-300/40 dark:ring-slate-600/40',
  beta:
    'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 ring-1 ring-fuchsia-500/20',
  muted:
    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export function Badge({ variant, children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
