import type { PublicMatch } from '../../src/types/publicFootball.js';
import type { ImportedTipRow } from './csv.js';
import { digest, fixtureIdentity } from './csv.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type ResultEvidence = {
  state: 'confirmed' | 'unconfirmed' | 'conflict'; note: string;
  source?: string; matchId?: string; checkedAt?: string; time?: string; kickoffAt?: string;
};
export type VerificationReport = { byIdentity: Record<string, ResultEvidence>; requests: number; warnings: string[] };

export async function verifyHistoricalResults(rows: ImportedTipRow[], options: {
  cacheDirectory?: string; fetcher?: typeof fetch; now?: Date;
} = {}): Promise<VerificationReport> {
  const now = options.now || new Date(), fetcher = options.fetcher || fetch;
  const cache = path.resolve(options.cacheDirectory || '.local-data/history-import-verification');
  const report: VerificationReport = { byIdentity: {}, requests: 0, warnings: [] };
  const read = async (route: string): Promise<any> => {
    const file = path.join(cache, digest(route) + '.json');
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (saved.savedAt <= now.getTime() && now.getTime() - saved.savedAt < 6 * 3600000) return saved.data;
    } catch { /* Missing or stale evidence is requested again, never treated as a result. */ }
    report.requests++;
    const response = await fetcher('https://eliteviptips.com/api/public-football' + route, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Javni izvor je vratio HTTP ${response.status}.`);
    const data = await response.json();
    if (!data || !Array.isArray(data.leagues) || !Array.isArray(data.results)) throw new Error('Izvor je vratio neispravan format.');
    await mkdir(cache, { recursive: true });
    await writeFile(file, JSON.stringify({ savedAt: now.getTime(), data }));
    return data;
  };
  let catalogue: any;
  try { catalogue = await read(''); }
  catch (error) { report.warnings.push((error as Error).message); }
  const groups = new Map<string, { slug: string; season: string; rows: ImportedTipRow[] }>();
  for (const row of rows) {
    report.byIdentity[row.identity] = { state: 'unconfirmed', note: 'Nezavisni izvor nije potvrdio datum i rezultat.' };
    const league = catalogue?.leagues.find((value: any) => {
      try { return fixtureIdentity(row.date, value.name, row.home, row.away) === row.fixtureKey && value.country === row.country; }
      catch { return false; }
    });
    if (!league) continue;
    const start = Number(row.date.slice(0, 4)) - Number(Number(row.date.slice(5, 7)) < 7);
    const season = league.seasons?.find((value: string) => value === `${start}/${String(start + 1).slice(-2)}` || value === `${start}/${start + 1}`);
    if (!season) continue;
    const key = league.slug + '|' + season;
    if (!groups.has(key)) groups.set(key, { slug: league.slug, season, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  for (const group of groups.values()) {
    const earliest = group.rows.map(row => row.date).sort()[0], matches = new Map<string, PublicMatch[]>(), ids = new Set<string>();
    try {
      let offset = 0;
      for (;;) {
        const data = await read('?' + new URLSearchParams({ action: 'league', slug: group.slug, season: group.season, offset: String(offset) }));
        if (data.league?.slug !== group.slug) throw new Error('Izvor nije potvrdio identitet lige.');
        const page = data.results as PublicMatch[];
        for (const match of page) {
          if (ids.has(match.id)) throw new Error('Izvor ponavlja istu stranicu rezultata.');
          ids.add(match.id);
          if (match.status !== 'finished' || match.season !== group.season || ![match.ft.home, match.ft.away].every(value => Number.isInteger(value) && Number(value) >= 0)) continue;
          const key = fixtureIdentity(match.date, match.league.name, match.homeTeam, match.awayTeam);
          matches.set(key, [...(matches.get(key) || []), match]);
        }
        if (!page.length || !data.resultsMore || page.every(match => match.date < earliest)) break;
        offset += page.length;
      }
      for (const row of group.rows) {
        const found = matches.get(row.fixtureKey) || [];
        if (!found.length) continue;
        const identical = found.every(match => match.ft.home === row.homeScore && match.ft.away === row.awayScore);
        const match = found[0];
        report.byIdentity[row.identity] = { state: identical ? 'confirmed' : 'conflict',
          note: identical ? 'Datum, timovi, liga i FT rezultat poklapaju se sa nezavisnim javnim izvorom.' : `Izvor se ne slaze sa CSV rezultatom (izvor: ${match.ft.home}:${match.ft.away}).`,
          source: match.sources.join(', '), matchId: match.id, checkedAt: now.toISOString(),
          ...(match.kickoffAt ? { kickoffAt: match.kickoffAt, time: new Date(match.kickoffAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit' }) } : {}),
        };
      }
    } catch (error) { report.warnings.push(`${group.slug} ${group.season}: ${(error as Error).message}`); }
  }
  return report;
}
