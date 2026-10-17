// Reels Studio web app: serves the editor and runs generation/render jobs.
//   node app/server.ts            (PORT=3000 by default)
// Jobs live in public/jobs/<id>/ (job.json + media), so a restart keeps history.
// Login (FIREBASE_PROJECT_ID) and billing (STRIPE_SECRET_KEY) switch on from the environment; see deploy/README.md.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { effectIds, effectsReelSchema, productShineSchema, saasPromoSchema, talkCaptionsSchema, fivePassSchema, type EffectsReelProps } from '../src/schemas.ts';
import { pass1, restoreVersion, runPass } from '../server/fivepass.ts';
import { loudnorm } from '../server/loudnorm.ts';
import { buildEffectsProps } from '../server/effects.ts';
import { buildProductReel, STYLES, type Style } from '../server/product.ts';
import { renderTemplate } from '../server/render.ts';
import { buildSaasProps } from '../server/saas.ts';
import { buildTalkProps } from '../server/talk.ts';
import { isLang, type Lang } from '../src/lang.ts';
import { authEnabled, LOCAL_USER, verifyIdToken, webConfig, type User } from '../server/auth.ts';
import { NotEnoughTokens, balance, charge, getAccount, refund, TOPUP_TOKENS, PLAN_TOKENS, FREE_TOKENS } from '../server/accounts.ts';
import { billingEnabled, checkout, isPurchase, portal, webhook } from '../server/billing.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const jobsDir = path.join(publicDir, 'jobs');
const uploadsDir = path.join(publicDir, 'uploads');
const PORT = Number(process.env.PORT ?? 3000);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const schemas = {
  ProductShine: productShineSchema,
  SaaSPromo: saasPromoSchema,
  TalkCaptions: talkCaptionsSchema,
  EffectsReel: effectsReelSchema,
  FivePass: fivePassSchema,
};
type Template = keyof typeof schemas;

type Job = {
  id: string;
  template: Template;
  title: string;
  createdAt: string;
  status: 'generating' | 'ready' | 'rendering' | 'done' | 'error';
  step?: { n: number; total: number; label: string };
  renderProgress?: number;
  props?: Record<string, unknown>;
  usage?: { totalUsd: number; lines: unknown[] };
  video?: string;
  error?: string;
  /** 5-pass edit: latest version number of each pass (for rolling back). */
  versions?: Record<number, number>;
  /** Who made it (Firebase uid; "local" when login is off). */
  owner?: string;
  /** Tokens this job took. */
  tokens?: number;
};

/** Tokens each kind of reel takes: own footage only 2, AI photo or effects 5, with AI video 12. */
const tokensFor = (t: Template, input: Record<string, any>) => (t === 'ProductShine' ? (input.video ? 12 : 5) : t === 'EffectsReel' || t === 'FivePass' || t === 'SaaSPromo' ? 5 : 2);

const jobs = new Map<string, Job>();

const save = (job: Job) => writeFile(path.join(jobsDir, job.id, 'job.json'), JSON.stringify(job, null, 2));

