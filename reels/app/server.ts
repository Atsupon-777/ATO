// Editless web app: serves the editor and runs generation/render jobs.
//   node app/server.ts            (PORT=3000 by default)
// Jobs live in public/jobs/<id>/ (job.json + media), so a restart keeps history.
// Login (FIREBASE_PROJECT_ID) and billing (STRIPE_SECRET_KEY) switch on from the environment; see deploy/README.md.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { effectIds, effectsReelSchema, experienceFilmSchema, photoAdSchema, productShineSchema, saasPromoSchema, talkCaptionsSchema, fivePassSchema, type EffectsReelProps } from '../src/schemas.ts';
import { pass1, restoreVersion, runPass } from '../server/fivepass.ts';
import { finish } from '../server/loudnorm.ts';
import { studioVoice, videoFps } from '../server/studio.ts';
import { catalog, countUse } from '../server/catalog.ts';
import { buildServiceProps } from '../server/service.ts';
import { buildPhotoProps } from '../server/photo.ts';
import { photoReelSchema } from '../src/photoreel.ts';
import { serviceReelSchema } from '../src/servicereel.ts';
import { buildEffectsProps } from '../server/effects.ts';
import { buildProductReel, STYLES, type Style } from '../server/product.ts';
import { buildExperienceFilm } from '../server/experience.ts';
import { buildPhotoAd } from '../server/photoad.ts';
import { renderTemplate } from '../server/render.ts';
import { buildSaasProps } from '../server/saas.ts';
import { buildTalkProps } from '../server/talk.ts';
import { derived } from '../server/derived.ts';
import { isGoal, type Goal } from '../server/goals.ts';
import { takePostKitTurn, writePostKit, type PostKit } from '../server/postkit.ts';
import { isLang, type Lang } from '../src/lang.ts';
import { authEnabled, LOCAL_USER, verifyIdToken, webConfig, type User } from '../server/auth.ts';
import { type Brand, freeFirstState, giveBackFreeFirst, takeFreeFirst, FreeClaimError, NotEnoughTokens, balance, carriedTokens, carriedUntil, charge, claimFree, getAccount, refund, removeAccount, update, allAccounts, PLAN_TOKENS, FREE_TOKENS, PAYG_UNIT, PAYG_UNIT_YEN, PAYG_MIN, PAYG_MAX } from '../server/accounts.ts';
import { billingEnabled, cancelSubscription, checkout, isPurchase, paygUnits, portal, webhook } from '../server/billing.ts';
import { iapConfig, revenuecatWebhook } from '../server/appstore.ts';
import { deleteFirebaseUser } from '../server/google.ts';
import { generateMusic } from '../server/gemini.ts';
import { Usage } from '../server/usage.ts';
import { dataDir } from '../server/paths.ts';
import { addDevice, notifyJob, removeDevice } from '../server/push.ts';
import { recordAi, recordTokens } from '../server/ledger.ts';
import { isAdmin, metrics } from '../server/metrics.ts';

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
  ServiceReel: serviceReelSchema,
  PhotoReel: photoReelSchema,
  ExperienceFilm: experienceFilmSchema,
  PhotoAdFilm: photoAdSchema,
};
type Template = keyof typeof schemas;

type Job = {
  id: string;
  template: Template;
  title: string;
  createdAt: string;
  status: 'generating' | 'ready' | 'rendering' | 'done' | 'error';
  /** Current generation step; `at` is when it started, so the browser can estimate time left. */
  step?: { n: number; total: number; label: string; at?: string };
  renderProgress?: number;
  renderStartedAt?: string;
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
  /** The premium edit (stickers, telops) has been paid for once, so later exports cost only EXPORT_TOKENS. */
  premiumPaid?: boolean;
  /** The current export (`video`) was made with 高画質・高音質. */
  hq?: boolean;
  /** Music beds made for this reel, by genre (plus `original`, the one it was first made with): re-picking one is free. */
  musicTracks?: Record<string, string>;
  /** What the reel is for, picked on the home screen (server/goals.ts). */
  goal?: Goal;
  /** 投稿文 (caption, hashtags, when to post) written for this reel, by the language of the app that asked. */
  postkit?: Partial<Record<Lang, PostKit>>;
};

/** Each export costs a little; the first export that carries premium-edit layers adds PREMIUM_TOKENS once. */
const EXPORT_TOKENS = 1;
const PREMIUM_TOKENS = 2;
const premiumDue = (job: Job) => Boolean((job.props as { overlays?: unknown[] } | undefined)?.overlays?.length && !job.premiumPaid);
/** 高画質・高音質で書き出す: a lower CRF, near-lossless frames, the source's 60 fps and the studio voice, on top of the export. */
const HQ_TOKENS = 2;
const exportCost = (job: Job, hq = false) => EXPORT_TOKENS + (premiumDue(job) ? PREMIUM_TOKENS : 0) + (hq ? HQ_TOKENS : 0);

