import React, { useState, useEffect } from 'react';
import { mockTipsService } from '../services/mockTips';
import { footballApiService } from '../services/footballApiService';
import { Tip, TicketStatus } from '../types';
import { CheckCircle2, XCircle, Clock, Filter, AlertCircle, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';

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

      {/* Filters */}
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
            {filteredTips.map((tip) => (
              <motion.div
                layout
                key={tip.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`glass rounded-[2rem] overflow-hidden border-2 transition-all hover:border-gold-500/20 ${
                  tip.status === TicketStatus.WON ? 'border-green-500/20' : 
                  tip.status === TicketStatus.LOST ? 'border-red-500/20' : 'border-white/5'
                }`}
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                  <div className="flex items-center gap-3">
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                      tip.isVip ? 'bg-gold-500 text-black' : 'bg-neutral-800 text-neutral-400'
                    }`}>
                      {tip.isVip ? 'VIP' : 'FREE'}
                    </div>
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">{tip.date}</span>
                  </div>
                  
                  {tip.status === TicketStatus.WON && <CheckCircle2 size={18} className="text-green-500" />}
                  {tip.status === TicketStatus.LOST && <XCircle size={18} className="text-red-500" />}
                  {tip.status === TicketStatus.PENDING && <Clock size={18} className="text-gold-500 animate-pulse" />}
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
                      <div key={i} className="relative">
                        <div className="flex justify-between items-start mb-1 text-[9px] text-neutral-500 uppercase font-black tracking-widest">
                          <span>{m.league}</span>
                          <span>{m.result || (tip.status === TicketStatus.PENDING ? '--:--' : '-')}</span>
                        </div>
                        <div className="font-bold text-neutral-200 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{m.teams}</div>
                        <div className="mt-2 flex items-center justify-between">
                           <div className="flex items-center gap-2">
                             <span className="text-[9px] text-neutral-500 font-black uppercase">Prognoza:</span>
                             <span className="text-xs font-black text-gold-500">{m.prediction}</span>
                           </div>
                           <div className="text-[10px] font-bold text-neutral-500">{m.odds.toFixed(2)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="px-6 py-4 bg-black/20 flex items-center justify-between border-t border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 font-black uppercase tracking-widest">Ukupna Kvota</span>
                    <span className="text-lg font-display font-black text-gold-500">{tip.totalOdds.toFixed(2)}</span>
                  </div>
                  {tip.stake && (
                    <div className="flex flex-col text-right">
                      <span className="text-[8px] text-neutral-500 font-black uppercase tracking-widest">Ulog</span>
                      <span className="text-sm font-bold text-neutral-300">{tip.stake.toFixed(2)}</span>
                    </div>
                  )}
                  {tip.isVip && isApproved && (
                    <Link to="/vip-tips" className="p-2 bg-white/5 rounded-lg text-neutral-400 hover:text-gold-500 transition-colors">
                       <ChevronRight size={18} />
                    </Link>
                  )}
                </div>
              </motion.div>
            ))}
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
