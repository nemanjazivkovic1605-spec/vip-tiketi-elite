import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Lock, TrendingUp, X, XCircle } from 'lucide-react';
import { mockTipsService } from '../services/mockTips';
import { Tip, TicketStatus } from '../types';
import { useAuth } from '../hooks/useAuth';
import DataLoadFailure from '../components/utils/DataLoadFailure';
import { withTimeout } from '../utils/async';
import {
  calculateTicketUnitsProfit,
  canReadVipAnalysis,
  formatTicketPublishedAt,
  getTicketKind,
  getTicketUnitsStake,
  isPredictionLockedForUser,
} from '../utils/tickets';

const getTicketVisuals = (status: TicketStatus) => {
  if (status === TicketStatus.WON) {
    return {
      card: 'border-green-400/35 bg-[#090d0b] shadow-[0_12px_34px_rgba(0,0,0,0.3)] hover:border-green-400/55 hover:shadow-[0_0_24px_rgba(34,197,94,0.1),0_14px_36px_rgba(0,0,0,0.34)]',
      glow: 'bg-green-400/[0.08] blur-2xl opacity-40',
      badge: 'bg-green-400/10 text-green-300 border-green-400/25',
      label: '✓ PROŠAO',
      icon: <CheckCircle2 size={16} />,
      odds: 'text-green-300',
      totalBox: 'bg-green-400/[0.06] border-green-400/15',
    };
  }

  if (status === TicketStatus.LOST) {
    return {
      card: 'border-red-400/35 bg-[#0e090a] shadow-[0_12px_34px_rgba(0,0,0,0.3)] hover:border-red-400/55',
      glow: 'bg-red-500/[0.06] blur-2xl opacity-35',
      badge: 'bg-red-500/10 text-red-300 border-red-500/25',
      label: '✕ PAO',
      icon: <XCircle size={16} />,
      odds: 'text-neutral-300',
      totalBox: 'bg-white/[0.03] border-white/10',
    };
  }

  if (status === TicketStatus.POSTPONED) {
    return {
      card: 'border-orange-300/35 bg-[#100c08] shadow-[0_12px_34px_rgba(0,0,0,0.3)] hover:border-orange-300/55',
      glow: 'bg-orange-300/[0.06] blur-2xl opacity-35',
      badge: 'bg-orange-300/10 text-orange-200 border-orange-300/25',
      label: 'ODLOŽENO',
      icon: <AlertCircle size={16} />,
      odds: 'text-orange-200',
      totalBox: 'bg-orange-300/[0.05] border-orange-300/15',
    };
  }

  if (status === TicketStatus.REFUND) {
    return {
      card: 'border-sky-300/30 bg-[#080d11] shadow-[0_12px_34px_rgba(0,0,0,0.3)] hover:border-sky-300/50',
      glow: 'bg-sky-300/[0.05] blur-2xl opacity-30',
      badge: 'bg-sky-300/10 text-sky-100 border-sky-300/25',
      label: 'KVOTA 1 / POVRAT',
      icon: <AlertCircle size={16} />,
      odds: 'text-sky-200',
      totalBox: 'bg-sky-300/[0.05] border-sky-300/15',
    };
  }

  return {
    card: 'border-orange-400/35 bg-[#100c08] shadow-[0_12px_34px_rgba(0,0,0,0.3)] hover:border-orange-300/55 hover:shadow-[0_0_22px_rgba(249,115,22,0.09),0_14px_36px_rgba(0,0,0,0.34)]',
    glow: 'bg-orange-400/[0.07] blur-2xl opacity-35',
    badge: 'bg-orange-400/12 text-orange-300 border-orange-400/30',
    label: '⏳ AKTIVAN',
    icon: <Clock size={16} />,
    odds: 'text-gold-300',
    totalBox: 'bg-gold-500/10 border-gold-400/20',
  };
};

