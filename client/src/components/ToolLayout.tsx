import { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}
export function ToolLayout({ title, description, children }: Props) {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        {description && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{description}</p>}
      </header>
      {children}
    </div>
  );
}
