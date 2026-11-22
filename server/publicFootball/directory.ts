import type { PublicMatch, PublicPair, PublicSnapshot, PublicTeam, PublicTeamSummary } from '../../src/types/publicFootball.js';
import { publicCurrentTeamForm, publicTransition } from './stats.js';
import { publicTeamSlug } from './paths.js';
import { localDate } from '../sportsApi.js';

type Directory = { teams: PublicTeam[]; pairs: PublicPair[]; teamBySlug: Map<string, PublicTeam>; pairByKey: Map<string, PublicPair> };
const cache = new WeakMap<PublicSnapshot, Directory>();
export const publicPairKey = (first: string, second: string) => [first, second].sort().join('/');

export function publicDirectory(snapshot: PublicSnapshot): Directory {
  const existing = cache.get(snapshot);
  if (existing) return existing;
  const teamBySlug = new Map<string, PublicTeam>(), pairByKey = new Map<string, PublicPair>();
  for (const match of snapshot.matches) {
    const participants = [match.homeTeam, match.awayTeam].map(name => {
      const slug = publicTeamSlug(name, match.league.country);
      const team = teamBySlug.get(slug) || { slug, name, country: match.league.country, leagues: [], seasons: [], matches: 0, finished: 0 };
      team.matches++;
      team.finished += Number(match.status === 'finished' && match.ft.home !== null && match.ft.away !== null);
      if (!team.leagues.includes(match.league.slug)) team.leagues.push(match.league.slug);
      if (!team.seasons.includes(match.season)) team.seasons.push(match.season);
      teamBySlug.set(slug, team);
      return team;
    }).sort((a, b) => a.slug.localeCompare(b.slug));
    if (participants[0].slug === participants[1].slug) continue;
    const key = publicPairKey(participants[0].slug, participants[1].slug);
    const pair = pairByKey.get(key) || { first: participants[0], second: participants[1], leagues: [], matches: 0, finished: 0, latestDate: '' };
    pair.matches++;
    pair.finished += Number(match.status === 'finished' && match.ft.home !== null && match.ft.away !== null);
    if (match.date > pair.latestDate) pair.latestDate = match.date;
    if (!pair.leagues.includes(match.league.slug)) pair.leagues.push(match.league.slug);
    pairByKey.set(key, pair);
  }
  const value = { teams: [...teamBySlug.values()].sort((a, b) => a.name.localeCompare(b.name) || a.country.localeCompare(b.country)),
    pairs: [...pairByKey.values()].sort((a, b) => b.latestDate.localeCompare(a.latestDate) || publicPairKey(a.first.slug, a.second.slug).localeCompare(publicPairKey(b.first.slug, b.second.slug))),
    teamBySlug, pairByKey };
  for (const team of value.teams) team.seasons.sort().reverse();
  cache.set(snapshot, value);
  return value;
}

export const isPublicTeamMatch = (match: PublicMatch, team: PublicTeam) => match.league.country === team.country
  && [match.homeTeam, match.awayTeam].some(name => publicTeamSlug(name, match.league.country) === team.slug);

export function publicTeamSummary(matches: PublicMatch[], team: PublicTeam, now = new Date()): PublicTeamSummary {
  const completed = matches.filter(match => isPublicTeamMatch(match, team) && match.status === 'finished'
    && match.ft.home !== null && match.ft.away !== null && match.date <= localDate(now));
  let won = 0, drawn = 0, lost = 0, goalsFor = 0, goalsAgainst = 0, home = 0, madeComebacks = 0, concededComebacks = 0, htftSample = 0;
  for (const match of completed) {
    const atHome = publicTeamSlug(match.homeTeam, match.league.country) === team.slug;
    const scored = atHome ? match.ft.home! : match.ft.away!, conceded = atHome ? match.ft.away! : match.ft.home!;
    won += Number(scored > conceded); drawn += Number(scored === conceded); lost += Number(scored < conceded);
    goalsFor += scored; goalsAgainst += conceded; home += Number(atHome);
    const transition = publicTransition(match);
    htftSample += Number(transition !== null);
    if (['1/2', '2/1'].includes(transition || '')) {
      madeComebacks += Number(scored > conceded);
      concededComebacks += Number(scored < conceded);
    }
  }
  return { played: completed.length, won, drawn, lost, goalsFor, goalsAgainst, home, away: completed.length - home,
    madeComebacks, concededComebacks, htftSample,
    form5: publicCurrentTeamForm(completed, team, 5), form10: publicCurrentTeamForm(completed, team, 10) };
}
