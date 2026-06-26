import { useEffect, useMemo, useRef, useState } from 'react';
import type { Area, Point } from 'react-easy-crop';
import { Crop, RotateCw, FlipHorizontal, FlipVertical, Layers } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  ImageCropper,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { cropImageOnCanvas, imageFileToCanvas, canvasToBlob } from '../lib/imageUtils';
import { applyNamePattern, stripExtension } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';

interface AspectPreset {
  id: string;
  label: string;
  value: number | undefined;
}

const ASPECTS: AspectPreset[] = [
  { id: 'free', label: 'Free', value: undefined },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '3:4', label: '3:4', value: 3 / 4 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
  { id: 'a4p', label: 'A4 portrait', value: 210 / 297 },
  { id: 'a4l', label: 'A4 landscape', value: 297 / 210 },
  { id: 'ig-post', label: 'IG post', value: 1 },
  { id: 'ig-story', label: 'IG story', value: 9 / 16 },
];

const FORMAT_LABEL: Record<OutputFormat, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
};

const FORMAT_EXT: Record<OutputFormat, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function relCropFromPixels(area: Area, size: { width: number; height: number }) {
  return {
    x: area.x / size.width,
    y: area.y / size.height,
    w: area.width / size.width,
    h: area.height / size.height,
  };
}

async function applyOps(
  file: File,
  cropArea: Area,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  // Step 1: render the rotated/flipped image to a working canvas so the crop
  // box (always in image-pixel coords from react-easy-crop) lines up.
  const source = await imageFileToCanvas(file);
  if (!rotation && !flipH && !flipV) {
    return cropImageOnCanvas(file, { left: cropArea.x, top: cropArea.y, width: cropArea.width, height: cropArea.height }, format, quality);
  }
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const rw = source.width * cos + source.height * sin;
  const rh = source.width * sin + source.height * cos;
  const oriented = document.createElement('canvas');
  oriented.width = Math.max(1, Math.round(rw));
  oriented.height = Math.max(1, Math.round(rh));
  const ctx = oriented.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.save();
  ctx.translate(oriented.width / 2, oriented.height / 2);
  ctx.rotate(rad);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  ctx.restore();

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cropArea.width));
  out.height = Math.max(1, Math.round(cropArea.height));
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas 2D context not available');
  octx.drawImage(
    oriented,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    out.width,
    out.height,
  );
  return canvasToBlob(out, format, quality);
}

