import { Category, Tool } from '../../lib/tools';
import { ToolCard } from './ToolCard';

interface Props {
  category: Category;
  tools: Tool[];
}

export function CategorySection({ category, tools }: Props) {
  if (!tools.length) return null;
  const Icon = category.icon;
  return (
    <section className="animate-slide-up">
      <div className="flex items-center gap-3 mb-3">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/70 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-brand-600 dark:text-brand-300">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {category.name}
          </h2>
          {category.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{category.description}</p>
          )}
        </div>
        <span className="ml-auto text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
        </span>
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tools.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
      </div>
    </section>
  );
}
