import { useMemo, useState } from 'react';
import { FileDropzone } from '../components/FileDropzone';
import { FileList } from '../components/FileList';
import { ProgressBar } from '../components/ProgressBar';
import { ToolLayout } from '../components/ToolLayout';
import { SelectedFile, PageLayout, FitMode } from '../types';
import { postAndDownload } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { Download, Trash2 } from 'lucide-react';

const ACCEPT = {
  'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.gif'],
};

export default function ImageToPdf() {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [layout, setLayout] = useState<PageLayout>('image');
  const [fit, setFit] = useState<FitMode>('fit');
  const [marginMm, setMarginMm] = useState(0);
  const [bg, setBg] = useState('#ffffff');
  const [customW, setCustomW] = useState(210);
  const [customH, setCustomH] = useState(297);
  const [quality, setQuality] = useState(100);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const totalSize = useMemo(() => files.reduce((n, f) => n + f.file.size, 0), [files]);

  function addFiles(list: File[]) {
    const next: SelectedFile[] = list.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      url: URL.createObjectURL(f),
    }));
    setFiles((prev) => [...prev, ...next]);
  }

  function removeFile(id: string) {
    setFiles((p) => p.filter((f) => f.id !== id));
  }
  function moveFile(id: string, dir: -1 | 1) {
    setFiles((p) => {
      const i = p.findIndex((f) => f.id === id);
      if (i < 0) return p;
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function sortBy(mode: 'upload' | 'az' | 'za') {
    setFiles((p) => {
      const copy = [...p];
      if (mode === 'az') copy.sort((a, b) => a.file.name.localeCompare(b.file.name));
      else if (mode === 'za') copy.sort((a, b) => b.file.name.localeCompare(a.file.name));
      return copy;
    });
  }

  async function exportPdf() {
    if (!files.length) return toast('Select at least one image', 'error');
    const form = new FormData();
    files.forEach((f) => form.append('files', f.file, f.file.name));
    form.append('layout', layout);
    form.append('fit', fit);
    form.append('marginMm', String(marginMm));
    form.append('background', bg);
    form.append('jpegQuality', String(quality));
    if (layout === 'custom') {
      form.append('customWidth', String(customW));
      form.append('customHeight', String(customH));
    }
    setBusy(true);
    setProgress(0);
    try {
      await postAndDownload('/api/images/to-pdf', form, 'images.pdf', setProgress);
      toast('PDF downloaded', 'success');
    } catch (e: any) {
      toast(e.message || 'Failed', 'error');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  // Rough estimate: sum of input sizes - actual PDF often within 2x.
  const estMb = (totalSize / (1024 * 1024)).toFixed(1);

  return (
    <ToolLayout
      title="Image to PDF"
      description="Convert any number of images into a single high-resolution PDF. Default mode preserves maximum quality."
    >
      <FileDropzone onFiles={addFiles} accept={ACCEPT} label="Drop images (JPG, PNG, WEBP, TIFF, BMP, GIF)" />

      {files.length > 0 && (
        <div className="mt-6 grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                {files.length} files • {estMb} MB total
                {Number(estMb) > 200 && (
                  <span className="ml-2 text-amber-600">Large output PDF possible.</span>
                )}
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => sortBy('az')}>A-Z</button>
                <button className="btn-ghost" onClick={() => sortBy('za')}>Z-A</button>
                <button className="btn-ghost text-red-600" onClick={() => setFiles([])}>
                  <Trash2 size={14} /> Clear all
                </button>
              </div>
            </div>
            <FileList files={files} onRemove={removeFile} onMove={moveFile} />
          </div>
          <div className="card space-y-4 h-fit">
            <div>
              <label className="label">Page layout</label>
              <select className="input w-full" value={layout} onChange={(e) => setLayout(e.target.value as PageLayout)}>
                <option value="image">Same size as image (max quality)</option>
                <option value="a4-portrait">A4 portrait</option>
                <option value="a4-landscape">A4 landscape</option>
                <option value="letter-portrait">Letter portrait</option>
                <option value="letter-landscape">Letter landscape</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {layout === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Width (mm)</label>
                  <input type="number" className="input w-full" value={customW} onChange={(e) => setCustomW(+e.target.value)} />
                </div>
                <div>
                  <label className="label">Height (mm)</label>
                  <input type="number" className="input w-full" value={customH} onChange={(e) => setCustomH(+e.target.value)} />
                </div>
              </div>
            )}
            <div>
              <label className="label">Image fit</label>
              <select className="input w-full" value={fit} onChange={(e) => setFit(e.target.value as FitMode)}>
                <option value="fit">Fit inside page</option>
                <option value="fill">Fill page (crop)</option>
                <option value="stretch">Stretch</option>
                <option value="original">Original size</option>
              </select>
            </div>
            <div>
              <label className="label">Margin (mm)</label>
              <input type="number" className="input w-full" value={marginMm} onChange={(e) => setMarginMm(+e.target.value)} />
            </div>
            <div>
              <label className="label">Background</label>
              <input type="color" className="w-full h-9" value={bg} onChange={(e) => setBg(e.target.value)} />
            </div>
            <div>
              <label className="label">JPEG quality (1-100)</label>
              <input type="number" min={1} max={100} className="input w-full" value={quality} onChange={(e) => setQuality(+e.target.value)} />
            </div>
            {busy && <ProgressBar value={progress} label={`Uploading... ${progress}%`} />}
            <button className="btn-primary w-full" onClick={exportPdf} disabled={busy}>
              <Download size={16} /> Create PDF
            </button>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
