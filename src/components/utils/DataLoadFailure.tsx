import { AlertCircle } from 'lucide-react';

type DataLoadFailureProps = {
  message: string;
  onRetry: () => void;
};

export default function DataLoadFailure({ message, onRetry }: DataLoadFailureProps) {
  return (
    <div className="rounded-[2rem] border border-gold-500/20 bg-black/35 px-6 py-12 text-center">
      <AlertCircle className="mx-auto mb-4 text-gold-500" size={32} />
      <p className="text-sm font-bold text-neutral-300">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-xl border border-gold-500/30 bg-gold-500/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-gold-300 transition hover:bg-gold-500/20"
      >
        Pokušaj ponovo
      </button>
    </div>
  );
}
