import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, BarChart3, CalendarDays, CircleDot, Dumbbell, Flame, Lock, Pencil, ShieldCheck, Sparkles, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DailyAnalysisItem, DailyAnalysisStatus } from '../types';
import { getDailyAnalysisDates } from '../utils/dailyDates';
import { dailyAnalysesService, isQuickResultPredictionSupported } from '../services/dailyAnalysesService';
import { useAuth } from '../hooks/useAuth';
import DataLoadFailure from '../components/utils/DataLoadFailure';
import { withTimeout } from '../utils/async';
const DailyAnalysisEditModal = lazy(() => import('../components/admin/DailyAnalysisEditModal'));

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

const AccessWall = () => (
  <div className="relative overflow-hidden rounded-[2rem] border border-gold-500/20 bg-black/45 px-5 py-12 text-center shadow-[0_18px_50px_rgba(0,0,0,0.38)] backdrop-blur-sm sm:px-8 sm:py-16">
    <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-36 max-w-lg bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.16),transparent_68%)]" />
    <div className="relative mx-auto flex max-w-xl flex-col items-center">
      <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/35 bg-gold-500/10 text-gold-300 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
        <Lock size={25} />
      </span>
      <h2 className="font-display text-2xl font-black text-white sm:text-3xl">Tipovi su zaključani</h2>
      <p className="mt-3 max-w-md text-sm leading-7 text-neutral-400 sm:text-base">
        Registruj se ili se prijavi da otključaš današnje prognoze.
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col justify-center gap-3 sm:flex-row">
        <Link
          to="/login"
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-gold-500 px-6 py-3 text-[11px] font-black uppercase tracking-widest text-black shadow-[0_10px_28px_rgba(245,158,11,0.18)] transition hover:bg-gold-400"
        >
          Prijavi se
        </Link>
        <Link
          to="/register"
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-gold-500/30 bg-white/[0.04] px-6 py-3 text-[11px] font-black uppercase tracking-widest text-gold-300 transition hover:border-gold-500/55 hover:bg-gold-500/10"
        >
          Kreiraj nalog
        </Link>
      </div>
    </div>
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

