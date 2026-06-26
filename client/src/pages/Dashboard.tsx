import { Sparkles, ShieldCheck, Cpu } from 'lucide-react';
import { CategorySection } from '../components/dashboard/CategorySection';
import { VISIBLE_CATEGORIES, toolsByCategory } from '../lib/tools';

export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-10">
      <section className="relative overflow-hidden rounded-3xl p-6 sm:p-8 animate-fade-in">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-90"
          style={{
            background:
              'radial-gradient(1200px 400px at 0% 0%, rgba(59,130,246,0.25), transparent 60%),' +
              'radial-gradient(900px 400px at 100% 0%, rgba(168,85,247,0.22), transparent 55%),' +
              'linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.2))',
          }}
        />
        <div className="absolute inset-0 -z-10 rounded-3xl border border-white/60 dark:border-white/10" />
        <div className="flex items-center gap-2 text-xs font-medium text-brand-700 dark:text-brand-300">
          <Sparkles size={14} /> Local-first PDF & image toolkit
        </div>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Everything you need for PDFs.{' '}
          <span className="bg-gradient-to-r from-brand-500 to-fuchsia-500 bg-clip-text text-transparent">
            Unlimited.
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm sm:text-base text-slate-600 dark:text-slate-300">
          A premium PDF and image studio that runs on your machine. No upload caps, no paywalls,
          no waiting.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 ring-1 ring-emerald-500/20 px-2.5 py-1">
            <ShieldCheck size={12} /> Files never leave your machine
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 ring-1 ring-indigo-500/20 px-2.5 py-1">
            <Cpu size={12} /> Browser + optional backend
          </span>
        </div>
      </section>

      {VISIBLE_CATEGORIES.map((cat) => (
        <CategorySection key={cat.id} category={cat} tools={toolsByCategory(cat.id)} />
      ))}
    </div>
  );
}
