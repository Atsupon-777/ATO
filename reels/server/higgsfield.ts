// Image-to-video through the Higgsfield API (https://docs.higgsfield.ai): Kling 3.0 and Seedance 2.5.
// Flow: upload the still to a presigned URL, submit the model request, poll its status_url, download video.url.
//
// Auth is `Authorization: Key <id>:<secret>`. On Cloud Run set HIGGSFIELD_API_KEY ("id:secret", or the one
// string the console shows) from Secret Manager. In the cloud dev environment the egress proxy injects the
// header for api.higgsfield.ai, so the placeholder below is replaced there and the key never touches the code.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prices } from './config.ts';
import type { Usage } from './usage.ts';

const BASE = process.env.HIGGSFIELD_BASE_URL || 'https://api.higgsfield.ai';

/** The Higgsfield models Editless can use for image-to-video, with their endpoint ids. */
export const HF_MODELS = {
  kling: 'kling-video/v3.0/std/image-to-video',
  'kling-pro': 'kling-video/v3.0/pro/image-to-video',
  seedance: 'bytedance/seedance-2.5/image-to-video',
} as const;
export type HfModel = keyof typeof HF_MODELS;

const auth = () => {
  const key = (process.env.HIGGSFIELD_API_KEY || 'x:y').trim();
  return { Authorization: key.startsWith('Key ') ? key : `Key ${key}` };
};

const mimeOf = (file: string) => {
  const ext = path.extname(file).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
};

async function api(pathname: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const r = await fetch(pathname.startsWith('http') ? pathname : BASE + pathname, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { ...auth(), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Higgsfield ${r.status} on ${pathname.replace(BASE, '')}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Uploads a local file and returns the public URL Higgsfield models accept as image_url. */
export async function uploadFile(file: string): Promise<string> {
  const contentType = mimeOf(file);
  const up = await api('/files/generate-upload-url', { body: { content_type: contentType } });
  // the presigned storage URL gets only the headers it was signed with, never the API credentials
  const put = await fetch(up.upload_url, { method: 'PUT', headers: up.upload_headers ?? { 'Content-Type': contentType }, body: await readFile(file) });
  if (!put.ok) throw new Error(`Higgsfield upload failed (${put.status})`);
  return up.public_url as string;
}

/** The request body for one image-to-video clip on the given model. */
function inputFor(model: HfModel, imageUrl: string, prompt: string, seconds: number, resolution: '720p' | '1080p') {
  if (model === 'seedance')
    // Seedance takes 4–30 s; audio off because the films play clips muted under their own music
    return { image_url: imageUrl, prompt, duration: Math.max(4, seconds), resolution, generate_audio: false };
  // Kling 3.0 takes 3–15 s and has no negative prompt or aspect field: framing follows the 9:16 still
  return { image_url: imageUrl, prompt: prompt.slice(0, 2500), duration: Math.min(15, Math.max(3, seconds)), sound: 'off' };
}

/** List price for the ledger when the estimate endpoint gives no number (USD). */
const listPrice = (model: HfModel, seconds: number, resolution: string) =>
  seconds * (model === 'seedance' ? (prices.higgsfield.seedance[resolution] ?? prices.higgsfield.seedance['720p']!) : prices.higgsfield[model]);

/** Asks Higgsfield what a request will cost (free call). Undefined when the model only returns a description. */
export async function estimateUsd(model: HfModel, input: Record<string, unknown>): Promise<number | undefined> {
  const e = await api(`/estimate/${HF_MODELS[model]}`, { body: input }).catch(() => undefined);
  const usd = Number(e?.usd);
  return Number.isFinite(usd) && usd > 0 ? usd : undefined;
}

const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);

/** Image-to-video on Higgsfield. Polls until done and downloads the MP4 to `out`. */
export async function higgsfieldImageToVideo(opts: {
  model: HfModel;
  image: string;
  prompt: string;
  out: string;
  seconds: number;
  negativePrompt?: string;
  usage: Usage;
  step: string;
  pollMs?: number;
}): Promise<string> {
  const resolution = process.env.REELS_VIDEO_RES === '1080p' ? '1080p' : '720p';
  const avoid = opts.negativePrompt ?? 'warped logo, changing text, deformed product, extra parts, morphing, flicker';
  const prompt = `${opts.prompt}\nThe video starts exactly on this image. Avoid: ${avoid}. No speech, no music, no added text.`;
  const imageUrl = await uploadFile(opts.image);
  const input = inputFor(opts.model, imageUrl, prompt, opts.seconds, resolution);
  const quoted = await estimateUsd(opts.model, input);
  // one key per clip, so a timed-out submission can be retried without paying twice
  const key = randomUUID();
  const submit = () => api(`/${HF_MODELS[opts.model]}`, { body: input, headers: { 'Idempotency-Key': key, 'Hf-Expires-After': '86400' } });
  let req = await submit().catch((e) => (/fetch failed|ECONNRESET|ETIMEDOUT|5\d\d/.test(String(e)) ? submit() : Promise.reject(e)));
  const statusUrl: string = req.status_url ?? `/requests/${req.request_id}/status`;
  const started = Date.now();
  let wait = 2000;
  while (!TERMINAL.has(req.status)) {
    if (Date.now() - started > 15 * 60_000) throw new Error(`${opts.step}: ${opts.model} did not finish within 15 minutes (${req.request_id})`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? wait + Math.random() * 500));
    wait = Math.min(10_000, wait * 1.5);
    req = await api(statusUrl).catch((e) => (/fetch failed|ECONNRESET|5\d\d/.test(String(e)) ? req : Promise.reject(e)));
  }
  if (req.status === 'nsfw') throw new Error(`${opts.step}: ${opts.model} rejected the shot (content moderation)`);
  if (req.status !== 'completed') throw new Error(`${opts.step}: ${opts.model} ${req.status}: ${JSON.stringify(req.error ?? '').slice(0, 300)}`);
  const url = req.video?.url ?? req.videos?.[0]?.url;
  if (!url) throw new Error(`${opts.step}: ${opts.model} returned no video`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${opts.step}: video download failed (${r.status})`);
  await writeFile(opts.out, Buffer.from(await r.arrayBuffer()));
  const seconds = Number(input.duration);
  opts.usage.add({
    step: opts.step,
    model: `higgsfield/${HF_MODELS[opts.model]}`,
    units: `${seconds}s${opts.model === 'seedance' ? ` ${resolution}` : ''}, no audio`,
    usd: quoted ?? listPrice(opts.model, seconds, resolution),
  });
  return opts.out;
}
