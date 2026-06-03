import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Calendar, CheckCircle2, Clock, Search, XCircle } from 'lucide-react';
import { mockTipsService } from '../services/mockTips';
import { Match, TicketStatus, Tip } from '../types';
import { formatFirstMatchStartAt, formatTicketPublishedAt, getMatchEventTime, isPublicFinishedTicket } from '../utils/tickets';
import { useAuth } from '../hooks/useAuth';
import { formatLeagueName } from '../utils/leagueMapper';

type PublishedResult = {
  tip: Tip;
  match: Match;
};

const today = new Date().toISOString().split('T')[0];

const MONTHS = [
  { label: 'Februar 2026', value: '2026-02', start: '2026-02-01', end: '2026-02-28' },
  { label: 'Mart 2026', value: '2026-03', start: '2026-03-01', end: '2026-03-31' },
  { label: 'April 2026', value: '2026-04', start: '2026-04-01', end: '2026-04-30' },
  { label: 'Maj 2026', value: '2026-05', start: '2026-05-01', end: today },
];

const formatDate = (date: string) => {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
};

const statusLabel = (status: TicketStatus) => {
  if (status === TicketStatus.WON) return 'PROSLO';
  if (status === TicketStatus.LOST) return 'PALO';
  if (status === TicketStatus.POSTPONED) return 'ODLOŽENO';
  if (status === TicketStatus.REFUND) return 'POVRAT';
  return 'AKTIVAN';
};

const getStatusMeta = (status: TicketStatus) => {
  if (status === TicketStatus.WON) {
    return { className: 'text-green-500', badge: 'bg-green-500/10 border-green-500/20 text-green-500', icon: <CheckCircle2 size={14} /> };
  }

  if (status === TicketStatus.LOST) {
    return { className: 'text-red-500', badge: 'bg-red-500/10 border-red-500/20 text-red-500', icon: <XCircle size={14} /> };
  }

  if (status === TicketStatus.POSTPONED) {
    return { className: 'text-blue-500', badge: 'bg-blue-500/10 border-blue-500/20 text-blue-500', icon: <Clock size={14} /> };
  }

  if (status === TicketStatus.REFUND) {
    return { className: 'text-cyan-500', badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-500', icon: <XCircle size={14} /> };
  }

  return { className: 'text-neutral-500', badge: 'bg-white/5 border-white/10 text-neutral-400', icon: <Clock size={14} /> };
};

export default function Results() {
  const { canAccessVip } = useAuth();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const publishedTips = await mockTipsService.getVisibleHistoryTips({ canAccessVip });
        setTips(publishedTips);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
    return mockTipsService.subscribePublicStats(() => void fetchData());
  }, [canAccessVip]);

  const results = useMemo<PublishedResult[]>(() => {
    return tips
      .filter((tip) => isPublicFinishedTicket(tip.status))
      .flatMap((tip) => tip.matches.map((match) => ({ tip, match })));
  }, [tips]);

  const leagues = useMemo(() => {
    return Array.from(new Set(results.map(({ match }) => formatLeagueName(match.league)))).sort();
  }, [results]);

  const filteredResults = useMemo(() => {
    const normalizedTeam = teamFilter.trim().toLowerCase();
    const month = MONTHS.find((item) => item.value === selectedMonth);

    return results.filter(({ tip, match }) => {
      const matchesMonth = !month || (tip.date >= month.start && tip.date <= month.end);
      const matchesLeague = selectedLeague === 'all' || formatLeagueName(match.league) === selectedLeague;
      const matchesStatus = selectedStatus === 'all' || tip.status === selectedStatus;
      const matchesTeam = !normalizedTeam
        || match.homeTeam.toLowerCase().includes(normalizedTeam)
        || match.awayTeam.toLowerCase().includes(normalizedTeam);

      return matchesMonth && matchesLeague && matchesStatus && matchesTeam;
    });
  }, [results, selectedLeague, selectedMonth, selectedStatus, teamFilter]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">PRETHODNI <span className="gold-text">REZULTATI</span></h1>
          <p className="text-neutral-400">Pregled objavljenih tipova i njihovih zavrsenih rezultata.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mb-10">
        <select
          value={selectedMonth}
          onChange={(event) => setSelectedMonth(event.target.value)}
          className="bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-neutral-200 outline-none focus:border-gold-500/50"
        >
          <option value="all">Svi meseci</option>
          {MONTHS.map((month) => (
            <option key={month.value} value={month.value}>{month.label}</option>
          ))}
        </select>

        <select
          value={selectedLeague}
          onChange={(event) => setSelectedLeague(event.target.value)}
          className="bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-neutral-200 outline-none focus:border-gold-500/50"
        >
          <option value="all">Sve lige</option>
          {leagues.map((league) => (
            <option key={league} value={league}>{league}</option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(event) => setSelectedStatus(event.target.value)}
          className="bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-neutral-200 outline-none focus:border-gold-500/50"
        >
          <option value="all">Svi statusi</option>
          <option value={TicketStatus.WON}>PROSLO</option>
          <option value={TicketStatus.LOST}>PALO</option>
        </select>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" size={16} />
          <input
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            placeholder="Tim..."
            className="w-full bg-white/[0.02] border border-white/5 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold text-neutral-200 outline-none focus:border-gold-500/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredResults.length > 0 ? (
        <div className="space-y-4">
          {filteredResults.map(({ tip, match }) => {
            const status = getStatusMeta(tip.status);

            return (
              <motion.div
                key={`${tip.id}-${match.id || match.homeTeam}-${match.awayTeam}`}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass p-6 rounded-[2rem] hover:border-gold-500/20 transition-all"
              >
                <div className="grid md:grid-cols-[1fr_2fr_1fr] gap-5 md:items-center">
                  <div>
                    <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{formatLeagueName(match.league)}</div>
                    <div className="flex items-center gap-3 text-xs text-neutral-500 font-bold">
                      <Calendar size={12} /> Meč: {formatDate(tip.date)}
                      <Clock size={12} /> {getMatchEventTime(match)}
                    </div>
                    <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-gold-400">
                      Objavljeno: {formatTicketPublishedAt(tip)}
                    </div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                      Pocetak meca: {formatFirstMatchStartAt(tip)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 text-right font-display text-xl font-bold">{match.homeTeam}</div>
                    <div className="bg-black/40 px-5 py-3 rounded-2xl border border-white/5 min-w-[90px] text-center font-display text-2xl font-black text-gold-500 tabular-nums">
                      {match.result ? match.result.replace(':', ' - ') : '-'}
                    </div>
                    <div className="flex-1 text-left font-display text-xl font-bold">{match.awayTeam}</div>
                  </div>

                  <div className="flex md:justify-end items-center gap-3">
                    <div className="flex flex-wrap md:justify-end items-center gap-2">
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-[10px] font-black uppercase tracking-widest text-neutral-300">
                        Tip {match.prediction}
                      </span>
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-[10px] font-black uppercase tracking-widest text-gold-500">
                        {Number(match.odds).toFixed(2)}
                      </span>
                      <span className={`px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${status.badge}`}>
                        {statusLabel(tip.status)}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${status.className}`}>
                      {status.icon} {statusLabel(tip.status)}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-24 glass rounded-[3rem]">
          <AlertCircle className="text-neutral-700 mx-auto mb-4" size={44} />
          <h3 className="text-xl font-bold mb-2">Trenutno nema dostupnih rezultata.</h3>
          <p className="text-neutral-500 max-w-sm mx-auto">Objavljeni rezultati ce biti prikazani ovde kada ih admin objavi.</p>
        </div>
      )}
    </div>
  );
}
