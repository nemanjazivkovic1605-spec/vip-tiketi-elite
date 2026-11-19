import { localDate, validDate } from '../sportsApi.js';
import type { PublicMatch, PublicSource } from '../../src/types/publicFootball.js';

export const PUBLIC_SOURCES = {
  openfootball: { name: 'OpenFootball', url: 'https://github.com/openfootball/football.json', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  openligadb: { name: 'OpenLigaDB', url: 'https://www.openligadb.de/', license: 'ODbL 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/' },
} as const;
export const PUBLIC_FIELDS = ['league.name','league.country','season','home.name','away.name','kickoffAt','matchDate','matchTime','status','ht.home','ht.away','ft.home','ft.away'] as const;
export type PublicInput = { environment: string; fields: Record<string, unknown>; provenance: Record<string, { provider?: string; observedAt?: string } | null> };
export const publicSource = (value: unknown): value is PublicSource => typeof value === 'string' && Object.hasOwn(PUBLIC_SOURCES, value);
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0,100) : '';
const number = (value: unknown): number | null => value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < 100 ? Number(value) : null;
const instant = (value: unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

// A permitted source on a merged record does not make its restricted fields public.
export function mapPublicFootballMatch(id: string, input: PublicInput, now = new Date()): PublicMatch | null {
  if (!/^[a-f0-9]{32}$/.test(id) || input.environment !== 'real') return null;
  const used = new Set<PublicSource>();
  const read = (key: string) => {
    const provider = input.provenance[key]?.provider;
    if (!publicSource(provider)) return null;
    used.add(provider); return input.fields[key] ?? null;
  };
  const homeTeam = text(read('home.name')), awayTeam = text(read('away.name'));
  const name = text(read('league.name')), country = text(read('league.country')), season = text(read('season'));
  if (!homeTeam || !awayTeam || homeTeam === awayTeam || !name || !country || !/^20\d\d(?:[/-](?:20)?\d\d)?$/.test(season)) return null;
  const kickoffAt = instant(read('kickoffAt'));
  const date = kickoffAt ? localDate(new Date(kickoffAt)) : text(read('matchDate'));
  if (!validDate(date)) return null;
  const rawTime = text(read('matchTime'));
  const time = kickoffAt ? new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Belgrade',hour:'2-digit',minute:'2-digit'}).format(new Date(kickoffAt)) : /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : null;
  const pair = (key: string) => { const home=number(read(`${key}.home`)), away=number(read(`${key}.away`)); return home !== null && away !== null ? {home,away} : {home:null,away:null}; };
  const ft = pair('ft'), ht = pair('ht');
  if (ft.home !== null && ht.home !== null && (ht.home > ft.home || ht.away! > ft.away!)) { ht.home = null; ht.away = null; }
  const rawStatus = read('status');
  let status: PublicMatch['status'] = ['scheduled','live','finished','postponed','canceled'].includes(String(rawStatus)) ? rawStatus as PublicMatch['status'] : 'unknown';
  const future = date > localDate(now) || !!kickoffAt && Date.parse(kickoffAt) > now.getTime();
  if (status === 'finished' && (ft.home === null || future)) status = 'unknown';
  if (future) { ft.home=null; ft.away=null; ht.home=null; ht.away=null; }
  const observed = Object.values(input.provenance).filter(value=>publicSource(value?.provider)).map(value=>instant(value?.observedAt)).filter((value):value is string=>!!value).sort().at(-1) || null;
  return { id, league:{slug:slug(`${country}-${name}`),name,country},season,date,time,kickoffAt,homeTeam,awayTeam,status,ht,ft,checkedAt:observed,sources:[...used].sort() };
}
