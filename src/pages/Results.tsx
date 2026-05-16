import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Calendar, CheckCircle2, Clock, RefreshCw, Search } from 'lucide-react';
import { MatchResult, MatchStatus } from '../types';

const today = new Date().toISOString().split('T')[0];

type PreviousResult = MatchResult & {
  prediction: string;
  odds: number;
  outcome: string;
};

const PREVIOUS_RESULTS: PreviousResult[] = [
  {
    id: 'previous-augsburg-monchengladbach-2026-05-09',
    competitionCode: 'BL1',
    homeTeam: 'Augsburg',
    awayTeam: 'B. Monchengladbach',
    league: 'Bundesliga',
    date: '2026-05-09',
    time: '15:30',
    status: MatchStatus.FINISHED,
    score: { home: 3, away: 1 },
    prediction: '1',
    odds: 1.98,
    outcome: 'PROŠLO',
  },
  {
    id: 'previous-lazio-inter-2026-05-09',
    competitionCode: 'SA',
    homeTeam: 'Lazio',
    awayTeam: 'Inter',
    league: 'Serie A',
    date: '2026-05-09',
    time: '18:00',
    status: MatchStatus.FINISHED,
    score: { home: 0, away: 3 },
    prediction: '2',
    odds: 1.9,
    outcome: 'PROŠLO',
  },
  {
    id: 'previous-lecce-juventus-2026-05-09',
    competitionCode: 'SA',
    homeTeam: 'Lecce',
    awayTeam: 'Juventus',
    league: 'Serie A',
    date: '2026-05-09',
    time: '20:45',
    status: MatchStatus.FINISHED,
    score: { home: 0, away: 1 },
    prediction: '2',
    odds: 1.42,
    outcome: 'PROŠLO',
  },
];

const COMPETITIONS = [
  { code: 'BL1', name: 'Bundesliga' },
  { code: 'SA', name: 'Serie A' },
];

const formatDate = (date: string) => {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
};

const MONTHS = [
  { label: 'Februar 2026', value: '2026-02', start: '2026-02-01', end: '2026-02-28' },
  { label: 'Mart 2026', value: '2026-03', start: '2026-03-01', end: '2026-03-31' },
  { label: 'April 2026', value: '2026-04', start: '2026-04-01', end: '2026-04-30' },
  { label: 'Maj 2026', value: '2026-05', start: '2026-05-01', end: today },
];

const getStatusMeta = (status: MatchStatus) => {
  switch (status) {
    case MatchStatus.LIVE:
      return { label: 'Uzivo', className: 'text-red-500', icon: <RefreshCw size={14} className="animate-spin" /> };
    case MatchStatus.FINISHED:
      return { label: 'Zavrseno', className: 'text-green-500', icon: <CheckCircle2 size={14} /> };
    case MatchStatus.POSTPONED:
      return { label: 'Odlozeno', className: 'text-red-400', icon: <AlertCircle size={14} /> };
    default:
      return { label: 'Zakazano', className: 'text-neutral-500', icon: <Clock size={14} /> };
  }
};

export default function Results() {
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedCompetition, setSelectedCompetition] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [teamFilter, setTeamFilter] = useState('');

  const filteredMatches = useMemo(() => {
    const normalizedTeam = teamFilter.trim().toLowerCase();
    const month = MONTHS.find((item) => item.value === selectedMonth);

    return PREVIOUS_RESULTS.filter((match) => {
      const matchesMonth = !month || (match.date >= month.start && match.date <= month.end);
      const matchesCompetition = selectedCompetition === 'all' || match.competitionCode === selectedCompetition;
      const matchesStatus = selectedStatus === 'all' || match.status === selectedStatus;
      const matchesTeam = !normalizedTeam
        || match.homeTeam.toLowerCase().includes(normalizedTeam)
        || match.awayTeam.toLowerCase().includes(normalizedTeam);

      return matchesMonth && matchesCompetition && matchesStatus && matchesTeam;
    });
  }, [selectedCompetition, selectedMonth, selectedStatus, teamFilter]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">PRETHODNI <span className="gold-text">REZULTATI</span></h1>
          <p className="text-neutral-400">Pregled zavrsenih utakmica, rezultata i statusa po ligama.</p>
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
          value={selectedCompetition}
          onChange={(event) => setSelectedCompetition(event.target.value)}
          className="bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-neutral-200 outline-none focus:border-gold-500/50"
        >
          <option value="all">Sve lige</option>
          {COMPETITIONS.map((competition) => (
            <option key={competition.code} value={competition.code}>{competition.name}</option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(event) => setSelectedStatus(event.target.value)}
          className="bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-neutral-200 outline-none focus:border-gold-500/50"
        >
          <option value="all">Svi statusi</option>
          <option value={MatchStatus.FINISHED}>Zavrseno</option>
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

      {filteredMatches.length > 0 ? (
        <div className="space-y-4">
          {filteredMatches.map((match) => {
            const status = getStatusMeta(match.status);

            return (
              <motion.div
                key={match.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass p-6 rounded-[2rem] hover:border-gold-500/20 transition-all"
              >
                <div className="grid md:grid-cols-[1fr_2fr_1fr] gap-5 md:items-center">
                  <div>
                    <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{match.league}</div>
                    <div className="flex items-center gap-3 text-xs text-neutral-500 font-bold">
                      <Calendar size={12} /> {formatDate(match.date)}
                      <Clock size={12} /> {match.time}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 text-right font-display text-xl font-bold">{match.homeTeam}</div>
                    <div className="bg-black/40 px-5 py-3 rounded-2xl border border-white/5 min-w-[90px] text-center font-display text-2xl font-black text-gold-500 tabular-nums">
                      {match.score ? `${match.score.home} - ${match.score.away}` : 'v'}
                    </div>
                    <div className="flex-1 text-left font-display text-xl font-bold">{match.awayTeam}</div>
                  </div>

                  <div className="flex md:justify-end items-center gap-3">
                    <div className="flex flex-wrap md:justify-end items-center gap-2">
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-[10px] font-black uppercase tracking-widest text-neutral-300">
                        Tip {match.prediction}
                      </span>
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-[10px] font-black uppercase tracking-widest text-gold-500">
                        {match.odds.toFixed(2)}
                      </span>
                      <span className="px-3 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-[10px] font-black uppercase tracking-widest text-green-500">
                        {match.outcome}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${status.className}`}>
                      {status.icon} {status.label}
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
          <p className="text-neutral-500 max-w-sm mx-auto">Promenite filtere ili pokusajte kasnije.</p>
        </div>
      )}
    </div>
  );
}
