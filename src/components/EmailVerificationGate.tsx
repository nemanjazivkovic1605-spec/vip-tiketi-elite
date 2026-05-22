import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../hooks/useAuth';
import { getFirebaseErrorDetails } from '../services/authService';

type EmailVerificationGateProps = {
  children?: React.ReactNode;
};

export default function EmailVerificationGate({ children }: EmailVerificationGateProps) {
  const { user, isVerified, resendVerificationEmail, refreshUser } = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'send' | 'refresh' | null>(null);

  if (!user || isVerified) {
    return <>{children}</>;
  }

  const handleResend = async () => {
    setError('');
    setMessage('');
    setLoading('send');
    try {
      await resendVerificationEmail();
      setMessage('Verifikacioni email je poslat. Proverite inbox i spam folder.');
    } catch (err) {
      const details = getFirebaseErrorDetails(err);
      setError(details.message || 'Verifikacioni email nije poslat. Pokušajte ponovo.');
    } finally {
      setLoading(null);
    }
  };

  const handleRefresh = async () => {
    setError('');
    setMessage('');
    setLoading('refresh');
    try {
      const refreshed = await refreshUser();
      if (refreshed?.emailVerified) {
        setMessage('Email je potvrđen. Pristup je otključan.');
      } else {
        setError('Email još nije potvrđen. Kliknite link iz inboxa, pa pokušajte ponovo.');
      }
    } catch (err) {
      const details = getFirebaseErrorDetails(err);
      setError(details.message || 'Provera email verifikacije nije uspela.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-20 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-[2.5rem] border-gold-500/20 p-8 md:p-10"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-500">
          <MailCheck size={34} />
        </div>
        <h2 className="mb-3 text-2xl font-display font-black">Potvrdite email adresu da biste nastavili.</h2>
        <p className="mb-8 text-sm leading-relaxed text-neutral-400">
          Poslali smo verifikacioni link na <span className="font-bold text-neutral-200">{user.email}</span>. Dok email nije potvrđen, FREE i VIP tipovi ostaju zaključani.
        </p>

        {message && (
          <div className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-left text-sm text-red-300">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleResend}
            disabled={loading !== null}
            className="rounded-2xl bg-gold-500 px-5 py-4 text-sm font-black text-black transition-all hover:bg-gold-600 disabled:opacity-50"
          >
            {loading === 'send' ? 'Slanje...' : 'Pošalji verifikacioni email ponovo'}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading !== null}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-black text-neutral-200 transition-all hover:border-gold-500/30 hover:text-gold-500 disabled:opacity-50"
          >
            {loading === 'refresh' && <RefreshCw size={16} className="animate-spin" />}
            Proveri status
          </button>
        </div>

        <Link to="/login" className="mt-6 inline-block text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-gold-500">
          Vrati se na prijavu
        </Link>
      </motion.div>
    </div>
  );
}
