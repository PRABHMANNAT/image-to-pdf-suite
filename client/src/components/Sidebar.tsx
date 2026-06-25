import { NavLink } from 'react-router-dom';
import { Image as ImgIcon, Crop, FilePlus, Scissors, FileEdit, Settings, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

const NAV = [
  { to: '/', label: 'Image to PDF', icon: ImgIcon },
  { to: '/crop', label: 'Crop Image', icon: Crop },
  { to: '/merge', label: 'Merge PDF', icon: FilePlus },
  { to: '/split', label: 'Split PDF', icon: Scissors },
  { to: '/edit', label: 'PDF Page Editor', icon: FileEdit },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  return (
    <aside className="w-60 shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 min-h-screen p-4 flex flex-col">
      <div className="font-bold text-lg mb-4 text-brand-600">Ultra PDF Toolkit</div>
      <nav className="flex-1 space-y-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm ' +
              (isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-white'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700')
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <button className="btn-ghost mt-2" onClick={() => setDark((v) => !v)}>
        {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Light mode' : 'Dark mode'}
      </button>
      <p className="text-[11px] text-slate-500 mt-3 leading-snug">
        Files are processed locally on your computer. Nothing is uploaded to any external server.
      </p>
    </aside>
  );
}
