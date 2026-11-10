import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const ISSUER = 'https://token.actions.githubusercontent.com';
const REPOSITORY = 'nemanjazivkovic1605-spec/vip-tiketi-elite';
const AUDIENCE = 'https://eliteviptips.com/api/daily-results';
type SigningKey = JsonWebKey & { kid?: string };
let cachedKeys: { expiresAt: number; keys: SigningKey[] } | undefined;

export function verifyResultsRunnerToken(token: string, keys: SigningKey[], now = Math.floor(Date.now() / 1000)) {
  try {
    if (token.length > 20000) return false;
    const [headerPart, payloadPart, signaturePart, extra] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart || extra) return false;
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
    if (header.alg !== 'RS256' || typeof header.kid !== 'string'
      || claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.repository !== REPOSITORY
      || claims.ref !== 'refs/heads/main' || claims.sub !== `repo:${REPOSITORY}:ref:refs/heads/main`
      || claims.workflow_ref !== `${REPOSITORY}/.github/workflows/daily-results.yml@refs/heads/main`
      || !['schedule', 'workflow_dispatch', 'push'].includes(claims.event_name)
      || !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 30
      || claims.exp - claims.iat > 600 || claims.nbf && claims.nbf > now + 30) return false;
    const key = keys.find((value) => value.kid === header.kid && value.kty === 'RSA');
    return Boolean(key && verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(signaturePart, 'base64url')));
  } catch { return false; }
}

export async function isResultsRunnerRequest(request: IncomingMessage) {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/)?.[1];
  if (!token || !token.includes('.')) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (payload.iss !== ISSUER) return false;
    if (!cachedKeys || cachedKeys.expiresAt < Date.now()) {
      const response = await fetch(`${ISSUER}/.well-known/jwks`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return false;
      const result = await response.json() as { keys: SigningKey[] };
      cachedKeys = { keys: result.keys || [], expiresAt: Date.now() + 10 * 60000 };
    }
    return verifyResultsRunnerToken(token, cachedKeys.keys);
  } catch { return false; }
}
