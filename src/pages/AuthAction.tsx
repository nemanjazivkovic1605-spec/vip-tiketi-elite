import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { applyActionCode, checkActionCode, confirmPasswordReset, reload, verifyPasswordResetCode } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { getFirebaseErrorDetails } from '../services/authService';

type ActionState = 'loading' | 'ready' | 'success' | 'error';

const actionCopy: Record<string, { title: string; subtitle: string }> = {
  verifyEmail: {
    title: 'Potvrda email adrese',
    subtitle: 'Završavamo verifikaciju vašeg Elite VIP Tips naloga.',
  },
  resetPassword: {
    title: 'Reset lozinke',
    subtitle: 'Unesite novu lozinku za vaš Elite VIP Tips nalog.',
  },
  recoverEmail: {
    title: 'Oporavak email adrese',
    subtitle: 'Proveravamo zahtev za oporavak email adrese.',
  },
};

export default function AuthAction() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode') || '';
  const oobCode = searchParams.get('oobCode') || '';
  const continueUrl = searchParams.get('continueUrl') || 'https://eliteviptips.com/login';
  const [state, setState] = useState<ActionState>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const copy = useMemo(
    () => actionCopy[mode] || {
      title: 'Sigurnosna akcija',
      subtitle: 'Proveravamo Firebase Auth link za vaš nalog.',
    },
    [mode],
  );

  useEffect(() => {
    let redirectTimer: number | undefined;

    const handleAction = async () => {
      if (!mode || !oobCode) {
        setMessage('Link nije validan ili je istekao. Zatražite novi email sa sajta.');
        setState('error');
        return;
      }

      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);

          if (auth.currentUser) {
            await reload(auth.currentUser);
            await auth.currentUser.getIdToken(true);
            await setDoc(doc(db, 'users', auth.currentUser.uid), {
              emailVerified: true,
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }

          setMessage('Email adresa je uspešno potvrđena. Preusmeravamo vas na prijavu.');
          setState('success');
          redirectTimer = window.setTimeout(() => navigate('/login?verified=1', { replace: true }), 1800);
          return;
        }

        if (mode === 'resetPassword') {
          const verifiedEmail = await verifyPasswordResetCode(auth, oobCode);
          setEmail(verifiedEmail);
          setState('ready');
          return;
        }

        if (mode === 'recoverEmail') {
          await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setMessage('Email adresa je uspešno vraćena.');
          setState('success');
          redirectTimer = window.setTimeout(() => navigate('/login', { replace: true }), 2200);
          return;
        }

        setMessage('Ovaj tip Firebase Auth linka nije podržan.');
        setState('error');
      } catch (error) {
        const details = getFirebaseErrorDetails(error);
        console.error('Firebase auth action error:', details);
        setMessage(details.message || 'Link nije validan ili je istekao. Zatražite novi email.');
        setState('error');
      }
    };

    handleAction();

    return () => {
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [continueUrl, mode, navigate, oobCode]);

  const handleResetSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    if (newPassword.length < 6) {
      setMessage('Nova lozinka mora imati najmanje 6 karaktera.');
      setState('error');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Lozinke se ne poklapaju.');
      setState('error');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setMessage('Lozinka je uspešno promenjena. Sada se možete prijaviti.');
      setState('success');
      window.setTimeout(() => navigate('/login?passwordReset=success', { replace: true }), 2200);
    } catch (error) {
      const details = getFirebaseErrorDetails(error);
      console.error('Firebase confirm password reset error:', details);
      setMessage(details.message || 'Reset lozinke nije uspeo.');
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  const isResetReady = mode === 'resetPassword' && state === 'ready';

  return (
    <div className="min-h-[80vh] bg-neutral-950 px-6 py-12 text-neutral-100">
      <div className="mx-auto flex max-w-5xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-gold-500/20 bg-black/70 p-8 shadow-2xl shadow-gold-500/10 md:p-10"
        >
          <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-gold-500/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-52 w-52 rounded-full bg-orange-500/10 blur-3xl" />

          <div className="relative">
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10 text-gold-500">
                {state === 'success' ? <CheckCircle2 size={28} /> : state === 'error' ? <AlertCircle size={28} /> : <ShieldCheck size={28} />}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-gold-500">Elite VIP Tips</p>
                <h1 className="font-display text-2xl font-black text-white md:text-3xl">{copy.title}</h1>
              </div>
            </div>

            <p className="mb-8 text-sm leading-7 text-neutral-400">{copy.subtitle}</p>

            {state === 'loading' && (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-neutral-300">
                <Loader2 className="animate-spin text-gold-500" size={20} />
                Obrađujemo sigurnosni link...
              </div>
            )}

            {isResetReady && (
              <form onSubmit={handleResetSubmit} className="space-y-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300">
                  <div className="flex items-center gap-3">
                    <Mail className="text-gold-500" size={18} />
                    <span>{email}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Nova lozinka</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/50 py-4 pl-12 pr-4 outline-none transition-all focus:border-gold-500/50 focus:ring-4 focus:ring-gold-500/10"
                      placeholder="Unesite novu lozinku"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Potvrdite lozinku</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/50 py-4 pl-12 pr-4 outline-none transition-all focus:border-gold-500/50 focus:ring-4 focus:ring-gold-500/10"
                      placeholder="Ponovite novu lozinku"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold-500 py-4 font-black text-black shadow-lg shadow-gold-500/20 transition-all hover:bg-gold-600 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                  Sačuvaj novu lozinku
                </button>
              </form>
            )}

            {message && (
              <div className={`mt-6 rounded-2xl border p-5 text-sm leading-7 ${
                state === 'success'
                  ? 'border-green-500/30 bg-green-500/10 text-green-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-200'
              }`}>
                {message}
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/login"
                className="flex-1 rounded-2xl border border-white/10 px-5 py-3 text-center text-xs font-black uppercase tracking-widest text-neutral-300 transition-all hover:border-gold-500/40 hover:text-gold-500"
              >
                Nazad na prijavu
              </Link>
              <Link
                to="/"
                className="flex-1 rounded-2xl bg-white/5 px-5 py-3 text-center text-xs font-black uppercase tracking-widest text-neutral-300 transition-all hover:bg-white/10"
              >
                Početna
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
