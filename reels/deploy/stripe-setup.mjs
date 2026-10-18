// Creates the Reels Studio products, prices and webhook in Stripe, and prints the values for deploy/env.yaml.
//   STRIPE_SECRET_KEY=sk_live_... node deploy/stripe-setup.mjs https://app.example.com
// Without the URL it creates only the products and prices; run with `--webhook-only <url>` once the app is live.
// Run once per Stripe account (test mode first with sk_test_...). Prices are in yen, tax included.
const key = process.env.STRIPE_SECRET_KEY;
const webhookOnly = process.argv[2] === '--webhook-only';
const site = webhookOnly ? process.argv[3] : process.argv[2];
if (!key || (webhookOnly && !site)) throw new Error('usage: STRIPE_SECRET_KEY=... node deploy/stripe-setup.mjs [--webhook-only] [https://your-app-url]');

const form = (o, prefix = '') =>
  Object.entries(o).flatMap(([k, v]) => {
    const name = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined) return [];
    if (typeof v === 'object') return form(v, name);
    return [`${encodeURIComponent(name)}=${encodeURIComponent(String(v))}`];
  });
const post = async (path, body) => {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2026-08-26.dahlia' },
    body: form(body).join('&'),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message);
  return j;
};

const TOPUP_YEN = Number(process.env.TOPUP_YEN ?? 4800);
const items = [
  { env: 'STRIPE_PRICE_STARTER', name: 'Reels Studio スターター', yen: 9800, monthly: true, desc: '毎月60トークン' },
  { env: 'STRIPE_PRICE_STANDARD', name: 'Reels Studio スタンダード', yen: 29800, monthly: true, desc: '毎月200トークン' },
  { env: 'STRIPE_PRICE_PRO', name: 'Reels Studio プロ', yen: 79800, monthly: true, desc: '毎月600トークン' },
  { env: 'STRIPE_PRICE_TOPUP', name: 'Reels Studio トークン追加（30）', yen: TOPUP_YEN, monthly: false, desc: '30トークン（期限なし）' },
];
const out = [];
for (const it of webhookOnly ? [] : items) {
  const product = await post('products', { name: it.name, description: it.desc });
  const price = await post('prices', {
    product: product.id,
    currency: 'jpy',
    unit_amount: it.yen,
    tax_behavior: 'inclusive',
    recurring: it.monthly ? { interval: 'month' } : undefined,
  });
  out.push(`${it.env}: "${price.id}"`);
}
console.log(out.join('\n'));
if (!site) process.exit(0);
const hook = await post('webhook_endpoints', {
  url: `${site.replace(/\/$/, '')}/api/stripe/webhook`,
  api_version: '2026-08-26.dahlia',
  enabled_events: Object.fromEntries(
    [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'invoice.paid',
      'invoice.payment_failed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ].entries(),
  ),
});
console.log(`\nSTRIPE_WEBHOOK_SECRET (put in Secret Manager): ${hook.secret}`);
