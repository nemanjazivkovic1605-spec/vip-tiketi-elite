import React from 'react';
import type { HistoricalCoverage as Coverage } from '../../../types/historicalAnalytics';

export default function HistoricalCoverage({ rows }: { rows: Coverage[] }) {
  return <section className="border-t border-white/10 pt-5">
    <h2 className="text-base font-bold">Pokrivenost liga i sezona</h2>
    <p className="mt-1 text-xs text-neutral-500">Procenat meri poznat HT+FT među uvezenim završenim mečevima, ne kompletiranost cele sezone.</p>
    <div className="mt-3 grid gap-2 lg:grid-cols-2">{rows.map(row => <details key={`${row.league}:${row.season}`} className="min-w-0 rounded-md border border-white/10 bg-[#141414] px-3 py-3">
      <summary className="cursor-pointer list-none">
        <span className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{row.name}</strong><span className="text-xs text-neutral-500">Rang {row.tier} · {row.season}</span></span>
        <span className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-neutral-400">
          <span>Mečevi<strong className="block text-sm text-neutral-100">{row.matches}</strong></span><span>FT<strong className="block text-sm text-neutral-100">{row.finished}</strong></span><span>HT + FT<strong className="block text-sm text-neutral-100">{row.withHtFt}</strong></span><span>Poznat HT<strong className="block text-sm text-neutral-100">{row.verifiedFieldsPercent === null ? '—' : `${row.verifiedFieldsPercent.toFixed(1)}%`}</strong></span>
        </span>
        <span className={`mt-2 block text-xs ${row.state === 'uncovered' ? 'text-amber-300' : 'text-neutral-500'}`}>{row.state === 'uncovered' ? 'Nepokriveno' : row.state === 'partial' ? 'Delimično pokriveno' : 'Nije provereno'}</span>
      </summary>
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs leading-5 text-neutral-400">
        <p>{row.reason}</p><p>Nedostaje HT: {row.missingHt} · FT: {row.missingFt} · vreme: {row.missingTime} · vremenska zona: {row.missingTimezone}</p>
        <p>Izvori: {row.sources.join(', ') || 'Nema potvrđenih podataka'}</p>
        <p>Poslednja provera: {row.checkedAt ? new Date(row.checkedAt).toLocaleString('sr-Latn-RS') : '—'}</p>
        <p>Uspešna sinhronizacija: {row.lastSuccessfulSync ? new Date(row.lastSuccessfulSync).toLocaleString('sr-Latn-RS') : '—'}</p>
        <p>Kompletnost cele sezone: nije potvrđena.</p>
      </div>
    </details>)}</div>
  </section>;
}
