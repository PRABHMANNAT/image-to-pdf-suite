import { useEffect, useMemo, useRef, useState } from 'react';
import { Droplet, Type, ImagePlus } from 'lucide-react';
import { StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { loadPdfLib, renderPdfFirstPageDataUrl, savePdfLib } from '../lib/pdfUtils';
import { parsePageRange } from '../lib/pageRange';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type Mode = 'text' | 'image';
type Anchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
type Pattern = 'single' | 'tile';

const ANCHOR_LIST: Anchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function anchorPosition(anchor: Anchor, pageW: number, pageH: number, w: number, h: number, margin: number): { x: number; y: number } {
  const left = margin;
  const center = (pageW - w) / 2;
  const right = pageW - margin - w;
  const top = pageH - margin - h;
  const middle = (pageH - h) / 2;
  const bottom = margin;
  switch (anchor) {
    case 'tl': return { x: left, y: top };
    case 'tc': return { x: center, y: top };
    case 'tr': return { x: right, y: top };
    case 'ml': return { x: left, y: middle };
    case 'mc': return { x: center, y: middle };
    case 'mr': return { x: right, y: middle };
    case 'bl': return { x: left, y: bottom };
    case 'bc': return { x: center, y: bottom };
    case 'br': return { x: right, y: bottom };
  }
}

export default function AddWatermark() {
  const tool = findTool('watermark')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [firstPageUrl, setFirstPageUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(72);
  const [color, setColor] = useState('#94a3b8');
  const [imageFiles, setImageFiles] = useState<AcceptedFile[]>([]);
  const [imageScale, setImageScale] = useState(0.4);

  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(-30);
  const [anchor, setAnchor] = useState<Anchor>('mc');
  const [pattern, setPattern] = useState<Pattern>('single');
  const [tileCols, setTileCols] = useState(3);
  const [tileRows, setTileRows] = useState(4);
  const [pageRange, setPageRange] = useState('');

  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) {
      setFirstPageUrl(null);
      setPageCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = await renderPdfFirstPageDataUrl(file.file, 700);
        if (cancelled) return;
        setFirstPageUrl(url);
        const src = await loadPdfLib(file.file);
        setPageCount(src.getPageCount());
      } catch {
        /* surface only on Apply */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file?.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Applying watermark…');
    setError(undefined);
    setResult(null);

    try {
      const src = await loadPdfLib(file.file);
      const total = src.getPageCount();
      const targetIndices = pageRange.trim()
        ? parsePageRange(pageRange, total)
        : Array.from({ length: total }, (_, i) => i);
      const indexSet = new Set(targetIndices);

      // Pre-embed text font / image once (massive win for big PDFs).
      const font = mode === 'text' ? await src.embedFont(StandardFonts.HelveticaBold) : null;
      const c = hexToRgb01(color);

      let embeddedImage: { img: import('pdf-lib').PDFImage; w: number; h: number } | null = null;
      if (mode === 'image') {
        const imgFile = imageFiles[0]?.file;
        if (!imgFile) throw new Error('Pick an image to use as the watermark.');
        const bytes = new Uint8Array(await imgFile.arrayBuffer());
        const isPng = imgFile.type === 'image/png';
        const img = isPng ? await src.embedPng(bytes) : await src.embedJpg(bytes);
        embeddedImage = { img, w: img.width, h: img.height };
      }

      const pages = src.getPages();
      for (let i = 0; i < pages.length; i++) {
        if (abortRef.current.signal.aborted) throw new Error('Cancelled');
        if (!indexSet.has(i)) continue;
        const page = pages[i];
        const { width: pw, height: ph } = page.getSize();
        const marginPt = Math.min(pw, ph) * 0.04;

        const drawOne = (cx: number, cy: number) => {
          if (mode === 'text' && font) {
            const w = font.widthOfTextAtSize(text, fontSize);
            const h = fontSize;
            page.drawText(text, {
              x: cx - w / 2,
              y: cy - h / 2,
              size: fontSize,
              font,
              color: rgb(c.r, c.g, c.b),
              opacity,
              rotate: degrees(rotation),
            });
          } else if (mode === 'image' && embeddedImage) {
            const scale = imageScale;
            // Fit within ~80% of the page when at scale=1.
            const maxEdge = Math.min(pw, ph) * 0.8;
            const ratio = Math.min(maxEdge / embeddedImage.w, maxEdge / embeddedImage.h);
            const w = embeddedImage.w * ratio * scale;
            const h = embeddedImage.h * ratio * scale;
            page.drawImage(embeddedImage.img, {
              x: cx - w / 2,
              y: cy - h / 2,
              width: w,
              height: h,
              opacity,
              rotate: degrees(rotation),
            });
          }
        };

        if (pattern === 'single') {
          // Anchor positions place top-left of the bounding box; we want the centre.
          let bboxW = 0;
          let bboxH = 0;
          if (mode === 'text' && font) {
            bboxW = font.widthOfTextAtSize(text, fontSize);
            bboxH = fontSize;
          } else if (mode === 'image' && embeddedImage) {
            const maxEdge = Math.min(pw, ph) * 0.8;
            const ratio = Math.min(maxEdge / embeddedImage.w, maxEdge / embeddedImage.h);
            bboxW = embeddedImage.w * ratio * imageScale;
            bboxH = embeddedImage.h * ratio * imageScale;
          }
          const a = anchorPosition(anchor, pw, ph, bboxW, bboxH, marginPt);
          drawOne(a.x + bboxW / 2, a.y + bboxH / 2);
        } else {
          // Tile: evenly spaced grid of centres.
          const cols = Math.max(1, tileCols);
          const rows = Math.max(1, tileRows);
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const cx = ((c + 0.5) / cols) * pw;
              const cy = ((r + 0.5) / rows) * ph;
              drawOne(cx, cy);
            }
          }
        }
        setProgress(Math.round(((i + 1) / pages.length) * 100));
      }

      const blob = await savePdfLib(src);
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'watermarked',
          ext: '.pdf',
        }),
      });
      setMessage(`Watermarked ${indexSet.size} of ${total} pages.`);
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
  const tileCells = useMemo(() => {
    if (pattern !== 'tile') return null;
    const cells: { left: string; top: string }[] = [];
    for (let r = 0; r < tileRows; r++) {
      for (let c = 0; c < tileCols; c++) {
        cells.push({ left: `${((c + 0.5) / tileCols) * 100}%`, top: `${((r + 0.5) / tileRows) * 100}%` });
      }
    }
    return cells;
  }, [pattern, tileCols, tileRows]);

  const anchorPctTop: Record<Anchor, string> = {
    tl: '0%', tc: '0%', tr: '0%',
    ml: '50%', mc: '50%', mr: '50%',
    bl: '100%', bc: '100%', br: '100%',
  };
  const anchorPctLeft: Record<Anchor, string> = {
    tl: '0%', tc: '50%', tr: '100%',
    ml: '0%', mc: '50%', mr: '100%',
    bl: '0%', bc: '50%', br: '100%',
  };

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Droplet}
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
          helperText="Adds a real text or image watermark to every page — no rasterisation."
        />
      }
      preview={
        <div className="space-y-4">
          {firstPageUrl && (
            <section className="card">
              <h3 className="text-sm font-semibold mb-2">
                Live preview {pageCount ? `· ${pageCount} pages` : ''}
              </h3>
              <div className="relative inline-block bg-white shadow-soft dark:shadow-soft-dark rounded-lg overflow-hidden">
                <img src={firstPageUrl} alt="page 1" className="max-w-full block" />
                <div className="absolute inset-0 pointer-events-none">
                  {pattern === 'single' ? (
                    <div
                      style={{
                        position: 'absolute',
                        left: anchorPctLeft[anchor],
                        top: anchorPctTop[anchor],
                        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                        opacity,
                      }}
                    >
                      {mode === 'text' ? (
                        <span style={{ fontSize: fontSize * 0.4, color, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>
                      ) : imageFiles[0]?.url ? (
                        <img src={imageFiles[0].url} alt="" style={{ maxWidth: 200 * imageScale, maxHeight: 200 * imageScale }} />
                      ) : null}
                    </div>
                  ) : (
                    tileCells?.map((cell, i) => (
                      <div
                        key={i}
                        style={{
                          position: 'absolute',
                          left: cell.left,
                          top: cell.top,
                          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                          opacity,
                        }}
                      >
                        {mode === 'text' ? (
                          <span style={{ fontSize: fontSize * 0.4, color, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>
                        ) : imageFiles[0]?.url ? (
                          <img src={imageFiles[0].url} alt="" style={{ maxWidth: 100 * imageScale, maxHeight: 100 * imageScale }} />
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Watermarked PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div className="flex gap-1.5">
            {([
              { id: 'text' as Mode, label: 'Text', icon: Type },
              { id: 'image' as Mode, label: 'Image', icon: ImagePlus },
            ]).map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition',
                    mode === m.id
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  <Icon size={14} /> {m.label}
                </button>
              );
            })}
          </div>

          {mode === 'text' ? (
            <div className="space-y-2">
              <label className="block">
                <span className="label">Text</span>
                <input className="input w-full" value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label">Font size ({fontSize})</span>
                  <input type="range" min={12} max={200} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-brand-600" />
                </label>
                <label className="block">
                  <span className="label">Colour</span>
                  <input type="color" className="h-9 w-full rounded cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <FileDropzone
                files={imageFiles}
                onChange={setImageFiles}
                accept={{ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }}
                multiple={false}
                hideZoneWhenFilled={imageFiles.length > 0}
                label="Drop a PNG or JPG"
                helperText="PNGs with transparency keep their alpha."
              />
              <label className="block">
                <span className="label">Image scale ({Math.round(imageScale * 100)}%)</span>
                <input type="range" min={0.1} max={1} step={0.05} value={imageScale} onChange={(e) => setImageScale(Number(e.target.value))} className="w-full accent-brand-600" />
              </label>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-white/10 pt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">Opacity ({Math.round(opacity * 100)}%)</span>
              <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-brand-600" />
            </label>
            <label className="block">
              <span className="label">Rotation ({rotation}°)</span>
              <input type="range" min={-180} max={180} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="w-full accent-brand-600" />
            </label>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3">
            <h3 className="text-sm font-semibold mb-2">Pattern</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {(['single', 'tile'] as Pattern[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPattern(p)}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-xs font-medium border transition capitalize',
                    pattern === p
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            {pattern === 'single' ? (
              <div className="mt-2">
                <span className="label">Anchor</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {ANCHOR_LIST.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAnchor(a)}
                      className={cn(
                        'aspect-square rounded-md text-[10px] font-medium border transition',
                        anchor === a
                          ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                          : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                      )}
                    >
                      {a.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label">Cols ({tileCols})</span>
                  <input type="range" min={1} max={8} value={tileCols} onChange={(e) => setTileCols(Number(e.target.value))} className="w-full accent-brand-600" />
                </label>
                <label className="block">
                  <span className="label">Rows ({tileRows})</span>
                  <input type="range" min={1} max={10} value={tileRows} onChange={(e) => setTileRows(Number(e.target.value))} className="w-full accent-brand-600" />
                </label>
              </div>
            )}
          </div>

          <label className="block border-t border-slate-200 dark:border-white/10 pt-3">
            <span className="label">Page range</span>
            <input
              className="input w-full"
              placeholder={pageCount ? `e.g. 1-${pageCount} (blank = all)` : '1-3,5,7-9'}
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
            />
          </label>
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
          actionLabel="Add watermark"
          actionDisabled={!file || (mode === 'image' && imageFiles.length === 0)}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
