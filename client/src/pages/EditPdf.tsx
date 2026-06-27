import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pencil,
  Type,
  Square,
  Highlighter,
  Minus,
  ImagePlus,
  MousePointer2,
  Trash2,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { PageCanvas } from '../components/editor/PageCanvas';
import { loadPdfJs, loadPdfLib, savePdfLib } from '../lib/pdfUtils';
import { applyNamePattern, readAsDataUrl, uniqueId } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import type { EditorPage, Overlay, Tool } from '../lib/editorTypes';
import { cn } from '../lib/cn';

const RENDER_SCALE = 1.5; // canvas px per PT; balance fidelity vs memory.

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

interface HistoryEntry {
  overlays: Overlay[];
}

interface PageState {
  overlays: Overlay[];
  history: HistoryEntry[];
  future: HistoryEntry[];
}

const EMPTY_STATE: PageState = { overlays: [], history: [], future: [] };

export default function EditPdf() {
  const tool = findTool('edit-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [active, setActive] = useState(0);
  const [pageStates, setPageStates] = useState<Record<number, PageState>>({});
  const [tool_, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState('#0f172a');
  const [strokeColor, setStrokeColor] = useState('#3b82f6');
  const [highlightColor, setHighlightColor] = useState('#fde047');
  const [fontSize, setFontSize] = useState(20);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [opacity, setOpacity] = useState(0.4);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);

  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Render every page at editor scale on file load.
  useEffect(() => {
    if (!file) {
      setPages([]);
      setPageStates({});
      setActive(0);
      return;
    }
    let cancelled = false;
    setRendering(true);
    setRenderPct(0);
    (async () => {
      try {
        const doc = await loadPdfJs(file.file);
        const result: EditorPage[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          try {
            const base = page.getViewport({ scale: 1 });
            const vp = page.getViewport({ scale: RENDER_SCALE });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(vp.width));
            canvas.height = Math.max(1, Math.floor(vp.height));
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas 2D context not available');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            result.push({
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
        setPages(result);
        setPageStates({});
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

  function getState(idx: number): PageState {
    return pageStates[idx] || EMPTY_STATE;
  }

  function mutate(idx: number, fn: (current: Overlay[]) => Overlay[]) {
    setPageStates((prev) => {
      const cur = prev[idx] || EMPTY_STATE;
      const next: PageState = {
        overlays: fn(cur.overlays),
        history: [...cur.history, { overlays: cur.overlays }].slice(-50),
        future: [],
      };
      return { ...prev, [idx]: next };
    });
  }

  function undo() {
    setPageStates((prev) => {
      const cur = prev[active] || EMPTY_STATE;
      if (!cur.history.length) return prev;
      const prevEntry = cur.history[cur.history.length - 1];
      const next: PageState = {
        overlays: prevEntry.overlays,
        history: cur.history.slice(0, -1),
        future: [{ overlays: cur.overlays }, ...cur.future],
      };
      return { ...prev, [active]: next };
    });
    setSelectedId(null);
  }

  function redo() {
    setPageStates((prev) => {
      const cur = prev[active] || EMPTY_STATE;
      if (!cur.future.length) return prev;
      const [head, ...rest] = cur.future;
      const next: PageState = {
        overlays: head.overlays,
        history: [...cur.history, { overlays: cur.overlays }],
        future: rest,
      };
      return { ...prev, [active]: next };
    });
    setSelectedId(null);
  }

  function deleteSelected() {
    if (!selectedId) return;
    mutate(active, (cur) => cur.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }

  function onCanvasClick(px: { x: number; y: number }) {
    const id = uniqueId('o');
    if (tool_ === 'text') {
      const text = window.prompt('Text to add:', 'New text');
      if (!text) return;
      mutate(active, (cur) => [
        ...cur,
        { id, kind: 'text', x: px.x, y: px.y, text, fontSize, color },
      ]);
      setSelectedId(id);
      setTool('select');
    } else if (tool_ === 'rect') {
      mutate(active, (cur) => [
        ...cur,
        { id, kind: 'rect', x: px.x, y: px.y, width: 120, height: 80, fill: '#ffffff', stroke: strokeColor, strokeWidth, opacity: 1 },
      ]);
      setSelectedId(id);
      setTool('select');
    } else if (tool_ === 'highlight') {
      mutate(active, (cur) => [
        ...cur,
        { id, kind: 'highlight', x: px.x, y: px.y, width: 180, height: 28, fill: highlightColor, opacity },
      ]);
      setSelectedId(id);
      setTool('select');
    } else if (tool_ === 'line') {
      mutate(active, (cur) => [
        ...cur,
        { id, kind: 'line', x: px.x, y: px.y, ex: px.x + 160, ey: px.y, stroke: strokeColor, strokeWidth },
      ]);
      setSelectedId(id);
      setTool('select');
    }
  }

  async function addImageFromFile(blob: File) {
    const dataUrl = await readAsDataUrl(blob);
    const id = uniqueId('o');
    const mime = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    // Default size ~30% of page width.
    const pageWidthPx = pages[active]?.widthPx ?? 600;
    const w = pageWidthPx * 0.3;
    const h = w; // placeholder, user resizes
    mutate(active, (cur) => [
      ...cur,
      { id, kind: 'image', x: 60, y: 60, src: dataUrl, mime, width: w, height: h },
    ]);
    setSelectedId(id);
    setTool('select');
  }

  function changeOverlays(next: Overlay[]) {
    mutate(active, () => next);
  }

  // Properties panel — pull from selected overlay.
  const selected = useMemo(() => {
    const cur = getState(active);
    return cur.overlays.find((o) => o.id === selectedId) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStates, active, selectedId]);

  function patchSelected(partial: Partial<Overlay>) {
    if (!selectedId) return;
    mutate(active, (cur) => cur.map((o) => (o.id === selectedId ? ({ ...o, ...partial } as Overlay) : o)));
  }

  async function run(): Promise<void> {
    if (!file || !pages.length) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Stamping overlays…');
    setError(undefined);
    setResult(null);

    try {
      const src = await loadPdfLib(file.file);
      const font = await src.embedFont(StandardFonts.Helvetica);
      const srcPages = src.getPages();
      for (let i = 0; i < pages.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        const overlays = (pageStates[i] || EMPTY_STATE).overlays;
        if (!overlays.length) continue;
        const page = srcPages[i];
        const { width: pw, height: ph } = page.getSize();
        const editor = pages[i];
        // Editor pixel → PT. y is flipped because editor origin = top-left,
        // PDF origin = bottom-left.
        const sx = pw / editor.widthPx;
        const sy = ph / editor.heightPx;
        const flipY = (yPx: number) => ph - yPx * sy;

        for (const o of overlays) {
          if (o.kind === 'text') {
            const c = hexToRgb01(o.color);
            page.drawText(o.text, {
              x: o.x * sx,
              y: flipY(o.y + o.fontSize), // anchor baseline near top of bbox
              size: o.fontSize * sy,
              font,
              color: rgb(c.r, c.g, c.b),
              rotate: degrees(-(o.rotation ?? 0)),
            });
          } else if (o.kind === 'rect') {
            const fc = hexToRgb01(o.fill);
            const sc = hexToRgb01(o.stroke);
            page.drawRectangle({
              x: o.x * sx,
              y: flipY(o.y + o.height),
              width: o.width * sx,
              height: o.height * sy,
              color: rgb(fc.r, fc.g, fc.b),
              borderColor: rgb(sc.r, sc.g, sc.b),
              borderWidth: o.strokeWidth * Math.min(sx, sy),
              opacity: o.opacity,
              rotate: degrees(-(o.rotation ?? 0)),
            });
          } else if (o.kind === 'highlight') {
            const fc = hexToRgb01(o.fill);
            page.drawRectangle({
              x: o.x * sx,
              y: flipY(o.y + o.height),
              width: o.width * sx,
              height: o.height * sy,
              color: rgb(fc.r, fc.g, fc.b),
              opacity: o.opacity,
              rotate: degrees(-(o.rotation ?? 0)),
            });
          } else if (o.kind === 'line') {
            const c = hexToRgb01(o.stroke);
            page.drawLine({
              start: { x: o.x * sx, y: flipY(o.y) },
              end: { x: o.ex * sx, y: flipY(o.ey) },
              color: rgb(c.r, c.g, c.b),
              thickness: o.strokeWidth * Math.min(sx, sy),
            });
          } else if (o.kind === 'image') {
            const bin = atob(o.src.split(',')[1]);
            const bytes = new Uint8Array(bin.length);
            for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
            const img = o.mime === 'image/png' ? await src.embedPng(bytes) : await src.embedJpg(bytes);
            page.drawImage(img, {
              x: o.x * sx,
              y: flipY(o.y + o.height),
              width: o.width * sx,
              height: o.height * sy,
              rotate: degrees(-(o.rotation ?? 0)),
            });
          }
        }
        setProgress(Math.round(((i + 1) / pages.length) * 100));
      }

      const blob = await savePdfLib(src);
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'edited',
          ext: '.pdf',
        }),
      });
      setMessage('Saved edited PDF.');
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
  const activeOverlays = getState(active).overlays;
  const canUndo = getState(active).history.length > 0;
  const canRedo = getState(active).future.length > 0;

  const TOOL_BTNS: { id: Tool; label: string; icon: typeof Pencil }[] = [
    { id: 'select', label: 'Select', icon: MousePointer2 },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'rect', label: 'Rectangle', icon: Square },
    { id: 'highlight', label: 'Highlight', icon: Highlighter },
    { id: 'line', label: 'Line', icon: Minus },
    { id: 'image', label: 'Image', icon: ImagePlus },
  ];

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Pencil}
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
          helperText="Add text / shapes / images on top of any page. Originals stay intact underneath."
        />
      }
      preview={
        <div className="space-y-3">
          {rendering && <div className="card text-sm">Rendering pages… {renderPct}%</div>}
          {activePage && (
            <>
              <div className="card p-2 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-ghost px-2 py-1" onClick={() => setActive((a) => Math.max(0, a - 1))} disabled={active === 0}>
                    <ChevronLeft size={14} />
                  </button>
                  <span className="tabular-nums min-w-[4rem] text-center">
                    {active + 1} / {pages.length}
                  </span>
                  <button type="button" className="btn-ghost px-2 py-1" onClick={() => setActive((a) => Math.min(pages.length - 1, a + 1))} disabled={active >= pages.length - 1}>
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-ghost px-2 py-1" onClick={undo} disabled={!canUndo}>
                    <Undo2 size={14} /> Undo
                  </button>
                  <button type="button" className="btn-ghost px-2 py-1" onClick={redo} disabled={!canRedo}>
                    <Redo2 size={14} /> Redo
                  </button>
                  <button type="button" className="btn-ghost px-2 py-1 text-red-600" onClick={deleteSelected} disabled={!selectedId}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
              <div className="overflow-auto thin-scroll max-h-[75vh] bg-slate-100 dark:bg-slate-950/40 p-4 rounded-2xl">
                <PageCanvas
                  bgDataUrl={activePage.thumbDataUrl}
                  widthPx={activePage.widthPx}
                  heightPx={activePage.heightPx}
                  overlays={activeOverlays}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onChange={changeOverlays}
                  onCanvasClick={onCanvasClick}
                  tool={tool_}
                />
              </div>
            </>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Edited PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Tools</h3>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {TOOL_BTNS.map((t) => {
                const Icon = t.icon;
                const active_ = tool_ === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (t.id === 'image') {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/png,image/jpeg';
                        input.onchange = () => {
                          const f = input.files?.[0];
                          if (f) void addImageFromFile(f);
                        };
                        input.click();
                      } else {
                        setTool(t.id);
                      }
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 px-2 py-2 rounded-md text-[10px] font-medium border transition',
                      active_
                        ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40 shadow-glow'
                        : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                    )}
                    title={t.label}
                  >
                    <Icon size={16} />
                    {t.label}
                  </button>
                );
              })}
            </div>
            {tool_ !== 'select' && tool_ !== 'image' && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                Click on the page to add a {tool_}.
              </p>
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3 space-y-2">
            <h3 className="text-sm font-semibold">Defaults for new objects</h3>
            <div className="grid grid-cols-3 gap-2 items-end">
              <label className="block col-span-2">
                <span className="label">Text colour</span>
                <input type="color" className="h-9 w-full rounded cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">Size ({fontSize})</span>
                <input type="range" min={8} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-brand-600" />
              </label>
              <label className="block col-span-2">
                <span className="label">Stroke colour</span>
                <input type="color" className="h-9 w-full rounded cursor-pointer" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">Width ({strokeWidth})</span>
                <input type="range" min={1} max={20} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-full accent-brand-600" />
              </label>
              <label className="block col-span-2">
                <span className="label">Highlight</span>
                <input type="color" className="h-9 w-full rounded cursor-pointer" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">α ({Math.round(opacity * 100)}%)</span>
                <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-brand-600" />
              </label>
            </div>
          </div>

          {selected && (
            <div className="border-t border-slate-200 dark:border-white/10 pt-3 space-y-2">
              <h3 className="text-sm font-semibold">Selected object</h3>
              {selected.kind === 'text' && (
                <>
                  <label className="block">
                    <span className="label">Text</span>
                    <textarea className="input w-full" rows={2} value={selected.text} onChange={(e) => patchSelected({ text: e.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="label">Size ({selected.fontSize.toFixed(0)})</span>
                      <input type="range" min={8} max={120} value={selected.fontSize} onChange={(e) => patchSelected({ fontSize: Number(e.target.value) })} className="w-full accent-brand-600" />
                    </label>
                    <label className="block">
                      <span className="label">Colour</span>
                      <input type="color" className="h-9 w-full rounded cursor-pointer" value={selected.color} onChange={(e) => patchSelected({ color: e.target.value })} />
                    </label>
                  </div>
                </>
              )}
              {(selected.kind === 'rect' || selected.kind === 'highlight') && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">Fill</span>
                    <input type="color" className="h-9 w-full rounded cursor-pointer" value={selected.fill} onChange={(e) => patchSelected({ fill: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">α ({Math.round(selected.opacity * 100)}%)</span>
                    <input type="range" min={0.05} max={1} step={0.05} value={selected.opacity} onChange={(e) => patchSelected({ opacity: Number(e.target.value) })} className="w-full accent-brand-600" />
                  </label>
                </div>
              )}
              {selected.kind === 'line' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">Colour</span>
                    <input type="color" className="h-9 w-full rounded cursor-pointer" value={selected.stroke} onChange={(e) => patchSelected({ stroke: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Width ({selected.strokeWidth})</span>
                    <input type="range" min={1} max={20} value={selected.strokeWidth} onChange={(e) => patchSelected({ strokeWidth: Number(e.target.value) })} className="w-full accent-brand-600" />
                  </label>
                </div>
              )}
            </div>
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
          actionLabel="Save edited PDF"
          actionDisabled={!file || rendering}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
