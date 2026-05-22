import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogIn, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { authService, getFirebaseErrorDetails } from '../services/authService';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const user = await login(email, password);
      if (user.isAdmin) {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const details = getFirebaseErrorDetails(err);
      console.error('Firebase login error:', details);
      setError(details.message || 'Neispravna email adresa ili lozinka.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('Unesite email adresu, pa kliknite na reset lozinke.');
      return;
    }

    setResetLoading(true);
    try {
      await authService.resetPassword(email);
      setSuccess('Link za reset lozinke je poslat na vašu email adresu.');
    } catch (err) {
      const details = getFirebaseErrorDetails(err);
      console.error('Firebase password reset error:', details);
      setError(details.message || 'Reset lozinke nije uspeo.');
    } finally {
      setResetLoading(false);
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
            <LogIn className="text-gold-500" size={32} />
          </div>
          <h2 className="text-3xl font-display font-bold mb-2">{resetMode ? 'Reset lozinke' : 'Dobrodošli nazad'}</h2>
          <p className="text-neutral-500">
            {resetMode ? 'Unesite email adresu i poslaćemo vam link za reset lozinke.' : 'Unesite svoje podatke za pristup VIP tipovima.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-xl flex items-center gap-3">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-xl">
            {success}
          </div>
        )}

        <form onSubmit={resetMode ? (event) => { event.preventDefault(); handlePasswordReset(); } : handleSubmit} className="space-y-6">
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

          {!resetMode && (
          <div className="space-y-2">
            <div className="flex justify-between items-center pl-1">
              <label className="text-sm font-semibold text-neutral-400">Lozinka</label>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setSuccess('');
                  setResetMode(true);
                }}
                className="text-xs text-gold-500 hover:underline"
              >
                Zaboravili ste lozinku?
              </button>
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-gold-500 transition-colors" size={20} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-gold-500/50 focus:ring-4 focus:ring-gold-500/10 transition-all font-medium"
                placeholder="••••••••"
              />
            </div>
          </div>
          )}

          <button 
            type="submit" 
            disabled={loading || resetLoading}
            className="w-full py-4 bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-2xl transition-all shadow-lg shadow-gold-500/20 flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            {loading || resetLoading ? <Loader2 className="animate-spin" /> : resetMode ? 'Pošalji link za reset lozinke' : 'Login'}
          </button>
        </form>

        <p className="mt-8 text-center text-neutral-500 text-sm">
          {resetMode ? (
            <button
              type="button"
              onClick={() => {
                setResetMode(false);
                setError('');
                setSuccess('');
              }}
              className="text-gold-500 font-bold hover:underline"
            >
              Vrati se na prijavu
            </button>
          ) : (
            <>Nemate nalog? <Link to="/register" className="text-gold-500 font-bold hover:underline">Registrujte se</Link></>
          )}
        </p>
      </motion.div>
    </div>
  );
}
