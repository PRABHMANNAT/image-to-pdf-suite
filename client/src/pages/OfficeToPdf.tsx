import { useEffect, useMemo, useRef, useState } from 'react';
import { FileType, Presentation, Sheet, Server, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { convertOfficeToPdf, OfficeConvertError } from '../lib/convertOffice';
import { useCapabilities } from '../lib/capabilities';
import { useSettings } from '../lib/settings';
import { findTool, Tool } from '../lib/tools';
import { applyNamePattern } from '../lib/fileUtils';
import type { AcceptKind } from '../lib/validationUtils';

interface Props {
  toolId: 'word-to-pdf' | 'ppt-to-pdf' | 'excel-to-pdf';
}

const KIND_CONFIG: Record<
  Props['toolId'],
  { accept: AcceptKind; helper: string; iconKey: 'word' | 'ppt' | 'excel' }
> = {
  'word-to-pdf': {
    accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'application/msword': ['.doc'], 'application/vnd.oasis.opendocument.text': ['.odt'], 'application/rtf': ['.rtf'] },
    helper: 'Accepts .doc, .docx, .odt, and .rtf.',
    iconKey: 'word',
  },
  'ppt-to-pdf': {
    accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'], 'application/vnd.ms-powerpoint': ['.ppt'], 'application/vnd.oasis.opendocument.presentation': ['.odp'] },
    helper: 'Accepts .ppt, .pptx, and .odp.',
    iconKey: 'ppt',
  },
  'excel-to-pdf': {
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'], 'application/vnd.oasis.opendocument.spreadsheet': ['.ods'], 'text/csv': ['.csv'] },
    helper: 'Accepts .xls, .xlsx, .ods, and .csv.',
    iconKey: 'excel',
  },
};

const ICONS = {
  word: FileType,
  ppt: Presentation,
  excel: Sheet,
};

export default function OfficeToPdf({ toolId }: Props) {
  const tool = findTool(toolId) as Tool;
  const { settings } = useSettings();
  const caps = useCapabilities();
  const cfg = KIND_CONFIG[toolId];
  const Icon = ICONS[cfg.iconKey];

  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const libreofficeAvailable = caps.status === 'ready' && caps.caps.libreoffice.available;
  const backendReachable = caps.status === 'ready';

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Uploading…');
    setError(undefined);
    setResult(null);
    try {
      const blob = await convertOfficeToPdf(file.file, {
        signal: abortRef.current.signal,
        onUploadProgress: (pct) => {
          setProgress(Math.min(95, pct));
          if (pct >= 100) setMessage('Converting on server…');
        },
      });
      const name = applyNamePattern(settings.outputNamePattern, {
        name: file.file.name.replace(/\.[^.]+$/, ''),
        tool: toolId,
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob, suggestedName: name });
      setProgress(100);
      setMessage('Converted successfully.');
      setState('success');
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        return;
      }
      if (e instanceof OfficeConvertError && e.code === 'LIBREOFFICE_MISSING') {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
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
  }

  const previewBlob = result?.kind === 'single' ? result.blob : null;

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
        <div className="card border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10 text-sm">
          <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
            <Server size={16} className="mt-0.5" />
            <div>
              <div className="font-semibold">Backend not reachable</div>
              <p className="text-xs mt-0.5">
                Office conversion needs a running backend with LibreOffice
                installed. Start the server with <code className="text-[11px]">npm run dev</code>{' '}
                from the project root.
              </p>
            </div>
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
              <div className="font-semibold">LibreOffice is not installed on the server</div>
              <p className="text-xs mt-0.5">
                Office files (.docx, .pptx, .xlsx, …) can only be converted to
                PDF with the LibreOffice engine. Install it on the machine
                running this backend and the tool unlocks automatically:
              </p>
              <ul className="text-[11px] list-disc pl-5 mt-1.5 space-y-0.5 font-mono">
                <li>Debian/Ubuntu:&nbsp; <span className="font-mono">sudo apt install libreoffice</span></li>
                <li>macOS:&nbsp; <span className="font-mono">brew install --cask libreoffice</span></li>
                <li>Windows:&nbsp; <a href="https://www.libreoffice.org/download/" target="_blank" rel="noreferrer" className="underline">download the installer</a></li>
                <li>Docker:&nbsp; <span className="font-mono">RUN apt-get install -y libreoffice fonts-liberation</span></li>
              </ul>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="card border border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10 text-sm">
        <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={16} className="mt-0.5" />
          <div>
            <div className="font-semibold">Backend ready</div>
            <p className="text-xs mt-0.5">
              LibreOffice detected{caps.caps.libreoffice.version ? `: ${caps.caps.libreoffice.version}` : ''}.
            </p>
          </div>
        </div>
      </div>
    );
  }, [caps, libreofficeAvailable]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Icon}
      runtime={tool.runtime}
      status={tool.status}
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept={cfg.accept}
          multiple={false}
          hideZoneWhenFilled={files.length > 0}
          label={tool.name}
          helperText={cfg.helper}
          disabled={!libreofficeAvailable && backendReachable}
        />
      }
      preview={
        <div className="space-y-4">
          {banner}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Converted PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-2 text-sm">
          <h3 className="font-semibold">How it works</h3>
          <ol className="text-xs text-slate-500 dark:text-slate-400 list-decimal pl-5 space-y-1">
            <li>The file is uploaded to your local server.</li>
            <li>LibreOffice headless converts it to PDF in an isolated work directory.</li>
            <li>The PDF streams back to your browser. Server-side temp files are wiped immediately afterwards.</li>
          </ol>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-white/10">
            Layout fidelity matches LibreOffice's own export — usually very close to Word/PowerPoint/Excel but not byte-perfect.
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
          actionLabel={`Convert to PDF`}
          actionDisabled={!file || !libreofficeAvailable}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
          indeterminate={progress >= 95 && state === 'processing'}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
