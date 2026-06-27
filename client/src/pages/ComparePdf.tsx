import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitCompareArrows,
  Image as ImageIcon,
} from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { loadPdfJs } from '../lib/pdfUtils';
import type { PDFDocumentProxy } from '../lib/pdfUtils';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

interface PagePreview {
  a?: string;
  b?: string;
  diff?: string;
  width: number;
  height: number;
}

interface PageComparison {
  pageNumber: number;
  status: 'same' | 'changed' | 'missing-a' | 'missing-b';
  textDiffs: number;
  visualDiffPct: number | null;
  aText: string;
  bText: string;
  preview: PagePreview;
}

interface CompareReport {
  aName: string;
  bName: string;
  pageCountA: number;
  pageCountB: number;
  changedPages: number;
  textChangedPages: number;
  visuallyChangedPages: number;
  pages: PageComparison[];
}

const RENDER_SCALE = 0.9;
const PIXEL_TOLERANCE = 36;
const VISUAL_CHANGE_THRESHOLD = 0.25;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tokenDiffCount(aText: string, bText: string): number {
  const a = normalizeText(aText).split(' ').filter(Boolean).slice(0, 700);
  const b = normalizeText(bText).split(' ').filter(Boolean).slice(0, 700);
  if (!a.length && !b.length) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  const prev = new Array(b.length + 1).fill(0);
  const curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  const common = prev[b.length];
  return a.length + b.length - common * 2;
}

async function extractPageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  try {
    const content = await page.getTextContent();
    return normalizeText(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' '),
    );
  } finally {
    page.cleanup();
  }
}

