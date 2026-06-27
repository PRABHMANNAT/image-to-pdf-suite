import { useEffect, useMemo, useRef, useState } from 'react';
import { Presentation as PresentationIcon, Info } from 'lucide-react';
import pptxgen from 'pptxgenjs';
import {
  ToolLayout,
  FileDropzone,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { loadPdfJs } from '../lib/pdfUtils';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type Layout = 'wide' | 'standard' | 'auto';

const LAYOUT_DIMS: Record<Exclude<Layout, 'auto'>, { name: string; w: number; h: number }> = {
  wide: { name: 'LAYOUT_WIDE', w: 13.333, h: 7.5 },
  standard: { name: 'LAYOUT_STANDARD', w: 10, h: 7.5 },
};

export default function PdfToPpt() {
  const tool = findTool('pdf-to-ppt')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [layout, setLayout] = useState<Layout>('auto');
  const [scale, setScale] = useState(2);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setError(undefined);
    setResult(null);
    setMessage('Loading PDF…');

    try {
      const doc = await loadPdfJs(file.file);
      const total = doc.numPages;
      const pres = new pptxgen();

      // Decide slide dimensions in INCHES (pptxgenjs's unit).
      let slideW: number;
      let slideH: number;
      if (layout === 'auto') {
        // Use the first page's aspect; pdf.js viewport is in PT, convert via 72 PT/in.
        const first = await doc.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        slideW = vp.width / 72;
        slideH = vp.height / 72;
        first.cleanup();
        pres.defineLayout({ name: 'AUTO', width: slideW, height: slideH });
        pres.layout = 'AUTO';
      } else {
        const dims = LAYOUT_DIMS[layout];
        slideW = dims.w;
        slideH = dims.h;
        pres.layout = dims.name;
      }

      for (let i = 1; i <= total; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        setMessage(`Rendering page ${i}/${total}`);
        const page = await doc.getPage(i);
        try {
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(vp.width));
          canvas.height = Math.max(1, Math.floor(vp.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context not available');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

          // Letterbox page bitmap into the slide.
          const pageWIn = base.width / 72;
          const pageHIn = base.height / 72;
          const fit = Math.min(slideW / pageWIn, slideH / pageHIn);
          const drawW = pageWIn * fit;
          const drawH = pageHIn * fit;
          const x = (slideW - drawW) / 2;
          const y = (slideH - drawH) / 2;

          const slide = pres.addSlide();
          slide.background = { color: 'FFFFFF' };
          slide.addImage({ data: dataUrl, x, y, w: drawW, h: drawH });
        } finally {
          page.cleanup();
        }
        setProgress(Math.round((i / total) * 100));
      }
      await doc.destroy();

      setMessage('Building .pptx…');
      const out = await pres.write({ outputType: 'blob' });
      const blob = out instanceof Blob ? out : new Blob([out as ArrayBuffer]);

      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'pdf-to-ppt',
          ext: '.pptx',
        }),
      });
      setMessage(`Built a ${total}-slide presentation.`);
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

  const layoutOptions: { id: Layout; label: string; sub: string }[] = useMemo(
    () => [
      { id: 'auto', label: 'Match PDF page size', sub: 'Each slide matches page 1 dimensions.' },
      { id: 'wide', label: 'Widescreen 16:9', sub: 'Standard modern deck (13.33 × 7.5 in).' },
      { id: 'standard', label: 'Standard 4:3', sub: 'Classic deck (10 × 7.5 in).' },
    ],
    [],
  );

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={PresentationIcon}
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
          helperText="Each PDF page becomes one slide. First-version is image-based; no text editing."
        />
      }
      preview={
        <section className="card text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
          <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
          <p>
            This first version turns each PDF page into a slide image. Text
            inside slides won't be editable. A future phase can add
            LibreOffice-based PDF→PPTX with editable text where the PDF
            structure allows.
          </p>
        </section>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Slide layout</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {layoutOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setLayout(o.id)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                    layout === o.id
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {o.label}
                  <span className="block text-[10px] font-normal text-slate-500 mt-0.5">{o.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold">Render scale ({scale}×)</h3>
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full accent-brand-600 mt-2"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Higher = sharper slides but bigger .pptx file.
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
          actionLabel="Convert to .pptx"
          actionDisabled={!file}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
