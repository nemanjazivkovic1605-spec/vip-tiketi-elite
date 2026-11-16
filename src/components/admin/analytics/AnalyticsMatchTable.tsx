import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { AnalyticsMatch, ScorePair } from '../../../types/footballAnalytics';
import { analyticsCommand } from './AnalyticsWorkspace';

const statuses: Record<AnalyticsMatch['status'], string> = {
  scheduled: 'Zakazano', live: 'U toku', finished: 'Završeno', postponed: 'Odloženo', canceled: 'Otkazano', unknown: 'Nepotvrđeno',
};

export function matchDisplayDate(match: AnalyticsMatch) {
  const date = match.matchDate || match.kickoffAt?.slice(0, 10);
  return date ? date.split('-').reverse().join('.') : 'Datum nepoznat';
}

export function matchDisplayTime(match: AnalyticsMatch) {
  return match.kickoffAt ? new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit' }).format(new Date(match.kickoffAt)) : match.matchTime || '—';
}

export function MatchScore({ score, strong = false }: { score: ScorePair; strong?: boolean }) {
  return <span className={`whitespace-nowrap tabular-nums ${strong ? 'font-bold text-neutral-100' : 'text-neutral-400'}`}>{score.home ?? '—'} : {score.away ?? '—'}</span>;
}

export default function AnalyticsMatchTable({ matches, onOpen, actionLabel = 'H2H', notes, highlighted }: {
  matches: AnalyticsMatch[];
  onOpen?: (match: AnalyticsMatch) => void;
  actionLabel?: string;
  notes?: Map<string, string>;
  highlighted?: Set<string>;
}) {
  return <table className="w-full table-fixed border-collapse text-left text-xs">
    <caption className="sr-only">Utakmice sa rezultatom poluvremena i kraja</caption>
    <thead className="bg-[#1a1a1a] text-[10px] font-medium uppercase text-neutral-500">
      <tr><th className="w-[68px] px-2 py-3 font-medium sm:w-28 sm:px-4">Datum</th><th className="px-2 py-3 font-medium">Utakmica</th><th className="w-12 py-3 text-center font-medium sm:w-16" title="Poluvreme">HT</th><th className="w-12 py-3 text-center font-medium sm:w-16" title="Kraj utakmice">FT</th>{onOpen && <th className="w-12 px-1 py-3 text-center font-medium sm:w-24">{actionLabel}</th>}</tr>
    </thead>
    <tbody className="divide-y divide-[#252525]">
      {matches.map(match => <tr key={match.id} className="bg-[#131313] transition-colors hover:bg-[#1b1b1b]">
        <td className="px-2 py-3 align-top text-[10px] text-neutral-400 sm:px-4 sm:text-xs">
          <span className="block leading-5">{matchDisplayDate(match)}</span>
          <span title={!match.kickoffAt && match.matchTime ? 'Izvor nije potvrdio vremensku zonu. Prikazano je originalno vreme.' : 'Europe/Belgrade'} className="block text-neutral-500">{matchDisplayTime(match)}{!match.kickoffAt && match.matchTime ? '*' : ''}</span>
        </td>
        <td className="min-w-0 px-2 py-3">
          <details className="group min-w-0">
            <summary className="cursor-pointer list-none rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-gold-400">
              <span className="block break-words text-[12px] font-semibold leading-5 text-neutral-100 sm:text-sm">{match.home.name}<span className="mx-1 hidden font-normal text-neutral-600 sm:inline">—</span><span className="block sm:inline">{match.away.name}</span></span>
              <span className="mt-0.5 block break-words text-[10px] leading-4 text-neutral-500 sm:text-[11px]">{match.league.name}{highlighted?.has(match.id) && <span className="ml-2 text-gold-400">Izdvojeno</span>}</span>
            </summary>
            <div className="mt-2 space-y-1 break-words border-t border-[#303030] pt-2 text-[11px] leading-5 text-neutral-400">
              <p>{statuses[match.status]} · {match.season} · rang {match.league.tier ?? '—'}</p>
              {notes?.get(match.id) && <p>{notes.get(match.id)}</p>}
              <p>Izvor: {match.sources.map(source => source.provider).join(', ')}</p>
              <p>Provera: {match.lastCheckedAt || match.observedAt}</p>
              <p className="break-all text-[10px] text-neutral-500">ID: {match.id}</p>
              {!match.kickoffAt && match.matchTime && <p>* Vremenska zona nije potvrđena izvorom.</p>}
              {match.sourceUrl && <a href={match.sourceUrl} target="_blank" rel="noreferrer" className="text-gold-300 underline underline-offset-2">Pogledaj izvor</a>}
            </div>
          </details>
        </td>
        <td className="py-3 text-center align-top leading-5"><MatchScore score={match.ht} /></td>
        <td className="py-3 text-center align-top leading-5"><MatchScore score={match.ft} strong /><span className={`mt-1 block text-[9px] leading-4 ${match.status === 'live' ? 'text-emerald-400' : 'text-neutral-500'}`}>{statuses[match.status]}</span></td>
        {onOpen && <td className="px-1 py-3 text-center align-top"><button type="button" className={`${analyticsCommand} !min-h-8 !px-2 !py-1 text-gold-300`} title={`${actionLabel}: ${match.home.name} — ${match.away.name}`} aria-label={`${actionLabel}: ${match.home.name} — ${match.away.name}`} onClick={() => onOpen(match)}><ArrowLeftRight size={13} /><span className="hidden sm:inline">{actionLabel}</span></button></td>}
      </tr>)}
    </tbody>
  </table>;
}
