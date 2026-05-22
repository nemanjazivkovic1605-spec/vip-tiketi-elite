import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { UserPlus, Mail, Lock, User, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { getFirebaseErrorDetails, getPlanById, getSavedSelectedPlan, saveSelectedPlan } from '../services/authService';

export default function Register() {
  const [searchParams] = useSearchParams();
  const { register } = useAuth();
  const selectedPlan = getPlanById(searchParams.get('plan') || getSavedSelectedPlan());
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    saveSelectedPlan(selectedPlan.id);
  }, [selectedPlan.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (password !== confirmPassword) {
      setError('Lozinke se ne podudaraju.');
      return;
    }

    setLoading(true);
    try {
      await register({
        email,
        password,
        displayName,
        selectedPlan: selectedPlan.id,
      });
      setSuccess(true);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setDisplayName('');
    } catch (err) {
      const details = getFirebaseErrorDetails(err);
      console.error('Registration error:', details, err);
      setError(`Greška prilikom registracije: ${details.message} Kod: ${details.code}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full glass p-8 md:p-10 rounded-[2.5rem] shadow-2xl"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <UserPlus className="text-gold-500" size={32} />
          </div>
          <h2 className="text-3xl font-display font-bold mb-2">Napravi nalog</h2>
          <p className="text-neutral-500">Pridruži se eliti, potvrdi email i sačekaj odobrenje administratora.</p>
        </div>

        <div className="mb-6 rounded-2xl border border-gold-500/25 bg-gold-500/10 p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-gold-500">Izabrani paket</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="font-display text-xl font-bold">{selectedPlan.name}</div>
            <div className="text-sm font-black text-gold-500">€{selectedPlan.price}</div>
          </div>
          <div className="mt-1 text-xs text-neutral-400">
            {selectedPlan.durationDays} dana VIP pristupa nakon odobrenja uplate.
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-xl flex items-center gap-3">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-xl flex items-start gap-3">
            <CheckCircle size={18} className="mt-0.5 shrink-0" />
            <span>Registracija je uspešna. Poslali smo verifikacioni email. Potvrdite email adresu da biste nastavili.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-400 pl-1">Ime / username</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-gold-500/50 focus:ring-4 focus:ring-gold-500/10 transition-all font-medium"
                placeholder="Vaše ime"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-400 pl-1">Email adresa</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-gold-500/50 focus:ring-4 focus:ring-gold-500/10 transition-all font-medium"
                placeholder="ime@primer.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-400 pl-1">Lozinka</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-gold-500/50 focus:ring-4 focus:ring-gold-500/10 transition-all font-medium"
                placeholder="Minimum 6 karaktera"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-400 pl-1">Potvrdi lozinku</label>
            <div className="relative group">
              <CheckCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-gold-500/50 focus:ring-4 focus:ring-gold-500/10 transition-all font-medium"
                placeholder="Ponovi lozinku"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-2xl transition-all shadow-lg shadow-gold-500/20 flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Registruj se'}
          </button>
        </form>

        <p className="mt-8 text-center text-neutral-500 text-sm">
          Već imate nalog? <Link to="/login" className="text-gold-500 font-bold hover:underline">Ulogujte se</Link>
        </p>
      </motion.div>
    </div>
  );
}
