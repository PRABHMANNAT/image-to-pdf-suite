import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, RotateCcw, Undo2 } from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
  PdfPageGrid,
} from '../components/shared';
import type {
  AcceptedFile,
  ProcessingState,
  ToolResult,
  SelectablePage,
  Rotation,
} from '../components/shared';
import { renderAllPagesToDataUrl } from '../lib/pdfPages';
import { loadPdfLib, savePdfLib } from '../lib/pdfUtils';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

function addRotation(current: Rotation, delta: 90 | 180 | 270 | -90): Rotation {
  const next = ((current + delta + 360) % 360) as Rotation;
  return next;
}

export default function RotatePdf() {
  const tool = findTool('rotate-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [pages, setPages] = useState<SelectablePage[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) {
      setPages([]);
      return;
    }
    let cancelled = false;
    setRendering(true);
    setRenderPct(0);
    (async () => {
      try {
        const rendered = await renderAllPagesToDataUrl(file.file, 220, (info) => {
          if (!cancelled) setRenderPct(info.pct);
        });
        if (cancelled) return;
        setPages(
          rendered.map((p) => ({
            id: `p${p.pageNumber}`,
            pageNumber: p.pageNumber,
            thumbDataUrl: p.dataUrl,
            selected: false,
            rotation: 0,
          })),
        );
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

  function togglePage(id: string) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  }
  function toggleAll(select: boolean) {
    setPages((prev) => prev.map((p) => ({ ...p, selected: select })));
  }

  function rotateSelected(delta: 90 | 180 | 270 | -90) {
    setPages((prev) =>
      prev.map((p) => (p.selected ? { ...p, rotation: addRotation((p.rotation ?? 0) as Rotation, delta) } : p)),
    );
  }
  function rotateAll(delta: 90 | 180 | 270 | -90) {
    setPages((prev) => prev.map((p) => ({ ...p, rotation: addRotation((p.rotation ?? 0) as Rotation, delta) })));
  }
  function resetRotations() {
    setPages((prev) => prev.map((p) => ({ ...p, rotation: 0 })));
  }

  const selectedCount = useMemo(() => pages.filter((p) => p.selected).length, [pages]);
  const modifiedCount = useMemo(() => pages.filter((p) => (p.rotation ?? 0) !== 0).length, [pages]);

  async function run(): Promise<void> {
    if (!file || !pages.length) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Applying rotations…');
    setError(undefined);
    setResult(null);
    try {
      const src = await loadPdfLib(file.file);
      const allIndices = pages.map((p) => p.pageNumber - 1);
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, allIndices);
      for (let i = 0; i < copied.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        const page = copied[i];
        const delta = pages[i].rotation ?? 0;
        if (delta) {
          const existing = page.getRotation().angle;
          page.setRotation(degrees((existing + delta) % 360));
        }
        out.addPage(page);
        setProgress(Math.round(((i + 1) / copied.length) * 100));
      }
      const blob = await savePdfLib(out);
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'rotated',
          ext: '.pdf',
        }),
      });
      setMessage(`Rotated ${modifiedCount} of ${pages.length} pages.`);
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
  const scope = selectedCount > 0 ? 'selected' : 'all';

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={RotateCw}
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
          helperText="Pick pages then apply a rotation, or rotate the whole document."
        />
      }
      preview={
        <div className="space-y-4">
          {rendering && <div className="card text-sm">Rendering page thumbnails… {renderPct}%</div>}
          {pages.length > 0 && (
            <section className="card space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {selectedCount > 0
                    ? `${selectedCount} selected`
                    : 'No selection — rotation buttons apply to ALL pages'}
                  {modifiedCount > 0 && (
                    <span className="ml-2 text-amber-600 dark:text-amber-300">· {modifiedCount} modified</span>
                  )}
                </span>
              </div>
              <PdfPageGrid
                mode="selection"
                pages={pages}
                onToggle={togglePage}
                onToggleAll={toggleAll}
                highlight="add"
              />
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Rotated PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-3">
          <h3 className="text-sm font-semibold">
            Rotate <span className="text-brand-600 dark:text-brand-400">{scope}</span>
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { label: '−90°', delta: -90 as const },
              { label: '+90°', delta: 90 as const },
              { label: '180°', delta: 180 as const },
              { label: '270°', delta: 270 as const },
            ]).map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => (selectedCount > 0 ? rotateSelected(b.delta) : rotateAll(b.delta))}
                className={cn(
                  'px-3 py-2 rounded-lg border text-sm font-semibold transition',
                  'border-slate-200 dark:border-white/10 hover:border-brand-500/40 hover:bg-brand-50/40 dark:hover:bg-brand-500/10',
                )}
              >
                {b.label === '−90°' ? <RotateCcw size={14} className="inline mr-1" /> : <RotateCw size={14} className="inline mr-1" />}
                {b.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={resetRotations}
            disabled={!modifiedCount}
            className="btn-ghost text-xs w-full justify-center"
          >
            <Undo2 size={13} /> Reset rotations
          </button>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Rotation stacks on the page's existing orientation — exporting writes the sum into the PDF's rotation field, no rasterisation.
          </p>
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
          actionLabel={modifiedCount ? `Save rotated PDF` : 'Save'}
          actionDisabled={!file || rendering}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
