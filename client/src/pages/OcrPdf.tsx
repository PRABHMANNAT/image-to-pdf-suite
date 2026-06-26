import { useEffect, useMemo, useRef, useState } from 'react';
import { ScanText, Copy, Info } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import {
  OcrPage,
  buildSearchablePdf,
  disposeOcrWorker,
  joinTextWithBreaks,
  ocrPdf,
} from '../lib/ocr';
import { OCR_LANGUAGES } from '../lib/constants';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { useToast } from '../hooks/useToast';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type OutputKind = 'text' | 'searchable' | 'both';

export default function OcrPdf() {
  const tool = findTool('ocr-pdf')!;
  const { settings } = useSettings();
  const toast = useToast();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [language, setLanguage] = useState<string>(settings.ocrLanguage);
  const [dpi, setDpi] = useState<number>(200);
  const [outputKind, setOutputKind] = useState<OutputKind>('both');
  const [pages, setPages] = useState<OcrPage[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      void disposeOcrWorker();
    };
  }, []);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setError(undefined);
    setResult(null);
    setProgress(0);
    setPages([]);
    setMessage('Initialising OCR engine…');

    try {
      const recognised = await ocrPdf(file.file, {
        language,
        dpi,
        signal: abortRef.current.signal,
        onProgress: (info) => {
          setProgress(info.pct);
          if (info.message) setMessage(info.message);
        },
      });
      setPages(recognised);
      setActivePage(1);

      const baseName = file.file.name.replace(/\.pdf$/i, '');
      if (outputKind === 'text') {
        const text = joinTextWithBreaks(recognised);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        setResult({
          kind: 'single',
          blob,
          suggestedName: applyNamePattern(settings.outputNamePattern, {
            name: baseName,
            tool: 'ocr',
            ext: '.txt',
          }),
        });
      } else if (outputKind === 'searchable') {
        setMessage('Building searchable PDF…');
        const pdf = await buildSearchablePdf(recognised);
        setResult({
          kind: 'single',
          blob: pdf,
          suggestedName: applyNamePattern(settings.outputNamePattern, {
            name: baseName,
            tool: 'ocr',
            ext: '.pdf',
          }),
        });
      } else {
        setMessage('Building searchable PDF + text bundle…');
        const text = joinTextWithBreaks(recognised);
        const pdf = await buildSearchablePdf(recognised);
        setResult({
          kind: 'many',
          entries: [
            { name: applyNamePattern(settings.outputNamePattern, { name: baseName, tool: 'ocr', ext: '.pdf' }), data: pdf },
            { name: applyNamePattern(settings.outputNamePattern, { name: baseName, tool: 'ocr', ext: '.txt' }), data: new Blob([text], { type: 'text/plain;charset=utf-8' }) },
          ],
          suggestedZipName: applyNamePattern(settings.outputNamePattern, {
            name: baseName,
            tool: 'ocr',
            ext: '.zip',
          }),
        });
      }
      setMessage(`Recognised ${recognised.length} page${recognised.length === 1 ? '' : 's'}.`);
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
    setPages([]);
  }

  function copyAll(): void {
    if (!pages.length) return;
    navigator.clipboard
      .writeText(joinTextWithBreaks(pages))
      .then(() => toast('Copied OCR text to clipboard', 'success'))
      .catch(() => toast('Clipboard copy failed', 'error'));
  }

  function copyPage(n: number): void {
    const p = pages.find((pg) => pg.pageNumber === n);
    if (!p) return;
    navigator.clipboard
      .writeText(p.text)
      .then(() => toast(`Copied page ${n}`, 'success'))
      .catch(() => toast('Clipboard copy failed', 'error'));
  }

  const previewBlob = useMemo(() => {
    if (result?.kind === 'single' && result.suggestedName.toLowerCase().endsWith('.pdf')) return result.blob;
    return null;
  }, [result]);

  const active = pages.find((p) => p.pageNumber === activePage) || null;

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={ScanText}
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
          label="Drop a scanned PDF"
          helperText="Tesseract.js runs entirely in your browser. Large PDFs may take a while."
        />
      }
      preview={
        <div className="space-y-4">
          {pages.length > 0 && (
            <section className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Recognised text · {pages.length} pages</h3>
                <button type="button" onClick={copyAll} className="btn-ghost text-xs">
                  <Copy size={13} /> Copy all
                </button>
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {pages.map((p) => (
                  <button
                    key={p.pageNumber}
                    type="button"
                    onClick={() => setActivePage(p.pageNumber)}
                    className={cn(
                      'px-2 py-1 rounded-md text-[11px] font-medium border transition',
                      activePage === p.pageNumber
                        ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300'
                        : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                    )}
                  >
                    Page {p.pageNumber}
                  </button>
                ))}
              </div>

              {active && (
                <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/80 dark:border-white/10">
                    <span className="text-xs font-medium">Page {active.pageNumber}</span>
                    <button
                      type="button"
                      onClick={() => copyPage(active.pageNumber)}
                      className="btn-ghost text-xs"
                    >
                      <Copy size={12} /> Copy page
                    </button>
                  </div>
                  <pre className="thin-scroll max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs leading-relaxed p-3">
                    {active.text.trim() || '(no text detected on this page)'}
                  </pre>
                </div>
              )}
            </section>
          )}

          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Searchable PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Language</h3>
            <select
              className="input w-full mt-2"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {OCR_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Language pack downloads the first time a language is used.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold">Render DPI ({dpi})</h3>
            <input
              type="range"
              min={100}
              max={300}
              step={10}
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value))}
              className="w-full accent-brand-600 mt-2"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Higher DPI → better accuracy but slower and more memory.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold">Output</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {(['text', 'searchable', 'both'] as OutputKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOutputKind(k)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                    outputKind === k
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {k === 'text' && 'Text file (.txt)'}
                  {k === 'searchable' && 'Searchable PDF (image + invisible text)'}
                  {k === 'both' && 'Searchable PDF + text (ZIP)'}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3 text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>
              Browser OCR is excellent for short documents. For long scanned books or batch jobs, the OCRmyPDF backend (when enabled) is significantly faster and produces tighter searchable PDFs.
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
          actionLabel="Run OCR"
          actionDisabled={!file}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
