// Google APIs called as the server itself: on Cloud Run the access token comes from the metadata server
// (the service account the app runs as), so no key file is ever needed. Elsewhere these calls are skipped.
import { projectId } from './auth.ts';

let cached: { token: string; until: number } | null = null;

/** An OAuth access token for the runtime service account, or null when not running on Google Cloud. */
export async function serverToken(): Promise<string | null> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  try {
    const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    cached = { token: j.access_token, until: Date.now() + Number(j.expires_in ?? 0) * 1000 };
    return cached.token;
  } catch {
    return null;
  }
}

/** Removes a Firebase Authentication user (account deletion). Needs roles/firebaseauth.admin. */
export async function deleteFirebaseUser(uid: string) {
  const token = await serverToken();
  if (!token || !projectId) return false;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid }),
  });
  if (!r.ok) throw new Error(`Firebase user delete failed (${r.status}): ${await r.text()}`);
  return true;
}
