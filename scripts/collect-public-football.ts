import { loadOpenPublicDatasets } from '../server/publicFootball/sync.js';
import { COLLECTOR_BACKFILL_DAYS, COLLECTOR_LOOKAHEAD_DAYS, filterStaleCollectorDatasets, validateCollectorFreshness } from '../server/publicFootball/collector.js';
import { addDays, localDate } from '../server/sportsApi.js';

const baseUrl = process.env.ELITE_COLLECTOR_URL || 'https://eliteviptips.com/api/football-analytics';
const audience = 'https://eliteviptips.com/api/football-analytics';
const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if (!requestUrl || !requestToken) throw new Error('GitHub Actions OIDC kredencijali nisu dostupni.');

async function getOidcToken() {
  const url = new URL(requestUrl!);
  url.searchParams.set('audience', audience);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${requestToken}` }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`OIDC token nije izdat (HTTP ${response.status}).`);
  const body = await response.json() as { value?: string };
  if (!body.value) throw new Error('OIDC odgovor nema token.');
  return body.value;
}

const token = await getOidcToken();
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
const statusResponse = await fetch(`${baseUrl}?action=public-sync-status`, { headers, signal: AbortSignal.timeout(20_000) });
if (!statusResponse.ok) throw new Error(`Turso sync status nije dostupan (HTTP ${statusResponse.status}).`);
const status = await statusResponse.json() as { alreadySynced?: boolean; snapshotVerified?: boolean };
if (status.alreadySynced && status.snapshotVerified) {
  console.log('Javni snapshot je već uspešno sinhronizovan za današnji datum; preskačem izvore.');
  process.exit(0);
}

const now = new Date();
const today = localDate(now);
const from = addDays(today, -COLLECTOR_BACKFILL_DAYS);
const to = addDays(today, COLLECTOR_LOOKAHEAD_DAYS);
const providerRequests: Record<string, number> = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['raw.githubusercontent.com', 'openfootball.github.io', 'api.github.com'].includes(url.hostname))
    providerRequests[url.hostname] = (providerRequests[url.hostname] || 0) + 1;
  return originalFetch(input, init);
};

let datasets: Awaited<ReturnType<typeof loadOpenPublicDatasets>>;
try { datasets = await loadOpenPublicDatasets(now, { includeOpenLigaDB: false }); }
finally { globalThis.fetch = originalFetch; }
const windowed = datasets.map(dataset => ({
  ...dataset,
  records: dataset.records.filter(record => {
    if (record.provider !== 'openfootball') return false;
    const date = record.kickoffAt ? localDate(new Date(record.kickoffAt)) : record.matchDate || '';
    return date >= from && date <= to;
  }),
}));
const filtered = filterStaleCollectorDatasets(windowed, now);
const freshness = validateCollectorFreshness(filtered, now);
const transmittedMatches = filtered.reduce((total, dataset) => total + dataset.records.length, 0);
const body = JSON.stringify({ datasets: filtered });
if (Buffer.byteLength(body) > 1_900_000) throw new Error('Collector paket je prevelik; ništa nije poslato.');

const response = await fetch(`${baseUrl}?action=public-sync-ingest`, {
  method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body,
  signal: AbortSignal.timeout(210_000),
});
let result = await response.json().catch(() => ({})) as Record<string, any>;
if (!response.ok) throw new Error(`Turso sinhronizacija nije prihvaćena (HTTP ${response.status}).`);
if (result.skipped === true) {
  const latestResponse = await fetch(`${baseUrl}?action=public-sync-status`, { headers, signal: AbortSignal.timeout(20_000) });
  const latest = latestResponse.ok ? await latestResponse.json() as { alreadySynced?: boolean; snapshotVerified?: boolean } : {};
  if (!latest.alreadySynced || !latest.snapshotVerified) throw new Error('Collector je preskočen, ali Turso snapshot nije potvrđen kao svež.');
  result = { ...result, verifiedByStatus: true };
} else {
  const receipt = result.snapshotWrite;
  if (!['complete', 'partial'].includes(result.status) || receipt?.provider !== 'turso' || receipt?.verified !== true
    || typeof receipt.version !== 'string' || receipt.version.length === 0
    || !Number.isInteger(receipt.matchCount) || receipt.matchCount !== result.finalMatches)
    throw new Error('Turso upis nema validan read-back receipt; workflow neće prijaviti uspeh.');
}
console.log(JSON.stringify({ window: { from, to }, freshness, providerRequests, datasets: filtered.map(({ name, state, records }) => ({ name, state, records: records.length })), transmittedMatches, result }));
