import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, MessageSquare, Trophy, Twitter } from 'lucide-react';
import { CONTACT_DISPLAY_EMAIL } from '../../services/contactService';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black px-6 pb-10 pt-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link to="/" className="mb-5 flex items-center gap-2 font-display text-3xl font-black tracking-tighter">
              <Trophy className="text-gold-500" size={32} />
              <span className="gold-text">ELITE</span> TIPS
            </Link>
            <p className="mb-7 max-w-sm text-sm leading-7 text-neutral-500">
              Sportska analitika, disciplina i transparentna istorija tipova. Klađenje nosi rizik, zato igrajte odgovorno.
            </p>
            <div className="flex gap-3">
              {[Instagram, Twitter, MessageSquare].map((Icon, index) => (
                <a key={index} href="#" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 transition-all hover:bg-gold-500/10 hover:text-gold-500">
                  <Icon size={20} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-5 text-sm font-black uppercase tracking-widest">Linkovi</h4>
            <ul className="space-y-3 text-sm font-medium text-neutral-500">
              <li><Link to="/daily-tips" className="transition-colors hover:text-gold-500">Aktivni tipovi</Link></li>
              <li><Link to="/tickets" className="transition-colors hover:text-gold-500">Istorija</Link></li>
              <li><Link to="/stats" className="transition-colors hover:text-gold-500">Statistika</Link></li>
              <li><Link to="/register" className="transition-colors hover:text-gold-500">VIP pristup</Link></li>
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

        <div className="flex flex-col items-center justify-between gap-5 border-t border-white/5 pt-8 md:flex-row">
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
