import { localDate } from '../sportsApi.js';

let cached:{expires:number;task:Promise<unknown>}|undefined;
export function sportsHealthReport(){
  if(cached&&cached.expires>Date.now())return cached.task;
  const task=(async()=>{
    const providers:Array<Record<string,unknown>>=[];
    async function probe(name:string,url:string,headers:Record<string,string>={},environment='real'){
      try{const response=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});const body:any=await response.json().catch(()=>null);
        const rejected=!!body?.error||body?.errors&&Object.keys(body.errors).length>0;
        providers.push({name,configured:true,http:response.status,state:!response.ok||rejected?'unavailable':environment==='test'?'test_only':'working',environment,
          records:Array.isArray(body)?body.length:body?.matches?.length??body?.competitions?.length??body?.data?.leagues?.length??null});
      }catch{providers.push({name,configured:true,state:'unavailable',reason:'Izvor nije odgovorio u roku od 10 sekundi.'});}
    }
    const today=localDate(),year=Number(today.slice(0,4))-(Number(today.slice(5,7))<7?1:0);
    await probe('OpenLigaDB',`https://api.openligadb.de/getmatchdata/bl1/${year}`,{'User-Agent':'EliteVIPTips/1.0 (+https://eliteviptips.com/contact; support@eliteviptips.com)'});
    await probe('OpenFootball',`https://raw.githubusercontent.com/openfootball/football.json/master/${year}-${String(year+1).slice(-2)}/en.1.json`);
    const football=process.env.FOOTBALL_DATA_API_KEY?.trim();
    if(football)await probe('Football-Data.org','https://api.football-data.org/v4/competitions',{'X-Auth-Token':football});else providers.push({name:'Football-Data.org',configured:false,state:'not_configured'});
    const api=process.env.API_FOOTBALL_KEY?.trim();
    if(api&&process.env.API_FOOTBALL_ENABLED!=='false')await probe('API-Football','https://v3.football.api-sports.io/status',{'x-apisports-key':api});else providers.push({name:'API-Football',configured:!!api,state:api?'disabled':'not_configured'});
    const pitch=(process.env.PITCHAPI_KEY||process.env.PITCHAPI_API_KEY||'').trim();
    if(pitch.startsWith('pk_test_'))providers.push({name:'PitchAPI',configured:true,state:'test_only',reason:'Testni ključ nije potvrda stvarnih utakmica.'});
    else if(pitch.startsWith('pk_live_'))await probe('PitchAPI','https://api.pitchapi.dev/v1/leagues',{'X-API-KEY':pitch});else providers.push({name:'PitchAPI',configured:!!pitch,state:'not_verified'});
    const odds=process.env.ODDS_API_KEY?.trim();
    if(odds)await probe('The Odds API',`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(odds)}`);else providers.push({name:'The Odds API',configured:false,state:'not_configured'});
    providers.push({name:'Gemini',configured:!!process.env.GEMINI_API_KEY,state:'not_tested',reason:'AI generisanje nije pokrenuto tokom read-only revizije.'});
    return{checkedAt:new Date().toISOString(),providers,sqlWrites:0,firestoreWrites:0};
  })();cached={expires:Date.now()+5*60000,task};task.catch(()=>{cached=undefined;});return task;
}
