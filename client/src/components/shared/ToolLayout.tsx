import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import type { Runtime, Status } from '../../lib/tools';

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  runtime?: Runtime;
  status?: Status;
  /** Header trailing slot — extra actions to the right of the title row. */
  headerExtra?: ReactNode;
  /** Upload area — usually a <FileDropzone />. */
  upload?: ReactNode;
  /** Options panel — settings/inputs for the tool. */
  options?: ReactNode;
  /** Preview area — usually a <PreviewViewer />. */
  preview?: ReactNode;
  /** Action footer — usually a <ProcessingPanel />. */
  action?: ReactNode;
  /** Result area — usually a <DownloadResult />. */
  result?: ReactNode;
  /** Fallback when none of the structured slots are passed. */
  children?: ReactNode;
  /** "stack" lays everything full-width; "split" puts preview left, options right. */
  layout?: 'stack' | 'split';
  /** Back-link target. Defaults to "/". */
  backTo?: string;
  className?: string;
}

const RUNTIME_LABEL: Record<Runtime, string> = {
  browser: 'Browser',
  backend: 'Backend',
  hybrid: 'Hybrid',
};
const STATUS_LABEL: Record<Status, string> = {
  ready: 'Ready',
  beta: 'Beta',
  'coming-soon': 'Coming soon',
};

export function ToolLayout({
  title,
  description,
  icon: Icon,
  runtime,
  status,
  headerExtra,
  upload,
  options,
  preview,
  action,
  result,
  children,
  layout = 'stack',
  backTo = '/',
  className,
}: Props) {
  const useStructured = upload !== undefined || options !== undefined || preview !== undefined || action !== undefined || result !== undefined;

  return (
    <div className={cn('max-w-7xl mx-auto', className)}>
      <Link to={backTo} className="btn-ghost text-xs mb-3 inline-flex">
        <ArrowLeft size={14} /> Back
      </Link>

      <header className="mb-6 flex items-start gap-4">
        {Icon && (
          <span className="grid place-items-center w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow-glow shrink-0">
            <Icon size={22} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            {runtime && <Badge variant={runtime}>{RUNTIME_LABEL[runtime]}</Badge>}
            {status && (
              <Badge variant={status === 'ready' ? 'ready' : status === 'beta' ? 'beta' : 'coming-soon'}>
                {STATUS_LABEL[status]}
              </Badge>
            )}
          </div>
          {description && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-3xl">{description}</p>
          )}
        </div>
        {headerExtra && <div className="shrink-0">{headerExtra}</div>}
      </header>

      {!useStructured && children}

      {useStructured && (
        <>
          {upload && <div className="mb-6">{upload}</div>}

          {layout === 'split' && (preview || options) ? (
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                {preview}
              </div>
              <div className="lg:col-span-4 space-y-6">
                {options}
                {action}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {preview}
              {options}
              {action}
            </div>
          )}

          {result && <div className="mt-6">{result}</div>}
        </>
      )}
    </div>
  );
}
