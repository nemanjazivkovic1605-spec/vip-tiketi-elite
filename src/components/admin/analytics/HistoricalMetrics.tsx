import React from 'react';
import { Link } from 'react-router-dom';
import type { HistoricalAggregate, HistoricalMetric } from '../../../types/historicalAnalytics';

const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;

function MetricRows({ title, metrics }: { title: string; metrics: Array<[string, HistoricalMetric]> }) {
  return <section className="min-w-0"><h3 className="border-b border-[#303030] py-3 text-sm font-semibold">{title}</h3><div className="divide-y divide-[#272727]">{metrics.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_80px_64px] items-center gap-2 py-3 text-xs">
    <span className="text-neutral-300">{label}</span><span className="text-right text-[11px] tabular-nums text-neutral-500">{value.count}/{value.sample}</span><strong className="text-right tabular-nums text-neutral-100">{percent(value.percent)}</strong>
  </div>)}</div></section>;
}

export default function HistoricalMetrics({ aggregate, filters = {} }: { aggregate: HistoricalAggregate; filters?: { league?: string; season?: string } }) {
  return <section className="space-y-5" aria-label="Istorijski statistički obrasci">
    <div><h2 className="text-sm font-bold">Statistički pregled</h2><p className="mt-1 text-xs leading-5 text-neutral-500">Uzorak: {aggregate.finished.toLocaleString('sr-Latn-RS')} završenih utakmica · {aggregate.withHtFt.toLocaleString('sr-Latn-RS')} sa HT + FT. Istorijski učinak nije prognoza.</p></div>
    <div className="grid gap-x-8 lg:grid-cols-2">
      <MetricRows title="Ishodi i prvo poluvreme" metrics={[
        ['Pobeda domaćina · 1', aggregate.homeWins], ['Remi · X', aggregate.draws], ['Pobeda gosta · 2', aggregate.awayWins], ['Over 0.5 HT', aggregate.over05Ht], ['Over 1.5 HT', aggregate.over15Ht],
      ]} />
      <MetricRows title="Golovi i preokreti" metrics={[
        ['Over 1.5 FT', aggregate.over15Ft], ['Over 2.5 FT', aggregate.over25Ft], ['Over 3.5 FT', aggregate.over35Ft], ['Oba tima daju gol · BTTS', aggregate.btts], ['Preokret · 1/2 ili 2/1', aggregate.comebacks],
      ]} />
    </div>
    <section className="border-t border-[#303030] pt-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Poluvreme / kraj · HT/FT</h3><span className="text-[11px] text-neutral-500">1 = domaćin · X = remi · 2 = gost</span></div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[#303030] bg-[#303030] md:grid-cols-9">{aggregate.htft.map(value => <Link key={value.code} to={`/admin/htft?${new URLSearchParams({ view: 'transitions', code: value.code, ...(filters.league ? { league: filters.league } : {}), ...(filters.season ? { season: filters.season } : {}) })}`} title={`Utakmice sa prelazom ${value.code}`} className="bg-[#161616] px-2 py-3 text-center hover:bg-[#222]"><span className="text-xs font-semibold text-gold-300">{value.code}</span><strong className="mt-1.5 block text-base tabular-nums">{percent(value.percent)}</strong><span className="mt-1 block text-[10px] tabular-nums text-neutral-500">{value.count}/{value.sample}</span></Link>)}</div>
    </section>
    <div className="grid gap-4 border-y border-[#303030] py-4 sm:grid-cols-2">{[['Golovi u 1. poluvremenu', aggregate.firstHalfGoals], ['Golovi u 2. poluvremenu', aggregate.secondHalfGoals]].map(([label, raw]) => {
      const value = raw as HistoricalAggregate['firstHalfGoals'];
      return <div key={String(label)} className="flex items-center justify-between gap-3 text-xs"><span className="text-neutral-400">{String(label)}<small className="mt-1 block text-neutral-500">Prosek po utakmici · n={value.sample}</small></span><strong className="text-lg tabular-nums">{value.average === null ? '—' : value.average.toFixed(2)}</strong></div>;
    })}</div>
  </section>;
}
