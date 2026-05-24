import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LogOut, Menu, Trophy, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Početna', path: '/' },
    { label: 'Aktivni tipovi', path: '/daily-tips' },
    { label: 'Istorija', path: '/tickets' },
    { label: 'Statistika', path: '/stats' },
    { label: 'Kontakt', path: '/contact' },
  ];

  const accountLinks = user
    ? [
      { label: 'Dashboard', path: '/dashboard' },
      ...(isAdmin ? [{ label: 'Admin', path: '/admin' }] : []),
    ]
    : [];

  const isHome = location.pathname === '/';
  const vipCtaPath = user ? '/vip-tips' : '/register';

  return (
    <nav className={`fixed left-0 top-0 z-50 w-full transition-all duration-300 ${
      scrolled || !isHome ? 'border-b border-white/5 bg-neutral-950/92 py-3 backdrop-blur-xl' : 'bg-transparent py-5'
    }`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 md:px-6">
        <Link to="/" className="flex items-center gap-2 font-display text-2xl font-black tracking-tighter">
          <Trophy className="text-gold-500" size={28} />
          <span className="gold-text">ELITE</span> TIPS
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-[12px] font-black uppercase tracking-widest transition-colors hover:text-gold-500 ${
                location.pathname === link.path ? 'text-gold-500' : 'text-neutral-400'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {accountLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-[11px] font-black uppercase tracking-widest transition-colors hover:text-gold-500 ${
                location.pathname === link.path ? 'text-gold-500' : 'text-neutral-500'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to={vipCtaPath}
            className="rounded-2xl bg-gold-500 px-5 py-2.5 text-[12px] font-black uppercase tracking-widest text-black shadow-lg shadow-gold-500/20 transition-all hover:bg-gold-400"
          >
            VIP pristup
          </Link>
          {user ? (
            <>
              <span className="max-w-[180px] truncate text-xs font-bold text-neutral-500">{user.email}</span>
              <button
                onClick={logout}
                className="rounded-xl bg-white/5 p-2 text-neutral-400 transition-all hover:bg-red-500/10 hover:text-red-400"
                aria-label="Odjavi se"
              >
                <LogOut size={19} />
              </button>
            </>
          ) : (
            <Link to="/login" className="text-[12px] font-black uppercase tracking-widest text-neutral-400 transition-colors hover:text-gold-500">
              Prijava
            </Link>
          )}
        </div>

        <button className="text-neutral-100 lg:hidden" onClick={() => setIsOpen(!isOpen)} aria-label="Otvori meni">
          {isOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-white/5 bg-neutral-950 lg:hidden"
          >
            <div className="flex flex-col gap-3 px-6 py-7">
              {[...navLinks, ...accountLinks].map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className={`rounded-2xl px-4 py-3 text-sm font-black uppercase tracking-widest ${
                    location.pathname === link.path ? 'bg-gold-500/10 text-gold-500' : 'text-neutral-400'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to={vipCtaPath}
                onClick={() => setIsOpen(false)}
                className="rounded-2xl bg-gold-500 px-4 py-4 text-center text-sm font-black uppercase tracking-widest text-black"
              >
                VIP pristup
              </Link>
              <div className="my-2 h-px bg-white/5" />
              {user ? (
                <div className="flex flex-col gap-4">
                  <div className="break-all text-xs font-bold text-neutral-500">{user.email}</div>
                  <button
                    onClick={() => { logout(); setIsOpen(false); }}
                    className="flex items-center gap-2 font-bold text-red-400"
                  >
                    <LogOut size={20} /> Odjavi se
                  </button>
                </div>
              ) : (
                <Link to="/login" onClick={() => setIsOpen(false)} className="rounded-2xl border border-white/10 py-4 text-center font-bold">
                  Prijava
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
