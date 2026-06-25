import { useState } from 'react';
import { FileDropzone } from '../components/FileDropzone';
import { FileList } from '../components/FileList';
import { ToolLayout } from '../components/ToolLayout';
import { SelectedFile } from '../types';
import { postAndDownload } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { Download, Trash2 } from 'lucide-react';

export default function MergePdf() {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function addFiles(list: File[]) {
    setFiles((p) => [
      ...p,
      ...list.map((f) => ({ id: Math.random().toString(36).slice(2), file: f, url: '' })),
    ]);
  }
  function remove(id: string) { setFiles((p) => p.filter((f) => f.id !== id)); }
  function move(id: string, dir: -1 | 1) {
    setFiles((p) => {
      const i = p.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  async function merge() {
    if (files.length < 2) return toast('Select at least 2 PDFs', 'error');
    const form = new FormData();
    files.forEach((f) => form.append('files', f.file, f.file.name));
    setBusy(true);
    try {
      await postAndDownload('/api/pdf/merge', form, 'merged.pdf');
      toast('Merged PDF downloaded', 'success');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <ToolLayout title="Merge PDF" description="Combine multiple PDFs into one. Original quality preserved.">
      <FileDropzone onFiles={addFiles} accept={{ 'application/pdf': ['.pdf'] }} label="Drop PDF files" />
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">{files.length} PDFs</span>
            <button className="btn-ghost text-red-600" onClick={() => setFiles([])}><Trash2 size={14} /> Clear</button>
          </div>
          <FileList files={files} onRemove={remove} onMove={move} showThumbs={false} />
          <button className="btn-primary" disabled={busy} onClick={merge}><Download size={16} /> Merge & download</button>
        </div>
      )}
    </ToolLayout>
  );
}
