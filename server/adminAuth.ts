import type { IncomingMessage } from 'node:http';
import fallback from '../firebase-applet-config.json' with { type: 'json' };

export async function isAdminRequest(request: IncomingMessage) {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/)?.[1];
  if (!token) return false;
  try {
    const webKey = process.env.VITE_FIREBASE_API_KEY || fallback.apiKey;
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const user = (await response.json() as { users?: Array<{ localId?: string; email?: string }> }).users?.[0];
    if (!user?.localId) return false;
    if (user.email?.toLowerCase() === 'nemanjazivkovic1605@gmail.com') return true;
    const project = process.env.VITE_FIREBASE_PROJECT_ID || fallback.projectId;
    const database = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIRESTORE_DATABASE_ID || fallback.firestoreDatabaseId;
    const profile = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/${encodeURIComponent(database)}/documents/users/${encodeURIComponent(user.localId)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
    return profile.ok && (await profile.json() as { fields?: { role?: { stringValue?: string } } }).fields?.role?.stringValue === 'admin';
  } catch { return false; }
}

export function isCronRequest(request: IncomingMessage) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.authorization === `Bearer ${secret}`);
}
