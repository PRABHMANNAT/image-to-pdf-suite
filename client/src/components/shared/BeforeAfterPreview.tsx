import { Columns2 } from 'lucide-react';
import { PreviewViewer } from './PreviewViewer';

interface Props {
  before: File | Blob | string | null;
  after: File | Blob | string | null;
  type?: 'image' | 'pdf' | 'auto';
  beforeLabel?: string;
  afterLabel?: string;
}

export function BeforeAfterPreview({
  before,
  after,
  type = 'auto',
  beforeLabel = 'Before',
  afterLabel = 'After',
}: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Columns2 size={16} className="text-brand-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Before / after preview</h3>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{beforeLabel}</div>
          <PreviewViewer source={before} type={type} className="min-h-[320px]" />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{afterLabel}</div>
          <PreviewViewer source={after} type={type} className="min-h-[320px]" />
        </div>
      </div>
    </section>
  );
}
