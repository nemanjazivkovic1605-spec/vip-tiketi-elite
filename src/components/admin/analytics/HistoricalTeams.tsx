import React from 'react';
import { ArrowLeftRight, Users, X } from 'lucide-react';
import type { HistoricalOverview } from '../../../types/historicalAnalytics';
import AnalyticsMatchTable from './AnalyticsMatchTable';
import { analyticsCommand, analyticsInput } from './AnalyticsWorkspace';

const average = (value: number | null) => value === null ? '—' : value.toFixed(2);

function FormResults({ form }: { form: string }) {
  const results = form.split(/\s+/).filter(Boolean);
  return <span className="inline-flex flex-wrap gap-1" aria-label={`Forma: ${form || 'nema podataka'}`}>
    {results.length ? results.map((result, index) => <span key={index} title={result === 'W' ? 'Pobeda' : result === 'D' ? 'Remi' : 'Poraz'} className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${result === 'W' ? 'bg-emerald-500/15 text-emerald-300' : result === 'D' ? 'bg-neutral-700/50 text-neutral-300' : 'bg-red-500/10 text-red-300'}`}>{result}</span>) : '—'}
  </span>;
}

export default function HistoricalTeams({ overview, team, against, onTeam, onAgainst, onReset }: {
  overview: HistoricalOverview;
  team: string;
  against: string;
  onTeam: (id: string, name: string) => void;
  onAgainst: (id: string) => void;
  onReset: () => void;
}) {
  const selected = overview.teams.find(row => row.id === team) || (team && overview.teams.length === 1 ? overview.teams[0] : null);
  const opponent = overview.opponents.find(row => row.id === against);
  return <div className="space-y-5">
    <section aria-label="H2H poređenje">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#292929] pb-3">
        <div><h2 className="flex items-center gap-2 text-sm font-bold"><ArrowLeftRight size={16} className="text-gold-400" />Međusobni susreti</h2><p className="mt-1 text-xs text-neutral-500">{selected ? selected.name : 'Izaberite klub iz pregleda ispod ili otvorite H2H uz utakmicu.'}</p></div>
        {!!team && <button type="button" className={analyticsCommand} onClick={onReset}><X size={13} />Svi klubovi</button>}
      </div>
      {selected && <div className="flex flex-wrap items-center gap-3 py-4">
        <strong className="text-sm">{selected.name}</strong><span className="text-[10px] font-bold text-neutral-600">VS</span>
        <select aria-label="H2H protivnik" className={`${analyticsInput} w-full sm:w-auto sm:flex-1`} value={against} onChange={event => onAgainst(event.target.value)}><option value="">Izaberite protivnika</option>{overview.opponents.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      </div>}
      {overview.h2h && <>
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#292929] bg-[#161616] px-3 py-3">
          <div><h3 className="text-sm font-semibold">{selected?.name} <span className="font-normal text-neutral-500">/</span> {opponent?.name || 'Međusobni susreti'}</h3><p className="mt-1 text-[11px] text-neutral-500">Uzorak: {overview.h2h.sample} završenih utakmica · prikaz do 20 susreta</p></div>
          <div className="flex gap-5 text-xs">{[['Over 2.5', overview.h2h.aggregate.over25Ft], ['BTTS', overview.h2h.aggregate.btts]].map(([label, raw]) => {
            const metric = raw as HistoricalOverview['aggregate']['btts'];
            return <span key={String(label)} className="text-neutral-500">{String(label)}<strong className="ml-2 text-neutral-100">{metric.percent === null ? '—' : `${metric.percent.toFixed(1)}%`}</strong><small className="ml-1">({metric.count}/{metric.sample})</small></span>;
          })}</div>
        </div>
        <AnalyticsMatchTable matches={overview.h2h.matches} />
        {!overview.h2h.matches.length && <p className="py-5 text-sm text-neutral-500">Nema sačuvanih međusobnih susreta za ove filtere.</p>}
      </>}
    </section>
    <section>
      <div className="flex items-center justify-between gap-3 border-b border-[#292929] pb-3"><h2 className="flex items-center gap-2 text-sm font-bold"><Users size={16} className="text-neutral-400" />Učinak klubova</h2><span className="text-[11px] text-neutral-500">Prikaz do 50 klubova</span></div>
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-[#1a1a1a] text-[10px] uppercase text-neutral-500"><tr><th className="px-2 py-3 font-medium sm:px-3">Klub / uzorak</th><th className="hidden w-20 py-3 text-center font-medium sm:table-cell" title="Pobede / remiji / porazi">W / D / L</th><th className="hidden w-20 py-3 text-center font-medium md:table-cell">Golovi</th><th className="w-[120px] px-1 py-3 font-medium sm:w-36">Poslednjih 5</th><th className="w-12 py-3 text-center font-medium sm:w-16">H2H</th></tr></thead>
        <tbody className="divide-y divide-[#292929]">{overview.teams.map(row => <tr key={row.id} className="bg-[#131313] align-top hover:bg-[#191919]">
          <td className="px-2 py-3 sm:px-3"><details><summary className="cursor-pointer list-none"><strong className="block break-words text-sm leading-5">{row.name}</strong><span className="mt-1 block text-[10px] text-neutral-500">{row.sample} utakmica<span className="sm:hidden"> · {row.wins}W {row.draws}D {row.losses}L</span></span></summary><div className="mt-3 space-y-2 text-[11px] leading-5 text-neutral-400"><p>Prosek dati / primljeni: {average(row.averageFor)} / {average(row.averageAgainst)} · n={row.sample}</p><p>Poslednjih 10: {row.last10.form || '—'} · {row.last10.points} bodova · n={row.last10.sample}</p><p>Kod kuće: {row.home.wins}W / {row.home.draws}D / {row.home.losses}L · golovi {average(row.home.averageFor)} / {average(row.home.averageAgainst)} · n={row.home.sample}</p><p>U gostima: {row.away.wins}W / {row.away.draws}D / {row.away.losses}L · golovi {average(row.away.averageFor)} / {average(row.away.averageAgainst)} · n={row.away.sample}</p></div></details></td>
          <td className="hidden py-3 text-center tabular-nums text-neutral-400 sm:table-cell">{row.wins} / {row.draws} / {row.losses}</td>
          <td className="hidden py-3 text-center tabular-nums text-neutral-400 md:table-cell">{row.goalsFor}:{row.goalsAgainst}</td>
          <td className="px-1 py-3"><FormResults form={row.last5.form} /><span className="mt-1 block text-[10px] text-neutral-500">{row.last5.points} bodova · n={row.last5.sample}</span></td>
          <td className="py-3 text-center"><button type="button" aria-label={`Izdvoji klub / H2H: ${row.name}`} title={`H2H: ${row.name}`} className={`${analyticsCommand} !min-h-8 !px-2 !py-1`} onClick={() => onTeam(row.id, row.name)}><ArrowLeftRight size={14} /></button></td>
        </tr>)}</tbody>
      </table>
      {!overview.teams.length && <p className="py-6 text-sm text-neutral-500">Nema klubova za izabrane filtere.</p>}
    </section>
  </div>;
}
