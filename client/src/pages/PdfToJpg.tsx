import { useEffect, useRef, useState } from 'react';
import { FileImage, Server, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { loadPdfJs } from '../lib/pdfUtils';
import { parsePageRange } from '../lib/pageRange';
import { canvasToBlob } from '../lib/imageUtils';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { useCapabilities } from '../lib/capabilities';
import { postBackendPdf } from '../lib/backendPdf';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';
import { getQualityPreset, QUALITY_PRESETS, type OutputQualityPreset } from '../lib/qualityPresets';

type Scale = 1 | 2 | 3 | 4;
type Format = 'image/jpeg' | 'image/png' | 'image/webp';
type EngineMode = 'backend' | 'browser';

const SCALE_LABEL: Record<Scale, string> = {
  1: '1× (~72 dpi)',
  2: '2× (~144 dpi)',
  3: '3× (~216 dpi)',
  4: '4× (~288 dpi, hi-quality)',
};

const FORMAT_LABEL: Record<Format, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
};

const FORMAT_EXT: Record<Format, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export default function PdfToJpg() {
  const tool = findTool('pdf-to-jpg')!;
  const { settings } = useSettings();
  const caps = useCapabilities();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [engine, setEngine] = useState<EngineMode>('browser');
  const [qualityPreset, setQualityPreset] = useState<OutputQualityPreset>('balanced');
  const [scale, setScale] = useState<Scale>(2);
  const [format, setFormat] = useState<Format>('image/jpeg');
  const [quality, setQuality] = useState(0.92);
  const [pageRange, setPageRange] = useState('');
  const [pageCount, setPageCount] = useState<number>(0);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Probe page count when a file lands so the page-range hint is accurate.
  useEffect(() => {
    if (!file) {
      setPageCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const doc = await loadPdfJs(file.file);
        if (!cancelled) setPageCount(doc.numPages);
        await doc.destroy();
      } catch {
        /* surface only when the user actually runs the tool */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file?.id]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (qualityPreset === 'custom') return;
    const preset = getQualityPreset(qualityPreset);
    setQuality(preset.jpegQuality);
    setScale((preset.dpi >= 260 ? 4 : preset.dpi >= 190 ? 3 : preset.dpi >= 130 ? 2 : 1) as Scale);
  }, [qualityPreset]);

  const popplerAvailable = caps.status === 'ready' && caps.caps.poppler.available;
  useEffect(() => {
    if (popplerAvailable) setEngine('backend');
  }, [popplerAvailable]);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setError(undefined);
    setResult(null);
    setProgress(0);
    setMessage('Loading PDF…');

    try {
      if (engine === 'backend') {
        const targets = pageRange.trim()
          ? parsePageRange(pageRange, pageCount || 99999).map((i) => i + 1)
          : [];
        const firstPage = targets.length ? Math.min(...targets) : undefined;
        const lastPage = targets.length ? Math.max(...targets) : undefined;
        const backendFormat = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'png';
        const blob = await postBackendPdf('/api/backend/pdf/to-images', file.file, {
          signal: abortRef.current.signal,
          fields: {
            format: backendFormat,
            dpi: String(scale * 72),
            ...(firstPage ? { firstPage: String(firstPage) } : {}),
            ...(lastPage ? { lastPage: String(lastPage) } : {}),
          },
          onUploadProgress: (pct) => {
            setProgress(Math.min(95, pct));
            if (pct >= 100) setMessage('Rendering with Poppler...');
          },
        });
        setResult({
          kind: 'single',
          blob,
          suggestedName: applyNamePattern(settings.outputNamePattern, {
            name: file.file.name.replace(/\.pdf$/i, ''),
            tool: 'pdf-to-images',
            ext: '.zip',
          }),
        });
        setProgress(100);
        setMessage('Exported images with Poppler.');
        setState('success');
        return;
      }

      const doc = await loadPdfJs(file.file);
      const total = doc.numPages;
      const targets = pageRange.trim()
        ? parsePageRange(pageRange, total).map((i) => i + 1)
        : Array.from({ length: total }, (_, i) => i + 1);
      if (!targets.length) throw new Error('No valid pages selected.');

      const baseName = file.file.name.replace(/\.pdf$/i, '');
      const entries: { name: string; data: Blob }[] = [];
      for (let i = 0; i < targets.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        const pageNum = targets[i];
        setMessage(`Rendering page ${pageNum}`);
        const page = await doc.getPage(pageNum);
        try {
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(vp.width));
          canvas.height = Math.max(1, Math.floor(vp.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context not available');
          if (format === 'image/jpeg') {
            // JPEG can't carry alpha — flatten on white to avoid black bands.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          const blob = await canvasToBlob(canvas, format, quality);
          const name = applyNamePattern(settings.outputNamePattern, {
            name: `${baseName}-p${pageNum}`,
            tool: 'pdf-to-image',
            index: i,
            total: targets.length,
            ext: FORMAT_EXT[format],
          });
          entries.push({ name, data: blob });
        } finally {
          page.cleanup();
        }
        setProgress(Math.round(((i + 1) / targets.length) * 100));
      }
      await doc.destroy();

      if (entries.length === 1) {
        setResult({ kind: 'single', blob: entries[0].data as Blob, suggestedName: entries[0].name });
      } else {
        setResult({
          kind: 'many',
          entries,
          suggestedZipName: applyNamePattern(settings.outputNamePattern, {
            name: baseName,
            tool: 'pdf-to-image',
            ext: '.zip',
          }),
        });
      }
      setMessage(`Exported ${entries.length} image${entries.length === 1 ? '' : 's'}.`);
      setState('success');
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

  const previewBlob = result?.kind === 'single' ? result.blob : null;
  const showQuality = format !== 'image/png';

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={FileImage}
      runtime={tool.runtime}
      status={tool.status}
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept="pdf"
          multiple={false}
          hideZoneWhenFilled={files.length > 0}
          label="Drop a PDF"
          helperText={popplerAvailable ? 'Poppler backend is available for native PDF rendering.' : 'Pages will render in the browser via pdf.js.'}
        />
      }
      preview={
        <div className="space-y-4">
          {file && (
            <section className="card text-sm">
              <h3 className="font-semibold">{file.file.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {pageCount ? `${pageCount} pages` : 'Reading…'}
              </p>
            </section>
          )}
          {caps.status === 'ready' && (
            <section className={cn(
              'card text-sm flex items-start gap-2',
              popplerAvailable
                ? 'border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
            )}>
              {popplerAvailable ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}
              <p className="text-xs">
                {popplerAvailable ? 'Poppler detected. Backend export returns a ZIP of rendered images.' : 'Poppler not detected. Browser rendering remains available.'}
              </p>
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">First image preview</h3>
              <PreviewViewer source={previewBlob} type="image" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Engine</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => setEngine('backend')}
                disabled={!popplerAvailable}
                className={cn(
                  'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                  engine === 'backend'
                    ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                    : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  !popplerAvailable && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Server size={13} className="inline mr-1" /> Poppler backend
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">Best for long PDFs and native rendering.</span>
              </button>
              <button
                type="button"
                onClick={() => setEngine('browser')}
                className={cn(
                  'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                  engine === 'browser'
                    ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                    : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                )}
              >
                Browser renderer
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">Works offline in-browser; limited by device memory.</span>
              </button>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Pages</h3>
            <input
              className="input w-full mt-2"
              placeholder={pageCount ? `e.g. 1-${pageCount} (blank = all)` : '1-3,5,7-9'}
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
            />
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold">Output quality</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {QUALITY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setQualityPreset(preset.id)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                    qualityPreset === preset.id
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {preset.label}
                  <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold">Scale</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {([1, 2, 3, 4] as Scale[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQualityPreset('custom');
                    setScale(s);
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                    scale === s
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {SCALE_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Higher scale → bigger, sharper image and more memory per page.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold">Format</h3>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-xs font-medium border transition',
                    format === f
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
            {showQuality && (
              <label className="block mt-3">
                <span className="label">Quality ({Math.round(quality * 100)}%)</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => {
                    setQualityPreset('custom');
                    setQuality(Number(e.target.value));
                  }}
                  className="w-full accent-brand-600"
                />
              </label>
            )}
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
          actionLabel={engine === 'backend' ? 'Render with Poppler' : 'Convert to images'}
          actionDisabled={!file || (engine === 'backend' && !popplerAvailable)}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
