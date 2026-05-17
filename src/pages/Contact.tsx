import React, { FormEvent, useState } from 'react';
import { CheckCircle2, Loader2, Mail, MessageSquare, Send, User } from 'lucide-react';
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
      setForm(initialForm);
      setShowSuccess(true);
      window.setTimeout(() => setShowSuccess(false), 3500);
    } catch {
      setError('Došlo je do greške. Pokušajte ponovo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-16">
      {showSuccess && (
        <div className="fixed right-6 top-24 z-50 flex items-center gap-3 rounded-xl border border-gold-500/30 bg-black/90 px-5 py-4 text-sm font-bold text-neutral-100 shadow-2xl shadow-gold-500/10 backdrop-blur-xl">
          <CheckCircle2 size={20} className="text-gold-500" />
          Poruka uspešno poslata.
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <section className="pt-4">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-400">
            <Mail size={14} />
            Kontakt
          </div>
          <h1 className="font-display text-4xl font-black tracking-tight text-white md:text-6xl">
            Pišite VIP Tiketi Elite timu
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-neutral-400">
            Za pitanja oko članarine, tipova ili naloga pošaljite poruku preko forme.
            Na sajtu ostaje javna adresa{' '}
            <a href={`mailto:${CONTACT_DISPLAY_EMAIL}`} className="font-bold text-gold-400 hover:text-gold-300">
              {CONTACT_DISPLAY_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500">Ime</span>
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-neutral-950/80 px-4 py-3 transition-all focus-within:border-gold-500/60 focus-within:ring-2 focus-within:ring-gold-500/10">
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
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-neutral-950/80 px-4 py-3 transition-all focus-within:border-gold-500/60 focus-within:ring-2 focus-within:ring-gold-500/10">
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
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-neutral-950/80 px-4 py-3 transition-all focus-within:border-gold-500/60 focus-within:ring-2 focus-within:ring-gold-500/10">
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
                className="min-h-44 w-full resize-y rounded-xl border border-white/10 bg-neutral-950/80 px-4 py-4 text-sm font-semibold leading-7 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-gold-500/60 focus:ring-2 focus:ring-gold-500/10"
                placeholder="Napišite poruku..."
                required
              />
            </label>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-3 rounded-xl bg-gold-500 px-6 py-4 text-sm font-black uppercase tracking-widest text-black shadow-lg shadow-gold-500/20 transition-all hover:-translate-y-0.5 hover:bg-gold-400 hover:shadow-gold-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="transition-transform group-hover:translate-x-0.5" />}
              {loading ? 'Slanje...' : 'Pošalji poruku'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
