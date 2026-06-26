import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Moon, Sun, Settings as SettingsIcon, Clock, Menu, X } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { Badge } from '../ui/Badge';
import { TOOLS } from '../../lib/tools';
import { useTheme } from '../../lib/theme';
import { cn } from '../../lib/cn';

interface Props {
  onToggleMobileSidebar: () => void;
  mobileSidebarOpen: boolean;
}

export function TopBar({ onToggleMobileSidebar, mobileSidebarOpen }: Props) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [] as typeof TOOLS;
    return TOOLS.filter(
      (t) => t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle),
    ).slice(0, 8);
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        (document.getElementById('global-search') as HTMLInputElement | null)?.focus();
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function pick(route: string) {
    setOpen(false);
    setQ('');
    navigate(route);
  }

  return (
    <header className="sticky top-0 z-30 px-4 pt-4">
      <div className="glass rounded-2xl px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          aria-label="Toggle navigation"
          className="lg:hidden btn-ghost p-2 -ml-1"
        >
          {mobileSidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <div className="hidden sm:flex items-center gap-2 min-w-0">
          <div className="font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            Ultra PDF <span className="text-brand-600 dark:text-brand-400">Toolkit</span>
          </div>
        </div>

        <div ref={wrapRef} className="relative flex-1 max-w-xl mx-auto">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              id="global-search"
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search tools…  (Ctrl+K)"
              className={cn(
                'w-full pl-9 pr-3 py-2 rounded-xl text-sm',
                'bg-white/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-white/10',
                'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50',
              )}
            />
          </div>
          {open && matches.length > 0 && (
            <div className="absolute z-50 mt-2 w-full glass rounded-xl overflow-hidden animate-fade-in">
              <ul className="max-h-80 overflow-y-auto thin-scroll py-1">
                {matches.map((t) => {
                  const Icon = t.icon;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => pick(t.route)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100/80 dark:hover:bg-white/5"
                      >
                        <span className="grid place-items-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5">
                          <Icon size={16} className="text-slate-600 dark:text-slate-300" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate font-medium">{t.name}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{t.description}</span>
                        </span>
                        <Badge variant={t.status === 'ready' ? 'ready' : t.status === 'beta' ? 'beta' : 'coming-soon'}>
                          {t.status === 'ready' ? 'Ready' : t.status === 'beta' ? 'Beta' : 'Soon'}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Tooltip label="Recent files" side="bottom">
            <button
              type="button"
              aria-label="Recent files"
              className="btn-ghost p-2"
              onClick={() => {
                // Placeholder until a recents store is added.
                const el = document.getElementById('global-search') as HTMLInputElement | null;
                el?.focus();
              }}
            >
              <Clock size={18} />
            </button>
          </Tooltip>
          <Tooltip label={theme === 'dark' ? 'Light mode' : 'Dark mode'} side="bottom">
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={toggle}
              className="btn-ghost p-2"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </Tooltip>
          <Tooltip label="Settings" side="bottom">
            <button
              type="button"
              aria-label="Settings"
              onClick={() => navigate('/settings')}
              className="btn-ghost p-2"
            >
              <SettingsIcon size={18} />
            </button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
