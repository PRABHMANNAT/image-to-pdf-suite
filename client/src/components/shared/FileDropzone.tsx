import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { useLocation } from 'react-router-dom';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Trash2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Files,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { humanSize, uniqueId } from '../../lib/fileUtils';
import {
  AcceptKind,
  acceptToMap,
  isImage,
  isPdf,
  validateBatch,
} from '../../lib/validationUtils';
import { renderPdfFirstPageDataUrl } from '../../lib/pdfUtils';
import { MAX_FILE_SIZE_DEFAULT } from '../../lib/constants';
import { recordRecentFiles } from '../../lib/recentFiles';
import { AcceptedFile, DropError } from './types';

interface Props {
  /** Controlled list of files currently in the queue. */
  files: AcceptedFile[];
  onChange: (files: AcceptedFile[]) => void;
  accept?: AcceptKind;
  multiple?: boolean;
  maxFiles?: number;
  maxSize?: number;
  showThumbnails?: boolean;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
  /** When true, hide the drop area once files are present (compact mode). */
  hideZoneWhenFilled?: boolean;
}

function makeAccepted(file: File): AcceptedFile {
  return {
    id: uniqueId(),
    file,
    url: isImage(file) ? URL.createObjectURL(file) : undefined,
  };
}

export function FileDropzone({
  files,
  onChange,
  accept = 'any',
  multiple = true,
  maxFiles,
  maxSize = MAX_FILE_SIZE_DEFAULT,
  showThumbnails = true,
  label,
  helperText,
  disabled,
  className,
  hideZoneWhenFilled,
}: Props) {
  const [errors, setErrors] = useState<DropError[]>([]);
  const filesRef = useRef(files);
  const location = useLocation();
  filesRef.current = files;

  // Generate PDF thumbnails lazily once a file lands in the queue.
  useEffect(() => {
    let cancelled = false;
    for (const f of files) {
      if (!isPdf(f.file) || f.thumbUrl || f.error) continue;
      void (async () => {
        try {
          const dataUrl = await renderPdfFirstPageDataUrl(f.file, 192);
          if (cancelled) return;
          const current = filesRef.current;
          const idx = current.findIndex((x) => x.id === f.id);
          if (idx === -1) return;
          const next = [...current];
          next[idx] = { ...next[idx], thumbUrl: dataUrl };
          onChange(next);
        } catch {
          // Leaving thumbUrl undefined falls back to the generic PDF icon.
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.map((f) => f.id).join('|')]);

  // Revoke object URLs when files are removed/replaced.
  useEffect(() => {
    return () => {
      for (const f of filesRef.current) {
        if (f.url) URL.revokeObjectURL(f.url);
      }
    };
  }, []);

  const handleDrop = useCallback(
    (incoming: File[], rejections: FileRejection[]) => {
      const { accepted, rejected } = validateBatch(incoming, {
        accept,
        maxSize,
        maxFiles,
        currentCount: filesRef.current.length,
      });
      const fromDropzoneRejected: DropError[] = rejections.map((r) => ({
        file: r.file,
        reason: r.errors[0]?.message || 'Rejected',
      }));
      const ownRejected: DropError[] = rejected.map((r) => ({ file: r.file, reason: r.reason }));
      const all = [...fromDropzoneRejected, ...ownRejected];
      if (all.length) setErrors(all);

      if (!accepted.length) return;
      const additions = accepted.map(makeAccepted);
      recordRecentFiles(accepted, location.pathname);
      onChange(multiple ? [...filesRef.current, ...additions] : additions.slice(-1));
    },
    [accept, location.pathname, maxFiles, maxSize, multiple, onChange],
  );

  // Auto-dismiss error block after a few seconds.
  useEffect(() => {
    if (!errors.length) return;
    const t = window.setTimeout(() => setErrors([]), 6000);
    return () => window.clearTimeout(t);
  }, [errors]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: acceptToMap(accept),
    multiple,
    disabled,
    maxSize,
    onDrop: handleDrop,
  });

  function remove(id: string): void {
    const next: AcceptedFile[] = [];
    for (const f of files) {
      if (f.id === id) {
        if (f.url) URL.revokeObjectURL(f.url);
        continue;
      }
      next.push(f);
    }
    onChange(next);
  }

  function move(id: string, dir: -1 | 1): void {
    const i = files.findIndex((f) => f.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= files.length) return;
    const copy = [...files];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  }

  function clear(): void {
    for (const f of files) if (f.url) URL.revokeObjectURL(f.url);
    onChange([]);
  }

  const showZone = !hideZoneWhenFilled || files.length === 0;

  return (
    <div className={cn('space-y-3', className)}>
      {showZone && (
        <div
          {...getRootProps()}
          className={cn(
            'relative rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition select-none',
            'bg-white/60 dark:bg-white/[0.03]',
            isDragActive
              ? 'border-brand-500 bg-brand-50/70 dark:bg-brand-500/10 shadow-glow'
              : 'border-slate-300/80 dark:border-white/10 hover:border-brand-500/70 hover:bg-brand-50/40 dark:hover:bg-brand-500/5',
            disabled && 'opacity-60 pointer-events-none',
          )}
          aria-disabled={disabled}
        >
          <input {...getInputProps()} />
          <div className="mx-auto grid place-items-center w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow-glow">
            <UploadCloud size={22} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {label || (multiple ? 'Drop files here or click to select' : 'Drop a file or click to select')}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {helperText || 'Processed locally — nothing is uploaded to the cloud.'}
          </p>
          {maxFiles && (
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Up to {maxFiles} {maxFiles === 1 ? 'file' : 'files'} · max {humanSize(maxSize)} each
            </p>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-300/60 bg-red-50/80 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 p-3 text-xs animate-fade-in">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={14} /> Some files were rejected
          </div>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {errors.slice(0, 5).map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.file?.name || 'File'}:</span> {e.reason}
              </li>
            ))}
            {errors.length > 5 && <li>… and {errors.length - 5} more</li>}
          </ul>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Files size={13} /> {files.length} {files.length === 1 ? 'file' : 'files'}
              <span className="opacity-70">· {humanSize(files.reduce((n, f) => n + f.file.size, 0))}</span>
            </span>
            <button type="button" className="hover:text-red-600 dark:hover:text-red-400" onClick={clear}>
              Clear all
            </button>
          </div>

          <ul className="space-y-2">
            {files.map((f, i) => (
              <li
                key={f.id}
                className="group flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] p-2 pr-2"
              >
                {showThumbnails && (
                  <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-white/5 grid place-items-center">
                    {f.url && isImage(f.file) ? (
                      <img src={f.url} alt="" className="w-full h-full object-cover" />
                    ) : f.thumbUrl ? (
                      <img src={f.thumbUrl} alt="" className="w-full h-full object-cover" />
                    ) : isPdf(f.file) ? (
                      <FileText size={20} className="text-slate-500 dark:text-slate-400" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-500 dark:text-slate-400" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate text-slate-800 dark:text-slate-100">
                    {f.file.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-2">
                    <span>{humanSize(f.file.size)}</span>
                    {f.width && f.height && (
                      <span>
                        {f.width}×{f.height}
                      </span>
                    )}
                    {f.pageCount !== undefined && <span>{f.pageCount} pages</span>}
                    {f.error && <span className="text-red-600 dark:text-red-400">{f.error}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Move up"
                    className="btn-ghost px-2 py-1"
                    onClick={() => move(f.id, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    className="btn-ghost px-2 py-1"
                    onClick={() => move(f.id, 1)}
                    disabled={i === files.length - 1}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove file"
                    className="btn-ghost px-2 py-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    onClick={() => remove(f.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
