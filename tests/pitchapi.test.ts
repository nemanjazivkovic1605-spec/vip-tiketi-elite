import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPitchXg, mapPitchMatch } from '../server/pitchApi.ts';

test('PitchAPI schedule matches map to Belgrade date and regular-time score', () => {
  const match = mapPitchMatch({
    id: 'm_B8x2K9', time_utc: '2026-11-11T20:30:00Z', status: 'finished',
    league: { id: 'l_4Kd0Wq', name: 'Premier League' },
    home_team: { id: 't_9aB2xQ', name: 'Manchester City' },
    away_team: { id: 't_2mLp7C', name: 'Manchester United' },
    score_home: 3, score_away: 1,
  });
  assert.equal(match?.id, 'pitchapi:m_B8x2K9');
  assert.equal(match?.date, '2026-11-11');
  assert.equal(match?.time, '21:30');
  assert.deepEqual(match?.score, { home: 3, away: 1 });
});

test('PitchAPI cannot fabricate scores or fixtures from malformed responses', () => {
  assert.equal(mapPitchMatch({ id: 'm_B8x2K9' }), null);
  const match = mapPitchMatch({
    id: 'm_B8x2K9', time_utc: '2026-11-11T20:30:00Z', status: 'scheduled',
    league: { name: 'Premier League' }, home_team: { name: 'Home' }, away_team: { name: 'Away' },
    score_home: 0, score_away: 0,
  });
  assert.equal(match?.score, undefined);
});

test('xG is parsed only from the All period and expected_goals metric', () => {
  const data = { data: { periods: [{ period: 'FirstHalf', groups: [{ items: [
    { key: 'expected_goals', home: '0.90', away: '0.30' },
  ] }] }, { period: 'All', groups: [{ items: [
    { key: 'expected_goals', home: '2.92', away: '2.49', format_type: 'double' },
  ] }] }] } };
  assert.deepEqual(extractPitchXg(data), { home: 2.92, away: 2.49 });
  assert.equal(extractPitchXg({ data: { periods: [] } }), null);
});
