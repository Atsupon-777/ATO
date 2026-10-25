// Accounts and token balances, kept in one JSON file (DATA_DIR/accounts.json).
// The server runs as a single instance, so one in-memory copy written after every change is enough.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authEnabled } from './auth.ts';
import { recordTokens } from './ledger.ts';
import { dataDir } from './paths.ts';

export type PlanId = 'free' | 'starter' | 'standard' | 'pro';

/**
 * Unit of `tokens` and `extra`. A reel takes 2 / 5 / 12 tokens. From 2026-10-18 to 2026-10-21 counts were kept
 * 1000 times larger (tokenScale 1000); accounts saved in another scale are converted once when the file is loaded.
 */
export const TOKEN_SCALE = 1;
/** Monthly token allowance of each plan. Prices live in Stripe (STRIPE_PRICE_<PLAN>). */
export const PLAN_TOKENS: Record<PlanId, number> = { free: 0, starter: 60, standard: 200, pro: 600 };
/** Monthly price of each plan on the website, tax included (the same figures as the account page). For the owner's MRR. */
export const PLAN_PRICE_JPY: Record<PlanId, number> = {
  free: 0,
  starter: Number(process.env.PLAN_PRICE_STARTER_JPY ?? 9800),
  standard: Number(process.env.PLAN_PRICE_STANDARD_JPY ?? 29800),
  pro: Number(process.env.PLAN_PRICE_PRO_JPY ?? 79800),
};
/** Free tokens a new account can claim once, after confirming a phone number by SMS. */
export const FREE_TOKENS = Number(process.env.FREE_TOKENS ?? 10);
/**
 * Pay as you go: tokens are bought in units of PAYG_UNIT, any number of units between PAYG_MIN and PAYG_MAX.
 * PAYG_UNIT_YEN is the price of one unit (tax included), charged inline at Checkout; no Stripe price to keep in step.
 * A unit costs a little more than the same tokens on any plan, so a plan stays the better deal.
 */
export const PAYG_UNIT = Number(process.env.PAYG_UNIT ?? 1);
export const PAYG_UNIT_YEN = Number(process.env.PAYG_UNIT_YEN ?? 200);
export const PAYG_MIN = Number(process.env.PAYG_MIN ?? 2);
export const PAYG_MAX = Number(process.env.PAYG_MAX ?? 500);
/** Tokens from a top-up that carries no token count (a Checkout started before pay as you go, or an in-app pack). */
export const TOPUP_TOKENS = Number(process.env.TOPUP_TOKENS ?? 30);

export type Account = {
  uid: string;
  email?: string;
  createdAt: string;
  plan: PlanId;
  /** Left from this month's plan allowance; reset when the subscription renews. */
  tokens: number;
  /** Bought with top-ups or given at sign-up; never expires. Used after `tokens`. */
  extra: number;
  customerId?: string;
  subscriptionId?: string;
  /** Where the current plan is billed: Stripe on the web, or the App Store / Google Play through RevenueCat. */
  store?: 'stripe' | 'app_store' | 'play_store';
  /** The App Store / Google Play product of the current in-app subscription. */
  storeProduct?: string;
  /** The plan `tokens` was last filled from; a refill from another plan carries what is left into `extra`. */
  tokensPlan?: PlanId;
  /** A switch to a smaller in-app plan the store applies at the next renewal, and when that is. */
  pendingPlan?: PlanId;
  pendingPlanAt?: string;
  /** The last renewal payment failed and Stripe is retrying it. */
  pastDue?: boolean;
  /** Shown on the account page instead of the email; set by the user. */
  displayName?: string;
  /** Profile photo, a path under /uploads/<the user's folder>/. */
  avatar?: string;
  /** The free tokens are still waiting to be claimed with a phone number. */
  freePending?: boolean;
  /** Hash of the phone number that claimed the free tokens, so one number claims once. */
  phoneHash?: string;
  /** Stripe and RevenueCat events already applied, so a retried webhook is not counted twice. */
  events?: string[];
  /** Phones of the iPhone / Android app that get a push when a reel is ready (FCM tokens). */
  devices?: { token: string; platform: 'ios' | 'android'; lang: string; at: string }[];
  /** TOKEN_SCALE once `tokens` and `extra` are in the current units. */
  tokenScale?: number;
  /** Brand kit: filled into new reels' forms; `color` is the accent of templates that take one, `logo` one of the user's uploads. */
  brand?: Brand;
  /** The job that used the account's free first product ad film (unset while it is still unused). */
  freeFirstJob?: string;
};

export type Brand = { name?: string; handle?: string; color?: string; logo?: string };

const file = path.join(dataDir, 'accounts.json');
let accounts: Map<string, Account> | null = null;
let writing = Promise.resolve();

async function load() {
  if (accounts) return accounts;
  try {
    accounts = new Map(Object.entries(JSON.parse(await readFile(file, 'utf8'))));
  } catch {
    accounts = new Map();
  }
  let converted = false;
  for (const a of accounts.values()) {
    if (a.tokenScale === TOKEN_SCALE) continue;
    const k = TOKEN_SCALE / (a.tokenScale ?? 1);
    a.tokens = Math.round((a.tokens ?? 0) * k);
    a.extra = Math.round((a.extra ?? 0) * k);
    a.tokenScale = TOKEN_SCALE;
    converted = true;
  }
  if (converted) await persist();
  return accounts;
}

