import type { IncomingMessage,ServerResponse } from 'node:http';
import { getAnalyticsDatabase } from '../server/footballAnalytics/database.js';
import { readPublicSnapshot,publicSnapshotCache } from '../server/publicFootball/store.js';
import { buildPublicFootballPage,parseFinderFilters } from '../server/publicFootball/model.js';
import { renderPublicFootball,renderPublicError,leaguePath,matchPath } from '../server/publicFootball/view.js';
import type { PublicSnapshot,PublicFootballPageData } from '../src/types/publicFootball.js';
import { addDays,localDate } from '../server/sportsApi.js';

const snapshot=publicSnapshotCache(async()=>readPublicSnapshot(await getAnalyticsDatabase()));
export const clearPublicFootballCache=()=>snapshot.clear();
const escapeXml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
export function publicFootballSitemap(value:PublicSnapshot,now=new Date()) {
  const today=localDate(now),from=addDays(today,-90),to=addDays(today,14);
  const paths=['/','/fudbal','/history','/stats','/contact','/terms','/faq','/bankroll-management','/daily-analysis','/early-information'];
  const matches=value.matches.filter(match=>match.date>=from&&match.date<=to).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,600);
  const entries=[...paths.map(path=>({path,lastmod:null as string|null})),...value.leagues.map(league=>({path:leaguePath(league.slug),lastmod:null as string|null})),...matches.map(match=>({path:matchPath(match),lastmod:match.checkedAt}))];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry=>`<url><loc>https://eliteviptips.com${escapeXml(entry.path)}</loc>${entry.lastmod?`<lastmod>${escapeXml(entry.lastmod)}</lastmod>`:''}</url>`).join('')}</urlset>`;
}
export const createPublicFootballHandler=(load=()=>snapshot.read(),clock=()=>new Date())=>async(request:IncomingMessage,response:ServerResponse)=>{
  response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const url=new URL(request.url||'/','https://eliteviptips.com');
  const html=url.searchParams.has('page')&&url.searchParams.get('page')!=='sitemap';
  const send=(status:number,data:string,type:string)=>{response.statusCode=status;response.setHeader('Content-Type',type);response.end(request.method==='HEAD'?'':data);};
  const error=(status:number,message:string)=>{response.setHeader('Cache-Control','no-store');send(status,html?renderPublicError(message,status):JSON.stringify({error:message}),html?'text/html; charset=utf-8':'application/json; charset=utf-8');};
  if(!['GET','HEAD'].includes(request.method||''))return error(405,'Ovaj pregled dozvoljava samo čitanje.');
  if((request.url||'').length>2200)return error(400,'Previše dugačak zahtev.');
  const action=url.searchParams.get('page')||url.searchParams.get('action')||'overview';
  if(!['overview','finder','league','match','sitemap'].includes(action))return error(400,'Nepodržan javni pregled.');
  if(action==='match'&&!/^[a-f0-9]{32}$/.test(url.searchParams.get('id')||''))return error(400,'Neispravan identifikator utakmice.');
  if(action==='league'&&!/^[a-z0-9-]{1,100}$/.test(url.searchParams.get('slug')||''))return error(400,'Neispravna liga.');
  const now=clock();
  try{parseFinderFilters(action==='overview'||action==='finder'?url.searchParams:new URLSearchParams(),now);}catch(value){return error(400,(value as Error).message);}
  try{
    const value=await load();
    response.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=1800');
    if(action==='sitemap')return send(200,publicFootballSitemap(value,now),'application/xml; charset=utf-8');
    let data:PublicFootballPageData;
    try{data=buildPublicFootballPage(value,action as PublicFootballPageData['page'],url.searchParams,now);}catch(value){return error(400,(value as Error).message);}
    if(action==='league'&&!data.league||action==='match'&&!data.match)return error(404,'Za ovaj izbor nema javno dostupnih podataka.');
    if(html){
      response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
      return send(200,renderPublicFootball(data,url.searchParams),'text/html; charset=utf-8');
    }
    response.setHeader('X-Robots-Tag','noindex');
    return send(200,JSON.stringify(data),'application/json; charset=utf-8');
  }catch{return error(503,'Javni fudbalski podaci trenutno nisu dostupni. Pokušajte ponovo kasnije.');}
};
export default createPublicFootballHandler();
