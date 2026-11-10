import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyResultsRunnerToken } from '../server/resultsRunnerAuth.ts';

test('result scheduler accepts only a signed, unexpired token for the exact production workflow', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key' };
  const now = 1800000000;
  const claims = {
    iss: 'https://token.actions.githubusercontent.com', aud: 'https://eliteviptips.com/api/daily-results',
    repository: 'nemanjazivkovic1605-spec/vip-tiketi-elite', ref: 'refs/heads/main',
    sub: 'repo:nemanjazivkovic1605-spec/vip-tiketi-elite:ref:refs/heads/main',
    workflow_ref: 'nemanjazivkovic1605-spec/vip-tiketi-elite/.github/workflows/daily-results.yml@refs/heads/main',
    event_name: 'schedule', iat: now - 10, exp: now + 290,
  };
  const jwt = (patch = {}) => {
    const data = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: key.kid })).toString('base64url'), Buffer.from(JSON.stringify({ ...claims, ...patch })).toString('base64url')].join('.');
    return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
  };
  assert.equal(verifyResultsRunnerToken(jwt(), [key], now), true);
  for (const patch of [{ aud: 'wrong' }, { ref: 'refs/heads/feature' }, { repository: 'fork/repo' }, { workflow_ref: 'wrong' }, { event_name: 'pull_request' }, { exp: now - 1 }]) {
    assert.equal(verifyResultsRunnerToken(jwt(patch), [key], now), false);
  }
  assert.equal(verifyResultsRunnerToken(jwt() + 'bad', [key], now), false);
  assert.equal(verifyResultsRunnerToken(jwt(), [], now), false);
});
