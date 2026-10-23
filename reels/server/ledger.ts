// The business ledger: one JSON line per sale, refund, AI cost and token movement (DATA_DIR/ledger.jsonl).
// Append-only, so the owner dashboard (/api/admin/metrics) can add up any month, and a lost job.json or a
// deleted account never takes its money with it. Writes never throw into the caller: a ledger failure is logged.
//   USD_JPY                  yen per US dollar for AI costs and store prices in USD (default 150)
//   STRIPE_FEE_RATE          Stripe's fee when the actual one isn't known (default 0.036)
//   IAP_COMMISSION_RATE      App Store / Google Play commission when RevenueCat doesn't say (default 0.30; 0.15 once enrolled in Apple Small Business Program)
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './paths.ts';

export const USD_JPY = Number(process.env.USD_JPY ?? 150);
export const STRIPE_FEE_RATE = Number(process.env.STRIPE_FEE_RATE ?? 0.036);
export const IAP_COMMISSION_RATE = Number(process.env.IAP_COMMISSION_RATE ?? 0.3);

export type Channel = 'stripe' | 'app_store' | 'play_store';

/** Money in. A refund is a sale with negative amounts (`refund: true`). Test-mode / sandbox purchases carry `test: true`. */
export type SaleEntry = {
  at: string;
  kind: 'sale';
  channel: Channel;
  uid: string;
  /** A plan id, 'payg' (web pay as you go) or 'topup' / 'topup_small' (in-app token packs). */
  product: string;
  tokens: number;
  grossJpy: number;
  feeJpy: number;
  /** Tax inside grossJpy, when the processor reports it. */
  taxJpy?: number;
  netJpy: number;
  /** True when feeJpy is an estimate (STRIPE_FEE_RATE / IAP_COMMISSION_RATE) rather than reported. */
  feeEstimated?: boolean;
  refund?: boolean;
  test?: boolean;
  /** The Stripe charge a refund belongs to. */
  ref?: string;
  eventId: string;
};

/** AI spend of one generation step: a reel's generation (step 'gen'), a 5-pass edit pass, or a 「別の曲」. */
export type AiEntry = { at: string; kind: 'ai'; jobId: string; uid: string; template: string; step: string; usd: number; jpy: number };

/** Tokens leaving or returning to a balance. `op` says why. */
export type TokenEntry = {
  at: string;
  kind: 'tokens';
  uid: string;
  jobId?: string;
  template?: string;
  /** free_first: an account's first product ad film, made for 0 tokens; free_first_back: it failed, so the free right came back. */
  op: 'reel' | 'export' | 'music' | 'refund' | 'free' | 'grant' | 'free_first' | 'free_first_back';
  tokens: number;
  /** An export (or its refund) that included 高画質・高音質 (HQ_TOKENS of `tokens`). */
  hq?: boolean;
};

export type LedgerEntry = SaleEntry | AiEntry | TokenEntry;

const file = () => path.join(dataDir, 'ledger.jsonl');
let writing = Promise.resolve();

/** Whole yen, rounded the same way for a sale and its refund. */
const yen = (n: number) => Math.sign(n) * Math.round(Math.abs(n)) || 0;

function append(e: LedgerEntry) {
  const line = `${JSON.stringify(e)}\n`;
  writing = writing.then(async () => {
    try {
      await mkdir(dataDir, { recursive: true });
      await appendFile(file(), line);
    } catch (err) {
      console.error('ledger', err);
    }
  });
  return writing;
}

/** Every entry so far, oldest first. A torn last line (crash mid-write) is skipped. */
export async function readLedger(): Promise<LedgerEntry[]> {
  await writing;
  let text = '';
  try {
    text = await readFile(file(), 'utf8');
  } catch {
    return [];
  }
  const out: LedgerEntry[] = [];
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {}
  }
  return out;
}

const now = () => new Date().toISOString();

/** A sale (or, with negative grossJpy, a refund). Fee defaults to an estimate; net = gross - fee - tax. */
export function recordSale(s: Omit<SaleEntry, 'at' | 'kind' | 'netJpy' | 'feeJpy'> & { at?: string; feeJpy?: number }) {
  const grossJpy = yen(s.grossJpy);
  const rate = s.channel === 'stripe' ? STRIPE_FEE_RATE : IAP_COMMISSION_RATE;
  const estimated = s.feeJpy === undefined;
  const feeJpy = yen(s.feeJpy ?? grossJpy * rate);
  const taxJpy = s.taxJpy === undefined ? undefined : yen(s.taxJpy);
  const e: SaleEntry = {
    ...s,
    at: s.at ?? now(),
    kind: 'sale',
    grossJpy,
    feeJpy,
    taxJpy,
    netJpy: grossJpy - feeJpy - (taxJpy ?? 0),
    feeEstimated: estimated || s.feeEstimated || undefined,
  };
  return append(e);
}

export function recordAi(a: { jobId: string; uid: string; template: string; step: string; usd: number }) {
  if (!(a.usd > 0)) return Promise.resolve();
  return append({ at: now(), kind: 'ai', ...a, usd: Number(a.usd.toFixed(5)), jpy: Number((a.usd * USD_JPY).toFixed(2)) });
}

export function recordTokens(t: Omit<TokenEntry, 'at' | 'kind'>) {
  if (!t.tokens && t.op !== 'free_first' && t.op !== 'free_first_back') return Promise.resolve();
  return append({ at: now(), kind: 'tokens', ...t });
}
