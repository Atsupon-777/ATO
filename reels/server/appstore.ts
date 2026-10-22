// In-app purchases in the iPhone / Android app, through RevenueCat. The app logs in to RevenueCat with the
// Firebase uid, so a purchase lands on the same account (and the same token balance) as the website.
//   REVENUECAT_WEBHOOK_AUTH      the Authorization value set on the RevenueCat webhook (secret)
//   REVENUECAT_IOS_KEY           RevenueCat public SDK key for iOS (appl_...), handed to the app by /api/config
//   REVENUECAT_ANDROID_KEY       the same for Android (goog_...), for later
//   IAP_PRODUCT_TOPUP            consumable token pack (default reels_tokens_10)
//   IAP_TOPUP_TOKENS             tokens in that pack (default 10); the App Store can't sell any amount, so the app sells fixed packs
//   IAP_PRODUCT_SMALL            the smallest pack: enough for one reel and its export (default reels_tokens_3)
//   IAP_SMALL_TOKENS             tokens in it (default 3)
//   IAP_PRODUCT_STARTER / _STANDARD / _PRO   monthly auto-renewing subscriptions (default reels_<plan>_monthly)
import { timingSafeEqual } from 'node:crypto';
import { PLAN_TOKENS, getAccount, update, type PlanId } from './accounts.ts';
import { USD_JPY, recordSale } from './ledger.ts';

const pct = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1 ? x : undefined);

/** The ledger line of a RevenueCat purchase or refund: yen as charged (JPY), else RevenueCat's USD price at USD_JPY. */
function saleOf(ev: any, uid: string, store: 'app_store' | 'play_store', product: string, tokens: number, refund = false) {
  const local = Number(ev.price_in_purchased_currency);
  const usd = Number(ev.price);
  const gross = ev.currency === 'JPY' && Number.isFinite(local) ? local : Number.isFinite(usd) ? usd * USD_JPY : 0;
  if (!gross) return null;
  const amount = refund ? -Math.abs(gross) : Math.abs(gross);
  const tax = pct(ev.tax_percentage);
  const commission = pct(ev.commission_percentage);
  return {
    channel: store,
    uid,
    product,
    tokens: refund ? 0 : tokens,
    grossJpy: amount,
    // A refund takes back the proceeds only: the store returns its commission, so the fee goes negative too.
    feeJpy: commission !== undefined ? amount * commission : undefined,
    taxJpy: tax !== undefined ? amount * tax : undefined,
    refund: refund || undefined,
    test: ev.environment === 'SANDBOX' || undefined,
    at: ev.event_timestamp_ms ? new Date(Number(ev.event_timestamp_ms)).toISOString() : undefined,
    eventId: `rc:${ev.id}`,
  };
}

export const IAP_TOPUP_TOKENS = Number(process.env.IAP_TOPUP_TOKENS ?? 10);
export const IAP_SMALL_TOKENS = Number(process.env.IAP_SMALL_TOKENS ?? 3);
export const IAP_PRODUCTS = {
  topup: process.env.IAP_PRODUCT_TOPUP || 'reels_tokens_10',
  small: process.env.IAP_PRODUCT_SMALL || 'reels_tokens_3',
  starter: process.env.IAP_PRODUCT_STARTER || 'reels_starter_monthly',
  standard: process.env.IAP_PRODUCT_STANDARD || 'reels_standard_monthly',
  pro: process.env.IAP_PRODUCT_PRO || 'reels_pro_monthly',
};

/** What the app needs to sell in-app. Public values only; null until RevenueCat is set up. */
export const iapConfig = () =>
  process.env.REVENUECAT_IOS_KEY || process.env.REVENUECAT_ANDROID_KEY
    ? { ios: process.env.REVENUECAT_IOS_KEY || '', android: process.env.REVENUECAT_ANDROID_KEY || '', products: IAP_PRODUCTS, topupTokens: IAP_TOPUP_TOKENS, smallTokens: IAP_SMALL_TOKENS }
    : null;

