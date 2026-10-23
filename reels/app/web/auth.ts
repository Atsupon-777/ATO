// Sign-in (Firebase Authentication: Google, Apple or email). The server turns it on by returning a Firebase
// config from /api/config; without one the app runs signed out as a local user.
// On the website this uses the Firebase JS SDK. In the iPhone / Android app it uses the native Firebase SDK
// (@capacitor-firebase/authentication), because Google's and Apple's sign-in pages can't run inside the app's
// web view; the server sees the same ID token either way, so the account and token balance are shared.
import { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  type ConfirmationResult,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  reauthenticateWithPopup,
  revokeAccessToken,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth';
import { FirebaseAuthentication, type User as NativeUser } from '@capacitor-firebase/authentication';
import { lang } from './i18n';
import { apiUrl, clearMediaKey, currentPushToken, enablePush, iapLogOut, isNative, platform, pushAllowed, refreshMediaKey, type IapConfig } from './native';

export type AuthState = { ready: boolean; enabled: boolean; email?: string | null; signedIn: boolean; verified?: boolean; uid?: string; apple?: boolean };
export type AppConfig = {
  firebase: { apiKey: string; authDomain: string; projectId: string } | null;
  billing: boolean;
  /** Pay as you go on the website: tokens come in units of `unit`, each `unitYen` yen, `min`..`max` units. */
  payg?: { unit: number; unitYen: number; min: number; max: number };
  freeTokens: number;
  planTokens: Record<string, number>;
  /** In-app purchases (RevenueCat), for the iPhone / Android app. */
  iap?: IapConfig | null;
  /** "Sign in with Apple" on the website too (needs an Apple Services ID in Firebase). */
  appleWeb?: boolean;
};

let state: AuthState = { ready: false, enabled: false, signedIn: false };
let token: string | null = null;
let auth: Auth | null = null;
export let config: AppConfig | null = null;
const listeners = new Set<(s: AuthState) => void>();
const emit = (s: Partial<AuthState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l(state));
};

/** Sent with every API call. On the website, media (<video>, <img>) use the same token from the session cookie. */
export const authHeader = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

const setCookie = (t: string | null) => {
  if (isNative) return;
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = t ? `reels_session=${t}; path=/; max-age=3600; samesite=lax${secure}` : `reels_session=; path=/; max-age=0${secure}`;
};

/** Apple vouches for its users' addresses (and some share none), so they skip the email check. */
const isApple = (providers: { providerId: string }[] | undefined) => Boolean(providers?.some((p) => p.providerId === 'apple.com'));

/** This phone gets a push when a reel is ready. */
export const registerPushToken = (t: string) =>
  fetch(apiUrl('/api/push-token'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify({ token: t, platform, lang }) });

export async function startAuth() {
  try {
    config = await fetch(apiUrl('/api/config')).then((r) => r.json());
  } catch {
    config = null;
  }
  if (!config?.firebase) return emit({ ready: true, enabled: false, signedIn: true });
  if (isNative) return startNativeAuth();
  auth = getAuth(initializeApp(config.firebase));
  auth.languageCode = lang;
  // Fires on sign-in, sign-out and each hourly token refresh.
  onIdTokenChanged(auth, async (u) => {
    token = u ? await u.getIdToken() : null;
    setCookie(token);
    const apple = isApple(u?.providerData);
    emit({ ready: true, enabled: true, signedIn: Boolean(u), email: u?.email, verified: Boolean(u?.emailVerified) || apple, uid: u?.uid, apple });
  });
}

// ---------- the app (native Firebase SDK) ----------

let nativeUser: NativeUser | null = null;
let applying = 0;
async function applyNative(u: NativeUser | null) {
  const n = ++applying;
  nativeUser = u;
  const t = u ? (await FirebaseAuthentication.getIdToken()).token : null;
  if (n !== applying) return;
  token = t;
  if (t) await refreshMediaKey(authHeader());
  else clearMediaKey();
  const apple = isApple(u?.providerData);
  emit({ ready: true, enabled: true, signedIn: Boolean(u), email: u?.email, verified: Boolean(u?.emailVerified) || apple, uid: u?.uid, apple });
  if (u && (await pushAllowed())) enablePush(registerPushToken);
}

async function startNativeAuth() {
  await FirebaseAuthentication.setLanguageCode({ languageCode: lang }).catch(() => null);
  FirebaseAuthentication.addListener('authStateChange', ({ user }) => void applyNative(user));
  await applyNative((await FirebaseAuthentication.getCurrentUser()).user);
  // ID tokens last an hour; getIdToken hands back the cached one or a fresh one when it is about to expire.
  let keyAt = Date.now();
  setInterval(async () => {
    if (!nativeUser) return;
    const t = (await FirebaseAuthentication.getIdToken().catch(() => null))?.token;
    if (t) token = t;
    if (Date.now() - keyAt > 6 * 3600_000) (keyAt = Date.now()), refreshMediaKey(authHeader());
  }, 5 * 60_000);
}

