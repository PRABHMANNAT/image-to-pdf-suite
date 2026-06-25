import { ToolLayout } from '../components/ToolLayout';
import { useToast } from '../hooks/useToast';
import { Trash2 } from 'lucide-react';

export default function Settings() {
  const toast = useToast();
  async function cleanup() {
    const r = await fetch('/api/temp/cleanup', { method: 'DELETE' });
    if (r.ok) toast('Temporary files cleared', 'success');
    else toast('Failed to clear', 'error');
  }
  return (
    <ToolLayout title="Settings" description="Manage local storage and theme.">
      <div className="card max-w-xl space-y-3">
        <h2 className="font-medium">Local storage</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          All processing happens on your computer. Temporary files auto-expire after 1 hour, or clear them now:
        </p>
        <button className="btn-secondary" onClick={cleanup}><Trash2 size={14} /> Clear temp files</button>
      </div>
      <div className="card max-w-xl mt-4">
        <h2 className="font-medium mb-2">Keyboard shortcuts</h2>
        <ul className="text-sm text-slate-600 dark:text-slate-400 list-disc pl-5 space-y-1">
          <li>Cmd/Ctrl+O — open file picker (drop zone focus)</li>
          <li>Esc — close dialogs</li>
        </ul>
      </div>
    </ToolLayout>
  );
}
