import type { PublicFootballPageData } from '../../src/types/publicFootball.js';
import { PUBLIC_ORIGIN, leaguePath, matchPath, pairPath, teamPath } from './paths.js';

export function publicPageSeo(data: PublicFootballPageData, params: URLSearchParams) {
  let path = '/fudbal', title = 'Fudbalska statistika';
  let description = 'Raspoloživi fudbalski rezultati, HT/FT prelazi i forma timova. Pretražite predstojeće utakmice uz jasno označen uzorak i nedostajuće podatke.';
  const crumbs = [{ name: 'Početna', path: '/' }, { name: 'Fudbalska statistika', path: '/fudbal' }];
  let entity: Record<string, unknown> | null = null;
  if (data.match) {
    const match = data.match;
    path = matchPath(match); title = `${match.homeTeam} - ${match.awayTeam}, ${match.date}: statistika i H2H`;
    description = `${match.homeTeam} - ${match.awayTeam}, ${match.league.name}, ${match.date}. Poznati HT/FT rezultati, forma oba tima i raniji međusobni susreti iz javnih izvora.`;
    crumbs.push({ name: match.league.name, path: leaguePath(match.league.slug) }, { name: `${match.homeTeam} - ${match.awayTeam}`, path });
    entity = { '@type': 'SportsEvent', name: `${match.homeTeam} - ${match.awayTeam}`, sport: 'Soccer', startDate: match.kickoffAt || match.date,
      url: PUBLIC_ORIGIN + path, homeTeam: { '@type': 'SportsTeam', name: match.homeTeam }, awayTeam: { '@type': 'SportsTeam', name: match.awayTeam } };
  } else if (data.league) {
    path = leaguePath(data.league.slug); title = `${data.league.name}: rezultati, raspored i HT/FT`;
    description = `${data.league.name}, ${data.league.country}: ${data.aggregate.finished} završenih utakmica u javnom uzorku. Rezultati, raspored, forma i HT/FT za sezone ${data.league.seasons.join(', ')}.`;
    crumbs.push({ name: data.league.name, path });
  } else if (data.team) {
    path = teamPath(data.team); title = `${data.team.name}: statistika, forma i rezultati`;
    description = `${data.team.name}, ${data.team.country}: ${data.teamSummary?.played || 0} završenih utakmica u raspoloživom uzorku. Forma poslednjih 5 i 10 mečeva, golovi, HT/FT i preokreti.`;
    crumbs.push({ name: 'Timovi', path: '/timovi' }, { name: data.team.name, path });
    entity = { '@type': 'SportsTeam', name: data.team.name, sport: 'Soccer', url: PUBLIC_ORIGIN + path };
  } else if (data.pair) {
    path = pairPath(data.pair.first, data.pair.second); title = `${data.pair.first.name} - ${data.pair.second.name}: H2H i međusobni rezultati`;
    description = `${data.pair.first.name} i ${data.pair.second.name}: ${data.aggregate.finished} završenih međusobnih susreta u javnom uzorku, rezultati poluvremena i kraja, golovi i HT/FT.`;
    crumbs.push({ name: 'H2H', path: '/h2h' }, { name: `${data.pair.first.name} - ${data.pair.second.name}`, path });
  } else if (data.page === 'teams') {
    path = '/timovi'; title = 'Fudbalski timovi: statistika, forma i rezultati';
    description = 'Pronađite tim i pregledajte stvarne rezultate, formu poslednjih utakmica, golove i HT/FT obrasce iz raspoloživih javnih izvora.';
    crumbs.push({ name: 'Timovi', path });
  } else if (data.page === 'h2h') {
    path = '/h2h'; title = 'H2H fudbalska statistika i međusobni rezultati';
    description = 'Pretraga stvarnih međusobnih susreta fudbalskih timova. Poznati HT/FT rezultati, golovi, uzorak i javna istorija susreta.';
    crumbs.push({ name: 'H2H', path });
  } else if (data.page === 'today') {
    path = '/analize-danas'; title = 'Analize utakmica danas: raspored, forma i H2H';
    description = `Javni statistički pregled utakmica za ${data.today}: raspored, dostupna forma i HT/FT uzorak. VIP prognoze ostaju dostupne prema postojećim pravilima pristupa.`;
    crumbs.push({ name: 'Analize danas', path });
  } else if (data.page === 'finder') {
    path = '/match-finder'; title = 'Match Finder: pretraga fudbalskih utakmica';
    crumbs.push({ name: 'Match Finder', path });
  }
  if (data.page === 'overview') description = 'Detaljna statistika utakmica, klubova i liga.';
  const noindex = data.page === 'finder' || !!data.pair && !data.pair.finished
    || ['from', 'to', 'league', 'form', 'over25', 'btts', 'comebacks', 'sample', 'offset', 'upcomingOffset', 'search', 'season'].some(key => params.has(key));
  const structured = { '@context': 'https://schema.org', '@graph': [
    { '@type': entity ? 'WebPage' : 'CollectionPage', name: title, url: PUBLIC_ORIGIN + path, inLanguage: 'sr-Latn', description,
      ...(entity ? { mainEntity: entity } : {}) },
    { '@type': 'BreadcrumbList', itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: PUBLIC_ORIGIN + crumb.path })) },
  ] };
  return { path, title, description, noindex, structured, crumbs };
}
