import { useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Scissors } from 'lucide-react';
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
import { parsePageRange } from '../lib/pageRange';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type SplitMode = 'every' | 'ranges' | 'extract' | 'after' | 'chunks';

const MODE_INFO: Record<SplitMode, { label: string; helper: string; needsVisual: boolean }> = {
  every: { label: 'Every page', helper: 'Each page becomes its own PDF. Outputs are bundled as a ZIP.', needsVisual: false },
  ranges: { label: 'Custom ranges', helper: 'Comma-separated ranges (e.g. "1-3,5,7-9"). Each comma piece becomes one PDF.', needsVisual: false },
  extract: { label: 'Extract selected', helper: 'Click pages to include. All selected pages become one PDF.', needsVisual: true },
  after: { label: 'Split after pages', helper: 'Click pages — the document is split right BEFORE each clicked page.', needsVisual: true },
  chunks: { label: 'Fixed chunks', helper: 'Every N pages become one PDF.', needsVisual: false },
};

export default function SplitPdf() {
  const tool = findTool('split-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [pages, setPages] = useState<SelectablePage[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [mode, setMode] = useState<SplitMode>('every');
  const [rangesText, setRangesText] = useState('');
  const [chunkSize, setChunkSize] = useState(1);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Render thumbnails whenever a fresh PDF is dropped.
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
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to render preview');
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

  const selectedPageNumbers = useMemo(() => pages.filter((p) => p.selected).map((p) => p.pageNumber), [pages]);

  /** Returns each output PDF as an array of zero-based page indices to copy. */
  function planSplits(total: number): number[][] {
    switch (mode) {
      case 'every': {
        const out: number[][] = [];
        for (let i = 0; i < total; i++) out.push([i]);
        return out;
      }
      case 'chunks': {
        const size = Math.max(1, Math.floor(chunkSize));
        const out: number[][] = [];
        for (let i = 0; i < total; i += size) {
          const slice: number[] = [];
          for (let j = i; j < Math.min(i + size, total); j++) slice.push(j);
          out.push(slice);
        }
        return out;
      }
      case 'ranges': {
        const out: number[][] = [];
        const parts = rangesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const part of parts) {
          const indices = parsePageRange(part, total);
          if (indices.length) out.push(indices);
        }
        return out;
      }
      case 'extract': {
        const indices = selectedPageNumbers.map((n) => n - 1);
        return indices.length ? [indices] : [];
      }
      case 'after': {
        const boundaries = [...selectedPageNumbers].sort((a, b) => a - b);
        const out: number[][] = [];
        let start = 0;
        for (const b of boundaries) {
          const cut = b - 1; // 0-based first page of next chunk
          if (cut <= start) continue;
          const slice: number[] = [];
          for (let i = start; i < cut; i++) slice.push(i);
          if (slice.length) out.push(slice);
          start = cut;
        }
        const tail: number[] = [];
        for (let i = start; i < total; i++) tail.push(i);
        if (tail.length) out.push(tail);
        return out;
      }
    }
  }

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setError(undefined);
    setResult(null);
    setProgress(0);
    setMessage('Splitting…');

    try {
      const src = await loadPdfLib(file.file);
      const total = src.getPageCount();
      const plan = planSplits(total);
      if (!plan.length) throw new Error('No valid pages selected for the current mode.');

      const blobs: { name: string; blob: Blob }[] = [];
      for (let i = 0; i < plan.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        const indices = plan[i];
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, indices);
        copied.forEach((p) => out.addPage(p));
        const blob = await savePdfLib(out);
        const partName = applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'split',
          index: i,
          total: plan.length,
          ext: '.pdf',
        });
        blobs.push({ name: partName, blob });
        setProgress(Math.round(((i + 1) / plan.length) * 100));
      }

      if (blobs.length === 1) {
        setResult({ kind: 'single', blob: blobs[0].blob, suggestedName: blobs[0].name });
      } else {
        setResult({
          kind: 'many',
          entries: blobs.map((b) => ({ name: b.name, data: b.blob })),
          suggestedZipName: applyNamePattern(settings.outputNamePattern, {
            name: file.file.name.replace(/\.pdf$/i, ''),
            tool: 'split',
            ext: '.zip',
          }),
        });
      }
      setMessage(`Produced ${blobs.length} ${blobs.length === 1 ? 'PDF' : 'PDFs'}.`);
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
  const showVisualGrid = pages.length > 0 && MODE_INFO[mode].needsVisual;
  const showReadOnlyGrid = pages.length > 0 && !MODE_INFO[mode].needsVisual;

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Scissors}
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
          label="Drop a PDF to split"
          helperText="Page thumbnails will appear once it is read."
        />
      }
      preview={
        <div className="space-y-4">
          {rendering && (
            <div className="card text-sm">
              Rendering page thumbnails… {renderPct}%
            </div>
          )}
          {showVisualGrid && (
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
          {showReadOnlyGrid && (
            <section className="card opacity-90">
              <PdfPageGrid
                mode="selection"
                pages={pages.map((p) => ({ ...p, selected: false }))}
                onToggle={() => {}}
              />
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">First output preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Split mode</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {(Object.keys(MODE_INFO) as SplitMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition',
                    mode === m
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  <span className="text-xs font-semibold">{MODE_INFO[m].label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{MODE_INFO[mode].helper}</p>
          </div>

          {mode === 'ranges' && (
            <label className="block">
              <span className="label">Ranges</span>
              <input
                className="input w-full"
                value={rangesText}
                placeholder="1-3,5,7-9"
                onChange={(e) => setRangesText(e.target.value)}
              />
            </label>
          )}

          {mode === 'chunks' && (
            <label className="block">
              <span className="label">Pages per chunk</span>
              <input
                type="number"
                min={1}
                className="input w-full"
                value={chunkSize}
                onChange={(e) => setChunkSize(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
          )}

          {(mode === 'extract' || mode === 'after') && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {selectedPageNumbers.length} page{selectedPageNumbers.length === 1 ? '' : 's'} selected.
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
          actionLabel="Split"
          actionDisabled={!file || rendering || (
            (mode === 'extract' || mode === 'after') && selectedPageNumbers.length === 0
          ) || (mode === 'ranges' && !rangesText.trim())}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
