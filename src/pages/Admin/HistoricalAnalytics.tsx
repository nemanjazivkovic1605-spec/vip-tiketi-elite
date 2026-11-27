import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Database, ListFilter, RefreshCw, Search, Trophy, Users, X, ChartNoAxesCombined } from 'lucide-react';
import { analyticsRequest } from '../../services/admin/footballAnalyticsService';
import type { HistoricalFilters, HistoricalOverview } from '../../types/historicalAnalytics';
import HistoricalCoverage from '../../components/admin/analytics/HistoricalCoverage';
import HistoricalMetrics from '../../components/admin/analytics/HistoricalMetrics';
import HistoricalImportControls from '../../components/admin/analytics/HistoricalImportControls';
import HistoricalTeams from '../../components/admin/analytics/HistoricalTeams';
import AnalyticsMatchTable from '../../components/admin/analytics/AnalyticsMatchTable';
import AnalyticsWorkspace, { AnalyticsTabs, analyticsCommand as command, analyticsInput as input } from '../../components/admin/analytics/AnalyticsWorkspace';

type View = 'matches' | 'statistics' | 'teams' | 'data';
const views: Array<{ value: View; label: string; icon: typeof ListFilter }> = [
  { value: 'matches', label: 'Utakmice', icon: ListFilter },
  { value: 'statistics', label: 'Statistika', icon: ChartNoAxesCombined },
  { value: 'teams', label: 'Klubovi / H2H', icon: Users },
  { value: 'data', label: 'Baza i uvoz', icon: Database },
];

