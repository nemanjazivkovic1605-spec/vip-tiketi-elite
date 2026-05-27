import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Award, BarChart3, ChevronLeft, ChevronRight, Lock, Target, TrendingUp, Zap } from 'lucide-react';
import { mockTipsService } from '../services/mockTips';
import { GlobalStats, MonthlyStats, TicketStatus, Tip } from '../types';
import { getTicketUnitsStake, isPredictionLockedForUser } from '../utils/tickets';
import { useAuth } from '../hooks/useAuth';
import DataLoadFailure from '../components/utils/DataLoadFailure';
import { withTimeout } from '../utils/async';
const AdminTicketEditor = lazy(() => import('../components/admin/AdminTicketEditor'));

const formatPercent = (value = 0) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const formatUnits = (value = 0) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}u`;
const formatRsd = (value = 0) => `${value >= 0 ? '+' : ''}${value.toLocaleString('sr-RS')} RSD`;

const statusMeta = (status: TicketStatus) => {
  if (status === TicketStatus.WON) return { label: '✓ POGOĐENO', className: 'text-green-300 bg-green-500/10 border-green-500/20' };
  if (status === TicketStatus.LOST) return { label: '✕ PROMAŠENO', className: 'text-red-300 bg-red-500/10 border-red-500/20' };
  if (status === TicketStatus.POSTPONED) return { label: 'ODLOŽENO', className: 'text-blue-300 bg-blue-500/10 border-blue-500/20' };
  if (status === TicketStatus.REFUND) return { label: 'KVOTA 1 / POVRAT', className: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20' };
  return { label: 'AKTIVAN', className: 'text-neutral-400 bg-white/5 border-white/10' };
};

const ticketRows = (tickets: Tip[]) =>
  tickets.flatMap((tip) =>
    tip.matches.map((match, index) => ({
      id: `${tip.id}-${match.id || index}`,
      ticket: tip,
      match,
    })),
  );

export default function Stats() {
  const { user, isAdmin, canAccessFree, canAccessVip } = useAuth();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [comparisonStats, setComparisonStats] = useState<{ free: GlobalStats | null; vip: GlobalStats | null }>({ free: null, vip: null });
  const [statsFilter, setStatsFilter] = useState<'all' | 'free' | 'vip'>('all');
  const [selectedMonth, setSelectedMonth] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);
  const [loadError, setLoadError] = useState('');

  const fetchData = async (showLoading = false, filter: 'all' | 'free' | 'vip' = statsFilter) => {
    if (showLoading) setLoading(true);
    setLoadError('');
    try {
      const statsLoader = isAdmin || canAccessVip
        ? mockTipsService.getStats
        : mockTipsService.getPublicStats;

      const [nextStats, freeStats, vipStats] = await Promise.all([
        withTimeout(statsLoader(filter), 'Statistika se učitava predugo. Pokušajte ponovo.'),
        withTimeout(statsLoader('free'), 'Statistika FREE se učitava predugo.'),
        withTimeout(statsLoader('vip'), 'Statistika VIP se učitava predugo.'),
      ]);

      setStats(nextStats);
      setComparisonStats({ free: freeStats, vip: vipStats });
      setSelectedMonth((current) => {
        if (!current) return nextStats.monthlyBreakdown[0] || null;
        return nextStats.monthlyBreakdown.find((month) => month.key === current.key) || nextStats.monthlyBreakdown[0] || null;
      });
    } catch (error) {
      console.error('Statistics load failed:', error);
      setLoadError(error instanceof Error ? error.message : 'Statistika trenutno nije dostupna.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData(true, statsFilter);
    return isAdmin || canAccessVip
      ? mockTipsService.subscribe(() => void fetchData(false, statsFilter))
      : mockTipsService.subscribePublicStats(() => void fetchData(false, statsFilter));
  }, [isAdmin, canAccessVip, statsFilter]);

  const selectedTicketRows = useMemo(() => ticketRows(selectedMonth?.tickets || []), [selectedMonth]);

  const overviewCards = useMemo(() => [
    { label: 'Yield', value: formatPercent(stats?.yield ?? 0), desc: 'Čist profit / ukupne units', icon: <TrendingUp className="text-gold-500" /> },
    { label: 'Hit Rate', value: `${stats?.hitRate ?? 0}%`, desc: 'Pogođeni / završeni tiketi', icon: <Target className="text-gold-500" /> },
    { label: 'Average Odds', value: (stats?.averageOdds ?? 0).toFixed(2), desc: 'Prosečna kvota završenih tiketa', icon: <BarChart3 className="text-gold-500" /> },
    { label: 'Units Profit', value: formatUnits(stats?.unitsProfit ?? 0), desc: 'Profit u jedinicama po tipu', icon: <Award className="text-gold-500" /> },
    { label: 'Profit RSD', value: formatRsd(stats?.monthlyProfit ?? 0), desc: '1 unit = 1000 RSD', icon: <TrendingUp className="text-gold-500" /> },
    {
      label: 'Završeni Tiketi',
      value: stats?.completedCount ?? 0,
      desc: `${stats?.winCount ?? 0}W • ${stats?.lossCount ?? 0}L${stats?.refundCount ? ` • ${stats?.refundCount}V` : ''}`,
      icon: <Zap className="text-gold-500" />,
    },
  ], [stats]);

  const freeVsVipOverview = useMemo(() => {
    const free = comparisonStats.free;
    const vip = comparisonStats.vip;

    if (!free || !vip) return null;

    const vipYield = vip.yield ?? 0;
    const freeYield = free.yield ?? 0;
    const vipProfit = vip.unitsProfit ?? 0;
    const freeProfit = free.unitsProfit ?? 0;
    const yieldDelta = vipYield - freeYield;
    const profitDelta = vipProfit - freeProfit;

    return {
      free,
      vip,
      yieldDelta,
      profitDelta,
      premiumMultiplier: freeProfit !== 0 ? vipProfit / freeProfit : 0,
    };
  }, [comparisonStats]);

  const monthOptions = stats?.monthlyBreakdown || [];
  const selectedMonthIndex = monthOptions.findIndex((month) => month.key === selectedMonth?.key);
  const canGoPrevMonth = selectedMonthIndex > 0;
  const canGoNextMonth = selectedMonthIndex >= 0 && selectedMonthIndex < monthOptions.length - 1;

  const goToMonth = (direction: -1 | 1) => {
    if (!monthOptions.length) return;
    const nextIndex = Math.max(0, Math.min(monthOptions.length - 1, selectedMonthIndex + direction));
    setSelectedMonth(monthOptions[nextIndex]);
  };

  const selectedMonthHitRate = selectedMonth && selectedMonth.totalTickets > 0
    ? (selectedMonth.wins / selectedMonth.totalTickets) * 100
    : 0;

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (loadError && !stats) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <DataLoadFailure message={loadError} onRetry={() => void fetchData(true)} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">GLOBALNA <span className="gold-text">STATISTIKA</span></h1>
        <p className="text-neutral-400">Profesionalni tipsterski pregled kroz yield, hit rate i units profit.</p>
      </div>

      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {(['all','free','vip'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStatsFilter(option)}
            className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${
              statsFilter === option
                ? option === 'vip'
                  ? 'border-gold-500 bg-gold-500 text-black shadow-[0_0_24px_rgba(245,124,0,0.18)]'
                  : option === 'free'
                    ? 'border-emerald-400 bg-emerald-400/15 text-emerald-100 shadow-[0_0_24px_rgba(52,211,153,0.12)]'
                    : 'border-gold-500 bg-gold-500 text-black'
                : option === 'vip'
                  ? 'border-gold-500/20 bg-gold-500/8 text-gold-100 hover:border-gold-500/50 hover:bg-gold-500/12'
                  : option === 'free'
                    ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-100 hover:border-emerald-400/50 hover:bg-emerald-400/12'
                    : 'border-white/10 bg-white/5 text-neutral-300 hover:border-gold-500/30 hover:text-gold-300'
            }`}
          >
            {option === 'all' ? 'Svi' : option === 'free' ? 'Free' : 'VIP'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-12">
        {overviewCards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass p-4 md:p-5 rounded-[1.6rem] relative overflow-hidden group hover:border-gold-500/30 transition-all"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="p-2.5 bg-gold-500/10 rounded-2xl group-hover:scale-110 transition-transform">{card.icon}</div>
            </div>
            <div className="text-2xl md:text-3xl font-display font-black mb-1">{card.value}</div>
            <div className="text-xs md:text-sm font-bold text-neutral-200 mb-1">{card.label}</div>
            <p className="text-[11px] text-neutral-500">{card.desc}</p>
          </motion.div>
        ))}
      </div>

      {freeVsVipOverview && (
        <div className="mb-12 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="glass rounded-[2rem] border border-white/10 p-5 md:p-6">
            <p className="text-[10px] uppercase tracking-[0.35em] text-gold-400">FREE vs VIP</p>
            <h2 className="mt-2 text-xl md:text-2xl font-display font-black">Komparacija performansi</h2>
            <p className="mt-2 text-sm text-neutral-400">Brzo poređenje koliko VIP paketi nose veću dobit u odnosu na FREE tipove.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">FREE</div>
                <div className="mt-2 text-2xl font-display font-black text-neutral-100">{formatPercent(freeVsVipOverview.free.yield)}</div>
                <p className="mt-1 text-xs text-neutral-400">Yield • {formatUnits(freeVsVipOverview.free.unitsProfit)}</p>
              </article>
              <article className="rounded-2xl border border-gold-500/30 bg-gold-500/10 p-4 shadow-[0_0_30px_rgba(245,124,0,0.12)]">
                <div className="text-[10px] uppercase tracking-[0.3em] text-gold-300">VIP</div>
                <div className="mt-2 text-2xl font-display font-black text-gold-100">{formatPercent(freeVsVipOverview.vip.yield)}</div>
                <p className="mt-1 text-xs text-gold-100/90">Yield • {formatUnits(freeVsVipOverview.vip.unitsProfit)}</p>
              </article>
            </div>
          </div>

          <div className="glass rounded-[2rem] border border-gold-500/20 bg-gradient-to-br from-gold-500/8 via-transparent to-transparent p-5 md:p-6">
            <p className="text-[10px] uppercase tracking-[0.35em] text-gold-400">Marketing insight</p>
            <h3 className="mt-2 text-xl md:text-2xl font-display font-black text-neutral-100">VIP premium ima jači profitni doprinos</h3>
            <p className="mt-3 text-sm text-neutral-400">VIP paket daje {formatPercent(freeVsVipOverview.yieldDelta)} veći yield i {formatUnits(freeVsVipOverview.profitDelta)} veću dobit u odnosu na FREE segment.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">Yield razlika</div>
                <div className="mt-2 text-xl font-display font-black text-gold-300">{formatPercent(freeVsVipOverview.yieldDelta)}</div>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">Units razlika</div>
                <div className="mt-2 text-xl font-display font-black text-gold-300">{formatUnits(freeVsVipOverview.profitDelta)}</div>
              </article>
              <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">Premium faktor</div>
                <div className="mt-2 text-xl font-display font-black text-gold-300">{freeVsVipOverview.premiumMultiplier.toFixed(2)}x</div>
              </article>
            </div>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_1.25fr] gap-8">
        <div className="glass p-5 md:p-6 rounded-[2rem]">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 className="text-xl md:text-2xl font-bold flex items-center gap-3">
              <Activity className="text-gold-500" /> Mesečna statistika
            </h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => goToMonth(-1)} disabled={!canGoPrevMonth} className="rounded-xl border border-white/10 bg-white/5 p-2 text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"> <ChevronLeft size={16} /> </button>
              <button type="button" onClick={() => goToMonth(1)} disabled={!canGoNextMonth} className="rounded-xl border border-white/10 bg-white/5 p-2 text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"> <ChevronRight size={16} /> </button>
            </div>
          </div>

          <label className="mb-4 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
            <span>Izaberi mesec</span>
            <select
              value={selectedMonth?.key || ''}
              onChange={(event) => setSelectedMonth(monthOptions.find((month) => month.key === event.target.value) || null)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-gold-500/50"
            >
              {monthOptions.map((month) => (
                <option key={month.key} value={month.key}>{month.month}</option>
              ))}
            </select>
          </label>

          {selectedMonth ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Yield</div>
                <div className="mt-1 text-xl font-display font-black text-gold-300">{formatPercent(selectedMonth.yield)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Hit Rate</div>
                <div className="mt-1 text-xl font-display font-black text-gold-300">{selectedMonthHitRate.toFixed(1)}%</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Average Odds</div>
                <div className="mt-1 text-xl font-display font-black text-gold-300">{selectedMonth.averageOdds.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Units Profit</div>
                <div className="mt-1 text-xl font-display font-black text-gold-300">{formatUnits(selectedMonth.profitUnits)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Profit RSD</div>
                <div className="mt-1 text-xl font-display font-black text-gold-300">{formatRsd(selectedMonth.profitRsd)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Pogođeno / ukupno</div>
                <div className="mt-1 text-xl font-display font-black text-gold-300">{selectedMonth.wins} / {selectedMonth.totalTickets}</div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-neutral-500">Nema dostupnih meseci za prikaz.</div>
          )}

          <div className="mt-6 space-y-3">
            {(stats?.monthlyBreakdown || []).map((month) => (
              <button
                key={month.key}
                onClick={() => setSelectedMonth(month)}
                className={`w-full text-left rounded-2xl border p-3 transition-all ${
                  selectedMonth?.key === month.key
                    ? 'bg-gold-500/10 border-gold-500/40 shadow-[0_0_24px_rgba(245,124,0,0.12)]'
                    : 'bg-white/[0.03] border-white/10 hover:border-gold-500/30'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="font-display font-bold text-base capitalize">{month.month}</div>
                  <ChevronRight size={16} className="text-gold-500" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
                  <div><span className="block text-[9px] uppercase tracking-widest text-neutral-500">Tiketa</span>{month.totalTickets}</div>
                  <div><span className="block text-[9px] uppercase tracking-widest text-neutral-500">Hit Rate</span>{((month.wins / Math.max(month.totalTickets, 1)) * 100).toFixed(1)}%</div>
                  <div><span className="block text-[9px] uppercase tracking-widest text-neutral-500">Avg kvota</span>{month.averageOdds.toFixed(2)}</div>
                  <div><span className="block text-[9px] uppercase tracking-widest text-neutral-500">Profit RSD</span>{formatRsd(month.profitRsd)}</div>
                </div>
              </button>
            ))}

            {(stats?.monthlyBreakdown || []).length === 0 && (
              <div className="text-center py-10 text-neutral-500 font-bold">Nema završenih tiketa za statistiku.</div>
            )}
          </div>
        </div>

        <div className="glass p-5 md:p-6 rounded-[2rem]">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold">Detaljan pregled</h2>
              <p className="text-sm text-neutral-500 capitalize">{selectedMonth?.month || 'Izaberi mesec za detalje'}</p>
            </div>
            {selectedMonth && (
              <div className="text-right">
                <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Units P/L</div>
                <div className={`text-2xl font-display font-black ${selectedMonth.profitUnits >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatUnits(selectedMonth.profitUnits)}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {(stats?.monthlyBreakdown || []).map((month) => (
              <button
                key={month.key}
                onClick={() => setSelectedMonth(month)}
                className={`w-full text-left rounded-2xl border p-4 transition-all ${
                  selectedMonth?.key === month.key
                    ? 'bg-gold-500/10 border-gold-500/40 shadow-[0_0_24px_rgba(245,124,0,0.12)]'
                    : 'bg-white/[0.03] border-white/10 hover:border-gold-500/30'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="font-display font-bold text-lg capitalize">{month.month}</div>
                  <ChevronRight size={18} className="text-gold-500" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><span className="block text-neutral-500 uppercase font-black">Tiketa</span>{month.totalTickets}</div>
                  <div><span className="block text-neutral-500 uppercase font-black">P / F</span>{month.wins} / {month.losses}</div>
                  <div><span className="block text-neutral-500 uppercase font-black">Avg kvota</span>{month.averageOdds.toFixed(2)}</div>
                  <div><span className="block text-neutral-500 uppercase font-black">Profit u</span>{formatUnits(month.profitUnits)}</div>
                  <div><span className="block text-neutral-500 uppercase font-black">Profit RSD</span>{formatRsd(month.profitRsd)}</div>
                  <div><span className="block text-neutral-500 uppercase font-black">Yield</span>{formatPercent(month.yield)}</div>
                  <div><span className="block text-neutral-500 uppercase font-black">Povrat</span>{month.refunds}</div>
                  <div><span className="block text-neutral-500 uppercase font-black">Units</span>{month.unitsStaked.toFixed(2)}u</div>
                </div>
              </button>
            ))}

            {(stats?.monthlyBreakdown || []).length === 0 && (
              <div className="text-center py-12 text-neutral-500 font-bold">Nema završenih tiketa za statistiku.</div>
            )}
          </div>
        </div>

        <div className="glass p-6 md:p-8 rounded-[2.5rem]">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold">Detaljan pregled</h2>
              <p className="text-sm text-neutral-500 capitalize">{selectedMonth?.month || 'Izaberi mesec'}</p>
            </div>
            {selectedMonth && (
              <div className="text-right">
                <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Units P/L</div>
                <div className={`text-2xl font-display font-black ${selectedMonth.profitUnits >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatUnits(selectedMonth.profitUnits)}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 md:hidden">
            {selectedTicketRows.map((row) => {
              const meta = statusMeta(row.ticket.status);
              const locked = isPredictionLockedForUser(row.ticket, user, canAccessFree, canAccessVip);
              return (
                <motion.button
                  key={row.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => isAdmin && setEditingTip(row.ticket)}
                  className={`w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left ${isAdmin ? 'cursor-pointer hover:border-gold-500/30' : ''}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{row.ticket.date}</div>
                      <div className="mt-1 font-bold text-neutral-100">{row.match.homeTeam} - {row.match.awayTeam}</div>
                      <div className="mt-1 text-xs text-neutral-500">{row.match.league || 'Fudbal'}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${meta.className}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-black/25 p-3">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-500">Tip</span>
                      <span className="font-black text-gold-400">{locked ? 'VIP TIP' : row.match.prediction}</span>
                    </div>
                    <div className="rounded-xl bg-black/25 p-3">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-500">Kvota</span>
                      <span className="font-bold text-neutral-200">{row.match.odds.toFixed(2)}</span>
                    </div>
                    <div className="rounded-xl bg-black/25 p-3">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-500">Units</span>
                      <span className="font-bold text-neutral-200">{getTicketUnitsStake(row.ticket).toFixed(2)}u</span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-[10px] text-neutral-500 uppercase tracking-widest border-b border-white/10">
                  <th className="py-3 pr-4">Datum</th>
                  <th className="py-3 pr-4">Sport / Liga</th>
                  <th className="py-3 pr-4">Meč</th>
                  <th className="py-3 pr-4">Tip</th>
                  <th className="py-3 pr-4">Kvota</th>
                  <th className="py-3 pr-4">Units</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence mode="popLayout">
                  {selectedTicketRows.map((row) => {
                    const meta = statusMeta(row.ticket.status);
                    const locked = isPredictionLockedForUser(row.ticket, user, canAccessFree, canAccessVip);
                    return (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => isAdmin && setEditingTip(row.ticket)}
                        className={`hover:bg-white/[0.02] transition-colors ${isAdmin ? 'cursor-pointer' : ''}`}
                      >
                        <td className="py-4 pr-4 text-neutral-300 font-bold">{row.ticket.date}</td>
                        <td className="py-4 pr-4 text-neutral-400">{row.match.league || 'Fudbal'}</td>
                        <td className="py-4 pr-4 font-bold text-neutral-100">{row.match.homeTeam} - {row.match.awayTeam}</td>
                        <td className="py-4 pr-4 text-gold-400 font-black">
                          {locked ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1 text-[10px] uppercase tracking-widest">
                              <Lock size={12} /> VIP TIP
                            </span>
                          ) : row.match.prediction}
                        </td>
                        <td className="py-4 pr-4 text-neutral-200 font-bold">{row.match.odds.toFixed(2)}</td>
                        <td className="py-4 pr-4 text-neutral-200 font-bold">{getTicketUnitsStake(row.ticket).toFixed(2)}u</td>
                        <td className="py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${meta.className}`}>
                            {meta.label}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {!selectedMonth && (
            <div className="text-center py-16 text-neutral-500 font-bold">Izaberi mesec za detalje.</div>
          )}
        </div>
      </div>
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
