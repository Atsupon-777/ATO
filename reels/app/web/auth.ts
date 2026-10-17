// Sign-in in the browser (Firebase Authentication: Google or email). The server turns it on by
// returning a Firebase config from /api/config; without one the app runs signed out as a local user.
import { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth';
import { lang } from './i18n';

export type AuthState = { ready: boolean; enabled: boolean; email?: string | null; signedIn: boolean; verified?: boolean };
export type AppConfig = { firebase: { apiKey: string; authDomain: string; projectId: string } | null; billing: boolean; topupTokens: number; freeTokens: number; planTokens: Record<string, number> };

let state: AuthState = { ready: false, enabled: false, signedIn: false };
let token: string | null = null;
let auth: Auth | null = null;
export let config: AppConfig | null = null;
const listeners = new Set<(s: AuthState) => void>();
const emit = (s: Partial<AuthState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l(state));
};

/** Sent with every API call. Media (<video>, <img>) use the same token from the session cookie. */
export const authHeader = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

const setCookie = (t: string | null) => {
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = t ? `reels_session=${t}; path=/; max-age=3600; samesite=lax${secure}` : `reels_session=; path=/; max-age=0${secure}`;
};

export async function startAuth() {
  try {
    config = await fetch('/api/config').then((r) => r.json());
  } catch {
    config = null;
  }
  if (!config?.firebase) return emit({ ready: true, enabled: false, signedIn: true });
  auth = getAuth(initializeApp(config.firebase));
  auth.languageCode = lang;
  // Fires on sign-in, sign-out and each hourly token refresh.
  onIdTokenChanged(auth, async (u) => {
    token = u ? await u.getIdToken() : null;
    setCookie(token);
    emit({ ready: true, enabled: true, signedIn: Boolean(u), email: u?.email, verified: Boolean(u?.emailVerified) });
  });
}

export const useAuth = () => {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    set(state);
    return () => void listeners.delete(set);
  }, []);
  return s;
};

export const signInGoogle = () => signInWithPopup(auth!, new GoogleAuthProvider());
export const signInEmail = (email: string, password: string) => signInWithEmailAndPassword(auth!, email, password);
export const signUpEmail = async (email: string, password: string) => {
  const { user } = await createUserWithEmailAndPassword(auth!, email, password);
  await sendEmailVerification(user);
};
export const resendVerification = () => sendEmailVerification(auth!.currentUser!);
/** After the user clicked the link: reload the account and get a token that says the email is verified. */
export async function checkVerified() {
  const u = auth!.currentUser!;
  await u.reload();
  token = await u.getIdToken(true);
  setCookie(token);
  emit({ verified: u.emailVerified });
  return u.emailVerified;
}
export const resetPassword = (email: string) => sendPasswordResetEmail(auth!, email);
export const signOut = () => (auth ? fbSignOut(auth) : Promise.resolve());
