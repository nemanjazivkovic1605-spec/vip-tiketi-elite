import test from 'node:test';
import assert from 'node:assert/strict';
import { openAnalyticsDatabase,migrateAnalytics } from '../server/footballAnalytics/database.ts';
import { normalizeHistoricalJson } from '../server/footballAnalytics/historicalProvider.ts';
import { snapshotFromMatches,savePublicSnapshot,readPublicSnapshot } from '../server/publicFootball/store.ts';
import { planPublicSync,applyPublicSync,runPublicDailySync } from '../server/publicFootball/sync.ts';
const now=new Date('2026-11-18T12:00:00Z');
const record=()=>normalizeHistoricalJson({date:'2026-11-20',time:'15:00',homeTeam:'Home',awayTeam:'Away'},'premier-league','2026/27','openfootball','https://github.com/openfootball/football.json')!;
test('open-data sync plans without mutations, writes atomically only after approval, and repeated cron runs do not duplicate',async()=>{
  const db=await openAnalyticsDatabase(':memory:');const previous=process.env.PUBLIC_FOOTBALL_SYNC_ENABLED;try{await migrateAnalytics(db);await savePublicSnapshot(db,snapshotFromMatches([],now));
    const loader=async()=>[{name:'Premier League',state:'available' as const,records:[record()]}];
    const before=JSON.stringify(await db.query('SELECT * FROM fa_public_snapshots'));const plan=await planPublicSync(db,now,loader);assert.equal(plan.summary.changed,1);assert.equal(JSON.stringify(await db.query('SELECT * FROM fa_public_snapshots')),before);
    delete process.env.PUBLIC_FOOTBALL_SYNC_ENABLED;await assert.rejects(applyPublicSync(db,plan,plan.fingerprint,now),/nije omogućena/);process.env.PUBLIC_FOOTBALL_SYNC_ENABLED='true';
    await assert.rejects(applyPublicSync(db,plan,'wrong',now),/Plan se promenio/);await applyPublicSync(db,plan,plan.fingerprint,now);assert.equal((await readPublicSnapshot(db)).matches.length,1);
    let calls=0;const again=await runPublicDailySync(db,now,async()=>{calls++;return loader();});assert('skipped'in again);assert.equal(again.skipped,true);assert.equal(calls,0);
    assert.equal((await planPublicSync(db,now,loader)).summary.changed,0);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM fa_matches'))[0].n,1);
  }finally{if(previous===undefined)delete process.env.PUBLIC_FOOTBALL_SYNC_ENABLED;else process.env.PUBLIC_FOOTBALL_SYNC_ENABLED=previous;await db.close();}
});
test('unavailable or oversized refresh preserves last good public data and cannot import restricted providers',async()=>{
  const db=await openAnalyticsDatabase(':memory:');const previous=process.env.PUBLIC_FOOTBALL_SYNC_ENABLED;try{await migrateAnalytics(db);await savePublicSnapshot(db,snapshotFromMatches([],now));process.env.PUBLIC_FOOTBALL_SYNC_ENABLED='true';
    const plan=await planPublicSync(db,now,async()=>[{name:'offline',state:'error',records:[]}]);await assert.rejects(applyPublicSync(db,plan,plan.fingerprint,now),/Nijedan dozvoljeni/);assert.equal((await readPublicSnapshot(db)).matches.length,0);
    const restricted=await planPublicSync(db,now,async()=>[{name:'restricted',state:'available',records:[{...record(),provider:'manual'}]}]);assert.equal(restricted.summary.changed,0);
    const large={...restricted,summary:{...restricted.summary,changed:201}};await assert.rejects(applyPublicSync(db,large,large.fingerprint,now),/budžet/);
  }finally{if(previous===undefined)delete process.env.PUBLIC_FOOTBALL_SYNC_ENABLED;else process.env.PUBLIC_FOOTBALL_SYNC_ENABLED=previous;await db.close();}
});
