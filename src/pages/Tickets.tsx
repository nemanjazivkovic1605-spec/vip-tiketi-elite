import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Lock, TrendingUp, X, XCircle } from 'lucide-react';
import { mockTipsService } from '../services/mockTips';
import { footballApiService } from '../services/footballApiService';
import { Tip, TicketStatus } from '../types';
import { useAuth } from '../hooks/useAuth';
import {
  calculateTicketUnitsProfit,
  canReadVipAnalysis,
  getTicketKind,
  getTicketUnitsStake,
  isPredictionLockedForUser,
} from '../utils/tickets';

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

  if (status === TicketStatus.POSTPONED) {
    return {
      card: 'border-blue-400/25 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.10),transparent_38%),linear-gradient(180deg,rgba(10,16,24,0.90),rgba(8,8,8,0.94))] shadow-[0_14px_55px_rgba(0,0,0,0.38)] hover:border-blue-400/35',
      glow: 'bg-blue-400/10 blur-3xl opacity-50',
      badge: 'bg-blue-400/10 text-blue-300 border-blue-400/25',
      label: 'ODLOŽENO',
      icon: <AlertCircle size={16} />,
      odds: 'text-blue-200',
      totalBox: 'bg-blue-400/5 border-blue-400/15',
    };
  }

  if (status === TicketStatus.REFUND) {
    return {
      card: 'border-cyan-400/25 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_38%),linear-gradient(180deg,rgba(8,17,20,0.90),rgba(8,8,8,0.94))] shadow-[0_14px_55px_rgba(0,0,0,0.38)] hover:border-cyan-400/35',
      glow: 'bg-cyan-400/10 blur-3xl opacity-50',
      badge: 'bg-cyan-400/10 text-cyan-300 border-cyan-400/25',
      label: 'KVOTA 1 / POVRAT',
      icon: <AlertCircle size={16} />,
      odds: 'text-cyan-200',
      totalBox: 'bg-cyan-400/5 border-cyan-400/15',
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

const formatUnits = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}u`;

const isActiveLockedTicket = (tip: Tip) => tip.locked === true && tip.status === TicketStatus.PENDING;

const formatPublishedAt = (tip: Tip) => {
  const value = tip.publishedAt || tip.date;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return tip.date;
  return date.toLocaleString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function Tickets() {
  const { user, isVerified, canAccessFree, canAccessVip } = useAuth();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | TicketStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'vip' | 'free'>('all');
  const [selectedTip, setSelectedTip] = useState<Tip | null>(null);
  const [openAnalysisId, setOpenAnalysisId] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState('');
  const isRealApiMode = footballApiService.isRealApiMode();

  useEffect(() => {
    fetchData();
    return mockTipsService.subscribe(fetchData, { canAccessFree, canAccessVip });
  }, [canAccessFree, canAccessVip]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const allTips = await mockTipsService.getVisibleTips({ canAccessFree, canAccessVip });
      setTips(allTips);
    } finally {
      setLoading(false);
    }
  };

  const filteredTips = tips.filter((tip) => {
    const matchesStatus = filter === 'all' || tip.status === filter;
    const matchesType = typeFilter === 'all' || (typeFilter === 'vip' ? tip.isVip : !tip.isVip);
    return matchesStatus && matchesType;
  });

  const showVipPopup = (message: string) => {
    setAccessMessage(message);
  };

  const renderPrediction = (tip: Tip, prediction: string) => {
    const locked = isPredictionLockedForUser(tip, user, canAccessFree, canAccessVip);

    if (!locked) {
      return (
        <span className="rounded-xl bg-gold-500/12 border border-gold-400/20 px-3 py-1.5 text-sm font-black text-gold-300">
          {prediction}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          showVipPopup(tip.isVip
            ? 'Morate biti VIP član da biste videli VIP tip i analizu.'
            : 'Prijavite se i potvrdite email adresu da biste videli aktivan FREE tip.');
        }}
        className="relative rounded-xl border border-gold-400/20 bg-gold-500/10 px-4 py-2 text-sm font-black text-gold-300 transition-all hover:border-gold-400/40"
      >
        <span className="select-none blur-[4px]">GG 1X</span>
        <span className="absolute inset-0 flex items-center justify-center gap-1 text-[10px]">
          <Lock size={12} /> {tip.isVip ? 'VIP TIP' : 'ZAKLJUČANO'}
        </span>
      </button>
    );
  };

  const renderAnalysis = (tip: Tip) => {
    if (!tip.isVip) return null;

    const canRead = canReadVipAnalysis(tip, canAccessVip);
    const analysis = [tip.analysis, ...tip.matches.map((match) => match.analysis)]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join('\n\n');
    const isOpen = openAnalysisId === tip.id;

    return (
      <div className="rounded-2xl border border-gold-500/20 bg-gold-500/[0.05] p-4">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (!canRead) {
              showVipPopup('Morate biti VIP član da biste pročitali analizu.');
              return;
            }
            setOpenAnalysisId((current) => current === tip.id ? null : tip.id);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black/30 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gold-300 transition-all hover:bg-black/45"
        >
          <Lock size={14} />
          {canRead ? 'Pročitajte analizu' : 'Analizu mogu videti samo VIP članovi'}
        </button>
        {canRead && isOpen && (
          <p className="mt-4 whitespace-pre-line text-xs leading-7 text-neutral-300">
            {analysis || 'Analiza nije dodata za ovaj tip.'}
          </p>
        )}
        {!canRead && (
          <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            Postanite VIP član za pristup analizama i tačnim tipovima.
          </p>
        )}
      </div>
    );
  };

  const renderTicketBody = (tip: Tip, compact = false) => {
    const visuals = getTicketVisuals(tip.status);

    if (isActiveLockedTicket(tip)) {
      return (
        <div className={compact ? 'space-y-4' : 'p-6 space-y-5'}>
          <div className="rounded-2xl border border-gold-500/20 bg-black/25 p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10 text-gold-500">
              <Lock size={24} />
            </div>
            <h3 className="font-display text-xl font-black text-neutral-100">Meč zaključan</h3>
            <p className="mt-3 text-xs font-bold uppercase tracking-widest text-neutral-500">
              {tip.isVip ? 'VIP tip dostupan samo VIP članovima' : 'Registrujte se da biste videli FREE tip'}
            </p>
            <div className="mt-5 grid gap-3 text-left text-xs sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-500">Ticket code</span>
                <span className="font-display text-lg font-black text-gold-300">{tip.ticketCode || tip.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-500">Objavljeno</span>
                <span className="font-bold text-neutral-200">{formatPublishedAt(tip)}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={compact ? 'space-y-4' : 'p-6 space-y-5'}>
        {tip.matches.map((match, index) => (
          <div key={match.id || index} className="relative overflow-hidden rounded-2xl bg-black/22 border border-white/7 p-4 transition-colors hover:border-white/12">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span className="inline-flex items-center rounded-full bg-white/7 border border-white/10 px-3 py-1 text-[9px] text-neutral-300 uppercase font-black tracking-widest">
                {match.league || 'Liga'}
              </span>
              {match.result && (
                <span className="rounded-full bg-black/35 border border-white/10 px-3 py-1 text-[10px] font-display font-black text-neutral-200 tabular-nums">
                  {match.result.replace(':', ' - ')}
                </span>
              )}
            </div>

            <div className="font-display font-bold text-neutral-100 text-lg leading-tight">
              {match.homeTeam && match.awayTeam ? `${match.homeTeam} vs ${match.awayTeam}` : match.teams}
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Tip</span>
                {renderPrediction(tip, match.prediction)}
              </div>
              <div className="text-right">
                <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest mb-1">Kvota</div>
                <div className={`text-3xl font-display font-black leading-none ${visuals.odds}`}>{match.odds.toFixed(2)}</div>
              </div>
            </div>
          </div>
        ))}
        {renderAnalysis(tip)}
      </div>
    );
  };

  const selectedVisuals = selectedTip ? getTicketVisuals(selectedTip.status) : null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">TABELA <span className="gold-text">TIKETA</span></h1>
        <p className="text-neutral-400">Pregled svih aktivnih i završenih tiketa iz naše baze.</p>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest mr-2">Status</span>
          {['all', TicketStatus.PENDING, TicketStatus.WON, TicketStatus.LOST, TicketStatus.POSTPONED, TicketStatus.REFUND].map((statusFilter) => (
            <button
              key={statusFilter}
              onClick={() => setFilter(statusFilter as 'all' | TicketStatus)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                filter === statusFilter
                  ? 'bg-gold-500 text-black border-gold-500 shadow-lg shadow-gold-500/20'
                  : 'bg-white/5 text-neutral-400 border-white/10 hover:border-gold-500/30'
              }`}
            >
              {statusFilter === 'all'
                ? 'Sve'
                : statusFilter === TicketStatus.PENDING
                  ? 'Aktivni'
                  : statusFilter === TicketStatus.WON
                    ? 'Prošli'
                    : statusFilter === TicketStatus.LOST
                      ? 'Pali'
                      : statusFilter === TicketStatus.POSTPONED
                        ? 'Odloženi'
                        : 'Povrat'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest mr-2">Tip</span>
          {['all', 'free', 'vip'].map((ticketType) => (
            <button
              key={ticketType}
              onClick={() => setTypeFilter(ticketType as 'all' | 'vip' | 'free')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                typeFilter === ticketType
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 text-neutral-400 border-white/10 hover:border-gold-500/30'
              }`}
            >
              {ticketType === 'all' ? 'Svi' : ticketType.toUpperCase()}
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
              const profit = calculateTicketUnitsProfit(tip);

              return (
                <motion.div
                  layout
                  role="button"
                  tabIndex={0}
                  key={tip.id}
                  initial={{ opacity: 0, y: 18, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.97 }}
                  whileHover={{ y: -6 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  onClick={() => setSelectedTip(tip)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedTip(tip);
                  }}
                  className={`relative overflow-hidden rounded-[2rem] border text-left transition-all duration-500 cursor-pointer ${visuals.card}`}
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
                            {isActiveLockedTicket(tip) ? 'TIP OBJAVLJEN' : getTicketKind(tip.matches.length)}
                          </div>
                        </div>
                        <span className="text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]">
                          {formatPublishedAt(tip)} · {tip.ticketCode || tip.id.slice(0, 8).toUpperCase()} · {isActiveLockedTicket(tip) ? 'Aktivan tip' : `${tip.matches.length} ${tip.matches.length === 1 ? 'par' : 'parova'}`}
                        </span>
                      </div>

                      {tip.status === TicketStatus.WON && (
                        <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-green-400/10 text-green-300 border border-green-400/20">
                          <TrendingUp size={21} />
                        </div>
                      )}
                    </div>

                    {renderTicketBody(tip)}

                    <div className="relative px-6 pb-6 pt-1">
                      <div className={`rounded-2xl border px-5 py-4 flex items-center justify-between gap-4 ${visuals.totalBox}`}>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Ukupna kvota</span>
                          <span className={`text-3xl font-display font-black ${visuals.odds}`}>{isActiveLockedTicket(tip) ? '—' : tip.totalOdds.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Units</span>
                          <span className="text-base font-display font-bold text-neutral-200">{getTicketUnitsStake(tip).toFixed(2)}u</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">P/L</span>
                          <span className={`text-base font-display font-bold ${profit > 0 ? 'text-green-300' : profit < 0 ? 'text-red-300' : 'text-neutral-300'}`}>
                            {isActiveLockedTicket(tip) ? '—' : formatUnits(profit)}
                          </span>
                        </div>
                        <ChevronRight size={18} className="text-neutral-500" />
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
          <p className="text-neutral-500 font-bold">
            {tips.length === 0 ? 'Nema objavljenih tiketa' : 'Nema tiketa za izabrani filter.'}
          </p>
          {!user && (
            <Link to="/register?plan=free" className="mt-6 inline-flex rounded-2xl bg-gold-500 px-6 py-3 text-sm font-black text-black">
              Registruj se
            </Link>
          )}
          {isRealApiMode && tips.length === 0 && (
            <p className="text-neutral-600 text-xs font-bold uppercase tracking-widest mt-3">Trenutno nema dostupnih tiketa.</p>
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedTip && selectedVisuals && (
          <motion.div
            className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedTip(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              onClick={(event) => event.stopPropagation()}
              className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2rem] border p-6 md:p-8 ${selectedVisuals.card}`}
            >
              <button
                type="button"
                onClick={() => setSelectedTip(null)}
                className="absolute right-5 top-5 p-2 rounded-full bg-black/40 border border-white/10 text-neutral-400 hover:text-white transition-colors"
                aria-label="Zatvori detalje tiketa"
              >
                <X size={18} />
              </button>

              <div className={`pointer-events-none absolute -top-16 -right-14 h-52 w-52 rounded-full ${selectedVisuals.glow}`}></div>
              <div className="relative pr-12">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                    selectedTip.isVip ? 'bg-gold-500 text-black border-gold-300/70' : 'bg-white/5 text-neutral-300 border-white/10'
                  }`}>
                    {selectedTip.isVip ? 'VIP' : 'FREE'}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${selectedVisuals.badge}`}>
                    {selectedVisuals.icon}
                    {selectedVisuals.label}
                  </span>
                  <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-black/30 text-gold-300 border-gold-500/20">
                    {isActiveLockedTicket(selectedTip) ? 'TIP OBJAVLJEN' : getTicketKind(selectedTip.matches.length)}
                  </span>
                </div>

                <h2 className="text-3xl font-display font-black mb-2">Detalji tiketa</h2>
                <p className="text-xs text-neutral-500 font-black uppercase tracking-[0.22em] mb-7">
                  {formatPublishedAt(selectedTip)} · {selectedTip.ticketCode || selectedTip.id.slice(0, 8).toUpperCase()} · {isActiveLockedTicket(selectedTip) ? 'Aktivan tip' : `${selectedTip.matches.length} ${selectedTip.matches.length === 1 ? 'par' : 'parova'}`}
                </p>

                {renderTicketBody(selectedTip, true)}

                <div className={`mt-6 rounded-2xl border px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 ${selectedVisuals.totalBox}`}>
                  <div>
                    <div className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Ukupna kvota</div>
                    <div className={`text-3xl font-display font-black ${selectedVisuals.odds}`}>{isActiveLockedTicket(selectedTip) ? '—' : selectedTip.totalOdds.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Units</div>
                    <div className="text-xl font-display font-bold text-neutral-100">{getTicketUnitsStake(selectedTip).toFixed(2)}u</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Profit/Loss</div>
                    <div className={`text-xl font-display font-bold ${
                      calculateTicketUnitsProfit(selectedTip) > 0 ? 'text-green-300' : calculateTicketUnitsProfit(selectedTip) < 0 ? 'text-red-300' : 'text-neutral-300'
                    }`}>
                      {isActiveLockedTicket(selectedTip) ? '—' : formatUnits(calculateTicketUnitsProfit(selectedTip))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Status</div>
                    <div className="text-xl font-display font-bold text-neutral-100">{selectedVisuals.label.replace(/[✓✕⏳]/g, '').trim()}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {accessMessage && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAccessMessage('')}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              onClick={(event) => event.stopPropagation()}
              className="max-w-md rounded-[2rem] border border-gold-500/25 bg-neutral-950 p-7 text-center shadow-2xl shadow-gold-500/10"
            >
              <Lock className="mx-auto mb-4 text-gold-500" size={34} />
              <h3 className="mb-3 text-xl font-display font-black">VIP pristup</h3>
              <p className="text-sm leading-7 text-neutral-400">{accessMessage}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link to="/register" className="flex-1 rounded-2xl bg-gold-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-black">
                  Postani VIP
                </Link>
                <button
                  type="button"
                  onClick={() => setAccessMessage('')}
                  className="flex-1 rounded-2xl border border-white/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-neutral-300"
                >
                  Zatvori
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
