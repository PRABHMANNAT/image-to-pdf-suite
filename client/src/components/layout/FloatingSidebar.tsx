import { NavLink, useLocation } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CATEGORIES, Category } from '../../lib/tools';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../../lib/cn';

const STORAGE_KEY = 'sidebar:collapsed';

function categoryRoute(cat: Category): string {
  if (cat.id === 'dashboard') return '/';
  if (cat.id === 'settings') return '/settings';
  return `/category/${cat.id}`;
}

interface Props {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export function FloatingSidebar({ collapsed, setCollapsed }: Props) {
  const location = useLocation();

  // Persist collapse state.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <aside
      className={cn(
        'fixed left-4 top-4 bottom-4 z-40 flex flex-col rounded-2xl glass thin-scroll transition-[width] duration-300 ease-out',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
      aria-label="Primary"
    >
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <div className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow-glow shrink-0">
          <Sparkles size={18} />
        </div>
        {!collapsed && (
          <div className="min-w-0 animate-fade-in">
            <div className="text-sm font-bold tracking-tight">Ultra PDF</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Local-first toolkit</div>
          </div>
        )}
      </div>

      <div className="px-2">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300/60 dark:via-white/10 to-transparent" />
      </div>

      <nav className="flex-1 overflow-y-auto thin-scroll px-2 py-3 space-y-0.5">
        {CATEGORIES.map((cat) => {
          const to = categoryRoute(cat);
          const isActive =
            (to === '/' && location.pathname === '/') ||
            (to !== '/' && location.pathname.startsWith(to));
          const Icon = cat.icon;
          const link = (
            <NavLink
              to={to}
              end={to === '/'}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                'outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'text-brand-700 dark:text-white bg-brand-50/80 dark:bg-brand-500/15 shadow-glow ring-1 ring-brand-500/40'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-white/5',
              )}
            >
              {isActive && (
                <span
                  className="absolute -left-2 top-2 bottom-2 w-1 rounded-full bg-gradient-to-b from-brand-400 to-indigo-500 shadow-[0_0_12px_2px_rgba(59,130,246,0.55)]"
                  aria-hidden
                />
              )}
              <Icon
                size={18}
                className={cn(
                  'shrink-0 transition',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200',
                )}
              />
              {!collapsed && <span className="truncate">{cat.name}</span>}
            </NavLink>
          );
          return (
            <div key={cat.id}>
              {collapsed ? (
                <Tooltip label={cat.name} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-2 pb-3">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium',
            'text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-white/5 hover:bg-slate-200/70 dark:hover:bg-white/10 transition',
          )}
        >
          {collapsed ? <ChevronsRight size={16} /> : (<><ChevronsLeft size={16} /> Collapse</>)}
        </button>
      </div>
    </aside>
  );
}

export function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === '1';
}