const planOfProduct = (id?: string): PlanId | undefined =>
  (['starter', 'standard', 'pro'] as const).find((p) => IAP_PRODUCTS[p] === id || (id && id.startsWith(`${IAP_PRODUCTS[p]}:`)));

const authorized = (header: string | undefined) => {
  const want = process.env.REVENUECAT_WEBHOOK_AUTH || '';
  if (!want || !header) return false;
  const a = Buffer.from(header.replace(/^Bearer /, ''));
  const b = Buffer.from(want.replace(/^Bearer /, ''));
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Applies one RevenueCat webhook event. Each event is applied at most once. */
export async function revenuecatWebhook(body: any, auth: string | undefined) {
  if (!authorized(auth)) throw new Error('bad webhook authorization');
  const ev = body?.event ?? {};
  const uid: string | undefined = ev.app_user_id;
  // Anonymous RevenueCat ids ($RCAnonymousID:...) mean the app bought before logging in; nothing to credit.
  if (!uid || uid.startsWith('$RCAnonymousID') || !ev.id) return { ignored: ev.type };
  await getAccount(uid);
  const store = ev.store === 'PLAY_STORE' ? 'play_store' : 'app_store';
  let applied = false;
  let sale = null as ReturnType<typeof saleOf>;
  await update(uid, (a) => {
    if (a.events?.includes(`rc:${ev.id}`)) return;
    a.events = [...(a.events ?? []), `rc:${ev.id}`].slice(-200);
    applied = true;
    const plan = planOfProduct(ev.product_id);
    switch (ev.type) {
      case 'NON_RENEWING_PURCHASE':
        if (ev.product_id === IAP_PRODUCTS.topup) a.extra += IAP_TOPUP_TOKENS;
        if (ev.product_id === IAP_PRODUCTS.small) a.extra += IAP_SMALL_TOKENS;
        if (ev.product_id === IAP_PRODUCTS.topup) sale = saleOf(ev, uid, store, 'topup', IAP_TOPUP_TOKENS);
        if (ev.product_id === IAP_PRODUCTS.small) sale = saleOf(ev, uid, store, 'topup_small', IAP_SMALL_TOKENS);
        break;
      // Apple / Google refunded the customer (RevenueCat reports it as a cancellation by customer support).
      case 'CANCELLATION':
        if (ev.cancel_reason === 'CUSTOMER_SUPPORT')
          sale = saleOf(ev, uid, store, plan ?? (ev.product_id === IAP_PRODUCTS.small ? 'topup_small' : ev.product_id === IAP_PRODUCTS.topup ? 'topup' : String(ev.product_id ?? 'unknown')), 0, true);
        break;
      // First month and each renewal refill the monthly allowance, the same as a paid Stripe invoice.
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        if (!plan) break;
        a.plan = plan;
        if (ev.type !== 'UNCANCELLATION') a.tokens = PLAN_TOKENS[plan];
        // A free trial has no price, so it books nothing.
        if (ev.type !== 'UNCANCELLATION') sale = saleOf(ev, uid, store, plan, PLAN_TOKENS[plan]);
        a.store = store;
        a.storeProduct = ev.product_id;
        a.pastDue = undefined;
        break;
      case 'BILLING_ISSUE':
        if (a.store === store) a.pastDue = true;
        break;
      // Only the subscription that is current ends the plan (a switch to a web plan in between wins).
      case 'EXPIRATION':
        if (a.store === store && a.storeProduct === ev.product_id) {
          a.plan = 'free';
          a.tokens = 0;
          a.store = undefined;
          a.storeProduct = undefined;
          a.pastDue = undefined;
        }
        break;
    }
  });
  if (applied && sale) await recordSale(sale);
  return { type: ev.type, uid, applied, environment: ev.environment };
}