function persist() {
  const snapshot = JSON.stringify(Object.fromEntries(accounts!), null, 1);
  writing = writing.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(`${file}.tmp`, snapshot);
    await rename(`${file}.tmp`, file);
  });
  return writing;
}

export async function getAccount(uid: string, email?: string): Promise<Account> {
  const all = await load();
  let a = all.get(uid);
  if (!a) {
    a = { uid, email, createdAt: new Date().toISOString(), plan: 'free', tokens: 0, tokenScale: TOKEN_SCALE, ...(authEnabled ? { extra: 0, freePending: true } : { extra: FREE_TOKENS }) };
    all.set(uid, a);
    await persist();
  } else if (email && a.email !== email) {
    a.email = email;
    await persist();
  }
  return a;
}

export const balance = (a: Account) => a.tokens + a.extra;

/**
 * Fills the monthly allowance of `plan` (first month, renewal or plan change). On a switch from another plan
 * what is left of the old allowance was paid for, so it moves to `extra` and is kept, and the new one comes on top.
 */
export function refillPlan(a: Account, plan: PlanId) {
  const from = a.tokensPlan ?? a.plan;
  if (from !== plan && from !== 'free') a.extra += a.tokens;
  a.plan = plan;
  a.tokens = PLAN_TOKENS[plan];
  a.tokensPlan = plan;
  a.pendingPlan = undefined;
  a.pendingPlanAt = undefined;
}

export class NotEnoughTokens extends Error {}

/** Takes `n` tokens, monthly allowance first. Throws NotEnoughTokens when the balance is short. */
export async function charge(uid: string, n: number) {
  const a = await getAccount(uid);
  if (balance(a) < n) throw new NotEnoughTokens(`トークンが足りません（必要: ${n.toLocaleString('en-US')} / 残り: ${balance(a).toLocaleString('en-US')}）`);
  const fromPlan = Math.min(a.tokens, n);
  a.tokens -= fromPlan;
  a.extra -= n - fromPlan;
  await persist();
  return a;
}

export class FreeClaimError extends Error {}

/** Gives the free tokens to an account whose phone number was just confirmed by SMS. */
export async function claimFree(uid: string, phone: string) {
  const all = await load();
  const a = await getAccount(uid);
  if (!a.freePending) throw new FreeClaimError('無料トークンはすでに受け取り済みです');
  const hash = createHash('sha256').update(`reels-phone:${phone}`).digest('hex');
  if ([...all.values()].some((o) => o.phoneHash === hash)) throw new FreeClaimError('この電話番号はすでに無料トークンを受け取っています');
  a.phoneHash = hash;
  a.freePending = false;
  a.extra += FREE_TOKENS;
  await persist();
  recordTokens({ uid, op: 'free', tokens: FREE_TOKENS });
  return a;
}

/** Gives back tokens for a job that failed. They return as `extra` so they never expire. */
export async function refund(uid: string, n: number) {
  const a = await getAccount(uid);
  a.extra += n;
  await persist();
}

/**
 * Each account's first product ad film is free, once. Only accounts that confirmed a phone number by SMS (the
 * same gate as the free tokens, so it can't be farmed with new accounts); with login off (local) always.
 */
export const freeFirstState = (a: Account): 'available' | 'needs_phone' | 'used' =>
  a.freeFirstJob ? 'used' : !authEnabled || a.phoneHash ? 'available' : 'needs_phone';

/** Takes the free first product film for `jobId` if it is still there. True when this job is the free one. */
export async function takeFreeFirst(uid: string, jobId: string) {
  let took = false;
  await update(uid, (a) => {
    if (freeFirstState(a) === 'available') (a.freeFirstJob = jobId), (took = true);
  });
  return took;
}

/** The free first film's job failed: the right comes back (no tokens are given). */
export async function giveBackFreeFirst(uid: string, jobId: string) {
  await update(uid, (a) => {
    if (a.freeFirstJob === jobId) a.freeFirstJob = undefined;
  });
}

/** Every account, for the owner's dashboard. */
export const allAccounts = async () => [...(await load()).values()];

export async function update(uid: string, fn: (a: Account) => void) {
  const a = await getAccount(uid);
  fn(a);
  await persist();
  return a;
}

export async function findByCustomer(customerId: string) {
  return [...(await load()).values()].find((a) => a.customerId === customerId);
}

/**
 * Deletes an account for good (the in-app "delete account"). Only the hash of the phone number that
 * claimed free tokens is kept, so a deleted account cannot be re-created to claim them again.
 */
export async function removeAccount(uid: string) {
  const all = await load();
  const a = all.get(uid);
  if (!a) return;
  all.delete(uid);
  if (a.phoneHash) all.set(`deleted-${a.phoneHash.slice(0, 16)}`, { uid: `deleted-${a.phoneHash.slice(0, 16)}`, createdAt: new Date().toISOString(), plan: 'free', tokens: 0, extra: 0, tokenScale: TOKEN_SCALE, phoneHash: a.phoneHash });
  await persist();
}
