// Stripe billing over its REST API: monthly plans, token top-ups, the customer portal and the webhook.
//   STRIPE_SECRET_KEY        sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SECRET    whsec_... (endpoint: /api/stripe/webhook)
//   STRIPE_PRICE_STARTER, STRIPE_PRICE_STANDARD, STRIPE_PRICE_PRO   monthly prices
//   STRIPE_PRICE_TOPUP       one-off price of PAYG_UNIT tokens; pay as you go buys any number of these
//   STRIPE_TAX=1             turn on Stripe Tax (prices are tax-inclusive either way)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PAYG_MAX, PAYG_MIN, PAYG_UNIT, PLAN_TOKENS, TOPUP_TOKENS, findByCustomer, update, type Account, type PlanId } from './accounts.ts';

// A restricted key (rk_...) with only Checkout, Customer portal, Customers and Subscriptions is enough.
const key = process.env.STRIPE_SECRET_KEY || '';
/** Pinned so a Dashboard upgrade never changes what the webhook receives. */
export const STRIPE_VERSION = '2026-08-26.dahlia';
/** Tags our Checkout sessions in the Dashboard. */
const CHECKOUT_LABEL = 'reels-studio-checkout-qkvhzmwt';
export const billingEnabled = Boolean(key);

const PRICES: Record<Exclude<PlanId, 'free'> | 'topup', string> = {
  starter: process.env.STRIPE_PRICE_STARTER || '',
  standard: process.env.STRIPE_PRICE_STANDARD || '',
  pro: process.env.STRIPE_PRICE_PRO || '',
  topup: process.env.STRIPE_PRICE_TOPUP || '',
};
const planOfPrice = (price?: string): PlanId | undefined =>
  (Object.entries(PRICES).find(([k, v]) => v && v === price && k !== 'topup')?.[0] as PlanId | undefined) ?? undefined;

/** Stripe wants form encoding with bracketed keys. */
const form = (o: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => {
    const name = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (typeof v === 'object') return form(v as Record<string, unknown>, name);
    return [`${encodeURIComponent(name)}=${encodeURIComponent(String(v))}`];
  });

async function stripe<T = any>(pathname: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': STRIPE_VERSION },
    body: form(body).join('&'),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? `Stripe ${r.status}`);
  return j;
}

export type Purchase = Exclude<PlanId, 'free'> | 'topup';
export const isPurchase = (x: unknown): x is Purchase => typeof x === 'string' && x in PRICES;

/** Pay-as-you-go units the customer asked for, kept within PAYG_MIN..PAYG_MAX. */
export const paygUnits = (tokens: unknown) => {
  const n = Math.round(Number(tokens) / PAYG_UNIT);
  if (!Number.isFinite(n) || n < PAYG_MIN || n > PAYG_MAX) throw new Error(`${(PAYG_MIN * PAYG_UNIT).toLocaleString('en-US')}〜${(PAYG_MAX * PAYG_UNIT).toLocaleString('en-US')}トークンの間で選んでください`);
  return n;
};

/** A Stripe Checkout page for a plan or a top-up of `tokens` tokens. Returns its URL. */
export async function checkout(a: Account, what: Purchase, origin: string, tokens?: unknown) {
  const price = PRICES[what];
  if (!price) throw new Error(`STRIPE_PRICE_${what.toUpperCase()} is not set`);
  const sub = what !== 'topup';
  const units = sub ? 1 : paygUnits(tokens);
  const s = await stripe('checkout/sessions', {
    mode: sub ? 'subscription' : 'payment',
    line_items: { 0: { price, quantity: units } },
    success_url: `${origin}/#/me?paid=${what}`,
    cancel_url: `${origin}/#/me`,
    client_reference_id: a.uid,
    customer: a.customerId,
    customer_email: a.customerId ? undefined : a.email,
    customer_creation: !sub && !a.customerId ? 'always' : undefined,
    metadata: { uid: a.uid, kind: what, tokens: sub ? undefined : units * PAYG_UNIT },
    subscription_data: sub ? { metadata: { uid: a.uid } } : undefined,
    allow_promotion_codes: 'true',
    locale: 'auto',
    integration_identifier: CHECKOUT_LABEL,
    // Only after Stripe Tax has an active Japan registration; until then it would silently collect nothing.
    automatic_tax: process.env.STRIPE_TAX === '1' ? { enabled: 'true' } : undefined,
  });
  return String(s.url);
}

