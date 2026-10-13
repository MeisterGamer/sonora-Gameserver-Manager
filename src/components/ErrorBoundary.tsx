import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-neutral-900 border border-rose-800/80 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/80 border border-rose-700/60 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-neutral-100">
                {this.props.fallbackTitle || 'Ein Anzeigefehler ist aufgetreten'}
              </h2>
              <p className="text-xs text-neutral-400">
                Die Ansicht konnte wegen eines unerwarteten Datenzustands nicht geladen werden.
              </p>
            </div>
            {this.state.error?.message && (
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-left font-mono text-[11px] text-rose-300 break-all max-h-32 overflow-y-auto">
                {this.state.error.message}
              </div>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ansicht neu laden</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/';
                }}
                className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Zurück zur Übersicht</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