const formatUnits = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}u`;

const getSportMeta = (league = '') => {
  const normalizedLeague = league.toLowerCase();

  if (/nba|euroleague|basket|aba liga|acb|ncaa|fiba|bsl|lega a/.test(normalizedLeague)) {
    return { icon: '🏀', label: 'Košarka' };
  }

  if (/tenis|tennis|atp|wta/.test(normalizedLeague)) {
    return { icon: '🎾', label: 'Tenis' };
  }

  if (/odboj|volley/.test(normalizedLeague)) {
    return { icon: '🏐', label: 'Odbojka' };
  }

  return { icon: '⚽', label: 'Fudbal' };
};

const isActiveLockedTicket = (tip: Tip) => tip.locked === true && tip.status === TicketStatus.PENDING;

const formatPublishedAt = formatTicketPublishedAt;
const AdminTicketEditor = lazy(() => import('../components/admin/AdminTicketEditor'));

export default function Tickets() {
  const { user, isVerified, isAdmin, canAccessFree, canAccessVip } = useAuth();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | TicketStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'vip' | 'free'>('all');
  const [selectedTip, setSelectedTip] = useState<Tip | null>(null);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);
  const [openAnalysisId, setOpenAnalysisId] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    void fetchData(true);
    return canAccessVip
      ? mockTipsService.subscribe(() => void fetchData(), { canAccessFree, canAccessVip })
      : mockTipsService.subscribePublicStats(() => void fetchData());
  }, [canAccessFree, canAccessVip]);

  const fetchData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setLoadError('');
    try {
      const allTips = await withTimeout(
        mockTipsService.getVisibleHistoryTips({ canAccessVip }),
        'Istorija se učitava predugo. Pokušajte ponovo.',
      );
      setTips(allTips);
    } catch (error) {
      console.error('History tickets load failed:', error);
      setLoadError(error instanceof Error ? error.message : 'Istorija trenutno nije dostupna.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const filteredTips = useMemo(() => tips.filter((tip) => {
    const matchesStatus = filter === 'all' || tip.status === filter;
    const matchesType = typeFilter === 'all' || (typeFilter === 'vip' ? tip.isVip : !tip.isVip);
    return matchesStatus && matchesType;
  }), [tips, filter, typeFilter]);

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
    const analysis = canRead
      ? [tip.analysis, ...tip.matches.map((match) => match.analysis)]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join('\n\n')
      : '';
    const isOpen = openAnalysisId === tip.id;

    return (
      <div className="border-t border-white/[0.08] pt-3">
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
          className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gold-300 transition-all hover:border-gold-500/40 hover:bg-gold-500/10"
        >
          {canRead ? <ChevronRight size={14} /> : <Lock size={14} />}
          Pogledaj analizu
        </button>
        {canRead && isOpen && (
          <p className="mt-4 whitespace-pre-line text-xs leading-7 text-neutral-300">
            {analysis || 'Analiza nije dodata za ovaj tip.'}
          </p>
        )}
      </div>
    );
  };

  const renderTicketBody = (tip: Tip, compact = false) => {
    const visuals = getTicketVisuals(tip.status);

    if (isActiveLockedTicket(tip)) {
      return (
        <div className={compact ? 'space-y-3' : 'space-y-3 px-4 pb-3'}>
          <div className="rounded-xl border border-gold-500/20 bg-black/25 p-4 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10 text-gold-500">
              <Lock size={20} />
            </div>
            <h3 className="font-display text-lg font-black text-neutral-100">Meč zaključan</h3>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              {tip.isVip ? 'VIP tip dostupan samo VIP članovima' : 'Registrujte se da biste videli FREE tip'}
            </p>
            <div className="mt-4 grid gap-2 text-left text-xs sm:grid-cols-2">
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
      <div className={compact ? 'space-y-3' : 'space-y-3 px-4 pb-3'}>
        {tip.matches.map((match, index) => {
          const sport = getSportMeta(match.league);

          return (
          <div key={match.id || index} className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3 transition-colors hover:border-white/15">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                <span className="text-gold-300">{sport.icon} {sport.label}</span>
                <span className="text-neutral-600">•</span>
                <span className="truncate text-neutral-400">{match.league || 'Liga'}</span>
              </div>
              {match.result && (
                <span className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] font-display font-black tabular-nums text-neutral-200">
                  {match.result.replace(':', ' - ')}
                </span>
              )}
            </div>

            <div className="font-display text-base font-bold leading-tight text-neutral-100">
              {match.homeTeam && match.awayTeam ? `${match.homeTeam} vs ${match.awayTeam}` : match.teams}
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Tip</span>
                {renderPrediction(tip, match.prediction)}
              </div>
              <div className="text-right">
                <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest mb-1">Kvota</div>
                <div className={`text-2xl font-display font-black leading-none ${visuals.odds}`}>{match.odds.toFixed(2)}</div>
              </div>
            </div>
          </div>
          );
        })}
        {renderAnalysis(tip)}
      </div>
    );
  };

  const selectedVisuals = selectedTip ? getTicketVisuals(selectedTip.status) : null;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-6 md:py-9">
      <div className="mb-7 text-center">
        <h1 className="mb-3 text-3xl font-display font-bold md:text-4xl">ISTORIJA <span className="gold-text">TIKETA</span></h1>
        <p className="text-neutral-400">Javni pregled svih završenih tiketa iz naše baze.</p>
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">Status</span>
          {['all', TicketStatus.PENDING, TicketStatus.WON, TicketStatus.LOST, TicketStatus.POSTPONED, TicketStatus.REFUND].map((statusFilter) => (
            <button
              key={statusFilter}
              onClick={() => setFilter(statusFilter as 'all' | TicketStatus)}
              className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${
                filter === statusFilter
                  ? 'border-gold-500 bg-gold-500 text-black shadow-[0_0_16px_rgba(245,124,0,0.14)]'
                  : 'border-white/10 bg-white/[0.04] text-neutral-400 hover:border-gold-500/30 hover:text-neutral-200'
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

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">Tip</span>
          {['all', 'free', 'vip'].map((ticketType) => (
            <button
              key={ticketType}
              onClick={() => setTypeFilter(ticketType as 'all' | 'vip' | 'free')}
              className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${
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
      ) : loadError && tips.length === 0 ? (
        <DataLoadFailure message={loadError} onRetry={() => void fetchData(true)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 md:gap-4">
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
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  onClick={() => {
                    if (isAdmin) {
                      setEditingTip(tip);
                      return;
                    }
                    setSelectedTip(tip);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      if (isAdmin) {
                        setEditingTip(tip);
                        return;
                      }
                      setSelectedTip(tip);
                    }
                  }}
                  className={`relative cursor-pointer overflow-hidden rounded-xl border text-left transition-all duration-300 ${visuals.card}`}
                >
                  <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full ${visuals.glow}`}></div>
                  <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3 p-4 pb-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest ${
                            tip.isVip ? 'bg-gold-500 text-black border-gold-300/70 shadow-[0_0_18px_rgba(245,124,0,0.28)]' : 'bg-white/5 text-neutral-300 border-white/10'
                          }`}>
                            {tip.isVip ? 'VIP' : 'FREE'}
                          </div>
                          <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest ${visuals.badge}`}>
                            {visuals.icon}
                            {visuals.label}
                          </div>
                          <div className="rounded-full border border-gold-500/20 bg-black/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-gold-300">
                            {isActiveLockedTicket(tip) ? 'TIP OBJAVLJEN' : getTicketKind(tip.matches.length)}
                          </div>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-neutral-500">
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

                    <div className="relative px-4 pb-4">
                      <div className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${visuals.totalBox}`}>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em]">Ukupna kvota</span>
                          <span className={`text-2xl font-display font-black ${visuals.odds}`}>{isActiveLockedTicket(tip) ? '—' : tip.totalOdds.toFixed(2)}</span>
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

      {filteredTips.length === 0 && !loading && !loadError && (
        <div className="text-center py-20 glass rounded-[3rem]">
          <p className="text-neutral-300 font-bold">
            {tips.length === 0 ? 'Javna istorija je trenutno u pripremi.' : 'Nema tiketa za izabrani filter.'}
          </p>
          {tips.length === 0 && (
            <p className="mx-auto mt-3 max-w-xl px-6 text-xs font-medium leading-6 text-neutral-500">
              Završeni tiketi će se prikazati čim javni indeks bude osvežen. Aktivni VIP sadržaj ostaje zaštićen.
            </p>
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
              <h3 className="mb-3 text-xl font-display font-black">Analiza je zaključana</h3>
              <p className="text-sm leading-7 text-neutral-400">{accessMessage}</p>
              <p className="mt-2 text-sm leading-7 text-neutral-400">
                Aktiviraj VIP pristup da pročitaš kompletnu analizu meča i razloge tipa.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link to="/#pricing" className="flex-1 rounded-2xl bg-gold-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-black">
                  Postani VIP član
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

      {isAdmin && editingTip && (
        <Suspense fallback={null}>
          <AdminTicketEditor
            tip={editingTip}
            onClose={() => setEditingTip(null)}
            onChanged={fetchData}
          />
        </Suspense>
      )}
    </div>
  );
}
