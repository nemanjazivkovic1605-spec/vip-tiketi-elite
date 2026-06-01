import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { mockTipsService } from '../services/mockTips';
import { Tip, TicketStatus } from '../types';
import { Zap, ShieldCheck, TrendingUp, Info, BarChart2, Star } from 'lucide-react';
import { formatLeagueName } from '../utils/leagueMapper';

export default function VipTips() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const vipTips = await mockTipsService.getVipTips();
        setTips(vipTips.filter(t => t.status === TicketStatus.PENDING));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return mockTipsService.subscribe(fetchData);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gold-500/10 border border-gold-500/20 rounded-full text-[10px] font-black text-gold-500 uppercase tracking-widest mb-4">
             <Star size={12} /> Proširena Analiza
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">ELITE <span className="gold-text">VIP TIPOVI</span></h1>
          <p className="text-neutral-400">Pristup najsigurnijim tipovima dana. Ovi tipovi su rezervisani isključivo za naše premium članove.</p>
        </div>
        
        <div className="hidden lg:flex items-center gap-4 bg-white/[0.02] p-4 rounded-3xl border border-white/5">
           <div className="text-right">
              <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Dnevna Sigurnost</div>
              <div className="text-xl font-bold text-gold-500">92% CONFIDENCE</div>
           </div>
           <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500">
              <ShieldCheck size={24} />
           </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
           <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : tips.length > 0 ? (
        <div className="grid lg:grid-cols-2 gap-8">
          <AnimatePresence>
            {tips.map((tip, idx) => (
              <motion.div
                key={tip.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="glass rounded-[2.5rem] overflow-hidden border-gold-500/30 gold-glow relative"
              >
                <div className="absolute top-0 right-0 p-6">
                   <div className="bg-gold-500 text-black px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">
                      CONFIRMED
                   </div>
                </div>

                {/* Header */}
                <div className="p-8 pb-4">
                   <div className="flex items-center gap-3 text-neutral-500 text-xs mb-4 font-bold uppercase tracking-widest">
                      <Zap size={14} className="text-gold-500" /> Ukupna Kvota
                      <span className="text-2xl font-display font-black text-gold-500 ml-1">{tip.totalOdds.toFixed(2)}</span>
                   </div>

                   <div className="space-y-6 mb-8">
                      {tip.matches.map((m, i) => (
                        <div key={i} className="relative pl-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-gold-500 before:rounded-full">
                           <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-neutral-500 font-bold uppercase tracking-widest">{formatLeagueName(m.league)} @ {m.time}</span>
                           </div>
                           <h3 className="text-xl md:text-2xl font-bold text-neutral-100 mb-2">{m.homeTeam} - {m.awayTeam}</h3>
                           <div className="flex items-center gap-4">
                              <div className="bg-gold-500/10 border border-gold-500/20 px-4 py-2 rounded-xl">
                                 <span className="text-[10px] text-neutral-500 font-black uppercase block leading-none mb-1">Tip</span>
                                 <span className="text-lg font-black text-gold-500">{m.prediction}</span>
                              </div>
                              <div className="bg-white/5 px-4 py-2 rounded-xl">
                                 <span className="text-[10px] text-neutral-500 font-black uppercase block leading-none mb-1">Kvota</span>
                                 <span className="text-lg font-black text-neutral-200">{m.odds.toFixed(2)}</span>
                              </div>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>

                {tip.analysis?.trim() && (
                  <div className="bg-white/[0.02] border-t border-white/5 p-8">
                     <h4 className="text-sm font-black uppercase tracking-widest text-neutral-500 mb-4 flex items-center gap-2">
                        <Info size={16} className="text-gold-500" /> Analiza Uz Tip
                     </h4>
                     <p className="text-neutral-400 text-sm leading-relaxed italic">
                        "{tip.analysis}"
                     </p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-20 glass rounded-[2.5rem]">
           <BarChart2 className="text-neutral-600 mx-auto mb-4" size={48} />
           <h3 className="text-xl font-bold mb-2">Trenutno nema dostupnih VIP tipova</h3>
           <p className="text-neutral-500">Novi tipovi se objavljuju svakog dana do 12:00h.</p>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-20 glass p-8 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
         <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 flex-shrink-0">
            <Trophy size={32} />
         </div>
         <div>
            <h3 className="text-xl font-bold mb-2">Savet za klađenje</h3>
            <p className="text-neutral-400 text-sm max-w-2xl">
               Preporučujemo disciplinovan units staking na sve VIP tipove. Naša statistika pokazuje da je ovo najsigurniji put do dugoročnog profita. Ne jurite gubitke.
            </p>
         </div>
      </div>
    </div>
  );
}

function Trophy(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
