import React, { useState, useEffect } from 'react';
import { mockTipsService } from '../services/mockTips';
import { footballApiService } from '../services/footballApiService';
import { Tip, TicketStatus } from '../types';
import { CheckCircle2, XCircle, Clock, AlertCircle, ChevronRight, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';

const getTicketVisuals = (status: TicketStatus) => {
  if (status === TicketStatus.WON) {
    return {
      card: 'border-green-400/70 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_36%),linear-gradient(180deg,rgba(10,18,14,0.95),rgba(4,8,6,0.94))] shadow-[0_0_45px_rgba(34,197,94,0.24),0_18px_80px_rgba(0,0,0,0.45)] hover:shadow-[0_0_70px_rgba(34,197,94,0.34),0_22px_90px_rgba(0,0,0,0.55)]',
      glow: 'bg-green-400/25 blur-3xl opacity-80',
      badge: 'bg-green-400/15 text-green-300 border-green-400/40 shadow-[0_0_22px_rgba(34,197,94,0.35)]',
      label: '✓ PROŠAO',
      icon: <CheckCircle2 size={16} />,
      odds: 'text-green-300 drop-shadow-[0_0_14px_rgba(34,197,94,0.75)]',
      totalBox: 'bg-green-400/10 border-green-400/20',
    };
  }

  if (status === TicketStatus.LOST) {
    return {
      card: 'border-red-500/20 bg-[linear-gradient(180deg,rgba(18,13,13,0.88),rgba(8,8,8,0.94))] shadow-[0_14px_50px_rgba(0,0,0,0.35)] hover:border-red-500/30',
      glow: 'bg-red-500/5 blur-2xl opacity-40',
      badge: 'bg-red-500/10 text-red-300 border-red-500/25',
      label: '✕ PAO',
      icon: <XCircle size={16} />,
      odds: 'text-neutral-300',
      totalBox: 'bg-white/[0.03] border-white/10',
    };
  }

  return {
    card: 'border-orange-400/45 bg-[radial-gradient(circle_at_top_right,rgba(245,124,0,0.16),transparent_38%),linear-gradient(180deg,rgba(18,13,7,0.92),rgba(8,8,8,0.94))] shadow-[0_0_38px_rgba(245,124,0,0.20),0_16px_70px_rgba(0,0,0,0.42)] hover:shadow-[0_0_55px_rgba(245,124,0,0.28),0_20px_80px_rgba(0,0,0,0.48)]',
    glow: 'bg-orange-400/18 blur-3xl opacity-70',
    badge: 'bg-orange-400/12 text-orange-300 border-orange-400/35 shadow-[0_0_18px_rgba(245,124,0,0.25)]',
    label: '⏳ AKTIVAN',
    icon: <Clock size={16} />,
    odds: 'text-gold-300 drop-shadow-[0_0_12px_rgba(255,188,71,0.45)]',
    totalBox: 'bg-gold-500/10 border-gold-400/20',
  };
};

const getTicketKind = (matchCount: number) => {
  if (matchCount === 1) return 'SINGL';
  if (matchCount === 2) return 'DUBL';
  if (matchCount === 3) return 'TREBL';
  return 'KOMBINOVANI';
};

export default function Tickets() {
  const { isApproved } = useAuth();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'WON' | 'LOST'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'vip' | 'free'>('all');
  const isRealApiMode = footballApiService.isRealApiMode();

  useEffect(() => {
    fetchData();
    return mockTipsService.subscribe(fetchData);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const allTips = await mockTipsService.getTips();
      setTips(allTips);
    } finally {
      setLoading(false);
    }
  };

  const filteredTips = tips.filter(t => {
    const matchesStatus = filter === 'all' || t.status === filter;
    const matchesType = typeFilter === 'all' || (typeFilter === 'vip' ? t.isVip : !t.isVip);
    return matchesStatus && matchesType;
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">TABELA <span className="gold-text">TIKETA</span></h1>
        <p className="text-neutral-400">Pregled svih aktivnih i završenih tiketa iz naše baze.</p>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest mr-2">Status</span>
          {['all', TicketStatus.PENDING, TicketStatus.WON, TicketStatus.LOST].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                filter === f
                  ? 'bg-gold-500 text-black border-gold-500 shadow-lg shadow-gold-500/20'
                  : 'bg-white/5 text-neutral-400 border-white/10 hover:border-gold-500/30'
              }`}
            >
              {f === 'all' ? 'Sve' : f === TicketStatus.PENDING ? 'Aktivni' : f === TicketStatus.WON ? 'Prošli' : 'Pali'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest mr-2">Tip</span>
          {['all', 'free', 'vip'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t as any)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                typeFilter === t
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 text-neutral-400 border-white/10 hover:border-gold-500/30'
              }`}
            >
              {t === 'all' ? 'Svi' : t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredTips.map((tip) => {
              const visuals = getTicketVisuals(tip.status);

              return (
                <motion.div
                  layout
                  key={tip.id}
                  initial={{ opacity: 0, y: 18, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.97 }}
                  whileHover={{ y: -6 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className={`relative overflow-hidden rounded-[2rem] border transition-all duration-500 ${visuals.card}`}
                >
                  <div className={`pointer-events-none absolute -top-16 -right-14 h-44 w-44 rounded-full ${visuals.glow}`}></div>
                  <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

                  <div className="relative p-6 pb-5">
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                            tip.isVip ? 'bg-gold-500 text-black border-gold-300/70 shadow-[0_0_18px_rgba(245,124,0,0.28)]' : 'bg-white/5 text-neutral-300 border-white/10'
                          }`}>
                            {tip.isVip ? 'VIP' : 'FREE'}
                          </div>
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${visuals.badge}`}>
                            {visuals.icon}
                            {visuals.label}
                          </div>
                          <div className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-black/30 text-gold-300 border-gold-500/20">
                            {getTicketKind(tip.matches.length)}
                          </div>
                        </div>
                        <span className="text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]">
                          {tip.date} · {tip.matches.length} {tip.matches.length === 1 ? 'par' : 'parova'}
                        </span>
                      </div>

                      {tip.status === TicketStatus.WON && (
                        <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-green-400/10 text-green-300 border border-green-400/20">
                          <TrendingUp size={21} />
                        </div>
                      )}
                    </div>

                    <div className="p-6 space-y-5">
                      {tip.isVip && !isApproved ? (
                        <div className="py-8 flex flex-col items-center text-center">
                          <AlertCircle className="text-gold-500 mb-4" size={32} />
                          <h4 className="font-bold mb-2">VIP Tip Zaključan</h4>
                          <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-6">Potreban aktivan VIP nalog</p>
                          <Link to="/#pricing" className="px-6 py-2 bg-gold-500 text-black text-[10px] font-black rounded-lg">NADOGRADI</Link>
                        </div>
                      ) : (
                        tip.matches.map((m, i) => (
                          <div key={i} className="relative rounded-2xl bg-black/22 border border-white/7 p-4 transition-colors hover:border-white/12">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                              <span className="inline-flex items-center rounded-full bg-white/7 border border-white/10 px-3 py-1 text-[9px] text-neutral-300 uppercase font-black tracking-widest">
                                {m.league || 'Liga'}
                              </span>
                              {m.result && (
                                <span className="rounded-full bg-black/35 border border-white/10 px-3 py-1 text-[10px] font-display font-black text-neutral-200 tabular-nums">
                                  {m.result.replace(':', ' - ')}
                                </span>
                              )}
                            </div>

                            <div className="font-display font-bold text-neutral-100 text-lg leading-tight">
                              {m.homeTeam && m.awayTeam ? `${m.homeTeam} vs ${m.awayTeam}` : m.teams}
                            </div>

                            {m.analysis && (
                              <p className="mt-3 text-xs text-neutral-400 leading-relaxed">
                                {m.analysis}
                              </p>
                            )}

                            <div className="mt-5 flex items-end justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Tip</span>
                                <span className="rounded-xl bg-gold-500/12 border border-gold-400/20 px-3 py-1.5 text-sm font-black text-gold-300">
                                  {m.prediction}
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest mb-1">Kvota</div>
                                <div className={`text-3xl font-display font-black leading-none ${visuals.odds}`}>{m.odds.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="relative px-6 pb-6 pt-1">
                      <div className={`rounded-2xl border px-5 py-4 flex items-center justify-between gap-4 ${visuals.totalBox}`}>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Ukupna kvota</span>
                          <span className={`text-3xl font-display font-black ${visuals.odds}`}>{tip.totalOdds.toFixed(2)}</span>
                        </div>
                        {tip.stake && (
                          <div className="flex flex-col text-right">
                            <span className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Ulog</span>
                            <span className="text-base font-display font-bold text-neutral-200">{tip.stake.toFixed(2)}</span>
                          </div>
                        )}
                        {tip.isVip && isApproved && (
                          <Link to="/vip-tips" className="p-2 bg-white/5 rounded-lg text-neutral-400 hover:text-gold-500 transition-colors">
                            <ChevronRight size={18} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {filteredTips.length === 0 && !loading && (
        <div className="text-center py-20 glass rounded-[3rem]">
          <p className="text-neutral-500 font-bold">Nema tiketa za izabrani filter.</p>
          {isRealApiMode && tips.length === 0 && (
            <p className="text-neutral-600 text-xs font-bold uppercase tracking-widest mt-3">Trenutno nema dostupnih tiketa.</p>
          )}
        </div>
      )}
    </div>
  );
}
