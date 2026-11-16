import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, CalendarDays, ChartNoAxesCombined, ChevronLeft, ChevronRight, ListFilter, RefreshCw, Search, Users } from 'lucide-react';
import AnalyticsWorkspace, { AnalyticsTabs, analyticsCommand as command, analyticsInput as input } from '../../components/admin/analytics/AnalyticsWorkspace';
import AnalyticsMatchTable from '../../components/admin/analytics/AnalyticsMatchTable';
import AnalyticsDialog from '../../components/admin/analytics/AnalyticsDialog';
import HtftTeamPanel from '../../components/admin/analytics/HtftTeamPanel';
import HtftMatchPanel from '../../components/admin/analytics/HtftMatchPanel';
import { analyticsRequest } from '../../services/admin/footballAnalyticsService';
import { getDailyAnalysisDates } from '../../utils/dailyDates';
import { HTFT_CODES, type HtftRanking, type HtftTransitionPage, type HtftTeamDetail, type HtftSchedule, type HtftMatchPreview, type HtftSort, type HtftCatalog } from '../../types/htftAnalytics';

type View = 'ranking' | 'transitions' | 'team' | 'schedule';
const views: Array<{ value: View; label: string; icon: typeof Users }> = [
  { value: 'ranking', label: 'Rang-lista', icon: ChartNoAxesCombined }, { value: 'transitions', label: 'Svi prelazi', icon: ListFilter },
  { value: 'team', label: 'Istorija tima', icon: Users }, { value: 'schedule', label: 'Raspored', icon: CalendarDays },
];
const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const dateLabel = (value: string) => value.split('-').reverse().join('.');

