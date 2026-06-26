import { useCallback, useEffect, useRef, useState } from 'react';
import { ListOrdered, RotateCw, Undo2 } from 'lucide-react';
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
  EditablePage,
  Rotation,
} from '../components/shared';
import { renderAllPagesToDataUrl } from '../lib/pdfPages';
import { loadPdfLib, savePdfLib } from '../lib/pdfUtils';
import { applyNamePattern, uniqueId } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';

function nextRotation(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}

export default function OrganizePdf() {
  const tool = findTool('organize-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [pages, setPages] = useState<EditablePage[]>([]);
  const initialRef = useRef<EditablePage[]>([]);
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
      initialRef.current = [];
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
        const next: EditablePage[] = rendered.map((p) => ({
          id: uniqueId('pg'),
          sourcePageNumber: p.pageNumber,
          thumbDataUrl: p.dataUrl,
          rotation: 0,
        }));
        initialRef.current = next;
        setPages(next);
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

  const onReorder = useCallback((next: EditablePage[]) => setPages(next), []);
  const onRotate = useCallback(
    (id: string) =>
      setPages((prev) => prev.map((p) => (p.id === id ? { ...p, rotation: nextRotation(p.rotation) } : p))),
    [],
  );
  const onDuplicate = useCallback(
    (id: string) =>
      setPages((prev) => {
        const idx = prev.findIndex((p) => p.id === id);
        if (idx === -1) return prev;
        const dup: EditablePage = { ...prev[idx], id: uniqueId('pg') };
        const copy = [...prev];
        copy.splice(idx + 1, 0, dup);
        return copy;
      }),
    [],
  );
  const onDelete = useCallback(
    (id: string) => setPages((prev) => prev.filter((p) => p.id !== id)),
    [],
  );

  function rotateAll(): void {
    setPages((prev) => prev.map((p) => ({ ...p, rotation: nextRotation(p.rotation) })));
  }

  function resetAll(): void {
    setPages(initialRef.current);
  }

  async function run(): Promise<void> {
    if (!file || !pages.length) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Building PDF…');
    setError(undefined);
    setResult(null);

    try {
      const src = await loadPdfLib(file.file);
      const out = await PDFDocument.create();
      // Copy each requested page in user order, applying user rotation on top
      // of the source page's existing rotation.
      const indices = pages.map((p) => p.sourcePageNumber - 1);
      const copied = await out.copyPages(src, indices);
      for (let i = 0; i < copied.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        const page = copied[i];
        const userRot = pages[i].rotation;
        if (userRot) {
          const existing = page.getRotation().angle;
          page.setRotation(degrees((existing + userRot) % 360));
        }
        out.addPage(page);
        setProgress(Math.round(((i + 1) / copied.length) * 100));
      }
      const blob = await savePdfLib(out);
      const name = applyNamePattern(settings.outputNamePattern, {
        name: file.file.name.replace(/\.pdf$/i, ''),
        tool: 'organized',
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob, suggestedName: name });
      setMessage(`Saved ${pages.length} pages.`);
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
  const dirty =
    pages.length !== initialRef.current.length ||
    pages.some((p, i) => {
      const orig = initialRef.current[i];
      return !orig || orig.id !== p.id || orig.rotation !== p.rotation;
    });

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={ListOrdered}
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
          label="Drop a PDF to reorganise"
          helperText="Drag pages, rotate, duplicate, or delete — all visually."
        />
      }
      preview={
        <div className="space-y-4">
          {rendering && <div className="card text-sm">Rendering page thumbnails… {renderPct}%</div>}
          {pages.length > 0 && (
            <section className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {pages.length} {pages.length === 1 ? 'page' : 'pages'}
                  {dirty && <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-300">· modified</span>}
                </h3>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={rotateAll} className="btn-ghost text-xs">
                    <RotateCw size={13} /> Rotate all
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="btn-ghost text-xs"
                    disabled={!dirty}
                  >
                    <Undo2 size={13} /> Reset
                  </button>
                </div>
              </div>
              <PdfPageGrid
                mode="editable"
                pages={pages}
                onReorder={onReorder}
                onRotate={onRotate}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Organised PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-2 text-sm">
          <h3 className="font-semibold">How to use</h3>
          <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-disc pl-5">
            <li>Drag pages by the grip handle to reorder.</li>
            <li>Hover a page for rotate / duplicate / delete actions.</li>
            <li>Source-page numbers are preserved — duplicates copy the original page bytes.</li>
            <li>Reset returns to the freshly-opened state.</li>
          </ul>
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
          actionLabel="Save organised PDF"
          actionDisabled={!file || rendering || pages.length === 0}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
