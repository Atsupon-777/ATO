// In-app purchases in the iPhone / Android app, through RevenueCat. The app logs in to RevenueCat with the
// Firebase uid, so a purchase lands on the same account (and the same token balance) as the website.
//   REVENUECAT_WEBHOOK_AUTH      the Authorization value set on the RevenueCat webhook (secret)
//   REVENUECAT_IOS_KEY           RevenueCat public SDK key for iOS (appl_...), handed to the app by /api/config
//   REVENUECAT_ANDROID_KEY       the same for Android (goog_...), for later
//   IAP_PRODUCT_TOPUP            consumable token pack (default reels_tokens_10000)
//   IAP_TOPUP_TOKENS             tokens in that pack (default 10,000); the App Store can't sell any amount, so the app sells a fixed pack
//   IAP_PRODUCT_STARTER / _STANDARD / _PRO   monthly auto-renewing subscriptions (default reels_<plan>_monthly)
import { timingSafeEqual } from 'node:crypto';
import { PLAN_TOKENS, getAccount, update, type PlanId } from './accounts.ts';

export const IAP_TOPUP_TOKENS = Number(process.env.IAP_TOPUP_TOKENS ?? 10_000);
export const IAP_PRODUCTS = {
  topup: process.env.IAP_PRODUCT_TOPUP || 'reels_tokens_10000',
  starter: process.env.IAP_PRODUCT_STARTER || 'reels_starter_monthly',
  standard: process.env.IAP_PRODUCT_STANDARD || 'reels_standard_monthly',
  pro: process.env.IAP_PRODUCT_PRO || 'reels_pro_monthly',
};

/** What the app needs to sell in-app. Public values only; null until RevenueCat is set up. */
export const iapConfig = () =>
  process.env.REVENUECAT_IOS_KEY || process.env.REVENUECAT_ANDROID_KEY
    ? { ios: process.env.REVENUECAT_IOS_KEY || '', android: process.env.REVENUECAT_ANDROID_KEY || '', products: IAP_PRODUCTS, topupTokens: IAP_TOPUP_TOKENS }
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
  await update(uid, (a) => {
    if (a.events?.includes(`rc:${ev.id}`)) return;
    a.events = [...(a.events ?? []), `rc:${ev.id}`].slice(-200);
    applied = true;
    const plan = planOfProduct(ev.product_id);
    switch (ev.type) {
      case 'NON_RENEWING_PURCHASE':
        if (ev.product_id === IAP_PRODUCTS.topup) a.extra += IAP_TOPUP_TOKENS;
        break;
      // First month and each renewal refill the monthly allowance, the same as a paid Stripe invoice.
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        if (!plan) break;
        a.plan = plan;
        if (ev.type !== 'UNCANCELLATION') a.tokens = PLAN_TOKENS[plan];
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
  return { type: ev.type, uid, applied, environment: ev.environment };
}
