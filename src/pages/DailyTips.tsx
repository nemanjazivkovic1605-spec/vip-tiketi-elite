import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, CalendarDays, Lock, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { DailyAnalysisItem } from '../types';
import { apiFootballService, getDailyAnalysisDates } from '../services/apiFootballService';
import { dailyAnalysesService } from '../services/dailyAnalysesService';
import { useAuth } from '../hooks/useAuth';

const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const TeamLogo = ({ src, name }: { src?: string; name: string }) => (
  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
    {src ? (
      <img src={src} alt={name} className="h-10 w-10 object-contain" loading="lazy" />
    ) : (
      <span className="font-display text-lg font-black text-gold-400">{name.slice(0, 1)}</span>
    )}
  </div>
);

const FormBar = ({ label, value }: { label: string; value?: number | null }) => (
  <div>
    <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-neutral-500">
      <span>{label}</span>
      <span>{value === null || value === undefined ? 'Nedovoljno podataka' : `${value}%`}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full ${value === null || value === undefined ? 'w-1/4 bg-neutral-700' : 'bg-gradient-to-r from-orange-500 to-gold-400'}`}
        style={{ width: value === null || value === undefined ? '28%' : `${value}%` }}
      />
    </div>
  </div>
);

const LockedContent = ({ text }: { text: string }) => (
  <button
    type="button"
    onClick={() => alert('VIP analiza je dostupna samo aktivnim VIP članovima.')}
    className="relative w-full overflow-hidden rounded-2xl border border-gold-500/20 bg-gold-500/10 px-4 py-4 text-left"
  >
    <span className="select-none text-sm text-neutral-300 blur-[5px]">{text}</span>
    <span className="absolute inset-0 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-gold-300">
      <Lock size={15} /> VIP sadržaj zaključan
    </span>
  </button>
);

const AnalysisCard = ({ item, canAccessVip }: { key?: React.Key; item: DailyAnalysisItem; canAccessVip: boolean }) => {
  const isVipLocked = item.access === 'VIP' && !canAccessVip;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,124,0,0.15),transparent_34%),linear-gradient(180deg,rgba(18,18,18,0.96),rgba(5,5,5,0.96))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.35)] transition-all hover:-translate-y-1 hover:border-gold-500/35 hover:shadow-[0_0_45px_rgba(245,124,0,0.16)] md:p-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gold-500/10 blur-3xl transition-opacity group-hover:opacity-100" />

      <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-gold-300">
            {item.league}
          </span>
          <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
            item.access === 'VIP'
              ? 'border-gold-500/40 bg-gold-500 text-black'
              : 'border-white/10 bg-white/5 text-neutral-300'
          }`}>
            {item.access}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
          <CalendarDays size={13} /> {formatDate(item.date)} · {item.time || '--:--'}
        </div>
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-3xl border border-white/10 bg-black/25 p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <TeamLogo src={item.homeLogo} name={item.homeTeam} />
          <div className="font-display text-lg font-black leading-tight text-white">{item.homeTeam}</div>
        </div>
        <div className="rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1 text-[10px] font-black text-gold-300">VS</div>
        <div className="flex flex-col items-center gap-3 text-center">
          <TeamLogo src={item.awayLogo} name={item.awayTeam} />
          <div className="font-display text-lg font-black leading-tight text-white">{item.awayTeam}</div>
        </div>
      </div>

      <div className="relative mt-5 grid gap-4 md:grid-cols-2">
        <FormBar label="Forma domaćina" value={item.homeFormPercent} />
        <FormBar label="Forma gosta" value={item.awayFormPercent} />
      </div>

      {item.formNote && (
        <div className="relative mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-bold text-neutral-500">
          {item.formNote}
        </div>
      )}

      <div className="relative mt-5 grid gap-4 md:grid-cols-[160px_1fr]">
        <div className="rounded-2xl border border-gold-500/20 bg-gold-500/[0.08] p-4">
          <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-neutral-500">Predlog</div>
          {isVipLocked ? (
            <div className="inline-flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-xs font-black uppercase tracking-widest text-gold-300">
              <Lock size={14} /> VIP tip
            </div>
          ) : (
            <div className="font-display text-3xl font-black text-gold-300">{item.prediction}</div>
          )}
          <div className="mt-3 text-[9px] font-black uppercase tracking-widest text-neutral-500">Kvota</div>
          <div className="font-display text-2xl font-black text-white">{isVipLocked ? '--' : item.odds.toFixed(2)}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-neutral-500">
            <BarChart3 size={13} /> Statističko obrazloženje
          </div>
          {isVipLocked ? (
            <LockedContent text={item.reasoning || 'VIP analiza je zaključana za korisnike bez aktivne članarine.'} />
          ) : (
            <p className="text-sm leading-7 text-neutral-300">
              {item.reasoning || 'Analiza nije dodata za ovaj meč.'}
            </p>
          )}
        </div>
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
    <div className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-100">
      <section className="mx-auto max-w-7xl">
        <div className="mb-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-gold-300">
              <Sparkles size={14} /> API-Football real match feed
            </div>
            <h1 className="font-display text-4xl font-black tracking-tight md:text-6xl">
              Dnevne <span className="gold-text">Analize</span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-neutral-400">
              Aktuelni mečevi za danas, sutra i prekosutra iz realnog API feed-a, uz disciplinovane predloge tipova,
              procenu rizika i kratko statističko obrazloženje u Elite VIP Tips stilu.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/30 p-5">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
              <ShieldCheck size={14} className="text-gold-500" /> Filtrirane lige
            </div>
            <div className="flex flex-wrap gap-2">
              {apiFootballService.targetLeagues.map((league) => (
                <span key={league.id} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-neutral-300">
                  {league.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-2xl border px-5 py-3 text-xs font-black uppercase tracking-widest transition-all ${
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
          <div className="grid gap-5 lg:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-96 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.03]" />
            ))}
          </div>
        ) : activeItems.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {activeItems.map((item) => (
                <AnalysisCard key={item.id} item={item} canAccessVip={canAccessVip} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="rounded-[2.5rem] border border-white/10 bg-black/35 px-6 py-20 text-center">
            <TrendingUp className="mx-auto mb-5 text-gold-500" size={42} />
            <h2 className="font-display text-2xl font-black text-white">Trenutno nema dostupnih analiza.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-neutral-500">
              API trenutno ne vraća utakmice iz izabranih liga za ovaj dan, a admin nije dodao ručne analize.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
