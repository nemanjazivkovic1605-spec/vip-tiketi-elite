import type { AnalyticsDatabase } from '../footballAnalytics/database.js';
import { PUBLIC_FIELDS, mapPublicFootballMatch, type PublicInput } from './policy.js';
import type { PublicLeague, PublicSnapshot, PublicMatch } from '../../src/types/publicFootball.js';
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
export function snapshotFromMatches(matches: PublicSnapshot['matches'], now=new Date(), truncated=false, excluded=0):PublicSnapshot {
  const leagues = new Map<string,PublicLeague>();
  for (const match of matches) {
    const league = leagues.get(match.league.slug) || {...match.league,matches:0,finished:0,withHt:0,seasons:[],latestDate:'',sources:[]};
    league.matches++; league.finished+=Number(match.status==='finished'); league.withHt+=Number(match.status==='finished' && match.ht.home!==null);
    if(!league.seasons.includes(match.season))league.seasons.push(match.season);
    for(const source of match.sources)if(!league.sources.includes(source))league.sources.push(source);
    if(match.date>league.latestDate)league.latestDate=match.date;
    leagues.set(league.slug,league);
  }
  return {matches,leagues:[...leagues.values()].map(league=>({...league,seasons:league.seasons.sort().reverse()})).sort((a,b)=>a.country.localeCompare(b.country)||a.name.localeCompare(b.name)),loadedAt:now.toISOString(),lastUpdatedAt:matches.map(match=>match.checkedAt||'').sort().at(-1)||null,truncated,excluded};
}
export const publicSnapshotVersion=(snapshot:PublicSnapshot)=>createHash('sha256').update(JSON.stringify(snapshot.matches)).digest('hex');
export const PUBLIC_SNAPSHOT_ID='football-v1';
export async function readPublicSnapshot(db:AnalyticsDatabase):Promise<PublicSnapshot> {
  const row=(await db.query('SELECT payload FROM fa_public_snapshots WHERE id=$1',[PUBLIC_SNAPSHOT_ID]))[0];
  if(!row)throw new Error('Javni fudbalski pregled još nije pripremljen.');
  const value=JSON.parse(row.payload) as PublicSnapshot;
  if(!Array.isArray(value.matches)||value.matches.length>MAX_ROWS||!Array.isArray(value.leagues))throw new Error('Javni pregled trenutno nije dostupan.');
  const matches=value.matches.map((row:any):PublicMatch=>{
    if(!/^[a-f0-9]{32}$/.test(row.id)||!Array.isArray(row.sources)||!row.sources.length||!row.sources.every(publicSource))throw new Error('Neispravan javni pregled.');
    return{id:row.id,league:{slug:String(row.league.slug),name:String(row.league.name),country:String(row.league.country)},season:String(row.season),date:String(row.date),time:row.time||null,kickoffAt:row.kickoffAt||null,
      homeTeam:String(row.homeTeam),awayTeam:String(row.awayTeam),status:row.status,ht:{home:row.ht.home,away:row.ht.away},ft:{home:row.ft.home,away:row.ft.away},checkedAt:row.checkedAt||null,sources:row.sources};
  });
  return snapshotFromMatches(matches,new Date(value.loadedAt),Boolean(value.truncated),Number(value.excluded)||0);
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
export function publicSnapshotCache(load:()=>Promise<PublicSnapshot>,ttl=5*60000) {
  let cached: {task:Promise<PublicSnapshot>;expires:number}|undefined;
  return { read:()=>{if(cached && cached.expires>Date.now())return cached.task;
    const entry={task:load(),expires:Date.now()+ttl};cached=entry;
    entry.task.catch(()=>{if(cached===entry)cached=undefined;});return entry.task;
  },clear:()=>{cached=undefined;}};
}
