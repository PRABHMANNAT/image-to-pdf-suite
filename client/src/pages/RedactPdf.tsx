import { useEffect, useMemo, useRef, useState } from 'react';
import { EyeOff, ChevronLeft, ChevronRight, AlertTriangle, Trash2, Eraser } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { loadPdfJs, savePdfLib } from '../lib/pdfUtils';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageView {
  pageNumber: number;
  thumbDataUrl: string;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
}

const REDACTION_FILL = '#000000';
const OUTPUT_RENDER_SCALE = 2; // 2× the editor scale → sharp rasterised output.

export default function RedactPdf() {
  const tool = findTool('redact-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [pages, setPages] = useState<PageView[]>([]);
  const [active, setActive] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [redactions, setRedactions] = useState<Record<number, Rect[]>>({});
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Render pages at editor scale.
  useEffect(() => {
    if (!file) {
      setPages([]);
      setRedactions({});
      setActive(0);
      return;
    }
    let cancelled = false;
    setRendering(true);
    setRenderPct(0);
    (async () => {
      try {
        const doc = await loadPdfJs(file.file);
        const out: PageView[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          try {
            const base = page.getViewport({ scale: 1 });
            const vp = page.getViewport({ scale: 1.3 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(vp.width));
            canvas.height = Math.max(1, Math.floor(vp.height));
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas 2D context not available');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            out.push({
              pageNumber: i,
              thumbDataUrl: canvas.toDataURL('image/jpeg', 0.85),
              widthPx: canvas.width,
              heightPx: canvas.height,
              widthPt: base.width,
              heightPt: base.height,
            });
          } finally {
            page.cleanup();
          }
          setRenderPct(Math.round((i / doc.numPages) * 100));
        }
        await doc.destroy();
        if (cancelled) return;
        setPages(out);
        setActive(0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to read PDF');
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file?.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function pageRects(idx: number): Rect[] {
    return redactions[idx] || [];
  }

  function eventPos(e: React.PointerEvent<HTMLDivElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = e.currentTarget.clientWidth ? rect.width / e.currentTarget.clientWidth : 1;
    return {
      x: (e.clientX - rect.left) / scaleX,
      y: (e.clientY - rect.top) / scaleX,
    };
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = eventPos(e);
    drawStartRef.current = p;
    setDrawing({ x: p.x, y: p.y, width: 0, height: 0 });
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawStartRef.current) return;
    const p = eventPos(e);
    const sx = drawStartRef.current.x;
    const sy = drawStartRef.current.y;
    setDrawing({
      x: Math.min(sx, p.x),
      y: Math.min(sy, p.y),
      width: Math.abs(p.x - sx),
      height: Math.abs(p.y - sy),
    });
  }
  function onUp() {
    if (drawing && drawing.width > 3 && drawing.height > 3) {
      setRedactions((prev) => ({
        ...prev,
        [active]: [...(prev[active] || []), drawing],
      }));
    }
    setDrawing(null);
    drawStartRef.current = null;
  }

  function removeRect(i: number) {
    setRedactions((prev) => ({
      ...prev,
      [active]: pageRects(active).filter((_, idx) => idx !== i),
    }));
  }
  function clearPage() {
    setRedactions((prev) => {
      const copy = { ...prev };
      delete copy[active];
      return copy;
    });
  }
  function clearAll() {
    setRedactions({});
  }

  async function run(): Promise<void> {
    if (!file || !pages.length) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Applying redactions…');
    setError(undefined);
    setResult(null);

    try {
      const src = await PDFDocument.load(new Uint8Array(await file.file.arrayBuffer()), {
        ignoreEncryption: true,
      });
      const out = await PDFDocument.create();
      const total = pages.length;
      const pdfjsDoc = await loadPdfJs(file.file);
      const sourceIndices = pages.map((_, i) => i);
      const copied = await out.copyPages(src, sourceIndices);

      for (let i = 0; i < total; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        const rects = pageRects(i);
        if (!rects.length) {
          out.addPage(copied[i]);
          setProgress(Math.round(((i + 1) / total) * 100));
          continue;
        }

        // Rasterise this page at OUTPUT_RENDER_SCALE × editor scale, then paint
        // redaction rectangles in solid black. Embedding the bitmap as the new
        // page content is the "real" removal — there is no underlying text
        // left on the redacted page.
        const editorPage = pages[i];
        const page = await pdfjsDoc.getPage(i + 1);
        try {
          const base = page.getViewport({ scale: 1 });
          const renderScale = 1.3 * OUTPUT_RENDER_SCALE;
          const vp = page.getViewport({ scale: renderScale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(vp.width));
          canvas.height = Math.max(1, Math.floor(vp.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context not available');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          // Convert editor px → render px.
          const editorToRender = canvas.width / editorPage.widthPx;
          ctx.fillStyle = REDACTION_FILL;
          for (const r of rects) {
            ctx.fillRect(
              r.x * editorToRender,
              r.y * editorToRender,
              r.width * editorToRender,
              r.height * editorToRender,
            );
          }
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          const bin = atob(dataUrl.split(',')[1]);
          const bytes = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          const img = await out.embedJpg(bytes);
          const newPage = out.addPage([base.width, base.height]);
          newPage.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
        } finally {
          page.cleanup();
        }
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      await pdfjsDoc.destroy();

      const blob = await savePdfLib(out);
      const redactedCount = Object.keys(redactions).filter((k) => (redactions[Number(k)] || []).length > 0).length;
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'redacted',
          ext: '.pdf',
        }),
      });
      setMessage(`Applied redactions on ${redactedCount} page${redactedCount === 1 ? '' : 's'}.`);
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
  const activePage = pages[active] || null;
  const totalRedactions = useMemo(
    () => Object.values(redactions).reduce((n, list) => n + list.length, 0),
    [redactions],
  );
  const currentRects = pageRects(active);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={EyeOff}
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
          helperText="Draw black boxes to redact — affected pages become image-only on export, so the content is genuinely gone."
        />
      }
      preview={
        <div className="space-y-4">
          {rendering && <div className="card text-sm">Rendering pages… {renderPct}%</div>}
          {activePage && (
            <>
              <div className="card p-2 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-ghost px-2 py-1" onClick={() => setActive((a) => Math.max(0, a - 1))} disabled={active === 0}>
                    <ChevronLeft size={14} />
                  </button>
                  <span className="tabular-nums min-w-[4rem] text-center">{active + 1} / {pages.length}</span>
                  <button type="button" className="btn-ghost px-2 py-1" onClick={() => setActive((a) => Math.min(pages.length - 1, a + 1))} disabled={active >= pages.length - 1}>
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-ghost px-2 py-1 text-red-600" onClick={clearPage} disabled={!currentRects.length}>
                    <Eraser size={14} /> Clear page ({currentRects.length})
                  </button>
                  <button type="button" className="btn-ghost px-2 py-1 text-red-600" onClick={clearAll} disabled={!totalRedactions}>
                    <Trash2 size={14} /> Clear all ({totalRedactions})
                  </button>
                </div>
              </div>
              <div className="overflow-auto thin-scroll max-h-[75vh] bg-slate-100 dark:bg-slate-950/40 p-4 rounded-2xl">
                <div
                  className="relative inline-block bg-white shadow-soft dark:shadow-soft-dark rounded-lg overflow-hidden touch-none select-none cursor-crosshair"
                  style={{ width: activePage.widthPx, height: activePage.heightPx }}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                >
                  <img src={activePage.thumbDataUrl} alt={`Page ${active + 1}`} className="block w-full h-full pointer-events-none" />
                  {currentRects.map((r, idx) => (
                    <div
                      key={idx}
                      className="absolute bg-black/85 ring-2 ring-red-500/80 group"
                      style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
                    >
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          removeRect(idx);
                        }}
                        className="absolute top-1 right-1 rounded bg-white/80 text-red-700 hover:bg-white p-1 opacity-0 group-hover:opacity-100"
                        aria-label="Remove redaction"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  {drawing && (
                    <div
                      className="absolute bg-black/40 ring-2 ring-red-500/80 pointer-events-none"
                      style={{ left: drawing.x, top: drawing.y, width: drawing.width, height: drawing.height }}
                    />
                  )}
                </div>
              </div>
            </>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Redacted PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-3 text-sm">
          <h3 className="font-semibold">How to redact</h3>
          <ol className="text-xs text-slate-500 dark:text-slate-400 list-decimal pl-5 space-y-1">
            <li>Click + drag on the page preview to draw a black redaction box.</li>
            <li>Hover a box to see its remove button (or use Clear page / Clear all).</li>
            <li>Navigate pages with the arrows above the preview.</li>
            <li>Apply to write the redactions into a new PDF.</li>
          </ol>
          <div className="border-t border-slate-200 dark:border-white/10 pt-3 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <p>
              Real redaction: every page that has at least one box is
              rasterised into an image on export — the original text and
              vector content underneath the box is gone, with no metadata
              recoverable. Pages without redactions stay untouched and
              keep their text layer.
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
          actionLabel={totalRedactions ? `Apply ${totalRedactions} redaction${totalRedactions === 1 ? '' : 's'}` : 'Draw a box first'}
          actionDisabled={!file || rendering || !totalRedactions}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
