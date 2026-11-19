import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openAnalyticsDatabase,migrateAnalytics } from '../server/footballAnalytics/database.js';
import { preparePublicFootball,publicSnapshotVersion,readPublicSnapshot,savePublicSnapshot } from '../server/publicFootball/store.js';
import { planPublicSync,applyPublicSync } from '../server/publicFootball/sync.js';

const args=process.argv.slice(2),command=args.find(value=>!value.startsWith('--'))||'plan';
const confirm=args.find(value=>value.startsWith('--confirm='))?.slice(10);
if(!['plan','write','status','sync-plan','sync-write'].includes(command))throw new Error('Koristite plan, write, status, sync-plan ili sync-write.');
const db=await openAnalyticsDatabase();
try{
  if(command.startsWith('sync-')){
    const plan=await planPublicSync(db);
    if(command==='sync-write'){
      const previous=JSON.parse(readFileSync('.local-backups/public-football-sync-plan.json','utf8'));
      if(confirm!==plan.fingerprint||previous.fingerprint!==confirm)throw new Error('Proverite i potvrdite novi sync dry-run.');
      console.log(JSON.stringify(await applyPublicSync(db,plan,confirm),null,2));
    }else{mkdirSync('.local-backups',{recursive:true});writeFileSync('.local-backups/public-football-sync-plan.json',JSON.stringify({fingerprint:plan.fingerprint,...plan.summary},null,2));console.log(JSON.stringify({fingerprint:plan.fingerprint,...plan.summary,sqlWrites:0},null,2));}
  }else if(command==='status'){
    const value=await readPublicSnapshot(db);
    console.log(JSON.stringify({matches:value.matches.length,leagues:value.leagues,lastUpdatedAt:value.lastUpdatedAt,sqlWrites:0,firestoreWrites:0},null,2));
  }else{
    const snapshot=await preparePublicFootball(db),version=publicSnapshotVersion(snapshot);
    const fingerprint=createHash('sha256').update(JSON.stringify({version,matches:snapshot.matches.length,excluded:snapshot.excluded})).digest('hex');
    const summary={fingerprint,matches:snapshot.matches.length,leagues:snapshot.leagues,excluded:snapshot.excluded,truncated:snapshot.truncated,payloadBytes:Buffer.byteLength(JSON.stringify(snapshot)),plannedDataWrites:1,schemaVersion:4,firestoreWrites:0};
    mkdirSync('.local-backups',{recursive:true});
    if(command==='write'){
      const previous=JSON.parse(readFileSync('.local-backups/public-football-plan.json','utf8'));
      if(confirm!==fingerprint||previous.fingerprint!==fingerprint)throw new Error('Prvo proverite novi dry-run i potvrdite fingerprint.');
      let existing;
      try{existing=await readPublicSnapshot(db);}catch(error:any){if(!['42P01','SQLITE_ERROR'].includes(error.code)&&!String(error.message).includes('još nije pripremljen')&&!String(error.message).includes('no such table'))throw error;}
      if(existing){
        if(publicSnapshotVersion(existing)!==version)throw new Error('Javni pregled već postoji. Bootstrap ne sme prepisati novije podatke; koristite sync-plan.');
        console.log(JSON.stringify({...summary,written:0,alreadyPresent:true,verified:true},null,2));
        process.exitCode=0;
      }else{
      await migrateAnalytics(db);await savePublicSnapshot(db,snapshot);
      const saved=await readPublicSnapshot(db);
      if(publicSnapshotVersion(saved)!==version)throw new Error('Provera sačuvanog javnog pregleda nije uspela.');
      console.log(JSON.stringify({...summary,written:1,verified:true},null,2));
      }
    }else{
      writeFileSync('.local-backups/public-football-plan.json',JSON.stringify(summary,null,2));
      console.log(JSON.stringify({...summary,sqlWrites:0},null,2));
    }
  }
}finally{await db.close();}
