// The owner's business numbers (/api/admin/metrics, the #/admin page): revenue, fees, AI cost, server cost,
// profit, MRR, users and reels, for one month and the 6 months up to it. Months follow Japan time.
//   ADMIN_EMAILS             who may see it, comma separated (default atsu12shi16@icloud.com)
//   ADMIN_UIDS               or by Firebase uid, comma separated
//   SERVER_COST_JPY_MONTH    fixed server cost per month, an estimate (default 35000)
//   SERVER_COST_SINCE        first month (YYYY-MM) the server cost counts from (default: the first account, job or ledger line)
// Only owners ever get this: the "never show cost to customers" rule is why it lives behind isAdmin.
import { PLAN_PRICE_JPY, allAccounts, type PlanId } from './accounts.ts';
import { authEnabled, type User } from './auth.ts';
import { USD_JPY, readLedger, type AiEntry, type SaleEntry, type TokenEntry } from './ledger.ts';

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAILS = list(process.env.ADMIN_EMAILS ?? 'atsu12shi16@icloud.com');
const ADMIN_UIDS = (process.env.ADMIN_UIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export const SERVER_COST_JPY_MONTH = Number(process.env.SERVER_COST_JPY_MONTH ?? 35000);

/** The owner: by email or uid. With login off (local development) the single local user is the owner. */
export const isAdmin = (u: User, accountEmail?: string) => {
  if (!authEnabled) return true;
  if (ADMIN_UIDS.includes(u.uid)) return true;
  const email = (u.email ?? accountEmail ?? '').toLowerCase();
  return Boolean(email) && ADMIN_EMAILS.includes(email);
};

/** The fields of a job the dashboard reads. */
export type JobLike = { id: string; template: string; createdAt: string; status: string; owner?: string; tokens?: number; video?: string; renderStartedAt?: string; props?: unknown; usage?: { totalUsd: number } };

const JST = 9 * 3600_000;
/** YYYY-MM of a timestamp, in Japan time. */
const monthOf = (iso: string | undefined) => (iso ? new Date(new Date(iso).getTime() + JST).toISOString().slice(0, 7) : '');
const thisMonth = () => monthOf(new Date().toISOString());
const shift = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
/** Share of the month that has passed: 1 for past months, 0 for future ones. */
const elapsed = (m: string) => {
  const cur = thisMonth();
  if (m < cur) return 1;
  if (m > cur) return 0;
  const [y, mo] = m.split('-').map(Number);
  const start = Date.UTC(y, mo - 1, 1) - JST;
  const end = Date.UTC(y, mo, 1) - JST;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
};

const r0 = (n: number) => Math.round(n);
type Money = { gross: number; fee: number; tax: number; net: number; count: number; tokens: number };
const money = (): Money => ({ gross: 0, fee: 0, tax: 0, net: 0, count: 0, tokens: 0 });
const addSale = (m: Money, s: SaleEntry) => {
  m.gross += s.grossJpy;
  m.fee += s.feeJpy;
  m.tax += s.taxJpy ?? 0;
  m.net += s.netJpy;
  m.count += 1;
  m.tokens += s.tokens;
};

export async function metrics(jobs: JobLike[], month = thisMonth()) {
  const ledger = await readLedger();
  const accounts = (await allAccounts()).filter((a) => !a.uid.startsWith('deleted-'));
  const sales = ledger.filter((e): e is SaleEntry => e.kind === 'sale');
  const ai = ledger.filter((e): e is AiEntry => e.kind === 'ai');
  const toks = ledger.filter((e): e is TokenEntry => e.kind === 'tokens');

  // Jobs from before the ledger existed still count, from their own job.json.
  // No server bill before the service existed.
  const since =
    (/^\d{4}-\d{2}$/.test(process.env.SERVER_COST_SINCE ?? '') ? process.env.SERVER_COST_SINCE! : '') ||
    [...accounts.map((a) => a.createdAt), ...jobs.map((j) => j.createdAt), ...ledger.map((e) => e.at)].map(monthOf).filter(Boolean).sort()[0] ||
    thisMonth();
  const serverShare = (m: string) => (m < since ? 0 : elapsed(m));

  const genLogged = new Set(ai.filter((e) => e.step === 'gen').map((e) => e.jobId));
  const tokLogged = new Set(toks.filter((e) => e.op === 'reel').map((e) => e.jobId));
  const exportLogged = new Set(toks.filter((e) => e.op === 'export').map((e) => e.jobId));

  /** AI cost (yen) per template in a month: ledger lines plus unlogged generations. */
  const aiByTemplate = (m: string) => {
    const out: Record<string, number> = {};
    for (const e of ai) if (monthOf(e.at) === m) out[e.template] = (out[e.template] ?? 0) + e.jpy;
    for (const j of jobs)
      if (monthOf(j.createdAt) === m && !genLogged.has(j.id) && j.usage?.totalUsd) out[j.template] = (out[j.template] ?? 0) + j.usage.totalUsd * USD_JPY;
    return out;
  };

  const monthSummary = (m: string) => {
    const all = sales.filter((s) => monthOf(s.at) === m);
    const real = all.filter((s) => !s.test);
    const total = money();
    for (const s of real) addSale(total, s);
    const refunds = real.filter((s) => s.refund);
    const aiJpy = Object.values(aiByTemplate(m)).reduce((a, b) => a + b, 0);
    const serverJpy = SERVER_COST_JPY_MONTH * serverShare(m);
    const grossProfit = total.net - aiJpy;
    const profit = grossProfit - serverJpy;
    return {
      month: m,
      gross: r0(total.gross),
      fees: r0(total.fee),
      tax: r0(total.tax),
      net: r0(total.net),
      aiCost: r0(aiJpy),
      serverCost: r0(serverJpy),
      grossProfit: r0(grossProfit),
      profit: r0(profit),
      margin: total.gross > 0 ? Number(((profit / total.gross) * 100).toFixed(1)) : null,
      salesCount: real.filter((s) => !s.refund).length,
      refunds: refunds.length,
      refundJpy: r0(-refunds.reduce((a, s) => a + s.grossJpy, 0)),
      testSales: all.length - real.length,
      reels: jobs.filter((j) => monthOf(j.createdAt) === m).length,
      _real: real,
    };
  };

  const cur = monthSummary(month);
  const byChannel: Record<string, Money> = {};
  const byProduct: Record<string, Money> = {};
  for (const s of cur._real) {
    addSale((byChannel[s.channel] ??= money()), s);
    addSale((byProduct[s.product] ??= money()), s);
  }
  const rounded = (o: Record<string, Money>) =>
    Object.entries(o)
      .map(([k, v]) => ({ key: k, gross: r0(v.gross), fee: r0(v.fee), tax: r0(v.tax), net: r0(v.net), count: v.count, tokens: v.tokens }))
      .sort((a, b) => b.gross - a.gross);

  // Reels by template: made, failed, exported, and AI cost per reel that came out.
  const monthJobs = jobs.filter((j) => monthOf(j.createdAt) === month);
  const aiT = aiByTemplate(month);
  const templates = [...new Set([...monthJobs.map((j) => j.template), ...Object.keys(aiT)])];
  const exportsOf = (t?: string) =>
    toks.filter((e) => e.op === 'export' && monthOf(e.at) === month && (!t || e.template === t)).length +
    jobs.filter((j) => j.video && !exportLogged.has(j.id) && monthOf(j.renderStartedAt ?? j.createdAt) === month && (!t || j.template === t)).length;
  const reelsByTemplate = templates
    .map((t) => {
      const js = monthJobs.filter((j) => j.template === t);
      const ok = js.filter((j) => j.status !== 'error').length;
      const cost = aiT[t] ?? 0;
      return { template: t, reels: js.length, failed: js.length - ok, exports: exportsOf(t), aiCost: r0(cost), avgAiCost: ok ? r0(cost / ok) : null };
    })
    .sort((a, b) => b.reels - a.reels);

  // Tokens: sold this month vs used (reels, exports, music; refunds given back), plus free ones handed out.
  const monthToks = toks.filter((e) => monthOf(e.at) === month);
  const sumOp = (...ops: TokenEntry['op'][]) => monthToks.filter((e) => ops.includes(e.op)).reduce((a, e) => a + e.tokens, 0);
  const unloggedUse = monthJobs.filter((j) => !tokLogged.has(j.id)).reduce((a, j) => a + (j.tokens ?? 0), 0);
  const tokens = {
    sold: cur._real.filter((s) => !s.refund).reduce((a, s) => a + s.tokens, 0),
    consumed: sumOp('reel', 'export', 'music') - sumOp('refund') + unloggedUse,
    refunded: sumOp('refund'),
    free: sumOp('free'),
    granted: sumOp('grant'),
    outstanding: accounts.reduce((a, x) => a + (x.tokens ?? 0) + (x.extra ?? 0), 0),
  };

  // Subscriptions right now. A store plan is valued at what the store last charged for it, else the web price.
  // A plan whose latest store purchase was a sandbox one (TestFlight, review) is not a customer.
  const lastStoreSale = new Map<string, SaleEntry>();
  for (const s of sales) if (!s.refund && s.channel !== 'stripe' && s.grossJpy > 0) lastStoreSale.set(`${s.uid}:${s.product}`, s);
  const sandbox = (a: { uid: string; plan: string; store?: string }) => a.store !== 'stripe' && a.store !== undefined && lastStoreSale.get(`${a.uid}:${a.plan}`)?.test === true;
  const lastStorePrice = new Map([...lastStoreSale].filter(([, s]) => !s.test).map(([k, s]) => [k, s.grossJpy]));
  const paying = accounts.filter((a) => a.plan !== 'free' && !sandbox(a));
  const payingByPlan: Record<string, { users: number; mrr: number; stripe: number; app_store: number; play_store: number; pastDue: number }> = {};
  let mrr = 0;
  for (const a of paying) {
    const price = (a.store === 'app_store' || a.store === 'play_store' ? lastStorePrice.get(`${a.uid}:${a.plan}`) : undefined) ?? PLAN_PRICE_JPY[a.plan as PlanId] ?? 0;
    const row = (payingByPlan[a.plan] ??= { users: 0, mrr: 0, stripe: 0, app_store: 0, play_store: 0, pastDue: 0 });
    row.users += 1;
    row.mrr += price;
    row[a.store ?? 'stripe'] += 1;
    if (a.pastDue) row.pastDue += 1;
    mrr += price;
  }

  const trend = Array.from({ length: 6 }, (_, i) => shift(month, i - 5)).map((m) => {
    const { _real, ...s } = monthSummary(m);
    return s;
  });
  const { _real, ...summary } = cur;

  return {
    month,
    currentMonth: thisMonth(),
    generatedAt: new Date().toISOString(),
    assumptions: { usdJpy: USD_JPY, serverCostMonth: SERVER_COST_JPY_MONTH, serverCostShare: Number(serverShare(month).toFixed(3)), serverCostSince: since, feesEstimated: _real.some((s) => s.feeEstimated) },
    summary: { ...summary, mrr: r0(mrr), payingUsers: paying.length, pastDue: paying.filter((a) => a.pastDue).length },
    byChannel: rounded(byChannel),
    byProduct: rounded(byProduct),
    payingByPlan: Object.entries(payingByPlan).map(([plan, v]) => ({ plan, ...v, mrr: r0(v.mrr) })),
    users: {
      total: accounts.length,
      newInMonth: accounts.filter((a) => monthOf(a.createdAt) === month).length,
      freeClaims: monthToks.filter((e) => e.op === 'free').length,
      freeClaimsTotal: accounts.filter((a) => a.phoneHash).length,
      paying: paying.length,
    },
    reels: {
      made: monthJobs.length,
      failed: monthJobs.filter((j) => j.status === 'error').length,
      exports: exportsOf(),
      byTemplate: reelsByTemplate,
    },
    tokens,
    trend,
  };
}
