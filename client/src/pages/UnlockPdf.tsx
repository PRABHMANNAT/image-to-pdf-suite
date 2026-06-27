import { useEffect, useMemo, useRef, useState } from 'react';
import { LockOpen, Server, AlertTriangle, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { postSecurity, SecurityError } from '../lib/securityBackend';
import { compressByRasterise } from '../lib/pdfCompress';
import { loadPdfJs } from '../lib/pdfUtils';
import { useCapabilities } from '../lib/capabilities';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { applyNamePattern } from '../lib/fileUtils';
import { cn } from '../lib/cn';

type Mode = 'backend' | 'browser';

export default function UnlockPdf() {
  const tool = findTool('unlock-pdf')!;
  const { settings } = useSettings();
  const caps = useCapabilities();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<Mode>('backend');
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const qpdfAvailable = caps.status === 'ready' && caps.caps.qpdf.available;

  // Auto-pick the browser path when qpdf is known-missing so the action is
  // never falsely greyed out.
  useEffect(() => {
    if (caps.status === 'ready' && !qpdfAvailable) setMode('browser');
  }, [caps.status, qpdfAvailable]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setError(undefined);
    setResult(null);
    setMessage(mode === 'backend' ? 'Uploading…' : 'Verifying password…');

    try {
      const baseName = file.file.name.replace(/\.pdf$/i, '');
      let blob: Blob;
      if (mode === 'backend') {
        blob = await postSecurity(
          '/api/pdf/unlock',
          file.file,
          { password },
          {
            signal: abortRef.current.signal,
            onUploadProgress: (pct) => {
              setProgress(Math.min(95, pct));
              if (pct >= 100) setMessage('Decrypting on server…');
            },
          },
        );
      } else {
        // Browser fallback: verify the password by loading via pdf.js, then
        // rebuild the document as a rasterised PDF. This drops the original
        // text layer — surfaced honestly in the UI.
        try {
          const doc = await loadPdfJs(file.file, password);
          await doc.destroy();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(
            /password/i.test(msg)
              ? 'Wrong password — refusing to bypass. Provide the correct password to unlock.'
              : msg,
          );
        }
        setMessage('Rasterising pages…');
        // Reuse the compress engine to rebuild — at 200 dpi it's high enough
        // for documents that need to stay legible.
        blob = await compressByRasterise(
          file.file,
          { dpi: 200, quality: 0.92 },
          (info) => {
            setProgress(info.pct);
            if (info.message) setMessage(info.message);
          },
          abortRef.current.signal,
        );
      }

      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: baseName,
          tool: 'unlocked',
          ext: '.pdf',
        }),
      });
      setProgress(100);
      setMessage(mode === 'backend' ? 'Password removed.' : 'Rebuilt PDF without encryption (rasterised).');
      setState('success');
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        return;
      }
      setState('error');
      if (e instanceof SecurityError && e.code === 'QPDF_BAD_PASSWORD') {
        setError('Wrong password — refusing to bypass. Provide the correct password to unlock.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
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
              The qpdf-backed decrypt path is unavailable. The browser fallback below verifies the password via pdf.js and rebuilds the document — original text layer is lost.
            </p>
          </div>
        </div>
      );
    }
    if (!qpdfAvailable) {
      return (
        <div className="card border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10 text-sm">
          <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle size={16} className="mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold">qpdf not detected on the server</div>
              <p className="text-xs mt-0.5">
                Install qpdf for true decryption (preserves original text and quality). Until then, the browser fallback handles unlocking but rasterises the pages:
              </p>
              <ul className="text-[11px] list-disc pl-5 mt-1.5 space-y-0.5 font-mono">
                <li>Debian/Ubuntu:&nbsp; <span className="font-mono">sudo apt install qpdf</span></li>
                <li>macOS:&nbsp; <span className="font-mono">brew install qpdf</span></li>
                <li>Windows:&nbsp; <a className="underline" target="_blank" rel="noreferrer" href="https://github.com/qpdf/qpdf/releases">official installer</a></li>
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
          <p className="text-xs mt-0.5">qpdf detected — text layer + quality preserved on unlock.</p>
        </div>
      </div>
    );
  }, [caps, qpdfAvailable]);

  const previewBlob = result?.kind === 'single' ? result.blob : null;

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={LockOpen}
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
          label="Drop a password-protected PDF"
          helperText="The correct password is required — this tool never bypasses unknown passwords."
        />
      }
      preview={
        <div className="space-y-4">
          {banner}
          <section className="card text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>
              By design, this tool only unlocks PDFs whose password the user already knows. The qpdf path produces a byte-clean copy of the original; the browser fallback rebuilds pages by rasterising, which removes the original text layer.
            </p>
          </section>
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Unlocked PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <label className="block">
            <span className="label">PDF password</span>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                className="input w-full pr-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="The current open password"
                autoComplete="current-password"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowPwd((v) => !v)} aria-label="Show password">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold">Unlock method</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => setMode('backend')}
                disabled={!qpdfAvailable}
                className={cn(
                  'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                  mode === 'backend'
                    ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                    : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  !qpdfAvailable && 'opacity-50 cursor-not-allowed',
                )}
              >
                Backend qpdf (lossless)
                {!qpdfAvailable && <span className="block text-[10px] font-normal text-slate-500 mt-0.5">qpdf not detected</span>}
              </button>
              <button
                type="button"
                onClick={() => setMode('browser')}
                className={cn(
                  'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                  mode === 'browser'
                    ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                    : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                )}
              >
                Browser fallback (rasterise)
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                  Verifies password via pdf.js then rebuilds pages as images. Text layer is removed.
                </span>
              </button>
            </div>
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
          actionLabel="Unlock PDF"
          actionDisabled={!file || !password}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
          indeterminate={mode === 'backend' && progress >= 95 && state === 'processing'}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
