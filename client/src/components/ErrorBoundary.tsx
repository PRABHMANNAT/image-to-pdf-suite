import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center app-bg px-4">
        <section className="glass max-w-lg rounded-2xl p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-300">
            <AlertTriangle size={22} />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            The workspace hit an error
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Your files stay local. Reload the interface and try the tool again.
          </p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-xl bg-slate-950 p-3 text-left text-xs text-slate-100">
            {this.state.error.message}
          </pre>
          <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>
            <RotateCcw size={14} /> Reload
          </button>
        </section>
      </div>
    );
  }
}
