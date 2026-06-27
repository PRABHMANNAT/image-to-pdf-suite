import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
  SortableThumbnailGrid,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult, SortableThumb } from '../components/shared';
import { useSettings } from '../lib/settings';
import {
  FitMode,
  ImageToPdfOptions,
  LayoutMode,
  ProgressInfo,
  generatePdfFromImages,
} from '../lib/imageToPdf';
import { PageSizeId, PAGE_SIZES_MM } from '../lib/constants';
import { applyNamePattern } from '../lib/fileUtils';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

interface ToolState {
  pageSize: PageSizeId;
  orientation: 'portrait' | 'landscape' | 'auto';
  customWidthMm: number;
  customHeightMm: number;
  marginPreset: 'none' | 'small' | 'medium' | 'custom';
  marginMm: number;
  fit: FitMode;
  backgroundPreset: 'white' | 'black' | 'custom';
  backgroundHex: string;
  quality: 'high' | 'original' | 'compressed';
  layout: LayoutMode;
}

const MARGIN_PRESETS: Record<ToolState['marginPreset'], number> = {
  none: 0,
  small: 5,
  medium: 15,
  custom: 0,
};

const QUALITY_TO_JPEG: Record<ToolState['quality'], number> = {
  high: 95,
  original: 100,
  compressed: 70,
};

interface ImageToPdfProps {
  /** Lets the same component back the "Image to PDF" and "JPG to PDF" cards. */
  toolId?: 'image-to-pdf' | 'jpg-to-pdf';
}

