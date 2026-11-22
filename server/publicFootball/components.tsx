import React from 'react';
import type { PublicForm, PublicMatch } from '../../src/types/publicFootball.js';
import { matchPath } from './paths.js';
import { publicTransition } from './stats.js';

export const publicDate = (value: string) => value ? `${value.slice(8,10)}.${value.slice(5,7)}.${value.slice(0,4)}.` : '—';
export const publicPercent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
export const publicScore = (value: PublicMatch['ft']) => value.home === null ? '—' : `${value.home} : ${value.away}`;

export function Metric({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="fp-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export function Form({ label, form }: { label: string; form: PublicForm }) {
  return <div className="fp-form-stat"><span>{label}<small>uzorak {form.sample}/{form.expected}</small></span>
    {form.pointsPercent !== null ? <><strong>{publicPercent(form.pointsPercent)}</strong>
      <progress max="100" value={form.pointsPercent} aria-label={`${label}: udeo osvojenih bodova`}/>
      <div className="fp-form-results">{form.results.map((result, index) => <span className={`fp-result-${result.toLowerCase()}`} key={index}>{result === 'W' ? 'P' : result === 'D' ? 'N' : 'I'}</span>)}</div>
    </> : <p>Nema raspoloživog uzorka.</p>}
  </div>;
}

export function ResultTable({ matches }: { matches: PublicMatch[] }) {
  return <div className="fp-results"><div className="fp-results-head"><span>Datum / meč</span><span>HT</span><span>FT</span><span>Prelaz</span></div>
    {matches.map(match => <a className="fp-result-row" key={match.id} href={matchPath(match)}>
      <span><small>{publicDate(match.date)} · {match.league.name}</small><strong>{match.homeTeam} — {match.awayTeam}</strong></span>
      <span>{publicScore(match.ht)}</span><span className="fp-ft">{publicScore(match.ft)}</span><span>{publicTransition(match) || '—'}</span>
    </a>)}
  </div>;
}
