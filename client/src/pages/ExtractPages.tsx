import { useEffect, useMemo, useRef, useState } from 'react';
import { FileOutput } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
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
import { cn } from '../lib/cn';

type OutputMode = 'combined' | 'per-page';

export default function ExtractPages() {
  const tool = findTool('extract-pages')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [pages, setPages] = useState<SelectablePage[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [outputMode, setOutputMode] = useState<OutputMode>('combined');
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

  const selectedIndices = useMemo(
    () => pages.filter((p) => p.selected).map((p) => p.pageNumber - 1),
    [pages],
  );

  async function run(): Promise<void> {
    if (!file || !selectedIndices.length) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Extracting…');
    setError(undefined);
    setResult(null);

    try {
      const src = await loadPdfLib(file.file);
      const baseName = file.file.name.replace(/\.pdf$/i, '');

      if (outputMode === 'combined') {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, selectedIndices);
        copied.forEach((p) => out.addPage(p));
        const blob = await savePdfLib(out);
        const name = applyNamePattern(settings.outputNamePattern, {
          name: baseName,
          tool: 'extracted',
          ext: '.pdf',
        });
        setResult({ kind: 'single', blob, suggestedName: name });
      } else {
        const entries: { name: string; data: Blob }[] = [];
        for (let i = 0; i < selectedIndices.length; i++) {
          if (abortRef.current.signal.aborted) throw new Error('Cancelled');
          const idx = selectedIndices[i];
          const out = await PDFDocument.create();
          const [p] = await out.copyPages(src, [idx]);
          out.addPage(p);
          const blob = await savePdfLib(out);
          const name = applyNamePattern(settings.outputNamePattern, {
            name: `${baseName}-p${idx + 1}`,
            tool: 'extracted',
            index: i,
            total: selectedIndices.length,
            ext: '.pdf',
          });
          entries.push({ name, data: blob });
          setProgress(Math.round(((i + 1) / selectedIndices.length) * 100));
        }
        setResult({
          kind: 'many',
          entries,
          suggestedZipName: applyNamePattern(settings.outputNamePattern, {
            name: baseName,
            tool: 'extracted',
            ext: '.zip',
          }),
        });
      }
      setMessage(`Extracted ${selectedIndices.length} page${selectedIndices.length === 1 ? '' : 's'}.`);
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
      icon={FileOutput}
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
          helperText="Click the pages you want to extract."
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
                highlight="add"
              />
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Extracted PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Output</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {(['combined', 'per-page'] as OutputMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setOutputMode(m)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                    outputMode === m
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {m === 'combined' ? 'One combined PDF' : 'One PDF per page (ZIP)'}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {selectedIndices.length} of {pages.length} pages selected.
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
          actionLabel={selectedIndices.length === 0 ? 'Pick pages to extract' : `Extract ${selectedIndices.length}`}
          actionDisabled={!file || rendering || selectedIndices.length === 0}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
