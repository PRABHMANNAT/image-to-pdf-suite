import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Hammer, Sparkles } from 'lucide-react';
import { Tool } from '../lib/tools';
import { Badge } from './ui/Badge';

const RUNTIME_NOTE: Record<Tool['runtime'], string> = {
  browser: 'This tool will run entirely in your browser.',
  backend: 'This tool requires the local backend to be running.',
  hybrid: 'Runs in your browser when possible; offloads to backend for heavy jobs.',
};

interface Props {
  tool: Tool;
}

export function ToolPlaceholder({ tool }: Props) {
  const navigate = useNavigate();
  const Icon = tool.icon;
  return (
    <div className="max-w-4xl mx-auto">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="btn-ghost mb-4 text-xs"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-10 animate-fade-in">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(800px 400px at 100% 0%, rgba(99,102,241,0.18), transparent 60%),' +
              'radial-gradient(800px 400px at 0% 100%, rgba(59,130,246,0.18), transparent 60%),' +
              'linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.2))',
          }}
        />
        <div className="absolute inset-0 -z-10 rounded-3xl border border-white/60 dark:border-white/10" />

        <div className="flex items-center gap-4">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow-glow">
            <Icon size={26} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {tool.name}
              </h1>
              <Badge variant={tool.status === 'beta' ? 'beta' : 'coming-soon'}>
                {tool.status === 'beta' ? 'Beta' : 'Coming soon'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tool.description}</p>
          </div>
        </div>

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 p-5 bg-white/40 dark:bg-white/5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Hammer size={16} /> Under construction
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              The UI shell for this tool is wired up. The processing logic ships in the next phase.
            </p>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 p-5 bg-white/40 dark:bg-white/5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Sparkles size={16} /> Runtime
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{RUNTIME_NOTE[tool.runtime]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
