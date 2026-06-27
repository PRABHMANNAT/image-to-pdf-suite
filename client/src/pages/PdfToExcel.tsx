import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, Info, Copy } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import {
  extractPdfText,
  joinExtractedAsText,
  pagesToCsv,
  toCsv,
  ExtractedPage,
} from '../lib/pdfText';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { useToast } from '../hooks/useToast';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type OutputFormat = 'csv' | 'tsv' | 'txt';

const FORMAT_EXT: Record<OutputFormat, string> = {
  csv: '.csv',
  tsv: '.tsv',
  txt: '.txt',
};

const FORMAT_MIME: Record<OutputFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
};

function tsvFromPages(pages: ExtractedPage[], rowTolerance: number, colTolerance: number): string {
  // Same algorithm as pagesToCsv but joined with tabs.
  const out: string[] = [];
  for (const page of pages) {
    const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; items: typeof page.items }[] = [];
    for (const item of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - item.y) <= rowTolerance) last.items.push(item);
      else rows.push({ y: item.y, items: [item] });
    }
    const xs = sorted.map((s) => s.x).sort((a, b) => a - b);
    const cols: number[] = [];
    for (const x of xs) {
      if (!cols.length || x - cols[cols.length - 1] > colTolerance) cols.push(x);
    }
    if (!cols.length) cols.push(0);
    for (const row of rows) {
      const cells = cols.map(() => '');
      for (const item of [...row.items].sort((a, b) => a.x - b.x)) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < cols.length; i++) {
          const d = Math.abs(item.x - cols[i]);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        cells[bestIdx] = cells[bestIdx] ? `${cells[bestIdx]} ${item.str}` : item.str;
      }
      out.push(cells.map((c) => c.trim().replace(/\t/g, ' ')).join('\t'));
    }
    out.push('');
  }
  return out.join('\n');
}

export default function PdfToExcel() {
  const tool = findTool('pdf-to-excel')!;
  const { settings } = useSettings();
  const toast = useToast();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [format, setFormat] = useState<OutputFormat>('csv');
  const [rowTolerance, setRowTolerance] = useState(4);
  const [colTolerance, setColTolerance] = useState(8);
  const [extractedPreview, setExtractedPreview] = useState<string>('');
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setError(undefined);
    setResult(null);
    setProgress(0);
    setMessage('Reading PDF…');
    setExtractedPreview('');

    try {
      const pages = await extractPdfText(
        file.file,
        (info) => {
          setProgress(info.pct);
          setMessage(`Reading page ${info.current}/${info.total}`);
        },
        abortRef.current.signal,
      );

      let body: string;
      if (format === 'csv') body = pagesToCsv(pages, rowTolerance, colTolerance);
      else if (format === 'tsv') body = tsvFromPages(pages, rowTolerance, colTolerance);
      else body = joinExtractedAsText(pages);

      setExtractedPreview(body);
      const blob = new Blob([body], { type: FORMAT_MIME[format] });
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'pdf-to-excel',
          ext: FORMAT_EXT[format],
        }),
      });
      setMessage(`Extracted ${pages.length} pages.`);
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
    setExtractedPreview('');
  }

  function copy(): void {
    if (!extractedPreview) return;
    navigator.clipboard
      .writeText(extractedPreview)
      .then(() => toast('Copied to clipboard', 'success'))
      .catch(() => toast('Clipboard copy failed', 'error'));
  }

  const formatChips: { id: OutputFormat; label: string; sub: string }[] = useMemo(
    () => [
      { id: 'csv', label: 'CSV', sub: 'Open in Excel / Sheets directly.' },
      { id: 'tsv', label: 'TSV', sub: 'Tab-separated for cleaner paste.' },
      { id: 'txt', label: 'Plain text', sub: 'Lines grouped by Y-position, no columns.' },
    ],
    [],
  );

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Sheet}
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
          helperText="Best for PDFs with selectable text. Scanned/image PDFs need OCR first."
        />
      }
      preview={
        <div className="space-y-4">
          <section className="card text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>
              Table detection is heuristic: items are grouped into rows by
              Y-proximity, columns by clustering their X positions. Tune the
              tolerances if cells merge or split unexpectedly. Run OCR PDF
              first on scanned documents — this tool needs real text.
            </p>
          </section>
          {extractedPreview && (
            <section className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Preview</h3>
                <button type="button" onClick={copy} className="btn-ghost text-xs">
                  <Copy size={13} /> Copy
                </button>
              </div>
              <pre className="thin-scroll max-h-[60vh] overflow-auto whitespace-pre text-[11px] leading-snug p-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900">
                {extractedPreview.slice(0, 20000)}
                {extractedPreview.length > 20000 && '\n\n… (truncated for preview; full content is in the download)'}
              </pre>
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Output format</h3>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {formatChips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFormat(c.id)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                    format === c.id
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {c.label}
                  <span className="block text-[10px] font-normal text-slate-500 mt-0.5">{c.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {format !== 'txt' && (
            <div className="border-t border-slate-200 dark:border-white/10 pt-3 space-y-2">
              <h3 className="text-sm font-semibold">Detection tolerances</h3>
              <label className="block">
                <span className="label">Row tolerance ({rowTolerance})</span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={rowTolerance}
                  onChange={(e) => setRowTolerance(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </label>
              <label className="block">
                <span className="label">Column tolerance ({colTolerance})</span>
                <input
                  type="range"
                  min={1}
                  max={40}
                  value={colTolerance}
                  onChange={(e) => setColTolerance(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </label>
            </div>
          )}
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
          actionLabel={format === 'csv' ? 'Extract as CSV' : format === 'tsv' ? 'Extract as TSV' : 'Extract text'}
          actionDisabled={!file}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
