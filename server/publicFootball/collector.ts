import { ENGLISH_PYRAMID, englishLeague } from '../footballAnalytics/englishPyramid.js';
import { hashId, nameKey } from '../footballAnalytics/normalization.js';
import { addDays, localDate } from '../sportsApi.js';
import type { MatchObservation } from '../../src/types/footballAnalytics.js';
import type { PublicMatch, PublicSnapshot } from '../../src/types/publicFootball.js';
import { buildLocalOpenFootballFallback } from './localOpenFootballFallback.js';
import { mapPublicFootballMatch, PUBLIC_FIELDS, publicSource, type PublicInput } from './policy.js';
import { publicSnapshotVersion, snapshotFromMatches } from './store.js';

const MAX_DATASETS = 24;
const MAX_MATCHES = 5_000;
export const COLLECTOR_BACKFILL_DAYS = 30;
export const COLLECTOR_LOOKAHEAD_DAYS = 14;

export type CollectorDataset = { name: string; state: 'available' | 'unavailable' | 'error'; records: MatchObservation[]; reason?: string };

const complete = (score: { home: number | null; away: number | null }) => Number.isInteger(score.home) && Number.isInteger(score.away)
  && score.home !== null && score.away !== null && score.home >= 0 && score.away >= 0;
const identity = (match: PublicMatch) => [match.league.slug, match.season.slice(0, 4), nameKey(match.homeTeam), nameKey(match.awayTeam), match.date].join(':');
const facts = (match: PublicMatch) => JSON.stringify({ ...match, checkedAt: null });
const isScorePair = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value)
  && ['home', 'away'].every(key => (value as Record<string, unknown>)[key] === null
    || Number.isInteger((value as Record<string, unknown>)[key]) && Number((value as Record<string, unknown>)[key]) >= 0 && Number((value as Record<string, unknown>)[key]) < 100);

export function parseCollectorDatasets(value: unknown): CollectorDataset[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Neispravan collector payload.');
  const input = (value as { datasets?: unknown }).datasets;
  if (!Array.isArray(input) || input.length > MAX_DATASETS) throw new Error('Collector payload nema validnu listu skupova.');
  let total = 0;
  return input.map((entry: any) => {
    if (!entry || typeof entry.name !== 'string' || !['available', 'unavailable', 'error'].includes(entry.state) || !Array.isArray(entry.records))
      throw new Error('Collector payload sadrži neispravan skup.');
    total += entry.records.length;
    if (total > MAX_MATCHES) throw new Error('Collector payload prelazi dozvoljeni broj utakmica.');
    for (const row of entry.records as MatchObservation[]) {
      const league = typeof row?.league?.name === 'string' ? englishLeague(row.league.name) : null;
      if (!row || row.provider !== 'openfootball' || row.environment !== 'real' || typeof row.sourceId !== 'string'
        || row.sourceId.length < 1 || row.sourceId.length > 200 || !row.league || typeof row.league.name !== 'string'
        || row.league.country !== 'England' || !league || league.tier > 5 || !row.season || typeof row.season !== 'string'
        || !row.home || typeof row.home.name !== 'string' || !row.away || typeof row.away.name !== 'string'
        || !isScorePair(row.ht) || !isScorePair(row.ft) || !['scheduled', 'live', 'finished', 'postponed', 'canceled', 'unknown'].includes(row.status))
        throw new Error('Collector može poslati samo validne, stvarne OpenFootball zapise engleskih liga.');
    }
    return { name: entry.name.slice(0, 120), state: entry.state, records: entry.records,
      ...(typeof entry.reason === 'string' ? { reason: entry.reason.slice(0, 250) } : {}) };
  });
}

function toPublicInput(observation: MatchObservation): PublicInput {
  const fields = Object.fromEntries(PUBLIC_FIELDS.map(field => [field, field.split('.').reduce((value: any, key) => value?.[key], observation)]));
  const provenance = Object.fromEntries(PUBLIC_FIELDS.map(field => [field, { provider: observation.provider, observedAt: observation.observedAt }]));
  return { environment: observation.environment, fields, provenance };
}

