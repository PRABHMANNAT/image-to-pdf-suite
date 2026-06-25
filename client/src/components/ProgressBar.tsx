interface Props {
  value: number; // 0-100
  label?: string;
}
export function ProgressBar({ value, label }: Props) {
  return (
    <div className="w-full">
      {label && <div className="text-xs text-slate-600 dark:text-slate-300 mb-1">{label}</div>}
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
        <div
          className="h-full bg-brand-600 transition-all"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
