import { useEffect, useMemo, useRef, useState } from 'react';
import { FileType2, Server, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { convertPdfBackend, PdfConvertError } from '../lib/convertPdfBackend';
import { useCapabilities } from '../lib/capabilities';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { applyNamePattern } from '../lib/fileUtils';
import { cn } from '../lib/cn';

type Level = '1b' | '2b' | '3b';

const LEVEL_INFO: Record<Level, { title: string; sub: string }> = {
  '1b': { title: 'PDF/A-1b', sub: 'Most compatible. Best for archival of older PDFs.' },
  '2b': { title: 'PDF/A-2b', sub: 'Supports JPEG2000, transparency. Good default.' },
  '3b': { title: 'PDF/A-3b', sub: 'Allows embedded files (e.g. source XML).' },
};

export default function PdfToPdfA() {
  const tool = findTool('pdf-to-pdfa')!;
  const { settings } = useSettings();
  const caps = useCapabilities();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [level, setLevel] = useState<Level>('2b');
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const gsAvailable = caps.status === 'ready' && caps.caps.ghostscript.available;
  const backendReachable = caps.status === 'ready';

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Uploading…');
    setError(undefined);
    setResult(null);
    try {
      const blob = await convertPdfBackend(file.file, 'pdfa', {
        signal: abortRef.current.signal,
        extra: { level },
        onUploadProgress: (pct) => {
          setProgress(Math.min(95, pct));
          if (pct >= 100) setMessage('Converting on server…');
        },
      });
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: `pdfa-${level}`,
          ext: '.pdf',
        }),
      });
      setProgress(100);
      setMessage(`Saved as PDF/A-${level}.`);
      setState('success');
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        return;
      }
      setState('error');
      setError(e instanceof PdfConvertError ? e.message : e instanceof Error ? e.message : String(e));
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

  const banner = useMemo(() => {
    if (caps.status === 'loading') {
      return (
        <div className="card border-slate-200 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400">
          Checking server capabilities…
        </div>
      );
    }
    if (caps.status === 'unreachable') {
      return (
        <div className="card border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10 text-sm flex items-start gap-2 text-amber-700 dark:text-amber-300">
          <Server size={16} className="mt-0.5" />
          <div>
            <div className="font-semibold">Backend not reachable</div>
            <p className="text-xs mt-0.5">
              PDF/A conversion needs the local backend with Ghostscript installed. Start the server with <code className="text-[11px]">npm run dev</code>.
            </p>
          </div>
        </div>
      );
    }
    if (!gsAvailable) {
      return (
        <div className="card border border-red-300/60 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10 text-sm">
          <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle size={16} className="mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold">Ghostscript is not installed on the server</div>
              <p className="text-xs mt-0.5">
                PDF/A conversion needs Ghostscript on the machine running this backend. Install it and the tool unlocks automatically:
              </p>
              <ul className="text-[11px] list-disc pl-5 mt-1.5 space-y-0.5 font-mono">
                <li>Debian/Ubuntu:&nbsp; <span className="font-mono">sudo apt install ghostscript</span></li>
                <li>macOS:&nbsp; <span className="font-mono">brew install ghostscript</span></li>
                <li>Windows:&nbsp; <a className="underline" target="_blank" rel="noreferrer" href="https://www.ghostscript.com/releases/gsdnld.html">official installer</a></li>
                <li>Docker:&nbsp; <span className="font-mono">RUN apt-get install -y ghostscript</span></li>
              </ul>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="card border border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10 text-sm flex items-start gap-2 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 size={16} className="mt-0.5" />
        <div>
          <div className="font-semibold">Backend ready</div>
          <p className="text-xs mt-0.5">
            Ghostscript detected{caps.caps.ghostscript.version ? `: v${caps.caps.ghostscript.version}` : ''}.
          </p>
        </div>
      </div>
    );
  }, [caps, gsAvailable]);

  const previewBlob = result?.kind === 'single' ? result.blob : null;

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={FileType2}
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
          label="Drop a PDF to archive"
          helperText="Backend Ghostscript embeds fonts and normalises colour for long-term archiving."
          disabled={!gsAvailable && backendReachable}
        />
      }
      preview={
        <div className="space-y-4">
          {banner}
          <section className="card text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>
              PDF/A is a strict subset of PDF that guarantees long-term
              reproducibility (every font embedded, no external resources, no
              encryption, normalised colour space). Useful for legal /
              archival deposits.
            </p>
          </section>
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">PDF/A preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-3">
          <h3 className="text-sm font-semibold">Conformance level</h3>
          <div className="grid grid-cols-1 gap-1.5">
            {(['1b', '2b', '3b'] as Level[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                  level === l
                    ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                    : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                )}
              >
                {LEVEL_INFO[l].title}
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">{LEVEL_INFO[l].sub}</span>
              </button>
            ))}
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
          actionLabel="Convert to PDF/A"
          actionDisabled={!file || !gsAvailable}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
          indeterminate={progress >= 95 && state === 'processing'}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
