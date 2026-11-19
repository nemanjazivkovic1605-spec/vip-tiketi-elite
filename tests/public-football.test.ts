import test from 'node:test';
import assert from 'node:assert/strict';
import { openAnalyticsDatabase,migrateAnalytics } from '../server/footballAnalytics/database.ts';
import { ingestMatch } from '../server/footballAnalytics/store.ts';
import { normalizeHistoricalJson } from '../server/footballAnalytics/historicalProvider.ts';
import { mapPublicFootballMatch, PUBLIC_FIELDS, type PublicInput } from '../server/publicFootball/policy.ts';
import { preparePublicFootball,readPublicSnapshot,savePublicSnapshot,publicSnapshotCache,snapshotFromMatches } from '../server/publicFootball/store.ts';
import { buildPublicFootballPage,parseFinderFilters } from '../server/publicFootball/model.ts';
import { publicTeamForm,publicAggregate } from '../server/publicFootball/stats.ts';
import type { PublicMatch } from '../src/types/publicFootball.ts';

const now=new Date('2026-11-18T12:00:00Z');
function input():PublicInput {
  const fields={'home.name':'Home','away.name':'Away','league.name':'Premier League','league.country':'England',season:'2026/27',matchDate:'2026-11-20',matchTime:'15:00',kickoffAt:null,status:'unknown','ft.home':null,'ft.away':null,'ht.home':null,'ht.away':null};
  return{environment:'real',fields,provenance:Object.fromEntries(PUBLIC_FIELDS.map(field=>[field,{provider:'openfootball',observedAt:'2026-11-18T10:00:00Z'}]))};
}
function fixture(id:number,date='2026-11-20'):PublicMatch {return{...mapPublicFootballMatch(id.toString(16).padStart(32,'0'),input(),now)!,date};}
test('public projection checks field provenance and never promotes restricted enrichments or test data',()=>{
  const value=input();value.fields['ft.home']=4;value.fields['ft.away']=3;value.provenance['ft.home']={provider:'football-data.co.uk'};value.fields.prediction='VIP secret';value.fields.odds=99;value.fields.analysis='private';
  const result=mapPublicFootballMatch('a'.repeat(32),value,now)!;
  assert.deepEqual(result.ft,{home:null,away:null});assert(!JSON.stringify(result).includes('VIP secret'));assert(!('odds'in result));assert(!('provenance'in result));
  value.provenance['home.name']={provider:'football-data.org'};assert.equal(mapPublicFootballMatch('a'.repeat(32),value,now),null);
  value.provenance['home.name']={provider:'openfootball'};value.environment='test';assert.equal(mapPublicFootballMatch('a'.repeat(32),value,now),null);
});
test('public time handling preserves unknown zones and zero scores, rejects incoherent and future final results',()=>{
  const value=input();value.fields.matchDate='2026-11-10';value.fields.status='finished';value.fields['ft.home']=0;value.fields['ft.away']=0;value.fields['ht.home']=0;value.fields['ht.away']=0;
  const result=mapPublicFootballMatch('a'.repeat(32),value,now)!;assert.equal(result.kickoffAt,null);assert.equal(result.time,'15:00');assert.deepEqual(result.ht,{home:0,away:0});
  value.fields['ht.home']=1;assert.equal(mapPublicFootballMatch('a'.repeat(32),value,now)!.ht.home,null);
  value.fields.matchDate='2026-11-20';const future=mapPublicFootballMatch('a'.repeat(32),value,now)!;assert.equal(future.status,'unknown');assert.equal(future.ft.home,null);
});
test('bootstrap reads licensed candidates only; public reads use one prepared row and no writes or sports calls',async()=>{
  const db=await openAnalyticsDatabase(':memory:');try{await migrateAnalytics(db);
    const observation=normalizeHistoricalJson({date:'2026-11-10',homeTeam:'Home',awayTeam:'Away',ftHome:2,ftAway:1,htHome:0,htAway:1},'premier-league','2026/27','openfootball','https://github.com/openfootball/football.json')!;
    await ingestMatch(db,observation);await ingestMatch(db,{...observation,provider:'manual',sourceId:'private',home:{sourceId:'secret',name:'Secret'},league:{...observation.league,name:'Private League'}});
    const snapshot=await preparePublicFootball(db,now);assert.equal(snapshot.matches.length,1);assert.equal(snapshot.matches[0].homeTeam,'Home');assert(!JSON.stringify(snapshot).includes('Secret'));
    await savePublicSnapshot(db,snapshot);let queries=0;const readOnly={...db,query:async(sql:string,values?:unknown[])=>{queries++;assert(/^SELECT/i.test(sql));return db.query(sql,values);}};
    const saved=await readPublicSnapshot(readOnly as typeof db);assert.equal(saved.matches.length,1);assert.equal(queries,1);
  }finally{await db.close();}
});
test('public cache coalesces reads, can be invalidated and does not cache failed loads',async()=>{
  let count=0;const cache=publicSnapshotCache(async()=>{count++;await new Promise(resolve=>setTimeout(resolve,5));return snapshotFromMatches([]);});
  await Promise.all([cache.read(),cache.read(),cache.read()]);assert.equal(count,1);cache.clear();await cache.read();assert.equal(count,2);
  const failing=publicSnapshotCache(async()=>{throw new Error('offline');});await assert.rejects(failing.read());await assert.rejects(failing.read());
});
test('form uses past finished matches only, keeps the true sample and does not invent confidence',()=>{
  const target=fixture(9),history=[{...fixture(1,'2026-11-10'),status:'finished' as const,ft:{home:2,away:1},ht:{home:0,away:1}},fixture(2,'2026-11-09'),{...fixture(3,'2026-11-21'),status:'finished' as const,ft:{home:9,away:0}}];
  const form=publicTeamForm(history,'Home',target);assert.equal(form.sample,1);assert.equal(form.expected,5);assert.equal(form.comebacks,1);assert.equal(form.pointsPercent,100);assert(!('confidence'in form));
  const zero=publicTeamForm([],'Home',target);assert.equal(zero.pointsPercent,null);
  const aggregate=publicAggregate(history.slice(0,1));assert.equal(aggregate.htft.find(row=>row.code==='2/1')!.count,1);
});
test('finder validates dates, pagination and statistical thresholds and excludes missing samples instead of inventing values',()=>{
  const snapshot=snapshotFromMatches(Array.from({length:35},(_,i)=>fixture(i+1)),now);
  const page=buildPublicFootballPage(snapshot,'finder',new URLSearchParams(),now);assert.equal(page.total,35);assert.equal(page.rows.length,30);assert(page.hasMore);
  const next=buildPublicFootballPage(snapshot,'finder',new URLSearchParams('offset=30'),now);assert.equal(next.rows.length,5);
  assert.equal(buildPublicFootballPage(snapshot,'finder',new URLSearchParams('form=50'),now).rows.length,0);
  assert.throws(()=>parseFinderFilters(new URLSearchParams('from=2026-11-01'),now));assert.throws(()=>parseFinderFilters(new URLSearchParams('form=101'),now));assert.throws(()=>parseFinderFilters(new URLSearchParams('offset=-1'),now));
});
