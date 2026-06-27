import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  ImageIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  loadPdfJs,
  renderPdfPage,
  type PDFDocumentProxy,
} from '../../lib/pdfUtils';
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from '../../lib/constants';
import { useSettings } from '../../lib/settings';
import { Tooltip } from '../ui/Tooltip';
import { EmptyState } from './EmptyState';
import { PreviewSkeleton } from './LoadingSkeleton';

type Source = File | Blob | string;

interface Props {
  source: Source | null;
  /** Forces preview type when File.type doesn't carry it (e.g. fetched blobs). */
  type?: 'image' | 'pdf' | 'auto';
  /** Initial 1-based page number for PDFs. */
  initialPage?: number;
  /** Optional password for encrypted PDFs. */
  password?: string;
  className?: string;
}

function detectType(source: Source, hint?: Props['type']): 'image' | 'pdf' {
  if (hint && hint !== 'auto') return hint;
  if (source instanceof File) {
    if (source.type === 'application/pdf') return 'pdf';
    if (source.type.startsWith('image/')) return 'image';
    if (source.name.toLowerCase().endsWith('.pdf')) return 'pdf';
    return 'image';
  }
  if (typeof source === 'string') {
    return source.toLowerCase().includes('.pdf') ? 'pdf' : 'image';
  }
  // Bare Blob — fall back to image; tools can be explicit via the prop.
  return 'image';
}

export function PreviewViewer({ source, type = 'auto', initialPage = 1, password, className }: Props) {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [zoom, setZoom] = useState<number>(settings.previewZoom);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [page, setPage] = useState<number>(initialPage);
  const [pageCount, setPageCount] = useState<number>(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const detected = useMemo(() => (source ? detectType(source, type) : null), [source, type]);
  const imageUrl = useMemo(() => {
    if (!source || detected !== 'image') return null;
    if (typeof source === 'string') return source;
    return URL.createObjectURL(source);
  }, [source, detected]);

  useEffect(() => {
    return () => {
      if (imageUrl && typeof source !== 'string') URL.revokeObjectURL(imageUrl);
    };
    // imageUrl tracks `source` already; revoking on unmount is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Load PDF document whenever the source changes.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!source || detected !== 'pdf') {
      if (docRef.current) {
        void docRef.current.destroy();
        docRef.current = null;
      }
      setPageCount(0);
      return;
    }
    setBusy(true);
    (async () => {
      try {
        const data: Blob | ArrayBuffer =
          typeof source === 'string' ? await (await fetch(source)).arrayBuffer() : source;
        const doc = await loadPdfJs(data, password);
        if (cancelled) {
          await doc.destroy();
          return;
        }
        if (docRef.current) await docRef.current.destroy();
        docRef.current = doc;
        setPageCount(doc.numPages);
        setPage(Math.min(Math.max(1, initialPage), doc.numPages));
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load PDF');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, detected, password, initialPage]);

  // Render the active page when state changes.
  useEffect(() => {
    if (detected !== 'pdf' || !docRef.current || !canvasRef.current) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        await renderPdfPage(docRef.current!, page, canvasRef.current!, { scale: zoom * 1.5, rotation });
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to render page');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detected, page, zoom, rotation]);

  const enterFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try {
        await el.requestFullscreen();
        setFullscreen(true);
      } catch {
        /* user cancelled */
      }
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const canPrev = detected === 'pdf' && page > 1;
  const canNext = detected === 'pdf' && page < pageCount;

  function zoomIn() {
    setZoom((z) => Math.min(PREVIEW_ZOOM_MAX, +(z + PREVIEW_ZOOM_STEP).toFixed(2)));
  }
  function zoomOut() {
    setZoom((z) => Math.max(PREVIEW_ZOOM_MIN, +(z - PREVIEW_ZOOM_STEP).toFixed(2)));
  }
  function rotate() {
    setRotation((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270));
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'card p-0 overflow-hidden flex flex-col',
        fullscreen && 'bg-black/90',
        className,
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/5">
        <Tooltip label="Previous page" side="bottom">
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!canPrev}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
        </Tooltip>
        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300 min-w-[3rem] text-center">
          {detected === 'pdf' && pageCount > 0 ? `${page} / ${pageCount}` : '—'}
        </span>
        <Tooltip label="Next page" side="bottom">
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={!canNext}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </Tooltip>
        <div className="w-px h-5 bg-slate-200/80 dark:bg-white/10 mx-1" />
        <Tooltip label="Zoom out" side="bottom">
          <button type="button" className="btn-ghost px-2 py-1" onClick={zoomOut} aria-label="Zoom out">
            <ZoomOut size={14} />
          </button>
        </Tooltip>
        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300 min-w-[3rem] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip label="Zoom in" side="bottom">
          <button type="button" className="btn-ghost px-2 py-1" onClick={zoomIn} aria-label="Zoom in">
            <ZoomIn size={14} />
          </button>
        </Tooltip>
        <div className="w-px h-5 bg-slate-200/80 dark:bg-white/10 mx-1" />
        <Tooltip label="Rotate preview" side="bottom">
          <button type="button" className="btn-ghost px-2 py-1" onClick={rotate} aria-label="Rotate">
            <RotateCw size={14} />
          </button>
        </Tooltip>
        <div className="ml-auto" />
        <Tooltip label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} side="bottom">
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={enterFullscreen}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </Tooltip>
      </div>

      <div className="relative flex-1 overflow-auto thin-scroll p-4 grid place-items-center bg-slate-50 dark:bg-slate-950/40">
        {!source && (
          <EmptyState
            icon={ImageIcon}
            title="No preview yet"
            description="Drop a file or run the tool to see the preview here."
            className="w-full max-w-md"
          />
        )}
        {source && detected === 'image' && imageUrl && (
          <img
            src={imageUrl}
            alt="preview"
            className="max-w-full select-none"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center',
              transition: 'transform 120ms ease-out',
            }}
            draggable={false}
          />
        )}
        {source && detected === 'pdf' && (
          <canvas
            ref={canvasRef}
            className="bg-white shadow-soft dark:shadow-soft-dark"
            aria-label={`PDF page ${page} of ${pageCount}`}
          />
        )}
        {error && (
          <div className="absolute bottom-3 left-3 right-3 text-xs rounded-md bg-red-600/90 text-white px-3 py-2 shadow">
            {error}
          </div>
        )}
        {busy && (
          <div className="absolute inset-4 grid place-items-center rounded-xl bg-white/70 backdrop-blur-sm dark:bg-slate-950/60">
            <PreviewSkeleton className="w-full max-w-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
