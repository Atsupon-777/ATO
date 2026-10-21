// The iPhone / Android app (Capacitor). The same React app is bundled inside the app (not a web view of the
// site), talks to the server at API_ORIGIN, and uses the phone's own features: the photo library, saving to
// the camera roll, the share sheet, push notifications and in-app purchases. On the website none of this runs.
// No keys live in the app: Firebase and RevenueCat settings come from /api/config, AI runs on the server.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Media } from '@capacitor-community/media';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { PRODUCT_CATEGORY, Purchases, type PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

// Set by the app build (scripts/build-native.mjs); the website calls its own origin.
declare const __API_ORIGIN__: string | undefined;
export const API_ORIGIN = isNative ? (typeof __API_ORIGIN__ === 'string' && __API_ORIGIN__) || 'https://reels.ato-sns.com' : '';
export const apiUrl = (p: string) => (/^https?:/.test(p) ? p : `${API_ORIGIN}${p}`);

if (isNative) {
  // Templates and the gallery load media through Remotion's staticFile, which prefixes this base.
  (window as any).remotion_staticBase ??= API_ORIGIN;
  document.documentElement.classList.add('native', `native-${platform}`);
  // Links that would leave the app (terms, privacy policy, outside sites) open in an in-app browser.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    const href = a?.getAttribute('href');
    if (!a || !href || href.startsWith('#')) return;
    if (a.target === '_blank' || /^https?:/.test(href) || href.startsWith('/')) {
      e.preventDefault();
      Browser.open({ url: apiUrl(href) });
    }
  });
  // Android's back button walks back through the app's pages, and leaves the app from the first one.
  App.addListener('backButton', ({ canGoBack }) => (canGoBack ? history.back() : App.exitApp()));
}

// ---------- media key: <video>/<img> of the user's own jobs and uploads ----------

let mediaKey = '';
/** "?k=..." for job and upload media in the app; empty on the website (the session cookie covers it there). */
export const mediaQuery = (p: string) => (mediaKey && /^\/?(jobs|uploads)\//.test(p) ? `?k=${mediaKey}` : '');
export async function refreshMediaKey(headers: Record<string, string>) {
  if (!isNative) return;
  const r = await fetch(apiUrl('/api/media-key'), { headers });
  if (!r.ok) return;
  mediaKey = (await r.json()).key;
  // The Remotion templates read it too (src/lib/assets.ts).
  (globalThis as any).reels_mediaKey = mediaKey;
}
export const clearMediaKey = () => {
  mediaKey = '';
  (globalThis as any).reels_mediaKey = '';
};

// ---------- photo library ----------

const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-m4v': '.m4v' };

/**
 * Picks one photo or video from the photo library and returns it as a File, ready for upload.
 * Returns null when the user closes the picker. HEIC photos come back as JPEG.
 */
export async function pickFromLibrary(accept: string): Promise<File | null> {
  const video = /video|mp4|mov/.test(accept);
  const image = /image|jpe?g|png|webp/.test(accept);
  let res;
  try {
    const opts = { limit: 1, skipTranscoding: !image };
    res = video && image ? await FilePicker.pickMedia(opts) : video ? await FilePicker.pickVideos(opts) : await FilePicker.pickImages(opts);
  } catch (e: any) {
    if (/cancel/i.test(String(e?.message ?? e))) return null;
    throw e;
  }
  const f = res.files[0];
  if (!f) return null;
  let path = f.path;
  let type = f.mimeType;
  if (/heic|heif/i.test(type) && path) {
    path = (await FilePicker.convertHeicToJpeg({ path })).path;
    type = 'image/jpeg';
  }
  const src = path ? Capacitor.convertFileSrc(path) : f.webPath;
  if (!src) throw new Error('file not readable');
  const blob = await fetch(src).then((r) => r.blob());
  const ext = EXT[type] ?? (f.name.match(/\.\w+$/)?.[0] || '');
  const name = /\.\w+$/.test(f.name) && !/heic|heif/i.test(f.name) ? f.name : `${f.name.replace(/\.\w+$/, '') || 'media'}${ext}`;
  return new File([blob], name, { type });
}

// ---------- camera roll and share sheet ----------

/** Downloads a finished reel into the app's cache (natively, so a large file never sits in memory). */
async function download(url: string, name: string) {
  const path = `reels/${name.replace(/[^\w.\-]+/g, '_')}`;
  await Filesystem.downloadFile({ url, path, directory: Directory.Cache, recursive: true });
  return (await Filesystem.getUri({ path, directory: Directory.Cache })).uri;
}

const ALBUM = 'Zero Edit';
async function androidAlbum() {
  const find = async () => (await Media.getAlbums()).albums.find((a) => a.name === ALBUM)?.identifier;
  return (await find()) ?? (await Media.createAlbum({ name: ALBUM }), await find());
}

/** Saves the reel to the camera roll (Photos on iPhone; a "Zero Edit" album on Android). */
export async function saveToCameraRoll(url: string, name: string) {
  const path = await download(url, name);
  await Media.saveVideo({ path, albumIdentifier: platform === 'android' ? await androidAlbum() : undefined });
}

/** Opens the share sheet with the video file, so Instagram, TikTok and the rest can take it. */
export async function shareVideo(url: string, name: string, title: string) {
  const path = await download(url, name);
  try {
    await Share.share({ title, files: [path] });
  } catch (e: any) {
    if (/cancel/i.test(String(e?.message ?? e))) return;
    throw e;
  }
}

// ---------- push notifications ----------

let pushToken = '';
let pushStarted = false;
/**
 * Asks once for notification permission (after the first reel is started, when the reason is obvious)
 * and registers this phone, so the server can say when generation or an export finishes.
 */
export async function enablePush(send: (token: string) => Promise<unknown>) {
  if (!isNative || pushStarted) return;
  pushStarted = true;
  try {
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== 'granted') return;
    FirebaseMessaging.addListener('tokenReceived', (e) => {
      pushToken = e.token;
      send(e.token).catch(() => null);
    });
    pushToken = (await FirebaseMessaging.getToken()).token;
    await send(pushToken);
  } catch (e) {
    console.warn('push', e);
  }
}
export const currentPushToken = () => pushToken;