export default function HistoricalAnalytics() {
  const [league, setLeague] = useState('');
  const [season, setSeason] = useState('');
  const [tier, setTier] = useState('');
  const [team, setTeam] = useState('');
  const [search, setSearch] = useState('');
  const [against, setAgainst] = useState('');
  const [view, setView] = useState<View>('matches');
  const [overview, setOverview] = useState<HistoricalOverview | null>(null);
  const [error, setError] = useState('');
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const filters: HistoricalFilters = useMemo(() => ({ ...(league ? { league } : {}), ...(season ? { season } : {}), ...(tier ? { tier: Number(tier) } : {}), ...(team ? { team } : {}), ...(against ? { against } : {}) }), [league, season, tier, team, against]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSchemaMissing(false);
    const params = Object.fromEntries(Object.entries({ ...filters, offset }).map(([key, value]) => [key, String(value)]));
    analyticsRequest<HistoricalOverview>('historical-overview', params, 'GET', controller.signal)
      .then(value => { if (!controller.signal.aborted) setOverview(value); })
      .catch(value => {
        if (controller.signal.aborted) return;
        setOverview(null);
        setSchemaMissing(value instanceof Error && 'status' in value && value.status === 409);
        setError(value instanceof Error ? value.message : 'Baza trenutno nije dostupna.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, offset, revision]);
  const migrate = async () => {
    if (migrating) return;
    setMigrating(true); setError('');
    try { await analyticsRequest('migrate', {}, 'POST'); refresh(); }
    catch (value) { setError(value instanceof Error ? value.message : 'Inicijalizacija nije uspela.'); }
    finally { setMigrating(false); }
  };
  const selectLeague = (value: string) => { setLeague(value); setTier(''); setOffset(0); };
  const selectTeam = (id: string, name: string) => { setTeam(id); setSearch(name); setAgainst(''); setOffset(0); setView('teams'); };
  const resetTeam = () => { setTeam(''); setSearch(''); setAgainst(''); setOffset(0); };
  const selectedLeague = overview?.catalog.find(row => row.id === league);
  const hasFilters = !!(league || season || tier || team || against);

  return <AnalyticsWorkspace>
    <main className="mx-auto max-w-[1560px] px-3 py-5 sm:px-4 lg:px-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><p className="mb-1 text-[10px] font-semibold uppercase text-gold-400">Fudbal · Engleska</p><h1 className="text-xl font-bold sm:text-2xl">Rezultati i H2H</h1><p className="mt-1 text-xs text-neutral-500">Engleske lige · rangovi 1–7 · sezone 2023/24–2026/27</p></div>
        <button type="button" className={command} onClick={refresh} disabled={loading} title="Osveži pregled"><RefreshCw size={14} className={loading ? 'motion-safe:animate-spin' : ''} /><span className="hidden sm:inline">Osveži</span></button>
      </div>
      {error && <div role="alert" className="mb-4 space-y-3 rounded-md border border-amber-500/25 p-4 text-sm text-amber-200"><p>{error}</p>{schemaMissing && <button type="button" className={command} disabled={migrating} onClick={() => void migrate()}><Database size={15} />{migrating ? 'Inicijalizacija…' : 'Inicijalizuj odvojenu analitičku šemu'}</button>}</div>}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[216px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden self-start border-r border-[#292929] pr-4 lg:sticky lg:top-4 lg:block">
          <h2 className="mb-3 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase text-neutral-500"><Trophy size={14} />Engleske lige</h2>
          <nav aria-label="Izbor istorijske lige" className="space-y-1">
            <button type="button" onClick={() => selectLeague('')} aria-current={!league ? 'true' : undefined} className={`flex min-h-10 w-full items-center rounded-md px-2 text-left text-xs ${!league ? 'bg-gold-500/10 font-semibold text-gold-300' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>Sve engleske lige</button>
            {overview?.catalog.map(row => <button key={row.id} type="button" aria-current={league === row.id ? 'true' : undefined} onClick={() => selectLeague(row.id)} className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${league === row.id ? 'bg-gold-500/10 font-semibold text-gold-300' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] ${league === row.id ? 'bg-gold-500/15' : 'bg-[#222] text-neutral-500'}`}>{row.tier}</span><span className="leading-5">{row.name}</span></button>)}
          </nav>
          <div className="mt-5 border-t border-[#292929] px-2 pt-4 text-[11px] leading-5 text-neutral-500"><p>Broj označava rang lige.</p><p className="mt-2">Nepokrivene lige i nedostajući podaci navedeni su u pregledu baze.</p><button type="button" onClick={() => setView('data')} className="mt-2 inline-flex items-center gap-1 text-gold-300 hover:text-gold-200">Pokrivenost i izvori<ChevronRight size={13} /></button></div>
        </aside>
        <div className="min-w-0">
          <form className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto_minmax(120px,1fr)_auto]" onSubmit={event => { event.preventDefault(); setTeam(search); setAgainst(''); setOffset(0); }}>
            <select aria-label="Istorijska liga" value={league} onChange={event => selectLeague(event.target.value)} className={`${input} col-span-2 w-full lg:hidden`}><option value="">Sve engleske lige</option>{overview?.catalog.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <select aria-label="Sezona" value={season} onChange={event => { setSeason(event.target.value); setOffset(0); }} className={input}><option value="">Sve sezone</option>{['2026/27', '2025/26', '2024/25', '2023/24'].map(value => <option key={value}>{value}</option>)}</select>
            <select aria-label="Rang" value={tier} onChange={event => { setTier(event.target.value); setLeague(''); setOffset(0); }} className={input}><option value="">Svi rangovi</option>{[1, 2, 3, 4, 5, 6, 7].map(value => <option key={value} value={value}>Rang {value}</option>)}</select>
            <div className="col-span-2 flex min-w-0 gap-2 sm:col-span-1"><input aria-label="Klub u istoriji" placeholder="Pretraži klub…" className={`${input} w-full`} value={search} onChange={event => setSearch(event.target.value)} maxLength={100} /><button className={command} aria-label="Pretraži istorijsku bazu" type="submit"><Search size={15} /></button></div>
            {hasFilters && <button type="button" className={`${command} col-span-2 sm:col-span-1`} onClick={() => { setLeague(''); setSeason(''); setTier(''); resetTeam(); }}><X size={13} />Resetuj</button>}
          </form>
          {overview && <div className="mb-4 grid grid-cols-2 divide-x divide-[#292929] border-y border-[#292929] bg-[#131313] py-3 sm:grid-cols-4">
            {[
              ['Utakmice u bazi', overview.totals.matches], ['Završene · FT', overview.totals.finished], ['Poznat HT + FT', overview.totals.withHtFt], ['Uvezene / tražene lige', `${overview.totals.importedLeagues} / ${overview.totals.targetLeagues}`],
            ].map(([label, value]) => <div key={label} className="px-3 py-1 sm:px-4"><span className="block text-[10px] text-neutral-500">{label}</span><strong className="mt-1 block text-lg font-semibold tabular-nums">{typeof value === 'number' ? value.toLocaleString('sr-Latn-RS') : value}</strong></div>)}
          </div>}
          <AnalyticsTabs<View> id="history-view" value={view} items={views} onChange={setView} />
          <div id="history-view-panel" role="tabpanel" aria-labelledby={`history-view-${view}`} aria-busy={loading} className="min-h-72 pt-4">
            {loading && <p role="status" className="mb-3 flex items-center gap-2 text-xs text-neutral-500"><RefreshCw size={12} className="motion-safe:animate-spin" />Učitavanje pregleda…</p>}
            {overview && view === 'matches' && <section aria-label="Istorijske utakmice">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{selectedLeague?.name || (tier ? `Engleska · rang ${tier}` : 'Sve engleske lige')}<span className="ml-2 font-normal text-neutral-500">{season || 'Sve sezone'}</span></h2><span className="text-[11px] text-neutral-500">{overview.matches.length ? `${offset + 1}–${offset + overview.matches.length} od ${overview.totals.matches.toLocaleString('sr-Latn-RS')}` : '0 utakmica'}</span></div>
              <AnalyticsMatchTable matches={overview.matches} onOpen={match => { setTeam(match.homeId); setSearch(match.home.name); setAgainst(match.awayId); setOffset(0); setView('teams'); }} />
              {!overview.matches.length && !loading && <div className="border-b border-[#292929] py-12 text-center"><Database size={24} className="mx-auto mb-3 text-neutral-600" /><h3 className="text-sm font-semibold">Nema uvezenih utakmica za ovaj izbor</h3><p className="mt-1 text-xs text-neutral-500">Dostupnost lige i sezone možete proveriti u pregledu baze.</p><button type="button" className={`${command} mt-4`} onClick={() => setView('data')}>Pokrivenost podataka<ChevronRight size={13} /></button></div>}
              <div className="mt-4 flex items-center justify-between gap-2"><button type="button" className={command} disabled={!offset || loading} onClick={() => setOffset(value => Math.max(0, value - 50))}><ChevronLeft size={14} />Prethodnih 50</button><span className="text-[11px] text-neutral-500">Strana {Math.floor(offset / 50) + 1}</span><button type="button" className={command} disabled={!overview.hasMore || loading} onClick={() => setOffset(value => value + 50)}>Sledećih 50<ChevronRight size={14} /></button></div>
            </section>}
            {overview && view === 'statistics' && <HistoricalMetrics aggregate={overview.aggregate} filters={filters} />}
            {overview && view === 'teams' && <HistoricalTeams overview={overview} team={team} against={against} onTeam={selectTeam} onAgainst={value => { setAgainst(value); setOffset(0); }} onReset={resetTeam} />}
            {overview && view === 'data' && <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 border-b border-[#292929] pb-4 sm:grid-cols-4">{[['Nedostaje HT', overview.totals.missingHt], ['Nedostaje FT', overview.totals.missingFt], ['Nepoznato vreme', overview.totals.missingTime], ['Nepotvrđena zona', overview.totals.missingTimezone]].map(([label, value]) => <div key={label} className="text-xs text-neutral-500">{label}<strong className="mt-1 block text-base text-neutral-200">{value}</strong></div>)}</div>
              <HistoricalImportControls filters={filters} onSaved={refresh} local={overview.database.kind === 'sqlite'} />
              <HistoricalCoverage rows={overview.coverage} />
              <section className="border-t border-[#292929] pt-4"><h2 className="mb-3 text-sm font-bold">Izvori i pristup podacima</h2><div className="divide-y divide-[#292929]">{overview.sources.map(source => <details key={source.id} className="py-3 text-xs"><summary className="flex cursor-pointer items-center justify-between gap-3"><strong className="text-neutral-200">{source.id}</strong><span className="text-neutral-500">{source.status}</span></summary><div className="mt-2 space-y-2 leading-5 text-neutral-400"><p>{source.message}</p>{source.url && <a className="text-gold-300 underline" target="_blank" rel="noreferrer" href={source.url}>Dokumentacija izvora</a>}</div></details>)}</div><p className="mt-3 text-[11px] text-neutral-500">Incremental sync: {overview.incrementalEnabled ? 'omogućen' : 'isključen'}. Baza utakmica je odvojena od istorije objavljenih tiketa.</p></section>
              <section className="border-t border-[#292929] pt-4"><h2 className="text-sm font-bold">Poslednji uvozi i greške</h2>{overview.runs.length ? overview.runs.map(run => <div key={run.id} className="border-b border-[#292929] py-3 text-xs leading-5 text-neutral-400"><strong className="text-neutral-200">{run.status} · {new Date(run.createdAt).toLocaleString('sr-Latn-RS')}</strong><p>Novi {run.created} · izmenjeni {run.updated} · bez promene {run.unchanged} · za proveru {run.unresolved}</p>{run.error && <p className="text-red-300">{run.error}</p>}</div>) : <p className="py-3 text-xs text-neutral-500">Nema pokrenutih istorijskih uvoza.</p>}</section>
            </div>}
          </div>
        </div>
      </div>
    </main>
  </AnalyticsWorkspace>;
}
