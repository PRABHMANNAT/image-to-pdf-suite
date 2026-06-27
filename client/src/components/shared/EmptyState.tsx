import { ReactNode } from 'react';
import { LucideIcon, Search } from 'lucide-react';
import { cn } from '../../lib/cn';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Search, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-slate-300/80 dark:border-white/10',
        'bg-white/55 dark:bg-white/[0.03] px-4 py-10 text-center',
        className,
      )}
    >
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
        <Icon size={20} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