export default function ImageToPdf({ toolId = 'image-to-pdf' }: ImageToPdfProps = {}) {
  const tool = findTool(toolId)!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [opts, setOpts] = useState<ToolState>(() => ({
    pageSize: settings.pdfPageSize,
    orientation: 'auto',
    customWidthMm: settings.pdfCustomWidthMm,
    customHeightMm: settings.pdfCustomHeightMm,
    marginPreset:
      settings.pdfMarginMm === 0
        ? 'none'
        : settings.pdfMarginMm === 5
          ? 'small'
          : settings.pdfMarginMm === 15
            ? 'medium'
            : 'custom',
    marginMm: settings.pdfMarginMm,
    fit: 'contain',
    backgroundPreset: 'white',
    backgroundHex: '#ffffff',
    quality: 'high',
    layout: 'single',
  }));

  const previewBlob = useMemo(() => (result?.kind === 'single' ? result.blob : null), [result]);

  const thumbs: SortableThumb[] = useMemo(
    () =>
      files.map((f) => ({
        id: f.id,
        src: f.url || f.thumbUrl || '',
        label: f.file.name,
        size: f.file.size,
      })),
    [files],
  );

  function onReorder(next: SortableThumb[]): void {
    const byId = new Map(files.map((f) => [f.id, f]));
    setFiles(next.map((n) => byId.get(n.id)).filter((x): x is AcceptedFile => Boolean(x)));
  }

  function onRemove(id: string): void {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((f) => f.id !== id);
    });
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function setMargin(preset: ToolState['marginPreset']): void {
    setOpts((o) => ({
      ...o,
      marginPreset: preset,
      marginMm: preset === 'custom' ? o.marginMm : MARGIN_PRESETS[preset],
    }));
  }

  function setBackground(preset: ToolState['backgroundPreset']): void {
    setOpts((o) => ({
      ...o,
      backgroundPreset: preset,
      backgroundHex: preset === 'white' ? '#ffffff' : preset === 'black' ? '#000000' : o.backgroundHex,
    }));
  }

  async function run(): Promise<void> {
    if (!files.length) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Reading images…');
    setError(undefined);
    setResult(null);

    const pdfOpts: ImageToPdfOptions = {
      pageSize: opts.pageSize,
      orientation: opts.orientation,
      customWidthMm: opts.customWidthMm,
      customHeightMm: opts.customHeightMm,
      marginMm: opts.marginMm,
      fit: opts.fit,
      backgroundHex: opts.backgroundHex,
      jpegQuality: QUALITY_TO_JPEG[opts.quality],
      layout: opts.layout,
    };

    try {
      const blob = await generatePdfFromImages(
        files.map((f) => f.file),
        pdfOpts,
        (info: ProgressInfo) => {
          setProgress(info.pct);
          setMessage(info.message);
        },
        abortRef.current.signal,
      );
      const baseName = files[0]?.file.name || 'images';
      const suggested = applyNamePattern(settings.outputNamePattern, {
        name: baseName,
        tool: toolId,
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob, suggestedName: suggested });
      setState('success');
      setMessage(`Created a ${files.length}-image PDF.`);
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        setMessage(undefined);
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
      icon={ImageIcon}
      runtime={tool.runtime}
      status={tool.status}
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept="image"
          multiple
          maxFiles={500}
          hideZoneWhenFilled={files.length > 0}
          label="Drop images or click to add"
          helperText="JPG, PNG, WEBP, GIF, TIFF, BMP — all processed locally."
        />
      }
      preview={
        <div className="space-y-4">
          {files.length > 0 && (
            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Drag to reorder · {files.length} images</h3>
              </div>
              <SortableThumbnailGrid items={thumbs} onReorder={onReorder} onRemove={onRemove} />
            </section>
          )}
          {result?.kind === 'single' && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Generated PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <h3 className="text-sm font-semibold">Page setup</h3>
          <label className="block">
            <span className="label">Page size</span>
            <select
              className="input w-full"
              value={opts.pageSize}
              onChange={(e) => setOpts({ ...opts, pageSize: e.target.value as PageSizeId })}
            >
              <option value="image">Match image</option>
              {(Object.keys(PAGE_SIZES_MM) as (keyof typeof PAGE_SIZES_MM)[]).map((id) => (
                <option key={id} value={id}>
                  {id.toUpperCase()}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          {opts.pageSize === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Width (mm)</span>
                <input
                  type="number"
                  className="input w-full"
                  value={opts.customWidthMm}
                  onChange={(e) => setOpts({ ...opts, customWidthMm: Number(e.target.value) || 210 })}
                />
              </label>
              <label className="block">
                <span className="label">Height (mm)</span>
                <input
                  type="number"
                  className="input w-full"
                  value={opts.customHeightMm}
                  onChange={(e) => setOpts({ ...opts, customHeightMm: Number(e.target.value) || 297 })}
                />
              </label>
            </div>
          )}
          <label className="block">
            <span className="label">Orientation</span>
            <div className="flex gap-1.5">
              {(['portrait', 'landscape', 'auto'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOpts({ ...opts, orientation: o })}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition capitalize',
                    opts.orientation === o
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          </label>

          <div className="border-t border-slate-200 dark:border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Margins</h3>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {(['none', 'small', 'medium', 'custom'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMargin(m)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium border transition capitalize',
                    opts.marginPreset === m
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            {opts.marginPreset === 'custom' && (
              <input
                type="number"
                min={0}
                max={50}
                className="input w-full mt-2"
                value={opts.marginMm}
                onChange={(e) => setOpts({ ...opts, marginMm: Number(e.target.value) || 0 })}
              />
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Image fit</h3>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(['contain', 'cover', 'stretch', 'actual'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setOpts({ ...opts, fit: f })}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-xs font-medium border transition capitalize',
                    opts.fit === f
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Background</h3>
            <div className="mt-2 flex gap-2 items-center">
              {(['white', 'black', 'custom'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBackground(b)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium border transition capitalize',
                    opts.backgroundPreset === b
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {b}
                </button>
              ))}
              {opts.backgroundPreset === 'custom' && (
                <input
                  type="color"
                  className="h-8 w-10 rounded cursor-pointer"
                  value={opts.backgroundHex}
                  onChange={(e) => setOpts({ ...opts, backgroundHex: e.target.value })}
                />
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Quality</h3>
            <div className="mt-2 flex gap-1.5">
              {(['high', 'original', 'compressed'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setOpts({ ...opts, quality: q })}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition capitalize',
                    opts.quality === q
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              JPG/PNG bytes pass through unchanged for high/original.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Layout</h3>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(['single', '2x1', '1x2', '2x2', '3x3'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setOpts({ ...opts, layout: l })}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-xs font-medium border transition',
                    opts.layout === l
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {l === 'single' ? '1 / page' : `${l} grid`}
                </button>
              ))}
            </div>
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
          actionLabel="Create PDF"
          actionDisabled={!files.length}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
