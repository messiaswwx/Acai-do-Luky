import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou um erro não tratado:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public handleGoHome = () => {
    try {
      localStorage.removeItem('luky_active_order_id');
      localStorage.removeItem('luky_cached_active_order');
      sessionStorage.removeItem('luky_active_order_id');
    } catch {}

    if (typeof window !== 'undefined') {
      // Redireciona limpando quaisquer parâmetros de busca da URL
      window.location.href = window.location.origin + '/';
    } else {
      this.setState({ hasError: false, error: undefined });
    }
  };

  public handleClearDataAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-red-200 dark:border-red-900/50 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Algo inesperado aconteceu</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Não foi possível exibir a loja no momento. Isso geralmente é resolvido voltando ao início ou recarregando a página.
              </p>
            </div>

            {this.state.error && (
              <details className="text-left bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 overflow-x-auto">
                <summary className="font-bold cursor-pointer text-slate-700 dark:text-slate-200">
                  Ver detalhes técnicos do erro
                </summary>
                <pre className="mt-2 text-[10px] whitespace-pre-wrap font-mono text-red-600 dark:text-red-400">
                  {this.state.error.message || String(this.state.error)}
                  {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
                </pre>
              </details>
            )}

            <div className="space-y-2 pt-2">
              {/* Botão Principal: Voltar para a tela inicial do site */}
              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-800 to-indigo-900 hover:from-purple-900 hover:to-indigo-950 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-950/20 active:scale-98 transition-all"
              >
                <Home className="w-4 h-4 text-amber-300" />
                <span>Voltar para a Página Inicial</span>
              </button>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recarregar Página</span>
                </button>
                <button
                  type="button"
                  onClick={this.handleClearDataAndReload}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Limpar Dados & Iniciar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
