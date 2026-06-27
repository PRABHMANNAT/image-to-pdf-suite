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

const ACCENT: Record<Tool['category'], string> = {
  dashboard: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  image: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
  organize: 'bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-200',
  optimize: 'bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-200',
  'convert-to': 'bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200',
  'convert-from': 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200',
  edit: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-200',
  security: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200',
  intelligence: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200',
  settings: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
};

export function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const ready = tool.status === 'ready';
  return (
    <Link
      to={tool.route}
      className={cn(
        'group relative block min-h-[260px] overflow-hidden rounded-lg p-8 transition',
        'border border-slate-200 bg-white/[0.82] shadow-soft backdrop-blur-xl',
        'dark:border-white/10 dark:bg-white/[0.045] dark:shadow-soft-dark',
        'hover:-translate-y-1 hover:border-slate-300 hover:bg-white hover:shadow-[0_22px_60px_-34px_rgba(15,23,42,0.7)]',
        'dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
      )}
    >
      <div className="flex h-full flex-col">
        <span
          className={cn(
            'grid h-10 w-10 place-items-center rounded-md transition group-hover:scale-105',
            ACCENT[tool.category],
          )}
        >
          <Icon size={21} />
        </span>
        <div className="mt-8 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{tool.name}</h3>
            <ArrowUpRight size={17} className="text-slate-400 opacity-0 transition group-hover:opacity-100" />
          </div>
          <p className="mt-3 max-w-[18rem] text-[15px] leading-6 text-slate-600 dark:text-slate-400">
            {tool.description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-1.5">
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