const AnalysisCard = ({ item, canAccessVip, isAdmin, onEdit, onGenerateAi, isGeneratingAi, onResultSaved }: { key?: React.Key; item: DailyAnalysisItem; canAccessVip: boolean; isAdmin: boolean; onEdit: (analysis: DailyAnalysisItem) => void; onGenerateAi: (analysis: DailyAnalysisItem) => Promise<void>; isGeneratingAi: boolean; onResultSaved: () => Promise<void> }) => {
  const access = item.type || item.access;
  const isVipLocked = item.locked === true || (access === 'VIP' && !canAccessVip);
  const hasOdds = Number.isFinite(Number(item.odds)) && Number(item.odds) > 1;
  const confidence = item.confidence || 0;
  const isElite = (item.badges || []).some((badge) => badge === 'ELITE PICK' || badge === 'HIGH VALUE');
  const risk = item.riskLevel || 'MEDIUM';
  const homeTeam = item.homeTeam || 'Meč';
  const awayTeam = item.awayTeam || 'zaključan';
  const [homeScore, setHomeScore] = useState<number | ''>(item.homeScore ?? '');
  const [awayScore, setAwayScore] = useState<number | ''>(item.awayScore ?? '');
  const [manualStatus, setManualStatus] = useState<DailyAnalysisStatus>(item.status || 'ACTIVE');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const supportedPrediction = isQuickResultPredictionSupported(item.prediction || '');
  const showManualStatus = !supportedPrediction && homeScore !== '' && awayScore !== '';
  const analysisText = item.vipAnalysis || item.analysis || item.reasoning;

  useEffect(() => {
    setHomeScore(item.homeScore ?? '');
    setAwayScore(item.awayScore ?? '');
    setManualStatus(item.status || 'ACTIVE');
    setErrorMessage(null);
  }, [item.id, item.homeScore, item.awayScore, item.status]);

  const handleSaveResult = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setErrorMessage(null);

    if (homeScore === '' || awayScore === '') {
      setErrorMessage('Unesite rezultat za oba tima.');
      return;
    }

    setIsSaving(true);

    try {
      const patch: Partial<DailyAnalysisItem> = {
        homeScore,
        awayScore,
      };

      if (supportedPrediction) {
        patch.prediction = item.prediction;
      } else {
        patch.status = manualStatus;
      }

      await dailyAnalysesService.updateManualAnalysis(item.id, patch);
      await onResultSaved();
    } catch (error) {
      console.error('Failed to save daily analysis result:', error);
      setErrorMessage('Greška prilikom upisa rezultata.');
    } finally {
      setIsSaving(false);
    }
  };

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
            access === 'VIP'
              ? 'border-gold-500/45 bg-gold-500 text-black'
              : 'border-white/10 bg-white/5 text-neutral-300'
          }`}>
            {access}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-neutral-500">
          <CalendarDays size={12} /> {formatDate(item.date)} · {item.time || '--:--'}
          {isAdmin && (
            <>
              <button
                type="button"
                disabled={isGeneratingAi}
                onClick={(event) => {
                  event.stopPropagation();
                  void onGenerateAi(item);
                }}
                className="ml-2 inline-flex items-center gap-1 rounded-lg border border-gold-500/25 bg-gold-500/10 px-2 py-1 text-gold-300 hover:bg-gold-500/20 disabled:cursor-wait disabled:opacity-50"
              >
                <Sparkles size={11} /> {isGeneratingAi ? 'Generišem...' : 'Generiši AI analizu'}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(item);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-gold-500/25 bg-gold-500/10 px-2 py-1 text-gold-300 hover:bg-gold-500/20"
              >
                <Pencil size={11} /> Izmeni
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
        <div className="flex min-w-0 items-center gap-2">
          {!isVipLocked && <TeamLogo src={item.homeLogo} name={homeTeam} />}
          <div className="min-w-0 truncate font-display text-sm font-black text-white md:text-base">{homeTeam}</div>
        </div>
        <div className="rounded-full border border-gold-500/25 bg-gold-500/10 px-2.5 py-1 text-[9px] font-black text-gold-300">VS</div>
        <div className="flex min-w-0 items-center justify-end gap-2 text-right">
          <div className="min-w-0 truncate font-display text-sm font-black text-white md:text-base">{awayTeam}</div>
          {!isVipLocked && <TeamLogo src={item.awayLogo} name={awayTeam} />}
        </div>
      </div>

      {!isVipLocked && <div className="relative mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_120px]">
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
      </div>}

      {!isVipLocked && <div className="relative mt-3 flex flex-wrap gap-2">
        {(item.badges || []).map((badge) => (
          <span key={badge} className="inline-flex items-center gap-1 rounded-full border border-gold-500/25 bg-gold-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-gold-300">
            {badge === 'ELITE PICK' ? <Star size={11} /> : badge === 'HIGH VALUE' ? <Flame size={11} /> : <ShieldCheck size={11} />}
            {badge}
          </span>
        ))}
        <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest ${riskStyle[risk]}`}>
          Rizik: {risk === 'LOW' ? 'Nizak' : risk === 'MEDIUM' ? 'Srednji' : 'Visok'}
        </span>
      </div>}

      <div className={`relative mt-3 grid gap-2 ${(isVipLocked || analysisText) ? 'md:grid-cols-[150px_1fr]' : ''}`}>
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

        {(isVipLocked || analysisText) && <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <div className="mb-2 flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-neutral-500">
            <BarChart3 size={12} /> VIP analiza
          </div>
          {isVipLocked ? (
            <LockedPanel />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">
              {analysisText}
            </p>
          )}
        </div>}
      </div>

      {isAdmin && !isVipLocked && (
        <div className="relative mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              <span>Domaćin</span>
              <input
                type="number"
                min={0}
                value={homeScore}
                onChange={(event) => setHomeScore(event.target.value === '' ? '' : Number(event.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-gold-500/50"
              />
            </label>
            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              <span>Gost</span>
              <input
                type="number"
                min={0}
                value={awayScore}
                onChange={(event) => setAwayScore(event.target.value === '' ? '' : Number(event.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-gold-500/50"
              />
            </label>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveResult}
              className="inline-flex min-h-[46px] items-center justify-center rounded-2xl bg-gold-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black transition hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✔ Upiši rezultat
            </button>
          </div>

          <div className="mb-3 text-[10px] uppercase tracking-widest text-neutral-400">
            {supportedPrediction ? (
              'Sistem će automatski proceniti status za ovu prognozu.'
            ) : (
              'Tip nije podržan za automatsko računanje. Izaberite status ručno.'
            )}
          </div>

          {showManualStatus && (
            <label className="mb-3 flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              <span>Odaberite status</span>
              <select
                value={manualStatus}
                onChange={(event) => setManualStatus(event.target.value as DailyAnalysisStatus)}
                className="rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-gold-500/50"
              >
                <option value="WON">PROŠAO</option>
                <option value="LOST">PAO</option>
                <option value="POSTPONED">ODLOŽENO</option>
                <option value="REFUND">POVRAT</option>
              </select>
            </label>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-red-200">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {!isVipLocked && <div className="relative mt-3 grid gap-2 sm:grid-cols-2">
        <Metric label={item.sport === 'basketball' ? 'Prosek poena' : 'Prosek golova'} value={item.averageTotal} />
        <Metric label="H2H" value={item.h2hNote} />
      </div>}
    </motion.article>
  );
};

export default function DailyTips() {
  const { canAccessFree, canAccessVip, isAdmin } = useAuth();
  const tabs = useMemo(() => getDailyAnalysisDates(), []);
  const [activeTab, setActiveTab] = useState(tabs[0].key);
  const [itemsByDate, setItemsByDate] = useState<Record<string, DailyAnalysisItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingAnalysis, setEditingAnalysis] = useState<DailyAnalysisItem | null>(null);
  const [generatingAiId, setGeneratingAiId] = useState('');
  const [adminAiMessage, setAdminAiMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  const getAnalyses = useCallback(async () => withTimeout(Promise.all(
    tabs.map(async (tab) => [tab.date, await dailyAnalysesService.getForDate(tab.date, { canAccessFree, canAccessVip, isAdmin })] as const),
  ), 'Dnevni tipovi se učitavaju predugo. Pokušajte ponovo.'), [tabs, canAccessFree, canAccessVip, isAdmin]);

  useEffect(() => {
    let cancelled = false;

    const loadAnalyses = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const entries = await getAnalyses();
        if (!cancelled) setItemsByDate(Object.fromEntries(entries));
      } catch (error) {
        console.error('Daily tips load failed:', error);
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Dnevni tipovi trenutno nisu dostupni.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAnalyses();
    return () => {
      cancelled = true;
    };
  }, [getAnalyses]);

  const refreshAnalyses = async () => {
    setLoadError('');
    try {
      setItemsByDate(Object.fromEntries(await getAnalyses()));
    } catch (error) {
      console.error('Daily tips refresh failed:', error);
      setLoadError(error instanceof Error ? error.message : 'Dnevni tipovi trenutno nisu dostupni.');
    }
  };

  const saveAnalysis = async (analysis: DailyAnalysisItem) => {
    await dailyAnalysesService.saveManualAnalysis(analysis);
    await refreshAnalyses();
  };

  const deleteAnalysis = async (id: string) => {
    await dailyAnalysesService.deleteManualAnalysis(id);
    await refreshAnalyses();
  };

  const generateAiAnalysis = async (analysis: DailyAnalysisItem) => {
    setGeneratingAiId(analysis.id);
    setAdminAiMessage('');
    try {
      const source = await dailyAnalysesService.generateAiAnalysis(analysis);
      setAdminAiMessage(source === 'gemini'
        ? `AI analiza je generisana za ${analysis.homeTeam} - ${analysis.awayTeam}.`
        : `Gemini trenutno nije odgovorio; sačuvana je fallback analiza za ${analysis.homeTeam} - ${analysis.awayTeam}.`);
      await refreshAnalyses();
    } catch (error) {
      console.error('Daily tips AI generation failed:', error);
      setAdminAiMessage('Generisanje AI analize nije uspelo.');
    } finally {
      setGeneratingAiId('');
    }
  };

  const activeDate = tabs.find((tab) => tab.key === activeTab)?.date || tabs[0].date;
  const activeItems = itemsByDate[activeDate] || [];
  const hasDailyAccess = isAdmin || canAccessFree || canAccessVip;

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
          {isAdmin && adminAiMessage && (
            <p className="mt-4 rounded-xl border border-gold-500/20 bg-gold-500/10 px-4 py-3 text-xs font-bold text-gold-300">
              {adminAiMessage}
            </p>
          )}
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
        ) : !hasDailyAccess ? (
          <AccessWall />
        ) : loadError && activeItems.length === 0 ? (
          <DataLoadFailure message={loadError} onRetry={() => void refreshAnalyses()} />
        ) : activeItems.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {activeItems.map((item) => (
                <AnalysisCard key={item.id} item={item} canAccessVip={canAccessVip} isAdmin={isAdmin} onEdit={setEditingAnalysis} onGenerateAi={generateAiAnalysis} isGeneratingAi={generatingAiId === item.id} onResultSaved={refreshAnalyses} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="rounded-[2rem] border border-white/10 bg-black/35 px-6 py-16 text-center">
            <TrendingUp className="mx-auto mb-4 text-gold-500" size={38} />
            <h2 className="font-display text-xl font-black text-white md:text-2xl">Današnje analize se trenutno pripremaju.</h2>
          </div>
        )}
      </section>
      {isAdmin && editingAnalysis && (
        <Suspense fallback={null}>
          <DailyAnalysisEditModal
            analysis={editingAnalysis}
            onClose={() => setEditingAnalysis(null)}
            onSave={saveAnalysis}
            onDelete={deleteAnalysis}
          />
        </Suspense>
      )}
    </div>
  );
}
