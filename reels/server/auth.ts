// Firebase Authentication on the server: checks the ID token the browser sends (Google or email sign-in).
// No SDK needed: the token is an RS256 JWT signed by Google's securetoken keys.
//   FIREBASE_PROJECT_ID   turns login on. Without it the app runs as a single local user (development).
import { createPublicKey, createVerify } from 'node:crypto';

export type User = { uid: string; email?: string };

export const projectId = process.env.FIREBASE_PROJECT_ID || '';
export const authEnabled = Boolean(projectId);
export const LOCAL_USER: User = { uid: 'local', email: 'local@localhost' };

const CERTS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certs: { keys: Record<string, string>; until: number } | null = null;

async function keyFor(kid: string) {
  if (!certs || Date.now() > certs.until || !certs.keys[kid]) {
    const r = await fetch(CERTS);
    if (!r.ok) throw new Error(`could not fetch signing keys (${r.status})`);
    const maxAge = Number(r.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 3600);
    certs = { keys: await r.json(), until: Date.now() + maxAge * 1000 };
  }
  const pem = certs.keys[kid];
  if (!pem) throw new Error('unknown signing key');
  return createPublicKey(pem);
}

const b64 = (s: string) => Buffer.from(s, 'base64url');

/** Returns the signed-in user, or throws when the token is missing, expired or not for this project. */
export async function verifyIdToken(token: string): Promise<User> {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) throw new Error('malformed token');
  const header = JSON.parse(b64(h).toString('utf8'));
  const claims = JSON.parse(b64(p).toString('utf8'));
  if (header.alg !== 'RS256') throw new Error('bad algorithm');
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(await keyFor(header.kid), b64(sig));
  if (!ok) throw new Error('bad signature');
  const now = Date.now() / 1000;
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('token is for another project');
  if (!(claims.exp > now) || !(claims.iat <= now + 300) || !claims.sub) throw new Error('token expired');
  return { uid: String(claims.sub), email: typeof claims.email === 'string' ? claims.email : undefined };
}

/** Browser config for the Firebase JS SDK; these values are public by design. */
export const webConfig = () =>
  authEnabled
    ? {
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
        projectId,
      }
    : null;
