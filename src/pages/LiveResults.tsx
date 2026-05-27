import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { resultsProvider } from '../services/resultsProvider';
import { MatchResult, MatchStatus } from '../types';
import { Calendar, RefreshCw, Trophy, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

export default function LiveResults() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    setLoading(true);
    const matchesForDate = await resultsProvider.getMatchesForDate(selectedDate);
    setMatches(matchesForDate);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const getStatusColor = (status: MatchStatus) => {
    switch (status) {
      case MatchStatus.LIVE: return 'text-red-500 animate-pulse';
      case MatchStatus.FINISHED: return 'text-green-500';
      case MatchStatus.SCHEDULED: return 'text-neutral-500';
      default: return 'text-neutral-500';
    }
  };

  const getStatusIcon = (status: MatchStatus) => {
    switch (status) {
      case MatchStatus.LIVE: return <RefreshCw size={14} className="animate-spin" />;
      case MatchStatus.FINISHED: return <CheckCircle2 size={14} />;
      case MatchStatus.SCHEDULED: return <Clock size={14} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">UZIVO <span className="gold-text">REZULTATI</span></h1>
          <p className="text-neutral-400">Pratite najnovije rezultate i stats direktno sa terena. Podaci se azuriraju u realnom vremenu.</p>
        </div>

        <div className="flex items-center gap-4 bg-white/[0.02] p-2 rounded-2xl border border-white/5">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent border-none text-sm font-bold text-neutral-200 outline-none p-2 cursor-pointer"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40">
           <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin mb-4"></div>
           <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">Ucitavanje rezultata...</p>
        </div>
      ) : matches.length > 0 ? (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {matches.map((match) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass p-6 md:p-8 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 hover:border-white/10 transition-colors"
                layout
              >
                <div className="flex flex-col gap-1 w-full md:w-1/4">
                  <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{match.league}</div>
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
                    <Calendar size={12} /> {match.date}
                    <Clock size={12} className="ml-2" /> {match.time}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-8 flex-1 w-full">
                  <div className="flex-1 text-right font-display text-xl md:text-2xl font-bold">{match.homeTeam}</div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-black/40 px-6 py-3 rounded-2xl border border-white/5 min-w-[100px] text-center font-display text-3xl font-black text-gold-500 tabular-nums">
                      {match.score ? `${match.score.home} - ${match.score.away}` : 'v'}
                    </div>
                    <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter ${getStatusColor(match.status)}`}>
                      {getStatusIcon(match.status)} {match.status}
                    </div>
                  </div>
                  <div className="flex-1 text-left font-display text-xl md:text-2xl font-bold">{match.awayTeam}</div>
                </div>

                <div className="hidden lg:flex w-1/4 justify-end">
                   {match.status === MatchStatus.FINISHED && (
                     <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-500 text-[10px] font-black uppercase">
                        <Trophy size={14} /> Zavrsen mec
                     </div>
                   )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-32 glass rounded-[3rem]">
           <AlertCircle className="text-neutral-700 mx-auto mb-4" size={48} />
           <h3 className="text-xl font-bold mb-2">Trenutno nema dostupnih rezultata.</h3>
           <p className="text-neutral-500 max-w-sm mx-auto">Za izabrani datum ({selectedDate}) nema dostupnih rezultata.</p>
           <button
             onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
             className="mt-8 text-gold-500 font-bold uppercase text-xs tracking-widest hover:underline"
           >
             Vrati se na danasnje rezultate
           </button>
        </div>
      )}
    </div>
  );
}
