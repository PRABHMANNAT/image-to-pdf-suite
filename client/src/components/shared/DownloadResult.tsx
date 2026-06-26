import { useEffect, useState } from 'react';
import { Download, RotateCcw, Files, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { downloadBlob, downloadMany } from '../../lib/downloadUtils';
import { humanSize, sanitiseFilename, stripExtension, getExtension } from '../../lib/fileUtils';
import { ToolResult } from './types';

interface Props {
  result: ToolResult | null;
  onReset?: () => void;
  className?: string;
}

export function DownloadResult({ result, onReset, className }: Props) {
  const [name, setName] = useState<string>('');
  const [zipping, setZipping] = useState(false);
  const [zipPct, setZipPct] = useState(0);

  useEffect(() => {
    if (!result) return setName('');
    if (result.kind === 'single') setName(result.suggestedName);
    else setName(result.suggestedZipName);
  }, [result]);

  if (!result) return null;
  const current = result;
  const isMany = current.kind === 'many';

  async function handleDownload(): Promise<void> {
    if (current.kind === 'single') {
      downloadBlob(current.blob, sanitiseFilename(name) || current.suggestedName);
      return;
    }
    setZipping(true);
    setZipPct(0);
    try {
      const target = sanitiseFilename(name) || current.suggestedZipName;
      await downloadMany(current.entries, target.endsWith('.zip') ? target : `${target}.zip`, setZipPct);
    } finally {
      setZipping(false);
      setZipPct(0);
    }
  }

  const size = current.kind === 'single' ? current.blob.size : undefined;
  const baseName = stripExtension(name);
  const ext =
    current.kind === 'single' ? getExtension(current.suggestedName) || '' : '.zip';

  return (
    <section
      className={cn(
        'card border border-emerald-300/50 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/5 animate-fade-in',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          {isMany ? <Files size={18} /> : <CheckCircle2 size={18} />}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isMany ? 'Your files are ready' : 'Your file is ready'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {current.kind === 'many'
              ? `${current.entries.length} files will be bundled as a ZIP for download.`
              : `${humanSize(size || 0)} · click download to save.`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className="label">Output name</span>
          <div className="flex items-stretch">
            <input
              className="input rounded-r-none flex-1 min-w-0"
              value={baseName}
              onChange={(e) => setName(`${e.target.value}${ext}`)}
            />
            <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400">
              {ext || ''}
            </span>
          </div>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={handleDownload}
            disabled={zipping}
          >
            <Download size={14} /> {zipping ? `Zipping ${zipPct}%` : 'Download'}
          </button>
          {onReset && (
            <button type="button" className="btn-secondary" onClick={onReset}>
              <RotateCcw size={14} /> Start over
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
