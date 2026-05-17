import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Instagram, Twitter, MessageSquare, Mail } from 'lucide-react';
import { CONTACT_DISPLAY_EMAIL } from '../../services/contactService';

export default function Footer() {
  return (
    <footer className="bg-black border-t border-white/5 pt-20 pb-10 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-2">
            <Link to="/" className="text-3xl font-display font-black tracking-tighter flex items-center gap-2 mb-6">
              <Trophy className="text-gold-500" size={32} />
              <span className="gold-text">ELITE</span> TIPS
            </Link>
            <p className="text-neutral-500 max-w-sm mb-8 leading-relaxed">
              Vodeća platforma za sportsku analitiku na Balkanu. Naš glavni cilj je dugoročni profit kroz disciplinovano klađenje i rane informacije.
            </p>
            <div className="flex gap-4">
              {[Instagram, Twitter, MessageSquare].map((Icon, i) => (
                <a key={i} href="#" className="w-10 h-10 bg-white/5 hover:bg-gold-500/10 hover:text-gold-500 rounded-xl flex items-center justify-center transition-all">
                  <Icon size={20} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-black uppercase tracking-widest mb-6">Linkovi</h4>
            <ul className="space-y-4 text-neutral-500 text-sm font-medium">
              <li><Link to="/results" className="hover:text-gold-500 transition-colors">Rezultati</Link></li>
              <li><Link to="/stats" className="hover:text-gold-500 transition-colors">Statistika</Link></li>
              <li><Link to="/register" className="hover:text-gold-500 transition-colors">Članarina</Link></li>
              <li><Link to="/login" className="hover:text-gold-500 transition-colors">Prijavi se</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-black uppercase tracking-widest mb-6">Podrška</h4>
            <ul className="space-y-4 text-neutral-500 text-sm font-medium">
              <li><Link to="/contact" className="hover:text-gold-500 transition-colors">Kontakt</Link></li>
              <li><a href="#" className="hover:text-gold-500 transition-colors">Često postavljana pitanja</a></li>
              <li><a href="#" className="hover:text-gold-500 transition-colors">Pravila korišćenja</a></li>
              <li>
                <a href={`mailto:${CONTACT_DISPLAY_EMAIL}`} className="flex items-center gap-2 hover:text-gold-500 transition-colors">
                  <Mail size={16} className="text-gold-500" />
                  {CONTACT_DISPLAY_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-neutral-600 text-xs text-center md:text-left">
            © 2025–2026 VIP Tiketi Elite. Sva prava zadržana. <br className="md:hidden" /> Klađenje je dozvoljeno osobama starijim od 18 godina.
          </p>
          <div className="flex items-center gap-6 text-neutral-600 text-[10px] font-black uppercase tracking-widest">
            <span>Powered by Precision Analytics</span>
            <span className="text-gold-500">Balkan No.1</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
