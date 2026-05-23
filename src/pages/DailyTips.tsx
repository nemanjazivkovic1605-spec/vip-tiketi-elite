import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, BarChart3, CalendarDays, CircleDot, Dumbbell, Flame, Lock, ShieldCheck, Sparkles, Star, TrendingUp } from 'lucide-react';
import { DailyAnalysisItem } from '../types';
import { getDailyAnalysisDates } from '../utils/dailyDates';
import { dailyAnalysesService } from '../services/dailyAnalysesService';
import { useAuth } from '../hooks/useAuth';

const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
  });

const riskStyle = {
  LOW: 'border-green-500/25 bg-green-500/10 text-green-300',
  MEDIUM: 'border-gold-500/25 bg-gold-500/10 text-gold-300',
  HIGH: 'border-orange-500/25 bg-orange-500/10 text-orange-300',
};

const sportLabel = (sport?: string) => sport === 'basketball' ? 'KOŠARKA' : 'FUDBAL';

const SportIcon = ({ sport }: { sport?: string }) => (
  <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-gold-500/20 bg-gold-500/10 text-gold-300">
    {sport === 'basketball' ? <CircleDot size={15} /> : <Dumbbell size={15} />}
  </span>
);

const TeamLogo = ({ src, name }: { src?: string; name: string }) => (
  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
    {src ? (
      <img src={src} alt={name} className="h-8 w-8 object-contain" loading="lazy" />
    ) : (
      <span className="font-display text-base font-black text-gold-400">{name.slice(0, 1)}</span>
    )}
  </div>
);

