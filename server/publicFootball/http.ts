import type { IncomingMessage,ServerResponse } from 'node:http';
import { getAnalyticsDatabase } from '../footballAnalytics/database.js';
import { readPublicSnapshot,publicSnapshotCache } from './store.js';
import { buildPublicFootballPage,parseFinderFilters } from './model.js';
import { renderPublicFootball,renderPublicError } from './view.js';
import type { PublicSnapshot,PublicFootballPageData } from '../../src/types/publicFootball.js';
import type { PublicSnapshotRead } from './store.js';
import { leaguePath,matchPath,pairPath,publicSlug } from './paths.js';
import { publicFootballRoute } from './routes.js';
import { buildLocalOpenFootballFallback } from './localOpenFootballFallback.js';
import { publicFootballSitemap,publicSitemapIndex } from './sitemaps.js';
export { publicFootballSitemap } from './sitemaps.js';

async function readCurrentPublicSnapshot() {
  try {
    return await readPublicSnapshot(await getAnalyticsDatabase());
  } catch (error) {
    const value = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown } : {};
    const errorName = typeof value.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,48}$/.test(value.name) ? value.name : 'UnknownError';
    const errorCode = typeof value.code === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value.code) ? value.code : undefined;
    console.warn('[public-football] snapshot read failed', { errorName, errorCode });
    throw error;
  }
}
const snapshot=publicSnapshotCache(readCurrentPublicSnapshot,15*60_000,30_000,buildLocalOpenFootballFallback());
export const clearPublicFootballCache=()=>snapshot.clear();
export const publicFootballCacheStats=()=>snapshot.stats();
export const createPublicFootballHandler=(load:()=>Promise<PublicSnapshot|PublicSnapshotRead>=()=>snapshot.readWithStatus(),clock=()=>new Date())=>async(request:IncomingMessage,response:ServerResponse)=>{
  response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const url=new URL(request.url||'/','https://eliteviptips.com');
  const route=publicFootballRoute(url.pathname);
  if(route)for(const [key,value]of Object.entries(route))url.searchParams.set(key,value);
  const html=url.searchParams.has('page')&&url.searchParams.get('page')!=='sitemap';
  const send=(status:number,data:string,type:string)=>{response.statusCode=status;response.setHeader('Content-Type',type);response.end(request.method==='HEAD'?'':data);};
  const error=(status:number,message:string)=>{response.setHeader('Cache-Control','no-store');send(status,html?renderPublicError(message,status):JSON.stringify({error:message}),html?'text/html; charset=utf-8':'application/json; charset=utf-8');};
  if(!['GET','HEAD'].includes(request.method||''))return error(405,'Ovaj pregled dozvoljava samo čitanje.');
  if((request.url||'').length>2200)return error(400,'Previše dugačak zahtev.');
  const action=url.searchParams.get('page')||url.searchParams.get('action')||'overview';
  if(action==='not-found')return error(404,'Tražena stranica ne postoji. Proverite adresu ili otvorite javni fudbalski pregled.');
  if(!['overview','finder','league','match','sitemap','teams','team','h2h','pair','today','league-alias','match-alias'].includes(action))return error(400,'Nepodržan javni pregled.');
  if(['match','match-alias'].includes(action)&&!/^[a-f0-9]{32}$/.test(url.searchParams.get('id')||''))return error(400,'Neispravan identifikator utakmice.');
  if(['league','league-alias','team'].includes(action)&&!/^[a-z0-9-]{1,160}$/.test(url.searchParams.get('slug')||''))return error(400,'Neispravan naziv lige ili tima.');
  if(action==='pair'&&(!/^[a-z0-9-]{1,160}$/.test(url.searchParams.get('first')||'')||!/^[a-z0-9-]{1,160}$/.test(url.searchParams.get('second')||'')||url.searchParams.get('first')===url.searchParams.get('second')))return error(400,'Neispravni timovi za H2H pregled.');
  if(action==='sitemap'&&url.searchParams.has('segment')&&!/^(stranice|lige|timovi|h2h|utakmice)-[1-9]\d{0,3}$/.test(url.searchParams.get('segment')||''))return error(400,'Neispravna mapa sajta.');
  const now=clock();
  try{parseFinderFilters(action==='overview'||action==='finder'?url.searchParams:new URLSearchParams(),now);}catch(value){return error(400,(value as Error).message);}
  try{
    const loaded=await load();
    const freshness='snapshot'in loaded&&'stale'in loaded?loaded:null;
    const value=freshness?freshness.snapshot:loaded as PublicSnapshot;
    response.setHeader('Cache-Control','public, max-age=0, s-maxage=900, stale-while-revalidate=21600, stale-if-error=86400');
    response.setHeader('X-Data-Freshness',freshness?.stale?'stale':'fresh');
    if(freshness?.stale)response.setHeader('Warning','110 - "Response is stale because the database is unavailable"');
    if(action==='sitemap'){
      const segment=url.searchParams.get('segment');
      const xml=segment?publicFootballSitemap(value,now,segment):publicSitemapIndex(value);
      if(xml===null)return error(404,'Tražena mapa sajta ne postoji.');
      return send(200,xml,'application/xml; charset=utf-8');
    }
    const redirect=(path:string)=>{response.statusCode=301;response.setHeader('Location',path);response.end();};
    if(action==='league-alias'){
      const slug=url.searchParams.get('slug'),matches=value.leagues.filter(league=>league.slug===slug||publicSlug(league.name)===slug);
      return matches.length===1?redirect(leaguePath(matches[0].slug)):error(404,'Liga nije pronađena u javnom pregledu.');
    }
    if(action==='match-alias'){
      const match=value.matches.find(match=>match.id===url.searchParams.get('id'));
      return match?redirect(matchPath(match)):error(404,'Utakmica nije pronađena u javnom pregledu.');
    }
    let data:PublicFootballPageData;
    try{data=buildPublicFootballPage(value,action as PublicFootballPageData['page'],url.searchParams,now);data.dataStale=Boolean(freshness?.stale);data.dataSnapshotAt=freshness?.snapshot.loadedAt;}catch(value){return error(400,(value as Error).message);}
    if(action==='league'&&!data.league||action==='match'&&!data.match||action==='team'&&!data.team||action==='pair'&&!data.pair)return error(404,'Za ovaj izbor nema javno dostupnih podataka.');
    if(html&&data.pair&&route&&url.pathname!==pairPath(data.pair.first,data.pair.second))return redirect(pairPath(data.pair.first,data.pair.second));
    if(html){
      response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
      return send(200,renderPublicFootball(data,url.searchParams),'text/html; charset=utf-8');
    }
    response.setHeader('X-Robots-Tag','noindex');
    return send(200,JSON.stringify(data),'application/json; charset=utf-8');
  }catch{return error(503,'Javni fudbalski podaci trenutno nisu dostupni. Pokušajte ponovo kasnije.');}
};
export default createPublicFootballHandler();
