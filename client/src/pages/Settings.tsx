import { Trash2, Sun, Moon, Monitor } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../lib/theme';
import { Badge } from '../components/ui/Badge';
import { cn } from '../lib/cn';

export default function Settings() {
  const toast = useToast();
  const { theme, set } = useTheme();

  async function cleanup() {
    try {
      const r = await fetch('/api/temp/cleanup', { method: 'DELETE' });
      if (r.ok) toast('Temporary files cleared', 'success');
      else toast('Failed to clear', 'error');
    } catch (e: any) {
      toast(e?.message || 'Failed to clear', 'error');
    }
  }

  const themeOptions: { id: 'light' | 'dark'; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage theme, defaults, and local storage. Settings are saved on this device.
        </p>
      </header>

      <section className="card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Appearance</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose how the app looks.</p>
          </div>
          <Badge variant="muted">
            <Monitor size={11} /> Theme
          </Badge>
        </div>
        <div className="mt-4 flex gap-2">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => set(opt.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition border',
                  active
                    ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40 shadow-glow'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                )}
              >
                <Icon size={14} /> {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold">Local storage</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          All processing happens on your computer. Temporary files auto-expire after 1 hour, or clear them now.
        </p>
        <button className="btn-secondary mt-3" onClick={cleanup}>
          <Trash2 size={14} /> Clear temp files
        </button>
      </section>

      <section className="card">
        <h2 className="font-semibold">Keyboard shortcuts</h2>
        <ul className="text-sm text-slate-600 dark:text-slate-400 list-disc pl-5 space-y-1 mt-2">
          <li>Ctrl/Cmd+K — focus the search box</li>
          <li>Esc — close popovers</li>
        </ul>
      </section>
    </div>
  );
}