/** A tapped notification opens its reel. Registered at start-up so a cold start from a notification works too. */
if (isNative) {
  FirebaseMessaging.addListener('notificationActionPerformed', (e) => {
    const id = (e.notification?.data as any)?.jobId;
    if (typeof id === 'string' && /^[\w-]+$/.test(id)) location.hash = `#/job/${id}`;
  }).catch(() => null);
}
/** Allowed on an earlier launch: the token can be refreshed at sign-in without asking again. */
export const pushAllowed = async () => isNative && (await FirebaseMessaging.checkPermissions().catch(() => null))?.receive === 'granted';

// ---------- in-app purchases (RevenueCat → App Store / Google Play) ----------

export type IapConfig = { ios: string; android: string; products: { topup: string; starter: string; standard: string; pro: string }; topupTokens?: number };
export type IapProduct = { id: string; price: string; product: PurchasesStoreProduct };

let iapUser = '';
async function iapReady(cfg: IapConfig, uid: string) {
  const apiKey = platform === 'android' ? cfg.android : cfg.ios;
  if (!apiKey) throw new Error('in-app purchases are not set up');
  if (!iapUser) await Purchases.configure({ apiKey, appUserID: uid });
  else if (iapUser !== uid) await Purchases.logIn({ appUserID: uid });
  iapUser = uid;
}

/** Store products with the store's own localized prices, keyed by our name (topup, starter, standard, pro). */
export async function iapProducts(cfg: IapConfig, uid: string) {
  await iapReady(cfg, uid);
  const ids = cfg.products;
  const [one, subs] = await Promise.all([
    Purchases.getProducts({ productIdentifiers: [ids.topup], type: PRODUCT_CATEGORY.NON_SUBSCRIPTION }),
    Purchases.getProducts({ productIdentifiers: [ids.starter, ids.standard, ids.pro], type: PRODUCT_CATEGORY.SUBSCRIPTION }),
  ]);
  const all = [...one.products, ...subs.products];
  const out: Partial<Record<keyof IapConfig['products'], IapProduct>> = {};
  for (const [k, id] of Object.entries(ids) as [keyof IapConfig['products'], string][]) {
    const product = all.find((p) => p.identifier === id || p.identifier.startsWith(`${id}:`));
    if (product) out[k] = { id, price: product.priceString, product };
  }
  return out;
}

/** Buys a product. Tokens arrive through the server's RevenueCat webhook. Returns false when cancelled. */
export async function iapBuy(p: IapProduct) {
  try {
    await Purchases.purchaseStoreProduct({ product: p.product });
    return true;
  } catch (e: any) {
    if (e?.userCancelled || e?.code === '1' || /cancel/i.test(String(e?.message))) return false;
    throw e;
  }
}

export const iapRestore = () => Purchases.restorePurchases();
export const iapLogOut = async () => {
  if (iapUser) await Purchases.logOut().catch(() => null);
  iapUser = '';
};
/** Apple's own page for changing or cancelling an App Store subscription. */
export const manageStoreSubscription = () =>
  Browser.open({ url: platform === 'android' ? 'https://play.google.com/store/account/subscriptions' : 'https://apps.apple.com/account/subscriptions' });
