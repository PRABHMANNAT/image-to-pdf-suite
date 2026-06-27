import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PenLine,
  Pen,
  Type,
  ImagePlus,
  RotateCcw,
  Eraser,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { loadPdfJs, loadPdfLib, savePdfLib } from '../lib/pdfUtils';
import { parsePageRange } from '../lib/pageRange';
import { applyNamePattern, readAsDataUrl } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type Mode = 'draw' | 'type' | 'upload';
type Scope = 'current' | 'all' | 'range';

interface PageView {
  pageNumber: number;
  thumbDataUrl: string;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
}

interface SignatureData {
  src: string; // data URL
  mime: 'image/png' | 'image/jpeg';
  naturalW: number;
  naturalH: number;
}

interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TYPE_FONTS = [
  { id: 'cursive', label: 'Cursive', value: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive' },
  { id: 'italic', label: 'Italic serif', value: '"Times New Roman", Times, serif' },
  { id: 'handwriting', label: 'Handwriting', value: '"Lucida Handwriting", "Bradley Hand", cursive' },
  { id: 'system', label: 'System', value: 'ui-sans-serif, system-ui, sans-serif' },
];

function SignaturePad({ onSave }: { onSave: (src: string, w: number, h: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [color, setColor] = useState('#0f172a');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 600;
    canvas.height = 220;
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    lastRef.current = pos(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastRef.current) return;
    const p = pos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  }
  function onUp() {
    drawingRef.current = false;
    lastRef.current = null;
  }
  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }
  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'), canvas.width, canvas.height);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-1.5">
          Colour <input type="color" className="h-7 w-9 rounded cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-1.5 flex-1">
          Width ({strokeWidth})
          <input type="range" min={1} max={10} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="accent-brand-600 flex-1" />
        </label>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="w-full rounded-xl bg-white border border-slate-200 dark:border-white/10 cursor-crosshair touch-none"
        style={{ aspectRatio: '600 / 220' }}
      />
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={save}>
          <Pen size={14} /> Use this signature
        </button>
        <button type="button" className="btn-ghost" onClick={clear}>
          <Eraser size={14} /> Clear
        </button>
      </div>
    </div>
  );
}

