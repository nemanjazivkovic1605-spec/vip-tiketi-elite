import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Menu, X, User, Trophy, LogOut, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
    { label: 'Tabela', path: '/tickets' },
    { label: 'Uživo', path: '/live-results' },
    { label: 'Statistika', path: '/stats' },
  ];

  if (user) {
    navLinks.push({ label: 'DASHBOARD', path: '/dashboard' });
    navLinks.push({ label: 'VIP TIPOVI', path: '/vip-tips' });
    if (isAdmin) navLinks.push({ label: 'ADMIN', path: '/admin' });
  }

  const isHome = location.pathname === '/';

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${
      scrolled || !isHome ? 'bg-neutral-950/90 backdrop-blur-xl border-b border-white/5 py-4' : 'bg-transparent py-6'
    }`}>
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link to="/" className="text-2xl font-display font-black tracking-tighter flex items-center gap-2">
          <Trophy className="text-gold-500" size={28} />
          <span className="gold-text">ELITE</span> TIPS
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-sm font-bold uppercase tracking-widest transition-colors hover:text-gold-500 ${
                location.pathname === link.path ? 'text-gold-500' : 'text-neutral-400'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
               <span className="text-xs font-bold text-neutral-500">{user.email}</span>
               <button 
                onClick={logout}
                className="p-2 bg-white/5 hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-all"
               >
                 <LogOut size={20} />
               </button>
            </div>
          ) : (
            <>
              <Link to="/login" className="text-sm font-bold uppercase tracking-widest text-neutral-400 hover:text-gold-500">
                Prijava
              </Link>
              <Link to="/register" className="px-6 py-2.5 bg-gold-500 hover:bg-gold-600 text-black text-sm font-bold rounded-xl transition-all shadow-lg shadow-gold-500/20">
                Registracija
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button className="md:hidden text-neutral-100" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-neutral-950 border-b border-white/5 overflow-hidden"
          >
            <div className="px-6 py-8 flex flex-col gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className={`text-lg font-bold uppercase tracking-widest ${
                    location.pathname === link.path ? 'text-gold-500' : 'text-neutral-400'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="h-px bg-white/5 my-2"></div>
              {user ? (
                 <button 
                  onClick={() => { logout(); setIsOpen(false); }}
                  className="flex items-center gap-2 text-red-500 font-bold"
                 >
                   <LogOut size={20} /> ODJAVI SE
                 </button>
              ) : (
                <div className="flex flex-col gap-4">
                  <Link to="/login" onClick={() => setIsOpen(false)} className="py-4 text-center font-bold border border-white/10 rounded-2xl">PRIJAVA</Link>
                  <Link to="/register" onClick={() => setIsOpen(false)} className="py-4 text-center font-bold bg-gold-500 text-black rounded-2xl">REGISTRACIJA</Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
