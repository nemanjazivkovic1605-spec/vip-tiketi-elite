import React from 'react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  declare readonly props: AppErrorBoundaryProps;

  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 text-center">
          <h2 className="font-display text-2xl font-bold text-white">Stranica trenutno nije dostupna</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            Došlo je do neočekivane greške. Osvežite stranicu i pokušajte ponovo.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-7 rounded-xl bg-gold-500 px-6 py-3 text-sm font-black text-black transition hover:bg-gold-400"
          >
            Osveži stranicu
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
