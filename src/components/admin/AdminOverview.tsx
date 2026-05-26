import { AlertTriangle, ChevronRight, Clock, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { motion } from 'motion/react';

type AdminOverviewProps = {
  userCount: number;
  activeVipCount: number;
  pendingCount: number;
  roi: number;
  matchCount: number;
  draftCount: number;
  publishedCount: number;
  onOpenApprovedUsers: () => void;
  onOpenPendingUsers: () => void;
  onOpenMatches: () => void;
  onOpenDraftTips: () => void;
  onOpenPublishedTips: () => void;
};

export default function AdminOverview({
  userCount,
  activeVipCount,
  pendingCount,
  roi,
  matchCount,
  draftCount,
  publishedCount,
  onOpenApprovedUsers,
  onOpenPendingUsers,
  onOpenMatches,
  onOpenDraftTips,
  onOpenPublishedTips,
}: AdminOverviewProps) {
  const summaryCards = [
    { label: 'Ukupno Korisnika', value: userCount, icon: <Users className="text-gold-500" /> },
    { label: 'Aktivni VIP', value: activeVipCount, icon: <ShieldCheck className="text-gold-500" />, onClick: onOpenApprovedUsers },
    { label: 'Novi Zahtevi', value: pendingCount, icon: <Clock className="text-gold-500" />, highlight: true, onClick: onOpenPendingUsers },
    { label: 'Mesečni ROI', value: `${roi >= 0 ? '+' : ''}${roi}%`, icon: <TrendingUp className="text-gold-500" /> },
  ];

  const navigationCards = [
    { label: 'Admin baza', value: matchCount, onClick: onOpenMatches },
    { label: 'DRAFT', value: draftCount, onClick: onOpenDraftTips },
    { label: 'PUBLISHED', value: publishedCount, onClick: onOpenPublishedTips, emphasize: true },
  ];

  return (
    <motion.div key="overview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <h2 className="text-3xl font-display font-bold mb-8">Pregled sistema</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {summaryCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            disabled={!card.onClick}
            className={`glass p-6 rounded-3xl text-left transition-all ${card.highlight ? 'border-gold-500/50' : 'border-white/5'} ${card.onClick ? 'cursor-pointer hover:border-gold-500/40 hover:shadow-[0_0_24px_rgba(245,124,0,0.12)]' : 'cursor-default'}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-white/5 rounded-xl">{card.icon}</div>
              {card.onClick && (
                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gold-500">
                  Pogledaj <ChevronRight size={12} />
                </span>
              )}
            </div>
            <div className="text-3xl font-display font-bold">{card.value}</div>
            <div className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">{card.label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {navigationCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className="glass p-5 rounded-2xl border-white/5 text-left cursor-pointer transition-all hover:border-gold-500/40 hover:shadow-[0_0_24px_rgba(245,124,0,0.12)]"
          >
            <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{card.label}</div>
            <div className="flex items-end justify-between gap-3">
              <div className={`text-2xl font-display font-bold ${card.emphasize ? 'text-gold-500' : ''}`}>{card.value}</div>
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gold-500">
                Pogledaj <ChevronRight size={12} />
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-green-500/10 border-green-500/20 border p-6 rounded-3xl flex items-center gap-4">
        <AlertTriangle className="text-green-500 shrink-0" size={32} />
        <div>
          <h4 className="font-bold text-green-500">Rucni import rezim</h4>
          <p className="text-sm text-neutral-400">
            Utakmice se uvoze iz CSV/Excel fajla i ostaju vidljive samo adminu. Public deo vidi samo objavljene tipove.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
