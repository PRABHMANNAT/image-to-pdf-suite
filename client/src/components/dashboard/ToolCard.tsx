import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Tool } from '../../lib/tools';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/cn';

const RUNTIME_LABEL: Record<Tool['runtime'], string> = {
  browser: 'Browser',
  backend: 'Backend',
  hybrid: 'Hybrid',
};

export function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const ready = tool.status === 'ready';
  return (
    <Link
      to={tool.route}
      className={cn(
        'group relative block rounded-2xl p-4 overflow-hidden transition',
        'bg-white/80 dark:bg-slate-900/60 backdrop-blur',
        'border border-slate-200/80 dark:border-white/5',
        'shadow-soft dark:shadow-soft-dark',
        'hover:-translate-y-0.5 hover:shadow-glow hover:border-brand-500/50 hover:ring-1 hover:ring-brand-500/40',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
      )}
    >
      {/* Soft gradient halo on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition"
        style={{
          background:
            'radial-gradient(600px circle at var(--mx,50%) var(--my,0%), rgba(59,130,246,0.10), transparent 40%)',
        }}
      />
      <div className="relative flex items-start gap-3">
        <span
          className={cn(
            'grid place-items-center w-11 h-11 rounded-xl shrink-0 transition',
            'bg-gradient-to-br from-brand-50 to-indigo-50 text-brand-600',
            'dark:from-brand-500/15 dark:to-indigo-500/15 dark:text-brand-300',
            'group-hover:from-brand-500 group-hover:to-indigo-500 group-hover:text-white group-hover:shadow-glow',
          )}
        >
          <Icon size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {tool.name}
            </h3>
            <ArrowUpRight
              size={14}
              className="text-slate-400 transition opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"
            />
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
            {tool.description}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant={tool.runtime}>{RUNTIME_LABEL[tool.runtime]}</Badge>
            <Badge variant={ready ? 'ready' : tool.status === 'beta' ? 'beta' : 'coming-soon'}>
              {ready ? 'Ready' : tool.status === 'beta' ? 'Beta' : 'Soon'}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}