/** Tokens each kind of reel takes: own footage only 2, AI photo or effects 5, with AI video 12 (experience films and photo ads are all AI video). */
/** Product ad films: an account's first one is free (accounts.ts freeFirstState). Names of templates still to come are listed too. */
const PRODUCT_AD = new Set<string>(['ProductShine', 'ExperienceFilm', 'PhotoAdFilm', 'PhotoAd']);
const tokensFor = (t: Template, input: Record<string, any>) => (t === 'ExperienceFilm' || t === 'PhotoAdFilm' ? 12 : t === 'ProductShine' ? (input.video ? 12 : 5) : t === 'EffectsReel' || t === 'FivePass' || t === 'SaaSPromo' || t === 'ServiceReel' ? 5 : 2);

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
      // Jobs made between 2026-10-18 and 2026-10-21 recorded 2,000 / 5,000 / 12,000.
      if (job.tokens && job.tokens >= 1000) job.tokens = Math.round(job.tokens / 1000);
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

/**
 * 「別の曲」 and new kinds of music are free (no tokens since 2026-10-23); each owner may make MUSIC_PER_HOUR /
 * MUSIC_PER_DAY new tracks, so free re-dos can't be farmed. Picking a kind already made for the reel is not counted.
 */
const MUSIC_PER_HOUR = 8;
const MUSIC_PER_DAY = 30;
const musicMade = new Map<string, number[]>();
const takeMusicTurn = (uid: string) => {
  const now = Date.now();
  const list = (musicMade.get(uid) ?? []).filter((t) => now - t < 24 * 3600_000);
  if (list.filter((t) => now - t < 3600_000).length >= MUSIC_PER_HOUR || list.length >= MUSIC_PER_DAY) return false;
  list.push(now);
  musicMade.set(uid, list);
  if (musicMade.size > 10_000) musicMade.clear();
  return true;
};
/** The music kinds the pick screen offers, each with the Lyria prompt that makes it. */
const MUSIC_GENRES: Record<string, string> = {
  jazz: 'Smooth modern jazz at about 90 BPM: brushed drums with a relaxed swing, a warm walking upright bass, soft Rhodes electric piano chords and a few gentle muted-trumpet phrases. Laid-back, warm, a stylish cafe feel.',
  phonk: 'Drift phonk at about 130 BPM: heavy distorted 808 bass, punchy trap drums with crisp rolling hi-hats, the signature bright cowbell melody, dark Memphis-style atmosphere. Hypnotic, confident and energetic. No vocal chops or samples of voices.',
  classical: 'Light classical piece at about 100 BPM: a string quartet with gentle piano, an elegant Baroque-inspired melody over steady pizzicato, clean concert-hall sound. Graceful and uplifting.',
  chill: 'Chill lo-fi hip hop at about 80 BPM: dusty laid-back boom-bap drums, mellow jazzy piano chords, round warm bass, soft vinyl crackle. Calm, cozy and unhurried.',
  pop: 'Upbeat modern pop at about 115 BPM: four-on-the-floor kick with claps, bright synth chords, plucky clean guitar and a catchy feel-good hook played on a synth lead. Polished, radio-ready, positive.',
};
const musicPrompt = (style: string) =>
  `Instrumental background music for a short vertical social video (about 30 seconds) that someone talks over. ${style} Instrumental only: no vocals, no singing, no spoken words. Keep the midrange where the voice sits uncluttered, steady energy from start to finish, no long intro, loopable.`;
/** Before a reel's music is replaced, keep the one it was made with so it can be picked again. */
const keepOriginalMusic = (job: Job, next?: unknown) => {
  const cur = (job.props as { music?: unknown } | undefined)?.music;
  if (typeof cur !== 'string' || cur === next || job.musicTracks?.original || Object.values(job.musicTracks ?? {}).includes(cur)) return;
  job.musicTracks = { ...job.musicTracks, original: cur };
};