function TypedSignature({ onSave }: { onSave: (src: string, w: number, h: number) => void }) {
  const [name, setName] = useState('Your Name');
  const [fontId, setFontId] = useState(TYPE_FONTS[0].id);
  const [color, setColor] = useState('#0f172a');
  const [size, setSize] = useState(56);
  const family = TYPE_FONTS.find((f) => f.id === fontId)?.value ?? TYPE_FONTS[0].value;

  function save() {
    const canvas = document.createElement('canvas');
    const padding = 30;
    canvas.width = 800;
    canvas.height = Math.max(100, size + padding * 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = `${size}px ${family}`;
    const metrics = ctx.measureText(name);
    const w = Math.ceil(metrics.width) + padding * 2;
    canvas.width = Math.max(200, w);
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) return;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    ctx2.font = `${size}px ${family}`;
    ctx2.fillStyle = color;
    ctx2.textBaseline = 'middle';
    ctx2.fillText(name, padding, canvas.height / 2);
    onSave(canvas.toDataURL('image/png'), canvas.width, canvas.height);
  }

  return (
    <div className="space-y-2">
      <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your name" />
      <div
        className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-4 grid place-items-center min-h-[100px]"
        style={{ fontFamily: family, fontSize: size, color }}
      >
        {name || 'Preview'}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="block">
          <span className="label">Font</span>
          <select className="input w-full" value={fontId} onChange={(e) => setFontId(e.target.value)}>
            {TYPE_FONTS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Size ({size})</span>
          <input type="range" min={20} max={120} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full accent-brand-600" />
        </label>
        <label className="block col-span-2">
          <span className="label">Colour</span>
          <input type="color" className="h-9 w-full rounded cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn-secondary" onClick={save}>
        <Type size={14} /> Use this signature
      </button>
    </div>
  );
}

interface DraggableBoxProps {
  placement: Placement;
  setPlacement: (p: Placement) => void;
  containerW: number;
  containerH: number;
  src: string;
  aspect: number;
}

function DraggableBox({ placement, setPlacement, containerW, containerH, src, aspect }: DraggableBoxProps) {
  const dragRef = useRef<{ x: number; y: number; mode: 'move' | 'resize' } | null>(null);

  function clamp(p: Placement): Placement {
    const width = Math.max(20, Math.min(containerW, p.width));
    const height = Math.max(20, Math.min(containerH, p.height));
    const x = Math.max(0, Math.min(containerW - width, p.x));
    const y = Math.max(0, Math.min(containerH - height, p.y));
    return { x, y, width, height };
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize') {
    dragRef.current = { x: e.clientX, y: e.clientY, mode };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (dragRef.current.mode === 'move') {
      setPlacement(clamp({ ...placement, x: placement.x + dx, y: placement.y + dy }));
    } else {
      const newW = Math.max(20, placement.width + dx);
      const newH = newW / aspect;
      setPlacement(clamp({ ...placement, width: newW, height: newH }));
    }
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
  }
  function onUp() {
    dragRef.current = null;
  }

  return (
    <div
      className="absolute group cursor-move select-none"
      style={{ left: placement.x, top: placement.y, width: placement.width, height: placement.height }}
      onPointerDown={(e) => onDown(e, 'move')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <img src={src} alt="signature" draggable={false} className="w-full h-full object-contain pointer-events-none" />
      <div
        className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-sm bg-brand-500 cursor-nwse-resize ring-2 ring-white"
        onPointerDown={(e) => onDown(e, 'resize')}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <div className="absolute inset-0 ring-2 ring-brand-500/60 ring-dashed pointer-events-none" />
    </div>
  );
}

export default function SignPdf() {
  const tool = findTool('sign-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [pages, setPages] = useState<PageView[]>([]);
  const [active, setActive] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);

  const [mode, setMode] = useState<Mode>('draw');
  const [uploadFiles, setUploadFiles] = useState<AcceptedFile[]>([]);
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [placement, setPlacement] = useState<Placement>({ x: 60, y: 60, width: 200, height: 80 });

  const [scope, setScope] = useState<Scope>('current');
  const [pageRange, setPageRange] = useState('');

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

  // Wire upload-mode file → signature data.
  useEffect(() => {
    if (mode !== 'upload') return;
    const f = uploadFiles[0]?.file;
    if (!f) return;
    let cancelled = false;
    void (async () => {
      const dataUrl = await readAsDataUrl(f);
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setSignature({
          src: dataUrl,
          mime: f.type === 'image/png' ? 'image/png' : 'image/jpeg',
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
        });
        // Default placement: 30% of page width.
        const page = pages[active];
        if (page) {
          const w = page.widthPx * 0.3;
          const h = (img.naturalHeight / img.naturalWidth) * w;
          setPlacement({ x: 60, y: page.heightPx - h - 60, width: w, height: h });
        }
      };
      img.src = dataUrl;
    })();
    return () => {
      cancelled = true;
    };
  }, [uploadFiles, mode, pages, active]);

  function adoptSignature(src: string, w: number, h: number) {
    setSignature({ src, mime: 'image/png', naturalW: w, naturalH: h });
    const page = pages[active];
    const pageW = page?.widthPx ?? 600;
    const pageH = page?.heightPx ?? 800;
    const newW = pageW * 0.3;
    const newH = (h / w) * newW;
    setPlacement({ x: 60, y: pageH - newH - 60, width: newW, height: newH });
  }

  async function run(): Promise<void> {
    if (!file || !signature || !pages.length) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Stamping signature…');
    setError(undefined);
    setResult(null);
    try {
      const src = await loadPdfLib(file.file);
      const total = src.getPageCount();
      const targets =
        scope === 'all'
          ? Array.from({ length: total }, (_, i) => i)
          : scope === 'current'
            ? [active]
            : parsePageRange(pageRange, total);
      if (!targets.length) throw new Error('No pages selected.');
      const set = new Set(targets);

      const sigBytes = Uint8Array.from(atob(signature.src.split(',')[1]), (c) => c.charCodeAt(0));
      const img = signature.mime === 'image/png' ? await src.embedPng(sigBytes) : await src.embedJpg(sigBytes);

      const editorPage = pages[active];
      const sx = editorPage.widthPt / editorPage.widthPx;
      const sy = editorPage.heightPt / editorPage.heightPx;
      const flipY = (yPx: number, pageHPt: number) => pageHPt - yPx * sy;

      const pdfPages = src.getPages();
      for (let i = 0; i < pdfPages.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        if (!set.has(i)) continue;
        const page = pdfPages[i];
        const { height: pageHPt } = page.getSize();
        page.drawImage(img, {
          x: placement.x * sx,
          y: flipY(placement.y + placement.height, pageHPt),
          width: placement.width * sx,
          height: placement.height * sy,
          rotate: degrees(0),
        });
        setProgress(Math.round(((i + 1) / pdfPages.length) * 100));
      }
      const blob = await savePdfLib(src);
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'signed',
          ext: '.pdf',
        }),
      });
      setMessage(`Signed ${set.size} of ${total} pages.`);
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
  const sigAspect = signature ? signature.naturalW / signature.naturalH : 1;

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={PenLine}
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
          label="Drop a PDF to sign"
          helperText="Draw, type, or upload a signature image — then drag it onto the page."
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
              </div>
              <div className="overflow-auto thin-scroll max-h-[75vh] bg-slate-100 dark:bg-slate-950/40 p-4 rounded-2xl">
                <div className="relative inline-block bg-white shadow-soft dark:shadow-soft-dark rounded-lg overflow-hidden">
                  <img src={activePage.thumbDataUrl} alt={`Page ${active + 1}`} className="block" />
                  {signature && (
                    <DraggableBox
                      placement={placement}
                      setPlacement={setPlacement}
                      containerW={activePage.widthPx}
                      containerH={activePage.heightPx}
                      src={signature.src}
                      aspect={sigAspect}
                    />
                  )}
                </div>
              </div>
            </>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Signed PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Signature</h3>
            <div className="mt-2 flex gap-1.5">
              {([
                { id: 'draw' as Mode, label: 'Draw', icon: Pen },
                { id: 'type' as Mode, label: 'Type', icon: Type },
                { id: 'upload' as Mode, label: 'Upload', icon: ImagePlus },
              ]).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-medium border transition',
                      mode === m.id
                        ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                        : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                    )}
                  >
                    <Icon size={14} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === 'draw' && <SignaturePad onSave={adoptSignature} />}
          {mode === 'type' && <TypedSignature onSave={adoptSignature} />}
          {mode === 'upload' && (
            <FileDropzone
              files={uploadFiles}
              onChange={setUploadFiles}
              accept={{ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }}
              multiple={false}
              hideZoneWhenFilled={uploadFiles.length > 0}
              label="Drop a signature image"
              helperText="PNGs with transparency look most natural."
            />
          )}

          {signature && (
            <div className="border-t border-slate-200 dark:border-white/10 pt-3">
              <h3 className="text-sm font-semibold">Apply to</h3>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {(['current', 'all', 'range'] as Scope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                      scope === s
                        ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                        : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                    )}
                  >
                    {s === 'current' && `Current page only (page ${active + 1})`}
                    {s === 'all' && `Every page (${pages.length || '?'})`}
                    {s === 'range' && 'Custom range…'}
                  </button>
                ))}
              </div>
              {scope === 'range' && (
                <input
                  className="input w-full mt-2"
                  placeholder={pages.length ? `e.g. 1-${pages.length}` : '1-3,5,7-9'}
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                />
              )}
              <button type="button" className="btn-ghost text-xs mt-3" onClick={() => setSignature(null)}>
                <RotateCcw size={13} /> Choose a different signature
              </button>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-white/10 pt-3 text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>
              This produces a <strong>visual electronic signature</strong> stamped into the PDF — recognised legally in most jurisdictions for everyday use. It is not a cryptographic digital signature; that requires a certificate (PKCS#12) and a separate signing backend, which is planned for a future phase.
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
          actionLabel="Apply signature"
          actionDisabled={!file || !signature || rendering}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
