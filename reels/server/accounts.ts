// Accounts and token balances, kept in one JSON file (DATA_DIR/accounts.json).
// The server runs as a single instance, so one in-memory copy written after every change is enough.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authEnabled } from './auth.ts';
import { dataDir } from './paths.ts';

export type PlanId = 'free' | 'starter' | 'standard' | 'pro';

/** Monthly token allowance of each plan. Prices live in Stripe (STRIPE_PRICE_<PLAN>). */
export const PLAN_TOKENS: Record<PlanId, number> = { free: 0, starter: 60, standard: 200, pro: 600 };
/** Free tokens a new account can claim once, after confirming a phone number by SMS. */
export const FREE_TOKENS = Number(process.env.FREE_TOKENS ?? 10);
/** Tokens in one top-up purchase (STRIPE_PRICE_TOPUP). */
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
};

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
    a = { uid, email, createdAt: new Date().toISOString(), plan: 'free', tokens: 0, ...(authEnabled ? { extra: 0, freePending: true } : { extra: FREE_TOKENS }) };
    all.set(uid, a);
    await persist();
  } else if (email && a.email !== email) {
    a.email = email;
    await persist();
  }
  return a;
}

export const balance = (a: Account) => a.tokens + a.extra;

export class NotEnoughTokens extends Error {}

/** Takes `n` tokens, monthly allowance first. Throws NotEnoughTokens when the balance is short. */
export async function charge(uid: string, n: number) {
  const a = await getAccount(uid);
  if (balance(a) < n) throw new NotEnoughTokens(`トークンが足りません（必要: ${n} / 残り: ${balance(a)}）`);
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
  return a;
}

/** Gives back tokens for a job that failed. They return as `extra` so they never expire. */
export async function refund(uid: string, n: number) {
  const a = await getAccount(uid);
  a.extra += n;
  await persist();
}

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
  if (a.phoneHash) all.set(`deleted-${a.phoneHash.slice(0, 16)}`, { uid: `deleted-${a.phoneHash.slice(0, 16)}`, createdAt: new Date().toISOString(), plan: 'free', tokens: 0, extra: 0, phoneHash: a.phoneHash });
  await persist();
}