async function startJob(template: Template, input: Record<string, any>, user: User) {
  const id = `job-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  // The account's first product ad film costs nothing (once; it comes back if the film fails).
  const freeFirst = PRODUCT_AD.has(template) && (await takeFreeFirst(user.uid, id));
  const cost = freeFirst ? 0 : tokensFor(template, input);
  await charge(user.uid, cost);
  const upload = uploadOf(user);
  await mkdir(path.join(jobsDir, id), { recursive: true });
  const job: Job = {
    id,
    template,
    title: String(input.name || input.title || template),
    createdAt: new Date().toISOString(),
    status: 'generating',
    owner: user.uid,
    tokens: cost,
    goal: isGoal(input.goal) ? input.goal : undefined,
  };
  const goal = job.goal;
  jobs.set(id, job);
  await save(job);
  recordTokens({ uid: user.uid, jobId: id, template, op: freeFirst ? 'free_first' : 'reel', tokens: cost });
  const onStep = (n: number, total: number, label: string) => {
    job.step = { n, total, label, at: new Date().toISOString() };
    save(job);
  };
  const lang: Lang = isLang(input.lang) ? input.lang : 'ja';
  (async () => {
    try {
      if (template === 'ProductShine') {
        const photo = upload(input.photo);
        const concept = String(input.concept || '').slice(0, 300);
        if (!photo && !concept) throw new Error('写真をアップロードしてください');
        const style = (input.style in STYLES ? input.style : 'luxury') as Style;
        const res = await buildProductReel({
          photo,
          concept,
          brand: String(input.brand || '').slice(0, 16),
          productName: String(input.name || '').slice(0, 24),
          facts: String(input.facts || ''),
          style,
          cta: String(input.cta || '詳しくはプロフィールへ').slice(0, 16),
          handle: String(input.handle || '').slice(0, 30),
          video: Boolean(input.video),
          onSkin: Boolean(input.onSkin),
          goal,
          lang,
          jobId: id,
          onStep,
          render: false,
        });
        job.props = res.props;
        job.usage = res.usage;
      } else if (template === 'ExperienceFilm') {
        const files = (Array.isArray(input.photos) ? input.photos : []).map(upload).filter(Boolean) as string[];
        const description = String(input.description || '').slice(0, 400);
        if (!description) throw new Error('どんな体験かを書いてください');
        const res = await buildExperienceFilm({
          brand: String(input.name || '').slice(0, 24),
          description,
          place: String(input.place || '').slice(0, 40),
          facts: String(input.facts || '').slice(0, 300),
          photos: files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)),
          videos: files.filter((f) => /\.(mp4|mov|m4v)$/i.test(f)),
          url: String(input.url || '').slice(0, 40),
          cta: String(input.cta || '').slice(0, 16),
          handle: String(input.handle || '').slice(0, 30),
          lang,
          goal,
          jobId: id,
          onStep,
          render: false,
        });
        job.props = res.props;
        job.usage = res.usage;
        job.title = res.props.title || job.title;
      } else if (template === 'PhotoAdFilm') {
        const photo = upload(input.photo);
        if (!photo) throw new Error('商品の写真をアップロードしてください');
        const res = await buildPhotoAd({
          photo,
          brand: String(input.brand || '').slice(0, 24),
          description: String(input.description || '').slice(0, 300),
          facts: String(input.facts || '').slice(0, 300),
          cta: String(input.cta || '').slice(0, 16),
          handle: String(input.handle || '').slice(0, 30),
          lang,
          jobId: id,
          onStep,
          until: 'props',
        });
        job.props = res.props!;
        job.usage = res.usage;
        job.title = res.props?.brand || job.title;
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
      } else if (template === 'PhotoReel') {
        const photos = (Array.isArray(input.photos) ? input.photos : []).map(upload).filter(Boolean) as string[];
        const res = await buildPhotoProps({
          template: String(input.templateId || ''),
          photos,
          description: String(input.description || ''),
          handle: String(input.handle || ''),
          lang,
          jobId: id,
          onStep,
        });
        job.props = res.props;
        job.usage = res.usage;
        job.title = res.props.title || job.title;
      } else if (template === 'ServiceReel') {
        const photos = (Array.isArray(input.photos) ? input.photos : []).map(upload).filter(Boolean) as string[];
        const res = await buildServiceProps({
          template: String(input.templateId || ''),
          name: String(input.name || '').slice(0, 24),
          url: String(input.url || ''),
          description: String(input.description || ''),
          facts: String(input.facts || ''),
          phone: upload(input.phone),
          desktop: upload(input.desktop),
          logo: upload(input.logo),
          photos,
          lang,
          goal,
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
        const brief = { video, jobId: id, prefer, recipe, lang: isLang(input.lang) ? input.lang : undefined, goal, onStep };
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
      // The brand kit's main colour, on templates that take an accent colour.
      if (typeof input.accent === 'string' && /^#[0-9a-f]{6}$/i.test(input.accent) && job.props) brandAccent(template, job.props, input.accent.toUpperCase());
      job.status = 'ready';
      job.step = undefined;
      // The generation's AI spend, once, for the owner's dashboard.
      recordAi({ jobId: id, uid: user.uid, template, step: 'gen', usd: job.usage?.totalUsd ?? 0 });
      notifyJob(user.uid, 'ready', job);
    } catch (e) {
      console.error(e);
      job.status = 'error';
      job.error = e instanceof Error ? e.message : String(e);
      // Nothing was made, so the tokens go back (or, for the free first film, the right to it).
      if (freeFirst) {
        await giveBackFreeFirst(user.uid, id).catch(console.error);
        recordTokens({ uid: user.uid, jobId: id, template, op: 'free_first_back', tokens: 0 });
      } else {
        await refund(user.uid, cost).catch(console.error);
        recordTokens({ uid: user.uid, jobId: id, template, op: 'refund', tokens: cost });
      }
      job.tokens = 0;
    }
    await save(job);
  })();
  return job;
}

/** Puts the brand colour where each template keeps its accent. */
function brandAccent(template: Template, props: Record<string, any>, hex: string) {
  if (template === 'ServiceReel') props.accent = hex;
  else if (template === 'SaaSPromo' || template === 'ProductShine' || template === 'ExperienceFilm') {
    if (props.palette && typeof props.palette === 'object') props.palette.accent = hex;
  } else if (template === 'EffectsReel') {
    if (props.palette && typeof props.palette === 'object') props.palette.accent = hex;
    for (const s of props.segments ?? []) if (s.style?.color) s.style.color = hex;
  }
}

/** Renders use a bundle made once at startup, so media made later is passed as URLs to this server. */
const absolutize = (v: unknown): unknown => {
  if (typeof v === 'string') return /^(jobs|uploads)\//.test(v) ? `${ORIGIN}/${v}` : v;
  if (Array.isArray(v)) return v.map(absolutize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, absolutize(x)]));
  return v;
};

let renderQueue = Promise.resolve();
function startRender(job: Job, cost = 0, opts: { hq?: boolean; premium?: boolean } = {}) {
  job.status = 'rendering';
  job.renderProgress = 0;
  job.renderStartedAt = new Date().toISOString();
  save(job);
  // One render at a time: each render already uses every core.
  renderQueue = renderQueue.then(async () => {
    const dir = path.join(jobsDir, job.id);
    const out = path.join(dir, `reel-${Date.now().toString(36)}.mp4`);
    const wav = out.replace(/\.mp4$/, '.wav');
    const studio = path.join(dir, 'source.studio.mov');
    try {
      let props = job.props as Record<string, unknown>;
      let fps: number | undefined;
      const video = typeof props.video === 'string' && /^jobs\/[\w-]+\/source\.mp4$/.test(props.video) ? path.join(publicDir, props.video) : undefined;
      if (opts.hq && video) {
        // 高音質: the render reads a copy of the footage whose sound is the studio voice.
        if (await studioVoice(video, studio)) props = { ...props, video: `jobs/${job.id}/${path.basename(studio)}` };
        // 60 fps footage stays 60 fps, unless a 30 fps person matte is layered over it (it would lag behind).
        if (!props.matte && (await videoFps(video)) >= 50) fps = 60;
      }
      await renderTemplate(job.template, absolutize(props) as Record<string, unknown>, out, (p) => {
        job.renderProgress = p;
      }, { hq: opts.hq, fps, audioTo: wav });
      // The mix gets its one AAC encode here, with voice, music and cue sounds at -14 LUFS (Instagram / TikTok level).
      await finish(out, wav, { hq: opts.hq });
      job.video = `jobs/${job.id}/${path.basename(out)}`;
      job.hq = opts.hq || undefined;
      job.status = 'done';
      job.error = undefined;
      if (opts.premium) job.premiumPaid = true;
      job.tokens = (job.tokens ?? 0) + cost;
      if (job.owner) notifyJob(job.owner, 'done', job);
    } catch (e) {
      console.error(e);
      job.status = 'ready';
      job.error = `書き出しに失敗しました: ${e instanceof Error ? e.message : e}`;
      // Nothing came out, so the export tokens go back.
      if (cost) await refund(job.owner ?? LOCAL_USER.uid, cost).catch(console.error);
      if (cost) recordTokens({ uid: job.owner ?? LOCAL_USER.uid, jobId: job.id, template: job.template, op: 'refund', tokens: cost, hq: opts.hq || undefined });
      await rm(out, { force: true }).catch(() => null);
    }
    await rm(wav, { force: true }).catch(() => null);
    await rm(studio, { force: true }).catch(() => null);
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
  '.webmanifest': 'application/manifest+json',
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

/**
 * The iPhone / Android app bundles the page itself (capacitor://localhost, https://localhost) and calls this
 * server across origins. It signs requests with the Authorization header, never cookies.
 */
const APP_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost', ...(process.env.APP_ORIGINS ?? '').split(',').filter(Boolean)]);
const cors = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const o = req.headers.origin;
  if (!o || !APP_ORIGINS.has(o)) return false;
  res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
};

/**
 * <video> and <img> in the app can't send the Authorization header, and the website's session cookie
 * doesn't reach another origin. So the app adds ?k=<media key> to job and upload URLs: the uid, an expiry
 * and an HMAC with a server secret kept next to the accounts.
 */
let mediaSecret: Buffer | null = null;
const mediaSecretOf = async () => {
  if (mediaSecret) return mediaSecret;
  const file = path.join(dataDir, 'media-secret');
  try {
    mediaSecret = Buffer.from((await readFile(file, 'utf8')).trim(), 'hex');
  } catch {}
  if (!mediaSecret || mediaSecret.length < 32) {
    mediaSecret = randomBytes(32);
    await mkdir(dataDir, { recursive: true });
    await writeFile(file, mediaSecret.toString('hex'), { mode: 0o600 });
  }
  return mediaSecret;
};
const MEDIA_KEY_HOURS = 24;
const signMedia = async (uid: string, exp: number) => createHmac('sha256', await mediaSecretOf()).update(`${uid}.${exp}`).digest('base64url');
async function mediaKey(user: User) {
  const exp = Math.floor(Date.now() / 1000) + MEDIA_KEY_HOURS * 3600;
  return `${Buffer.from(user.uid).toString('base64url')}.${exp}.${await signMedia(user.uid, exp)}`;
}
async function userOfMediaKey(k: string): Promise<User | null> {
  const [u, e, sig] = k.split('.');
  const exp = Number(e);
  if (!u || !sig || !(exp > Date.now() / 1000)) return null;
  const uid = Buffer.from(u, 'base64url').toString('utf8');
  const want = Buffer.from(await signMedia(uid, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? { uid } : null;
}

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
async function userOf(req: http.IncomingMessage, url: URL): Promise<User | null> {
  if (!authEnabled) return LOCAL_USER;
  const token = req.headers.authorization?.replace(/^Bearer /, '') || cookie(req, 'reels_session');
  // Media only: never accepted for /api/ calls.
  const k = url.searchParams.get('k');
  if (!token && k && req.method === 'GET' && !url.pathname.startsWith('/api/')) return userOfMediaKey(k);
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

const pwaFiles = new Set(['/manifest.webmanifest', '/sw.js', '/offline.html', '/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  const p = decodeURIComponent(url.pathname);
  try {
    if (cors(req, res) && req.method === 'OPTIONS') return res.writeHead(204).end();
    if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(webDir, 'index.html'));
    if (p === '/app.js') {
      // Rebuilt on every request in development so UI edits show on reload.
      if (process.env.NODE_ENV !== 'production') appJs = null;
      appJs ??= buildApp();
      return res.writeHead(200, { 'Content-Type': types['.js'] }).end(await appJs);
    }
    if (/^\/legal\/[\w-]+\.html$/.test(p)) return sendFile(req, res, path.join(webDir, p));
    if (/^\/icons\/(icon(-\d+)?\.(svg|png)|ato-mark\.png)$/.test(p)) return sendFile(req, res, path.join(webDir, p));
    // Home-screen app files live at the site root. The service worker must always be re-checked.
    if (pwaFiles.has(p)) {
      if (p === '/sw.js') res.setHeader('Cache-Control', 'no-cache');
      return sendFile(req, res, path.join(webDir, 'pwa', p));
    }
    if (p === '/api/config')
      return json(res, 200, { firebase: webConfig(), billing: billingEnabled, payg: { unit: PAYG_UNIT, unitYen: PAYG_UNIT_YEN, min: PAYG_MIN, max: PAYG_MAX }, freeTokens: FREE_TOKENS, planTokens: PLAN_TOKENS, iap: iapConfig(), appleWeb: process.env.APPLE_SIGNIN_WEB === '1' });
    if (p === '/api/catalog' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return json(res, 200, await catalog());
    }
    if (p === '/api/revenuecat/webhook' && req.method === 'POST') {
      try {
        return json(res, 200, await revenuecatWebhook(await readBody(req), req.headers.authorization));
      } catch (e) {
        console.error('revenuecat webhook', e);
        return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }
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
    const user = await userOf(req, url);
    if (p.startsWith('/api/') && !user) return json(res, 401, { error: 'ログインしてください' });

    if (p === '/api/me' && req.method === 'GET') {
      const a = await getAccount(user!.uid, user!.email);
      return json(res, 200, { admin: isAdmin(user!, a.email) || undefined, email: a.email, plan: a.plan, tokens: a.tokens, carried: carriedTokens(a), carriedUntil: carriedUntil(a), extra: a.extra, balance: balance(a), billing: billingEnabled, subscribed: Boolean(a.subscriptionId), store: a.store ?? (a.subscriptionId ? 'stripe' : undefined), pastDue: Boolean(a.pastDue), pendingPlan: a.pendingPlan, pendingPlanAt: a.pendingPlanAt, freePending: Boolean(a.freePending), displayName: a.displayName, avatar: a.avatar, auth: authEnabled, freeFirst: freeFirstState(a) });
    }
    // Account deletion (App Store guideline 5.1.1(v)): web plan cancelled, jobs, uploads, account and login removed.
    // An App Store subscription can only be cancelled by the customer in their Apple ID settings; the app says so.
    if (p === '/api/me' && req.method === 'DELETE') {
      if (!authEnabled) return json(res, 400, { error: 'login is off' });
      const a = await getAccount(user!.uid, user!.email);
      await cancelSubscription(a);
      for (const j of [...jobs.values()].filter((j) => j.owner === user!.uid)) {
        jobs.delete(j.id);
        await rm(path.join(jobsDir, j.id), { recursive: true, force: true });
      }
      await rm(path.join(uploadsDir, userDir(user!)), { recursive: true, force: true });
      await removeAccount(user!.uid);
      await deleteFirebaseUser(user!.uid);
      for (const [t, v] of verified) if (v.user.uid === user!.uid) verified.delete(t);
      return json(res, 200, { deleted: true });
    }
    // The owner's business dashboard (#/admin): revenue, costs and profit. Owners only, never customers.
    if (p === '/api/admin/metrics' && req.method === 'GET') {
      const a = await getAccount(user!.uid, user!.email);
      if (!isAdmin(user!, a.email)) return json(res, 404, { error: 'not found' });
      const month = url.searchParams.get('month') ?? '';
      if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json(res, 400, { error: 'month must be YYYY-MM' });
      res.setHeader('Cache-Control', 'no-store');
      return json(res, 200, await metrics([...jobs.values()], month || undefined));
    }
    // Owner gives tokens to an account by email (testing, App Review). Logged as a grant, never as a sale.
    if (p === '/api/admin/grant' && req.method === 'POST') {
      const a = await getAccount(user!.uid, user!.email);
      if (!isAdmin(user!, a.email)) return json(res, 404, { error: 'not found' });
      const { email, tokens } = await readBody(req);
      const n = Math.floor(Number(tokens));
      if (typeof email !== 'string' || !email.includes('@') || !(n >= 1 && n <= 10000)) return json(res, 400, { error: 'email and 1-10000 tokens' });
      const target = (await allAccounts()).find((x) => x.email?.toLowerCase() === email.trim().toLowerCase());
      if (!target) return json(res, 404, { error: 'このメールのアカウントが見つかりません（一度ログインしてもらってください）' });
      await update(target.uid, (x) => void (x.extra += n));
      await recordTokens({ uid: target.uid, op: 'grant', tokens: n });
      const after = await getAccount(target.uid);
      return json(res, 200, { email: target.email, granted: n, balance: balance(after) });
    }
    if (p === '/api/media-key' && req.method === 'GET') return json(res, 200, { key: await mediaKey(user!), hours: MEDIA_KEY_HOURS });
    // Push notifications in the app: its FCM token, so a finished export can tell the phone.
    if (p === '/api/push-token' && (req.method === 'POST' || req.method === 'DELETE')) {
      const { token, platform, lang } = await readBody(req);
      if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return json(res, 400, { error: 'bad token' });
      await (req.method === 'POST' ? addDevice(user!.uid, token, platform, lang) : removeDevice(user!.uid, token));
      return json(res, 200, { ok: true });
    }
    // Profile: a name and a photo the user uploaded earlier (it must be one of their own uploads).
    if (p === '/api/me' && req.method === 'PUT') {
      const { displayName, avatar } = await readBody(req);
      const mine = `/uploads/${userDir(user!)}/`;
      if (avatar !== undefined && avatar !== null && !(typeof avatar === 'string' && avatar.startsWith(mine) && /^[\w.-]+\.(jpe?g|png|webp)$/i.test(avatar.slice(mine.length))))
        return json(res, 400, { error: '画像はJPG / PNG / WebPを選んでください' });
      const a = await update(user!.uid, (a) => {
        if (typeof displayName === 'string') a.displayName = displayName.trim().slice(0, 30) || undefined;
        if (avatar !== undefined) a.avatar = avatar || undefined;
      });
      return json(res, 200, { displayName: a.displayName, avatar: a.avatar });
    }
    // Brand kit: name, Instagram handle, main colour and logo, saved with the account and filled into new reels.
    if (p === '/api/me/brand' && req.method === 'GET') {
      const a = await getAccount(user!.uid, user!.email);
      return json(res, 200, a.brand ?? {});
    }
    if (p === '/api/me/brand' && req.method === 'PUT') {
      const { name, handle, color, logo } = await readBody(req);
      const mine = `/uploads/${userDir(user!)}/`;
      if (logo !== undefined && logo !== null && logo !== '' && !(typeof logo === 'string' && logo.startsWith(mine) && /^[\w.-]+\.(jpe?g|png|webp)$/i.test(logo.slice(mine.length))))
        return json(res, 400, { error: '画像はJPG / PNG / WebPを選んでください' });
      if (color !== undefined && color !== null && color !== '' && !(typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) return json(res, 400, { error: 'color must be #rrggbb' });
      const text = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) || undefined : undefined);
      const h = text(handle, 31)?.replace(/^@*/, '@').slice(0, 30);
      const brand: Brand = { name: text(name, 24), handle: h && h !== '@' ? h : undefined, color: color ? String(color).toUpperCase() : undefined, logo: logo || undefined };
      const a = await update(user!.uid, (a) => void (a.brand = Object.values(brand).some(Boolean) ? brand : undefined));
      return json(res, 200, a.brand ?? {});
    }
    // Free tokens: the browser links a phone number by SMS first, so the ID token carries it.
    if (p === '/api/free-tokens' && req.method === 'POST') {
      if (!user!.phone) return json(res, 400, { error: '電話番号を確認してください' });
      try {
        const a = await claimFree(user!.uid, user!.phone);
        return json(res, 200, { balance: balance(a) });
      } catch (e) {
        if (e instanceof FreeClaimError) return json(res, 409, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/billing/checkout' && req.method === 'POST') {
      const { what, tokens } = await readBody(req);
      if (!isPurchase(what)) return json(res, 400, { error: 'unknown plan' });
      if (what === 'topup') {
        try {
          paygUnits(tokens);
        } catch (e: any) {
          return json(res, 400, { error: e.message });
        }
      }
      return json(res, 200, { url: await checkout(await getAccount(user!.uid, user!.email), what, originOf(req), tokens) });
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
      return json(res, 200, list.map(({ props, ...j }) => ({ ...j, thumb: thumbOf(j.template, props), poster: posterOfJob(j.video, props) })));
    }
    if (p === '/api/jobs' && req.method === 'POST') {
      const body = await readBody(req);
      if (!(body.template in schemas)) return json(res, 400, { error: 'unknown template' });
      try {
        const started = await startJob(body.template, body.input ?? {}, user!);
        const tpl = body.input?.recipe ?? body.input?.templateId;
        if (typeof tpl === 'string' && tpl !== 'all') countUse(tpl).catch(() => {});
        return json(res, 200, started);
      } catch (e) {
        if (e instanceof NotEnoughTokens) return json(res, 402, { error: e.message, code: 'tokens' });
        throw e;
      }
    }
    const m = p.match(/^\/api\/jobs\/([\w-]+)(\/props|\/render|\/pass|\/restore|\/music|\/postkit)?$/);
    if (m) {
      const job = jobs.get(m[1]);
      if (!job || (job.owner ?? LOCAL_USER.uid) !== user!.uid) return json(res, 404, { error: 'job not found' });
      if (!m[2] && req.method === 'GET') return json(res, 200, job);
      if (m[2] === '/props' && req.method === 'PUT') {
        const parsed = schemas[job.template].safeParse((await readBody(req)).props);
        if (!parsed.success) return json(res, 400, { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n') });
        keepOriginalMusic(job, (parsed.data as { music?: unknown }).music);
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
            recordAi({ jobId: job.id, uid: user!.uid, template: job.template, step: `pass${n}`, usd: r.usage.totalUsd });
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
      // 「別の曲」 / 音楽の種類: a new AI music bed for the same reel, free within the owner's limit. With a genre (jazz,
      // phonk, classical, chill, pop) the track is kept on the job, so picking that genre again is free.
      if (m[2] === '/music' && req.method === 'POST') {
        if (!job.props || !['EffectsReel', 'ServiceReel', 'PhotoReel'].includes(job.template)) return json(res, 400, { error: 'この動画には曲を付けられません' });
        if (job.status === 'generating' || job.status === 'rendering') return json(res, 409, { error: '処理中です' });
        const { mood, genre } = await readBody(req);
        if (genre !== undefined && (typeof genre !== 'string' || !Object.prototype.hasOwnProperty.call(MUSIC_GENRES, genre))) return json(res, 400, { error: 'unknown genre' });
        const cached = genre ? job.musicTracks?.[genre] : undefined;
        if (cached && existsSync(path.join(publicDir, cached))) {
          keepOriginalMusic(job, cached);
          job.props = { ...job.props, music: cached };
          if (job.status === 'done' || job.status === 'error') job.status = 'ready';
          await save(job);
          return json(res, 200, job);
        }
        if (!takeMusicTurn(user!.uid)) return json(res, 429, { error: '曲の作り直しが続いています。しばらくしてからもう一度お試しください。' });
        const moods = ['warm and hopeful', 'bright upbeat pop', 'chill lo-fi', 'cinematic and airy', 'punchy electronic', 'acoustic and cozy', 'sleek minimal house', 'funky groove'];
        const pick = typeof mood === 'string' && mood.trim() ? mood.trim().slice(0, 60) : moods[Math.floor(Math.random() * moods.length)];
        const usage = new Usage();
        try {
          const f = await generateMusic({
            prompt: genre ? musicPrompt(MUSIC_GENRES[genre]) : `Instrumental background music for a short vertical social video. Mood: ${pick}. No vocals, loopable, modern production, leaves room for a voice over it.`,
            out: path.join(jobsDir, job.id, `music-${genre ? `${genre}-` : ''}${Date.now().toString(36)}`),
            usage,
            step: 'music',
          });
          recordAi({ jobId: job.id, uid: user!.uid, template: job.template, step: 'music', usd: usage.totalUsd });
          const music = `jobs/${job.id}/${path.basename(f)}`;
          keepOriginalMusic(job, music);
          if (genre) job.musicTracks = { ...job.musicTracks, [genre]: music };
          job.props = { ...job.props, music };
          if (job.status === 'done' || job.status === 'error') job.status = 'ready';
          await save(job);
          return json(res, 200, job);
        } catch (e) {
          console.error(e);
          return json(res, 502, { error: '曲を作れませんでした。もう一度お試しください。' });
        }
      }
      // 投稿文: free, written once per reel (and app language) and kept; `fresh` writes a new one within the owner's limit.
      if (m[2] === '/postkit' && req.method === 'POST') {
        if (!job.props) return json(res, 400, { error: 'まだ生成中です' });
        const { lang: ui, fresh } = await readBody(req);
        const uiLang: Lang = isLang(ui) ? ui : 'ja';
        const cached = job.postkit?.[uiLang];
        if (cached && !fresh) return json(res, 200, cached);
        if (!takePostKitTurn(user!.uid)) return json(res, 429, { error: '投稿文の作成が続いています。しばらくしてからもう一度お試しください。' });
        try {
          const a = await getAccount(user!.uid, user!.email);
          const { kit, usage } = await writePostKit({ template: job.template, title: job.title, props: job.props, goal: job.goal, brand: a.brand, uiLang });
          recordAi({ jobId: job.id, uid: user!.uid, template: job.template, step: 'postkit', usd: usage.totalUsd });
          job.postkit = { ...job.postkit, [uiLang]: kit };
          await save(job);
          return json(res, 200, kit);
        } catch (e) {
          console.error('postkit', e);
          return json(res, 502, { error: '投稿文を作れませんでした。もう一度お試しください。' });
        }
      }
      if (m[2] === '/render' && req.method === 'POST') {
        if (!job.props) return json(res, 400, { error: 'まだ生成中です' });
        if (job.status === 'rendering') return json(res, 409, { error: '書き出し中です' });
        const { hq = false } = await readBody(req);
        if (typeof hq !== 'boolean') return json(res, 400, { error: 'hq must be true or false' });
        // One charge for the whole export (plus the premium edit once, plus 高画質・高音質 when chosen); all of it comes back if it fails.
        const premium = premiumDue(job);
        const cost = exportCost(job, hq);
        try {
          await charge(user!.uid, cost);
          recordTokens({ uid: user!.uid, jobId: job.id, template: job.template, op: 'export', tokens: cost, hq: hq || undefined });
        } catch (e) {
          if (e instanceof NotEnoughTokens) return json(res, 402, { error: e.message, code: 'tokens' });
          throw e;
        }
        startRender(job, cost, { hq, premium });
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
    // Light copies the app's previews ask for, cut from a job video on first request (see derived()).
    // <name>.t<deciseconds>[s].jpg is a still from that moment (the pick screen's scene thumbnails; s = small).
    // matte.preview.webm is the person matte at preview size.
    const dm = p.match(/^\/jobs\/[\w-]+\/[\w-]+\.(preview\.mp4|preview\.webm|poster\.jpg|t(\d{1,5})(s?)\.jpg)$/);
    if (dm && !(await stat(file).catch(() => null))) {
      const preview = dm[1].startsWith('preview.');
      const src = dm[1] === 'preview.webm' ? file.replace(/\.preview\.webm$/, '.webm') : file.replace(/\.(preview\.mp4|poster\.jpg|t\d{1,5}s?\.jpg)$/, '.mp4');
      if (!(await stat(src).catch(() => null))) return res.writeHead(404).end('not found');
      const made = derived(src, preview ? 'preview' : 'poster', dm[2] ? Number(dm[2]) / 10 : undefined, dm[3] === 's');
      if (preview) {
        // Not ready yet: play the full file this time (a redirect, so range requests stay on one file).
        made.catch(() => null);
        res.writeHead(302, { Location: `${p.replace(/\.preview\.(mp4|webm)$/, '.$1')}${url.search}`, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }
      try {
        await made;
      } catch (e) {
        console.error('poster', e);
        return res.writeHead(404).end('not found');
      }
    }
    return sendFile(req, res, file);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

/** Still frame for the app's lists: cut from the exported reel, else from the talking video (derived()). */
const posterOfJob = (video?: string, props?: Record<string, any>) => {
  const v = video ?? (typeof props?.video === 'string' ? props.video : undefined);
  return v && /^jobs\/[\w-]+\/[\w-]+\.mp4$/.test(v) ? v.replace(/\.mp4$/, '.poster.jpg') : undefined;
};

const thumbOf = (t: Template, props?: Record<string, any>) =>
  !props ? undefined : t === 'ExperienceFilm' || t === 'PhotoAdFilm' ? posterOfJob(undefined, { video: props.shots?.find((s: { src: string }) => /\.mp4$/.test(s.src))?.src }) : t === 'ProductShine' ? props.photo : t === 'SaaSPromo' ? props.desktop : t === 'ServiceReel' ? (props.desktop ?? props.phone ?? props.photos?.[0]) : t === 'PhotoReel' ? props.photos?.[0]?.src : undefined;

await loadJobs();
server.listen(PORT, () => console.log(`Editless on ${ORIGIN} (login ${authEnabled ? 'on' : 'off'}, billing ${billingEnabled ? 'on' : 'off'})`));
