import type { MatchResult } from '../types';
import { resultsProvider } from './resultsProvider';

type PitchMatch = MatchResult & { pitchMatchId: string };
type PitchDateResponse = { source: 'pitchapi'; matches: PitchMatch[] };

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\b(fc|afc|cf|sc)\b/g, '').replace(/[^a-z0-9]/g, '');

const minutes = (time: string) => {
  const parts = time.split(':').map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : NaN;
};

const sameFixture = (a: MatchResult, b: MatchResult) =>
  a.date === b.date && normalized(a.homeTeam) === normalized(b.homeTeam)
  && normalized(a.awayTeam) === normalized(b.awayTeam)
  && Number.isFinite(minutes(a.time)) && Number.isFinite(minutes(b.time))
  && Math.abs(minutes(a.time) - minutes(b.time)) <= 30;

export const pitchMatchesService = {
  async getMatchesForDate(date: string): Promise<{ matches: MatchResult[]; pitchAvailable: boolean }> {
    const [pitch, legacy] = await Promise.allSettled([
      fetch('/api/pitch-matches?date=' + encodeURIComponent(date)).then(async (response) => {
        if (!response.ok) throw new Error('PitchAPI unavailable');
        const data = await response.json() as PitchDateResponse;
        if (!Array.isArray(data.matches)) throw new Error('Invalid PitchAPI data');
        return data.matches;
      }),
      resultsProvider.getMatchesForDate(date),
    ]);
    if (pitch.status === 'rejected' && legacy.status === 'rejected') throw new Error('Izvori fudbalskih utakmica trenutno nisu dostupni.');
    const primary = pitch.status === 'fulfilled' ? pitch.value : [];
    const fallback = legacy.status === 'fulfilled' ? legacy.value : [];
    const merged = [...primary, ...fallback.filter((candidate) => !primary.some((match) => sameFixture(match, candidate)))];
    merged.sort((a, b) => (a.date + ' ' + a.time + ' ' + a.league).localeCompare(b.date + ' ' + b.time + ' ' + b.league));
    return { matches: merged, pitchAvailable: pitch.status === 'fulfilled' };
  },

  async getMatchXg(matchId: string): Promise<{ home: number; away: number } | null> {
    if (!/^m_[A-Za-z0-9]{6}$/.test(matchId)) throw new Error('Neispravan ID utakmice.');
    const response = await fetch('/api/pitch-matches?matchId=' + encodeURIComponent(matchId));
    if (!response.ok) throw new Error('xG trenutno nije dostupan.');
    const body = await response.json() as { xg: { home: number; away: number } | null };
    return body.xg || null;
  },
};
