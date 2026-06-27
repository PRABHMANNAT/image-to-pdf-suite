import { useEffect, useMemo, useRef, useState } from 'react';
import { Wrench, CheckCircle2, XCircle, Loader2, Circle, AlertTriangle, Server } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { compressByRasterise } from '../lib/pdfCompress';
import { savePdfLib } from '../lib/pdfUtils';
import { applyNamePattern, humanSize } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { useCapabilities } from '../lib/capabilities';
import { postBackendPdf } from '../lib/backendPdf';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type StepKey = 'parse' | 'resave' | 'rasterise';
type StepState = 'pending' | 'active' | 'success' | 'failed' | 'skipped';
type EngineMode = 'backend' | 'browser';

interface StepInfo {
  key: StepKey;
  label: string;
  description: string;
}

const STEPS: StepInfo[] = [
  {
    key: 'parse',
    label: 'Parse with pdf-lib',
    description: 'Reads the cross-reference table tolerantly (throwOnInvalidObject:false).',
  },
  {
    key: 'resave',
    label: 'Rewrite structure',
    description: 'Saves a fresh PDF with object streams — fixes most "minor" damage.',
  },
  {
    key: 'rasterise',
    label: 'Rasterise rebuild (fallback)',
    description: 'When pdf-lib gives up, pdf.js renders every page to images and packs a new PDF.',
  },
];

