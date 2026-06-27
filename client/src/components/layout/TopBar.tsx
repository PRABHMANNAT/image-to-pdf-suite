import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Clock,
  FileText,
  Grid3X3,
  ListChecks,
  Menu,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  UserCircle2,
  X,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { useTheme } from '../../lib/theme';
import { cn } from '../../lib/cn';
import { CommandPalette } from './CommandPalette';
import { BatchQueueDrawer } from './BatchQueueDrawer';
import {
  clearRecentFiles,
  readRecentFiles,
  subscribeRecentFiles,
  type RecentFile,
} from '../../lib/recentFiles';
import { humanSize } from '../../lib/fileUtils';
import { EmptyState } from '../shared/EmptyState';
import { useBatchQueue } from '../../lib/batchQueue';
import { CATEGORIES, TOOLS, toolsByCategory, type CategoryId, type Tool } from '../../lib/tools';

type MenuState = 'convert' | 'all' | 'mobile' | null;

const DIRECT_LINKS = [
  { label: 'Merge PDF', route: '/tools/merge-pdf' },
  { label: 'Split PDF', route: '/tools/split-pdf' },
  { label: 'Compress PDF', route: '/tools/compress-pdf' },
];

const CATEGORY_ORDER: CategoryId[] = [
  'organize',
  'optimize',
  'convert-to',
  'convert-from',
  'edit',
  'security',
  'intelligence',
];

const TOOL_ACCENT: Record<CategoryId, string> = {
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

function ToolMenuItem({ tool, onPick, compact }: { tool: Tool; onPick: () => void; compact?: boolean }) {
  const Icon = tool.icon;
  return (
    <Link
      to={tool.route}
      onClick={onPick}
      className={cn(
        'group flex items-center gap-3 rounded-lg transition',
        compact ? 'px-2 py-2' : 'px-3 py-2.5',
        'hover:bg-slate-100/80 dark:hover:bg-white/[0.06]',
      )}
    >
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md', TOOL_ACCENT[tool.category])}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          {tool.name}
        </span>
        {!compact && (
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
            {tool.runtime === 'backend' ? 'Backend engine' : tool.runtime === 'hybrid' ? 'Browser + backend' : 'Browser-only'}
          </span>
        )}
      </span>
    </Link>
  );
}

function CategoryColumn({ id, onPick }: { id: CategoryId; onPick: () => void }) {
  const category = CATEGORIES.find((item) => item.id === id);
  const tools = toolsByCategory(id);
  if (!category || !tools.length) return null;
  const Icon = category.icon;
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icon size={15} /> {category.name}
      </div>
      <div className="space-y-1">
        {tools.map((tool) => (
          <ToolMenuItem key={tool.id} tool={tool} onPick={onPick} compact />
        ))}
      </div>
    </div>
  );
}

