import type { AnalyticsDatabase } from '../footballAnalytics/database.js';
import { PUBLIC_FIELDS, mapPublicFootballMatch, type PublicInput } from './policy.js';
import type { PublicLeague, PublicSnapshot, PublicMatch, PublicSnapshotProvenance } from '../../src/types/publicFootball.js';
import { publicSource } from './policy.js';
import { localDate } from '../sportsApi.js';
import { createHash } from 'node:crypto';

const MAX_ROWS = 20000;
export function publicProjectionSql(kind: AnalyticsDatabase['kind']) {
  const value = (path: string[]) => kind === 'postgres' ? `m.payload::jsonb#>'{${path.join(',')}}'` : `json_extract(m.payload,'$${path.map(part=>`."${part}"`).join('')}')`;
  const object = (parts: string[]) => `${kind === 'postgres' ? 'jsonb_build_object' : 'json_object'}(${parts.join(',')})`;
  const fields = object(PUBLIC_FIELDS.flatMap(field=>[`'${field}'`, value(field.split('.'))]));
  const provenance = object(PUBLIC_FIELDS.flatMap(field=>[`'${field}'`, kind === 'postgres' ? value(['provenance',field]) : `json(${value(['provenance',field])})`]));
  return object(["'environment'",'m.environment',"'fields'",kind === 'postgres' ? fields : `json(${fields})`,"'provenance'",kind === 'postgres' ? provenance : `json(${provenance})`]);
}
// Admin bootstrap only. Public requests read the prepared single-row snapshot below.
export async function preparePublicFootball(db: AnalyticsDatabase, now = new Date()): Promise<PublicSnapshot> {
  const year = Number(localDate(now).slice(0,4)) - (Number(localDate(now).slice(5,7)) < 7 ? 1 : 0);
  const seasons = Array.from({length:4},(_,index)=>String(year-index));
  const rows = await db.query(`SELECT m.id,${publicProjectionSql(db.kind)} AS projected FROM fa_matches m
    JOIN (SELECT DISTINCT match_id FROM fa_sources WHERE environment=$1 AND provider IN ('openfootball','openligadb')) p ON p.match_id=m.id
    WHERE m.environment=$1 AND SUBSTR(m.season,1,4) IN ($2,$3,$4,$5)
    ORDER BY m.id LIMIT ${MAX_ROWS+1}`,['real',...seasons]);
  const matches = rows.slice(0,MAX_ROWS).map(row=>mapPublicFootballMatch(row.id, (typeof row.projected === 'string' ? JSON.parse(row.projected) : row.projected) as PublicInput,now)).filter((row):row is NonNullable<typeof row>=>!!row);
  return snapshotFromMatches(matches,now,rows.length>MAX_ROWS,Math.min(rows.length,MAX_ROWS)-matches.length);
}
export function snapshotFromMatches(matches: PublicSnapshot['matches'], now=new Date(), truncated=false, excluded=0, provenance?: PublicSnapshotProvenance[]):PublicSnapshot {
  const leagues = new Map<string,PublicLeague>();
  for (const match of matches) {
    const league = leagues.get(match.league.slug) || {...match.league,matches:0,finished:0,withHt:0,seasons:[],latestDate:'',sources:[]};
    league.matches++; league.finished+=Number(match.status==='finished'); league.withHt+=Number(match.status==='finished' && match.ht.home!==null);
    if(!league.seasons.includes(match.season))league.seasons.push(match.season);
    for(const source of match.sources)if(!league.sources.includes(source))league.sources.push(source);
    if(match.date>league.latestDate)league.latestDate=match.date;
    leagues.set(league.slug,league);
  }
  return {matches,leagues:[...leagues.values()].map(league=>({...league,seasons:league.seasons.sort().reverse()})).sort((a,b)=>a.country.localeCompare(b.country)||a.name.localeCompare(b.name)),loadedAt:now.toISOString(),lastUpdatedAt:matches.map(match=>match.checkedAt||'').sort().at(-1)||null,truncated,excluded,...(provenance?.length?{provenance}:{})};
}
export const publicSnapshotVersion=(snapshot:PublicSnapshot)=>createHash('sha256').update(JSON.stringify({
  matches:snapshot.matches,
  files:snapshot.provenance?.flatMap(source=>source.files.map(file=>({repository:source.repository,path:file.path,blobSha:file.blobSha})))||[],
})).digest('hex');
export const PUBLIC_SNAPSHOT_ID='football-v1';
export type PublicSnapshotRead = { snapshot: PublicSnapshot; stale: boolean; ageMs: number };
export function parsePublicSnapshotPayload(payload: unknown): PublicSnapshot {
  const value = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!value || typeof value !== 'object') throw new Error('Javni pregled trenutno nije dostupan.');
  const candidate = value as PublicSnapshot;
  if (!Array.isArray(candidate.matches) || candidate.matches.length > MAX_ROWS || !Array.isArray(candidate.leagues))
    throw new Error('Javni pregled trenutno nije dostupan.');
  const matches=candidate.matches.map((row:any):PublicMatch=>{
    if(!/^[a-f0-9]{32}$/.test(row.id)||!Array.isArray(row.sources)||!row.sources.length||!row.sources.every(publicSource))throw new Error('Neispravan javni pregled.');
    return{id:row.id,league:{slug:String(row.league.slug),name:String(row.league.name),country:String(row.league.country)},season:String(row.season),date:String(row.date),time:row.time||null,kickoffAt:row.kickoffAt||null,
      homeTeam:String(row.homeTeam),awayTeam:String(row.awayTeam),status:row.status,ht:{home:row.ht.home,away:row.ht.away},ft:{home:row.ft.home,away:row.ft.away},checkedAt:row.checkedAt||null,sources:row.sources};
  });
  const provenance = Array.isArray(candidate.provenance) ? candidate.provenance.slice(0, 8).map((source: any): PublicSnapshotProvenance => {
    if (!source || typeof source.source !== 'string' || typeof source.repository !== 'string' || typeof source.license !== 'string'
      || typeof source.licenseUrl !== 'string' || !Array.isArray(source.files)) throw new Error('Neispravno poreklo javnog pregleda.');
    return {
      source: source.source.slice(0, 100), repository: source.repository.slice(0, 300), license: source.license.slice(0, 80),
      licenseUrl: source.licenseUrl.slice(0, 500), retrievedAt: typeof source.retrievedAt === 'string' ? source.retrievedAt.slice(0, 40) : '',
      asOf: typeof source.asOf === 'string' ? source.asOf.slice(0, 40) : '',
      files: source.files.slice(0, 200).map((file: any) => {
        if (!file || typeof file.path !== 'string' || !/^[a-f0-9]{40}$/i.test(file.blobSha)) throw new Error('Neispravan identifikator OpenFootball fajla.');
        return { path:file.path.slice(0,300),blobSha:file.blobSha.toLowerCase(),season:String(file.season||'').slice(0,10),records:Number(file.records)||0,
          finished:Number(file.finished)||0,withHt:Number(file.withHt)||0,...(typeof file.commitSha==='string'?{commitSha:file.commitSha.slice(0,40)}:{}),
          ...(typeof file.committedAt==='string'||file.committedAt===null?{committedAt:file.committedAt}: {}) };
      }),
    };
  }) : undefined;
  return snapshotFromMatches(matches,new Date(candidate.loadedAt),Boolean(candidate.truncated),Number(candidate.excluded)||0,provenance);
}
export async function readPublicSnapshot(db:AnalyticsDatabase):Promise<PublicSnapshot> {
  const load = (reader: AnalyticsDatabase) => reader.query('SELECT payload FROM fa_public_snapshots WHERE id=$1',[PUBLIC_SNAPSHOT_ID]);
  const rows = db.kind === 'postgres' ? await db.transaction(async tx => {
    await tx.query('SET TRANSACTION READ ONLY');
    return load(tx);
  }) : await load(db);
  const row=rows[0];
  if(!row)throw new Error('Javni fudbalski pregled još nije pripremljen.');
  return parsePublicSnapshotPayload(row.payload);
}
export async function savePublicSnapshot(db:AnalyticsDatabase,snapshot:PublicSnapshot) {
  if(snapshot.matches.length>MAX_ROWS)throw new Error('Javni pregled prelazi dozvoljen obim.');
  const payload=JSON.stringify(snapshot);
  if(Buffer.byteLength(payload)>16_000_000)throw new Error('Javni pregled je prevelik.');
  if(db.kind==='postgres'){
    const size=Number((await db.query('SELECT pg_database_size(current_database()) AS bytes'))[0].bytes);
    if(size+Buffer.byteLength(payload)*3>930_000_000)throw new Error('Nema dovoljno rezervnog prostora na besplatnoj SQL bazi.');
  }
  await db.query('INSERT INTO fa_public_snapshots(id,version,updated_at,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET version=excluded.version,updated_at=excluded.updated_at,payload=excluded.payload',
    [PUBLIC_SNAPSHOT_ID,publicSnapshotVersion(snapshot),new Date().toISOString(),payload]);
}
export function publicSnapshotCache(load:()=>Promise<PublicSnapshot>,ttl=5*60000,retryBaseMs=15_000,fallback?:PublicSnapshot) {
  const fallbackEntry: { snapshot: PublicSnapshot; loadedAt: number } | undefined = fallback
    ? { snapshot: fallback, loadedAt: Date.parse(fallback.loadedAt) || 0 }
    : undefined;
  let lastGood = fallbackEntry;
  let inFlight: Promise<PublicSnapshot> | undefined;
  let retryAt = 0;
  let failures = 0;
  let lastError: unknown;
  let reads = 0, freshHits = 0, staleHits = 0, loadFailures = 0;
  const result = (stale: boolean, now: number): PublicSnapshotRead => ({
    snapshot: lastGood!.snapshot,
    stale,
    ageMs: Math.max(0, now - lastGood!.loadedAt),
  });
  const readWithStatus = async (): Promise<PublicSnapshotRead> => {
    reads += 1;
    const now = Date.now();
    if (lastGood && now - lastGood.loadedAt < ttl) { freshHits += 1; return result(false, now); }
    if (inFlight) {
      try {
        await inFlight;
        freshHits += 1; return result(false, Date.now());
      } catch {
        if (lastGood) { staleHits += 1; return result(true, Date.now()); }
        throw lastError;
      }
    }
    if (now < retryAt) {
      if (lastGood) { staleHits += 1; return result(true, now); }
      throw lastError || new Error('Baza analitike je privremeno nedostupna.');
    }
    const task = load();
    inFlight = task;
    try {
      const snapshot = await task;
      lastGood = { snapshot, loadedAt: Date.now() };
      failures = 0;
      retryAt = 0;
      lastError = undefined;
      freshHits += 1;
      return result(false, Date.now());
    } catch (error) {
      failures += 1;
      loadFailures += 1;
      retryAt = Date.now() + Math.min(5 * 60_000, retryBaseMs * 2 ** Math.min(failures - 1, 5));
      lastError = error;
      if (lastGood) { staleHits += 1; return result(true, Date.now()); }
      throw error;
    } finally {
      if (inFlight === task) inFlight = undefined;
    }
  };
  return {
    readWithStatus,
    read: async () => (await readWithStatus()).snapshot,
    stats: () => ({ scope: 'this-serverless-instance', reads, freshHits, staleHits, loadFailures, hasSnapshot: Boolean(lastGood), snapshotAgeMs: lastGood ? Math.max(0, Date.now()-lastGood.loadedAt) : null, circuitOpen: Date.now()<retryAt }),
    clear: () => { lastGood = fallbackEntry; inFlight = undefined; retryAt = 0; failures = 0; lastError = undefined; reads = 0; freshHits = 0; staleHits = 0; loadFailures = 0; },
  };
}
