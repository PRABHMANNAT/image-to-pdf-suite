import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, FileText, Code2 } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { renderHtmlToPdf } from '../lib/htmlToPdf';
import { PAGE_SIZES_MM, PageSizeId } from '../lib/constants';
import { applyNamePattern, readAsText } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type Source = 'paste' | 'upload';

const SAMPLE_HTML = `<h1>Untitled document</h1>
<p>Paste your HTML, drop a .html file, or start writing here. Styles inside
<code>&lt;style&gt;</code> tags work.</p>
<ul><li>Page size, orientation and margins below</li><li>Cross-origin images need CORS</li><li>Scripts are blocked for safety</li></ul>`;

export default function HtmlToPdf() {
  const tool = findTool('html-to-pdf')!;
  const { settings } = useSettings();
  const [source, setSource] = useState<Source>('paste');
  const [html, setHtml] = useState<string>(SAMPLE_HTML);
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeId>('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [marginMm, setMarginMm] = useState<number>(15);
  const [customWidth, setCustomWidth] = useState<number>(210);
  const [customHeight, setCustomHeight] = useState<number>(297);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // When the user uploads a .html file, read it into the textarea so the
  // visual preview / generation always reads from the same source of truth.
  useEffect(() => {
    if (source !== 'upload') return;
    const f = files[0];
    if (!f) return;
    let cancelled = false;
    void readAsText(f.file).then((text) => {
      if (!cancelled) setHtml(text);
    });
    return () => {
      cancelled = true;
    };
  }, [files, source]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function run(): Promise<void> {
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Preparing…');
    setError(undefined);
    setResult(null);
    try {
      const blob = await renderHtmlToPdf(
        html,
        {
          pageSize,
          orientation,
          marginMm,
          customWidthMm: customWidth,
          customHeightMm: customHeight,
        },
        (info) => {
          setProgress(info.pct);
          if (info.message) setMessage(info.message);
        },
        abortRef.current.signal,
      );
      const baseName = files[0]?.file.name.replace(/\.[^.]+$/, '') || 'document';
      const name = applyNamePattern(settings.outputNamePattern, {
        name: baseName,
        tool: 'html-to-pdf',
        ext: '.pdf',
      });
      setResult({ kind: 'single', blob, suggestedName: name });
      setMessage('Done.');
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
  }

  const previewBlob = result?.kind === 'single' ? result.blob : null;

  // Visual preview of the raw HTML inside a sandboxed iframe so users see
  // what html2canvas will see before they hit Run.
  const previewSrcDoc = useMemo(() => {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; padding: 16px; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; line-height: 1.5; word-wrap: break-word; background: #ffffff; }
      img, table { max-width: 100%; }
    </style></head><body>${html}</body></html>`;
  }, [html]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Globe}
      runtime={tool.runtime}
      status="beta"
      layout="split"
      upload={
        <div className="space-y-3">
          <div className="flex gap-2">
            {(
              [
                { id: 'paste' as Source, label: 'Paste HTML', icon: Code2 },
                { id: 'upload' as Source, label: 'Upload .html', icon: FileText },
              ]
            ).map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s.id)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition border',
                    source === s.id
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  <Icon size={14} /> {s.label}
                </button>
              );
            })}
          </div>
          {source === 'upload' && (
            <FileDropzone
              files={files}
              onChange={setFiles}
              accept={{ 'text/html': ['.html', '.htm'] }}
              multiple={false}
              hideZoneWhenFilled={files.length > 0}
              label="Drop an HTML file"
              helperText="The file is read into the editor below — you can still tweak it before exporting."
            />
          )}
          <textarea
            spellCheck={false}
            className="input w-full font-mono text-xs min-h-[200px]"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="<h1>Hello</h1>"
          />
        </div>
      }
      preview={
        <div className="space-y-4">
          <section className="card">
            <h3 className="text-sm font-semibold mb-2">Live HTML preview</h3>
            <iframe
              title="HTML preview"
              sandbox="allow-same-origin"
              srcDoc={previewSrcDoc}
              className="w-full h-[60vh] rounded-xl border border-slate-200/80 dark:border-white/10 bg-white"
            />
          </section>
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Generated PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Page</h3>
            <label className="block mt-2">
              <span className="label">Size</span>
              <select
                className="input w-full"
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as PageSizeId)}
              >
                {(Object.keys(PAGE_SIZES_MM) as (keyof typeof PAGE_SIZES_MM)[]).map((id) => (
                  <option key={id} value={id}>
                    {id.toUpperCase()}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </label>
            {pageSize === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="block">
                  <span className="label">Width (mm)</span>
                  <input
                    type="number"
                    className="input w-full"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Number(e.target.value) || 210)}
                  />
                </label>
                <label className="block">
                  <span className="label">Height (mm)</span>
                  <input
                    type="number"
                    className="input w-full"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Number(e.target.value) || 297)}
                  />
                </label>
              </div>
            )}
            <label className="block mt-3">
              <span className="label">Orientation</span>
              <div className="flex gap-1.5">
                {(['portrait', 'landscape'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOrientation(o)}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition capitalize',
                      orientation === o
                        ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                        : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </label>
            <label className="block mt-3">
              <span className="label">Margin ({marginMm} mm)</span>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={marginMm}
                onChange={(e) => setMarginMm(Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            </label>
          </div>
          <div className="border-t border-slate-200 dark:border-white/10 pt-3 text-[11px] text-slate-500 dark:text-slate-400">
            <p>
              Scripts in your HTML are blocked for safety. Cross-origin images
              need CORS headers to render. For pixel-perfect Chromium-grade
              output, the optional Puppeteer backend route lands in a later
              phase.
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
          actionLabel="Export to PDF"
          actionDisabled={!html.trim()}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
