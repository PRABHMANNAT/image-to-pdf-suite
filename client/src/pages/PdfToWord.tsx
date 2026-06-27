import { useEffect, useMemo, useRef, useState } from 'react';
import { FileType, Server, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { convertPdfBackend, PdfConvertError } from '../lib/convertPdfBackend';
import { extractPdfText, joinExtractedAsText } from '../lib/pdfText';
import { useCapabilities } from '../lib/capabilities';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { applyNamePattern } from '../lib/fileUtils';
import { cn } from '../lib/cn';

type Mode = 'backend' | 'text';

export default function PdfToWord() {
  const tool = findTool('pdf-to-word')!;
  const { settings } = useSettings();
  const caps = useCapabilities();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [mode, setMode] = useState<Mode>('backend');
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const libreofficeAvailable = caps.status === 'ready' && caps.caps.libreoffice.available;
  const backendReachable = caps.status === 'ready';

  // Auto-fall back to the text path if the backend is known-missing.
  useEffect(() => {
    if (caps.status === 'ready' && !libreofficeAvailable) setMode('text');
  }, [caps.status, libreofficeAvailable]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setError(undefined);
    setResult(null);
    setMessage(mode === 'backend' ? 'Uploading…' : 'Reading PDF…');
    try {
      const baseName = file.file.name.replace(/\.pdf$/i, '');
      if (mode === 'backend') {
        const blob = await convertPdfBackend(file.file, 'docx', {
          signal: abortRef.current.signal,
          onUploadProgress: (pct) => {
            setProgress(Math.min(95, pct));
            if (pct >= 100) setMessage('Converting on server…');
          },
        });
        setResult({
          kind: 'single',
          blob,
          suggestedName: applyNamePattern(settings.outputNamePattern, {
            name: baseName,
            tool: 'pdf-to-word',
            ext: '.docx',
          }),
        });
        setProgress(100);
        setMessage('Converted.');
      } else {
        const pages = await extractPdfText(
          file.file,
          (info) => {
            setProgress(info.pct);
            setMessage(`Reading page ${info.current}/${info.total}`);
          },
          abortRef.current.signal,
        );
        const text = joinExtractedAsText(pages);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        setResult({
          kind: 'single',
          blob,
          suggestedName: applyNamePattern(settings.outputNamePattern, {
            name: baseName,
            tool: 'pdf-to-text',
            ext: '.txt',
          }),
        });
        setMessage(`Extracted ${pages.length} pages of plain text.`);
      }
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
    if (caps.status === 'loading') return null;
    if (caps.status === 'unreachable') {
      return (
        <div className="card border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10 text-sm flex items-start gap-2 text-amber-700 dark:text-amber-300">
          <Server size={16} className="mt-0.5" />
          <div>
            <div className="font-semibold">Backend not reachable</div>
            <p className="text-xs mt-0.5">
              True PDF → DOCX needs the local backend with LibreOffice. The browser fallback below extracts plain text only.
            </p>
          </div>
        </div>
      );
    }
    if (!libreofficeAvailable) {
      return (
        <div className="card border border-red-300/60 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10 text-sm">
          <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle size={16} className="mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold">LibreOffice missing on the server</div>
              <p className="text-xs mt-0.5">
                Install LibreOffice to enable real .docx output (see the Word to PDF page for install steps). The browser fallback extracts plain text only.
              </p>
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
            LibreOffice will produce an editable .docx approximation of the PDF.
          </p>
        </div>
      </div>
    );
  }, [caps, libreofficeAvailable]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={FileType}
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
          helperText="Output fidelity depends on whether LibreOffice is available on the server."
        />
      }
      preview={
        <div className="space-y-4">
          {banner}
          <section className="card text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>
              Even with LibreOffice, PDF → Word is approximate — original PDFs
              often lack the semantic structure (paragraph order, table
              boundaries) that Word needs. Expect to do some manual cleanup.
            </p>
          </section>
        </div>
      }
      options={
        <section className="card space-y-3">
          <h3 className="text-sm font-semibold">Mode</h3>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => setMode('backend')}
              disabled={!libreofficeAvailable}
              className={cn(
                'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                mode === 'backend'
                  ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                  : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                !libreofficeAvailable && 'opacity-50 cursor-not-allowed',
              )}
            >
              Editable .docx (LibreOffice)
              {!libreofficeAvailable && (
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                  {backendReachable ? 'LibreOffice not detected' : 'Backend unreachable'}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              className={cn(
                'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                mode === 'text'
                  ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                  : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
              )}
            >
              Plain text (.txt, browser-only)
              <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                Always works. Strips formatting and images.
              </span>
            </button>
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
          actionLabel={mode === 'backend' ? 'Convert to .docx' : 'Extract text'}
          actionDisabled={!file || (mode === 'backend' && !libreofficeAvailable)}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
          indeterminate={mode === 'backend' && progress >= 95 && state === 'processing'}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
