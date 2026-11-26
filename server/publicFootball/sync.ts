import type { AnalyticsDatabase } from '../footballAnalytics/database.js';
import type { AnalyticsMatch, CoverageRow, MatchObservation } from '../../src/types/footballAnalytics.js';
import type { PublicMatch,PublicSnapshot } from '../../src/types/publicFootball.js';
import { ENGLISH_PYRAMID } from '../footballAnalytics/englishPyramid.js';
import { fetchSeason,normalizeProviderMatch } from '../footballAnalytics/providers.js';
import { loadHistoricalDataset } from '../footballAnalytics/historicalProvider.js';
import { hashId,nameKey } from '../footballAnalytics/normalization.js';
import { ingestMatch } from '../footballAnalytics/store.js';
import { localDate,addDays } from '../sportsApi.js';
import { PUBLIC_FIELDS,mapPublicFootballMatch,publicSource,type PublicInput } from './policy.js';
import { PUBLIC_SNAPSHOT_ID,readPublicSnapshot,savePublicSnapshot,snapshotFromMatches,publicSnapshotVersion } from './store.js';

type Dataset={name:string;state:'available'|'unavailable'|'error';records:MatchObservation[];reason?:string};
export type PublicSyncLoader=(now:Date,options?:{includeOpenLigaDB?:boolean})=>Promise<Dataset[]>;
const facts=(match:PublicMatch)=>JSON.stringify({...match,checkedAt:null});
const identity=(match:PublicMatch)=>[match.league.slug,match.season.slice(0,4),nameKey(match.homeTeam),nameKey(match.awayTeam),match.date].join(':');
export function observationPublicInput(observation:MatchObservation):PublicInput {
  return{environment:observation.environment,fields:Object.fromEntries(PUBLIC_FIELDS.map(field=>[field,field.split('.').reduce((value:any,key)=>value?.[key],observation)])),provenance:Object.fromEntries(PUBLIC_FIELDS.map(field=>[field,{provider:observation.provider,observedAt:observation.observedAt}]))};
}
export const loadOpenPublicDatasets:PublicSyncLoader=async(now,options={})=>{
  const year=Number(localDate(now).slice(0,4))-(Number(localDate(now).slice(5,7))<7?1:0),season=`${year}/${String(year+1).slice(-2)}`;
  const datasets:Dataset[]=[];
  // Leave time for the SQL plan and atomic commit inside the 240-second function.
  const signal=AbortSignal.timeout(110000);
  for(const league of ENGLISH_PYRAMID.filter(row=>row.tier<=5)){
    try{
      signal.throwIfAborted();
      const value=await loadHistoricalDataset(league.id,season,'openfootball',signal);
      datasets.push({name:league.name,state:value.state==='available'?'available':value.state==='error'?'error':'unavailable',records:value.records,reason:value.warnings.join(' ').slice(0,250)});
    }catch{datasets.push({name:league.name,state:'error',records:[],reason:'Isteklo je vreme za proveru izvora; sačuvani podaci ostaju dostupni.'});}
  }
  const additionalLeagues:Array<[string,string]>=options.includeOpenLigaDB===false?[]:[['bl1','Bundesliga'],['bl2','2. Bundesliga'],['bl3','3. Liga']];
  for(const [sourceId,name] of additionalLeagues){
    try{
      signal.throwIfAborted();
      const context={provider:'openligadb',sourceId,season:`${year}/${year+1}`,leagueName:name,country:'Germany',environment:'real'} as CoverageRow;
      const raw=await fetchSeason(context),records:MatchObservation[]=[];
      for(const value of raw){const record=await normalizeProviderMatch(value,context);if(record)records.push(record);}
      datasets.push({name,state:'available',records});
    }catch{datasets.push({name,state:'error',records:[],reason:'Otvoreni izvor trenutno nije dostupan.'});}
  }
  return datasets;
};
export async function planPublicSync(db:AnalyticsDatabase,now=new Date(),loader:PublicSyncLoader=loadOpenPublicDatasets) {
  const previous=await readPublicSnapshot(db),version=publicSnapshotVersion(previous),today=localDate(now),from=addDays(today,-7),to=addDays(today,7);
  const datasets=await loader(now),next=new Map(previous.matches.map(match=>[match.id,match])),byIdentity=new Map(previous.matches.map(match=>[identity(match),match]));
  const changes:Array<{observation:MatchObservation;match:PublicMatch;canonical:string}>=[];
  let unchanged=0;
  for(const dataset of datasets)for(const observation of dataset.records){
    if(!publicSource(observation.provider)||observation.environment!=='real')continue;
    const sourceId=hashId(observation.provider,observation.sourceId,'real');
    let candidate=mapPublicFootballMatch(sourceId,observationPublicInput(observation),now);
    if(!candidate||candidate.date<from||candidate.date>to)continue;
    const source=(await db.query('SELECT match_id FROM fa_sources WHERE provider=$1 AND source_id=$2 AND environment=$3',[observation.provider,observation.sourceId,'real']))[0];
    const known=next.get(source?.match_id||sourceId)||byIdentity.get(identity(candidate));
    candidate={...candidate,id:known?.id||source?.match_id||sourceId};
    if(known){
      if(candidate.ft.home===null&&known.ft.home!==null){candidate.ft=known.ft;candidate.ht=known.ht;if(known.status==='finished'&&candidate.status==='unknown')candidate.status='finished';}
      if(candidate.ht.home===null&&known.ht.home!==null)candidate.ht=known.ht;
      if(!candidate.kickoffAt&&known.kickoffAt)candidate={...candidate,kickoffAt:known.kickoffAt,date:known.date,time:known.time};
      if(facts(candidate)===facts(known)){unchanged++;continue;}
    }
    const canonical=await ingestMatch(db,observation,{dryRun:true});
    if(canonical==='unresolved')continue;
    changes.push({observation,match:candidate,canonical});next.set(candidate.id,candidate);byIdentity.set(identity(candidate),candidate);
  }
  const snapshot=snapshotFromMatches([...next.values()].sort((a,b)=>a.id.localeCompare(b.id)),now,previous.truncated,previous.excluded);
  const summary={date:today,from,to,changed:changes.length,created:changes.filter(row=>!previous.matches.some(match=>match.id===row.match.id)).length,unchanged,
    canonicalChanges:changes.filter(row=>row.canonical==='created'||row.canonical==='updated').length,plannedSqlWrites:changes.filter(row=>row.canonical==='created'||row.canonical==='updated').length*10+5,
    payloadBytes:Buffer.byteLength(JSON.stringify(snapshot)),datasets:datasets.map(({records,...dataset})=>({...dataset,records:records.length})),firestoreWrites:0};
  const fingerprint=hashId('public-sync',version,JSON.stringify(changes.map(row=>[row.match.id,facts(row.match)])));
  return{previousVersion:version,fingerprint,summary,changes,snapshot};
}
export async function applyPublicSync(db:AnalyticsDatabase,plan:Awaited<ReturnType<typeof planPublicSync>>,fingerprint:string,now=new Date()) {
  if(process.env.PUBLIC_FOOTBALL_SYNC_ENABLED!=='true')throw new Error('Javna sinhronizacija nije omogućena.');
  if(fingerprint!==plan.fingerprint)throw new Error('Plan se promenio; ponovite dry-run.');
  if(plan.summary.changed>200||plan.summary.plannedSqlWrites>2500)throw new Error('Plan prelazi bezbedan dnevni budžet. Potrebna je ručna provera.');
  if(!plan.summary.datasets.some(row=>row.state==='available'))throw new Error('Nijedan dozvoljeni izvor nije odgovorio; sačuvani podaci ostaju nepromenjeni.');
  if(db.kind==='postgres'){
    const bytes=Number((await db.query('SELECT pg_database_size(current_database()) AS bytes'))[0].bytes);
    if(bytes+plan.summary.payloadBytes*3+plan.summary.changed*100000>930_000_000)throw new Error('Sinhronizacija bi potrošila rezervu besplatne SQL baze.');
  }
  return db.transaction(async tx=>{
    const row=(await tx.query(`SELECT version FROM fa_public_snapshots WHERE id=$1${db.kind==='postgres'?' FOR UPDATE':''}`,[PUBLIC_SNAPSHOT_ID]))[0];
    if(row?.version!==plan.previousVersion)throw new Error('Javni pregled je u međuvremenu izmenjen. Ponovite plan.');
    const results={created:0,updated:0,unchanged:0,unresolved:0};
    // All canonical changes and the public snapshot commit together, never a half-applied public view.
    const atomic={...tx,transaction:async<T>(run:(db:AnalyticsDatabase)=>Promise<T>)=>run(tx)} as AnalyticsDatabase;
    for(const change of plan.changes){if(change.canonical==='unchanged')continue;const result=await ingestMatch(atomic,change.observation);results[result]++;if(result==='unresolved')throw new Error('Identitet utakmice se promenio; potreban je novi plan.');}
    if(plan.summary.changed>0)await savePublicSnapshot(tx,plan.snapshot);
    const result={kind:'public-football-sync',status:plan.summary.datasets.some(row=>row.state!=='available')?'partial':'complete',day:plan.summary.date,createdAt:now.toISOString(),completedAt:now.toISOString(),publicChanged:plan.summary.changed,...results,datasets:plan.summary.datasets,firestoreWrites:0};
    await tx.query('INSERT INTO fa_import_runs(id,created_at,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',[hashId('public-football-sync',plan.summary.date),now.toISOString(),JSON.stringify(result)]);
    return result;
  });
}
export async function runPublicDailySync(db:AnalyticsDatabase,now=new Date(),loader:PublicSyncLoader=loadOpenPublicDatasets) {
  if(process.env.PUBLIC_FOOTBALL_SYNC_ENABLED!=='true')return{skipped:true,reason:'Javna sinhronizacija je isključena.'};
  const runId=hashId('public-football-sync',localDate(now)),previous=(await db.query('SELECT payload FROM fa_import_runs WHERE id=$1',[runId]))[0];
  if(previous&&['complete','partial'].includes(JSON.parse(previous.payload).status))return{skipped:true,reason:'Današnji javni pregled je već osvežen.'};
  const lock='public-football-sync',lease=new Date(Date.now()+230000).toISOString();
  await db.query('INSERT INTO fa_import_locks(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[lock]);
  const claimed=await db.query('UPDATE fa_import_locks SET lease_until=$1 WHERE id=$2 AND (lease_until IS NULL OR lease_until<$3) RETURNING id',[lease,lock,new Date().toISOString()]);
  if(!claimed.length)return{skipped:true,reason:'Druga javna sinhronizacija je u toku.'};
  try{const plan=await planPublicSync(db,now,loader);return await applyPublicSync(db,plan,plan.fingerprint,now);}
  catch(error){const result={kind:'public-football-sync',status:'error',createdAt:now.toISOString(),completedAt:new Date().toISOString(),error:error instanceof Error?error.message:'Otvoreni izvor nije dostupan.',firestoreWrites:0};await db.query('INSERT INTO fa_import_runs(id,created_at,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',[runId,now.toISOString(),JSON.stringify(result)]);return result;}
  finally{await db.query('UPDATE fa_import_locks SET lease_until=NULL WHERE id=$1 AND lease_until=$2',[lock,lease]);}
}
