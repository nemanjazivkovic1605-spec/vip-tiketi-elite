import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalOpenFootballFallback } from '../server/publicFootball/localOpenFootballFallback.ts';
import { mergeOpenFootballSnapshot } from '../server/publicFootball/openFootballSnapshot.ts';
import { decodeTursoSnapshotPayload, encodeTursoSnapshot } from '../server/publicFootball/tursoSnapshot.ts';
import { publicSnapshotVersion } from '../server/publicFootball/store.ts';

const commitSha = 'a'.repeat(40);
const blobSha = 'b'.repeat(40);
const now = new Date('2026-11-25T12:00:00.000Z');

test('OpenFootball recovery merges latest allowed files, deduplicates fixtures, and keeps verified scores', () => {
  const base = buildLocalOpenFootballFallback();
  const existing = base.matches.find((match) => match.season === '2026/27' && match.league.name === 'Championship')!;
  assert.ok(existing);
  const completed = { date:existing.date,time:existing.time||'15:00',team1:existing.homeTeam,team2:existing.awayTeam,score:{ht:[existing.ht.home,existing.ht.away],ft:[existing.ft.home,existing.ft.away]} };
  const future = { date:'2026-11-30',time:'19:45',team1:'Arsenal FC',team2:'Chelsea FC',score:{ht:[2,0],ft:[3,0]} };
  const live = {
    retrievedAt:now.toISOString(),
    files:[{path:'2026-27/en.2.json',blobSha,commitSha,committedAt:'2026-09-22T09:33:49.000Z',records:[completed,future]}],
    summaries:[{path:'2026-27/en.2.json',blobSha,commitSha,committedAt:'2026-09-22T09:33:49.000Z',records:552,finished:88,withHt:88}],
  };
  const { snapshot, summary } = mergeOpenFootballSnapshot(base,live,now);
  assert.equal(summary.duplicates,1);
  assert.equal(summary.added,1);
  assert.equal(snapshot.matches.length,base.matches.length+1);
  const preserved = snapshot.matches.find((match)=>matchKey(match)===matchKey(existing))!;
  assert.equal(preserved.id,existing.id);
  assert.deepEqual(preserved.ft,existing.ft);
  assert.deepEqual(preserved.ht,existing.ht);
  const scheduled=snapshot.matches.find((match)=>match.homeTeam==='Arsenal FC'&&match.awayTeam==='Chelsea FC')!;
  assert.equal(scheduled.status,'scheduled');
  assert.deepEqual(scheduled.ft,{home:null,away:null});
  assert.deepEqual(scheduled.ht,{home:null,away:null});
  assert.equal(snapshot.provenance?.length,2);
  assert.equal(snapshot.provenance?.at(-1)?.files[0].committedAt,'2026-09-22T09:33:49.000Z');
});

test('conflicting source scores do not overwrite an existing result and are reported', () => {
  const base=buildLocalOpenFootballFallback();
  const existing=base.matches.find((match)=>match.season==='2026/27'&&match.league.name==='Championship')!;
  const live={retrievedAt:now.toISOString(),files:[{path:'2026-27/en.2.json',blobSha,commitSha,committedAt:null,records:[{
    date:existing.date,time:existing.time,team1:existing.homeTeam,team2:existing.awayTeam,score:{ht:[0,0],ft:[99,99]},
  }]}],summaries:[{path:'2026-27/en.2.json',blobSha,commitSha,committedAt:null,records:1,finished:1,withHt:1}]};
  const result=mergeOpenFootballSnapshot(base,live,now);
  assert.equal(result.summary.conflicts,1);
  assert.deepEqual(result.snapshot.matches.find((match)=>match.id===existing.id)?.ft,existing.ft);
});

test('compressed Turso payload round-trips with provenance and supports older raw JSON rows', () => {
  const snapshot=buildLocalOpenFootballFallback();
  const encoded=encodeTursoSnapshot(snapshot);
  assert.ok(encoded.payloadBytes<encoded.uncompressedPayloadBytes*0.5);
  const decoded=decodeTursoSnapshotPayload(encoded.payload);
  assert.equal(publicSnapshotVersion(decoded),publicSnapshotVersion(snapshot));
  assert.equal(decoded.matches.length,snapshot.matches.length);
  assert.deepEqual(decoded.provenance,snapshot.provenance);
  assert.equal(publicSnapshotVersion(decodeTursoSnapshotPayload(JSON.stringify(snapshot))),publicSnapshotVersion(snapshot));
});

function matchKey(match:{league:{slug:string};season:string;date:string;homeTeam:string;awayTeam:string}) {
  return `${match.league.slug}|${match.season}|${match.date}|${match.homeTeam.replace(/[^a-z0-9]/gi,'').toLowerCase()}|${match.awayTeam.replace(/[^a-z0-9]/gi,'').toLowerCase()}`;
}