export default function CropImage() {
  const tool = findTool('crop-image')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const [format, setFormat] = useState<OutputFormat>('image/png');
  const [quality, setQuality] = useState(0.92);
  const [batch, setBatch] = useState(false);

  const [livePreview, setLivePreview] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!activeId && files.length) setActiveId(files[0].id);
    if (activeId && !files.some((f) => f.id === activeId)) setActiveId(files[0]?.id ?? null);
  }, [files, activeId]);

  const active = useMemo(() => files.find((f) => f.id === activeId) || null, [files, activeId]);
  const activeUrl = active?.url || null;

  // Refresh live preview when the crop area or transforms change.
  useEffect(() => {
    if (!active || !croppedArea) {
      if (livePreview) URL.revokeObjectURL(livePreview);
      setLivePreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const blob = await applyOps(active.file, croppedArea, rotation, flipH, flipV, format, quality);
        if (cancelled) return;
        if (livePreview) URL.revokeObjectURL(livePreview);
        setLivePreview(URL.createObjectURL(blob));
      } catch {
        /* ignore, surface only on Apply */
      }
    })();
    return () => {
      cancelled = true;
    };
    // livePreview intentionally excluded — only refresh on the inputs that drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, croppedArea, rotation, flipH, flipV, format, quality]);

  useEffect(() => {
    return () => {
      if (livePreview) URL.revokeObjectURL(livePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(): Promise<void> {
    if (!active || !croppedArea) return;
    abortRef.current = new AbortController();
    setState('processing');
    setError(undefined);
    setResult(null);
    setProgress(0);

    try {
      if (batch && files.length > 1) {
        // Convert active crop into a relative crop, then apply per-image.
        const baseCanvas = await imageFileToCanvas(active.file);
        const rel = relCropFromPixels(croppedArea, baseCanvas);
        const entries: { name: string; data: Blob }[] = [];
        for (let i = 0; i < files.length; i++) {
          if (abortRef.current.signal.aborted) throw new Error('Cancelled');
          const f = files[i];
          const c = await imageFileToCanvas(f.file);
          const area: Area = {
            x: rel.x * c.width,
            y: rel.y * c.height,
            width: rel.w * c.width,
            height: rel.h * c.height,
          };
          const blob = await applyOps(f.file, area, rotation, flipH, flipV, format, quality);
          const outName = applyNamePattern(settings.outputNamePattern, {
            name: stripExtension(f.file.name),
            tool: 'crop',
            index: i,
            total: files.length,
            ext: FORMAT_EXT[format],
          });
          entries.push({ name: outName, data: blob });
          setProgress(Math.round(((i + 1) / files.length) * 100));
        }
        setResult({
          kind: 'many',
          entries,
          suggestedZipName: applyNamePattern(settings.outputNamePattern, {
            name: 'cropped',
            tool: 'crop',
            ext: '.zip',
          }),
        });
        setState('success');
      } else {
        const blob = await applyOps(active.file, croppedArea, rotation, flipH, flipV, format, quality);
        const name = applyNamePattern(settings.outputNamePattern, {
          name: stripExtension(active.file.name),
          tool: 'crop',
          ext: FORMAT_EXT[format],
        });
        setResult({ kind: 'single', blob, suggestedName: name });
        setProgress(100);
        setState('success');
      }
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
    setState('idle');
    setResult(null);
    setError(undefined);
    setProgress(0);
  }

  const showQuality = format !== 'image/png';

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Crop}
      runtime={tool.runtime}
      status={tool.status}
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept="image"
          multiple
          maxFiles={100}
          hideZoneWhenFilled={files.length > 0}
          label="Drop an image or several to crop"
          helperText="JPG, PNG, WEBP — cropping happens entirely on your device."
        />
      }
      preview={
        <div className="space-y-4">
          {active && activeUrl ? (
            <>
              <ImageCropper
                src={activeUrl}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={setCroppedArea}
              />
              {files.length > 1 && (
                <div className="card p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Active image — click to switch
                  </div>
                  <div className="flex gap-2 overflow-x-auto thin-scroll">
                    {files.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setActiveId(f.id)}
                        className={cn(
                          'shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition',
                          f.id === activeId
                            ? 'border-brand-500 shadow-glow'
                            : 'border-transparent hover:border-brand-500/40',
                        )}
                      >
                        <img src={f.url || ''} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {livePreview && (
                <section className="card">
                  <h3 className="text-sm font-semibold mb-2">Live preview</h3>
                  <div className="bg-slate-100 dark:bg-slate-950/40 rounded-xl p-3 grid place-items-center">
                    <img src={livePreview} alt="cropped preview" className="max-h-80 object-contain rounded" />
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="card text-center text-sm text-slate-500 dark:text-slate-400 py-12">
              Drop an image above to start cropping.
            </div>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Aspect ratio</h3>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAspect(a.value)}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-[11px] font-medium border transition',
                    aspect === a.value
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Transform</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="btn-secondary"
              >
                <RotateCw size={14} /> Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => setFlipH((v) => !v)}
                className={cn('btn-secondary', flipH && 'ring-2 ring-brand-500/40')}
              >
                <FlipHorizontal size={14} /> Flip H
              </button>
              <button
                type="button"
                onClick={() => setFlipV((v) => !v)}
                className={cn('btn-secondary', flipV && 'ring-2 ring-brand-500/40')}
              >
                <FlipVertical size={14} /> Flip V
              </button>
            </div>
            <label className="block mt-3">
              <span className="label">Zoom ({Math.round(zoom * 100)}%)</span>
              <input
                type="range"
                min={1}
                max={5}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            </label>
            <label className="block mt-2">
              <span className="label">Rotation ({rotation}°)</span>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            </label>
          </div>

          {croppedArea && (
            <details className="border-t border-slate-200 dark:border-white/10 pt-4">
              <summary className="text-sm font-semibold cursor-pointer">Pixel dimensions</summary>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">X</div>
                  <div className="tabular-nums font-medium">{Math.round(croppedArea.x)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Y</div>
                  <div className="tabular-nums font-medium">{Math.round(croppedArea.y)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Width</div>
                  <div className="tabular-nums font-medium">{Math.round(croppedArea.width)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Height</div>
                  <div className="tabular-nums font-medium">{Math.round(croppedArea.height)}</div>
                </div>
              </div>
            </details>
          )}

          <div className="border-t border-slate-200 dark:border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Output</h3>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(Object.keys(FORMAT_LABEL) as OutputFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-xs font-medium border transition',
                    format === f
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
            {showQuality && (
              <label className="block mt-3">
                <span className="label">Quality ({Math.round(quality * 100)}%)</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </label>
            )}
          </div>

          {files.length > 1 && (
            <div className="border-t border-slate-200 dark:border-white/10 pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={batch}
                  onChange={(e) => setBatch(e.target.checked)}
                  className="accent-brand-600"
                />
                <Layers size={14} className="text-slate-500" />
                Apply same crop to all {files.length} images
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 ml-6">
                The active crop is interpreted as a percentage and re-applied to every image. Results are bundled as a ZIP.
              </p>
            </div>
          )}
        </section>
      }
      action={
        <ProcessingPanel
          files={files}
          state={state}
          progress={progress}
          error={error}
          onAction={run}
          actionLabel={batch && files.length > 1 ? `Crop ${files.length} images` : 'Apply crop'}
          actionDisabled={!active || !croppedArea}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
