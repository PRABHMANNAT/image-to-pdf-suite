import { useEffect, useMemo, useRef, useState } from 'react';
import type { Area, Point } from 'react-easy-crop';
import { Crop } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
  ImageCropper,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { renderPdfFirstPageDataUrl, loadPdfLib, savePdfLib } from '../lib/pdfUtils';
import { loadImageElement } from '../lib/imageUtils';
import { parsePageRange } from '../lib/pageRange';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

interface AspectPreset {
  id: string;
  label: string;
  value: number | undefined;
}

const ASPECTS: AspectPreset[] = [
  { id: 'free', label: 'Free', value: undefined },
  { id: 'a4-p', label: 'A4 portrait', value: 210 / 297 },
  { id: 'a4-l', label: 'A4 landscape', value: 297 / 210 },
  { id: 'letter-p', label: 'Letter portrait', value: 8.5 / 11 },
  { id: 'letter-l', label: 'Letter landscape', value: 11 / 8.5 },
  { id: 'square', label: 'Square', value: 1 },
  { id: '16-9', label: '16:9', value: 16 / 9 },
];

type Scope = 'current' | 'all' | 'range';

export default function CropPdf() {
  const tool = findTool('crop-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [imgDim, setImgDim] = useState<{ w: number; h: number } | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const [scope, setScope] = useState<Scope>('all');
  const [pageRange, setPageRange] = useState('');

  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) {
      setPageUrl(null);
      setImgDim(null);
      setPageCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = await renderPdfFirstPageDataUrl(file.file, 1200);
        if (cancelled) return;
        const img = await loadImageElement(url);
        if (cancelled) return;
        setPageUrl(url);
        setImgDim({ w: img.naturalWidth, h: img.naturalHeight });
        const src = await loadPdfLib(file.file);
        setPageCount(src.getPageCount());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to read PDF');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file?.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run(): Promise<void> {
    if (!file || !croppedArea || !imgDim) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Cropping pages…');
    setError(undefined);
    setResult(null);

    try {
      const src = await loadPdfLib(file.file);
      const total = src.getPageCount();
      const rel = {
        x: croppedArea.x / imgDim.w,
        y: croppedArea.y / imgDim.h,
        w: croppedArea.width / imgDim.w,
        h: croppedArea.height / imgDim.h,
      };

      const targetIndices = scope === 'current'
        ? [0]
        : scope === 'all'
          ? Array.from({ length: total }, (_, i) => i)
          : parsePageRange(pageRange, total);
      if (!targetIndices.length) throw new Error('No pages selected for cropping.');
      const set = new Set(targetIndices);

      const pages = src.getPages();
      for (let i = 0; i < pages.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        if (!set.has(i)) continue;
        const page = pages[i];
        const { width, height } = page.getSize();
        // Convert canvas-space (top-left origin) → PDF PT (bottom-left).
        const cropX = rel.x * width;
        const cropW = rel.w * width;
        const cropH = rel.h * height;
        const cropY = height - (rel.y + rel.h) * height;
        page.setCropBox(cropX, cropY, cropW, cropH);
        setProgress(Math.round(((i + 1) / pages.length) * 100));
      }

      const blob = await savePdfLib(src);
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'cropped',
          ext: '.pdf',
        }),
      });
      setMessage(`Cropped ${set.size} of ${total} pages.`);
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
      icon={Crop}
      runtime={tool.runtime}
      status="beta"
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept="pdf"
          multiple={false}
          hideZoneWhenFilled={files.length > 0}
          label="Drop a PDF"
          helperText="Drag the rectangle on page 1 — the same crop is applied to the selected pages."
        />
      }
      preview={
        <div className="space-y-4">
          {pageUrl ? (
            <ImageCropper
              src={pageUrl}
              crop={crop}
              zoom={zoom}
              rotation={0}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={setCroppedArea}
            />
          ) : (
            <div className="card text-center text-sm text-slate-500 dark:text-slate-400 py-12">
              Drop a PDF above to start cropping.
            </div>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Cropped PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Aspect ratio</h3>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAspect(a.value)}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-[11px] font-medium border transition',
                    aspect === a.value
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <label className="block">
              <span className="label">Preview zoom ({Math.round(zoom * 100)}%)</span>
              <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-brand-600" />
            </label>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold mb-2">Apply to</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {(['all', 'current', 'range'] as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition capitalize',
                    scope === s
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {s === 'all' && `All pages (${pageCount || '?'})`}
                  {s === 'current' && 'Current page only (page 1)'}
                  {s === 'range' && 'Custom range…'}
                </button>
              ))}
            </div>
            {scope === 'range' && (
              <input
                className="input w-full mt-2"
                placeholder={pageCount ? `e.g. 1-${pageCount}` : '1-3,5,7-9'}
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
              />
            )}
          </div>

          {croppedArea && (
            <details className="border-t border-slate-200 dark:border-white/10 pt-3">
              <summary className="text-sm font-semibold cursor-pointer">Pixel dimensions (advanced)</summary>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">X</div>
                  <div className="tabular-nums font-medium">{Math.round(croppedArea.x)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Y</div>
                  <div className="tabular-nums font-medium">{Math.round(croppedArea.y)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Width</div>
                  <div className="tabular-nums font-medium">{Math.round(croppedArea.width)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Height</div>
                  <div className="tabular-nums font-medium">{Math.round(croppedArea.height)}</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                Crop is stored as a percentage of the preview image and re-applied per page, so pages with different sizes still get a proportional crop.
              </p>
            </details>
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
          actionLabel="Crop pages"
          actionDisabled={!file || !croppedArea}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
