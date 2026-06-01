import React, { FormEvent, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Headphones,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  CONTACT_DISPLAY_EMAIL,
  sendContactMessage,
} from '../services/contactService';

const initialForm = {
  name: '',
  email: '',
  subject: '',
  message: '',
};

const isValidEmail = (email: string) => /\S+@\S+\.\S+/.test(email);

export default function Contact() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedForm = {
      name: form.name.trim(),
      email: form.email.trim(),
      subject: form.subject.trim(),
      message: form.message.trim(),
    };

    if (!trimmedForm.name || !trimmedForm.email || !trimmedForm.subject || !trimmedForm.message) {
      setError('Popunite sva polja pre slanja poruke.');
      return;
    }

    if (!isValidEmail(trimmedForm.email)) {
      setError('Unesite ispravnu email adresu.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await sendContactMessage(trimmedForm);
      setError('');
      setForm(initialForm);
      setShowSuccess(true);
      window.setTimeout(() => setShowSuccess(false), 3500);
    } catch (sendError) {
      console.error('Contact form request failed:', sendError);
      setError('Došlo je do greške. Pokušajte ponovo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070707] px-5 py-12 md:px-6 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(245,158,11,0.045),transparent_34%,transparent_72%,rgba(255,255,255,0.025))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />

      {showSuccess && (
        <div className="fixed inset-x-5 top-24 z-50 flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-[#0b120e]/95 px-5 py-4 text-sm font-bold text-neutral-100 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl md:left-auto md:right-6">
          <CheckCircle2 size={20} className="shrink-0 text-emerald-400" />
          Hvala! Poruka je uspešno poslata.
        </div>
      )}

      <div className="relative mx-auto max-w-6xl">
        <header className="mb-8 border-b border-white/8 pb-8 md:mb-10 md:pb-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/[0.08] px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-gold-400">
            <Mail size={14} />
            Elite podrška
          </div>
          <h1 className="max-w-3xl font-display text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">
            Kontaktirajte naš tim
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-400 md:text-base md:leading-8">
            Za pitanja oko članarine, VIP tipova ili naloga pošaljite nam poruku preko forme.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-12">
          <section>
            <div className="border-y border-white/8 py-1">
              <a
                href={`mailto:${CONTACT_DISPLAY_EMAIL}`}
                className="group flex items-center gap-4 border-b border-white/8 px-1 py-5 transition-colors hover:bg-white/[0.025]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gold-500/25 bg-gold-500/[0.08] text-gold-400">
                  <Mail size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500">Email podrška</span>
                  <span className="mt-1 block truncate text-sm font-bold text-neutral-100">{CONTACT_DISPLAY_EMAIL}</span>
                </span>
                <ArrowUpRight size={18} className="ml-auto shrink-0 text-neutral-600 transition-colors group-hover:text-gold-400" />
              </a>

              <div className="flex items-center gap-4 border-b border-white/8 px-1 py-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-neutral-300">
                  <Clock3 size={19} />
                </span>
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500">Vreme odgovora</span>
                  <span className="mt-1 block text-sm font-bold text-neutral-100">U najkraćem mogućem roku</span>
                </span>
              </div>

              <div className="flex items-center gap-4 px-1 py-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-neutral-300">
                  <ShieldCheck size={19} />
                </span>
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500">Direktna podrška</span>
                  <span className="mt-1 block text-sm font-bold text-neutral-100">Diskretno i profesionalno</span>
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-start gap-3 rounded-lg border border-gold-500/15 bg-gold-500/[0.045] px-4 py-4 text-xs leading-6 text-neutral-400">
              <Headphones size={18} className="mt-0.5 shrink-0 text-gold-400" />
              Naš tim odgovara na pitanja o nalozima, paketima i pristupu objavljenim tipovima.
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-white/10 bg-[#101010]/90 shadow-2xl shadow-black/35 backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-white/8 bg-white/[0.025] px-5 py-4 md:px-7">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold-500/20 bg-gold-500/[0.08] text-gold-400">
                <MessageSquare size={17} />
              </span>
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">Pošaljite poruku</h2>
                <p className="mt-0.5 text-xs text-neutral-500">Popunite polja i kontaktiraćemo vas uskoro.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-5 md:p-7">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500">Ime</span>
                  <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/35 px-4 py-3.5 transition-all focus-within:border-gold-500/60 focus-within:bg-black/55 focus-within:ring-2 focus-within:ring-gold-500/10">
                    <User size={18} className="text-gold-500" />
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => updateField('name', event.target.value)}
                      className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-neutral-600"
                      placeholder="Vaše ime"
                      autoComplete="name"
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500">Email</span>
                  <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/35 px-4 py-3.5 transition-all focus-within:border-gold-500/60 focus-within:bg-black/55 focus-within:ring-2 focus-within:ring-gold-500/10">
                    <Mail size={18} className="text-gold-500" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-neutral-600"
                      placeholder="vas@email.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500">Naslov</span>
                <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/35 px-4 py-3.5 transition-all focus-within:border-gold-500/60 focus-within:bg-black/55 focus-within:ring-2 focus-within:ring-gold-500/10">
                  <MessageSquare size={18} className="text-gold-500" />
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(event) => updateField('subject', event.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-neutral-600"
                    placeholder="Tema poruke"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500">Poruka</span>
                <textarea
                  value={form.message}
                  onChange={(event) => updateField('message', event.target.value)}
                  className="min-h-40 w-full resize-y rounded-lg border border-white/10 bg-black/35 px-4 py-4 text-sm font-semibold leading-7 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-gold-500/60 focus:bg-black/55 focus:ring-2 focus:ring-gold-500/10"
                  placeholder="Napišite poruku..."
                  required
                />
              </label>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-3 rounded-lg bg-gold-500 px-6 py-4 text-sm font-black uppercase tracking-widest text-black shadow-lg shadow-gold-500/20 transition-all hover:-translate-y-0.5 hover:bg-gold-400 hover:shadow-gold-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="transition-transform group-hover:translate-x-0.5" />}
                {loading ? 'Slanje...' : 'Pošalji poruku'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
