import { useState } from 'react';
import { FileDropzone } from '../components/FileDropzone';
import { ToolLayout } from '../components/ToolLayout';
import { postAndDownload } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { Download } from 'lucide-react';

type Op = 'extract' | 'remove-pages' | 'reorder' | 'rotate-pages';

export default function PdfPageEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [op, setOp] = useState<Op>('extract');
  const [range, setRange] = useState('1-3');
  const [order, setOrder] = useState('1,2,3');
  const [angle, setAngle] = useState(90);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function run() {
    if (!file) return toast('Pick a PDF', 'error');
    const form = new FormData();
    form.append('file', file, file.name);
    if (op === 'reorder') form.append('order', order);
    else form.append('range', range);
    if (op === 'rotate-pages') form.append('angle', String(angle));
    setBusy(true);
    try {
      await postAndDownload(`/api/pdf/${op}`, form, 'edited.pdf');
      toast('Downloaded', 'success');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <ToolLayout title="PDF Page Editor" description="Extract, remove, reorder, or rotate pages.">
      {!file && <FileDropzone onFiles={(l) => setFile(l[0])} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} label="Drop a PDF" />}
      {file && (
        <div className="mt-6 card space-y-4 max-w-xl">
          <div className="text-sm">{file.name}</div>
          <div>
            <label className="label">Operation</label>
            <select className="input w-full" value={op} onChange={(e) => setOp(e.target.value as Op)}>
              <option value="extract">Extract pages</option>
              <option value="remove-pages">Remove pages</option>
              <option value="reorder">Reorder pages</option>
              <option value="rotate-pages">Rotate pages</option>
            </select>
          </div>
          {op === 'reorder' ? (
            <div>
              <label className="label">New order (comma separated 1-based)</label>
              <input className="input w-full" value={order} onChange={(e) => setOrder(e.target.value)} />
            </div>
          ) : (
            <div>
              <label className="label">Page range</label>
              <input className="input w-full" value={range} onChange={(e) => setRange(e.target.value)} />
              <p className="text-xs text-slate-500 mt-1">Examples: 1-5, 1,3,7, 2-4,8,10-12. Leave for rotate to apply to all pages.</p>
            </div>
          )}
          {op === 'rotate-pages' && (
            <div>
              <label className="label">Angle (degrees)</label>
              <select className="input w-full" value={angle} onChange={(e) => setAngle(+e.target.value)}>
                <option value={90}>90 cw</option>
                <option value={180}>180</option>
                <option value={270}>270 cw (90 ccw)</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={run}><Download size={16} /> Apply & download</button>
            <button className="btn-ghost" onClick={() => setFile(null)}>Change file</button>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
