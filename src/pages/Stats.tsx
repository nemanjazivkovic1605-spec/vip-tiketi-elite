import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, BarChart3, ChevronRight, Lock, Target, TrendingUp, Zap } from 'lucide-react';
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
  if (status === TicketStatus.POSTPONED) return { label: 'ODLOŽENO', className: 'text-orange-200 bg-orange-400/10 border-orange-300/25' };
  if (status === TicketStatus.REFUND) return { label: 'KVOTA 1 / POVRAT', className: 'text-sky-100 bg-sky-300/10 border-sky-300/25' };
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
      const statsLoader = isAdmin
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
    return isAdmin
      ? mockTipsService.subscribe(() => void fetchData(false, statsFilter))
      : mockTipsService.subscribePublicStats(() => void fetchData(false, statsFilter));
  }, [isAdmin, statsFilter]);

  const selectedTicketRows = useMemo(() => ticketRows(selectedMonth?.tickets || []), [selectedMonth]);
  const hasPublicStats = Boolean(stats?.completedCount);

  const overviewCards = useMemo(() => [
    { label: 'Yield', value: hasPublicStats ? formatPercent(stats?.yield ?? 0) : '—', desc: 'Čist profit / ukupne units', icon: <TrendingUp className="text-gold-500" /> },
    { label: 'Hit Rate', value: hasPublicStats ? `${stats?.hitRate ?? 0}%` : '—', desc: 'Pogođeni / završeni tiketi', icon: <Target className="text-gold-500" /> },
    { label: 'Average Odds', value: hasPublicStats ? (stats?.averageOdds ?? 0).toFixed(2) : '—', desc: 'Prosečna kvota završenih tiketa', icon: <BarChart3 className="text-gold-500" /> },
    { label: 'Units Profit', value: hasPublicStats ? formatUnits(stats?.unitsProfit ?? 0) : '—', desc: 'Profit u jedinicama po tipu', icon: <Award className="text-gold-500" /> },
    { label: 'Profit RSD', value: hasPublicStats ? formatRsd(stats?.monthlyProfit ?? 0) : '—', desc: '1 unit = 1000 RSD', icon: <TrendingUp className="text-gold-500" /> },
    {
      label: 'Završeni Tiketi',
      value: hasPublicStats ? stats?.completedCount ?? 0 : '—',
      desc: hasPublicStats ? `${stats?.winCount ?? 0}W • ${stats?.lossCount ?? 0}L${stats?.refundCount ? ` • ${stats?.refundCount}V` : ''}` : 'Javni indeks je u pripremi',
      icon: <Zap className="text-gold-500" />,
    },
  ], [hasPublicStats, stats]);

  const freeVsVipOverview = useMemo(() => {
    const free = comparisonStats.free;
    const vip = comparisonStats.vip;

    if (!free || !vip || (!free.completedCount && !vip.completedCount)) return null;

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

      {!hasPublicStats && (
        <div className="mb-8 rounded-2xl border border-gold-500/20 bg-gold-500/[0.06] px-5 py-4 text-center">
          <p className="text-sm font-bold text-gold-100">Javna statistika je trenutno u pripremi.</p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">Rezultati će se prikazati čim javni indeks završenih tiketa bude osvežen.</p>
        </div>
      )}

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

      <section className="mb-5">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-400">Pregled po mesecima</p>
            <h2 className="mt-1 text-xl font-bold md:text-2xl">Mesečna statistika</h2>
          </div>
          <p className="hidden text-xs text-neutral-500 sm:block">Kliknite mesec za detaljan pregled.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {monthOptions.map((month) => (
            <button
              key={month.key}
              type="button"
              onClick={() => setSelectedMonth(month)}
              className={`rounded-xl border p-3.5 text-left transition-all ${
                selectedMonth?.key === month.key
                  ? 'border-gold-500/55 bg-gold-500/10 shadow-[0_0_18px_rgba(245,124,0,0.1)]'
                  : 'border-white/10 bg-white/[0.03] hover:border-gold-500/30 hover:bg-white/[0.05]'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-display text-base font-black capitalize text-neutral-100">{month.month}</span>
                <ChevronRight size={15} className="text-gold-500" />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-neutral-200">
                <div><span className="block text-[8px] font-black uppercase tracking-widest text-neutral-500">Tiketa</span>{month.totalTickets}</div>
                <div><span className="block text-[8px] font-black uppercase tracking-widest text-neutral-500">Prolaznost</span>{((month.wins / Math.max(month.totalTickets, 1)) * 100).toFixed(1)}%</div>
                <div><span className="block text-[8px] font-black uppercase tracking-widest text-neutral-500">Profit</span>{formatUnits(month.profitUnits)}</div>
                <div><span className="block text-[8px] font-black uppercase tracking-widest text-neutral-500">ROI</span>{formatPercent(month.roi)}</div>
              </div>
            </button>
          ))}
        </div>

        {monthOptions.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-neutral-500">
            Javni mesečni pregled je trenutno u pripremi.
          </div>
        )}
      </section>

      <div className="glass rounded-xl p-4 md:p-5">
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

          <div className="space-y-2 lg:hidden">
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
                  className={`w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left ${isAdmin ? 'cursor-pointer hover:border-gold-500/30' : ''}`}
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

          <div className="hidden lg:block">
            <table className="w-full text-xs">
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
