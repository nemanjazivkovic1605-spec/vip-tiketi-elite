import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTipCsv } from '../server/historyImport/csv.ts';
import { planHistoricalTips } from '../server/historyImport/planner.ts';
import { plannedImportWrites, applyHistoricalImport } from '../server/historyImport/firestore.ts';
import { mapTicketForPublic, mapTicketForVip } from '../src/services/tickets/ticketMappers.ts';
import { getFirstMatchStartAt } from '../src/utils/tickets.ts';
const header='Mesec,Datum,Domacin,Gost,Liga,Tip,Kvota,Units,Status,Rezultat,Profit\n';
const row='Avgust 2026,2026-08-16,Ajax,Heerenveen,N1,1,1.44,6,LOST,2-2,-6\n';
const parse=(body=row)=>parseTipCsv(Buffer.from(header+body),'2026-11-22');
const plan=(file=parse(), existing:any[]=[])=>planHistoricalTips(file,existing,{}, {category:'vip_monthly',fileName:'test.csv',now:new Date('2026-11-22T10:00:00Z')});
test('CSV preserves originals, settles actual scores and rejects invented odds/profit',()=>{
 assert.equal(parse().rows.length,1);assert.equal(parse().rows[0].profit,-6);
 assert.equal(parse(row.replace('1.44','1.00')).rows.length,0);
 assert.equal(parse(row.replace('LOST','WON')).rows.length,0);
 assert.equal(parse(row.replace(',-6',',5')).rows.length,0);
 assert.equal(parse(row.replace('2026-08-16','2026-02-30')).rows.length,0);
});
test('same fixture with different markets is retained, identical rows are deduplicated',()=>{
 assert.equal(parse(row+row).rows.length,1);assert.equal(parse(row+row).duplicates.length,1);
 assert.equal(parse(row+row.replace(',1,1.44,',',Under 2.5,1.44,')).rows.length,2);
 assert.equal(parse(row+row.replace('1.44','1.60')).errors.length,2);
});
test('single tickets have stable morning publication, unknown kickoff stays unknown, no public import metadata',()=>{
 const value=plan();const ticket=value.tickets[0];assert.equal(ticket.matches.length,1);
 assert.match(ticket.publishedTime!,/^(09|10|11|12):\d{2}$/);
 assert.equal(ticket.publishedAt,plan().tickets[0].publishedAt);
 assert.equal(getFirstMatchStartAt(ticket),undefined);
 assert.equal(mapTicketForPublic(ticket).historicalImport,undefined);
 assert.equal(mapTicketForVip(ticket).historicalImport,undefined);
 assert.equal(plannedImportWrites(value),6);
});
test('repeat import and manual edits are never overwritten; changed CSV values are conflicts',()=>{
 const first=plan();const ticket=first.tickets[0];
 assert.equal(plan(parse(),[ticket]).tickets.length,0);
 assert.equal(plan(parse(),[{...ticket,unitsStake:8}]).duplicates.length,1);
 assert.equal(plan(parse(row.replace('1.44','1.60')),[ticket]).conflicts.length,1);
});
test('confirmation, conflict and unconfirmed guards fail before touching Firestore',async()=>{
 const value=plan();const options={confirmation:'wrong',acknowledgeUnconfirmed:false,backupDirectory:'.local-data/test-backups'};
 await assert.rejects(applyHistoricalImport({} as any,value,options),/fingerprint/);
 await assert.rejects(applyHistoricalImport({} as any,value,{...options,confirmation:value.fingerprint}),/potvrdjeni/);
});