export function TopBar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<MenuState>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [recents, setRecents] = useState<RecentFile[]>(() => readRecentFiles());
  const { items } = useBatchQueue();
  const activeJobs = items.filter((item) => item.state === 'processing').length;

  const convertTo = useMemo(() => toolsByCategory('convert-to'), []);
  const convertFrom = useMemo(() => toolsByCategory('convert-from'), []);

  useEffect(() => subscribeRecentFiles(() => setRecents(readRecentFiles())), []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpenMenu(null);
        setRecentsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (!isTyping && e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === 'Escape') {
        setOpenMenu(null);
        setRecentsOpen(false);
        setQueueOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function closeMenus(): void {
    setOpenMenu(null);
    setRecentsOpen(false);
  }

  function openRecent(file: RecentFile): void {
    if (!file.route) return;
    navigate(file.route);
    closeMenus();
  }

  return (
    <>
      <header ref={wrapRef} className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/[0.76] backdrop-blur-2xl dark:border-white/10 dark:bg-[#111114]/[0.78]">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 sm:px-6">
          <Link to="/" onClick={closeMenus} className="flex shrink-0 items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-500 text-white shadow-[0_10px_30px_-14px_rgba(239,68,68,0.9)]">
              <FileText size={18} />
            </span>
            <span className="hidden text-xl font-black tracking-tight text-slate-950 dark:text-white sm:block">
              Ultra<span className="text-red-500">PDF</span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Primary navigation">
            {DIRECT_LINKS.map((item) => (
              <NavLink
                key={item.route}
                to={item.route}
                onClick={closeMenus}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition',
                    isActive
                      ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}

            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'convert' ? null : 'convert')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition',
                openMenu === 'convert'
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10',
              )}
            >
              Convert PDF <ChevronDown size={15} className={cn('transition', openMenu === 'convert' && 'rotate-180')} />
            </button>

            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'all' ? null : 'all')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition',
                openMenu === 'all'
                  ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-200'
                  : 'text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10',
              )}
            >
              All PDF Tools <ChevronDown size={15} className={cn('transition', openMenu === 'all' && 'rotate-180')} />
            </button>
          </nav>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden min-w-[220px] items-center gap-2 rounded-full border border-slate-200 bg-slate-50/90 px-3 py-2 text-left text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.09] xl:flex"
          >
            <Search size={15} />
            <span className="min-w-0 flex-1 truncate">Quick search</span>
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/10">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'mobile' ? null : 'mobile')}
              aria-label="Open navigation"
              className="btn-ghost p-2 lg:hidden"
            >
              {openMenu === 'mobile' ? <X size={19} /> : <Menu size={19} />}
            </button>
            <Tooltip label="Search tools" side="bottom">
              <button type="button" aria-label="Search tools" className="btn-ghost p-2 xl:hidden" onClick={() => setPaletteOpen(true)}>
                <Search size={18} />
              </button>
            </Tooltip>
            <Tooltip label="Recent files" side="bottom">
              <button
                type="button"
                aria-label="Recent files"
                className="btn-ghost p-2"
                onClick={() => {
                  setRecentsOpen((value) => !value);
                  setOpenMenu(null);
                }}
              >
                <Clock size={18} />
              </button>
            </Tooltip>
            <Tooltip label="Batch queue" side="bottom">
              <button type="button" aria-label="Batch queue" className="btn-ghost relative p-2" onClick={() => setQueueOpen(true)}>
                <ListChecks size={18} />
                {activeJobs > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#111114]" />}
              </button>
            </Tooltip>
            <Tooltip label={theme === 'dark' ? 'Light mode' : 'Dark mode'} side="bottom">
              <button type="button" aria-label="Toggle theme" onClick={toggle} className="btn-ghost p-2">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </Tooltip>
            <Tooltip label="Settings" side="bottom">
              <button type="button" aria-label="Settings" onClick={() => navigate('/settings')} className="btn-ghost p-2">
                <SettingsIcon size={18} />
              </button>
            </Tooltip>
            <span className="hidden h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-white/[0.06] sm:grid">
              <UserCircle2 size={22} />
            </span>
          </div>
        </div>

        {openMenu === 'convert' && (
          <div className="absolute left-1/2 top-full w-[min(700px,calc(100vw-24px))] -translate-x-1/2 pt-3 animate-slide-up">
            <div className="mx-auto h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white dark:border-white/10 dark:bg-[#18181b]" />
            <div className="-mt-1 grid gap-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#18181b] sm:grid-cols-2">
              <div>
                <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Convert to PDF</h2>
                <div className="space-y-1">
                  {convertTo.map((tool) => (
                    <ToolMenuItem key={tool.id} tool={tool} onPick={closeMenus} />
                  ))}
                </div>
              </div>
              <div>
                <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Convert from PDF</h2>
                <div className="space-y-1">
                  {convertFrom.map((tool) => (
                    <ToolMenuItem key={tool.id} tool={tool} onPick={closeMenus} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {openMenu === 'all' && (
          <div className="absolute left-0 right-0 top-full pt-3 animate-slide-up">
            <div className="mx-auto h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white dark:border-white/10 dark:bg-[#18181b]" />
            <div className="-mt-1 border-y border-slate-200 bg-white p-8 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#18181b]">
              <div className="mx-auto grid max-w-[1500px] gap-8 lg:grid-cols-4 xl:grid-cols-7">
                {CATEGORY_ORDER.map((id) => (
                  <CategoryColumn key={id} id={id} onPick={closeMenus} />
                ))}
              </div>
            </div>
          </div>
        )}

        {openMenu === 'mobile' && (
          <div className="fixed left-3 right-3 top-[76px] z-[60] max-h-[calc(100vh-88px)] overflow-y-auto thin-scroll lg:hidden animate-slide-up">
            <div className="rounded-2xl border border-slate-200 bg-[#fbfaf7] p-3 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#18181b]">
              <button
                type="button"
                onClick={() => {
                  setPaletteOpen(true);
                  closeMenus();
                }}
                className="mb-2 flex w-full items-center gap-2 rounded-xl bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300"
              >
                <Search size={16} /> Quick search
              </button>
              <div className="grid gap-2 sm:grid-cols-2">
                {DIRECT_LINKS.map((item) => (
                  <Link key={item.route} to={item.route} onClick={closeMenus} className="rounded-xl px-3 py-3 text-sm font-bold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10">
                    {item.label}
                  </Link>
                ))}
                {TOOLS.slice(0, 18).map((tool) => (
                  <ToolMenuItem key={tool.id} tool={tool} onPick={closeMenus} compact />
                ))}
              </div>
            </div>
          </div>
        )}

        {recentsOpen && (
          <div className="absolute right-4 top-full mt-3 w-[min(380px,calc(100vw-32px))] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl backdrop-blur-2xl animate-slide-up dark:border-white/10 dark:bg-[#18181b]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent files</h2>
              {recents.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300"
                  onClick={() => {
                    clearRecentFiles();
                    setRecentsOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {!recents.length ? (
              <EmptyState
                icon={Clock}
                title="No recent files"
                description="Dropped files are remembered locally by name, size, and tool."
                className="py-7"
              />
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto thin-scroll">
                {recents.map((file) => (
                  <li key={file.id}>
                    <button type="button" className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5" onClick={() => openRecent(file)}>
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{file.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {humanSize(file.size)} {file.toolName ? `- ${file.toolName}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <BatchQueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
    </>
  );
}
