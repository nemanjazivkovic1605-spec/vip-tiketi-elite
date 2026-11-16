import React, { useState } from "react";
import { X, ArrowLeftRight, ChartNoAxesCombined, History, Shuffle } from "lucide-react";
import type {
  AnalyticsMatch,
  MatchAnalysis,
  MetricSample,
  TeamWindow,
} from "../../../types/footballAnalytics";
import { AnalyticsTabs } from './AnalyticsWorkspace';
import { matchDisplayDate, matchDisplayTime } from './AnalyticsMatchTable';

export const analyticDate = (date: string | null | undefined) => date ?
  new Intl.DateTimeFormat("sr-Latn-RS", {
    timeZone: "Europe/Belgrade",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date)) : 'Vreme nije potvrđeno';
const score = (m: AnalyticsMatch) =>
  m.ft.home !== null && m.ft.away !== null ? `${m.ft.home}:${m.ft.away}` : "—";
const labels: Record<keyof TeamWindow["metrics"], string> = {
  goalsFor: "Dati golovi",
  goalsAgainst: "Primljeni golovi",
  xg: "Stvoreni xG",
  xga: "Dopušteni xG",
  nonPenaltyXg: "xG bez penala",
  shots: "Šutevi",
  shotsOnTarget: "U okvir",
  goalsMinusXg: "Golovi − xG (isti uzorak)",
};
export function AnalyticsMatchList({
  matches,
  onOpen,
}: {
  matches: AnalyticsMatch[];
  onOpen?: (id: string) => void;
}) {
  return (
    <div className="divide-y divide-white/10">
      {matches.map((m) => (
        <button
          type="button"
          key={m.id}
          onClick={() => onOpen?.(m.id)}
          disabled={!onOpen}
          className="grid w-full grid-cols-[1fr_auto] gap-2 py-3 text-left text-xs disabled:cursor-default hover:text-gold-300"
        >
          <span>
            <span className="block text-neutral-500">
              {matchDisplayDate(m)} · {matchDisplayTime(m)}{!m.kickoffAt && m.matchTime ? '*' : ''} · {m.league.name}
            </span>
            <strong className="mt-1 block text-sm">
              {m.home.name} — {m.away.name}
            </strong>
          </span>
          <span className="self-center font-bold tabular-nums">
            {score(m)}
            <small className="block text-neutral-500">
              HT {m.ht.home ?? "—"}:{m.ht.away ?? "—"}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}
export default function MatchAnalysisDetail({
  analysis,
  onScope,
  onOpen,
}: {
  analysis: MatchAnalysis;
  onScope: (scope: "all" | "league") => void;
  onOpen: (id: string) => void;
}) {
  const [window, setWindow] = useState<"last5" | "last10" | "venue5">("last10");
  const [view, setView] = useState<'comparison' | 'form' | 'h2h' | 'htft'>('comparison');
  const [drill, setDrill] = useState<{
    label: string;
    matches: AnalyticsMatch[];
  } | null>(null);
  const a = analysis,
    home = a.home[window],
    away = a.away[window];
  const availableMetrics = (Object.keys(labels) as Array<keyof TeamWindow['metrics']>).filter(key => home.metrics[key].available || away.metrics[key].available);
  const showSample = (metric: MetricSample, team: TeamWindow, label: string) =>
    setDrill({
      label,
      matches: team.matches.filter((m) => metric.matchIds.includes(m.id)),
    });
  return (
    <section className="space-y-5" aria-label="Detaljna analiza utakmice">
      <div className="border-b border-white/10 pb-4">
        <p className="text-xs text-gold-400">
          {a.match.league.name} · {matchDisplayDate(a.match)} · {matchDisplayTime(a.match)}{!a.match.kickoffAt && a.match.matchTime ? ' · zona nepotvrđena' : ''}
        </p>
        <h2 className="mt-1 text-xl font-bold">
          {a.match.home.name} — {a.match.away.name}
        </h2>
        <p className="mt-3 text-sm leading-6 text-neutral-200">
          {a.conclusion}
        </p>
        <p className="mt-2 text-xs leading-5 text-neutral-400">{a.caution}</p>
        <p className="mt-2 text-[11px] text-neutral-500">
          Presek podataka: {analyticDate(a.asOf)}. Naknadno uvezeni ili
          ispravljeni podaci nisu dostupni ranijem preseku.
        </p>
      </div>
      <AnalyticsTabs id="match-detail" value={view} onChange={setView} items={[
        { value: 'comparison', label: 'Poređenje', icon: ChartNoAxesCombined },
        { value: 'form', label: 'Forma', icon: History },
        { value: 'h2h', label: 'H2H', icon: ArrowLeftRight },
        { value: 'htft', label: 'HT/FT', icon: Shuffle },
      ]} />
      <div id="match-detail-panel" role="tabpanel" aria-labelledby={`match-detail-${view}`} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Obuhvat takmičenja"
          value={a.scope}
          onChange={(e) => onScope(e.target.value as "all" | "league")}
          className="rounded-lg border border-white/15 bg-neutral-900 p-2 text-xs"
        >
          <option value="all">Sva takmičenja</option>
          <option value="league">Samo ova liga</option>
        </select>
        {(view === 'comparison' || view === 'form') && (["last5", "last10", "venue5"] as const).map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => setWindow(key)}
            className={`rounded-lg border px-3 py-2 text-xs ${window === key ? "border-gold-500 bg-gold-500 text-black" : "border-white/10 text-neutral-400"}`}
          >
            {key === "last5"
              ? "Poslednjih 5"
              : key === "last10"
                ? "Poslednjih 10"
                : "Domaći / gostujući · 5"}
          </button>
        ))}
      </div>
      {view === 'comparison' && <>
      {availableMetrics.length ?
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#141414]">
        <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-white/10 p-3 text-xs font-bold">
          <span>Pokazatelj</span>
          <span>{a.match.home.name}</span>
          <span>{a.match.away.name}</span>
        </div>
        {availableMetrics.map(
          (key) => (
            <div
              key={key}
              className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-white/5 p-3 text-xs last:border-0"
            >
              <span className="self-center text-neutral-400">
                {labels[key]}
              </span>
              {[home, away].map((team, index) => {
                const m = team.metrics[key];
                return (
                  <button
                    type="button"
                    key={index}
                    onClick={() => showSample(m, team, labels[key])}
                    disabled={!m.available}
                    className="text-left disabled:cursor-default"
                  >
                    <strong className="text-base tabular-nums">
                      {m.value === null ? "—" : m.value.toFixed(2)}
                    </strong>
                    <span className="block text-[10px] text-neutral-500">
                      {m.available}/{m.total} utakmica
                    </span>
                  </button>
                );
              })}
            </div>
          ),
        )}
      </div> : <p className="border-y border-white/10 py-6 text-sm text-neutral-400">Za ovaj presek nema dovoljno potvrđenih podataka za poređenje timova.</p>}
      {!home.metrics.xg.available && !away.metrics.xg.available && (
        <p className="text-xs text-neutral-400">
          xG nije dostupan za ovaj uzorak. Dostupni rezultati i poluvremena
          ostaju prikazani.
        </p>
      )}
      </>}
      {view === 'form' && <>
      <div className="grid gap-4 lg:grid-cols-2">
        {[home, away].map((team, index) => (
          <div key={index} className="min-w-0">
            <h3 className="text-sm font-bold">
              {index === 0 ? a.match.home.name : a.match.away.name} · forma
            </h3>
            <AnalyticsMatchList matches={team.matches} onOpen={onOpen} />
            {!team.matches.length && (
              <p className="py-3 text-xs text-neutral-500">
                Nema završenih utakmica poznatih pre ovog preseka.
              </p>
            )}
            {team.extremes && (
              <p className="mt-2 text-xs leading-5 text-neutral-400">
                Najveći učinak: {team.extremes.goals} golova. Prosek bez tog
                meča: {team.extremes.averageWithout.toFixed(2)} (sa njim:{" "}
                {team.metrics.goalsFor.value?.toFixed(2)}).
              </p>
            )}
            {team.context.knownEventMatches > 0 && (
              <p className="mt-2 text-xs text-neutral-400">
                Penali (gol) u uzorku: {team.context.penalties} · dostupni
                događaji {team.context.knownEventMatches}/{team.matches.length}.
              </p>
            )}
            {team.context.knownCardMatches > 0 && (
              <p className="mt-2 text-xs text-neutral-400">
                Rani crveni (≤30′) u mečevima: {team.context.earlyReds} ·
                poznati kartoni {team.context.knownCardMatches}/
                {team.matches.length}.
              </p>
            )}
          </div>
        ))}
      </div>
      </>}
      {view === 'h2h' &&
      <div className="border-t border-white/10 pt-4">
        <h3 className="text-sm font-bold">H2H · prethodni međusobni susreti</h3>
        <AnalyticsMatchList matches={a.h2h} onOpen={onOpen} />
        {!a.h2h.length && (
          <p className="py-3 text-xs text-neutral-500">
            Nema prethodno poznatih međusobnih susreta.
          </p>
        )}
      </div>}
      {view === 'htft' &&
      <div className="border-t border-white/10 pt-4">
        <h3 className="text-sm font-bold">Poluvreme / kraj · HT/FT</h3>
        <p className="mt-1 text-xs text-neutral-500">
          1 i 2 označavaju domaćina i gosta konkretnog susreta. Uzorak uključuje
          samo poznat HT i rezultat posle 90 minuta.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-9">
          {a.htft.map((item) => (
            <div
              key={item.code}
              className="rounded-lg border border-white/10 p-2 text-center"
            >
              <strong className="text-xs text-gold-300">{item.code}</strong>
              <span className="mt-1 block text-sm tabular-nums">
                {item.count}/{item.denominator}
              </span>
            </div>
          ))}
        </div>
      </div>}
      {view === 'form' && a.opponentStrength.some((item) => item.sample > 0) && (
        <details className="border-t border-white/10 py-3">
          <summary className="cursor-pointer text-sm font-bold">
            Snaga ranijih protivnika pre susreta
          </summary>
          <div className="mt-3 space-y-2">
            {a.opponentStrength
              .filter((item) => item.sample > 0)
              .map((item) => (
                <p key={item.matchId} className="text-xs text-neutral-400">
                  {
                    [...a.home.last10.matches, ...a.away.last10.matches].find(
                      (m) => m.id === item.matchId,
                    )?.home.name
                  }{" "}
                  — prosek protivnika pre tog meča:{" "}
                  {item.pointsPerMatch?.toFixed(2)} bodova ({item.sample}{" "}
                  utakmica).
                </p>
              ))}
          </div>
        </details>
      )}
      </div>
      {drill && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setDrill(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={drill.label}
            className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-lg border border-white/15 bg-[#141414] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">
                {drill.label} · konkretan uzorak
              </h3>
              <button
                type="button"
                aria-label="Zatvori uzorak"
                onClick={() => setDrill(null)}
              >
                <X size={18} />
              </button>
            </div>
            <AnalyticsMatchList matches={drill.matches} />
          </div>
        </div>
      )}
    </section>
  );
}
