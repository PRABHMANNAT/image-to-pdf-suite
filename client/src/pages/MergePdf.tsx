import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FilePlus, GripVertical, FileText, Trash2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { applyNamePattern, humanSize } from '../lib/fileUtils';
import { parsePageRange } from '../lib/pageRange';
import { loadPdfLib, savePdfLib, renderPdfFirstPageDataUrl } from '../lib/pdfUtils';
import { getPageCountSafe } from '../lib/pdfPages';
import { cn } from '../lib/cn';

interface PdfEntry {
  id: string;
  file: File;
  pageCount?: number;
  thumb?: string;
  range: string; // empty = all
  error?: string;
}

function SortableRow({
  entry,
  onRemove,
  onRangeChange,
}: {
  entry: PdfEntry;
  onRemove: (id: string) => void;
  onRangeChange: (id: string, range: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-white dark:bg-slate-900 p-2 pr-3',
        'border-slate-200/80 dark:border-white/10',
        isDragging && 'ring-2 ring-brand-500/60 shadow-glow',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="btn-ghost px-1.5 py-2 cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={16} />
      </button>
      <div className="shrink-0 w-12 h-14 rounded-md overflow-hidden bg-slate-100 dark:bg-white/5 grid place-items-center">
        {entry.thumb ? (
          <img src={entry.thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <FileText size={18} className="text-slate-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{entry.file.name}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-2">
          <span>{humanSize(entry.file.size)}</span>
          {entry.pageCount !== undefined && <span>{entry.pageCount} pages</span>}
          {entry.error && <span className="text-red-600 dark:text-red-400">{entry.error}</span>}
        </div>
      </div>
      <div className="shrink-0 w-44">
        <span className="label">Pages (blank = all)</span>
        <input
          className="input w-full text-xs"
          value={entry.range}
          placeholder={entry.pageCount ? `1-${entry.pageCount}` : 'e.g. 1-3,5'}
          onChange={(e) => onRangeChange(entry.id, e.target.value)}
        />
      </div>
      <button
        type="button"
        aria-label="Remove"
        onClick={() => onRemove(entry.id)}
        className="btn-ghost px-2 py-2 text-red-600"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function MergePdf() {
  const tool = findTool('merge-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the entry list synchronised with the file dropzone: add entries for
  // new files (and load their metadata) and drop entries whose file went away.
  useEffect(() => {
    const fileIds = new Set(files.map((f) => f.id));
    setEntries((prev) => {
      const kept = prev.filter((p) => fileIds.has(p.id));
      const known = new Set(kept.map((k) => k.id));
      const added: PdfEntry[] = files
        .filter((f) => !known.has(f.id))
        .map((f) => ({ id: f.id, file: f.file, range: '' }));
      return [...kept, ...added];
    });
  }, [files]);

  // Backfill page count + thumbnail asynchronously for newly added entries.
  useEffect(() => {
    const targets = entries.filter((e) => e.pageCount === undefined && !e.error);
    if (!targets.length) return;
    let cancelled = false;
    (async () => {
      for (const e of targets) {
        try {
          const [count, thumb] = await Promise.all([
            getPageCountSafe(e.file),
            renderPdfFirstPageDataUrl(e.file, 96).catch(() => undefined),
          ]);
          if (cancelled) return;
          setEntries((prev) =>
            prev.map((x) => (x.id === e.id ? { ...x, pageCount: count, thumb } : x)),
          );
        } catch (err) {
          if (cancelled) return;
          setEntries((prev) =>
            prev.map((x) =>
              x.id === e.id
                ? { ...x, error: err instanceof Error ? err.message : 'Read failed' }
                : x,
            ),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = entries.findIndex((p) => p.id === active.id);
    const newIdx = entries.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const copy = [...entries];
    const [moved] = copy.splice(oldIdx, 1);
    copy.splice(newIdx, 0, moved);
    setEntries(copy);
  }

  function onRangeChange(id: string, range: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, range } : e)));
  }

  function onRemove(id: string) {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((f) => f.id !== id);
    });
  }

  const totalPages = useMemo(() => {
    return entries.reduce((sum, e) => {
      if (!e.pageCount) return sum;
      const indices = e.range.trim() ? parsePageRange(e.range, e.pageCount) : null;
      return sum + (indices ? indices.length : e.pageCount);
    }, 0);
  }, [entries]);

  async function run(): Promise<void> {
    if (entries.length < 2) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Merging…');
    setError(undefined);
    setResult(null);

    try {
      const out = await PDFDocument.create();
      for (let i = 0; i < entries.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        const e = entries[i];
        const src = await loadPdfLib(e.file);
        const total = src.getPageCount();
        const indices = e.range.trim() ? parsePageRange(e.range, total) : src.getPageIndices();
        if (!indices.length) throw new Error(`No valid pages selected in "${e.file.name}"`);
        const pages = await out.copyPages(src, indices);
        pages.forEach((p) => out.addPage(p));
        setProgress(Math.round(((i + 1) / entries.length) * 100));
        setMessage(`Merged ${i + 1}/${entries.length}`);
      }
      const blob = await savePdfLib(out);
      const suggested = applyNamePattern(settings.outputNamePattern, {
        name: 'merged',
        tool: 'merge-pdf',
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob, suggestedName: suggested });
      setState('success');
      setMessage(`Merged into one PDF (${totalPages} pages).`);
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

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={FilePlus}
      runtime={tool.runtime}
      status={tool.status}
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept="pdf"
          multiple
          maxFiles={100}
          hideZoneWhenFilled={files.length > 0}
          label="Drop PDFs to merge"
          helperText="Drag to reorder, optionally pick a page range per file."
        />
      }
      preview={
        <div className="space-y-4">
          {entries.length > 0 && (
            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Order &amp; ranges · {entries.length} {entries.length === 1 ? 'PDF' : 'PDFs'} · {totalPages || '?'} pages
                </h3>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {entries.map((e) => (
                      <SortableRow key={e.id} entry={e} onRemove={onRemove} onRangeChange={onRangeChange} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Merged PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-2 text-sm">
          <h3 className="font-semibold">Tips</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Page ranges use 1-based numbering: <code className="text-[11px]">1-3,5,9-12</code>.
            Leave blank to include every page of the file.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Original quality is preserved — pages are copied byte-for-byte by pdf-lib.
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
          actionLabel="Merge PDFs"
          actionDisabled={entries.length < 2}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
