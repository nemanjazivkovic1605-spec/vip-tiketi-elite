import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, MessageSquare, ShieldCheck, Trophy } from 'lucide-react';
import { CONTACT_DISPLAY_EMAIL } from '../../services/contactService';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black px-5 pb-8 pt-10 md:px-6 md:pt-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col justify-between gap-4 rounded-xl border border-gold-500/15 bg-gold-500/[0.035] px-5 py-5 md:flex-row md:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-400">Elite VIP Tips</p>
            <h3 className="mt-1 font-display text-xl font-black text-white">Spremni za disciplinovan pristup?</h3>
          </div>
          <Link to="/#pricing" className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold-500 px-4 py-3 text-xs font-black uppercase tracking-wide text-black transition-colors hover:bg-gold-400">
            Pogledaj pakete <ArrowRight size={16} />
          </Link>
        </div>

        <div className="mb-10 grid gap-9 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link to="/" className="mb-5 flex items-center gap-2 font-display text-3xl font-black tracking-tighter">
              <Trophy className="text-gold-500" size={32} />
              <span className="gold-text">ELITE</span> TIPS
            </Link>
            <p className="mb-7 max-w-sm text-sm leading-7 text-neutral-500">
              Sportska analitika, disciplina i transparentna istorija tipova. Klađenje nosi rizik, zato igrajte odgovorno.
            </p>
            <div className="flex gap-3">
              <Link to="/contact" aria-label="Kontakt forma" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 transition-all hover:border-gold-500/25 hover:bg-gold-500/10 hover:text-gold-500">
                <MessageSquare size={19} />
              </Link>
              <a href={`mailto:${CONTACT_DISPLAY_EMAIL}`} aria-label="Email podrška" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 transition-all hover:border-gold-500/25 hover:bg-gold-500/10 hover:text-gold-500">
                <Mail size={19} />
              </a>
              <Link to="/terms" aria-label="Pravila korišćenja" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 transition-all hover:border-gold-500/25 hover:bg-gold-500/10 hover:text-gold-500">
                <ShieldCheck size={19} />
              </Link>
            </div>
          </div>

          <div>
            <h4 className="mb-5 text-sm font-black uppercase tracking-widest">Linkovi</h4>
            <ul className="space-y-3 text-sm font-medium text-neutral-500">
              <li><Link to="/daily-tips" className="transition-colors hover:text-gold-500">Aktivni tipovi</Link></li>
              <li><Link to="/history" className="transition-colors hover:text-gold-500">Istorija</Link></li>
              <li><Link to="/stats" className="transition-colors hover:text-gold-500">Statistika</Link></li>
              <li><Link to="/#pricing" className="transition-colors hover:text-gold-500">VIP pristup</Link></li>
              <li><Link to="/login" className="transition-colors hover:text-gold-500">Prijava</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-sm font-black uppercase tracking-widest">Podrška</h4>
            <ul className="space-y-3 text-sm font-medium text-neutral-500">
              <li><Link to="/contact" className="transition-colors hover:text-gold-500">Kontakt</Link></li>
              <li><Link to="/faq" className="transition-colors hover:text-gold-500">Česta pitanja</Link></li>
              <li><Link to="/terms" className="transition-colors hover:text-gold-500">Pravila korišćenja</Link></li>
              <li>
                <a href={`mailto:${CONTACT_DISPLAY_EMAIL}`} className="flex items-center gap-2 transition-colors hover:text-gold-500">
                  <Mail size={16} className="text-gold-500" />
                  {CONTACT_DISPLAY_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 md:flex-row">
          <p className="text-center text-xs text-neutral-600 md:text-left">
            © 2025-2026 Elite VIP Tips. Sva prava zadržana. Klađenje je dozvoljeno osobama starijim od 18 godina.
          </p>
          <div className="flex items-center gap-5 text-[10px] font-black uppercase tracking-widest text-neutral-600">
            <span>Responsible betting</span>
            <span className="text-gold-500">18+</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
