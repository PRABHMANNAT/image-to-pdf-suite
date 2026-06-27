import { useEffect, useMemo, useRef, useState } from 'react';
import { Minimize2, Info, Server, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  ProcessingPanel,
  DownloadResult,
  BeforeAfterPreview,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import {
  CompressPreset,
  compressPdf,
} from '../lib/pdfCompress';
import { applyNamePattern, humanSize } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { useCapabilities } from '../lib/capabilities';
import { postBackendPdf } from '../lib/backendPdf';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';
import { getQualityPreset, QUALITY_PRESETS, type OutputQualityPreset } from '../lib/qualityPresets';

type EngineMode = 'backend' | 'browser';
type GsPreset = 'screen' | 'ebook' | 'printer' | 'prepress';

export default function CompressPdf() {
  const tool = findTool('compress-pdf')!;
  const { settings } = useSettings();
  const caps = useCapabilities();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [engine, setEngine] = useState<EngineMode>('browser');
  const [gsPreset, setGsPreset] = useState<GsPreset>('ebook');
  const [qualityPreset, setQualityPreset] = useState<OutputQualityPreset>('balanced');
  const [lossless, setLossless] = useState(false);
  const [customDpi, setCustomDpi] = useState(150);
  const [customQuality, setCustomQuality] = useState(0.78);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const gsAvailable = caps.status === 'ready' && caps.caps.ghostscript.available;

  useEffect(() => {
    if (gsAvailable) setEngine('backend');
  }, [gsAvailable]);

  const originalSize = file?.file.size ?? 0;
  const outSize = result?.kind === 'single' ? result.blob.size : 0;
  const saving = originalSize > 0 && outSize > 0 ? 1 - outSize / originalSize : 0;

  const expected = useMemo(() => {
    // Very rough heuristic for the "estimated size" hint — true size is only
    // known once we actually compress. We just give the user a ballpark.
    if (!originalSize) return null;
    if (lossless || qualityPreset === 'maximum') return originalSize * 0.85;
    if (qualityPreset === 'balanced') return originalSize * 0.45;
    if (qualityPreset === 'small') return originalSize * 0.22;
    // custom: estimate from DPI + quality
    const dpiFactor = Math.min(1, customDpi / 200);
    return originalSize * Math.max(0.1, dpiFactor * customQuality);
  }, [originalSize, qualityPreset, lossless, customDpi, customQuality]);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setError(undefined);
    setResult(null);
    setProgress(0);
    setMessage(lossless ? 'Re-saving (lossless)…' : 'Rasterising pages…');

    try {
      let blob: Blob;
      if (engine === 'backend') {
        blob = await postBackendPdf('/api/backend/pdf/compress', file.file, {
          signal: abortRef.current.signal,
          fields: { preset: gsPreset },
          onUploadProgress: (pct) => {
            setProgress(Math.min(95, pct));
            if (pct >= 100) setMessage('Compressing with Ghostscript...');
          },
        });
      } else {
        const mappedPreset: CompressPreset =
          qualityPreset === 'maximum'
            ? 'low'
            : qualityPreset === 'balanced'
              ? 'medium'
              : qualityPreset === 'small'
                ? 'high'
                : 'custom';
        const selected = getQualityPreset(qualityPreset);
        blob = await compressPdf(
          file.file,
          {
            preset: mappedPreset,
            lossless,
            customDpi: qualityPreset === 'custom' ? customDpi : selected.dpi,
            customQuality: qualityPreset === 'custom' ? customQuality : selected.jpegQuality,
          },
          (info) => {
            setProgress(info.pct);
            if (info.message) setMessage(info.message);
          },
          abortRef.current.signal,
        );
      }
      const name = applyNamePattern(settings.outputNamePattern, {
        name: file.file.name.replace(/\.pdf$/i, ''),
        tool: 'compressed',
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob, suggestedName: name });
      setMessage(`${humanSize(file.file.size)} → ${humanSize(blob.size)} (${Math.round((1 - blob.size / file.file.size) * 100)}% smaller)`);
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

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Minimize2}
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
          label="Drop a PDF to compress"
          helperText={gsAvailable ? 'Ghostscript backend available for deeper compression.' : 'Browser-only compression is available.'}
        />
      }
      preview={
        <div className="space-y-4">
          {file && (
            <section className="card">
              <h3 className="text-sm font-semibold">Size</h3>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Original</div>
                  <div className="tabular-nums font-semibold">{humanSize(originalSize)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Estimated</div>
                  <div className="tabular-nums font-semibold text-brand-600 dark:text-brand-300">
                    ~ {expected ? humanSize(expected) : '—'}
                  </div>
                </div>
                {outSize > 0 && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Actual</div>
                    <div className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-300">
                      {humanSize(outSize)}
                      {saving > 0 && <span className="ml-1 text-xs">(−{Math.round(saving * 100)}%)</span>}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
          {caps.status === 'ready' && (
            <section className={cn(
              'card text-sm flex items-start gap-2',
              gsAvailable
                ? 'border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
            )}>
              {gsAvailable ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}
              <p className="text-xs">
                {gsAvailable
                  ? `Ghostscript detected${caps.caps.ghostscript.version ? `: v${caps.caps.ghostscript.version}` : ''}. Backend compression has no browser memory limit.`
                  : 'Ghostscript not detected. Browser compression remains available with local device limits.'}
              </p>
            </section>
          )}
          {file && previewBlob && (
            <BeforeAfterPreview
              before={file.file}
              after={previewBlob}
              type="pdf"
              beforeLabel="Original PDF"
              afterLabel="Compressed PDF"
            />
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
                disabled={!gsAvailable}
                className={cn(
                  'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                  engine === 'backend'
                    ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                    : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  !gsAvailable && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Server size={13} className="inline mr-1" /> Ghostscript backend
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">Advanced native compression for large PDFs.</span>
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
                Browser-only mode
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">Uses pdf.js/pdf-lib and device memory.</span>
              </button>
            </div>
          </div>
          {engine === 'backend' && (
            <div className="border-t border-slate-200 dark:border-white/10 pt-3">
              <h3 className="text-sm font-semibold">Ghostscript preset</h3>
              <select className="input w-full mt-2" value={gsPreset} onChange={(e) => setGsPreset(e.target.value as GsPreset)}>
                <option value="screen">Screen - smallest, lowest quality</option>
                <option value="ebook">Ebook - balanced default</option>
                <option value="printer">Printer - print quality</option>
                <option value="prepress">Prepress - highest quality</option>
              </select>
            </div>
          )}
          {engine === 'browser' && (
            <>
          <div>
            <h3 className="text-sm font-semibold">Output quality</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {QUALITY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setQualityPreset(p.id)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                    qualityPreset === p.id
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {p.label}
                  <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    {p.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {qualityPreset === 'custom' && (
            <div className="space-y-2">
              <label className="block">
                <span className="label">Render DPI ({customDpi})</span>
                <input
                  type="range"
                  min={72}
                  max={300}
                  step={1}
                  value={customDpi}
                  onChange={(e) => setCustomDpi(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </label>
              <label className="block">
                <span className="label">JPEG quality ({Math.round(customQuality * 100)}%)</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={customQuality}
                  onChange={(e) => setCustomQuality(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </label>
            </div>
          )}

          <label className="flex items-start gap-2 border-t border-slate-200 dark:border-white/10 pt-3 text-sm">
            <input
              type="checkbox"
              checked={lossless}
              onChange={(e) => setLossless(e.target.checked)}
              className="accent-brand-600 mt-0.5"
            />
            <span>
              <span className="font-medium">Preserve text (lossless)</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                Skips rasterisation and just re-saves the PDF with object streams. Smaller savings, but text and vector graphics stay sharp.
              </span>
            </span>
          </label>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3 text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>
              This is the best compression achievable in the browser. Deeper savings (font subsetting, content-aware downsampling) require Ghostscript on a backend — that path will appear automatically once the backend is detected.
            </p>
          </div>
            </>
          )}
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
          actionLabel={engine === 'backend' ? 'Compress with Ghostscript' : 'Compress in browser'}
          actionDisabled={!file || (engine === 'backend' && !gsAvailable)}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