const FormLine = ({ label, value }: { label: string; value?: number | null }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-neutral-500">
      <span>{label}</span>
      <span>{value === null || value === undefined ? 'Nedovoljno' : `${value}%`}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full ${value === null || value === undefined ? 'bg-neutral-700' : 'bg-gradient-to-r from-orange-500 to-gold-400'}`}
        style={{ width: value === null || value === undefined ? '30%' : `${value}%` }}
      />
    </div>
  </div>
);

const Metric = ({ label, value }: { label: string; value?: string | number }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
    <div className="text-[8px] font-black uppercase tracking-widest text-neutral-500">{label}</div>
    <div className="mt-1 text-xs font-black text-neutral-200">{value || 'Nedovoljno podataka'}</div>
  </div>
);

const LockedPanel = () => (
  <button
    type="button"
    onClick={() => alert('VIP analiza je dostupna samo aktivnim VIP članovima.')}
    className="relative min-h-[96px] w-full overflow-hidden rounded-2xl border border-gold-500/20 bg-gold-500/10 px-4 py-3 text-left transition-all hover:border-gold-500/40 hover:bg-gold-500/[0.14]"
  >
    <span className="block select-none text-sm leading-6 text-neutral-300 blur-[5px]">
      Detaljna VIP analiza, value ulaz, market signal i procena rizika dostupni su samo članovima.
    </span>
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-[10px] font-black uppercase tracking-widest text-gold-300">
      <Lock size={16} /> VIP analiza zaključana
    </span>
  </button>
);

const AnalysisCard = ({ item, canAccessVip }: { key?: React.Key; item: DailyAnalysisItem; canAccessVip: boolean }) => {
  const isVipLocked = item.access === 'VIP' && !canAccessVip;
  const hasOdds = Number.isFinite(Number(item.odds)) && Number(item.odds) > 1;
  const confidence = item.confidence || 0;
  const isElite = (item.badges || []).some((badge) => badge === 'ELITE PICK' || badge === 'HIGH VALUE');
  const risk = item.riskLevel || 'MEDIUM';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className={`group relative overflow-hidden rounded-[1.45rem] border bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-3.5 shadow-[0_14px_45px_rgba(0,0,0,0.34)] transition-all hover:-translate-y-0.5 md:p-4 ${
        isElite
          ? 'border-gold-500/35 shadow-[0_0_44px_rgba(245,124,0,0.14)]'
          : 'border-white/10 hover:border-gold-500/30 hover:shadow-[0_0_32px_rgba(245,124,0,0.1)]'
      }`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold-500/10 blur-3xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SportIcon sport={item.sport} />
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-neutral-300">
            {sportLabel(item.sport)}
          </span>
          <span className="max-w-[180px] truncate rounded-full border border-gold-500/20 bg-gold-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-gold-300 md:max-w-[260px]">
            {item.league}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest ${
            item.access === 'VIP'
              ? 'border-gold-500/45 bg-gold-500 text-black'
              : 'border-white/10 bg-white/5 text-neutral-300'
          }`}>
            {item.access}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-neutral-500">
          <CalendarDays size={12} /> {formatDate(item.date)} · {item.time || '--:--'}
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <TeamLogo src={item.homeLogo} name={item.homeTeam} />
          <div className="min-w-0 truncate font-display text-sm font-black text-white md:text-base">{item.homeTeam}</div>
        </div>
        <div className="rounded-full border border-gold-500/25 bg-gold-500/10 px-2.5 py-1 text-[9px] font-black text-gold-300">VS</div>
        <div className="flex min-w-0 items-center justify-end gap-2 text-right">
          <div className="min-w-0 truncate font-display text-sm font-black text-white md:text-base">{item.awayTeam}</div>
          <TeamLogo src={item.awayLogo} name={item.awayTeam} />
        </div>
      </div>

      <div className="relative mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_120px]">
        <FormLine label="Forma domaćina" value={item.homeFormPercent} />
        <FormLine label="Forma gosta" value={item.awayFormPercent} />
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-neutral-500">
            <span>Confidence</span>
            <span>{confidence ? `${confidence}%` : 'N/A'}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-orange-500" style={{ width: `${confidence || 35}%` }} />
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex flex-wrap gap-2">
        {(item.badges || []).map((badge) => (
          <span key={badge} className="inline-flex items-center gap-1 rounded-full border border-gold-500/25 bg-gold-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-gold-300">
            {badge === 'ELITE PICK' ? <Star size={11} /> : badge === 'HIGH VALUE' ? <Flame size={11} /> : <ShieldCheck size={11} />}
            {badge}
          </span>
        ))}
        <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest ${riskStyle[risk]}`}>
          Rizik: {risk === 'LOW' ? 'Nizak' : risk === 'MEDIUM' ? 'Srednji' : 'Visok'}
        </span>
      </div>

      <div className="relative mt-3 grid gap-2 md:grid-cols-[150px_1fr]">
        <div className="rounded-2xl border border-gold-500/20 bg-gold-500/[0.08] p-3">
          <div className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Predlog</div>
          {isVipLocked ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gold-300">
              <Lock size={13} /> VIP Pick
            </div>
          ) : (
            <div className="mt-1 font-display text-2xl font-black text-gold-300">{item.prediction}</div>
          )}
          <div className="mt-2 text-[8px] font-black uppercase tracking-widest text-neutral-500">Kvota</div>
          <div className="font-display text-xl font-black text-white">
            {isVipLocked ? 'VIP' : hasOdds ? item.odds.toFixed(2) : 'Kvota uskoro'}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <div className="mb-2 flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-neutral-500">
            <BarChart3 size={12} /> VIP analiza
          </div>
          {isVipLocked ? (
            <LockedPanel />
          ) : (
            <p className="text-sm leading-6 text-neutral-300">
              {item.reasoning || 'Analiza se priprema za ovaj meč.'}
            </p>
          )}
        </div>
      </div>

      <div className="relative mt-3 grid gap-2 sm:grid-cols-2">
        <Metric label={item.sport === 'basketball' ? 'Prosek poena' : 'Prosek golova'} value={item.averageTotal} />
        <Metric label="H2H" value={item.h2hNote} />
      </div>
    </motion.article>
  );
};

export default function DailyTips() {
  const { canAccessVip } = useAuth();
  const tabs = useMemo(() => getDailyAnalysisDates(), []);
  const [activeTab, setActiveTab] = useState(tabs[0].key);
  const [itemsByDate, setItemsByDate] = useState<Record<string, DailyAnalysisItem[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadAnalyses = async () => {
      setLoading(true);
      try {
        const entries = await Promise.all(
          tabs.map(async (tab) => [tab.date, await dailyAnalysesService.getForDate(tab.date)] as const),
        );
        if (!cancelled) setItemsByDate(Object.fromEntries(entries));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAnalyses();
    return () => {
      cancelled = true;
    };
  }, [tabs]);

  const activeDate = tabs.find((tab) => tab.key === activeTab)?.date || tabs[0].date;
  const activeItems = itemsByDate[activeDate] || [];

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100 md:px-6 md:py-10">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 max-w-4xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-gold-300">
            <Sparkles size={13} /> Premium value picks
          </div>
          <h1 className="font-display text-3xl font-black tracking-tight md:text-5xl">
            Dnevni <span className="gold-text">Tipovi</span>
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400 md:text-base">
            Svakodnevno izdvajamo najbolje mečeve i najstabilnije tipove dana na osnovu statistike, forme i tržišta kvota.
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl border px-3.5 py-2 text-[10px] font-black uppercase tracking-widest transition-all md:px-4 ${
                activeTab === tab.key
                  ? 'border-gold-500 bg-gold-500 text-black shadow-lg shadow-gold-500/20'
                  : 'border-white/10 bg-white/5 text-neutral-400 hover:border-gold-500/35 hover:text-gold-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-72 animate-pulse rounded-[1.45rem] border border-white/10 bg-white/[0.03]" />
            ))}
          </div>
        ) : activeItems.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {activeItems.map((item) => (
                <AnalysisCard key={item.id} item={item} canAccessVip={canAccessVip} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="rounded-[2rem] border border-white/10 bg-black/35 px-6 py-16 text-center">
            <TrendingUp className="mx-auto mb-4 text-gold-500" size={38} />
            <h2 className="font-display text-xl font-black text-white md:text-2xl">Trenutno nema dostupnih tipova za izabrani dan.</h2>
          </div>
        )}
      </section>
    </div>
  );
}
