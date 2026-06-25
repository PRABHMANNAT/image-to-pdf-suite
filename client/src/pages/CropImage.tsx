import { useRef, useState } from 'react';
import { FileDropzone } from '../components/FileDropzone';
import { ToolLayout } from '../components/ToolLayout';
import { postAndDownload } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { Download } from 'lucide-react';

const ASPECTS: Record<string, number | null> = {
  Free: null,
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  A4: 210 / 297,
  Passport: 35 / 45,
};

interface Region { left: number; top: number; width: number; height: number; }

export default function CropImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [imgUrl, setImgUrl] = useState<string>('');
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [region, setRegion] = useState<Region>({ left: 0, top: 0, width: 100, height: 100 });
  const [aspect, setAspect] = useState<string>('Free');
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState(100);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const toast = useToast();

  function onFiles(list: File[]) {
    setFiles(list);
    if (list[0]) {
      const url = URL.createObjectURL(list[0]);
      setImgUrl(url);
    }
  }

  function onImgLoad() {
    const el = imgRef.current!;
    setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    setRegion({
      left: Math.round(el.naturalWidth * 0.1),
      top: Math.round(el.naturalHeight * 0.1),
      width: Math.round(el.naturalWidth * 0.8),
      height: Math.round(el.naturalHeight * 0.8),
    });
  }

  function applyAspect(name: string) {
    setAspect(name);
    const ratio = ASPECTS[name];
    if (ratio == null) return;
    setRegion((r) => {
      const newH = Math.round(r.width / ratio);
      return { ...r, height: Math.min(newH, natural.h - r.top) };
    });
  }

  async function exportCrop() {
    if (!files.length) return toast('Select an image', 'error');
    const form = new FormData();
    if (files.length === 1) {
      form.append('file', files[0]);
    } else {
      files.forEach((f) => form.append('files', f, f.name));
    }
    form.append('left', String(region.left));
    form.append('top', String(region.top));
    form.append('width', String(region.width));
    form.append('height', String(region.height));
    form.append('format', format);
    form.append('quality', String(quality));
    const url = files.length === 1 ? '/api/images/crop' : '/api/images/batch-crop';
    const filename = files.length === 1 ? `cropped.${format === 'jpeg' ? 'jpg' : format}` : 'cropped.zip';
    setBusy(true);
    try {
      await postAndDownload(url, form, filename);
      toast('Cropped image downloaded', 'success');
    } catch (e: any) {
      toast(e.message || 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolLayout title="Crop Image" description="Crop one or many images with selectable aspect ratios.">
      {!files.length && <FileDropzone onFiles={onFiles} accept={{ 'image/*': [] }} label="Drop an image" />}

      {imgUrl && (
        <div className="mt-6 grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="relative inline-block bg-slate-200 dark:bg-slate-800 rounded">
              <img ref={imgRef} src={imgUrl} onLoad={onImgLoad} className="max-w-full max-h-[60vh]" alt="" />
            </div>
            {natural.w > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                Image: {natural.w}×{natural.h}px. Adjust crop region with the inputs on the right.
              </p>
            )}
          </div>
          <div className="card space-y-3 h-fit">
            <div>
              <label className="label">Aspect</label>
              <select className="input w-full" value={aspect} onChange={(e) => applyAspect(e.target.value)}>
                {Object.keys(ASPECTS).map((k) => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['left', 'top', 'width', 'height'] as const).map((k) => (
                <div key={k}>
                  <label className="label capitalize">{k}</label>
                  <input
                    type="number"
                    className="input w-full"
                    value={region[k]}
                    onChange={(e) => setRegion({ ...region, [k]: Math.max(0, +e.target.value) })}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="label">Format</label>
              <select className="input w-full" value={format} onChange={(e) => setFormat(e.target.value as any)}>
                <option value="png">PNG (lossless)</option>
                <option value="jpeg">JPEG quality 100</option>
                <option value="webp">WEBP quality 100</option>
              </select>
            </div>
            {format !== 'png' && (
              <div>
                <label className="label">Quality</label>
                <input type="number" min={1} max={100} className="input w-full" value={quality} onChange={(e) => setQuality(+e.target.value)} />
              </div>
            )}
            <button className="btn-primary w-full" onClick={exportCrop} disabled={busy}>
              <Download size={16} /> {files.length > 1 ? `Batch crop ${files.length}` : 'Download cropped'}
            </button>
            <button className="btn-ghost w-full" onClick={() => { setFiles([]); setImgUrl(''); }}>Clear</button>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