async function renderPage(doc: PDFDocumentProxy, pageNumber: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  try {
    const vp = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(vp.width));
    canvas.height = Math.max(1, Math.floor(vp.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  } finally {
    page.cleanup();
  }
}

function copyToSizedCanvas(source: HTMLCanvasElement | null, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (source) ctx.drawImage(source, 0, 0);
  return canvas;
}

function compareCanvases(
  aCanvas: HTMLCanvasElement | null,
  bCanvas: HTMLCanvasElement | null,
): { pct: number | null; diffDataUrl?: string; width: number; height: number } {
  const width = Math.max(aCanvas?.width ?? 0, bCanvas?.width ?? 0, 1);
  const height = Math.max(aCanvas?.height ?? 0, bCanvas?.height ?? 0, 1);
  if (!aCanvas || !bCanvas) return { pct: null, width, height };

  const a = copyToSizedCanvas(aCanvas, width, height);
  const b = copyToSizedCanvas(bCanvas, width, height);
  const aCtx = a.getContext('2d');
  const bCtx = b.getContext('2d');
  if (!aCtx || !bCtx) throw new Error('Canvas 2D context not available');

  const aData = aCtx.getImageData(0, 0, width, height).data;
  const bData = bCtx.getImageData(0, 0, width, height).data;
  const diff = document.createElement('canvas');
  diff.width = width;
  diff.height = height;
  const diffCtx = diff.getContext('2d');
  if (!diffCtx) throw new Error('Canvas 2D context not available');
  diffCtx.drawImage(b, 0, 0);
  const overlay = diffCtx.getImageData(0, 0, width, height);
  let changed = 0;

  for (let i = 0; i < aData.length; i += 4) {
    const delta =
      Math.abs(aData[i] - bData[i]) +
      Math.abs(aData[i + 1] - bData[i + 1]) +
      Math.abs(aData[i + 2] - bData[i + 2]);
    if (delta > PIXEL_TOLERANCE) {
      changed += 1;
      overlay.data[i] = 239;
      overlay.data[i + 1] = 68;
      overlay.data[i + 2] = 68;
      overlay.data[i + 3] = 190;
    }
  }

  diffCtx.putImageData(overlay, 0, 0);
  return {
    pct: (changed / (width * height)) * 100,
    diffDataUrl: diff.toDataURL('image/png'),
    width,
    height,
  };
}

function makeReportHtml(report: CompareReport): string {
  const rows = report.pages
    .map((page) => {
      const visual = page.visualDiffPct === null ? 'n/a' : `${page.visualDiffPct.toFixed(2)}%`;
      const aText = page.aText ? escapeHtml(page.aText.slice(0, 320)) : '';
      const bText = page.bText ? escapeHtml(page.bText.slice(0, 320)) : '';
      return `
        <tr>
          <td>${page.pageNumber}</td>
          <td>${page.status}</td>
          <td>${page.textDiffs}</td>
          <td>${visual}</td>
          <td>${aText}</td>
          <td>${bText}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>PDF comparison report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #172033; margin: 32px; }
    h1 { margin-bottom: 4px; }
    .meta { color: #526174; font-size: 13px; margin-bottom: 20px; }
    .summary { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; margin: 20px 0; }
    .box { border: 1px solid #d9e1ec; border-radius: 8px; padding: 12px; }
    .value { font-size: 24px; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: 1px solid #d9e1ec; padding: 8px; vertical-align: top; font-size: 12px; word-break: break-word; }
    th { background: #f4f7fb; text-align: left; }
  </style>
</head>
<body>
  <h1>PDF comparison report</h1>
  <div class="meta">${escapeHtml(report.aName)} compared with ${escapeHtml(report.bName)}</div>
  <div class="summary">
    <div class="box"><div class="value">${report.pageCountA}</div><div>Pages in A</div></div>
    <div class="box"><div class="value">${report.pageCountB}</div><div>Pages in B</div></div>
    <div class="box"><div class="value">${report.changedPages}</div><div>Changed pages</div></div>
    <div class="box"><div class="value">${report.textChangedPages}</div><div>Text changed</div></div>
    <div class="box"><div class="value">${report.visuallyChangedPages}</div><div>Visual changed</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 54px;">Page</th>
        <th style="width: 90px;">Status</th>
        <th style="width: 80px;">Text diffs</th>
        <th style="width: 90px;">Visual diff</th>
        <th>Text A sample</th>
        <th>Text B sample</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export default function ComparePdf() {
  const tool = findTool('compare-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const [report, setReport] = useState<CompareReport | null>(null);
  const [active, setActive] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fileA = files[0]?.file ?? null;
  const fileB = files[1]?.file ?? null;

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    setResult(null);
    setReport(null);
    setState('idle');
    setProgress(0);
    setMessage(undefined);
    setError(undefined);
    setActive(0);
  }, [files.map((f) => f.id).join('|')]);

  async function run(): Promise<void> {
    if (!fileA || !fileB) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Loading PDFs...');
    setError(undefined);
    setResult(null);
    setReport(null);

    let docA: PDFDocumentProxy | null = null;
    let docB: PDFDocumentProxy | null = null;
    try {
      docA = await loadPdfJs(fileA);
      docB = await loadPdfJs(fileB);
      const total = Math.max(docA.numPages, docB.numPages);
      const pages: PageComparison[] = [];

      for (let i = 1; i <= total; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        setMessage(`Comparing page ${i} of ${total}...`);

        const hasA = i <= docA.numPages;
        const hasB = i <= docB.numPages;
        const [aText, bText, aCanvas, bCanvas] = await Promise.all([
          hasA ? extractPageText(docA, i) : Promise.resolve(''),
          hasB ? extractPageText(docB, i) : Promise.resolve(''),
          hasA ? renderPage(docA, i) : Promise.resolve(null),
          hasB ? renderPage(docB, i) : Promise.resolve(null),
        ]);

        const visual = compareCanvases(aCanvas, bCanvas);
        const textDiffs = tokenDiffCount(aText, bText);
        const visualChanged = visual.pct !== null && visual.pct > VISUAL_CHANGE_THRESHOLD;
        const status =
          !hasA ? 'missing-a' :
            !hasB ? 'missing-b' :
              textDiffs > 0 || visualChanged ? 'changed' : 'same';

        pages.push({
          pageNumber: i,
          status,
          textDiffs,
          visualDiffPct: visual.pct,
          aText,
          bText,
          preview: {
            a: aCanvas?.toDataURL('image/png'),
            b: bCanvas?.toDataURL('image/png'),
            diff: visual.diffDataUrl,
            width: visual.width,
            height: visual.height,
          },
        });
        setProgress(Math.round((i / total) * 100));
      }

      const nextReport: CompareReport = {
        aName: fileA.name,
        bName: fileB.name,
        pageCountA: docA.numPages,
        pageCountB: docB.numPages,
        changedPages: pages.filter((p) => p.status !== 'same').length,
        textChangedPages: pages.filter((p) => p.textDiffs > 0).length,
        visuallyChangedPages: pages.filter((p) => (p.visualDiffPct ?? 0) > VISUAL_CHANGE_THRESHOLD).length,
        pages,
      };
      const reportBlob = new Blob([makeReportHtml(nextReport)], { type: 'text/html;charset=utf-8' });
      setReport(nextReport);
      setActive(Math.max(0, pages.findIndex((p) => p.status !== 'same')));
      setResult({
        kind: 'single',
        blob: reportBlob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: fileA.name.replace(/\.pdf$/i, ''),
          tool: 'comparison-report',
          ext: '.html',
        }),
      });
      setMessage(`${nextReport.changedPages} changed page${nextReport.changedPages === 1 ? '' : 's'} found.`);
      setState('success');
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        return;
      }
      setState('error');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      await docA?.destroy();
      await docB?.destroy();
    }
  }

  function reset(): void {
    abortRef.current?.abort();
    setState('idle');
    setResult(null);
    setReport(null);
    setProgress(0);
    setMessage(undefined);
    setError(undefined);
    setActive(0);
  }

  const activePage = report?.pages[active] ?? null;
  const changedPages = useMemo(() => report?.pages.filter((p) => p.status !== 'same') ?? [], [report]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={GitCompareArrows}
      runtime={tool.runtime}
      status="beta"
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept="pdf"
          multiple
          maxFiles={2}
          hideZoneWhenFilled={files.length >= 2}
          label="Drop two PDFs to compare"
          helperText="Compares page count, extracted text, and rendered page pixels in the browser."
        />
      }
      preview={
        <div className="space-y-4">
          {!report && (
            <section className="card text-sm text-slate-600 dark:text-slate-400">
              Upload two PDFs, then run the comparison to see changed pages and a side by side preview.
            </section>
          )}

          {report && (
            <>
              <section className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  ['Pages A', report.pageCountA],
                  ['Pages B', report.pageCountB],
                  ['Changed', report.changedPages],
                  ['Text', report.textChangedPages],
                  ['Visual', report.visuallyChangedPages],
                ].map(([label, value]) => (
                  <div key={label} className="card p-3">
                    <div className="text-xl font-bold tabular-nums">{value}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
                  </div>
                ))}
              </section>

              <section className="card space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Changed pages</h3>
                  <div className="flex items-center gap-1 text-xs">
                    <button type="button" className="btn-ghost px-2 py-1" onClick={() => setActive((v) => Math.max(0, v - 1))} disabled={active === 0}>
                      <ChevronLeft size={14} />
                    </button>
                    <span className="tabular-nums min-w-[4rem] text-center">{active + 1} / {report.pages.length}</span>
                    <button type="button" className="btn-ghost px-2 py-1" onClick={() => setActive((v) => Math.min(report.pages.length - 1, v + 1))} disabled={active >= report.pages.length - 1}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {report.pages.map((page, idx) => (
                    <button
                      key={page.pageNumber}
                      type="button"
                      onClick={() => setActive(idx)}
                      className={cn(
                        'px-2.5 py-1 rounded-md border text-xs tabular-nums',
                        idx === active
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : page.status === 'same'
                            ? 'border-slate-200 dark:border-white/10 text-slate-500'
                            : 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
                      )}
                    >
                      {page.pageNumber}
                    </button>
                  ))}
                </div>
                {changedPages.length === 0 && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">No changed pages were detected.</p>
                )}
              </section>

              {activePage && (
                <section className="space-y-3">
                  <div className="card p-3 text-xs flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Page {activePage.pageNumber}: {activePage.status}</span>
                    <span><FileText size={13} className="inline mr-1" />Text diffs: {activePage.textDiffs}</span>
                    <span>
                      <ImageIcon size={13} className="inline mr-1" />
                      Visual diff: {activePage.visualDiffPct === null ? 'n/a' : `${activePage.visualDiffPct.toFixed(2)}%`}
                    </span>
                  </div>
                  <div className="grid xl:grid-cols-3 gap-3">
                    {[
                      ['PDF A', activePage.preview.a],
                      ['PDF B', activePage.preview.b],
                      ['Visual diff', activePage.preview.diff],
                    ].map(([label, src]) => (
                      <div key={label} className="card p-2">
                        <h4 className="text-xs font-semibold mb-2">{label}</h4>
                        <div className="bg-slate-100 dark:bg-slate-950/40 rounded-lg overflow-auto thin-scroll max-h-[70vh] grid place-items-start p-2">
                          {src ? (
                            <img src={src} alt={`${label} page ${activePage.pageNumber}`} className="max-w-none bg-white shadow-soft" />
                          ) : (
                            <div className="text-xs text-slate-500 p-6">Missing page</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      }
      options={
        <section className="card space-y-3 text-sm">
          <h3 className="font-semibold">Comparison scope</h3>
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-2">
              <FileText size={14} className="shrink-0 mt-0.5 text-brand-500" />
              <p>Text comparison uses extracted PDF text, so scanned pages without OCR may show no text changes.</p>
            </div>
            <div className="flex items-start gap-2">
              <ImageIcon size={14} className="shrink-0 mt-0.5 text-brand-500" />
              <p>Visual comparison renders each page and highlights changed pixels in red.</p>
            </div>
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p>Visual diffing is raster based, so tiny antialiasing changes can count as differences.</p>
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
          actionLabel="Compare PDFs"
          actionDisabled={!fileA || !fileB}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