/** After a change on the account (phone linked, email verified): reload the user and take a fresh token. */
async function nativeRefresh() {
  await FirebaseAuthentication.reload();
  nativeUser = (await FirebaseAuthentication.getCurrentUser()).user;
  token = (await FirebaseAuthentication.getIdToken({ forceRefresh: true })).token;
  return nativeUser;
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

const appleProvider = () => {
  const p = new OAuthProvider('apple.com');
  p.addScope('email');
  p.addScope('name');
  p.setCustomParameters({ locale: lang });
  return p;
};

export const signInGoogle = () => (isNative ? FirebaseAuthentication.signInWithGoogle() : signInWithPopup(auth!, new GoogleAuthProvider()));
export const signInApple = () => (isNative ? FirebaseAuthentication.signInWithApple({ scopes: ['email', 'name'] }) : signInWithPopup(auth!, appleProvider()));
export const signInEmail = (email: string, password: string) =>
  isNative ? FirebaseAuthentication.signInWithEmailAndPassword({ email, password }) : signInWithEmailAndPassword(auth!, email, password);
export const signUpEmail = async (email: string, password: string) => {
  if (isNative) {
    await FirebaseAuthentication.createUserWithEmailAndPassword({ email, password });
    await FirebaseAuthentication.sendEmailVerification();
    return;
  }
  const { user } = await createUserWithEmailAndPassword(auth!, email, password);
  await sendEmailVerification(user);
};
export const resendVerification = () => (isNative ? FirebaseAuthentication.sendEmailVerification() : sendEmailVerification(auth!.currentUser!));
/** After the user clicked the link: reload the account and get a token that says the email is verified. */
export async function checkVerified() {
  if (isNative) {
    const u = await nativeRefresh();
    emit({ verified: Boolean(u?.emailVerified) });
    return Boolean(u?.emailVerified);
  }
  const u = auth!.currentUser!;
  await u.reload();
  token = await u.getIdToken(true);
  setCookie(token);
  emit({ verified: u.emailVerified });
  return u.emailVerified;
}
export const resetPassword = (email: string) => (isNative ? FirebaseAuthentication.sendPasswordResetEmail({ email }) : sendPasswordResetEmail(auth!, email));

/** Signs out, and stops this phone's notifications and purchases for the account. */
export async function signOut() {
  const push = currentPushToken();
  if (push && token)
    await fetch(apiUrl('/api/push-token'), { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify({ token: push }) }).catch(() => null);
  await iapLogOut();
  if (isNative) return FirebaseAuthentication.signOut();
  return auth ? fbSignOut(auth) : Promise.resolve();
}

/**
 * Deletes the account (App Store guideline 5.1.1(v)). Apple sign-ins first revoke the app's Apple tokens,
 * which needs a fresh Apple confirmation; then the server removes the account, its reels and the login.
 */
export async function deleteAccount() {
  if (state.apple) {
    if (isNative) {
      const r = await FirebaseAuthentication.signInWithApple();
      const code = r.credential?.authorizationCode;
      if (code) await FirebaseAuthentication.revokeAccessToken({ token: code });
      token = (await FirebaseAuthentication.getIdToken({ forceRefresh: true })).token;
    } else if (auth?.currentUser) {
      const r = await reauthenticateWithPopup(auth.currentUser, appleProvider());
      const access = OAuthProvider.credentialFromResult(r)?.accessToken;
      if (access) await revokeAccessToken(auth, access);
      token = await auth.currentUser.getIdToken(true);
    }
  }
  const r = await fetch(apiUrl('/api/me'), { method: 'DELETE', headers: authHeader() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  await iapLogOut();
  if (isNative) await FirebaseAuthentication.signOut().catch(() => null);
  else if (auth) await fbSignOut(auth).catch(() => null);
}

/** "090-1234-5678" → "+819012345678"; numbers typed with a + and country code are kept. */
export const toE164 = (s: string) => {
  const d = s.replace(/[^\d+]/g, '');
  return d.startsWith('+') ? d : d.startsWith('0') ? `+81${d.slice(1)}` : `+${d}`;
};
export const linkedPhone = () => (isNative ? nativeUser?.phoneNumber : auth?.currentUser?.phoneNumber) ?? null;

let verifier: RecaptchaVerifier | null = null;
let confirmation: ConfirmationResult | null = null;
let verificationId = '';
/** Sends the SMS code. `button` is the id of the button that was pressed (invisible reCAPTCHA, website only). */
export async function sendPhoneCode(phone: string, button: string) {
  if (isNative) {
    // The native SDK answers through listeners: the code was sent, it failed, or Android verified it by itself.
    await FirebaseAuthentication.removeAllListeners();
    FirebaseAuthentication.addListener('authStateChange', ({ user }) => void applyNative(user));
    const sent = new Promise<void>((resolve, reject) => {
      FirebaseAuthentication.addListener('phoneCodeSent', (e) => ((verificationId = e.verificationId), resolve()));
      FirebaseAuthentication.addListener('phoneVerificationFailed', (e) => reject(Object.assign(new Error(e.message), { code: 'auth/invalid-phone-number' })));
      FirebaseAuthentication.addListener('phoneVerificationCompleted', () => ((verificationId = ''), resolve()));
    });
    await FirebaseAuthentication.linkWithPhoneNumber({ phoneNumber: toE164(phone) });
    await sent;
    if (!verificationId) await nativeRefresh();
    return;
  }
  verifier ??= new RecaptchaVerifier(auth!, button, { size: 'invisible' });
  try {
    confirmation = await linkWithPhoneNumber(auth!.currentUser!, toE164(phone), verifier);
  } catch (e) {
    verifier.clear();
    verifier = null;
    throw e;
  }
}
/** Checks the code and refreshes the ID token so the server sees the phone number. */
export async function confirmPhoneCode(code: string) {
  if (isNative) {
    if (verificationId) await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code.trim() });
    await nativeRefresh();
    return;
  }
  await confirmation!.confirm(code.trim());
  token = await auth!.currentUser!.getIdToken(true);
  setCookie(token);
}
