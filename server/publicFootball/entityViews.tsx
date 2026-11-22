import React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { PublicFootballPageData } from '../../src/types/publicFootball.js';
import { Form, Metric, ResultTable, publicDate, publicPercent } from './components.js';
import { leaguePath, pairPath, teamPath } from './paths.js';

export function DirectoryView({ data, params }: { data: PublicFootballPageData; params: URLSearchParams }) {
  const teams = data.page === 'teams', path = teams ? '/timovi' : '/h2h';
  const pageLink = (offset: number) => `${path}?${new URLSearchParams({ ...(params.get('search') ? { search: params.get('search')! } : {}),
    ...(params.get('league') ? { league: params.get('league')! } : {}), offset: String(offset) })}`;
  return <>
    <form className="fp-filters" method="get" action={path}><div className="fp-filter-grid">
      <label>{teams ? 'Naziv tima' : 'Tim u međusobnom susretu'}<input type="search" name="search" defaultValue={data.filters.search} maxLength={60}/></label>
      <label>Liga<select name="league" defaultValue={data.filters.league}><option value="">Sve dostupne lige</option>{data.leagues.map(league => <option key={league.slug} value={league.slug}>{league.name}</option>)}</select></label>
      <div className="fp-filter-actions"><button className="fp-button fp-primary" type="submit"><Search size={15}/>Pronađi</button><a className="fp-button" href={path}>Resetuj</a></div>
    </div></form>
    <section className="fp-section"><div className="fp-section-heading"><h2>{teams ? 'Timovi u javnoj bazi' : 'Međusobni susreti u bazi'}</h2><span>{data.directoryTotal} u pregledu</span></div>
      <div className="fp-directory-list">{teams ? data.teams?.map(team => <a href={teamPath(team)} className="fp-directory-row" key={team.slug}>
        <span><strong>{team.name}</strong><small>{team.country} · {team.seasons.join(', ')}</small></span><span>{team.finished} završenih / {team.matches} ukupno</span><ChevronRight size={15}/>
      </a>) : data.pairs?.map(pair => <a href={pairPath(pair.first, pair.second)} className="fp-directory-row" key={pair.first.slug + '/' + pair.second.slug}>
        <span><strong>{pair.first.name} — {pair.second.name}</strong><small>Poslednji zabeležen termin: {publicDate(pair.latestDate)}</small></span><span>{pair.finished} završenih susreta</span><ChevronRight size={15}/>
      </a>)}</div>
      {!data.directoryTotal && <p className="fp-empty">Nema javnih podataka za ovaj izbor. Probajte drugi naziv ili ligu.</p>}
      <nav className="fp-pagination" aria-label="Stranice pregleda">{data.filters.offset > 0 ? <a className="fp-button" href={pageLink(Math.max(0, data.filters.offset - 30))}><ChevronLeft size={14}/>Prethodnih 30</a> : <span/>}
        <span>{data.directoryTotal ? `${data.filters.offset + 1}–${Math.min(data.filters.offset + 30, data.directoryTotal)} od ${data.directoryTotal}` : '0 rezultata'}</span>
        {data.directoryMore ? <a className="fp-button" href={pageLink(data.filters.offset + 30)}>Sledećih 30<ChevronRight size={14}/></a> : <span/>}
      </nav>
    </section>
  </>;
}

export function TeamOverview({ data }: { data: PublicFootballPageData }) {
  const team = data.team!, summary = data.teamSummary!;
  return <>
    <p className="fp-entity-intro">Za tim {team.name} u izabranom javnom uzorku imamo {summary.played} završenih utakmica: {summary.won} pobeda, {summary.drawn} remija i {summary.lost} poraza. Poznat rezultat poluvremena i kraja postoji za {summary.htftSample} utakmica. Podaci obuhvataju raspoložive sezone, a ne kompletnu istoriju kluba.</p>
    <div className="fp-metrics"><Metric label="Odigrano" value={summary.played} note={`${summary.home} kod kuće / ${summary.away} u gostima`}/><Metric label="Pobede / remiji / porazi" value={`${summary.won} / ${summary.drawn} / ${summary.lost}`}/>
      <Metric label="Prosek datih golova" value={summary.played ? (summary.goalsFor / summary.played).toFixed(2) : '—'}/><Metric label="Prosek primljenih golova" value={summary.played ? (summary.goalsAgainst / summary.played).toFixed(2) : '—'}/></div>
    <div className="fp-team-comparison"><section><h2>Forma poslednjih 5 utakmica</h2><Form label={team.name} form={summary.form5}/></section><section><h2>Forma poslednjih 10 utakmica</h2><Form label={team.name} form={summary.form10}/></section></div>
    <div className="fp-inline-stats"><Metric label="Napravljen potpuni preokret" value={summary.madeComebacks} note={`HT/FT uzorak ${summary.htftSample}`}/><Metric label="Izgubljeno vođstvo i poraz" value={summary.concededComebacks} note="Utakmice 1/2 ili 2/1, iz ugla ovog tima"/></div>
    <nav className="fp-entity-links" aria-label="Lige ovog tima">{data.leagues.filter(league => team.leagues.includes(league.slug)).map(league => <a href={leaguePath(league.slug)} key={league.slug}>{league.name}</a>)}</nav>
  </>;
}

export function PairOverview({ data }: { data: PublicFootballPageData }) {
  const pair = data.pair!;
  return <>
    <p className="fp-entity-intro">Međusobni rezultati timova <a href={teamPath(pair.first)}>{pair.first.name}</a> i <a href={teamPath(pair.second)}>{pair.second.name}</a>. Pregled sadrži samo susrete koji postoje u javnim izvorima; raspoloživi uzorak ne predstavlja prognozu naredne utakmice.</p>
    <div className="fp-metrics"><Metric label="Završeni H2H susreti" value={data.aggregate.finished}/><Metric label="Poznat HT + FT" value={data.aggregate.withHtFt}/>
      <Metric label="Over 2.5" value={publicPercent(data.aggregate.over25Ft.percent)} note={`uzorak ${data.aggregate.over25Ft.sample}`}/><Metric label="Oba tima daju gol" value={publicPercent(data.aggregate.btts.percent)} note={`uzorak ${data.aggregate.btts.sample}`}/></div>
    <section className="fp-section"><div className="fp-section-heading"><h2>Istorija međusobnih susreta</h2><span>Uzorak {data.resultsTotal}</span></div>
      {data.results.length ? <ResultTable matches={data.results}/> : <p className="fp-empty">Za ovaj par još nema potvrđenih konačnih rezultata u javnom uzorku.</p>}
    </section>
  </>;
}
