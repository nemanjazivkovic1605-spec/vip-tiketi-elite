import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Award, BarChart3, ChevronRight, Lock, PieChart, Target, TrendingUp, Zap } from 'lucide-react';
import { mockTipsService } from '../services/mockTips';
import { GlobalStats, MonthlyStats, TicketStatus, Tip } from '../types';
import { getTicketUnitsStake, isPredictionLockedForUser } from '../utils/tickets';
import { useAuth } from '../hooks/useAuth';
import AdminTicketEditor from '../components/admin/AdminTicketEditor';

const formatPercent = (value = 0) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const formatUnits = (value = 0) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}u`;
const formatRsd = (value = 0) => `${value >= 0 ? '+' : ''}${value.toLocaleString('sr-RS')} RSD`;

const statusMeta = (status: TicketStatus) => {
  if (status === TicketStatus.WON) return { label: '✓ POGOĐENO', className: 'text-green-300 bg-green-500/10 border-green-500/20' };
  if (status === TicketStatus.LOST) return { label: '✕ PROMAŠENO', className: 'text-red-300 bg-red-500/10 border-red-500/20' };
  if (status === TicketStatus.POSTPONED) return { label: 'ODLOŽENO', className: 'text-blue-300 bg-blue-500/10 border-blue-500/20' };
  return { label: 'KVOTA 1 / POVRAT', className: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20' };
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
  const [selectedMonth, setSelectedMonth] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);

  const fetchData = async () => {
    try {
      const nextStats = await mockTipsService.getVisibleStats({ canAccessFree, canAccessVip });
      setStats(nextStats);
      setSelectedMonth((current) => {
        if (!current) return nextStats.monthlyBreakdown[0] || null;
        return nextStats.monthlyBreakdown.find((month) => month.key === current.key) || nextStats.monthlyBreakdown[0] || null;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    return mockTipsService.subscribe(fetchData, { canAccessFree, canAccessVip });
  }, [canAccessFree, canAccessVip]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const overviewCards = [
    { label: 'Yield', value: formatPercent(stats?.yield ?? 0), desc: 'Čist profit / ukupne units', icon: <TrendingUp className="text-gold-500" /> },
    { label: 'ROI banke', value: formatPercent(stats?.roi ?? 0), desc: 'Povraćaj investicije', icon: <PieChart className="text-gold-500" /> },
    { label: 'Hit Rate', value: `${stats?.hitRate ?? 0}%`, desc: 'Pogođeni / završeni', icon: <Target className="text-gold-500" /> },
    { label: 'Average Odds', value: (stats?.averageOdds ?? 0).toFixed(2), desc: 'Prosek završenih tiketa', icon: <BarChart3 className="text-gold-500" /> },
    { label: 'Units Profit', value: formatUnits(stats?.unitsProfit ?? 0), desc: 'Profit u jedinicama', icon: <Award className="text-gold-500" /> },
    { label: 'Profit RSD', value: formatRsd(stats?.monthlyProfit ?? 0), desc: '1 unit = 1000 RSD', icon: <TrendingUp className="text-gold-500" /> },
    { label: 'Završeni Tiketi', value: stats?.completedCount ?? 0, desc: `${stats?.winCount ?? 0} / ${stats?.lossCount ?? 0} / ${stats?.refundCount ?? 0}`, icon: <Zap className="text-gold-500" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="text-center mb-14">
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">GLOBALNA <span className="gold-text">STATISTIKA</span></h1>
        <p className="text-neutral-400">Profesionalni tipsterski pregled kroz yield, ROI, hit rate i units profit.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {overviewCards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass p-7 rounded-[2rem] relative overflow-hidden group hover:border-gold-500/30 transition-all"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="p-3 bg-gold-500/10 rounded-2xl group-hover:scale-110 transition-transform">{card.icon}</div>
            </div>
            <div className="text-4xl font-display font-black mb-1">{card.value}</div>
            <div className="text-sm font-bold text-neutral-200 mb-2">{card.label}</div>
            <p className="text-xs text-neutral-500">{card.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid xl:grid-cols-[1fr_1.25fr] gap-8">
        <div className="glass p-6 md:p-8 rounded-[2.5rem]">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Activity className="text-gold-500" /> Mesečni zbirni pregled
          </h2>

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
                  <div><span className="block text-neutral-500 uppercase font-black">ROI</span>{formatPercent(month.roi)}</div>
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

          <div className="overflow-x-auto">
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
                  {selectedMonth && ticketRows(selectedMonth.tickets).map((row) => {
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
      {isAdmin && (
        <AdminTicketEditor
          tip={editingTip}
          onClose={() => setEditingTip(null)}
          onChanged={fetchData}
        />
      )}
    </div>
  );
}
