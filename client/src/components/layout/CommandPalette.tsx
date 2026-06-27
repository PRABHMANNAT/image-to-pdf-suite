import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Command, FileClock, Search } from 'lucide-react';
import { TOOLS } from '../../lib/tools';
import { readRecentFiles, subscribeRecentFiles, type RecentFile } from '../../lib/recentFiles';
import { humanSize } from '../../lib/fileUtils';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../shared/EmptyState';
import { cn } from '../../lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  ['Ctrl K', 'Open command palette'],
  ['/', 'Focus tool search'],
  ['Esc', 'Close overlays'],
  ['Ctrl Enter', 'Run the focused tool action'],
];

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<RecentFile[]>(() => readRecentFiles());

  useEffect(() => subscribeRecentFiles(() => setRecents(readRecentFiles())), []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return TOOLS.slice(0, 9);
    return TOOLS.filter((tool) => {
      const category = tool.category.replaceAll('-', ' ');
      return [tool.name, tool.description, tool.id, category, tool.runtime, tool.status]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    }).slice(0, 12);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const t = window.setTimeout(() => document.getElementById('command-palette-input')?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((index) => Math.min(matches.length - 1, index + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((index) => Math.max(0, index - 1));
      }
      if (e.key === 'Enter' && matches[active]) {
        e.preventDefault();
        pick(matches[active].route);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, matches, onClose, open]);

  function pick(route: string): void {
    navigate(route);
    setQuery('');
    onClose();
  }

  return (
    <div className={cn('fixed inset-0 z-[80]', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={cn('absolute inset-0 bg-slate-950/45 backdrop-blur-sm transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute left-1/2 top-16 w-[min(720px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-2xl backdrop-blur-xl transition dark:border-white/10 dark:bg-slate-950/95',
          open ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-white/10">
          <Search size={18} className="text-slate-400" />
          <input
            id="command-palette-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Type merge, crop, compress, protect..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            Esc
          </kbd>
        </div>

        <div className="grid max-h-[70vh] gap-0 overflow-hidden md:grid-cols-[1fr_230px]">
          <div className="max-h-[70vh] overflow-y-auto thin-scroll p-2">
            {!matches.length ? (
              <EmptyState title="No tools found" description="Try a tool name, action, or file type." className="m-2" />
            ) : (
              <ul className="space-y-1">
                {matches.map((tool, index) => {
                  const Icon = tool.icon;
                  return (
                    <li key={tool.id}>
                      <button
                        type="button"
                        onClick={() => pick(tool.route)}
                        onMouseEnter={() => setActive(index)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                          active === index ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'hover:bg-slate-100 dark:hover:bg-white/5',
                        )}
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-600 shadow-sm dark:bg-white/5 dark:text-brand-300">
                          <Icon size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{tool.name}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{tool.description}</span>
                        </span>
                        <Badge variant={tool.runtime}>{tool.runtime}</Badge>
                        <ArrowRight size={15} className="text-slate-400" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <aside className="hidden border-l border-slate-200/80 p-3 dark:border-white/10 md:block">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <FileClock size={14} /> Recent files
            </div>
            <ul className="mt-2 space-y-1">
              {recents.slice(0, 5).map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-white/5"
                    onClick={() => file.route && pick(file.route)}
                  >
                    <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100">{file.name}</span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {humanSize(file.size)} {file.toolName ? `· ${file.toolName}` : ''}
                    </span>
                  </button>
                </li>
              ))}
              {!recents.length && (
                <li className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  Recent files appear after you drop files into a tool.
                </li>
              )}
            </ul>

            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Command size={14} /> Shortcuts
            </div>
            <dl className="mt-2 space-y-1">
              {SHORTCUTS.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2 text-[11px]">
                  <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd>
                    <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-medium dark:border-white/10 dark:bg-white/5">
                      {key}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}