async function loadJobs() {
  await mkdir(jobsDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  for (const id of await readdir(jobsDir)) {
    try {
      const job: Job = JSON.parse(await readFile(path.join(jobsDir, id, 'job.json'), 'utf8'));
      // A job interrupted by a restart cannot resume its in-flight call.
      if (job.status === 'generating' || job.status === 'rendering') {
        job.status = job.props ? 'ready' : 'error';
        job.error ??= job.props ? undefined : 'サーバー再起動で中断されました';
      }
      jobs.set(id, job);
    } catch {}
  }
}

/** Each user's uploads sit in their own folder, named by a hash of their id. */
const userDir = (u: User) => createHash('sha256').update(u.uid).digest('hex').slice(0, 16);

/** Uploaded files are referenced by name; resolve them inside the user's own uploads folder only. */
const uploadOf = (user: User) => (name: unknown) => {
  if (typeof name !== 'string' || !name) return undefined;
  return path.join(uploadsDir, userDir(user), path.basename(name));
};

async function startJob(template: Template, input: Record<string, any>, user: User) {
  const cost = tokensFor(template, input);
  await charge(user.uid, cost);
  const upload = uploadOf(user);
  const id = `job-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await mkdir(path.join(jobsDir, id), { recursive: true });
  const job: Job = {
    id,
    template,
    title: String(input.name || input.title || template),
    createdAt: new Date().toISOString(),
    status: 'generating',
    owner: user.uid,
    tokens: cost,
  };
  jobs.set(id, job);
  await save(job);
  const onStep = (n: number, total: number, label: string) => {
    job.step = { n, total, label };
    save(job);
  };
  const lang: Lang = isLang(input.lang) ? input.lang : 'ja';
  (async () => {
    try {
      if (template === 'ProductShine') {
        const photo = upload(input.photo);
        if (!photo) throw new Error('写真をアップロードしてください');
        const style = (input.style in STYLES ? input.style : 'luxury') as Style;
        const res = await buildProductReel({
          photo,
          brand: String(input.brand || '').slice(0, 16),
          productName: String(input.name || '').slice(0, 24),
          facts: String(input.facts || ''),
          style,
          cta: String(input.cta || '詳しくはプロフィールへ').slice(0, 16),
          handle: String(input.handle || '').slice(0, 30),
          video: Boolean(input.video),
          onSkin: Boolean(input.onSkin),
          lang,
          jobId: id,
          onStep,
          render: false,
        });
        job.props = res.props;
        job.usage = res.usage;
      } else if (template === 'SaaSPromo') {
        const desktop = upload(input.desktop);
        if (!desktop) throw new Error('PC画面のスクリーンショットをアップロードしてください');
        const res = await buildSaasProps({
          name: String(input.name || ''),
          url: String(input.url || ''),
          description: String(input.description || ''),
          facts: String(input.facts || ''),
          desktop,
          mobile: upload(input.mobile),
          logo: upload(input.logo),
          lang,
          jobId: id,
          onStep,
        });
        job.props = res.props;
        job.usage = res.usage;
      } else if (template === 'FivePass') {
        // Director mode: only pass 1 (transcript) runs now; the editor runs passes 2-5 one at a time.
        const video = upload(input.video);
        if (!video) throw new Error('動画をアップロードしてください');
        const res = await pass1({ video, jobId: id, lang: isLang(input.lang) ? input.lang : undefined });
        job.props = res.props;
        job.usage = res.usage;
        job.versions = { 1: res.version };
        job.title = res.props.words.slice(0, 6).map((w) => w.text).join(isLang(res.props.lang) && ['ja', 'zh'].includes(res.props.lang) ? '' : ' ').slice(0, 24) || job.title;
      } else if (template === 'EffectsReel') {
        const video = upload(input.video);
        if (!video) throw new Error('動画をアップロードしてください');
        const prefer = (Array.isArray(input.effects) ? input.effects : []).filter((e: string) => (effectIds as readonly string[]).includes(e));
        const recipe = typeof input.recipe === 'string' ? input.recipe : undefined;
        const brief = { video, jobId: id, prefer, recipe, lang: isLang(input.lang) ? input.lang : undefined, onStep };
        const res = await buildEffectsProps(brief);
        // A sub-type picked in the gallery fixes one style axis (caption, camera, transition, grade or texture) on every cut.
        const lock = input.lock && typeof input.lock === 'object' ? input.lock : null;
        if (lock) {
          const props = res.props as EffectsReelProps;
          for (const s of props.segments) s.style = { ...(s.style ?? {}), ...lock };
          res.props = effectsReelSchema.parse(props);
        }
        job.props = res.props;
        job.usage = res.usage;
        job.title = String(res.title || job.title);
      } else {
        const video = upload(input.video);
        if (!video) throw new Error('動画をアップロードしてください');
        // Captions follow the spoken language unless the user picked a different one.
        const res = await buildTalkProps({ video, jobId: id, lang: isLang(input.lang) ? input.lang : undefined, onStep });
        job.props = res.props;
        job.usage = res.usage;
        job.title = String(res.props.title || job.title);
      }
      job.status = 'ready';
      job.step = undefined;
    } catch (e) {
      console.error(e);
      job.status = 'error';
      job.error = e instanceof Error ? e.message : String(e);
      // Nothing was made, so the tokens go back.
      await refund(user.uid, cost).catch(console.error);
      job.tokens = 0;
    }
    await save(job);
  })();
  return job;
}

/** Renders use a bundle made once at startup, so media made later is passed as URLs to this server. */
const absolutize = (v: unknown): unknown => {
  if (typeof v === 'string') return /^(jobs|uploads)\//.test(v) ? `${ORIGIN}/${v}` : v;
  if (Array.isArray(v)) return v.map(absolutize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, absolutize(x)]));
  return v;
};

let renderQueue = Promise.resolve();
function startRender(job: Job) {
  job.status = 'rendering';
  job.renderProgress = 0;
  save(job);
  // One render at a time: each render already uses every core.
  renderQueue = renderQueue.then(async () => {
    try {
      const out = path.join(jobsDir, job.id, `reel-${Date.now().toString(36)}.mp4`);
      await renderTemplate(job.template, absolutize(job.props) as Record<string, unknown>, out, (p) => {
        job.renderProgress = p;
      });
      // The 5-pass edit carries cue sounds and music, so it is normalised to -14 LUFS for Instagram.
      if (job.template === 'FivePass') await loudnorm(out);
      job.video = `jobs/${job.id}/${path.basename(out)}`;
      job.status = 'done';
    } catch (e) {
      console.error(e);
      job.status = 'ready';
      job.error = `書き出しに失敗しました: ${e instanceof Error ? e.message : e}`;
    }
    job.renderProgress = undefined;
    await save(job);
  });
}

// ---------- HTTP ----------

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

async function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string) {
  let info;
  try {
    info = await stat(file);
    if (!info.isFile()) throw new Error();
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  const type = types[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${info.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Access-Control-Allow-Origin': '*',
    });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' });
  createReadStream(file).pipe(res);
}

// AI cost lines (usage) stay on the server: customers see tokens, never our costs.
const json = (res: http.ServerResponse, code: number, body: unknown) =>
  res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body, (k, v) => (k === 'usage' ? undefined : v)));

const readBody = async (req: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const MAX_UPLOAD = 300 * 1024 * 1024;
const okUpload = /\.(jpe?g|png|webp|mp4|mov|m4v)$/i;

const webDir = path.join(root, 'app/web');
let appJs: Promise<string> | null = null;
const buildApp = () =>
  esbuild
    .build({
      entryPoints: [path.join(webDir, 'main.tsx')],
      bundle: true,
      write: false,
      format: 'esm',
      jsx: 'automatic',
      minify: process.env.NODE_ENV === 'production',
      define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development') },
      loader: { '.json': 'json' },
    })
    .then((r) => r.outputFiles[0].text);

/** Requests from this machine are the renderer fetching job media; they need no login. */
const isLocal = (req: http.IncomingMessage) => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress ?? '') && !req.headers['x-forwarded-for'];

const cookie = (req: http.IncomingMessage, name: string) =>
  req.headers.cookie
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1];

/** The signed-in user from the Authorization header, or from the session cookie for <video> and <img> requests. */
const verified = new Map<string, { user: User; until: number }>();
async function userOf(req: http.IncomingMessage): Promise<User | null> {
  if (!authEnabled) return LOCAL_USER;
  const token = req.headers.authorization?.replace(/^Bearer /, '') || cookie(req, 'reels_session');
  if (!token) return null;
  const hit = verified.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  try {
    const user = await verifyIdToken(token);
    if (verified.size > 5000) verified.clear();
    verified.set(token, { user, until: Date.now() + 5 * 60_000 });
    return user;
  } catch {
    return null;
  }
}

const originOf = (req: http.IncomingMessage) =>
  process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers['x-forwarded-host'] ?? req.headers.host}`;

const readRaw = async (req: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(webDir, 'index.html'));
    if (p === '/app.js') {
      // Rebuilt on every request in development so UI edits show on reload.
      if (process.env.NODE_ENV !== 'production') appJs = null;
      appJs ??= buildApp();
      return res.writeHead(200, { 'Content-Type': types['.js'] }).end(await appJs);
    }
    if (/^\/legal\/[\w-]+\.html$/.test(p)) return sendFile(req, res, path.join(webDir, p));
    if (p === '/api/config') return json(res, 200, { firebase: webConfig(), billing: billingEnabled, topupTokens: TOPUP_TOKENS, freeTokens: FREE_TOKENS, planTokens: PLAN_TOKENS });
    if (p === '/api/stripe/webhook' && req.method === 'POST') {
      try {
        return json(res, 200, await webhook(await readRaw(req), req.headers['stripe-signature'] as string | undefined));
      } catch (e) {
        console.error('stripe webhook', e);
        return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Everything below belongs to a signed-in user (or to the renderer on this machine).
    const local = isLocal(req);
    const user = await userOf(req);
    if (p.startsWith('/api/') && !user) return json(res, 401, { error: 'ログインしてください' });

    if (p === '/api/me') {
      const a = await getAccount(user!.uid, user!.email);
      return json(res, 200, { email: a.email, plan: a.plan, tokens: a.tokens, extra: a.extra, balance: balance(a), billing: billingEnabled, subscribed: Boolean(a.subscriptionId), auth: authEnabled });
    }
    if (p === '/api/billing/checkout' && req.method === 'POST') {
      const { what } = await readBody(req);
      if (!isPurchase(what)) return json(res, 400, { error: 'unknown plan' });
      return json(res, 200, { url: await checkout(await getAccount(user!.uid, user!.email), what, originOf(req)) });
    }
    if (p === '/api/billing/portal' && req.method === 'POST') {
      return json(res, 200, { url: await portal(await getAccount(user!.uid, user!.email), originOf(req)) });
    }
    if (p === '/api/upload' && req.method === 'POST') {
      const name = url.searchParams.get('name') ?? 'file';
      if (!okUpload.test(name)) return json(res, 400, { error: 'JPG / PNG / WebP / MP4 / MOV のみ対応しています' });
      if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD) return json(res, 413, { error: 'ファイルが大きすぎます (300MBまで)' });
      const file = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${path.extname(name).toLowerCase()}`;
      const dir = path.join(uploadsDir, userDir(user!));
      await mkdir(dir, { recursive: true });
      await pipeline(req, createWriteStream(path.join(dir, file)));
      return json(res, 200, { file, url: `/uploads/${userDir(user!)}/${file}` });
    }
    if (p === '/api/jobs' && req.method === 'GET') {
      const list = [...jobs.values()].filter((j) => (j.owner ?? LOCAL_USER.uid) === user!.uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, list.map(({ props, ...j }) => ({ ...j, thumb: thumbOf(j.template, props) })));
    }
    if (p === '/api/jobs' && req.method === 'POST') {
      const body = await readBody(req);
      if (!(body.template in schemas)) return json(res, 400, { error: 'unknown template' });
      try {
        return json(res, 200, await startJob(body.template, body.input ?? {}, user!));
      } catch (e) {
        if (e instanceof NotEnoughTokens) return json(res, 402, { error: e.message, code: 'tokens' });
        throw e;
      }
    }
    const m = p.match(/^\/api\/jobs\/([\w-]+)(\/props|\/render|\/pass|\/restore)?$/);
    if (m) {
      const job = jobs.get(m[1]);
      if (!job || (job.owner ?? LOCAL_USER.uid) !== user!.uid) return json(res, 404, { error: 'job not found' });
      if (!m[2] && req.method === 'GET') return json(res, 200, job);
      if (m[2] === '/props' && req.method === 'PUT') {
        const parsed = schemas[job.template].safeParse((await readBody(req)).props);
        if (!parsed.success) return json(res, 400, { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n') });
        job.props = parsed.data as Record<string, unknown>;
        // The 5-pass server reads its own props file, so edits made in the editor must land there too.
        if (job.template === 'FivePass') await writeFile(path.join(jobsDir, job.id, 'fivepass.json'), JSON.stringify(job.props, null, 2));
        if (job.status === 'done' || job.status === 'error') job.status = 'ready';
        job.error = undefined;
        await save(job);
        return json(res, 200, job);
      }
      if (m[2] === '/pass' && req.method === 'POST') {
        if (job.template !== 'FivePass') return json(res, 400, { error: 'not a 5-pass job' });
        if (job.status === 'generating' || job.status === 'rendering') return json(res, 409, { error: '処理中です' });
        const { pass, note } = await readBody(req);
        const n = Number(pass);
        if (!(n >= 2 && n <= 5)) return json(res, 400, { error: 'pass must be 2-5' });
        job.status = 'generating';
        job.step = { n: 1, total: 1, label: `pass ${n}` };
        job.error = undefined;
        await save(job);
        (async () => {
          try {
            const r = await runPass(n, { jobId: job.id, note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : undefined });
            job.props = r.props;
            job.versions = { ...(job.versions ?? {}), [n]: r.version };
          } catch (e) {
            console.error(e);
            job.error = e instanceof Error ? e.message : String(e);
          }
          job.status = 'ready';
          job.step = undefined;
          await save(job);
        })();
        return json(res, 200, job);
      }
      if (m[2] === '/restore' && req.method === 'POST') {
        if (job.template !== 'FivePass') return json(res, 400, { error: 'not a 5-pass job' });
        const { pass, version } = await readBody(req);
        job.props = (await restoreVersion(job.id, Number(pass), Number(version))) as Record<string, unknown>;
        job.status = 'ready';
        await save(job);
        return json(res, 200, job);
      }
      if (m[2] === '/render' && req.method === 'POST') {
        if (!job.props) return json(res, 400, { error: 'まだ生成中です' });
        if (job.status === 'rendering') return json(res, 409, { error: '書き出し中です' });
        startRender(job);
        return json(res, 200, job);
      }
    }
    // Media and fonts from public/ (jobs, uploads, samples, fonts). A user's jobs and uploads are theirs only.
    const file = path.join(publicDir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(publicDir)) return res.writeHead(403).end();
    if (/^\/jobs\/.*\/(job|usage|plan)\.json$/.test(p)) return res.writeHead(404).end();
    if (!local) {
      const jm = p.match(/^\/jobs\/([\w-]+)\//);
      if (jm && (!user || (jobs.get(jm[1])?.owner ?? LOCAL_USER.uid) !== user.uid)) return res.writeHead(404).end();
      const um = p.match(/^\/uploads\/([^/]+)\//);
      if (p.startsWith('/uploads/') && (!user || !um || um[1] !== userDir(user))) return res.writeHead(404).end();
    }
    return sendFile(req, res, file);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

const thumbOf = (t: Template, props?: Record<string, any>) =>
  !props ? undefined : t === 'ProductShine' ? props.photo : t === 'SaaSPromo' ? props.desktop : undefined;

await loadJobs();
server.listen(PORT, () => console.log(`Reels Studio on ${ORIGIN} (login ${authEnabled ? 'on' : 'off'}, billing ${billingEnabled ? 'on' : 'off'})`));
