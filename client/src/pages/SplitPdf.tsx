import { useState } from 'react';
import { FileDropzone } from '../components/FileDropzone';
import { ToolLayout } from '../components/ToolLayout';
import { postAndDownload } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { Download } from 'lucide-react';

export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<'each' | 'range' | 'chunks'>('range');
  const [range, setRange] = useState('1-3');
  const [chunk, setChunk] = useState(2);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function split() {
    if (!file) return toast('Pick a PDF', 'error');
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('kind', kind);
    if (kind === 'range') form.append('range', range);
    if (kind === 'chunks') form.append('size', String(chunk));
    setBusy(true);
    try {
      await postAndDownload('/api/pdf/split', form, kind === 'range' ? 'split.pdf' : 'split.zip');
      toast('Split downloaded', 'success');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <ToolLayout title="Split PDF" description="Split each page, a range, or fixed chunks. Original PDF quality preserved.">
      {!file && <FileDropzone onFiles={(l) => setFile(l[0])} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} label="Drop a PDF" />}
      {file && (
        <div className="mt-6 card space-y-4 max-w-xl">
          <div className="text-sm">{file.name}</div>
          <div>
            <label className="label">Mode</label>
            <select className="input w-full" value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="each">Split every page</option>
              <option value="range">Extract range (e.g. 1-3,5,8-10)</option>
              <option value="chunks">Chunks of N pages</option>
            </select>
          </div>
          {kind === 'range' && (
            <div>
              <label className="label">Pages</label>
              <input className="input w-full" value={range} onChange={(e) => setRange(e.target.value)} />
            </div>
          )}
          {kind === 'chunks' && (
            <div>
              <label className="label">Pages per chunk</label>
              <input type="number" min={1} className="input w-full" value={chunk} onChange={(e) => setChunk(+e.target.value)} />
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={split}><Download size={16} /> Split</button>
            <button className="btn-ghost" onClick={() => setFile(null)}>Change file</button>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
