import React, { useState, useEffect } from 'react';
import { mockTipsService } from '../services/mockTips';
import { GlobalStats } from '../types';
import { TrendingUp, Target, Award, BarChart3, PieChart, Activity, Zap } from 'lucide-react';
import { motion } from 'motion/react';

export default function Stats() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const s = await mockTipsService.getStats();
        setStats(s);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return mockTipsService.subscribe(fetchData);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">GLOBALNA <span className="gold-text">STATISTIKA</span></h1>
        <p className="text-neutral-400">Naši rezultati govore više od reči. Pratite real-time podatke naše uspešnosti.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {[
          { label: 'Uspešnost', value: `${stats?.successRate}%`, desc: 'Procena tačnih tipova', icon: <Target className="text-gold-500" /> },
          { label: 'Ukupno Tipova', value: stats?.totalTips, desc: 'Od osnivanja elita tima', icon: <BarChart3 className="text-gold-500" /> },
          { label: 'Prošli Tipovi', value: stats?.winCount, desc: 'Dobitni tiketi', icon: <Award className="text-gold-500" /> },
          { label: 'ROI (Povrat)', value: `+${stats?.roi}%`, desc: 'Povrat investicije', icon: <TrendingUp className="text-gold-500" /> },
        ].map((s, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-gold-500/30 transition-all"
          >
            <div className="flex items-center justify-between mb-6">
               <div className="p-3 bg-gold-500/10 rounded-2xl group-hover:scale-110 transition-transform">{s.icon}</div>
            </div>
            <div className="text-4xl font-display font-black mb-1">{s.value}</div>
            <div className="text-sm font-bold text-neutral-200 mb-2">{s.label}</div>
            <p className="text-xs text-neutral-500">{s.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass p-8 md:p-12 rounded-[3rem]">
           <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <Activity className="text-gold-500" /> Mesečni trend rasta
           </h2>
           <div className="h-64 flex items-end gap-2 md:gap-4">
              {Array.from({ length: 12 }).map((_, i) => {
                const height = 30 + Math.random() * 70;
                return (
                  <div key={i} className="flex-1 flex flex-col gap-2 items-center">
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ delay: i * 0.05, duration: 1 }}
                      className={`w-full rounded-t-xl transition-all ${i === 11 ? 'gold-gradient gold-glow' : 'bg-white/5'}`}
                    ></motion.div>
                    <span className="text-[8px] md:text-[10px] text-neutral-600 font-bold uppercase">{['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'][i]}</span>
                  </div>
                );
              })}
           </div>
        </div>

        <div className="glass p-8 md:p-12 rounded-[3rem] items-center justify-center flex flex-col text-center">
           <div className="relative w-48 h-48 mb-8">
              <svg className="w-full h-full transform -rotate-90">
                 <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-white/5" />
                 <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" 
                   strokeDasharray={502} 
                   strokeDashoffset={502 - (502 * (stats?.successRate || 0)) / 100}
                   className="text-gold-500"
                   strokeLinecap="round"
                 />
              </svg>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                 <div className="text-4xl font-display font-black leading-none">{stats?.successRate}%</div>
                 <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mt-1">WIN RATE</div>
              </div>
           </div>
           <h3 className="text-xl font-bold mb-4">Elite Preciznost</h3>
           <p className="text-neutral-400 text-sm italic">"Naš algoritam je usavršen tokom 5 godina iskustva na tržištu."</p>
        </div>
      </div>
    </div>
  );
}
