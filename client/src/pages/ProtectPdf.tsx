import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Server, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { postSecurity, SecurityError } from '../lib/securityBackend';
import { useCapabilities } from '../lib/capabilities';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { applyNamePattern } from '../lib/fileUtils';
import { cn } from '../lib/cn';

export default function ProtectPdf() {
  const tool = findTool('protect-pdf')!;
  const { settings } = useSettings();
  const caps = useCapabilities();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;

  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [allowPrint, setAllowPrint] = useState(false);
  const [allowCopy, setAllowCopy] = useState(false);
  const [allowModify, setAllowModify] = useState(false);

  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const qpdfAvailable = caps.status === 'ready' && caps.caps.qpdf.available;

  useEffect(() => () => abortRef.current?.abort(), []);

  const passwordsMatch = password.length > 0 && password === confirmPwd;
  const canSubmit = !!file && qpdfAvailable && passwordsMatch;

  async function run(): Promise<void> {
    if (!file || !passwordsMatch) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setError(undefined);
    setResult(null);
    setMessage('Uploading…');
    try {
      const blob = await postSecurity(
        '/api/pdf/protect',
        file.file,
        {
          userPassword: password,
          ...(ownerPassword ? { ownerPassword } : {}),
          allowPrint: String(allowPrint),
          allowModify: String(allowModify),
          allowCopy: String(allowCopy),
        },
        {
          signal: abortRef.current.signal,
          onUploadProgress: (pct) => {
            setProgress(Math.min(95, pct));
            if (pct >= 100) setMessage('Encrypting on server…');
          },
        },
      );
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'protected',
          ext: '.pdf',
        }),
      });
      setProgress(100);
      setMessage('PDF encrypted with 256-bit AES.');
      setState('success');
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        return;
      }
      setState('error');
      setError(e instanceof SecurityError ? e.message : e instanceof Error ? e.message : String(e));
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
              True PDF encryption requires the local backend with qpdf installed. Start the server with <code className="text-[11px]">npm run dev</code>.
            </p>
          </div>
        </div>
      );
    }
    if (!qpdfAvailable) {
      return (
        <div className="card border border-red-300/60 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10 text-sm">
          <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle size={16} className="mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold">qpdf is not installed on the server</div>
              <p className="text-xs mt-0.5">
                PDF encryption needs qpdf — pdf-lib intentionally doesn't support it. Install qpdf and the tool unlocks automatically:
              </p>
              <ul className="text-[11px] list-disc pl-5 mt-1.5 space-y-0.5 font-mono">
                <li>Debian/Ubuntu:&nbsp; <span className="font-mono">sudo apt install qpdf</span></li>
                <li>macOS:&nbsp; <span className="font-mono">brew install qpdf</span></li>
                <li>Windows:&nbsp; <a className="underline" target="_blank" rel="noreferrer" href="https://github.com/qpdf/qpdf/releases">official installer</a></li>
                <li>Docker:&nbsp; <span className="font-mono">RUN apt-get install -y qpdf</span></li>
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
            qpdf detected{caps.caps.qpdf.version ? `: ${caps.caps.qpdf.version}` : ''}. PDFs will be encrypted with 256-bit AES.
          </p>
        </div>
      </div>
    );
  }, [caps, qpdfAvailable]);

  const previewBlob = result?.kind === 'single' ? result.blob : null;

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Lock}
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
          label="Drop a PDF to encrypt"
          helperText="256-bit AES encryption via qpdf on the backend."
          disabled={!qpdfAvailable && caps.status === 'ready'}
        />
      }
      preview={
        <div className="space-y-4">
          {banner}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Protected PDF preview</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                Preview is limited because the PDF is encrypted — opening it elsewhere will prompt for the password.
              </p>
              <PreviewViewer source={previewBlob} type="pdf" password={password} />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div className="space-y-2">
            <label className="block">
              <span className="label">Open password</span>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input w-full pr-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Required to open"
                />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowPwd((v) => !v)} aria-label="Show password">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="label">Confirm password</span>
              <input
                type={showPwd ? 'text' : 'password'}
                className="input w-full"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
              {confirmPwd && !passwordsMatch && (
                <span className="text-[11px] text-red-600 dark:text-red-400">Passwords don't match.</span>
              )}
            </label>
            <details>
              <summary className="text-xs font-semibold cursor-pointer">Owner password (advanced)</summary>
              <input
                type={showPwd ? 'text' : 'password'}
                className="input w-full mt-2"
                placeholder="Defaults to the open password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                The owner password lets you change permissions later without re-encrypting.
              </p>
            </details>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold">Permissions</h3>
            <div className="mt-2 space-y-1.5 text-sm">
              {(
                [
                  { id: 'print', label: 'Allow printing', value: allowPrint, set: setAllowPrint },
                  { id: 'copy', label: 'Allow copying / text extraction', value: allowCopy, set: setAllowCopy },
                  { id: 'modify', label: 'Allow editing', value: allowModify, set: setAllowModify },
                ] as { id: string; label: string; value: boolean; set: (v: boolean) => void }[]
              ).map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-brand-600"
                    checked={p.value}
                    onChange={(e) => p.set(e.target.checked)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Unchecked permissions become hard restrictions in the resulting PDF. Some viewers may still allow accessibility extraction by design.
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
          actionLabel="Encrypt PDF"
          actionDisabled={!canSubmit}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
          indeterminate={progress >= 95 && state === 'processing'}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