/** Ends a web subscription at once (account deletion). Later invoices stop; nothing is refunded. */
export async function cancelSubscription(a: Account) {
  if (!key || !a.subscriptionId) return;
  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(a.subscriptionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_VERSION },
  });
  // Already cancelled is fine.
  if (!r.ok && r.status !== 404) throw new Error(`Stripe ${r.status}: ${(await r.json()).error?.message ?? ''}`);
}

/** Stripe's own page for changing plan, card and invoices, or cancelling. */
export async function portal(a: Account, origin: string) {
  if (!a.customerId) throw new Error('まだお支払いの記録がありません');
  const s = await stripe('billing_portal/sessions', { customer: a.customerId, return_url: `${origin}/#/me` });
  return String(s.url);
}

function verify(raw: Buffer, header: string | undefined) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret || !header) throw new Error('webhook not configured');
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) throw new Error('stale webhook');
  const want = createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest();
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => Buffer.from(kv.slice(3), 'hex'));
  if (!sigs.some((s) => s.length === want.length && timingSafeEqual(s, want))) throw new Error('bad webhook signature');
}

/** Applies one Stripe event to the matching account. Each event is applied at most once. */
export async function webhook(raw: Buffer, signature: string | undefined) {
  verify(raw, signature);
  const ev = JSON.parse(raw.toString('utf8'));
  const o = ev.data?.object ?? {};
  const uidOf = async () =>
    o.client_reference_id ||
    o.metadata?.uid ||
    o.parent?.subscription_details?.metadata?.uid ||
    o.subscription_details?.metadata?.uid ||
    (o.customer ? (await findByCustomer(o.customer))?.uid : undefined);
  const uid: string | undefined = await uidOf();
  if (!uid) return { ignored: ev.type };
  let applied = false;
  await update(uid, (a) => {
    if (a.events?.includes(ev.id)) return;
    a.events = [...(a.events ?? []), ev.id].slice(-200);
    applied = true;
    if (o.customer && typeof o.customer === 'string') a.customerId = o.customer;
    switch (ev.type) {
      case 'checkout.session.completed':
      // Konbini and bank transfer finish later: completed arrives unpaid, async_payment_succeeded once the money is in.
      case 'checkout.session.async_payment_succeeded':
        if (o.mode === 'subscription' && o.subscription) a.subscriptionId = String(o.subscription);
        // Pay as you go carries its token count; a session from before that was the fixed 30 (now 30,000) pack.
        if (o.mode === 'payment' && o.metadata?.kind === 'topup' && o.payment_status === 'paid') a.extra += Number(o.metadata.tokens) || TOPUP_TOKENS;
        break;
      case 'invoice.payment_failed':
        // Stripe retries the card; the account page asks the customer to update it meanwhile.
        if (o.subscription || o.parent?.subscription_details) a.pastDue = true;
        break;
      case 'invoice.paid': {
        a.pastDue = undefined;
        // A paid subscription invoice (first month, renewal or plan change) refills the monthly allowance.
        const prices: string[] = (o.lines?.data ?? []).map((l: any) => l.price?.id ?? l.pricing?.price_details?.price).filter(Boolean);
        const plan = prices.map(planOfPrice).find(Boolean);
        if (plan) {
          a.plan = plan;
          a.tokens = PLAN_TOKENS[plan];
          a.store = 'stripe';
          a.storeProduct = undefined;
        }
        break;
      }
      case 'customer.subscription.updated': {
        const plan = planOfPrice(o.items?.data?.[0]?.price?.id);
        a.subscriptionId = o.id;
        // A plan bought in the iPhone app is the App Store's to end, not Stripe's.
        if (a.store === 'app_store' || a.store === 'play_store') break;
        if (['canceled', 'unpaid', 'incomplete_expired'].includes(o.status)) (a.plan = 'free'), (a.tokens = 0);
        else if (plan) a.plan = plan;
        break;
      }
      case 'customer.subscription.deleted':
        a.subscriptionId = undefined;
        if (a.store === 'app_store' || a.store === 'play_store') break;
        a.plan = 'free';
        a.tokens = 0;
        a.store = undefined;
        break;
    }
  });
  return { type: ev.type, uid, applied };
}
