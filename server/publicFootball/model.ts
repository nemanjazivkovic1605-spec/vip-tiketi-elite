import type { FinderFilters, PublicFootballPageData, PublicMatch, PublicMatchPreview, PublicSnapshot } from '../../src/types/publicFootball.js';
import { publicAggregate, publicTeamForm } from './stats.js';
import { addDays, localDate, validDate } from '../sportsApi.js';
import { isPublicTeamMatch, publicDirectory, publicPairKey, publicTeamSummary } from './directory.js';
import { COLLECTOR_MAX_RESULT_AGE_DAYS } from './collector.js';
export const PUBLIC_PAGE_SIZE=30;
export function parseFinderFilters(params:URLSearchParams,now=new Date()):FinderFilters {
  const today=localDate(now),from=params.get('from')||today,to=params.get('to')||addDays(from,6);
  if(!validDate(from)||!validDate(to)||from>to||from<today||to>addDays(today,30)||Date.parse(to)-Date.parse(from)>6*86400000)throw new Error('Izaberite do 7 narednih dana, u okviru sledećih 30 dana.');
  const league=params.get('league')||'';
  if(league&&!/^[a-z0-9-]{1,100}$/.test(league))throw new Error('Neispravna liga.');
  const percent=(key:string)=>{const raw=params.get(key);if(raw===null||raw==='')return null;const value=Number(raw);if(!Number.isFinite(value)||value<0||value>100)throw new Error('Procenat mora biti između 0 i 100.');return value;};
  const sample=Number(params.get('sample')||3),offset=Number(params.get('offset')||0),comeBacks=params.get('comebacks')?Number(params.get('comebacks')):null;
  if(!Number.isInteger(sample)||sample<1||sample>5||!Number.isInteger(offset)||offset<0||offset>20000||comeBacks!==null&&(!Number.isInteger(comeBacks)||comeBacks<0||comeBacks>5))throw new Error('Neispravan uzorak ili stranica.');
  return{from,to,league,form:percent('form'),over25:percent('over25'),btts:percent('btts'),comeBacks,sample,offset,search:(params.get('search')||'').trim().slice(0,60)};
}
const recentlyVerified=(match:PublicMatch,now:Date)=>{
  const checkedAt=match.checkedAt?Date.parse(match.checkedAt):NaN;
  return Number.isFinite(checkedAt)&&checkedAt<=now.getTime()+5*60_000&&now.getTime()-checkedAt<=COLLECTOR_MAX_RESULT_AGE_DAYS*86_400_000;
};
const upcoming=(match:PublicMatch,now:Date)=>recentlyVerified(match,now)&&['scheduled','unknown','live'].includes(match.status)&&match.ft.home===null&&match.date>=localDate(now)&&(!match.kickoffAt||match.status==='live'||Date.parse(match.kickoffAt)>now.getTime());
const order=(a:PublicMatch,b:PublicMatch)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99')||a.id.localeCompare(b.id);
export function publicPreview(matches:PublicMatch[],match:PublicMatch):PublicMatchPreview {
  const home=publicTeamForm(matches,match.homeTeam,match),away=publicTeamForm(matches,match.awayTeam,match);
  return{match,home,away,missing:[...(!match.time?['Vreme početka nije potvrđeno']:[]),...(!match.kickoffAt&&match.time?['Vremenska zona izvornog termina nije potvrđena']:[]),...(home.sample<5?[`Domaćin: uzorak ${home.sample}/5`]:[]),...(away.sample<5?[`Gost: uzorak ${away.sample}/5`]:[]),...(!home.htftSample||!away.htftSample?['Nepotpun HT/FT uzorak']:[])]};
}
export function buildPublicFootballPage(snapshot:PublicSnapshot,page:PublicFootballPageData['page'],params:URLSearchParams,now=new Date()):PublicFootballPageData {
  const today=localDate(now);
  const input=page==='finder'||page==='overview'?params:page==='today'?new URLSearchParams({...Object.fromEntries(params),from:today,to:today})
    :new URLSearchParams({offset:params.get('offset')||'0',search:params.get('search')||'',league:params.get('league')||''});
  const filters=parseFinderFilters(input,now),directory=publicDirectory(snapshot);
  const league=page==='league'?snapshot.leagues.find(row=>row.slug===params.get('slug'))||null:null;
  const match=page==='match'?snapshot.matches.find(row=>row.id===params.get('id'))||null:null;
  const team=page==='team'?directory.teamBySlug.get(params.get('slug')||'')||null:null;
  const pair=page==='pair'?directory.pairByKey.get(publicPairKey(params.get('first')||'',params.get('second')||''))||null:null;
  const season=params.get('season')||'';
  if(season && !(league||team)?.seasons.includes(season))throw new Error('Izabrana sezona nije dostupna za ovaj pregled.');
  const scope=snapshot.matches.filter(row=>(!league||row.league.slug===league.slug)&&(!season||row.season===season)
    &&(!team||isPublicTeamMatch(row,team))&&(!pair||isPublicTeamMatch(row,pair.first)&&isPublicTeamMatch(row,pair.second)));
  const upcomingOffset=['league','team','pair'].includes(page)?Number(params.get('upcomingOffset')||0):filters.offset;
  if(!Number.isInteger(upcomingOffset)||upcomingOffset<0||upcomingOffset>20000)throw new Error('Neispravna stranica rasporeda.');
  const candidates=['teams','h2h'].includes(page)?[]:scope.filter(row=>upcoming(row,now)&&row.date>=filters.from&&row.date<=filters.to&&(!filters.league||row.league.slug===filters.league)&&(!filters.search||`${row.homeTeam} ${row.awayTeam}`.toLocaleLowerCase().includes(filters.search.toLocaleLowerCase()))).sort(order);
  const previewScope=team||pair?snapshot.matches:scope;
  let rows=(page==='finder'?candidates:candidates.slice(upcomingOffset,upcomingOffset+PUBLIC_PAGE_SIZE)).map(row=>publicPreview(previewScope,row));
  if(page==='finder')rows=rows.filter(row=>{
    const statistical=filters.form!==null||filters.over25!==null||filters.btts!==null||filters.comeBacks!==null;
    if(statistical&&(row.home.sample<filters.sample||row.away.sample<filters.sample))return false;
    return (filters.form===null||row.home.pointsPercent!==null&&row.away.pointsPercent!==null&&Math.max(row.home.pointsPercent,row.away.pointsPercent)>=filters.form)
      &&(filters.over25===null||row.home.over25!==null&&row.away.over25!==null&&Math.min(row.home.over25,row.away.over25)>=filters.over25)
      &&(filters.btts===null||row.home.btts!==null&&row.away.btts!==null&&Math.min(row.home.btts,row.away.btts)>=filters.btts)
      &&(filters.comeBacks===null||row.home.htftSample>=filters.sample&&row.away.htftSample>=filters.sample&&row.home.comebacks+row.away.comebacks>=filters.comeBacks);
  });
  const total=page==='finder'?rows.length:candidates.length;
  const completed=scope.filter(row=>row.status==='finished'&&row.ft.home!==null).sort((a,b)=>-order(a,b));
  const h2h=match?snapshot.matches.filter(row=>row.id!==match.id&&row.league.country===match.league.country&&row.status==='finished'&&row.ft.home!==null&&row.date<match.date&&[row.homeTeam,row.awayTeam].includes(match.homeTeam)&&[row.homeTeam,row.awayTeam].includes(match.awayTeam)).sort((a,b)=>-order(a,b)).slice(0,10):[];
  const resultOffset=['league','team','pair'].includes(page)?filters.offset:0;
  const resultScope=page==='today'?completed.filter(row=>row.date===today):completed;
  const search=filters.search.toLocaleLowerCase();
  const teams=page==='teams'?directory.teams.filter(row=>(!filters.league||row.leagues.includes(filters.league))&&(!search||row.name.toLocaleLowerCase().includes(search))):[];
  const pairs=page==='h2h'?directory.pairs.filter(row=>(!filters.league||row.leagues.includes(filters.league))&&(!search||`${row.first.name} ${row.second.name}`.toLocaleLowerCase().includes(search))):[];
  const directoryTotal=page==='teams'?teams.length:pairs.length;
  return{page,today,filters,leagues:snapshot.leagues,league,match,aggregate:publicAggregate(scope),rows:page==='finder'?rows.slice(filters.offset,filters.offset+PUBLIC_PAGE_SIZE):rows,results:resultScope.slice(resultOffset,resultOffset+30),resultsTotal:resultScope.length,resultsMore:resultScope.length>resultOffset+30,h2h,
    home10:match?publicTeamForm(snapshot.matches,match.homeTeam,match,10):null,away10:match?publicTeamForm(snapshot.matches,match.awayTeam,match,10):null,
    total,hasMore:total>upcomingOffset+PUBLIC_PAGE_SIZE,lastUpdatedAt:snapshot.lastUpdatedAt,truncated:snapshot.truncated,
    teams:teams.slice(filters.offset,filters.offset+PUBLIC_PAGE_SIZE),team,teamSummary:team?publicTeamSummary(scope,team,now):null,
    pairs:pairs.slice(filters.offset,filters.offset+PUBLIC_PAGE_SIZE),pair,directoryTotal,directoryMore:directoryTotal>filters.offset+PUBLIC_PAGE_SIZE,
    unavailableLeagues:['National League North / South','Isthmian Premier','Northern Premier','Southern Premier Central / South'],
    coverageWarnings:snapshot.leagues.filter(row=>!row.seasons.some(season=>season.startsWith(String(Number(today.slice(0,4))-(Number(today.slice(5,7))<7?1:0))))).map(row=>`${row.name}: nema potvrđenih podataka za tekuću sezonu.`)};
}
