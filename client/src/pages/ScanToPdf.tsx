import { useEffect, useMemo, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import {
  DEFAULT_FILTERS,
  FilterOptions,
  applyFiltersToBlob,
} from '../lib/imageFilters';
import { generatePdfFromImages } from '../lib/imageToPdf';
import { findTool } from '../lib/tools';
import { useSettings } from '../lib/settings';
import { applyNamePattern } from '../lib/fileUtils';
import { cn } from '../lib/cn';

export default function ScanToPdf() {
  const tool = findTool('scan-to-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const previewBlob = useMemo(() => (result?.kind === 'single' ? result.blob : null), [result]);

  useEffect(() => {
    if (!activeId && files.length) setActiveId(files[0].id);
    if (activeId && !files.some((f) => f.id === activeId)) setActiveId(files[0]?.id ?? null);
  }, [files, activeId]);

  const active = useMemo(() => files.find((f) => f.id === activeId) || null, [files, activeId]);

  // Re-render the live filter preview whenever the active image or filters change.
  useEffect(() => {
    if (!active) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const blob = await applyFiltersToBlob(active.file, filters, 'image/jpeg', 0.85);
        if (cancelled) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
      } catch {
        /* swallow — surfaced on Apply */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, filters]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setFilter<K extends keyof FilterOptions>(key: K, value: FilterOptions[K]): void {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function run(): Promise<void> {
    if (!files.length) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Applying enhancements…');
    setError(undefined);
    setResult(null);

    try {
      const enhanced: File[] = [];
      for (let i = 0; i < files.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        const f = files[i];
        const blob = await applyFiltersToBlob(f.file, filters, 'image/jpeg', 0.92);
        const newName = f.file.name.replace(/\.[^.]+$/, '') + '.jpg';
        enhanced.push(new File([blob], newName, { type: 'image/jpeg' }));
        setProgress(Math.round(((i + 1) / files.length) * 60));
        setMessage(`Enhanced ${i + 1}/${files.length}`);
      }

      const pdf = await generatePdfFromImages(
        enhanced,
        {
          pageSize: 'a4',
          orientation: 'portrait',
          marginMm: 8,
          fit: 'contain',
          backgroundHex: '#ffffff',
          jpegQuality: 92,
          layout: 'single',
        },
        (info) => {
          setProgress(60 + Math.round(info.pct * 0.4));
          setMessage(info.message);
        },
        abortRef.current.signal,
      );

      const suggested = applyNamePattern(settings.outputNamePattern, {
        name: 'scan',
        tool: 'scan-to-pdf',
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob: pdf, suggestedName: suggested });
      setState('success');
      setMessage(`Created a ${files.length}-page scanned PDF.`);
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        return;
      }
      setState('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function reset(): void {
    abortRef.current?.abort();
    setState('idle');
    setResult(null);
    setProgress(0);
    setMessage(undefined);
    setError(undefined);
  }

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={ScanLine}
      runtime={tool.runtime}
      status="beta"
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept="image"
          multiple
          maxFiles={200}
          hideZoneWhenFilled={files.length > 0}
          label="Drop phone-scanned page images"
          helperText="Tip: crop each page first with Crop Image for a cleaner result."
        />
      }
      preview={
        <div className="space-y-4">
          {active && previewUrl ? (
            <section className="card">
              <h3 className="text-sm font-semibold mb-2">Enhanced preview · {active.file.name}</h3>
              <div className="bg-slate-100 dark:bg-slate-950/40 rounded-xl p-3 grid place-items-center">
                <img
                  src={previewUrl}
                  alt="enhanced"
                  className="max-h-[70vh] object-contain rounded shadow-soft dark:shadow-soft-dark"
                />
              </div>
            </section>
          ) : (
            <div className="card text-center text-sm text-slate-500 dark:text-slate-400 py-12">
              Drop scanned pages above to begin.
            </div>
          )}
          {files.length > 1 && (
            <div className="card p-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Active page — click to switch ({files.length} total)
              </div>
              <div className="flex gap-2 overflow-x-auto thin-scroll">
                {files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveId(f.id)}
                    className={cn(
                      'shrink-0 w-16 h-20 rounded-lg overflow-hidden border-2 transition',
                      f.id === activeId
                        ? 'border-brand-500 shadow-glow'
                        : 'border-transparent hover:border-brand-500/40',
                    )}
                  >
                    <img src={f.url || ''} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {result?.kind === 'single' && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Final PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Enhancements</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Applied to every page. Preview updates as you tweak.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.grayscale}
              onChange={(e) => setFilter('grayscale', e.target.checked)}
              className="accent-brand-600"
            />
            Grayscale
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.blackAndWhite}
              onChange={(e) => setFilter('blackAndWhite', e.target.checked)}
              className="accent-brand-600"
            />
            Black &amp; white (threshold)
          </label>
          {filters.blackAndWhite && (
            <label className="block ml-6 -mt-2">
              <span className="label">Threshold ({filters.threshold})</span>
              <input
                type="range"
                min={0}
                max={255}
                value={filters.threshold}
                onChange={(e) => setFilter('threshold', Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            </label>
          )}

          <label className="block">
            <span className="label">Contrast ({filters.contrast})</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={filters.contrast}
              onChange={(e) => setFilter('contrast', Number(e.target.value))}
              className="w-full accent-brand-600"
            />
          </label>

          <label className="block">
            <span className="label">Brightness ({filters.brightness})</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={filters.brightness}
              onChange={(e) => setFilter('brightness', Number(e.target.value))}
              className="w-full accent-brand-600"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.sharpen}
              onChange={(e) => setFilter('sharpen', e.target.checked)}
              className="accent-brand-600"
            />
            Sharpen (3×3 kernel)
          </label>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="btn-ghost text-xs"
            >
              Reset filters
            </button>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Deskew is not yet available locally. Use Crop Image to straighten manually.
            </p>
          </div>
        </section>
      }
      action={
        <ProcessingPanel
          files={files}
          state={state}
          progress={progress}
          message={message}
          error={error}
          onAction={run}
          actionLabel="Create scanned PDF"
          actionDisabled={!files.length}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