function mergeMatch(current: PublicMatch | undefined, incoming: PublicMatch): { match: PublicMatch; changed: boolean; conflict: boolean } {
  if (!current) return { match: incoming, changed: true, conflict: false };
  const currentFt = complete(current.ft), incomingFt = complete(incoming.ft);
  const preserveFinished = current.status === 'finished' && currentFt;
  const conflict = currentFt && incomingFt && (current.ft.home !== incoming.ft.home || current.ft.away !== incoming.ft.away);
  const ft = currentFt || conflict ? current.ft : incoming.ft;
  const currentHt = complete(current.ht);
  const incomingHtValid = complete(incoming.ht) && complete(ft) && incoming.ht.home! <= ft.home! && incoming.ht.away! <= ft.away!;
  const ht = currentHt ? current.ht : incomingHtValid ? incoming.ht : { home: null, away: null };
  const status = complete(ft) ? 'finished' : current.status === 'finished' ? current.status : incoming.status;
  const match: PublicMatch = {
    ...current,
    date: preserveFinished ? current.date : incoming.date,
    time: preserveFinished ? current.time : incoming.time || current.time,
    kickoffAt: preserveFinished ? current.kickoffAt : incoming.kickoffAt || current.kickoffAt,
    status,
    ft,
    ht,
    checkedAt: [current.checkedAt, incoming.checkedAt].filter((value): value is string => Boolean(value)).sort().at(-1) || null,
    sources: [...new Set([...current.sources, ...incoming.sources])].filter(publicSource).sort(),
  };
  return { match, changed: facts(match) !== facts(current), conflict };
}

export function buildTursoCollectorSnapshot(
  previous: PublicSnapshot | null,
  datasets: CollectorDataset[],
  now = new Date(),
) {
  if (!datasets.some(dataset => dataset.state === 'available'))
    throw new Error('Nijedan dozvoljeni OpenFootball skup nije uspešno preuzet; snapshot nije promenjen.');

  const base = previous || buildLocalOpenFootballFallback();
  const today = localDate(now);
  const from = addDays(today, -COLLECTOR_BACKFILL_DAYS);
  const to = addDays(today, COLLECTOR_LOOKAHEAD_DAYS);
  const next = new Map(base.matches.map(match => [match.id, match]));
  const byIdentity = new Map(base.matches.map(match => [identity(match), match]));
  const seen = new Set<string>();
  let received = 0, created = 0, updated = 0, unchanged = 0, conflicts = 0, rejected = 0;

  for (const dataset of datasets) for (const observation of dataset.records) {
    received++;
    if (observation.provider !== 'openfootball' || observation.environment !== 'real') { rejected++; continue; }
    const date = observation.kickoffAt ? localDate(new Date(observation.kickoffAt)) : observation.matchDate || '';
    if (date < from || date > to) continue;
    const league = englishLeague(observation.league.name);
    if (!league || league.tier > 5) { rejected++; continue; }
    const id = hashId('openfootball-public', league.id, observation.season, nameKey(observation.home.name), nameKey(observation.away.name));
    const incoming = mapPublicFootballMatch(id, toPublicInput(observation), now);
    if (!incoming) { rejected++; continue; }
    const key = identity(incoming);
    if (seen.has(key)) {
      const duplicate = byIdentity.get(key);
      if (duplicate && complete(duplicate.ft) && complete(incoming.ft)
        && (duplicate.ft.home !== incoming.ft.home || duplicate.ft.away !== incoming.ft.away)) conflicts++;
      rejected++;
      continue;
    }
    seen.add(key);
    const current = next.get(id) || byIdentity.get(key);
    const merged = mergeMatch(current, incoming);
    if (merged.conflict) conflicts++;
    if (!current) created++;
    else if (merged.changed) updated++;
    else unchanged++;
    next.set(merged.match.id, merged.match);
    byIdentity.set(key, merged.match);
  }

  if (next.size > 20_000) throw new Error('Collector bi prešao ograničenje snapshot-a od 20.000 utakmica.');
  const collectorSync = { date: today, completedAt: now.toISOString(), source: 'openfootball' as const,
    received, created, updated, unchanged, conflicts, rejected };
  const snapshot = snapshotFromMatches([...next.values()].sort((a, b) => a.id.localeCompare(b.id)), now,
    base.truncated, base.excluded, base.provenance, collectorSync);
  const version = publicSnapshotVersion(snapshot);
  return { snapshot, version, summary: { date: today, from, to, received, created, updated, unchanged, conflicts, rejected,
    baseMatches: base.matches.length, finalMatches: snapshot.matches.length, version } };
}
