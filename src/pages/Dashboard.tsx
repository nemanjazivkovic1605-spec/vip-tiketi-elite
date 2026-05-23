import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Award, ChevronRight, Clock, Lock, ShieldCheck, Target, TrendingUp, Zap } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { mockTipsService } from '../services/mockTips';
import { MembershipStatus, TicketStatus, Tip, GlobalStats } from '../types';
import AdminTicketEditor from '../components/admin/AdminTicketEditor';
import { formatTicketPublishedAt, isPredictionLockedForUser } from '../utils/tickets';

const isActiveLockedTicket = (tip: Tip) => tip.locked === true && tip.status === TicketStatus.PENDING;

const formatPublishedAt = formatTicketPublishedAt;

export default function Dashboard() {
  const { user, isAdmin, isApproved, canAccessFree, canAccessVip } = useAuth();
  const [recentTips, setRecentTips] = useState<Tip[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);

  const fetchData = async () => {
    try {
      const [visibleTips, s] = await Promise.all([
        mockTipsService.getVisibleTips({ canAccessFree, canAccessVip }),
        mockTipsService.getVisibleStats({ canAccessFree, canAccessVip }),
      ]);
      setRecentTips(visibleTips.slice(0, 3));
      setStats(s);
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-display font-bold mb-2">Zdravo, <span className="gold-text">{user?.displayName || 'Šampione'}</span>!</h1>
          <p className="text-neutral-400">Dobrodošao nazad u svoj profitabilni hub.</p>
        </div>

        <div className="flex items-center gap-3 p-4 glass rounded-3xl">
          <div className={`p-3 rounded-2xl ${isApproved ? 'bg-gold-500/10 text-gold-500' : 'bg-neutral-800 text-neutral-500'}`}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <div className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Status članarine</div>
            <div className={`text-sm font-bold ${isApproved ? 'text-gold-500' : 'text-neutral-400'}`}>
              {isApproved ? 'AKTIVAN VIP' : user?.membershipStatus === MembershipStatus.PENDING ? 'NA ČEKANJU' : 'ISTEKAO'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Win Rate', value: `${stats?.successRate ?? 0}%`, icon: <Target className="text-gold-500" /> },
          { label: 'Units Profit', value: `${(stats?.unitsProfit ?? 0) >= 0 ? '+' : ''}${stats?.unitsProfit ?? 0}u`, icon: <TrendingUp className="text-gold-500" /> },
          { label: 'Win Streak', value: `${stats?.winStreak ?? 0}`, icon: <Award className="text-gold-500" /> },
          { label: 'Ukupno Tipova', value: stats?.totalTips ?? 0, icon: <Zap className="text-gold-500" /> },
        ].map((s, i) => (
          <div key={i} className="glass p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-white/5 rounded-xl">{s.icon}</div>
              <div className="text-[10px] text-neutral-500 font-black uppercase tracking-tighter">Live Podaci</div>
            </div>
            <div className="text-2xl font-display font-bold mb-1">{s.value}</div>
            <div className="text-xs text-neutral-500 font-bold uppercase tracking-widest">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="text-gold-500" /> Poslednji rezultati
            </h2>
            <Link to="/tickets" className="text-sm text-gold-500 font-bold hover:underline flex items-center gap-1">
              Vidi sve <ChevronRight size={16} />
            </Link>
          </div>

          <div className="space-y-4">
            {recentTips.map((tip) => (
              <div
                key={tip.id}
                onClick={() => isAdmin && setEditingTip(tip)}
                className={`glass p-6 rounded-[2rem] hover:border-gold-500/20 transition-all group ${isAdmin ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${tip.isVip ? 'bg-gold-500 text-black' : 'bg-neutral-800 text-neutral-400'}`}>
                      {tip.isVip ? 'VIP' : 'FREE'}
                    </div>
                    <span className="text-xs text-neutral-500 font-medium">{formatPublishedAt(tip)} · {tip.ticketCode || tip.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <div className={`text-xs font-black uppercase tracking-widest ${
                    tip.status === TicketStatus.WON ? 'text-green-500' :
                    tip.status === TicketStatus.LOST ? 'text-red-500' : 'text-neutral-400'
                  }`}>
                    {tip.status}
                  </div>
                </div>

                <div className="space-y-4">
                  {isActiveLockedTicket(tip) ? (
                    <div className="rounded-2xl border border-gold-500/20 bg-black/25 p-5 text-center">
                      <Lock className="mx-auto mb-3 text-gold-500" size={24} />
                      <div className="font-display text-lg font-black">Meč zaključan</div>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        {tip.isVip ? 'VIP tip dostupan samo VIP članovima' : 'Registrujte se da biste videli FREE tip'}
                      </p>
                    </div>
                  ) : tip.matches.map((match, index) => {
                    const locked = isPredictionLockedForUser(tip, user, canAccessFree, canAccessVip);
                    return (
                      <div key={match.id || index} className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col">
                          <span className="font-bold text-neutral-200">
                            {match.homeTeam && match.awayTeam ? `${match.homeTeam} - ${match.awayTeam}` : match.teams}
                          </span>
                          <span className="text-[10px] text-neutral-500 uppercase tracking-widest">{match.league}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center min-w-[76px]">
                            <div className="text-[10px] text-neutral-500 uppercase font-black">Tip</div>
                            {locked ? (
                              <div className="inline-flex items-center gap-1 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gold-400">
                                <Lock size={12} /> VIP TIP
                              </div>
                            ) : (
                              <div className="text-sm font-bold text-gold-500">{match.prediction}</div>
                            )}
                          </div>
                          {match.result && (
                            <div className="bg-white/5 px-2 py-1 rounded-lg">
                              <div className="text-[9px] text-neutral-500 uppercase font-black text-center">Rez</div>
                              <div className="text-xs font-bold text-neutral-300">{match.result}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Link
                  to="/tickets"
                  onClick={(event) => event.stopPropagation()}
                  className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all group-hover:text-gold-500"
                >
                  Otvori tiket <ChevronRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          {!isApproved ? (
            <div className="glass p-8 rounded-[2.5rem] border-gold-500/30 gold-glow relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/10 blur-3xl -z-10"></div>
              <Zap className="text-gold-500 mb-6" size={40} />
              <h3 className="text-2xl font-bold mb-4">Postani VIP član</h3>
              <p className="text-neutral-400 text-sm leading-relaxed mb-8">
                {user?.membershipStatus === MembershipStatus.PENDING
                  ? 'Vaš nalog čeka odobrenje administratora.'
                  : 'Vaša VIP pretplata je istekla. Izaberite paket za obnovu.'}
              </p>
              <Link
                to="/#pricing"
                className="block w-full py-4 bg-gold-500 hover:bg-gold-600 text-black font-black rounded-2xl transition-all shadow-lg shadow-gold-500/20 text-center"
              >
                NADOGRADI NALOG
              </Link>
            </div>
          ) : (
            <div className="glass p-8 rounded-[2.5rem] border-white/5 relative overflow-hidden">
              <ShieldCheck className="text-gold-500 mb-6" size={40} />
              <h3 className="text-2xl font-bold mb-4">Elite VIP Pristup</h3>
              <p className="text-neutral-400 text-sm leading-relaxed mb-8">
                Vaša pretplata je aktivna do: <br />
                <span className="text-gold-500 font-bold">{user?.membershipExpDate || '15.06.2026'}</span>
              </p>
              <Link
                to="/vip-tips"
                className="block w-full py-4 bg-gold-500 hover:bg-gold-600 text-black font-black rounded-2xl transition-all shadow-lg shadow-gold-500/20 text-center uppercase tracking-tight"
              >
                PRISTUPI VIP-U
              </Link>
            </div>
          )}

          <div className="glass p-6 rounded-[2.5rem]">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Award className="text-gold-500" size={20} /> Podrška
            </h3>
            <p className="text-neutral-500 text-xs mb-6">Imate pitanje? Naš tim je tu za sve članove.</p>
            <Link to="/contact" className="block w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all text-center">
              Kontaktiraj podršku
            </Link>
          </div>
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
