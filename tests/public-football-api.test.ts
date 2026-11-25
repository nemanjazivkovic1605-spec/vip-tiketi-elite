import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicFootballHandler,publicFootballSitemap } from '../server/publicFootball/http.ts';
import { createAnalyticsHandler } from '../api/football-analytics.ts';
import { snapshotFromMatches } from '../server/publicFootball/store.ts';
import { mapPublicFootballMatch,PUBLIC_FIELDS } from '../server/publicFootball/policy.ts';
const now=new Date('2026-11-18T12:00:00Z');
const fields={'home.name':'Home <script>alert(1)</script>','away.name':'Away','league.name':'League','league.country':'England',season:'2026/27',matchDate:'2026-11-20',status:'unknown'};
const fixture=mapPublicFootballMatch('a'.repeat(32),{environment:'real',fields,provenance:Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,{provider:'openfootball'}]))},now)!;
const snapshot=snapshotFromMatches([fixture],now);
async function call(url:string,method='GET',load=async()=>snapshot,headers:Record<string,string>={}){const response:any={statusCode:0,headers:{},body:'',setHeader(name:string,value:string){this.headers[name]=value;},end(value:string){this.body=value;}};await createPublicFootballHandler(load,()=>now)({url,method,headers}as any,response);return response;}

test('public pages expose validators and bounded CDN caching',async()=>{
  const first=await call('/api/public-football?page=overview');
  assert.equal(first.statusCode,200);
  assert.match(first.headers['Cache-Control'],/s-maxage=3600/);
  assert.match(first.headers['Cache-Control'],/stale-while-revalidate=86400/);
  assert.equal(first.headers['X-Snapshot-Records'],String(snapshot.matches.length));
  const cached=await call('/api/public-football?page=overview','GET',async()=>snapshot,{'if-none-match':first.headers.ETag});
  assert.equal(cached.statusCode,304);
  assert.equal(cached.body,undefined);
});

test('shared Vercel function keeps the public projection read-only and cannot route public requests into admin actions',async()=>{
  let privateReads=0,publicReads=0;
  const handler=createAnalyticsHandler(async()=>false,async()=>{privateReads++;throw new Error('Private database');},()=>false,createPublicFootballHandler(async()=>{publicReads++;return snapshot;},()=>now));
  async function shared(url:string,method='GET'){const response:any={statusCode:0,headers:{},body:'',setHeader(name:string,value:string){this.headers[name]=value;},end(value:string){this.body=value;}};await handler({url,method}as any,response);return response;}
  assert.equal((await shared('/api/football-analytics?public=1&action=finder')).statusCode,200);
  assert.equal((await shared('/api/football-analytics?public=1&action=sync')).statusCode,400);
  assert.equal((await shared('/api/football-analytics?public=1&action=historical-overview')).statusCode,400);
  assert.equal((await shared('/api/football-analytics?public=1&action=finder','POST')).statusCode,405);
  assert.equal((await shared('/api/football-analytics?action=status')).statusCode,403);
  assert.equal(privateReads,0);assert.equal(publicReads,1);
});
test('public API is readable without authentication, is bounded, and refuses all mutations before loading data',async()=>{
  const result=await call('/api/public-football?action=finder');assert.equal(result.statusCode,200);const data=JSON.parse(result.body);assert.equal(data.rows.length,1);assert(!('matches'in data));assert(!('provenance'in data.rows[0].match));assert(!('analysis'in data.rows[0].match));
  let reads=0;for(const method of ['POST','PUT','DELETE']){const denied=await call('/api/public-football',method,async()=>{reads++;return snapshot;});assert.equal(denied.statusCode,405);}assert.equal(reads,0);
});
test('malformed public filters and private IDs fail before data access; unknown matches return 404',async()=>{
  let reads=0;const load=async()=>{reads++;return snapshot;};assert.equal((await call('/api/public-football?action=finder&form=999','GET',load)).statusCode,400);assert.equal((await call('/api/public-football?action=match&id=../users','GET',load)).statusCode,400);assert.equal(reads,0);
  assert.equal((await call(`/api/public-football?page=match&id=${'b'.repeat(32)}`)).statusCode,404);
});
test('HTML contains real server-rendered content, canonical metadata and escaped structured data without an app download',async()=>{
  const result=await call(`/api/public-football?page=match&id=${fixture.id}`);assert.equal(result.statusCode,200);assert(result.headers['Content-Type'].startsWith('text/html'));assert(result.body.includes('<h1>'));assert(result.body.includes('Home &lt;script&gt;'));assert(!result.body.includes('<script>alert(1)</script>'));assert(result.body.includes(`https://eliteviptips.com/fudbal/utakmice/${fixture.id}`));assert(result.body.includes('application/ld+json'));assert(!result.body.includes('src/main.tsx'));assert(!result.body.includes('firebase'));assert(result.body.includes('index,follow'));
  const finder=await call('/api/public-football?page=finder&form=50');assert(finder.body.includes('noindex,follow'));assert(finder.body.includes('method="get"'));
});
test('sitemap has public canonical match/league URLs only and failures are not cached as an empty successful page',async()=>{
  const xml=publicFootballSitemap(snapshot,now);assert(xml.includes('/fudbal/lige/england-league'));assert(xml.includes(`/fudbal/utakmice/${fixture.id}`));assert(!/admin|checkout|token|prediction/.test(xml));
  const failed=await call('/api/public-football?page=overview','GET',async()=>{throw new Error('private SQL connection detail');});assert.equal(failed.statusCode,503);assert.equal(failed.headers['Cache-Control'],'no-store');assert(!failed.body.includes('private SQL'));assert(failed.body.includes('trenutno nisu dostupni'));
});
