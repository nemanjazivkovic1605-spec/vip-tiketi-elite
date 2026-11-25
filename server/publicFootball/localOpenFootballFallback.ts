import archive from '../../data/match-history/england.json' with { type: 'json' };
import { ENGLISH_PYRAMID, englishClubName } from '../footballAnalytics/englishPyramid.js';
import { hashId, nameKey } from '../footballAnalytics/normalization.js';
import type { PublicMatch, PublicSnapshot } from '../../src/types/publicFootball.js';
import { snapshotFromMatches } from './store.js';

type ArchiveMatch = {
  date?: string;
  time?: string;
  team1?: string;
  team2?: string;
  score?: { ht?: unknown; ft?: unknown };
};
type ArchiveSeason = { season: string; sourcePath: string; sourceBlob: string; matches: ArchiveMatch[] };
type OpenFootballArchive = { source: string; asOf: string; seasons: ArchiveSeason[] };

const data = archive as OpenFootballArchive;
const score = (value: unknown): { home: number | null; away: number | null } => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((part) => Number.isInteger(part) && part >= 0 && part < 100))
    return { home: null, away: null };
  return { home: value[0] as number, away: value[1] as number };
};

export function buildLocalOpenFootballFallback(): PublicSnapshot {
  const asOf = /^20\d\d-\d\d-\d\d$/.test(data.asOf) ? data.asOf : '1970-01-01';
  const matches: PublicMatch[] = [];

  for (const seasonData of data.seasons) {
    const tier = Number(seasonData.sourcePath.match(/(?:^|\/)en\.(\d+)\.json$/)?.[1]);
    const league = ENGLISH_PYRAMID.find((entry) => entry.tier === tier);
    const season = seasonData.season.replace('-', '/');
    if (!league || !/^20\d\d\/\d\d$/.test(season)) continue;

    for (const row of seasonData.matches) {
      const homeTeam = englishClubName(row.team1 || '');
      const awayTeam = englishClubName(row.team2 || '');
      if (!/^\d{4}-\d\d-\d\d$/.test(row.date || '') || !homeTeam || !awayTeam || nameKey(homeTeam) === nameKey(awayTeam)) continue;

      const ft = score(row.score?.ft);
      const ht = score(row.score?.ht);
      const finished = row.date <= asOf && ft.home !== null;
      matches.push({
        id: hashId('openfootball-local', seasonData.sourceBlob, seasonData.sourcePath, row.date, nameKey(homeTeam), nameKey(awayTeam)),
        league: { slug: `england-${league.id}`, name: league.name, country: 'England' },
        season,
        date: row.date,
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(row.time || '') ? row.time! : null,
        kickoffAt: null,
        homeTeam,
        awayTeam,
        status: finished ? 'finished' : row.date > asOf ? 'scheduled' : 'unknown',
        ht: finished ? ht : { home: null, away: null },
        ft: finished ? ft : { home: null, away: null },
        checkedAt: null,
        sources: ['openfootball'],
      });
    }
  }

  return snapshotFromMatches(matches, new Date(`${asOf}T00:00:00.000Z`), false, 0);
}