export default function HtftAnalytics() {
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const view: View = views.some(row => row.value === rawView) ? rawView as View : 'ranking';
  const league = params.get('league') || '', season = params.get('season') || '', role = params.get('role') || 'made';
  const transition = params.get('code') || '', teamId = params.get('id') || '', range = params.get('range') || 'today';
  const sort = params.get('sort') || (transition ? 'selected' : 'total'), direction = params.get('direction') || 'desc';
  const offset = Number(params.get('offset') || 0), query = params.get('search') || '';
  const fullReversal = !transition || ['2/1', '1/2'].includes(transition);
  const [search, setSearch] = useState(query), [revision, setRevision] = useState(0);
  const [ranking, setRanking] = useState<HtftRanking | null>(null), [transitions, setTransitions] = useState<HtftTransitionPage | null>(null);
  const [team, setTeam] = useState<HtftTeamDetail | null>(null), [schedule, setSchedule] = useState<HtftSchedule | null>(null);
  const [catalog, setCatalog] = useState<HtftCatalog>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(''), [preview, setPreview] = useState<HtftMatchPreview | null>(null), [previewError, setPreviewError] = useState('');
  const days = getDailyAnalysisDates();
  const selectedDate = range === 'tomorrow' ? days[1].date : range === 'dayAfter' ? days[2].date : days[0].date;
  const update = (changes: Record<string, string>) => setParams(previous => {
    const next = new URLSearchParams(previous); next.delete('offset');
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    return next;
  });
  const showPage = (value: number) => update({ offset: String(value) });
  const requestKey = new URLSearchParams({ view, league, season, role, transition, id: teamId, range, sort, direction, offset: String(offset), search: query, date: selectedDate }).toString();
  useEffect(() => { setSearch(query); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    const state = new URLSearchParams(requestKey), active = state.get('view') as View;
    setError(''); setLoading(true);
    if (active === 'team' && !state.get('id')) { setTeam(null); setLoading(false); return () => controller.abort(); }
    const common: Record<string, string> = { offset: state.get('offset') || '0' };
    if (state.get('league')) common.league = state.get('league')!;
    if (active !== 'schedule' && state.get('season')) common.season = state.get('season')!;
    if (active !== 'schedule' && state.get('transition')) common.transition = state.get('transition')!;
    let action = '';
    if (active === 'ranking') { action = 'htft-ranking'; Object.assign(common, { role: state.get('role'), search: state.get('search'), sort: state.get('sort'), direction: state.get('direction') }); }
    else if (active === 'transitions') { action = 'htft-transitions'; common.transition ||= '2/1'; }
    else if (active === 'team') { action = 'htft-team'; common.id = state.get('id')!; }
    else { action = 'htft-schedule'; common.date = state.get('date')!; common.days = state.get('range') === 'week' ? '7' : '1'; }
    analyticsRequest<HtftRanking | HtftTransitionPage | HtftTeamDetail | HtftSchedule>(action, common, 'GET', controller.signal)
      .then(value => {
        if (controller.signal.aborted) return;
        setCatalog(value.catalog);
        if (active === 'ranking') setRanking(value as HtftRanking);
        else if (active === 'transitions') setTransitions(value as HtftTransitionPage);
        else if (active === 'team') setTeam(value as HtftTeamDetail);
        else setSchedule(value as HtftSchedule);
      }).catch(value => { if (!controller.signal.aborted) setError(value instanceof Error ? value.message : 'HT/FT pregled trenutno nije dostupan.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestKey, revision]);
  useEffect(() => {
    if (!selectedMatch) return;
    const controller = new AbortController(); setPreview(null); setPreviewError('');
    analyticsRequest<HtftMatchPreview>('htft-match', { id: selectedMatch }, 'GET', controller.signal).then(value => { if (!controller.signal.aborted) setPreview(value); })
      .catch(value => { if (!controller.signal.aborted) setPreviewError(value instanceof Error ? value.message : 'Poređenje nije dostupno.'); });
    return () => controller.abort();
  }, [selectedMatch]);
  const aggregate = view === 'transitions' ? transitions?.aggregate : ranking?.aggregate;
  const sortBy = (key: HtftSort) => update({ sort: key, direction: sort === key && direction === 'desc' ? 'asc' : 'desc' });
  const sortHeader = (label: string, key: HtftSort) => <button type="button" onClick={() => sortBy(key)} className={`inline-flex items-center justify-center gap-1 ${sort === key ? 'text-gold-300' : ''}`} title={`Sortiraj: ${label}`} aria-label={`Sortiraj: ${label}`}>{label}<ArrowUpDown size={11} /></button>;
  const pageControls = (more: boolean) => <div className="mt-4 flex items-center justify-between gap-2"><button type="button" disabled={!offset || loading} className={command} onClick={() => showPage(Math.max(0, offset - 50))}><ChevronLeft size={13} />Prethodnih 50</button><span className="text-[10px] text-neutral-500">Strana {Math.floor(offset / 50) + 1}</span><button type="button" disabled={!more || loading} className={command} onClick={() => showPage(offset + 50)}>Sledećih 50<ChevronRight size={13} /></button></div>;

  return <AnalyticsWorkspace><main className="mx-auto max-w-[1560px] space-y-4 px-3 py-5 sm:px-4 lg:px-6">
    <header className="flex items-start justify-between gap-3"><div><p className="mb-1 text-[10px] font-semibold uppercase text-gold-400">Engleske lige · nivoi 1–7</p><h1 className="text-xl font-bold sm:text-2xl">HT/FT Rang-lista</h1><p className="mt-1 text-xs text-neutral-500">Stvarni prelazi poluvreme/kraj · napravljeni preokreti i ispuštena vođstva</p></div><button type="button" className={command} disabled={loading} onClick={() => setRevision(value => value + 1)} title="Osveži pregled"><RefreshCw size={14} /><span className="hidden sm:inline">Osveži</span></button></header>
    <AnalyticsTabs<View> id="htft-view" value={view} items={views} onChange={value => update({ view: value })} />
    <form className="grid grid-cols-2 gap-2 md:flex md:flex-wrap" onSubmit={event => { event.preventDefault(); update({ search }); }}>
      <select aria-label="HT/FT liga" value={league} onChange={event => update({ league: event.target.value })} className={`${input} col-span-2 max-w-full sm:col-span-1`}><option value="">Sve engleske lige</option>{catalog.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      {view !== 'schedule' && <><select aria-label="HT/FT sezona" value={season} onChange={event => update({ season: event.target.value })} className={input}><option value="">Sve sezone</option>{['2026/27', '2025/26', '2024/25', '2023/24'].map(value => <option key={value}>{value}</option>)}</select><select aria-label="Tip HT/FT prelaza" value={transition || (view === 'transitions' ? '2/1' : '')} onChange={event => update({ code: event.target.value })} className={input}><option value="" disabled={view === 'transitions'}>Svi prelazi</option>{HTFT_CODES.map(code => <option key={code}>{code}</option>)}</select></>}
      {view === 'ranking' && <><select aria-label="Uloga tima" value={role} onChange={event => update({ role: event.target.value })} className={`${input} col-span-2 sm:col-span-1`}><option value="made">{fullReversal ? 'Tim je napravio preokret' : 'Tim sa povoljnijim ishodom'}</option><option value="conceded">{fullReversal ? 'Tim je izgubio preokretom' : 'Tim sa nepovoljnijim ishodom'}</option></select><div className="col-span-2 flex min-w-0 gap-2 md:flex-1"><input className={`${input} w-full`} aria-label="Pretraga HT/FT tima" placeholder="Pretraži tim…" value={search} onChange={event => setSearch(event.target.value)} /><button className={command} type="submit" aria-label="Pretraži HT/FT tim"><Search size={14} /></button></div></>}
    </form>
    {error && <p role="alert" className="rounded-md border border-amber-500/30 px-4 py-3 text-xs text-amber-200">{error}</p>}
    {loading && <p role="status" className="flex items-center gap-2 text-xs text-neutral-500"><RefreshCw size={12} className="motion-safe:animate-spin" />Učitavanje HT/FT pregleda…</p>}
    <div id="htft-view-panel" role="tabpanel" aria-labelledby={`htft-view-${view}`} aria-busy={loading} className="min-h-80 space-y-4">
      {(view === 'ranking' || view === 'transitions') && aggregate && <>
        <div className="grid grid-cols-3 divide-x divide-[#303030] border-y border-[#303030] bg-[#151515] py-3">{[['HT + FT uzorak', aggregate.withHtFt], ['Prelaz 2/1', aggregate.htft.find(row => row.code === '2/1')?.count || 0], ['Prelaz 1/2', aggregate.htft.find(row => row.code === '1/2')?.count || 0]].map(([label, count]) => <div key={label} className="px-3 text-[10px] text-neutral-500">{label}<strong className="mt-1 block text-lg font-semibold tabular-nums text-neutral-100">{count.toLocaleString('sr-Latn-RS')}</strong></div>)}</div>
        <p className="text-[11px] leading-5 text-neutral-500">HT/FT je uvek iz ugla domaćina/gosta: 2/1 pravi domaćin, 1/2 pravi gost. Procenat koristi samo poznat HT + FT, ne sve odigrane mečeve.</p>
      </>}
      {view === 'ranking' && ranking && <section>
        <div className="mb-3 flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold">{!fullReversal ? `Timovi u prelazu ${transition}` : role === 'made' ? 'Timovi koji prave preokrete' : 'Timovi koji gube preokretom'}</h2><span className="text-[11px] text-neutral-500">{ranking.totalTeams} timova{transition ? ` · filter ${transition}` : ''}</span></div>
        <table className="w-full table-fixed text-left text-xs"><thead className="bg-[#1a1a1a] text-[10px] text-neutral-500"><tr><th className="w-8 px-1 py-3 font-medium sm:w-10">#</th><th className="px-2 py-3 font-medium">{sortHeader('Tim / liga', 'name')}</th><th className="hidden w-20 py-3 text-center font-medium md:table-cell">{sortHeader('Odigrano', 'played')}</th><th className="hidden w-14 py-3 text-center font-medium sm:table-cell">{sortHeader('2/1', 'twoOne')}</th><th className="hidden w-14 py-3 text-center font-medium sm:table-cell">{sortHeader('1/2', 'oneTwo')}</th><th className="w-14 py-3 text-center font-medium sm:w-20">{sortHeader(transition ? 'Izbor' : 'Ukupno', transition ? 'selected' : 'total')}</th><th className="w-16 py-3 text-center font-medium sm:w-24">{sortHeader('%', 'rate')}</th><th className="hidden w-40 py-3 text-center font-medium lg:table-cell">{sortHeader('Poslednji prelaz', 'last')}</th></tr></thead><tbody className="divide-y divide-[#292929]">{ranking.rows.map(row => <tr key={row.id} className="align-top hover:bg-[#191919]"><td className="px-1 py-3 tabular-nums text-neutral-500">{row.position}</td><td className="px-2 py-3"><button type="button" className="block break-words text-left text-sm font-semibold leading-5 hover:text-gold-300" onClick={() => update({ view: 'team', id: row.id })}>{row.name}</button><span className="mt-1 block break-words text-[10px] text-neutral-500">{row.leagues.join(' / ')}</span><span className="mt-1 block text-[10px] text-neutral-500">HT/FT n={row.sample}<span className="sm:hidden"> · 2/1: {role === 'made' ? row.made21 : row.conceded21} · 1/2: {role === 'made' ? row.made12 : row.conceded12}</span></span></td><td className="hidden py-3 text-center tabular-nums text-neutral-400 md:table-cell">{row.played}</td><td className="hidden py-3 text-center tabular-nums sm:table-cell">{role === 'made' ? row.made21 : row.conceded21}</td><td className="hidden py-3 text-center tabular-nums sm:table-cell">{role === 'made' ? row.made12 : row.conceded12}</td><td className="py-3 text-center text-base font-semibold tabular-nums text-gold-300">{transition ? row.selectedCount : role === 'made' ? row.made : row.conceded}</td><td className="py-3 text-center tabular-nums">{percent(transition ? row.selectedPercent : role === 'made' ? row.madePercent : row.concededPercent)}</td><td className="hidden py-3 text-center text-[11px] text-neutral-400 lg:table-cell">{row.last ? <>{row.last.code}<span className="mt-1 block text-neutral-500">{dateLabel(row.last.date)}</span><span className="mt-1 block break-words text-[10px] text-neutral-500">{row.last.opponent}</span></> : '—'}</td></tr>)}</tbody></table>
        {!ranking.rows.length && <p className="py-10 text-center text-sm text-neutral-500">Nema potvrđenih HT/FT utakmica za ovaj izbor.</p>}{pageControls(ranking.hasMore)}
      </section>}
      {view === 'transitions' && transitions && <section className="space-y-4"><div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[#303030] bg-[#303030] md:grid-cols-9">{transitions.aggregate.htft.map(row => <button key={row.code} type="button" aria-pressed={transitions.code === row.code} onClick={() => update({ code: row.code })} className={`min-w-0 px-2 py-3 text-center ${transitions.code === row.code ? 'bg-gold-500/10 text-gold-300' : 'bg-[#151515] hover:bg-[#202020]'}`}><strong className="text-xs">{row.code}</strong><span className="mt-1 block text-lg font-semibold tabular-nums">{row.count}</span><small className="mt-1 block text-[10px] text-neutral-500">{percent(row.percent)} · n={row.sample}</small></button>)}</div><h2 className="text-sm font-semibold">Prelaz {transitions.code} · {transitions.count} utakmica · {percent(transitions.percent)}</h2><AnalyticsMatchTable matches={transitions.matches} onOpen={match => setSelectedMatch(match.id)} actionLabel="Analiza" />{pageControls(transitions.hasMore)}</section>}
      {view === 'team' && (teamId && team ? <HtftTeamPanel team={team} offset={offset} loading={loading} onPage={showPage} /> : !loading && <div className="py-10 text-center"><Users size={25} className="mx-auto mb-3 text-neutral-600" /><p className="text-sm text-neutral-400">Izaberite tim iz rang-liste za njegovu istoriju prelaza.</p><button type="button" className={`${command} mt-4`} onClick={() => update({ view: 'ranking' })}>Otvori rang-listu</button></div>)}
      {view === 'schedule' && <section className="space-y-4"><div className="flex flex-wrap gap-2">{[['today', 'Danas'], ['tomorrow', 'Sutra'], ['dayAfter', 'Prekosutra'], ['week', 'Narednih 7 dana']].map(([key, label]) => <button key={key} type="button" className={`${command} ${range === key ? '!border-gold-500/50 !text-gold-300' : ''}`} aria-pressed={range === key} onClick={() => update({ range: key })}>{label}</button>)}</div>{schedule && <><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><h2 className="font-semibold">{dateLabel(schedule.from)}{schedule.to !== schedule.from ? ` – ${dateLabel(schedule.to)}` : ''} · {schedule.total} utakmica</h2><span className="text-[11px] text-neutral-500">Dnevni sync: {schedule.syncEnabled ? 'omogućen' : 'nije aktiviran'}</span></div><p className="text-[11px] leading-5 text-amber-200/80">{schedule.coverage.reduce((sum, row) => sum + row.overdueUnresolved, 0) > 0 ? `Za ${schedule.coverage.reduce((sum, row) => sum + row.overdueUnresolved, 0)} prethodnih utakmica tekuće sezone još nema konačnog rezultata. One ne ulaze u HT/FT statistiku dok rezultat ne bude potvrđen.` : ''}</p><AnalyticsMatchTable matches={schedule.matches} onOpen={match => setSelectedMatch(match.id)} actionLabel="Analiza" />{!schedule.matches.length && <p className="py-8 text-center text-sm text-neutral-500">Za ovaj period nema sačuvanih dostupnih engleskih utakmica. Pogledajte pokrivenost ispod.</p>}{pageControls(schedule.hasMore)}<details className="border-t border-[#303030] pt-4" open={!schedule.total}><summary className="cursor-pointer text-sm font-semibold">Pokrivenost liga i nedostajući podaci</summary><div className="mt-3 divide-y divide-[#292929]">{schedule.coverage.map(row => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_60px] gap-3 py-3 text-xs"><div><strong>{row.name}</strong><p className="mt-1 break-words text-[11px] leading-5 text-neutral-500">{row.reason || `${row.seasonMatches} utakmica tekuće sezone u bazi.`}</p></div><span className="text-right text-neutral-400">{row.fixtures}<small className="block text-neutral-500">u periodu</small></span></div>)}</div><p className="mt-3 text-[11px] text-neutral-500">Poslednji uspešan uvoz: {schedule.lastSync ? new Date(schedule.lastSync).toLocaleString('sr-Latn-RS') : 'nije zabeležen'}. <Link to="/admin/historical-analytics" className="text-gold-300 hover:underline">Baza i uvoz</Link></p></details></>}</section>}
    </div>
    <p className="border-t border-[#292929] pt-4 text-[11px] text-neutral-500">Podaci: <a href="https://github.com/openfootball/football.json" target="_blank" rel="noreferrer" className="hover:text-neutral-200">OpenFootball (CC0)</a> · Data provided by <a href="https://www.football-data.org/" target="_blank" rel="noreferrer" className="hover:text-neutral-200">football-data.org</a></p>
    {selectedMatch && <AnalyticsDialog title="HT/FT analiza utakmice" onClose={() => setSelectedMatch('')}>{previewError ? <p role="alert" className="py-8 text-sm text-amber-200">{previewError}</p> : preview ? <HtftMatchPanel analysis={preview} onNavigate={() => setSelectedMatch('')} /> : <p role="status" className="py-12 text-center text-sm text-neutral-400">Učitavanje istorije oba tima…</p>}</AnalyticsDialog>}
  </main></AnalyticsWorkspace>;
}