export default function RepairPdf() {
  const tool = findTool('repair-pdf')!;
  const { settings } = useSettings();
  const caps = useCapabilities();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [engine, setEngine] = useState<EngineMode>('browser');
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({
    parse: 'pending',
    resave: 'pending',
    rasterise: 'pending',
  });
  const [reportLines, setReportLines] = useState<string[]>([]);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const qpdfAvailable = caps.status === 'ready' && caps.caps.qpdf.available;

  useEffect(() => {
    if (qpdfAvailable) setEngine('backend');
  }, [qpdfAvailable]);

  function setStep(key: StepKey, value: StepState): void {
    setSteps((prev) => ({ ...prev, [key]: value }));
  }

  function log(line: string): void {
    setReportLines((prev) => [...prev, line]);
  }

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setError(undefined);
    setResult(null);
    setProgress(0);
    setReportLines([]);
    setSteps({ parse: 'pending', resave: 'pending', rasterise: 'pending' });
    setMessage('Inspecting file…');

    if (engine === 'backend') {
      try {
        setMessage('Repairing with qpdf...');
        const blob = await postBackendPdf('/api/backend/pdf/repair', file.file, {
          signal: abortRef.current.signal,
          onUploadProgress: (pct) => {
            setProgress(Math.min(95, pct));
            if (pct >= 100) setMessage('Rewriting structure with qpdf...');
          },
        });
        setStep('parse', 'success');
        setStep('resave', 'success');
        setStep('rasterise', 'skipped');
        log(`qpdf repaired ${humanSize(file.file.size)} into ${humanSize(blob.size)}.`);
        const name = applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'repaired-qpdf',
          ext: '.pdf',
        });
        setResult({ kind: 'single', blob, suggestedName: name });
        setMessage('Repair succeeded via qpdf backend.');
        setProgress(100);
        setState('success');
        return;
      } catch (e) {
        if (abortRef.current?.signal.aborted) {
          setState('idle');
          return;
        }
        log(`qpdf backend failed: ${e instanceof Error ? e.message : String(e)}`);
        setStep('parse', 'failed');
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
        return;
      }
    }

    const bytes = new Uint8Array(await file.file.arrayBuffer());

    // Step 1 — parse tolerantly with pdf-lib.
    setStep('parse', 'active');
    let parsed: PDFDocument | null = null;
    try {
      parsed = await PDFDocument.load(bytes, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });
      const count = parsed.getPageCount();
      log(`pdf-lib parsed ${count} page${count === 1 ? '' : 's'}.`);
      setStep('parse', 'success');
      setProgress(30);
    } catch (e) {
      log(`pdf-lib parse failed: ${e instanceof Error ? e.message : String(e)}`);
      setStep('parse', 'failed');
    }

    // Step 2 — rewrite. Only attempt when parse succeeded.
    if (parsed) {
      setStep('resave', 'active');
      try {
        const blob = await savePdfLib(parsed);
        log(`Re-saved as ${humanSize(blob.size)} (was ${humanSize(file.file.size)}).`);
        setStep('resave', 'success');
        setStep('rasterise', 'skipped');
        const name = applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'repaired',
          ext: '.pdf',
        });
        setResult({ kind: 'single', blob, suggestedName: name });
        setMessage('Repair succeeded via pdf-lib re-save.');
        setProgress(100);
        setState('success');
        return;
      } catch (e) {
        log(`Re-save failed: ${e instanceof Error ? e.message : String(e)}`);
        setStep('resave', 'failed');
      }
    } else {
      setStep('resave', 'skipped');
    }

    // Step 3 — rasterise rebuild via pdf.js.
    setStep('rasterise', 'active');
    setMessage('Falling back to rasterised rebuild…');
    try {
      const blob = await compressByRasterise(
        file.file,
        { dpi: 150, quality: 0.85 },
        (info) => {
          setProgress(30 + Math.round(info.pct * 0.7));
          if (info.message) setMessage(info.message);
        },
        abortRef.current.signal,
      );
      log(`Rasterised rebuild produced ${humanSize(blob.size)}.`);
      setStep('rasterise', 'success');
      const name = applyNamePattern(settings.outputNamePattern, {
        name: file.file.name.replace(/\.pdf$/i, ''),
        tool: 'repaired-rasterised',
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob, suggestedName: name });
      setMessage('Repair succeeded via rasterised rebuild. Text is now image-only.');
      setProgress(100);
      setState('success');
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        return;
      }
      log(`Rasterise fallback failed: ${e instanceof Error ? e.message : String(e)}`);
      setStep('rasterise', 'failed');
      setError(
        'This PDF is too damaged for browser-side recovery. Try opening it in a desktop tool like qpdf, mutool, or Ghostscript — or run the optional backend repair engine.',
      );
      setState('error');
    }
  }

  function reset(): void {
    abortRef.current?.abort();
    setState('idle');
    setResult(null);
    setProgress(0);
    setMessage(undefined);
    setError(undefined);
    setReportLines([]);
    setSteps({ parse: 'pending', resave: 'pending', rasterise: 'pending' });
  }

  const previewBlob = result?.kind === 'single' ? result.blob : null;

  const stepIcon = (s: StepState) => {
    if (s === 'active') return <Loader2 size={14} className="animate-spin text-brand-600" />;
    if (s === 'success') return <CheckCircle2 size={14} className="text-emerald-600" />;
    if (s === 'failed') return <XCircle size={14} className="text-red-600" />;
    if (s === 'skipped') return <Circle size={14} className="text-slate-400 opacity-60" />;
    return <Circle size={14} className="text-slate-400" />;
  };

  const hasFailures = useMemo(() => Object.values(steps).some((s) => s === 'failed'), [steps]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Wrench}
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
          label="Drop a damaged PDF"
          helperText={qpdfAvailable ? 'qpdf backend is available for native structural repair.' : 'Browser repair tries a tolerant parse, then a rasterised rebuild.'}
        />
      }
      preview={
        <div className="space-y-4">
          <section className="card">
            <h3 className="text-sm font-semibold mb-2">Recovery pipeline</h3>
            <ol className="space-y-2">
              {STEPS.map((s) => (
                <li
                  key={s.key}
                  className={cn(
                    'flex items-start gap-2 p-3 rounded-lg border',
                    steps[s.key] === 'failed'
                      ? 'border-red-300/60 bg-red-50/60 dark:bg-red-500/5 dark:border-red-500/30'
                      : steps[s.key] === 'success'
                        ? 'border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-500/5 dark:border-emerald-500/30'
                        : 'border-slate-200 dark:border-white/10',
                  )}
                >
                  <span className="mt-0.5">{stepIcon(steps[s.key])}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{s.description}</div>
                  </div>
                </li>
              ))}
            </ol>
            {reportLines.length > 0 && (
              <pre className="mt-3 text-[11px] leading-relaxed bg-slate-100 dark:bg-white/5 rounded-lg p-3 whitespace-pre-wrap thin-scroll max-h-48 overflow-auto">
                {reportLines.join('\n')}
              </pre>
            )}
          </section>
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Repaired PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-2 text-sm">
          <h3 className="font-semibold">Engine</h3>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => setEngine('backend')}
              disabled={!qpdfAvailable}
              className={cn(
                'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                engine === 'backend'
                  ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                  : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                !qpdfAvailable && 'opacity-50 cursor-not-allowed',
              )}
            >
              <Server size={13} className="inline mr-1" /> qpdf backend
              <span className="block text-[10px] font-normal text-slate-500 mt-0.5">Native repair and linearized rewrite.</span>
            </button>
            <button
              type="button"
              onClick={() => setEngine('browser')}
              className={cn(
                'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                engine === 'browser'
                  ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                  : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
              )}
            >
              Browser-only recovery
              <span className="block text-[10px] font-normal text-slate-500 mt-0.5">Tolerant pdf-lib re-save, then rasterized fallback.</span>
            </button>
          </div>
          <div className="border-t border-slate-200 dark:border-white/10 pt-2" />
          <h3 className="font-semibold">What this can fix</h3>
          <ul className="text-xs text-slate-500 dark:text-slate-400 list-disc pl-5 space-y-1">
            <li>Broken cross-reference tables (xref) where the page tree is still intact.</li>
            <li>Stripped or invalid object streams.</li>
            <li>Garbage trailing bytes or wrong EOF markers.</li>
            <li>"Cannot open" errors caused by minor structural damage.</li>
          </ul>
          <div className="flex gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-white/10">
            <AlertTriangle size={14} className="shrink-0 text-amber-500 mt-0.5" />
            <p>
              Deeply corrupted PDFs (missing root catalog, content-stream
              compression damage) need a native engine such as qpdf, mutool, or
              OCRmyPDF on a backend. That fallback will appear here once the
              optional backend is detected.
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
          actionLabel={engine === 'backend' ? 'Repair with qpdf' : hasFailures && state === 'idle' ? 'Try again' : 'Repair PDF'}
          actionDisabled={!file || (engine === 'backend' && !qpdfAvailable)}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
