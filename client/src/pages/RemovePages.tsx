import { useEffect, useMemo, useRef, useState } from 'react';
import { FileMinus } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
  PdfPageGrid,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult, SelectablePage } from '../components/shared';
import { renderAllPagesToDataUrl } from '../lib/pdfPages';
import { loadPdfLib, savePdfLib } from '../lib/pdfUtils';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { PDFDocument } from 'pdf-lib';

export default function RemovePages() {
  const tool = findTool('remove-pages')!;
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
        const rendered = await renderAllPagesToDataUrl(file.file, 200, (info) => {
          if (!cancelled) setRenderPct(info.pct);
        });
        if (cancelled) return;
        setPages(
          rendered.map((p) => ({
            id: `p${p.pageNumber}`,
            pageNumber: p.pageNumber,
            thumbDataUrl: p.dataUrl,
            selected: false,
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

  const removeCount = useMemo(() => pages.filter((p) => p.selected).length, [pages]);
  const keepCount = pages.length - removeCount;

  async function run(): Promise<void> {
    if (!file || removeCount === 0) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Removing pages…');
    setError(undefined);
    setResult(null);

    try {
      const src = await loadPdfLib(file.file);
      const keepIndices = pages.filter((p) => !p.selected).map((p) => p.pageNumber - 1);
      if (!keepIndices.length) throw new Error('Cannot remove every page.');
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, keepIndices);
      copied.forEach((p) => out.addPage(p));
      const blob = await savePdfLib(out);
      const name = applyNamePattern(settings.outputNamePattern, {
        name: file.file.name.replace(/\.pdf$/i, ''),
        tool: 'cleaned',
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob, suggestedName: name });
      setProgress(100);
      setMessage(`Removed ${removeCount} of ${pages.length} pages.`);
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
      icon={FileMinus}
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
          helperText="Then click the pages you want to delete."
        />
      }
      preview={
        <div className="space-y-4">
          {rendering && <div className="card text-sm">Rendering page thumbnails… {renderPct}%</div>}
          {pages.length > 0 && (
            <section className="card">
              <PdfPageGrid
                mode="selection"
                pages={pages}
                onToggle={togglePage}
                onToggleAll={toggleAll}
                highlight="remove"
              />
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Cleaned PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-2 text-sm">
          <h3 className="font-semibold">Selection</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="text-red-600 dark:text-red-400 font-semibold">{removeCount}</span> page
            {removeCount === 1 ? '' : 's'} will be removed · {keepCount} will remain.
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Click thumbnails to toggle. Use "Select all" in the grid header to flip every page.
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
          actionLabel={removeCount === 0 ? 'Pick pages to remove' : `Remove ${removeCount}`}
          actionDisabled={!file || rendering || removeCount === 0}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
