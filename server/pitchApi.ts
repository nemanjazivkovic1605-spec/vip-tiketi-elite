// PitchAPI normalization shared by the public fixtures endpoint and tests.
// This module never reads API credentials and never writes to Firestore.
export type PitchPublicMatch = {
  id: string;
  pitchMatchId: string;
  source: 'pitchapi';
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  time: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED';
  score?: { home: number; away: number };
};

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit', hour12: false });

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const nonNegativeNumber = (value: unknown): number | null => {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const scoreNumber = (value: unknown): number | null => {
  const number = nonNegativeNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
};

export const mapPitchMatch = (input: unknown): PitchPublicMatch | null => {
  const match = object(input);
  if (!match || typeof match.id !== 'string' || !/^m_[A-Za-z0-9]{6}$/.test(match.id)) return null;
  const home = object(match.home_team), away = object(match.away_team), league = object(match.league);
  const homeName = home?.name, awayName = away?.name, leagueName = league?.name;
  if (typeof homeName !== 'string' || !homeName.trim() || typeof awayName !== 'string' || !awayName.trim()
    || typeof leagueName !== 'string' || !leagueName.trim() || typeof match.time_utc !== 'string') return null;
  const kickoff = new Date(match.time_utc);
  if (Number.isNaN(kickoff.getTime())) return null;
  const rawStatus = String(match.status || '').toLowerCase();
  const status: PitchPublicMatch['status'] = ['finished', 'full_time', 'completed'].includes(rawStatus)
    ? 'FINISHED'
    : /postpon|cancel|abandon|suspend/.test(rawStatus)
      ? 'POSTPONED'
      : ['live', 'in_progress', 'started', 'first_half', 'half_time', 'halftime', 'second_half', 'extra_time', 'penalties'].includes(rawStatus)
        ? 'LIVE' : 'SCHEDULED';
  const homeScore = scoreNumber(match.score_home), awayScore = scoreNumber(match.score_away);
  const result: PitchPublicMatch = {
    id: 'pitchapi:' + match.id, pitchMatchId: match.id, source: 'pitchapi',
    homeTeam: homeName.trim(), awayTeam: awayName.trim(), league: leagueName.trim(),
    date: dateFormatter.format(kickoff), time: timeFormatter.format(kickoff), status,
  };
  if ((status === 'FINISHED' || status === 'LIVE') && homeScore !== null && awayScore !== null) {
    result.score = { home: homeScore, away: awayScore };
  }
  return result;
};

export const extractPitchXg = (payload: unknown): { home: number; away: number } | null => {
  const root = object(payload), data = object(root?.data);
  const periods = data?.periods;
  if (!Array.isArray(periods)) return null;
  const all = periods.map(object).find((part) => String(part?.period || '').toLowerCase() === 'all');
  if (!all || !Array.isArray(all.groups)) return null;
  for (const groupItem of all.groups) {
    const group = object(groupItem);
    if (!group || !Array.isArray(group.items)) continue;
    for (const candidate of group.items) {
      const item = object(candidate);
      if (item?.key !== 'expected_goals') continue;
      const home = nonNegativeNumber(item.home), away = nonNegativeNumber(item.away);
      if (home !== null && away !== null) return { home, away };
    }
  }
  return null;
};
