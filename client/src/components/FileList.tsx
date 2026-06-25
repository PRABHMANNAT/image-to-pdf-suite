import { GripVertical, RotateCw, RotateCcw, Trash2 } from 'lucide-react';
import { SelectedFile } from '../types';

interface Props {
  files: SelectedFile[];
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRotate?: (id: string, dir: -1 | 1) => void;
  showThumbs?: boolean;
}

function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileList({ files, onRemove, onMove, onRotate, showThumbs = true }: Props) {
  if (!files.length) return null;
  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div
          key={f.id}
          className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-2"
        >
          <GripVertical className="text-slate-400" size={16} />
          {showThumbs && (
            <img src={f.url} alt="" className="w-12 h-12 object-cover rounded bg-slate-100 dark:bg-slate-700" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{f.file.name}</div>
            <div className="text-xs text-slate-500">
              {humanSize(f.file.size)}
              {f.width && f.height ? ` • ${f.width}×${f.height}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-2 py-1" onClick={() => onMove(f.id, -1)} disabled={i === 0}>↑</button>
            <button className="btn-ghost px-2 py-1" onClick={() => onMove(f.id, 1)} disabled={i === files.length - 1}>↓</button>
            {onRotate && (
              <>
                <button className="btn-ghost px-2 py-1" onClick={() => onRotate(f.id, -1)}><RotateCcw size={14} /></button>
                <button className="btn-ghost px-2 py-1" onClick={() => onRotate(f.id, 1)}><RotateCw size={14} /></button>
              </>
            )}
            <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => onRemove(f.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
