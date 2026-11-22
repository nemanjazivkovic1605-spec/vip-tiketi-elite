import type { PublicForm, PublicMatch, PublicTeam } from '../../src/types/publicFootball.js';
import type { AnalyticsMatch } from '../../src/types/footballAnalytics.js';
import { aggregateHistorical, historicalTransition } from '../footballAnalytics/historicalStats.js';
import { publicTeamSlug } from './paths.js';
export const publicStatsMatch = (match: PublicMatch) => ({...match,environment:'real',matchDate:match.date,homeId:match.homeTeam,awayId:match.awayTeam,home:{name:match.homeTeam},away:{name:match.awayTeam}} as unknown as AnalyticsMatch);
export const publicAggregate = (matches:PublicMatch[])=>aggregateHistorical(matches.map(publicStatsMatch));
export const publicTransition = (match:PublicMatch)=>historicalTransition(publicStatsMatch(match));
export function publicTeamForm(matches:PublicMatch[],team:string,target:PublicMatch,size=5):PublicForm {
  const eligible=matches.filter(match=>match.league.country===target.league.country&&match.status==='finished'&&match.ft.home!==null&&[match.homeTeam,match.awayTeam].includes(team)&&match.id!==target.id
    && (match.date<target.date || match.date===target.date && !!match.kickoffAt && !!target.kickoffAt && match.kickoffAt<target.kickoffAt))
    .sort((a,b)=>b.date.localeCompare(a.date)||(b.kickoffAt||'').localeCompare(a.kickoffAt||'')||a.id.localeCompare(b.id)).slice(0,size);
  return formFromMatches(eligible,match=>match.homeTeam===team,size);
}
export function publicCurrentTeamForm(matches:PublicMatch[],team:PublicTeam,size=5):PublicForm {
  const eligible=[...matches].sort((a,b)=>b.date.localeCompare(a.date)||(b.kickoffAt||'').localeCompare(a.kickoffAt||'')||a.id.localeCompare(b.id)).slice(0,size);
  return formFromMatches(eligible,match=>publicTeamSlug(match.homeTeam,match.league.country)===team.slug,size);
}
function formFromMatches(eligible:PublicMatch[],atHome:(match:PublicMatch)=>boolean,size:number):PublicForm {
  const results=eligible.map(match=>{const home=atHome(match);const goals=home?match.ft.home!:match.ft.away!,against=home?match.ft.away!:match.ft.home!;return goals>against?'W':goals===against?'D':'L';});
  const mean=(read:(match:PublicMatch)=>number)=>eligible.length?eligible.reduce((sum,match)=>sum+read(match),0)/eligible.length:null;
  return {sample:eligible.length,expected:size,results,pointsPercent:eligible.length?results.reduce((sum,result)=>sum+(result==='W'?3:result==='D'?1:0),0)/(eligible.length*3)*100:null,
    averageFor:mean(match=>atHome(match)?match.ft.home!:match.ft.away!),averageAgainst:mean(match=>atHome(match)?match.ft.away!:match.ft.home!),
    over25:eligible.length?eligible.filter(match=>match.ft.home!+match.ft.away!>2.5).length/eligible.length*100:null,
    btts:eligible.length?eligible.filter(match=>match.ft.home!>0&&match.ft.away!>0).length/eligible.length*100:null,
    htftSample:eligible.filter(match=>publicTransition(match)!==null).length,comebacks:eligible.filter(match=>['1/2','2/1'].includes(publicTransition(match)||'')).length};
}
