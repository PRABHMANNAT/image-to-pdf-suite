import { Trash2, Sun, Moon, Monitor, RotateCcw, KeyRound } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../lib/theme';
import { useSettings } from '../lib/settings';
import { OCR_LANGUAGES, PAGE_SIZES_MM, type PageSizeId, type CompressionLevel } from '../lib/constants';
import { Badge } from '../components/ui/Badge';
import { cn } from '../lib/cn';

export default function Settings() {
  const toast = useToast();
  const { theme, set: setTheme } = useTheme();
  const { settings, set, reset } = useSettings();

  async function cleanup() {
    try {
      const r = await fetch('/api/temp/cleanup', { method: 'DELETE' });
      if (r.ok) toast('Temporary files cleared', 'success');
      else toast('Failed to clear', 'error');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to clear';
      toast(msg, 'error');
    }
  }

  const themeOptions: { id: 'light' | 'dark'; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
  ];

  const pageSizeOptions: { id: PageSizeId; label: string }[] = [
    { id: 'image', label: 'Match image' },
    ...(Object.keys(PAGE_SIZES_MM) as (keyof typeof PAGE_SIZES_MM)[]).map((id) => ({
      id,
      label: id.toUpperCase(),
    })),
    { id: 'custom', label: 'Custom' },
  ];

  const compressionOptions: CompressionLevel[] = ['low', 'medium', 'high', 'maximum'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Defaults applied to every tool. Saved on this device.
        </p>
      </header>

      {/* Appearance */}
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
                onClick={() => setTheme(opt.id)}
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

      {/* PDF defaults */}
      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">PDF defaults</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Applied to every Image-to-PDF and conversion tool.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Page size</span>
            <select
              className="input w-full"
              value={settings.pdfPageSize}
              onChange={(e) => set('pdfPageSize', e.target.value as PageSizeId)}
            >
              {pageSizeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Orientation</span>
            <select
              className="input w-full"
              value={settings.pdfOrientation}
              onChange={(e) => set('pdfOrientation', e.target.value as 'portrait' | 'landscape')}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Margin (mm)</span>
            <input
              type="number"
              min={0}
              max={50}
              className="input w-full"
              value={settings.pdfMarginMm}
              onChange={(e) => set('pdfMarginMm', Number(e.target.value) || 0)}
            />
          </label>
          {settings.pdfPageSize === 'custom' && (
            <div className="grid grid-cols-2 gap-2 col-span-full">
              <label className="block">
                <span className="label">Custom width (mm)</span>
                <input
                  type="number"
                  className="input w-full"
                  value={settings.pdfCustomWidthMm}
                  onChange={(e) => set('pdfCustomWidthMm', Number(e.target.value) || 210)}
                />
              </label>
              <label className="block">
                <span className="label">Custom height (mm)</span>
                <input
                  type="number"
                  className="input w-full"
                  value={settings.pdfCustomHeightMm}
                  onChange={(e) => set('pdfCustomHeightMm', Number(e.target.value) || 297)}
                />
              </label>
            </div>
          )}
        </div>
      </section>

      {/* Quality */}
      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">Quality</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Used by image-export and compression tools.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Image quality ({settings.imageQuality})</span>
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              className="w-full accent-brand-600"
              value={settings.imageQuality}
              onChange={(e) => set('imageQuality', Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="label">Compression level</span>
            <select
              className="input w-full"
              value={settings.compressionLevel}
              onChange={(e) => set('compressionLevel', e.target.value as CompressionLevel)}
            >
              {compressionOptions.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Output naming */}
      <section className="card">
        <h2 className="font-semibold">Output naming</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Tokens:{' '}
          <code className="text-[11px]">{'{name}'}</code>,{' '}
          <code className="text-[11px]">{'{tool}'}</code>,{' '}
          <code className="text-[11px]">{'{date}'}</code>,{' '}
          <code className="text-[11px]">{'{time}'}</code>,{' '}
          <code className="text-[11px]">{'{index}'}</code>.
        </p>
        <input
          className="input w-full mt-3"
          value={settings.outputNamePattern}
          onChange={(e) => set('outputNamePattern', e.target.value)}
        />
      </section>

      {/* Preview + OCR */}
      <section className="card space-y-4">
        <h2 className="font-semibold">Preview &amp; OCR</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Default preview zoom ({Math.round(settings.previewZoom * 100)}%)</span>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.25}
              className="w-full accent-brand-600"
              value={settings.previewZoom}
              onChange={(e) => set('previewZoom', Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="label">OCR language</span>
            <select
              className="input w-full"
              value={settings.ocrLanguage}
              onChange={(e) => set('ocrLanguage', e.target.value)}
            >
              {OCR_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* AI provider */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Optional AI provider</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Used by PDF Intelligence tools only when you choose provider mode.
            </p>
          </div>
          <Badge variant="hybrid">
            <KeyRound size={11} /> Optional
          </Badge>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="label">OpenAI-compatible endpoint</span>
            <input
              className="input w-full"
              value={settings.aiEndpoint}
              onChange={(e) => set('aiEndpoint', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block">
            <span className="label">Model</span>
            <input
              className="input w-full"
              value={settings.aiModel}
              onChange={(e) => set('aiModel', e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </label>
          <label className="block">
            <span className="label">API key</span>
            <input
              type="password"
              className="input w-full"
              value={settings.aiApiKey}
              onChange={(e) => set('aiApiKey', e.target.value)}
              placeholder="Leave blank to use server .env"
              autoComplete="off"
            />
          </label>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Local summarization does not use this. High-quality summaries and translation require a compatible provider, a server .env key, or a key you enter here.
        </p>
      </section>

      {/* Storage + reset */}
      <section className="card">
        <h2 className="font-semibold">Local storage</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          All processing happens on your computer. Server temp files auto-expire after 1 hour, or clear them now.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={cleanup}>
            <Trash2 size={14} /> Clear temp files
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              reset();
              toast('Settings reset to defaults', 'success');
            }}
          >
            <RotateCcw size={14} /> Reset all settings
          </button>
        </div>
      </section>
    </div>
  );
}
