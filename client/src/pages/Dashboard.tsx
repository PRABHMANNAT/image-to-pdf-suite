import { useEffect, useMemo, useState } from 'react';
import { Clock, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ToolCard } from '../components/dashboard/ToolCard';
import { TOOLS, type CategoryId } from '../lib/tools';
import { readRecentFiles, subscribeRecentFiles, type RecentFile } from '../lib/recentFiles';
import { humanSize } from '../lib/fileUtils';
import { EmptyState } from '../components/shared';
import { cn } from '../lib/cn';

type FilterId = 'all' | 'workflows' | CategoryId;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'organize', label: 'Organize PDF' },
  { id: 'optimize', label: 'Optimize PDF' },
  { id: 'convert-to', label: 'Convert PDF' },
  { id: 'edit', label: 'Edit PDF' },
  { id: 'security', label: 'PDF Security' },
  { id: 'intelligence', label: 'PDF Intelligence' },
];

const WORKFLOW_IDS = [
  'merge-pdf',
  'split-pdf',
  'compress-pdf',
  'pdf-to-word',
  'pdf-to-ppt',
  'word-to-pdf',
  'ppt-to-pdf',
  'excel-to-pdf',
  'edit-pdf',
  'protect-pdf',
  'ocr-pdf',
  'ai-summarize',
];

export default function Dashboard() {
  const [active, setActive] = useState<FilterId>('all');
  const [recents, setRecents] = useState<RecentFile[]>(() => readRecentFiles());

  useEffect(() => subscribeRecentFiles(() => setRecents(readRecentFiles())), []);

  const tools = useMemo(() => {
    if (active === 'all') return TOOLS.filter((tool) => tool.category !== 'image');
    if (active === 'workflows') {
      return WORKFLOW_IDS.map((id) => TOOLS.find((tool) => tool.id === id)).filter((tool): tool is (typeof TOOLS)[number] => Boolean(tool));
    }
    if (active === 'convert-to') {
      return TOOLS.filter((tool) => tool.category === 'convert-to' || tool.category === 'convert-from');
    }
    return TOOLS.filter((tool) => tool.category === active);
  }, [active]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/[0.62] px-5 py-8 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045] sm:px-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-white/20" />
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
            <Sparkles size={14} className="text-red-500" /> Ultra PDF Toolkit
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Hi Prabh Mannat, let's get started
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-300 sm:text-base">
            Pick a tool, search by operation, or open a recent file. Everything is tuned for fast local PDF work.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActive(filter.id)}
              className={cn(
                'rounded-full border px-5 py-2 text-sm font-bold transition sm:text-base',
                active === filter.id
                  ? 'border-slate-950 bg-slate-950 text-white shadow-soft dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/[0.86] text-slate-600 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-300 dark:hover:bg-white/[0.09]',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {FILTERS.find((item) => item.id === active)?.label || 'Tools'}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tools.length} tools available</p>
            </div>
            <Link
              to="/tools/merge-pdf"
              className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-200 dark:hover:bg-white/[0.09] sm:inline-flex"
            >
              Start with Merge PDF
            </Link>
          </div>

          {tools.length ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Search} title="No tools found" description="Choose another filter or use quick search." />
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent files</h2>
              <Clock size={15} className="text-slate-400" />
            </div>
            {recents.length ? (
              <ul className="mt-3 space-y-1">
                {recents.slice(0, 6).map((file) => (
                  <li key={file.id}>
                    <Link
                      to={file.route || '/'}
                      className="block rounded-lg px-3 py-2 transition hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                    >
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{file.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {humanSize(file.size)} {file.toolName ? `- ${file.toolName}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Clock}
                title="No recent files"
                description="Your local history appears after dropping a file into any tool."
                className="mt-3 py-7"
              />
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045]">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Fast operations</h2>
            <div className="mt-3 grid gap-2">
              {['merge-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-word'].map((id) => {
                const tool = TOOLS.find((item) => item.id === id);
                if (!tool) return null;
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.id}
                    to={tool.route}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/[0.06]"
                  >
                    <Icon size={17} className="text-red-500" />
                    {tool.name}
                  </Link>
                );
              })}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
