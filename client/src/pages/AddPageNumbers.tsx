import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { loadPdfLib, renderPdfFirstPageDataUrl, savePdfLib } from '../lib/pdfUtils';
import { parsePageRange } from '../lib/pageRange';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type Position = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br';

const POSITION_LABELS: Record<Position, string> = {
  tl: 'Top left',
  tc: 'Top center',
  tr: 'Top right',
  bl: 'Bottom left',
  bc: 'Bottom center',
  br: 'Bottom right',
};

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export default function AddPageNumbers() {
  const tool = findTool('page-numbers')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [firstPageUrl, setFirstPageUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [position, setPosition] = useState<Position>('br');
  const [fontSize, setFontSize] = useState(12);
  const [color, setColor] = useState('#0f172a');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [startNumber, setStartNumber] = useState(1);
  const [pageRange, setPageRange] = useState('');
  const [marginMm, setMarginMm] = useState(15);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) {
      setFirstPageUrl(null);
      setPageCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [url, src] = await Promise.all([
          renderPdfFirstPageDataUrl(file.file, 700),
          loadPdfLib(file.file),
        ]);
        if (cancelled) return;
        setFirstPageUrl(url);
        setPageCount(src.getPageCount());
      } catch {
        /* surface only on Apply */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file?.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Stamping page numbers…');
    setError(undefined);
    setResult(null);
    try {
      const src = await loadPdfLib(file.file);
      const total = src.getPageCount();
      const targetIndices = pageRange.trim()
        ? parsePageRange(pageRange, total)
        : Array.from({ length: total }, (_, i) => i);
      const indexSet = new Set(targetIndices);
      const font = await src.embedFont(StandardFonts.Helvetica);
      const c = hexToRgb01(color);
      const MM_TO_PT = 72 / 25.4;
      const marginPt = marginMm * MM_TO_PT;

      const pages = src.getPages();
      for (let i = 0; i < pages.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        if (!indexSet.has(i)) continue;
        const page = pages[i];
        const { width, height } = page.getSize();
        const displayNum = startNumber + targetIndices.indexOf(i);
        const text = `${prefix}${displayNum}${suffix}`;
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        let x = 0;
        let y = 0;
        const top = height - marginPt - fontSize;
        const bottom = marginPt;
        switch (position) {
          case 'tl': x = marginPt; y = top; break;
          case 'tc': x = (width - textWidth) / 2; y = top; break;
          case 'tr': x = width - marginPt - textWidth; y = top; break;
          case 'bl': x = marginPt; y = bottom; break;
          case 'bc': x = (width - textWidth) / 2; y = bottom; break;
          case 'br': x = width - marginPt - textWidth; y = bottom; break;
        }
        page.drawText(text, { x, y, size: fontSize, font, color: rgb(c.r, c.g, c.b) });
        setProgress(Math.round(((i + 1) / pages.length) * 100));
      }

      const blob = await savePdfLib(src);
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'numbered',
          ext: '.pdf',
        }),
      });
      setMessage(`Stamped ${indexSet.size} of ${total} pages.`);
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

  // Live preview overlay: position is set via flex alignment.
  const overlayClass: Record<Position, string> = {
    tl: 'items-start justify-start',
    tc: 'items-start justify-center',
    tr: 'items-start justify-end',
    bl: 'items-end justify-start',
    bc: 'items-end justify-center',
    br: 'items-end justify-end',
  };

  const sampleText = useMemo(() => `${prefix}${startNumber}${suffix}`, [prefix, suffix, startNumber]);
  const padPx = useMemo(() => Math.max(4, Math.round(marginMm * 2)), [marginMm]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Hash}
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
          helperText="Page numbers are stamped as real PDF text — selectable and searchable in any viewer."
        />
      }
      preview={
        <div className="space-y-4">
          {firstPageUrl && (
            <section className="card">
              <h3 className="text-sm font-semibold mb-2">
                Live preview {pageCount ? `· ${pageCount} pages` : ''}
              </h3>
              <div className="relative inline-block bg-white shadow-soft dark:shadow-soft-dark rounded-lg overflow-hidden">
                <img src={firstPageUrl} alt="page 1" className="max-w-full block" />
                <div
                  className={cn('absolute inset-0 flex pointer-events-none', overlayClass[position])}
                  style={{ padding: padPx }}
                >
                  <span style={{ fontSize: fontSize * 0.7, color, fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 500 }}>
                    {sampleText}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                Preview is an approximation rendered at screen DPI; the exported PDF uses real fonts at exact points.
              </p>
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Numbered PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Position</h3>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(Object.keys(POSITION_LABELS) as Position[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-[11px] font-medium border transition',
                    position === p
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                  title={POSITION_LABELS[p]}
                >
                  {POSITION_LABELS[p].replace(' center', '-C').replace(' left', '-L').replace(' right', '-R')}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">Font size ({fontSize})</span>
              <input type="range" min={6} max={48} step={1} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-brand-600" />
            </label>
            <label className="block">
              <span className="label">Color</span>
              <input type="color" className="h-9 w-full rounded cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Margin (mm)</span>
              <input type="number" min={0} max={50} className="input w-full" value={marginMm} onChange={(e) => setMarginMm(Math.max(0, Number(e.target.value) || 0))} />
            </label>
            <label className="block">
              <span className="label">Start at</span>
              <input type="number" min={1} className="input w-full" value={startNumber} onChange={(e) => setStartNumber(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="block col-span-2">
              <span className="label">Prefix / suffix</span>
              <div className="flex gap-2">
                <input className="input w-1/2" placeholder="Page " value={prefix} onChange={(e) => setPrefix(e.target.value)} />
                <input className="input w-1/2" placeholder=" of N" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
              </div>
            </label>
            <label className="block col-span-2">
              <span className="label">Page range</span>
              <input
                className="input w-full"
                placeholder={pageCount ? `e.g. 1-${pageCount} (blank = all)` : '1-3,5,7-9'}
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
              />
            </label>
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
          actionLabel="Add page numbers"
          actionDisabled={!file}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
